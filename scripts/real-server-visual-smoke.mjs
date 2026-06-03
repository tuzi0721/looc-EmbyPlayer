import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "undici";

const devServerUrl = process.env.HILLS_SMOKE_DEV_SERVER_URL ?? "http://127.0.0.1:1420";
const forceNativeMpv = process.env.HILLS_REAL_NATIVE_MPV === "1";
const remotePort = process.env.HILLS_SMOKE_CDP_PORT
  ? Number(process.env.HILLS_SMOKE_CDP_PORT)
  : 9400 + Math.floor(Math.random() * 500);
const appMode = process.env.HILLS_REAL_APP_MODE ?? "electron";
const commandOnly = process.env.HILLS_REAL_COMMAND_ONLY === "1";
const layoutMetricsOnly = process.env.HILLS_REAL_LAYOUT_METRICS === "1";
const isTauriMode = appMode.startsWith("tauri");
const appExe = process.env.HILLS_REAL_APP_EXE ? path.resolve(process.env.HILLS_REAL_APP_EXE) : null;
const tmpDir = path.join(os.tmpdir(), `hills-lite-real-visual-${Date.now()}`);
const userDataDir = path.join(tmpDir, "user-data");
const appDataDir = path.join(tmpDir, "app-data");
const localAppDataDir = path.join(tmpDir, "local-app-data");
const webviewDataDir = path.join(tmpDir, "webview2-data");
const screenshotsDir = path.join(tmpDir, "screenshots");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sensitiveValues = new Set();

function registerSensitiveValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return;
  sensitiveValues.add(text);
  sensitiveValues.add(text.replace(/\/+$/, ""));
  try {
    const url = new URL(text);
    sensitiveValues.add(url.origin);
    sensitiveValues.add(url.host);
  } catch {
    // Non-URL secrets are still covered by their raw value.
  }
}

function redactSensitiveText(value) {
  let text = String(value ?? "");
  const ordered = Array.from(sensitiveValues).filter(Boolean).sort((a, b) => b.length - a.length);
  for (const secret of ordered) {
    text = text.split(secret).join("[redacted]");
  }
  return text;
}

function stage(name, details = {}) {
  console.error(redactSensitiveText(JSON.stringify({ stage: name, ...details })));
}

function readInput() {
  const envValues = [
    process.env.HILLS_REAL_LINE1,
    process.env.HILLS_REAL_LINE2,
    process.env.HILLS_REAL_USERNAME,
    process.env.HILLS_REAL_PASSWORD,
  ];
  if (envValues.every((value) => typeof value === "string" && value.length > 0)) {
    return envValues;
  }
  const inputFile = process.env.HILLS_REAL_INPUT_FILE;
  if (inputFile) {
    try {
      const values = fs.readFileSync(inputFile, "utf8").split(/\r?\n/).map((line) => line.trim());
      return [values[0], values[1], values[2], values[3]];
    } finally {
      if (process.env.HILLS_REAL_INPUT_FILE_KEEP !== "1") {
        try {
          fs.rmSync(inputFile, { force: true });
        } catch {
          // Best-effort cleanup; the script must still report the real failure.
        }
      }
    }
  }
  const values = fs.readFileSync(0, "utf8").split(/\r?\n/).map((line) => line.trim());
  return [values[0], values[1], values[2], values[3]];
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout || result.status}`);
  }
  return result;
}

function tailTextFile(filePath, maxChars = 4000) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    return text.slice(Math.max(0, text.length - maxChars));
  } catch {
    return null;
  }
}

function netstatLinesForPort(port) {
  const result = spawnSync("netstat", ["-ano"], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return text.split(/\r?\n/).filter((line) => line.includes(`:${port}`)).slice(0, 12);
}

function tasklistImageCount(imageName) {
  if (process.platform !== "win32") return null;
  const result = spawnSync("tasklist", ["/FI", `IMAGENAME eq ${imageName}`, "/FO", "CSV"], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return (text.match(new RegExp(`(^|\\n)"?${imageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi")) ?? []).length;
}

function earlyCdpDiagnostics(child, childError, stdout, stderr) {
  const crashLog = path.join(localAppDataDir, "EmbyPlayer", "crash.log");
  const visualSmokeLog = path.join(localAppDataDir, "EmbyPlayer", "visual-smoke.log");
  return {
    tmpDir,
    remotePort,
    webviewDataDir,
    child: {
      pid: child?.pid ?? null,
      exitCode: child?.exitCode ?? null,
      signalCode: child?.signalCode ?? null,
      killed: child?.killed ?? null,
      error: childError,
    },
    portLines: netstatLinesForPort(remotePort),
    stdout,
    stderr,
    visualSmokeLog: tailTextFile(visualSmokeLog),
    crashLog: tailTextFile(crashLog),
  };
}

async function ensureDevServer() {
  try {
    const response = await fetch(devServerUrl);
    if (response.ok) return;
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`Vite dev server is not reachable at ${devServerUrl}: ${error.message}`);
  }
}

async function getTargets() {
  for (let index = 0; index < 240; index += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${remotePort}/json`);
      if (response.ok) return response.json();
    } catch {
      // Electron is still starting.
    }
    await wait(250);
  }
  throw new Error("CDP target timeout");
}

function summarizePageTargets(targets) {
  return targets.filter((item) => item.type === "page").map((item) => ({
    id: item.id ?? null,
    title: item.title ?? null,
    url: item.url ?? null,
    hasWebSocket: Boolean(item.webSocketDebuggerUrl),
  }));
}

function selectPageTarget(targets) {
  const devServerAlternates = [
    devServerUrl,
    devServerUrl.replace("127.0.0.1", "localhost"),
    devServerUrl.replace("localhost", "127.0.0.1"),
  ];
  const pages = targets.filter((item) => item.type === "page");
  const devTarget = pages.find((item) => devServerAlternates.some((prefix) => item.url?.startsWith(prefix)));
  const releaseTarget = pages.find((item) => {
    const url = item.url ?? "";
    return item.webSocketDebuggerUrl && url && url !== "about:blank" && !url.startsWith("devtools://");
  });
  return devTarget ?? releaseTarget ?? pages.find((item) => item.webSocketDebuggerUrl) ?? null;
}

async function getPageTarget(initialTargets = []) {
  let lastPages = summarizePageTargets(initialTargets);
  let target = selectPageTarget(initialTargets);
  if (isTauriMode && target?.webSocketDebuggerUrl) {
    return { target, pages: lastPages };
  }
  if (target?.webSocketDebuggerUrl && target.url !== "about:blank") {
    return { target, pages: lastPages };
  }
  for (let index = 0; index < 80; index += 1) {
    let targets;
    try {
      targets = await getTargets();
    } catch (error) {
      if (target?.webSocketDebuggerUrl) return { target, pages: lastPages, requeryError: error.message };
      throw error;
    }
    lastPages = summarizePageTargets(targets);
    target = selectPageTarget(targets) ?? target;
    if (target?.webSocketDebuggerUrl && target.url !== "about:blank") return { target, pages: lastPages };
    await wait(250);
  }
  return {
    target,
    pages: lastPages,
  };
}

async function cdpMessageText(event) {
  const data = event.data;
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  if (data && typeof data.text === "function") return data.text();
  return String(data);
}

function ensureCdpDispatch(ws) {
  if (ws.__hillsCdpDispatchReady) return;
  ws.__hillsCdpDispatchReady = true;
  ws.__hillsCdpPending = new Map();
  ws.__hillsCdpHandlers = [];
  ws.addEventListener("message", async (event) => {
    let message;
    try {
      message = JSON.parse(await cdpMessageText(event));
    } catch {
      ws.__hillsCdpLastParseError = Object.prototype.toString.call(event.data);
      return;
    }
    if (message.id != null && ws.__hillsCdpPending.has(message.id)) {
      const pending = ws.__hillsCdpPending.get(message.id);
      ws.__hillsCdpPending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(redactSensitiveText(`${pending.method}: ${JSON.stringify(message.error)}`)));
      else pending.resolve(message.result);
      return;
    }
    for (const handler of ws.__hillsCdpHandlers) handler(message);
  });
}

function addCdpEventHandler(ws, handler) {
  ensureCdpDispatch(ws);
  ws.__hillsCdpHandlers.push(handler);
}

async function cdpCall(ws, method, params = {}) {
  ensureCdpDispatch(ws);
  const id = cdpCall.nextId;
  cdpCall.nextId += 1;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.__hillsCdpPending.delete(id);
      const parseNote = ws.__hillsCdpLastParseError ? `; last parse data ${ws.__hillsCdpLastParseError}` : "";
      reject(new Error(`${method} timeout${parseNote}`));
    }, 60_000);
    ws.__hillsCdpPending.set(id, { method, resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
cdpCall.nextId = 1;

async function cdpEval(ws, expression) {
  const result = await cdpCall(ws, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(redactSensitiveText(JSON.stringify(result.exceptionDetails)));
  return result.result?.value ?? null;
}

function isExecutionContextReset(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /Execution context was destroyed|Cannot find context|Inspected target navigated|Cannot find default execution context/i.test(message);
}

async function cdpEvalAfterContextReset(ws, expression, attempts = 5) {
  let lastError = null;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await cdpEval(ws, expression);
    } catch (error) {
      lastError = error;
      if (!isExecutionContextReset(error)) throw error;
      await wait(350);
    }
  }
  throw lastError ?? new Error("Runtime.evaluate failed after context reset");
}

async function cdpClick(ws, point) {
  await cdpCall(ws, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y,
    button: "none",
  });
  await cdpCall(ws, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
  await cdpCall(ws, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
}

async function capture(ws, name) {
  const result = await cdpCall(ws, "Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const filePath = path.join(screenshotsDir, `${name}.png`);
  await fsp.writeFile(filePath, Buffer.from(result.data, "base64"));
  return filePath;
}

function analyzePng(imagePath) {
  const script = `
    Add-Type -AssemblyName System.Drawing
    $bmp = New-Object System.Drawing.Bitmap(${JSON.stringify(imagePath)})
    $total = 0
    $bright = 0
    $colorful = 0
    $meaningful = 0
    $left = $bmp.Width
    $top = $bmp.Height
    $right = -1
    $bottom = -1
    $x0 = [Math]::Floor($bmp.Width * 0.18)
    $x1 = [Math]::Floor($bmp.Width * 0.82)
    $y0 = [Math]::Floor($bmp.Height * 0.16)
    $y1 = [Math]::Floor($bmp.Height * 0.74)
    for ($y = 0; $y -lt $bmp.Height; $y += 6) {
      for ($x = 0; $x -lt $bmp.Width; $x += 6) {
        $p = $bmp.GetPixel($x, $y)
        $max = [Math]::Max($p.R, [Math]::Max($p.G, $p.B))
        $min = [Math]::Min($p.R, [Math]::Min($p.G, $p.B))
        if ($x -ge $x0 -and $x -lt $x1 -and $y -ge $y0 -and $y -lt $y1) {
          $total += 1
          if ($max -gt 48) { $bright += 1 }
          if (($max - $min) -gt 36) { $colorful += 1 }
        }
        if ($max -gt 42 -or ($max - $min) -gt 30) {
          $meaningful += 1
          if ($x -lt $left) { $left = $x }
          if ($x -gt $right) { $right = $x }
          if ($y -lt $top) { $top = $y }
          if ($y -gt $bottom) { $bottom = $y }
        }
      }
    }
    $contentWidth = if ($right -ge $left) { $right - $left + 1 } else { 0 }
    $contentHeight = if ($bottom -ge $top) { $bottom - $top + 1 } else { 0 }
    $contentBox = $null
    if ($contentWidth -gt 0 -and $contentHeight -gt 0) {
      $contentBox = [PSCustomObject]@{
        x = $left
        y = $top
        width = $contentWidth
        height = $contentHeight
        aspect = $contentWidth / $contentHeight
      }
    }
    [PSCustomObject]@{
      screenshotPath = ${JSON.stringify(imagePath)}
      width = $bmp.Width
      height = $bmp.Height
      total = $total
      bright = $bright
      colorful = $colorful
      meaningful = $meaningful
      brightRatio = if ($total -gt 0) { $bright / $total } else { 0 }
      colorfulRatio = if ($total -gt 0) { $colorful / $total } else { 0 }
      meaningfulRatio = if ($bmp.Width * $bmp.Height -gt 0) { ($meaningful * 36) / ($bmp.Width * $bmp.Height) } else { 0 }
      contentBox = $contentBox
    } | ConvertTo-Json -Compress
    $bmp.Dispose()
  `;
  const result = run("powershell", ["-NoProfile", "-Command", script]);
  return JSON.parse(result.stdout);
}

function pixelSampleOk(pixels) {
  return pixels && (pixels.brightRatio >= 0.18 || pixels.colorfulRatio >= 0.04);
}

function validAspect(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0.1 && number < 10 ? number : null;
}

function aspectFromSize(width, height) {
  const w = Number(width);
  const h = Number(height);
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? w / h : null;
}

function aspectFromParams(params) {
  if (!params || typeof params !== "object") return null;
  return (
    validAspect(params.aspect) ??
    aspectFromSize(params.dw, params.dh) ??
    aspectFromSize(params.w, params.h) ??
    aspectFromSize(params.width, params.height)
  );
}

function osdContentAspect(dimensions) {
  if (!dimensions || typeof dimensions !== "object") return null;
  const width = Number(dimensions.w ?? dimensions.width ?? 0);
  const height = Number(dimensions.h ?? dimensions.height ?? 0);
  const left = Number(dimensions.ml ?? dimensions.left ?? 0);
  const right = Number(dimensions.mr ?? dimensions.right ?? 0);
  const top = Number(dimensions.mt ?? dimensions.top ?? 0);
  const bottom = Number(dimensions.mb ?? dimensions.bottom ?? 0);
  return aspectFromSize(width - left - right, height - top - bottom);
}

function aspectClose(actual, expected, tolerance) {
  if (!actual || !expected) return false;
  return Math.abs(actual - expected) <= tolerance;
}

function playbackAspectEvidence(metrics) {
  const html = metrics?.htmlVideo;
  if (html) {
    const expectedAspect = aspectFromSize(html.videoWidth, html.videoHeight);
    return {
      mode: "htmlVideo",
      expectedAspect,
      outputAspect: expectedAspect,
      outputSource: "htmlVideo.videoWidth/videoHeight",
      ok: Boolean(expectedAspect),
    };
  }

  const mpv = metrics?.mpvState;
  if (!mpv) {
    return { mode: "none", expectedAspect: null, outputAspect: null, outputSource: null, ok: false };
  }

  const expectedAspect = aspectFromParams(mpv.videoParams);
  const outputAspect = aspectFromParams(mpv.videoOutParams);
  const osdAspect = osdContentAspect(mpv.osdDimensions);
  const candidates = [
    { source: "video-out-params", aspect: outputAspect, tolerance: 0.04 },
    { source: "osd-dimensions-content", aspect: osdAspect, tolerance: 0.08 },
  ].filter((candidate) => candidate.aspect);
  const passing = candidates.find((candidate) =>
    aspectClose(candidate.aspect, expectedAspect, candidate.tolerance),
  );
  const fallbackOk = candidates.length === 0 && Boolean(expectedAspect) && mpv.keepaspect !== false;

  return {
    mode: "mpv",
    expectedAspect,
    outputAspect,
    osdContentAspect: osdAspect,
    outputSource: passing?.source ?? (fallbackOk ? "video-params-with-keepaspect" : candidates[0]?.source ?? null),
    ok: Boolean(passing) || fallbackOk,
    keepaspect: mpv.keepaspect ?? null,
    panscan: mpv.panscan ?? null,
    videoZoom: mpv.videoZoom ?? null,
    videoScaleX: mpv.videoScaleX ?? null,
    videoScaleY: mpv.videoScaleY ?? null,
    pixelContentAspect: metrics?.visiblePixels?.contentBox?.aspect ?? null,
  };
}

async function bridgeInvoke(ws, command, args = {}, timeoutMs = 30000) {
  const result = await cdpEvalAfterContextReset(ws, `
    (async () => {
      const invoke = window.hillsLite?.invoke?.bind(window.hillsLite);
      if (!invoke) return { ok: false, error: "window.hillsLite.invoke missing" };
      const timeout = new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), ${Number(timeoutMs)}));
      return Promise.race([
        invoke(${JSON.stringify(command)}, ${JSON.stringify(args)})
          .then((value) => ({ ok: true, value }))
          .catch((error) => ({ ok: false, error: error?.message ?? String(error) })),
        timeout,
      ]);
    })()
  `);
  if (result?.__timeout) throw new Error(`${command} timed out in page bridge`);
  if (!result?.ok) throw new Error(`${command} failed: ${result?.error ?? "unknown error"}`);
  return result.value;
}

async function pushRoute(ws, route, timeoutMs = 10000) {
  const result = await cdpEvalAfterContextReset(ws, `
    (async () => {
      const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      if (!appRouter) return { ok: false, error: "mounted Vue router not found" };
      const timeout = new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), ${Number(timeoutMs)}));
      return Promise.race([
        appRouter.push(${JSON.stringify(route)})
          .then(() => ({ ok: true, route: location.hash || location.pathname }))
          .catch((error) => ({ ok: false, error: error?.message ?? String(error) })),
        timeout,
      ]);
    })()
  `);
  if (result?.__timeout) throw new Error(`router push timed out: ${route}`);
  if (!result?.ok) throw new Error(`router push failed: ${result?.error ?? "unknown error"}`);
  return result;
}

async function setupRealAccountCommandOnly(ws) {
  stage("setup-bridge-ready-start");
  const ready = await cdpEvalAfterContextReset(ws, `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      let last = null;
      for (let index = 0; index < 80; index += 1) {
        last = {
          hasBridge: Boolean(window.hillsLite?.invoke),
          hasRouter: Boolean(document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router),
          readyState: document.readyState,
          route: location.hash || location.pathname,
          href: location.href,
          appHtmlLength: document.querySelector("#app")?.innerHTML?.length ?? null,
          title: document.title,
        };
        if (last.hasBridge && last.hasRouter) return last;
        await wait(250);
      }
      return last;
    })()
  `);
  stage("setup-bridge-ready-complete", ready);
  if (!ready?.hasBridge) throw new Error("window.hillsLite.invoke missing");
  if (!ready?.hasRouter) throw new Error("mounted Vue router not found");

  stage("setup-settings-start");
  await bridgeInvoke(ws, "update_settings", { patch: { theme: "light", mpvBackend: "embedded" } });
  const currentSettings = await bridgeInvoke(ws, "get_settings");
  if (isTauriMode && currentSettings.mpvBackend !== "embedded") {
    throw new Error("Tauri real smoke requires embedded mpv backend");
  }
  stage("setup-settings-complete", { mpvBackend: currentSettings.mpvBackend });

  const lines = [
    { id: "real-line-1", name: "Line 1", baseUrl: line1, userAgent: null, headers: [], priority: 0, enabled: true },
    { id: "real-line-2", name: "Line 2", baseUrl: line2, userAgent: null, headers: [], priority: 1, enabled: true },
  ];

  let detected = null;
  let detectError = null;
  stage("setup-detect-start");
  try {
    detected = await bridgeInvoke(ws, "detect_server", { payload: { defaultUserAgent: null, lines } }, 30000);
  } catch (error) {
    detectError = error instanceof Error ? error.message : String(error);
  }
  stage("setup-detect-complete", {
    detected: Boolean(detected),
    kind: detected?.kind ?? null,
    winningLineId: detected?.winningLineId ?? null,
    detectError: detectError ? redactSensitiveText(detectError) : null,
  });

  stage("setup-add-server-start");
  const server = await bridgeInvoke(ws, "add_server", {
    payload: {
      name: detected?.serverName || "Real Visual Smoke",
      kind: detected?.kind || "emby",
      activeLineId: detected?.winningLineId || "real-line-1",
      defaultUserAgent: null,
      lines,
    },
  });
  stage("setup-add-server-complete", { serverIdPresent: Boolean(server?.id) });

  stage("setup-login-start");
  const login = await bridgeInvoke(ws, "login", {
    payload: { serverId: server.id, username, password },
  }, 30000);
  const accounts = await bridgeInvoke(ws, "list_accounts");
  stage("setup-login-complete", {
    accountCount: Array.isArray(accounts) ? accounts.length : null,
    winningLineId: login?.winningLineId ?? null,
  });

  stage("setup-route-home-start");
  await pushRoute(ws, "/home");
  stage("setup-route-home-complete");

  const heroFields = "PrimaryImageAspectRatio,Overview,ProductionYear,UserData,SeriesInfo,RunTimeTicks,CommunityRating,OfficialRating,ParentBackdropItemId,ParentBackdropImageTags,ParentThumbItemId,ParentThumbImageTag,ParentPrimaryImageItemId,ParentPrimaryImageTag,ParentLogoItemId,ParentLogoImageTag,SeriesPrimaryImageTag,SeriesThumbImageTag";
  const imageParams = [
    ["EnableUserData", "true"],
    ["EnableImages", "true"],
    ["ImageTypeLimit", "4"],
    ["EnableImageTypes", "Primary,Backdrop,Thumb,Logo"],
  ];
  const preferVisualHeroItems = (items) => {
    const visual = items.filter((item) => item.BackdropImageTags?.length || item.ImageTags?.Primary || item.Overview?.trim());
    return visual.length > 0 ? visual : items;
  };
  const listItems = (params, timeoutMs = 30000) => bridgeInvoke(ws, "list_items", { payload: { params } }, timeoutMs);

  stage("setup-views-start");
  const viewsResp = await bridgeInvoke(ws, "list_views", {}, 30000);
  stage("setup-views-complete", { viewCount: viewsResp?.Items?.length ?? 0 });

  stage("setup-resume-start");
  const resumeResp = await bridgeInvoke(ws, "resume_items", {}, 30000);
  stage("setup-resume-complete", { resumeCount: resumeResp?.Items?.length ?? 0 });

  stage("setup-hero-start");
  const heroResp = await listItems([
    ["Recursive", "true"],
    ["IncludeItemTypes", "Movie,Series"],
    ["Fields", heroFields],
    ["SortBy", "DateCreated"],
    ["SortOrder", "Descending"],
    ["Limit", "36"],
    ...imageParams,
  ]);
  const heroFallbackResp = (heroResp.Items ?? []).length > 0
    ? heroResp
    : await listItems([
        ["Recursive", "true"],
        ["IncludeItemTypes", "Movie,Series,Episode"],
        ["Fields", heroFields],
        ["SortBy", "DateCreated"],
        ["SortOrder", "Descending"],
        ["Limit", "18"],
        ...imageParams,
      ]);
  const views = viewsResp.Items ?? [];
  const resume = resumeResp.Items ?? [];
  const heroItems = preferVisualHeroItems(heroFallbackResp.Items ?? []);
  stage("setup-hero-complete", { heroCount: heroItems.length });

  const mediaFields = "PrimaryImageAspectRatio,ProductionYear,Overview,UserData,SeriesInfo,RunTimeTicks,ParentBackdropItemId,ParentBackdropImageTags,ParentThumbItemId,ParentThumbImageTag,ParentPrimaryImageItemId,ParentPrimaryImageTag,ParentLogoItemId,ParentLogoImageTag,SeriesPrimaryImageTag,SeriesThumbImageTag";
  stage("setup-media-start");
  const mediaResp = await listItems([
    ["Recursive", "true"],
    ["IncludeItemTypes", "Movie,Episode"],
    ["Fields", mediaFields],
    ["SortBy", "DateCreated"],
    ["SortOrder", "Descending"],
    ["Limit", "24"],
    ["EnableUserData", "true"],
    ["EnableImages", "true"],
    ["ImageTypeLimit", "4"],
    ["EnableImageTypes", "Primary,Backdrop,Thumb,Logo"],
  ]);
  stage("setup-media-complete", { mediaCount: mediaResp?.Items?.length ?? 0 });

  stage("setup-series-start");
  const seriesResp = await listItems([
    ["Recursive", "true"],
    ["IncludeItemTypes", "Series"],
    ["Fields", mediaFields],
    ["SortBy", "DateCreated"],
    ["SortOrder", "Descending"],
    ["Limit", "24"],
    ["EnableUserData", "true"],
    ["EnableImages", "true"],
    ["ImageTypeLimit", "4"],
    ["EnableImageTypes", "Primary,Backdrop,Thumb,Logo"],
  ]);
  stage("setup-series-complete", { seriesCount: seriesResp?.Items?.length ?? 0 });

  const candidates = [
    ...resume,
    ...heroItems.filter((item) => item.Type === "Movie" || item.Type === "Episode"),
    ...(mediaResp.Items ?? []),
  ];
  const seriesCandidates = [
    ...heroItems.filter((item) => item.Type === "Series"),
    ...(seriesResp.Items ?? []),
  ];
  const selected = candidates.find((item) => item?.Id && (item.Type === "Movie" || item.Type === "Episode"));
  if (!selected) throw new Error("real server has no Movie/Episode candidate for playback smoke");
  const selectedSeries = seriesCandidates.find((item) => item?.Id && item.Type === "Series") ?? null;

  stage("setup-playback-source-start");
  const source = await bridgeInvoke(ws, "get_playback_source", {
    payload: { itemId: selected.Id, startMs: 0 },
  }, 30000);
  stage("setup-playback-source-complete", {
    mediaSourceCount: source.mediaSources?.length ?? 0,
    playMethod: source.playMethod ?? null,
  });

  await cdpEvalAfterContextReset(ws, `
    (() => {
      window.__hillsRealSmokeSelectedName = ${JSON.stringify(selected.Name ?? "")};
      window.__hillsRealSmokeSeriesName = ${JSON.stringify(selectedSeries?.Name ?? "")};
      return true;
    })()
  `);

  const selectedMediaSource = source.mediaSources?.find((item) => item.selected) ?? null;
  const playbackSummary = {
    playMethod: source.playMethod,
    mediaSourceCount: source.mediaSources?.length ?? 0,
    lineCount: source.lines?.length ?? 0,
    selectedMediaSource: selectedMediaSource ? {
      container: selectedMediaSource.container ?? null,
      protocol: selectedMediaSource.protocol ?? null,
      width: selectedMediaSource.width ?? null,
      height: selectedMediaSource.height ?? null,
      videoCodec: selectedMediaSource.videoCodec ?? null,
      audioCodec: selectedMediaSource.audioCodec ?? null,
      supportsDirectPlay: selectedMediaSource.supportsDirectPlay ?? null,
      supportsDirectStream: selectedMediaSource.supportsDirectStream ?? null,
      playMethod: selectedMediaSource.playMethod ?? null,
      supportsTranscoding: selectedMediaSource.supportsTranscoding ?? null,
      isRemote: selectedMediaSource.isRemote ?? null,
      selected: selectedMediaSource.selected === true,
    } : null,
    tracks: {
      video: (source.tracks ?? []).filter((track) => track.kind === "video").length,
      audio: (source.tracks ?? []).filter((track) => track.kind === "audio").length,
      subtitle: (source.tracks ?? []).filter((track) => track.kind === "subtitle").length,
    },
  };

  return {
    detected: detected ? {
      kind: detected.kind,
      winningLineId: detected.winningLineId,
      serverNamePresent: Boolean(detected.serverName),
      reportStatuses: (detected.reports ?? []).map((report) => ({
        lineId: report.lineId,
        status: report.status,
        kind: report.kind ?? null,
        latencyPresent: report.latencyMs != null,
        errorPresent: Boolean(report.error),
      })),
    } : null,
    detectError,
    accountCount: Array.isArray(accounts) ? accounts.length : 0,
    viewCount: views.length,
    resumeCount: resume.length,
    heroCount: heroItems.length,
    selected: {
      id: selected.Id,
      type: selected.Type,
      hasOverview: Boolean(selected.Overview),
      hasBackdrop: Boolean(selected.BackdropImageTags?.length),
      hasPrimary: Boolean(selected.ImageTags?.Primary),
      hasParentImage: Boolean(selected.ParentThumbItemId || selected.ParentBackdropItemId || selected.ParentPrimaryImageItemId),
      nameLength: String(selected.Name ?? "").length,
    },
    series: selectedSeries ? {
      id: selectedSeries.Id,
      type: selectedSeries.Type,
      hasOverview: Boolean(selectedSeries.Overview),
      hasBackdrop: Boolean(selectedSeries.BackdropImageTags?.length),
      hasPrimary: Boolean(selectedSeries.ImageTags?.Primary),
      nameLength: String(selectedSeries.Name ?? "").length,
    } : null,
    seriesCandidateCount: seriesCandidates.filter((item) => item?.Id && item.Type === "Series").length,
    playbackSummary,
    loginWinningLineId: login.winningLineId,
  };
}

async function readEmbedState(ws) {
  return cdpEval(ws, `
    (async () => {
      if (!window.hillsLite) return null;
      return window.hillsLite.invoke("get_embed_state");
    })()
  `);
}

async function capturePlaybackNativeLayer(ws, rootPid, name) {
  if (isTauriMode) {
    return {
      embedState: {
        mode: "embedded",
        hostKind: "native-child",
        runtime: appMode,
      },
      capture: captureNativeWindowAndAnalyze(rootPid, null, name),
      usedHandle: false,
    };
  }
  const embedState = await readEmbedState(ws).catch((error) => ({
    error: error instanceof Error ? error.message : String(error),
  }));
  if ((embedState?.mode !== "wid" && embedState?.mode !== "reparent") || embedState?.hostKind !== "native-child") {
    throw new Error(`mpv is not using the native child host: ${embedState?.mode ?? "unknown"}/${embedState?.hostKind ?? "unknown"}`);
  }
  const nativeWindowHandle = embedState?.attachedMpvWindowHandle ?? embedState?.hwnd ?? null;
  if (!nativeWindowHandle) {
    throw new Error("native child host did not expose a hwnd");
  }
  return {
    embedState,
    capture: captureNativeWindowAndAnalyze(rootPid, nativeWindowHandle, name, {
      ownerWindowHandle: embedState?.hostWindowHandle ?? null,
    }),
    usedHandle: true,
  };
}

function captureNativeWindowAndAnalyze(rootPid, windowHandle, name, options = {}) {
  const pid = Number(rootPid) || 0;
  if (!pid) throw new Error("missing Electron process id for native window capture");
  const hwndValue = windowHandle == null ? "0" : String(windowHandle).replace(/[^\d]/g, "");
  const ownerHwndValue =
    options.ownerWindowHandle == null ? "0" : String(options.ownerWindowHandle).replace(/[^\d]/g, "");
  const outputPath = path.join(screenshotsDir, `${name}.png`);
  const script = `
    Add-Type -AssemblyName System.Drawing
    Add-Type @"
      using System;
      using System.Text;
      using System.Runtime.InteropServices;
      public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
      }
      public struct POINT {
        public int X;
        public int Y;
      }
      public static class Win32 {
        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
        [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
        [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
        [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT point);
        [DllImport("user32.dll")] public static extern bool IsChild(IntPtr hWndParent, IntPtr hWnd);
      }
"@
    $root = ${pid}
    $all = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine
    $ids = New-Object 'System.Collections.Generic.HashSet[int]'
    [void]$ids.Add($root)
    $frontier = @($root)
    while ($frontier.Count -gt 0) {
      $next = @()
      foreach ($parent in $frontier) {
        foreach ($p in ($all | Where-Object { $_.ParentProcessId -eq $parent })) {
          if ($ids.Add([int]$p.ProcessId)) {
            $next += [int]$p.ProcessId
          }
        }
      }
      $frontier = $next
    }

    $procById = @{}
    foreach ($p in $all) {
      $procById[[int]$p.ProcessId] = $p
    }

    $target = $null
    $ownerRequestedHwnd = ${JSON.stringify(ownerHwndValue || "0")}
    $ownerHwnd = [IntPtr]::Zero
    if ($ownerRequestedHwnd -ne "0") {
      $ownerHwnd = [IntPtr]::new([int64]$ownerRequestedHwnd)
      $ownerPid = 0
      [Win32]::GetWindowThreadProcessId($ownerHwnd, [ref]$ownerPid) | Out-Null
      if (-not $ids.Contains([int]$ownerPid)) {
        throw "owner window handle $ownerRequestedHwnd belongs to process $ownerPid outside launched process tree $root"
      }
    }
    $requestedHwnd = ${JSON.stringify(hwndValue)}
    if ($requestedHwnd -ne "0") {
      $hWnd = [IntPtr]::new([int64]$requestedHwnd)
      $windowPid = 0
      [Win32]::GetWindowThreadProcessId($hWnd, [ref]$windowPid) | Out-Null
      if (-not $ids.Contains([int]$windowPid)) {
        throw "window handle belongs to process $windowPid outside launched process tree $root"
      }
      $rect = New-Object RECT
      if (-not [Win32]::GetWindowRect($hWnd, [ref]$rect)) {
        throw "failed to read native window rect"
      }
      $length = [Win32]::GetWindowTextLength($hWnd)
      $titleBuilder = New-Object System.Text.StringBuilder([Math]::Max(1, $length + 1))
      [Win32]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity) | Out-Null
      $proc = $procById[[int]$windowPid]
      $target = [PSCustomObject]@{
        hwnd = $hWnd.ToInt64()
        processId = [int]$windowPid
        processName = [string]$proc.Name
        commandLine = [string]$proc.CommandLine
        title = $titleBuilder.ToString()
        visible = [Win32]::IsWindowVisible($hWnd)
        x = $rect.Left
        y = $rect.Top
        width = $rect.Right - $rect.Left
        height = $rect.Bottom - $rect.Top
      }
    } else {
      $windows = New-Object System.Collections.Generic.List[object]
      $callback = [Win32+EnumWindowsProc]{
        param([IntPtr]$hWnd, [IntPtr]$lParam)
        $windowPid = 0
        [Win32]::GetWindowThreadProcessId($hWnd, [ref]$windowPid) | Out-Null
        if (-not $ids.Contains([int]$windowPid)) { return $true }
        if (-not [Win32]::IsWindowVisible($hWnd)) { return $true }
        $rect = New-Object RECT
        if (-not [Win32]::GetWindowRect($hWnd, [ref]$rect)) { return $true }
        $width = $rect.Right - $rect.Left
        $height = $rect.Bottom - $rect.Top
        if ($width -lt 16 -or $height -lt 16) { return $true }
        $length = [Win32]::GetWindowTextLength($hWnd)
        $titleBuilder = New-Object System.Text.StringBuilder([Math]::Max(1, $length + 1))
        [Win32]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity) | Out-Null
        $proc = $procById[[int]$windowPid]
        $windows.Add([PSCustomObject]@{
          hwnd = $hWnd.ToInt64()
          processId = [int]$windowPid
          processName = [string]$proc.Name
          commandLine = [string]$proc.CommandLine
          title = $titleBuilder.ToString()
          visible = $true
          x = $rect.Left
          y = $rect.Top
          width = $width
          height = $height
        })
        return $true
      }
      [Win32]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
      $target = $windows |
        Sort-Object @{ Expression = { if (($_.processName -match "mpv") -or ($_.commandLine -match "hills-lite-mpv")) { 0 } else { 1 } } }, @{ Expression = { -($_.width * $_.height) } } |
        Select-Object -First 1
      if (-not $target) {
        throw "no visible native playback window found in launched process tree $root"
      }
    }
    $hWnd = [IntPtr]::new([int64]$target.hwnd)
    if ($ownerHwnd -ne [IntPtr]::Zero) {
      [Win32]::ShowWindow($ownerHwnd, 9) | Out-Null
      [Win32]::SetWindowPos($ownerHwnd, [IntPtr](-1), 0, 0, 0, 0, 0x0043) | Out-Null
      [Win32]::SetForegroundWindow($ownerHwnd) | Out-Null
      Start-Sleep -Milliseconds 260
    }
    [Win32]::ShowWindow($hWnd, 5) | Out-Null
    [Win32]::SetWindowPos($hWnd, [IntPtr](0), 0, 0, 0, 0, 0x0043) | Out-Null
    Start-Sleep -Milliseconds 260
    $rect = New-Object RECT
    if (-not [Win32]::GetWindowRect($hWnd, [ref]$rect)) {
      throw "failed to read native window rect"
    }
    $width = [Math]::Max(1, $rect.Right - $rect.Left)
    $height = [Math]::Max(1, $rect.Bottom - $rect.Top)
    if ($width -lt 16 -or $height -lt 16) {
      throw "native window has invalid capture bounds $($width)x$($height)"
    }
    $point = New-Object POINT
    $point.X = [int]($rect.Left + [Math]::Floor($width / 2))
    $point.Y = [int]($rect.Top + [Math]::Floor($height / 2))
    $hit = [Win32]::WindowFromPoint($point)
    $hitPid = 0
    if ($hit -ne [IntPtr]::Zero) {
      [Win32]::GetWindowThreadProcessId($hit, [ref]$hitPid) | Out-Null
    }
    if (-not $ids.Contains([int]$hitPid)) {
      throw "native capture center is covered by process $hitPid outside launched process tree $root"
    }
    if ($ownerHwnd -ne [IntPtr]::Zero -and $hit -ne $ownerHwnd -and -not [Win32]::IsChild($ownerHwnd, $hit)) {
      throw "native capture center is not inside the Hills Lite owner window"
    }
    $bmp = New-Object System.Drawing.Bitmap($width, $height)
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bmp.Size)
    $bmp.Save(${JSON.stringify(outputPath)}, [System.Drawing.Imaging.ImageFormat]::Png)
    $gfx.Dispose()
    $bmp.Dispose()
    if ($ownerHwnd -ne [IntPtr]::Zero) {
      [Win32]::SetWindowPos($ownerHwnd, [IntPtr](-2), 0, 0, 0, 0, 0x0043) | Out-Null
    }
    $length = [Win32]::GetWindowTextLength($hWnd)
    $titleBuilder = New-Object System.Text.StringBuilder([Math]::Max(1, $length + 1))
    [Win32]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity) | Out-Null
    [PSCustomObject]@{
      hwnd = [int64]$target.hwnd
      processId = [int]$target.processId
      processName = [string]$target.processName
      title = $titleBuilder.ToString()
      visible = [Win32]::IsWindowVisible($hWnd)
      x = $rect.Left
      y = $rect.Top
      width = $width
      height = $height
      hitHwnd = $hit.ToInt64()
      hitProcessId = [int]$hitPid
      screenshotPath = ${JSON.stringify(outputPath)}
    } | ConvertTo-Json -Compress
  `;
  const result = run("powershell", ["-NoProfile", "-Command", script]);
  return { ...analyzePng(outputPath), windowInfo: JSON.parse(result.stdout.trim()) };
}

function resizeNativeRootWindow(rootPid, size) {
  const pid = Number(rootPid) || 0;
  const width = Math.max(320, Math.round(Number(size?.width) || 0));
  const height = Math.max(240, Math.round(Number(size?.height) || 0));
  if (!pid || process.platform !== "win32") return null;
  const script = `
    Add-Type @"
      using System;
      using System.Text;
      using System.Runtime.InteropServices;
      public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
      }
      public static class Win32 {
        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
        [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
        [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
      }
"@
    $root = ${pid}
    $targetWidth = ${width}
    $targetHeight = ${height}
    $all = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine
    $ids = New-Object 'System.Collections.Generic.HashSet[int]'
    [void]$ids.Add($root)
    $frontier = @($root)
    while ($frontier.Count -gt 0) {
      $next = @()
      foreach ($parent in $frontier) {
        foreach ($p in ($all | Where-Object { $_.ParentProcessId -eq $parent })) {
          if ($ids.Add([int]$p.ProcessId)) {
            $next += [int]$p.ProcessId
          }
        }
      }
      $frontier = $next
    }

    $procById = @{}
    foreach ($p in $all) {
      $procById[[int]$p.ProcessId] = $p
    }

    $windows = New-Object System.Collections.Generic.List[object]
    $callback = [Win32+EnumWindowsProc]{
      param([IntPtr]$hWnd, [IntPtr]$lParam)
      $windowPid = 0
      [Win32]::GetWindowThreadProcessId($hWnd, [ref]$windowPid) | Out-Null
      if (-not $ids.Contains([int]$windowPid)) { return $true }
      if (-not [Win32]::IsWindowVisible($hWnd)) { return $true }
      $rect = New-Object RECT
      if (-not [Win32]::GetWindowRect($hWnd, [ref]$rect)) { return $true }
      $w = $rect.Right - $rect.Left
      $h = $rect.Bottom - $rect.Top
      if ($w -lt 160 -or $h -lt 120) { return $true }
      $length = [Win32]::GetWindowTextLength($hWnd)
      $titleBuilder = New-Object System.Text.StringBuilder([Math]::Max(1, $length + 1))
      [Win32]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity) | Out-Null
      $proc = $procById[[int]$windowPid]
      $windows.Add([PSCustomObject]@{
        hwnd = $hWnd.ToInt64()
        processId = [int]$windowPid
        processName = [string]$proc.Name
        commandLine = [string]$proc.CommandLine
        title = $titleBuilder.ToString()
        x = $rect.Left
        y = $rect.Top
        width = $w
        height = $h
      })
      return $true
    }
    [Win32]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
    $target = $windows |
      Sort-Object @{ Expression = { if (($_.processName -match "mpv") -or ($_.commandLine -match "hills-lite-mpv")) { 1 } else { 0 } } }, @{ Expression = { -($_.width * $_.height) } } |
      Select-Object -First 1
    if (-not $target) {
      throw "no visible app window found in launched process tree $root"
    }
    $hWnd = [IntPtr]::new([int64]$target.hwnd)
    [Win32]::ShowWindow($hWnd, 9) | Out-Null
    [Win32]::SetWindowPos($hWnd, [IntPtr](0), 40, 40, $targetWidth, $targetHeight, 0x0040) | Out-Null
    [Win32]::SetForegroundWindow($hWnd) | Out-Null
    Start-Sleep -Milliseconds 350
    $rect = New-Object RECT
    if (-not [Win32]::GetWindowRect($hWnd, [ref]$rect)) {
      throw "failed to read resized app window rect"
    }
    [PSCustomObject]@{
      hwnd = [int64]$target.hwnd
      processId = [int]$target.processId
      processName = [string]$target.processName
      title = [string]$target.title
      x = $rect.Left
      y = $rect.Top
      width = $rect.Right - $rect.Left
      height = $rect.Bottom - $rect.Top
    } | ConvertTo-Json -Compress
  `;
  const result = run("powershell", ["-NoProfile", "-Command", script]);
  const stdout = result.stdout.trim();
  return stdout ? JSON.parse(stdout) : null;
}

function processTree(rootPid) {
  const pid = Number(rootPid) || 0;
  if (!pid) return [];
  const script = `
    $root = ${pid}
    $all = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine
    $seen = @{}
    $frontier = @($root)
    $result = @()
    while ($frontier.Count -gt 0) {
      $next = @()
      foreach ($parent in $frontier) {
        foreach ($p in ($all | Where-Object { $_.ParentProcessId -eq $parent })) {
          $key = [string]$p.ProcessId
          if (-not $seen.ContainsKey($key)) {
            $seen[$key] = $true
            $result += $p
            $next += $p.ProcessId
          }
        }
      }
      $frontier = $next
    }
    $result | ConvertTo-Json -Compress
  `;
  const result = run("powershell", ["-NoProfile", "-Command", script]);
  const stdout = result.stdout.trim();
  if (!stdout) return [];
  const parsed = JSON.parse(stdout);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function processesByPid(pids) {
  const ids = [...new Set(pids.map((pid) => Number(pid)).filter(Boolean))];
  if (ids.length === 0) return [];
  const script = `
    $ids = @(${ids.join(",")})
    Get-CimInstance Win32_Process |
      Where-Object { $ids -contains $_.ProcessId } |
      Select-Object ProcessId,ParentProcessId,Name,CommandLine |
      ConvertTo-Json -Compress
  `;
  const result = run("powershell", ["-NoProfile", "-Command", script]);
  const stdout = result.stdout.trim();
  if (!stdout) return [];
  const parsed = JSON.parse(stdout);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function waitForChildExit(childProcess, timeoutMs) {
  if (!childProcess || childProcess.exitCode != null || childProcess.signalCode != null) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      childProcess.off("exit", done);
      childProcess.off("error", done);
      resolve(true);
    };
    const timer = setTimeout(() => {
      childProcess.off("exit", done);
      childProcess.off("error", done);
      resolve(false);
    }, timeoutMs);
    childProcess.once("exit", done);
    childProcess.once("error", done);
  });
}

async function verifyRuntimeCleanup(childProcess, ws) {
  const before = processTree(childProcess.pid).filter((processInfo) => {
    const name = String(processInfo.Name ?? "").toLowerCase();
    const commandLine = String(processInfo.CommandLine ?? "").toLowerCase();
    return name.includes("mpv") || name.includes("electron_mpv_host") || commandLine.includes("hills-lite-mpv-");
  });
  await cdpEval(ws, `(() => { setTimeout(() => window.close(), 0); return true; })()`);
  const electronExited = await waitForChildExit(childProcess, 12_000);
  await wait(1200);
  const remaining = processesByPid(before.map((processInfo) => processInfo.ProcessId));
  return {
    beforeCount: before.length,
    electronExited,
    remainingCount: remaining.length,
    ok: electronExited && remaining.length === 0,
  };
}

function metricsExpression(options = {}) {
  const skipPlayerState = options.skipPlayerState === true;
  return `
    (async () => {
      const rect = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      };
      const rects = (selector) => Array.from(document.querySelectorAll(selector)).map((node) => {
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      });
      const visibleHeight = (r) => r ? Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0)) : 0;
      const sections = rects(".row-section");
      const hero = rect(".hero.hero--cinema");
      const detailHero = rect(".detail .hero");
      const detailTitle = rect(".detail .hero__title");
      const detailOverview = rect(".overview-block");
      const detailMediaInfo = rect(".media-info");
      const playerStage = rect(".player__stage");
      const playerBottom = rect(".player__bottom");
      const video = document.querySelector("video");
      let mpvState = null;
      let mpvStateTimedOut = false;
      const withTimeout = (promise, ms) => Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => resolve({ __hillsTimeout: true }), ms)),
      ]);
      if (!${JSON.stringify(skipPlayerState)} && !video && window.hillsLite) {
        const result = await withTimeout(window.hillsLite.invoke("get_state").catch(() => null), 2500);
        if (result?.__hillsTimeout) mpvStateTimedOut = true;
        else mpvState = result;
      } else if (!${JSON.stringify(skipPlayerState)} && !video) {
        try {
          const { api } = await import("/src/api/index.ts");
          const result = await withTimeout(api.getState(), 2500);
          if (result?.__hillsTimeout) mpvStateTimedOut = true;
          else mpvState = result;
        } catch {
          mpvState = null;
        }
      }
      const root = document.documentElement;
      const style = getComputedStyle(root);
      const colorAvg = (value) => {
        const match = String(value).match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
        if (!match) return null;
        return (Number(match[1]) + Number(match[2]) + Number(match[3])) / 3;
      };
      return {
        route: location.hash || location.pathname,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        outer: { x: window.screenX, y: window.screenY, width: window.outerWidth, height: window.outerHeight },
        hasHorizontalOverflow: root.scrollWidth > root.clientWidth + 1,
        theme: root.getAttribute("data-theme"),
        fgAvg: colorAvg(style.getPropertyValue("--fg-primary")),
        bgAvg: colorAvg(getComputedStyle(document.body).backgroundColor),
        hero,
        heroAspect: hero ? hero.width / hero.height : null,
        sections,
        firstSectionVisible: visibleHeight(sections[0]),
        secondSectionVisible: visibleHeight(sections[1]),
        detailHero,
        detailHeroAspect: detailHero ? detailHero.width / detailHero.height : null,
        detailTitle,
        detailTitleClipped: Boolean(detailTitle && (detailTitle.top < -1 || detailTitle.bottom > window.innerHeight + 1)),
        detailBelowVisible: visibleHeight(detailOverview) + visibleHeight(detailMediaInfo),
        detailPanel: rect(".hero__playback-panel"),
        appSidebarVisible: Boolean(document.querySelector(".app-sidebar")),
        topbarVisible: Boolean(document.querySelector(".topbar")),
        posterCount: document.querySelectorAll(".poster, .history-card").length,
        loadedImageCount: document.querySelectorAll(".poster__art img.loaded, .history-card img.loaded").length,
        playerStage,
        playerPosterCard: rect(".player__poster-card"),
        playerBottom,
        playerControls: {
          top: rect(".player__top"),
          bottom: playerBottom,
          progress: rect(".progress, .bar, .player__progress"),
          seekBack: rect('[data-control="seek-back"]'),
          fullscreen: rect('[data-control="fullscreen"]'),
        },
        mpvStateTimedOut,
        htmlVideo: video ? {
          readyState: video.readyState,
          paused: video.paused,
          durationMs: Number.isFinite(video.duration) ? Math.floor(video.duration * 1000) : 0,
          positionMs: Math.floor(video.currentTime * 1000),
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          error: video.error ? { code: video.error.code, message: video.error.message } : null,
        } : null,
        mpvState: mpvState ? {
          durationMs: mpvState.durationMs ?? 0,
          positionMs: mpvState.positionMs ?? 0,
          paused: mpvState.paused === true,
          speed: mpvState.speed ?? 1,
          trackCount: Array.isArray(mpvState.tracks) ? mpvState.tracks.length : 0,
          videoCodec: mpvState.videoCodec ?? null,
          audioCodec: mpvState.audioCodec ?? null,
          videoParams: mpvState.videoParams ?? null,
          videoOutParams: mpvState.videoOutParams ?? null,
          osdDimensions: mpvState.osdDimensions ?? null,
          keepaspect: mpvState.keepaspect ?? null,
          panscan: mpvState.panscan ?? null,
          videoZoom: mpvState.videoZoom ?? null,
          videoScaleX: mpvState.videoScaleX ?? null,
          videoScaleY: mpvState.videoScaleY ?? null,
          videoAspectOverride: mpvState.videoAspectOverride ?? null,
        } : null,
        bodyTextLength: document.body.innerText.length,
      };
    })()
  `;
}

async function resizeAndInspect(ws, rootPid, route, size, name) {
  await cdpEvalAfterContextReset(ws, `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      if (appRouter && ${JSON.stringify(route)}) await appRouter.push(${JSON.stringify(route)});
      window.moveTo(40, 40);
      window.resizeTo(${size.width}, ${size.height});
      await wait(1500);
      return true;
    })()
  `);
  const nativeWindow = resizeNativeRootWindow(rootPid, size);
  if (nativeWindow) await wait(700);
  const filePath = await capture(ws, name);
  const pixels = analyzePng(filePath);
  const metrics = await cdpEvalAfterContextReset(ws, metricsExpression());
  return { size, nativeWindow, screenshotPath: filePath, pixels, metrics };
}

async function resizeAndMeasure(ws, rootPid, route, size) {
  await cdpEvalAfterContextReset(ws, `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      if (appRouter && ${JSON.stringify(route)}) await appRouter.push(${JSON.stringify(route)});
      window.moveTo(40, 40);
      window.resizeTo(${size.width}, ${size.height});
      await wait(1500);
      return true;
    })()
  `);
  const nativeWindow = resizeNativeRootWindow(rootPid, size);
  if (nativeWindow) await wait(700);
  const metrics = await cdpEvalAfterContextReset(ws, metricsExpression({ skipPlayerState: true }));
  return { size, nativeWindow, metrics };
}

function summarizeLayoutEntry(entry) {
  const metrics = entry.metrics ?? {};
  return {
    size: entry.size,
    nativeWindow: entry.nativeWindow
      ? {
          width: entry.nativeWindow.width,
          height: entry.nativeWindow.height,
          processName: entry.nativeWindow.processName ?? null,
        }
      : null,
    viewport: metrics.viewport ?? null,
    route: metrics.route ?? null,
    hasHorizontalOverflow: metrics.hasHorizontalOverflow === true,
    hero: metrics.hero
      ? {
          width: Math.round(metrics.hero.width),
          height: Math.round(metrics.hero.height),
          aspect: Number(metrics.heroAspect?.toFixed?.(3) ?? metrics.heroAspect),
        }
      : null,
    firstSectionVisible: Math.round(metrics.firstSectionVisible ?? 0),
    secondSectionVisible: Math.round(metrics.secondSectionVisible ?? 0),
    detailHero: metrics.detailHero
      ? {
          width: Math.round(metrics.detailHero.width),
          height: Math.round(metrics.detailHero.height),
          aspect: Number(metrics.detailHeroAspect?.toFixed?.(3) ?? metrics.detailHeroAspect),
        }
      : null,
    detailTitleClipped: metrics.detailTitleClipped === true,
    detailBelowVisible: Math.round(metrics.detailBelowVisible ?? 0),
    appSidebarVisible: metrics.appSidebarVisible === true,
    topbarVisible: metrics.topbarVisible === true,
    posterCount: metrics.posterCount ?? 0,
    loadedImageCount: metrics.loadedImageCount ?? 0,
    bodyTextLength: metrics.bodyTextLength ?? 0,
  };
}

async function waitForPlaybackVisualReady(ws) {
  let previousPosition = null;
  let lastMetrics = null;
  const startedAt = Date.now();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await wait(250);
    lastMetrics = await cdpEvalAfterContextReset(ws, metricsExpression());
    const state = lastMetrics.htmlVideo ?? lastMetrics.mpvState;
    const position = state?.positionMs ?? 0;
    const advancing = previousPosition != null && position > previousPosition + 250;
    previousPosition = position;
    const htmlReady =
      lastMetrics.htmlVideo &&
      (lastMetrics.htmlVideo.readyState ?? 0) >= 2 &&
      (lastMetrics.htmlVideo.videoWidth ?? 0) > 0 &&
      (lastMetrics.htmlVideo.videoHeight ?? 0) > 0;
    const mpvReady =
      lastMetrics.mpvState &&
      (lastMetrics.mpvState.durationMs ?? 0) > 0 &&
      (lastMetrics.mpvState.trackCount ?? 0) > 0 &&
      (lastMetrics.mpvState.videoParams?.w || lastMetrics.mpvState.videoCodec);
    if (htmlReady || (mpvReady && (advancing || attempt >= 8))) {
      return {
        ready: true,
        waitedMs: Date.now() - startedAt,
        advancing,
        state: {
          durationMs: state?.durationMs ?? 0,
          positionMs: state?.positionMs ?? 0,
          trackCount: state?.trackCount ?? null,
          hasVideoParams: Boolean(lastMetrics.mpvState?.videoParams || lastMetrics.htmlVideo?.videoWidth),
          mpvStateTimedOut: lastMetrics.mpvStateTimedOut === true,
        },
      };
    }
  }
  const state = lastMetrics?.htmlVideo ?? lastMetrics?.mpvState;
  return {
    ready: false,
    waitedMs: Date.now() - startedAt,
    advancing: false,
    state: state
      ? {
          durationMs: state.durationMs ?? 0,
          positionMs: state.positionMs ?? 0,
          trackCount: state.trackCount ?? null,
          hasVideoParams: Boolean(lastMetrics?.mpvState?.videoParams || lastMetrics?.htmlVideo?.videoWidth),
          mpvStateTimedOut: lastMetrics?.mpvStateTimedOut === true,
        }
      : null,
  };
}

function centerOf(rect) {
  if (!rect) return null;
  return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
}

const [line1, line2, username, password] = readInput();
for (const value of [line1, line2, username, password]) registerSensitiveValue(value);
stage("input-read", {
  line1Present: Boolean(line1),
  line2Present: Boolean(line2),
  usernamePresent: Boolean(username),
  passwordPresent: Boolean(password),
});
if (!line1 || !line2 || !username || !password) {
  throw new Error("Provide line1, line2, username, password via stdin or HILLS_REAL_* env vars.");
}

await fsp.mkdir(screenshotsDir, { recursive: true });
await fsp.mkdir(appDataDir, { recursive: true });
await fsp.mkdir(localAppDataDir, { recursive: true });
await fsp.mkdir(webviewDataDir, { recursive: true });

if (appMode === "electron") {
  stage("dev-server-check", { devServerUrl, forceNativeMpv, appMode });
  await ensureDevServer();
  stage("dev-server-ready");
} else if (appMode === "tauri-release") {
  if (!appExe) throw new Error("HILLS_REAL_APP_EXE is required for tauri-release mode");
} else if (appMode !== "tauri-dev") {
  throw new Error(`Unsupported HILLS_REAL_APP_MODE: ${appMode}`);
}

let child;
if (appMode === "electron") {
  const electron = path.resolve("node_modules/electron/dist/electron.exe");
  stage("electron-launch", { remotePort });
  child = spawn(electron, [`--remote-debugging-port=${remotePort}`, "electron/main.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HILLS_ELECTRON_DEV_SERVER_URL: devServerUrl,
      HILLS_ELECTRON_DISABLE_GPU: process.env.HILLS_ELECTRON_DISABLE_GPU ?? "0",
      HILLS_ELECTRON_MPV_WID: "1",
      HILLS_ELECTRON_MPV_NATIVE_CHILD: "1",
      HILLS_ELECTRON_OPEN_DEVTOOLS: "0",
      HILLS_ELECTRON_USER_DATA_DIR: userDataDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
} else if (appMode === "tauri-dev") {
  stage("tauri-dev-launch", { remotePort });
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm.cmd run tauri -- dev --features mpv-embedded"]
    : ["run", "tauri", "--", "dev", "--features", "mpv-embedded"];
  child = spawn(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      APPDATA: appDataDir,
      LOCALAPPDATA: localAppDataDir,
      HILLS_TAURI_CDP_PORT: String(remotePort),
      HILLS_TAURI_WEBVIEW_DATA_DIR: webviewDataDir,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${remotePort}`,
      WEBVIEW2_USER_DATA_FOLDER: webviewDataDir,
      NO_COLOR: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
} else {
  stage("tauri-release-launch", { remotePort });
  child = spawn(appExe, [], {
    cwd: path.dirname(appExe),
    env: {
      ...process.env,
      APPDATA: appDataDir,
      LOCALAPPDATA: localAppDataDir,
      HILLS_TAURI_CDP_PORT: String(remotePort),
      HILLS_TAURI_WEBVIEW_DATA_DIR: webviewDataDir,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${remotePort}`,
      WEBVIEW2_USER_DATA_FOLDER: webviewDataDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}
const electronStdout = [];
const electronStderr = [];
let childError = null;
child.on("error", (error) => {
  childError = error?.message ?? String(error);
});
child.stdout?.on("data", (chunk) => {
  const text = String(chunk).trim();
  if (text) electronStdout.push(text.slice(0, 500));
});
child.stderr?.on("data", (chunk) => {
  const text = String(chunk).trim();
  if (text) electronStderr.push(text.slice(0, 500));
});

let ws;
try {
  stage("cdp-targets-wait");
  let targets;
  try {
    targets = await getTargets();
  } catch (error) {
    stage("cdp-targets-failed", earlyCdpDiagnostics(child, childError, electronStdout, electronStderr));
    throw error;
  }
  stage("cdp-targets-ready", { count: targets.length });
  const selected = await getPageTarget(targets);
  const target = selected.target;
  stage("cdp-page-target-selected", {
    selectedUrl: target?.url ?? null,
    selectedTitle: target?.title ?? null,
    requeryError: selected.requeryError ?? null,
    pages: selected.pages,
  });
  if (!target?.webSocketDebuggerUrl) throw new Error("page target not found");

  stage("cdp-connect");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("websocket error"));
  });
  await cdpCall(ws, "Runtime.enable");
  await cdpCall(ws, "Page.enable");
  const pageConsole = [];
  const pageExceptions = [];
  addCdpEventHandler(ws, (message) => {
    if (message.method === "Runtime.consoleAPICalled") {
      pageConsole.push({
        type: message.params?.type,
        args: (message.params?.args ?? []).map((arg) => arg.value ?? arg.description ?? arg.type).slice(0, 3),
      });
    } else if (message.method === "Runtime.exceptionThrown") {
      pageExceptions.push(message.params?.exceptionDetails?.text ?? "exception");
    }
  });

  stage("setup-start");
  let setup;
  if (commandOnly && isTauriMode) {
    setup = await setupRealAccountCommandOnly(ws);
  } else {
  setup = await cdpEvalAfterContextReset(ws, `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      await wait(1200);
      const runtimeInvoke = window.hillsLite?.invoke?.bind(window.hillsLite) ?? null;
      const api = runtimeInvoke
        ? {
            getSettings: () => runtimeInvoke("get_settings"),
            updateSettings: (patch) => runtimeInvoke("update_settings", { patch }),
            detectServer: (payload) => runtimeInvoke("detect_server", { payload }),
            addServer: (payload) => runtimeInvoke("add_server", { payload }),
            login: (payload) => runtimeInvoke("login", { payload }),
            listAccounts: () => runtimeInvoke("list_accounts"),
            listViews: () => runtimeInvoke("list_views"),
            resumeItems: () => runtimeInvoke("resume_items"),
            listItems: (payload) => runtimeInvoke("list_items", { payload }),
            getPlaybackSource: (payload) => runtimeInvoke("get_playback_source", { payload }),
          }
        : (await import("/src/api/index.ts")).api;
      const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      if (!appRouter) throw new Error("mounted Vue router not found");
      await api.updateSettings({ theme: "light", mpvBackend: "embedded" });
      const currentSettings = await api.getSettings();
      if (${JSON.stringify(appMode === "tauri-release" || appMode === "tauri-dev")} && currentSettings.mpvBackend !== "embedded") {
        throw new Error("Tauri real smoke requires embedded mpv backend");
      }
      const lines = [
        { id: "real-line-1", name: "Line 1", baseUrl: ${JSON.stringify(line1)}, userAgent: null, headers: [], priority: 0, enabled: true },
        { id: "real-line-2", name: "Line 2", baseUrl: ${JSON.stringify(line2)}, userAgent: null, headers: [], priority: 1, enabled: true },
      ];
      let detected = null;
      let detectError = null;
      try {
        detected = await api.detectServer({ defaultUserAgent: null, lines });
      } catch (error) {
        detectError = error?.message ?? String(error);
      }
      const server = await api.addServer({
        name: detected?.serverName || "Real Visual Smoke",
        kind: detected?.kind || "emby",
        activeLineId: detected?.winningLineId || "real-line-1",
        defaultUserAgent: null,
        lines,
      });
      const login = await api.login({ serverId: server.id, username: ${JSON.stringify(username)}, password: ${JSON.stringify(password)} });
      const accounts = await api.listAccounts();
      await appRouter.push("/home");
      const heroFields = "PrimaryImageAspectRatio,Overview,ProductionYear,UserData,SeriesInfo,RunTimeTicks,CommunityRating,OfficialRating,ParentBackdropItemId,ParentBackdropImageTags,ParentThumbItemId,ParentThumbImageTag,ParentPrimaryImageItemId,ParentPrimaryImageTag,ParentLogoItemId,ParentLogoImageTag,SeriesPrimaryImageTag,SeriesThumbImageTag";
      const imageParams = [
        ["EnableUserData", "true"],
        ["EnableImages", "true"],
        ["ImageTypeLimit", "4"],
        ["EnableImageTypes", "Primary,Backdrop,Thumb,Logo"],
      ];
      const preferVisualHeroItems = (items) => {
        const visual = items.filter((item) => item.BackdropImageTags?.length || item.ImageTags?.Primary || item.Overview?.trim());
        return visual.length > 0 ? visual : items;
      };
      const [viewsResp, resumeResp, heroResp] = await Promise.all([
        api.listViews(),
        api.resumeItems(),
        api.listItems({
          params: [
            ["Recursive", "true"],
            ["IncludeItemTypes", "Movie,Series"],
            ["Fields", heroFields],
            ["SortBy", "DateCreated"],
            ["SortOrder", "Descending"],
            ["Limit", "36"],
            ...imageParams,
          ],
        }),
      ]);
      const heroFallbackResp = (heroResp.Items ?? []).length > 0
        ? heroResp
        : await api.listItems({
            params: [
              ["Recursive", "true"],
              ["IncludeItemTypes", "Movie,Series,Episode"],
              ["Fields", heroFields],
              ["SortBy", "DateCreated"],
              ["SortOrder", "Descending"],
              ["Limit", "18"],
              ...imageParams,
            ],
          });
      const views = viewsResp.Items ?? [];
      const resume = resumeResp.Items ?? [];
      const heroItems = preferVisualHeroItems(heroFallbackResp.Items ?? []);
      const mediaResp = await api.listItems({
        params: [
          ["Recursive", "true"],
          ["IncludeItemTypes", "Movie,Episode"],
          ["Fields", "PrimaryImageAspectRatio,ProductionYear,Overview,UserData,SeriesInfo,RunTimeTicks,ParentBackdropItemId,ParentBackdropImageTags,ParentThumbItemId,ParentThumbImageTag,ParentPrimaryImageItemId,ParentPrimaryImageTag,ParentLogoItemId,ParentLogoImageTag,SeriesPrimaryImageTag,SeriesThumbImageTag"],
          ["SortBy", "DateCreated"],
          ["SortOrder", "Descending"],
          ["Limit", "24"],
          ["EnableUserData", "true"],
          ["EnableImages", "true"],
          ["ImageTypeLimit", "4"],
          ["EnableImageTypes", "Primary,Backdrop,Thumb,Logo"],
        ],
      });
      const seriesResp = await api.listItems({
        params: [
          ["Recursive", "true"],
          ["IncludeItemTypes", "Series"],
          ["Fields", "PrimaryImageAspectRatio,ProductionYear,Overview,UserData,SeriesInfo,RunTimeTicks,ParentBackdropItemId,ParentBackdropImageTags,ParentThumbItemId,ParentThumbImageTag,ParentPrimaryImageItemId,ParentPrimaryImageTag,ParentLogoItemId,ParentLogoImageTag,SeriesPrimaryImageTag,SeriesThumbImageTag"],
          ["SortBy", "DateCreated"],
          ["SortOrder", "Descending"],
          ["Limit", "24"],
          ["EnableUserData", "true"],
          ["EnableImages", "true"],
          ["ImageTypeLimit", "4"],
          ["EnableImageTypes", "Primary,Backdrop,Thumb,Logo"],
        ],
      });
      const candidates = [
        ...resume,
        ...heroItems.filter((item) => item.Type === "Movie" || item.Type === "Episode"),
        ...(mediaResp.Items ?? []),
      ];
      const seriesCandidates = [
        ...heroItems.filter((item) => item.Type === "Series"),
        ...(seriesResp.Items ?? []),
      ];
      const selected = candidates.find((item) => item?.Id && (item.Type === "Movie" || item.Type === "Episode"));
      if (!selected) throw new Error("real server has no Movie/Episode candidate for playback smoke");
      const selectedSeries = seriesCandidates.find((item) => item?.Id && item.Type === "Series") ?? null;
      const source = await api.getPlaybackSource({ itemId: selected.Id, startMs: 0 });
      window.__hillsRealSmokeSelectedName = selected.Name ?? "";
      window.__hillsRealSmokeSeriesName = selectedSeries?.Name ?? "";
      const selectedMediaSource = source.mediaSources?.find((item) => item.selected) ?? null;
      const playbackSummary = {
        playMethod: source.playMethod,
        mediaSourceCount: source.mediaSources?.length ?? 0,
        lineCount: source.lines?.length ?? 0,
        selectedMediaSource: selectedMediaSource ? {
          container: selectedMediaSource.container ?? null,
          protocol: selectedMediaSource.protocol ?? null,
          width: selectedMediaSource.width ?? null,
          height: selectedMediaSource.height ?? null,
          videoCodec: selectedMediaSource.videoCodec ?? null,
          audioCodec: selectedMediaSource.audioCodec ?? null,
          supportsDirectPlay: selectedMediaSource.supportsDirectPlay ?? null,
          supportsDirectStream: selectedMediaSource.supportsDirectStream ?? null,
          playMethod: selectedMediaSource.playMethod ?? null,
          supportsTranscoding: selectedMediaSource.supportsTranscoding ?? null,
          isRemote: selectedMediaSource.isRemote ?? null,
          selected: selectedMediaSource.selected === true,
        } : null,
        tracks: {
          video: (source.tracks ?? []).filter((track) => track.kind === "video").length,
          audio: (source.tracks ?? []).filter((track) => track.kind === "audio").length,
          subtitle: (source.tracks ?? []).filter((track) => track.kind === "subtitle").length,
        },
      };
      return {
        detected: detected ? {
          kind: detected.kind,
          winningLineId: detected.winningLineId,
          serverNamePresent: Boolean(detected.serverName),
          reportStatuses: (detected.reports ?? []).map((report) => ({
            lineId: report.lineId,
            status: report.status,
            kind: report.kind ?? null,
            latencyPresent: report.latencyMs != null,
            errorPresent: Boolean(report.error),
          })),
        } : null,
        detectError,
        accountCount: accounts.length,
        viewCount: views.length,
        resumeCount: resume.length,
        heroCount: heroItems.length,
        selected: {
          id: selected.Id,
          type: selected.Type,
          hasOverview: Boolean(selected.Overview),
          hasBackdrop: Boolean(selected.BackdropImageTags?.length),
          hasPrimary: Boolean(selected.ImageTags?.Primary),
          hasParentImage: Boolean(selected.ParentThumbItemId || selected.ParentBackdropItemId || selected.ParentPrimaryImageItemId),
          nameLength: String(selected.Name ?? "").length,
        },
        series: selectedSeries ? {
          id: selectedSeries.Id,
          type: selectedSeries.Type,
          hasOverview: Boolean(selectedSeries.Overview),
          hasBackdrop: Boolean(selectedSeries.BackdropImageTags?.length),
          hasPrimary: Boolean(selectedSeries.ImageTags?.Primary),
          nameLength: String(selectedSeries.Name ?? "").length,
        } : null,
        seriesCandidateCount: seriesCandidates.filter((item) => item?.Id && item.Type === "Series").length,
        playbackSummary,
        loginWinningLineId: login.winningLineId,
      };
    })()
  `, 12);
  }
  stage("setup-complete", {
    viewCount: setup.viewCount,
    resumeCount: setup.resumeCount,
    heroCount: setup.heroCount,
    mediaSourceCount: setup.playbackSummary?.mediaSourceCount ?? null,
  });

  if (commandOnly) {
    stage("command-only-start");
    const playerOpen = await cdpEvalAfterContextReset(ws, `
      (async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const timeout = (ms) => new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), ms));
        const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
        if (!appRouter) throw new Error("mounted Vue router not found");
        await appRouter.push(${JSON.stringify(`/player/${setup.selected.id}?start=0`)});
        await wait(500);
        const runtimeInvoke = window.hillsLite?.invoke?.bind(window.hillsLite) ?? null;
        const api = runtimeInvoke
          ? {
              getState: () => runtimeInvoke("get_state"),
              pause: () => runtimeInvoke("pause"),
              resume: () => runtimeInvoke("resume"),
              seekRelative: (deltaMs) => runtimeInvoke("seek_relative", { payload: { deltaMs } }),
              stop: () => runtimeInvoke("stop"),
              embedSetVisible: (visible) => runtimeInvoke("embed_set_visible", { visible }),
              embedDetach: () => runtimeInvoke("embed_detach"),
            }
          : (await import("/src/api/index.ts")).api;
        const settle = async (promise, ms) => {
          const result = await Promise.race([
            promise.then(() => true, () => false),
            timeout(ms),
          ]);
          return result?.__timeout ? false : result === true;
        };
        let lastState = null;
        let stateError = null;
        let timedOut = false;
        let lastSummary = null;
        const summarizeState = (state) => {
          const tracks = Array.isArray(state?.tracks) ? state.tracks : [];
          const videoTracks = tracks.filter((track) => track?.kind === "video");
          const videoTrackCodecs = videoTracks.map((track) => track?.codec).filter(Boolean);
          return {
            durationMs: state?.durationMs ?? 0,
            positionMs: state?.positionMs ?? 0,
            paused: state?.paused === true,
            trackCount: tracks.length,
            videoTrackCount: videoTracks.length,
            videoTrackCodecs,
            videoCodec: state?.videoCodec ?? null,
            audioCodec: state?.audioCodec ?? null,
            hasVideoParams: Boolean(state?.videoParams),
            hasVideoOutParams: Boolean(state?.videoOutParams),
            hasVideoEvidence: Boolean(
              state?.videoCodec ||
              state?.videoParams ||
              state?.videoOutParams ||
              videoTrackCodecs.length > 0
            ),
            backendDiagnostics: state?.backendDiagnostics ?? null,
          };
        };
        for (let attempt = 0; attempt < 45; attempt += 1) {
          const result = await Promise.race([
            api.getState().catch((error) => ({ __error: error?.message ?? String(error) })),
            timeout(1200),
          ]);
          if (result?.__timeout) {
            timedOut = true;
            break;
          }
          if (result?.__error) {
            stateError = result.__error;
          } else if (result) {
            lastState = result;
            lastSummary = summarizeState(result);
            const strictVideoReady = Boolean(
              lastSummary.durationMs > 0 &&
              lastSummary.videoTrackCount > 0 &&
              (lastSummary.hasVideoParams ||
                lastSummary.hasVideoOutParams ||
                lastSummary.videoCodec ||
                lastSummary.positionMs >= 3000)
            );
            if (strictVideoReady) break;
          }
          await wait(700);
        }
        let controls = null;
        const strictReady = Boolean(
          lastSummary &&
            lastSummary.durationMs > 0 &&
            lastSummary.videoTrackCount > 0 &&
            (lastSummary.hasVideoParams ||
              lastSummary.hasVideoOutParams ||
              lastSummary.videoCodec ||
              lastSummary.positionMs >= 3000)
        );
        if (strictReady && api.pause && api.resume && api.seekRelative) {
          controls = {
            pauseOk: false,
            resumeOk: false,
            seekForwardOk: false,
            seekBackwardOk: false,
            startPositionMs: lastSummary.positionMs,
            pausedPositionMs: null,
            resumedPositionMs: null,
            forwardPositionMs: null,
            backwardPositionMs: null,
          };
          await api.pause().catch(() => {});
          await wait(350);
          const pausedState = await Promise.race([
            api.getState().catch(() => null),
            timeout(1200),
          ]);
          if (pausedState && !pausedState.__timeout) {
            const pausedSummary = summarizeState(pausedState);
            controls.pauseOk = pausedSummary.paused === true;
            controls.pausedPositionMs = pausedSummary.positionMs;
          }
          await api.resume().catch(() => {});
          await wait(700);
          const resumedState = await Promise.race([
            api.getState().catch(() => null),
            timeout(1200),
          ]);
          if (resumedState && !resumedState.__timeout) {
            const resumedSummary = summarizeState(resumedState);
            controls.resumeOk = resumedSummary.paused === false;
            controls.resumedPositionMs = resumedSummary.positionMs;
          }
          await api.seekRelative(30000).catch(() => {});
          await wait(900);
          const forwardState = await Promise.race([
            api.getState().catch(() => null),
            timeout(1200),
          ]);
          if (forwardState && !forwardState.__timeout) {
            const forwardSummary = summarizeState(forwardState);
            controls.forwardPositionMs = forwardSummary.positionMs;
            controls.seekForwardOk = forwardSummary.positionMs >= controls.startPositionMs + 15000;
          }
          await api.seekRelative(-10000).catch(() => {});
          await wait(900);
          const backwardState = await Promise.race([
            api.getState().catch(() => null),
            timeout(1200),
          ]);
          if (backwardState && !backwardState.__timeout) {
            const backwardSummary = summarizeState(backwardState);
            controls.backwardPositionMs = backwardSummary.positionMs;
            controls.seekBackwardOk =
              controls.forwardPositionMs != null &&
              backwardSummary.positionMs <= controls.forwardPositionMs - 3000;
            lastState = backwardState;
            lastSummary = backwardSummary;
          }
        }
        const errorText = document.querySelector(".player__error")?.innerText ?? null;
        const cleanup = {
          stop: await settle(api.stop(), 2500),
          hide: api.embedSetVisible ? await settle(api.embedSetVisible(false), 1500) : null,
          detach: api.embedDetach ? await settle(api.embedDetach(), 1500) : null,
        };
        return {
          route: location.hash || location.pathname,
          hasPlayer: Boolean(document.querySelector(".player")),
          errorText,
          stateTimedOut: timedOut,
          stateError,
          state: lastState ? lastSummary ?? summarizeState(lastState) : null,
          controls,
          cleanup,
        };
      })()
    `, 3);
    const visualSmokeLog = tailTextFile(path.join(localAppDataDir, "EmbyPlayer", "visual-smoke.log"), 16000);
    const mpvProcessCount = tasklistImageCount("mpv.exe");
    const backendReachedLoad = /play:mpv-load-start/.test(visualSmokeLog ?? "");
    const backendCompletedLoad = /play:mpv-load-complete/.test(visualSmokeLog ?? "");
    const attached = /embed_attach:complete|embed_visible:show|embed_detach:complete/.test(visualSmokeLog ?? "");
    const stateReady = Boolean(
      playerOpen.state &&
        (playerOpen.state.durationMs ?? 0) > 0 &&
        (playerOpen.state.videoTrackCount ?? 0) > 0 &&
        (playerOpen.state.hasVideoParams ||
          playerOpen.state.hasVideoOutParams ||
          playerOpen.state.videoCodec ||
          (playerOpen.state.positionMs ?? 0) >= 3000),
    );
    const failures = [];
    if (!playerOpen.hasPlayer) failures.push("player route did not mount");
    if (playerOpen.stateTimedOut) failures.push("player get_state timed out");
    if (playerOpen.errorText) failures.push("player displayed an error");
    if (!attached) failures.push("embedded host did not attach");
    if (!backendReachedLoad) failures.push("backend play did not reach mpv load");
    if (!backendCompletedLoad) failures.push("backend mpv load did not complete");
    if (!stateReady) failures.push("mpv video state did not become ready");
    if (!stateReady && playerOpen.state?.backendDiagnostics?.lastError) {
      failures.push(`mpv diagnostic error: ${playerOpen.state.backendDiagnostics.lastError}`);
    }
    if (!playerOpen.controls?.pauseOk) failures.push("pause command did not take effect");
    if (!playerOpen.controls?.resumeOk) failures.push("resume command did not take effect");
    if (!playerOpen.controls?.seekForwardOk) failures.push("seek forward command did not move position");
    if (!playerOpen.controls?.seekBackwardOk) failures.push("seek backward command did not move position back");
    if ((mpvProcessCount ?? 0) > 0) failures.push("independent mpv.exe process is running");
    stage("command-only-complete", {
      ok: failures.length === 0,
      failures,
      mpvProcessCount,
      stateReady,
      attached,
      backendReachedLoad,
      backendCompletedLoad,
      backendDiagnostics: playerOpen.state?.backendDiagnostics ?? null,
    });
    const output = {
      ok: failures.length === 0,
      failures,
      tmpDir,
      setup,
      commandOnly: {
        playerOpen,
        mpvProcessCount,
        attached,
        backendReachedLoad,
        backendCompletedLoad,
        visualSmokeLog,
      },
      diagnostics: {
        electronStdout,
        electronStderr,
        pageConsole: pageConsole.slice(-12),
        pageExceptions,
      },
    };
    const redactedOutput = JSON.parse(redactSensitiveText(JSON.stringify(output)));
    console.log(JSON.stringify(redactedOutput, null, 2));
    if (!output.ok) process.exitCode = 1;
  } else if (layoutMetricsOnly) {
    const layoutSizes = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1024, height: 768 },
      { width: 960, height: 600 },
      { width: 760, height: 430 },
    ];
    const home = [];
    stage("layout-home-start", { count: layoutSizes.length });
    for (const size of layoutSizes) {
      home.push(await resizeAndMeasure(ws, child.pid, "/home", size));
      stage("layout-home-size", size);
    }

    const detail = [];
    const itemRoute = `/item/${setup.selected.id}`;
    stage("layout-detail-start", { count: layoutSizes.length });
    for (const size of layoutSizes) {
      detail.push(await resizeAndMeasure(ws, child.pid, itemRoute, size));
      stage("layout-detail-size", size);
    }

    const seriesDetail = [];
    const seriesRoute = setup.series?.id ? `/item/${setup.series.id}` : null;
    if (seriesRoute) {
      stage("layout-series-detail-start", { count: layoutSizes.length });
      for (const size of layoutSizes) {
        seriesDetail.push(await resizeAndMeasure(ws, child.pid, seriesRoute, size));
        stage("layout-series-detail-size", size);
      }
    } else {
      stage("layout-series-detail-skipped", { seriesCandidateCount: setup.seriesCandidateCount ?? 0 });
    }

    const failures = [];
    for (const entry of home) {
      const metrics = entry.metrics ?? {};
      if (!metrics.hero) failures.push(`home ${entry.size.width}x${entry.size.height}: hero missing`);
      if (metrics.hasHorizontalOverflow) failures.push(`home ${entry.size.width}x${entry.size.height}: horizontal overflow`);
      if ((metrics.firstSectionVisible ?? 0) < 36) {
        failures.push(`home ${entry.size.width}x${entry.size.height}: continue row not visible enough`);
      }
      if ((entry.size.height >= 700 || entry.size.width >= 1200) && (metrics.secondSectionVisible ?? 0) < 24) {
        failures.push(`home ${entry.size.width}x${entry.size.height}: library row not visible enough`);
      }
    }
    for (const entry of [...detail, ...seriesDetail]) {
      const metrics = entry.metrics ?? {};
      if (!metrics.detailHero) failures.push(`detail ${entry.size.width}x${entry.size.height}: hero missing`);
      if (metrics.hasHorizontalOverflow) failures.push(`detail ${entry.size.width}x${entry.size.height}: horizontal overflow`);
      if (metrics.detailTitleClipped) failures.push(`detail ${entry.size.width}x${entry.size.height}: title clipped`);
      if ((entry.size.height >= 700 || entry.size.width >= 1200) && (metrics.detailBelowVisible ?? 0) < 24) {
        failures.push(`detail ${entry.size.width}x${entry.size.height}: below-hero content not visible enough`);
      }
    }
    stage("layout-metrics-complete", { ok: failures.length === 0, failures });
    const output = {
      ok: failures.length === 0,
      failures,
      tmpDir,
      setup,
      layoutMetrics: {
        sizes: layoutSizes,
        home: home.map(summarizeLayoutEntry),
        detail: detail.map(summarizeLayoutEntry),
        seriesDetail: seriesDetail.map(summarizeLayoutEntry),
      },
      diagnostics: {
        electronStdout,
        electronStderr,
        pageConsole: pageConsole.slice(-12),
        pageExceptions,
      },
    };
    const redactedOutput = JSON.parse(redactSensitiveText(JSON.stringify(output)));
    console.log(JSON.stringify(redactedOutput, null, 2));
    if (!output.ok) process.exitCode = 1;
  } else {
  const homeSizes = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 960, height: 600 },
    { width: 760, height: 430 },
  ];
  const home = [];
  stage("home-inspect-start", { count: homeSizes.length });
  for (const size of homeSizes) {
    home.push(await resizeAndInspect(ws, child.pid, "/home", size, `home-${size.width}x${size.height}`));
    stage("home-inspect-size", size);
  }

  const detail = [];
  const itemRoute = `/item/${setup.selected.id}`;
  stage("detail-inspect-start", { count: homeSizes.length });
  for (const size of homeSizes) {
    detail.push(await resizeAndInspect(ws, child.pid, itemRoute, size, `detail-${size.width}x${size.height}`));
    stage("detail-inspect-size", size);
  }

  const seriesDetail = [];
  const seriesRoute = setup.series?.id ? `/item/${setup.series.id}` : null;
  if (seriesRoute) {
    stage("series-detail-inspect-start", { count: homeSizes.length });
    for (const size of homeSizes) {
      seriesDetail.push(await resizeAndInspect(ws, child.pid, seriesRoute, size, `series-detail-${size.width}x${size.height}`));
      stage("series-detail-inspect-size", size);
    }
  } else {
    stage("series-detail-inspect-skipped", { seriesCandidateCount: setup.seriesCandidateCount ?? 0 });
  }

  stage("personal-routes-start");
  const routes = await cdpEvalAfterContextReset(ws, `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      const result = [];
      for (const route of ["/favorites", "/history", "/aggregate"]) {
        await appRouter.push(route);
        await wait(1800);
        result.push({
          route,
          posterCount: document.querySelectorAll(".poster, .history-card").length,
          loadedImageCount: document.querySelectorAll(".poster__art img.loaded, .history-card img.loaded").length,
          errorCount: document.querySelectorAll(".empty--error, .toast--error").length,
          emptyTextPresent: /暂无|没有|空/.test(document.body.innerText),
        });
      }
      return result;
    })()
  `);
  stage("personal-routes-complete", { count: routes.length });

  stage("search-start");
  const search = await cdpEvalAfterContextReset(ws, `
    (async () => {
      const { useLibraryStore } = await import("/src/stores/library.ts");
      const lib = useLibraryStore();
      const term = window.__hillsRealSmokeSelectedName || "";
      const results = term ? await lib.search(term) : [];
      return {
        attempted: Boolean(term),
        count: results.length,
        uniqueSourceKeys: new Set(results.map((item) => [item._source?.serverId, item._source?.accountId, item.Id].join(":"))).size,
        sourceLabelCount: results.map((item) => item._source?.serverName).filter(Boolean).length,
      };
    })()
  `);
  stage("search-complete", { count: search.count ?? null });

  let seriesPlayProbe = {
    attempted: false,
    reason: "no real Series candidate was found",
  };
  if (seriesRoute) {
    stage("series-play-from-detail-start");
    seriesPlayProbe = {
      attempted: true,
      routeBeforeClick: null,
      routeAfterClick: null,
      opened: false,
      hasButton: false,
      buttonDisabled: null,
      buttonText: null,
      actionError: null,
      playerItemId: null,
      stopOk: false,
      stopError: null,
      exception: null,
    };
    try {
      await cdpEvalAfterContextReset(ws, `
        (async () => {
          const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
          if (!appRouter) throw new Error("mounted Vue router not found");
          await appRouter.push(${JSON.stringify(seriesRoute)});
          window.moveTo(40, 40);
          window.resizeTo(1366, 768);
          return true;
        })()
      `);

      let buttonSnapshot = null;
      for (let index = 0; index < 80; index += 1) {
        buttonSnapshot = await cdpEvalAfterContextReset(ws, `
          (() => {
            const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
            const route = appRouter?.currentRoute?.value?.fullPath ?? window.location.pathname;
            const expectedName = window.__hillsRealSmokeSeriesName || "";
            const title = document.querySelector(".hero__title")?.textContent ?? "";
            const button = document.querySelector(".hero__play");
            const rect = button?.getBoundingClientRect();
            return {
              route,
              titleMatches: !expectedName || title.includes(expectedName),
              hasButton: Boolean(button),
              buttonDisabled: button ? Boolean(button.disabled) : null,
              buttonText: button?.textContent?.replace(/\\s+/g, " ").trim() ?? null,
              actionError: document.querySelector(".hero__action-error")?.textContent?.replace(/\\s+/g, " ").trim() ?? null,
              buttonRect: rect ? {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                top: rect.top,
                left: rect.left,
                bottom: rect.bottom,
                right: rect.right,
              } : null,
            };
          })()
        `);
        if (
          buttonSnapshot?.route?.startsWith(seriesRoute) &&
          buttonSnapshot?.hasButton &&
          buttonSnapshot?.titleMatches
        ) {
          break;
        }
        await wait(150);
      }
      seriesPlayProbe.routeBeforeClick = buttonSnapshot?.route ?? null;
      seriesPlayProbe.hasButton = Boolean(buttonSnapshot?.hasButton);
      seriesPlayProbe.buttonDisabled = buttonSnapshot?.buttonDisabled ?? null;
      seriesPlayProbe.buttonText = buttonSnapshot?.buttonText ?? null;
      seriesPlayProbe.actionError = buttonSnapshot?.actionError ?? null;

      if (buttonSnapshot?.buttonRect && !buttonSnapshot.buttonDisabled) {
        await cdpClick(ws, centerOf(buttonSnapshot.buttonRect));
        for (let index = 0; index < 120; index += 1) {
          const routeSnapshot = await cdpEvalAfterContextReset(ws, `
            (() => {
              const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
              const route = appRouter?.currentRoute?.value?.fullPath ?? window.location.pathname;
              const hasPlayer = Boolean(document.querySelector(".player"));
              const actionError = document.querySelector(".hero__action-error")?.textContent?.replace(/\\s+/g, " ").trim() ?? null;
              return {
                route,
                hasPlayer,
                actionError,
                playerItemId: String(route.split(/[/?#]/)[2] ?? ""),
              };
            })()
          `);
          seriesPlayProbe.routeAfterClick = routeSnapshot?.route ?? seriesPlayProbe.routeAfterClick;
          seriesPlayProbe.actionError = routeSnapshot?.actionError ?? seriesPlayProbe.actionError;
          if (routeSnapshot?.route?.startsWith("/player/") && routeSnapshot?.hasPlayer) {
            seriesPlayProbe.opened = true;
            seriesPlayProbe.playerItemId = routeSnapshot.playerItemId;
            break;
          }
          await wait(200);
        }
      }
    } catch (error) {
      seriesPlayProbe.exception = error instanceof Error ? error.message : String(error);
    } finally {
      try {
        await cdpEvalAfterContextReset(ws, `
          (async () => {
            const { usePlayerStore } = await import("/src/stores/player.ts");
            const player = usePlayerStore();
            await player.stop();
            return true;
          })()
        `);
        seriesPlayProbe.stopOk = true;
      } catch (error) {
        seriesPlayProbe.stopError = error instanceof Error ? error.message : String(error);
      }
      await cdpEvalAfterContextReset(ws, `
        (async () => {
          const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
          await appRouter?.push("/home");
          return true;
        })()
      `).catch(() => {});
      await wait(600);
    }
    stage("series-play-from-detail-complete", {
      opened: seriesPlayProbe.opened,
      hasButton: seriesPlayProbe.hasButton,
      buttonDisabled: seriesPlayProbe.buttonDisabled,
      routeAfterClick: seriesPlayProbe.routeAfterClick,
      actionErrorPresent: Boolean(seriesPlayProbe.actionError),
      exceptionPresent: Boolean(seriesPlayProbe.exception),
    });
  } else {
    stage("series-play-from-detail-skipped", { reason: seriesPlayProbe.reason });
  }

  stage("player-open-from-detail-start");
  const playEntry = await cdpEvalAfterContextReset(ws, `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      await appRouter.push(${JSON.stringify(itemRoute)});
      window.moveTo(40, 40);
      window.resizeTo(1366, 768);
      await wait(2200);
      const button = document.querySelector(".hero__play");
      const rect = button?.getBoundingClientRect();
      return {
        route: appRouter.currentRoute.value.fullPath,
        url: window.location.href,
        buttonText: button?.textContent?.replace(/\\s+/g, " ").trim() ?? null,
        buttonDisabled: button ? Boolean(button.disabled) : null,
        buttonRect: rect ? {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
          bottom: rect.bottom,
          right: rect.right,
        } : null,
      };
    })()
  `);
  stage("player-open-detail-ready", {
    route: playEntry.route,
    hasButton: Boolean(playEntry.buttonRect),
    buttonDisabled: playEntry.buttonDisabled,
  });
  if (!playEntry.buttonRect) throw new Error("detail play button was not found");
  if (playEntry.buttonDisabled) throw new Error("detail play button was disabled");
  await cdpClick(ws, centerOf(playEntry.buttonRect));
  const playerOpen = await cdpEvalAfterContextReset(ws, `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      for (let index = 0; index < 90; index += 1) {
        const route = appRouter.currentRoute.value.fullPath;
        const hasPlayer = Boolean(document.querySelector(".player"));
        const errorText = document.querySelector(".player__error")?.textContent?.replace(/\\s+/g, " ").trim() ?? null;
        if (route.startsWith("/player/") && hasPlayer) {
          return { opened: true, route, url: window.location.href, hasPlayer, errorText };
        }
        await wait(200);
      }
      return {
        opened: false,
        route: appRouter.currentRoute.value.fullPath,
        url: window.location.href,
        hasPlayer: Boolean(document.querySelector(".player")),
        errorText: document.querySelector(".player__error")?.textContent?.replace(/\\s+/g, " ").trim() ?? null,
      };
    })()
  `);
  stage("player-open-wait-complete", playerOpen);
  if (!playerOpen.opened) {
    throw new Error(`detail play click did not open player route: ${playerOpen.route}`);
  }
  const playerVisualReady = await waitForPlaybackVisualReady(ws);
  stage("player-visual-ready", playerVisualReady);
  await wait(5000);
  await cdpEvalAfterContextReset(ws, `
    (() => {
      const player = document.querySelector(".player");
      player?.dispatchEvent(new MouseEvent("mousemove", {
        bubbles: true,
        clientX: Math.round(window.innerWidth / 2),
        clientY: Math.round(window.innerHeight / 2),
      }));
      return true;
    })()
  `);
  await wait(500);
  const playerScreenshot = await capture(ws, "player-initial");
  stage("player-screenshot-captured");
  const playerPixels = analyzePng(playerScreenshot);
  const playerInitial = await cdpEvalAfterContextReset(ws, metricsExpression());
  const playerInitialState = playerInitial.htmlVideo ?? playerInitial.mpvState;
  let playerNativeCapture = null;
  let playerVisiblePixels = playerPixels;
  if (!playerInitial.htmlVideo && playerInitial.mpvState) {
    try {
      playerNativeCapture = await capturePlaybackNativeLayer(ws, child.pid, "player-native-playback");
      playerVisiblePixels = playerNativeCapture.capture;
      stage("player-native-captured", {
        usedHandle: playerNativeCapture.usedHandle,
        mode: playerNativeCapture.embedState?.mode ?? null,
        processName: playerVisiblePixels.windowInfo?.processName ?? null,
        windowSize: playerVisiblePixels.windowInfo
          ? `${playerVisiblePixels.windowInfo.width}x${playerVisiblePixels.windowInfo.height}`
          : null,
        brightRatio: playerVisiblePixels.brightRatio,
        colorfulRatio: playerVisiblePixels.colorfulRatio,
        contentAspect: playerVisiblePixels.contentBox?.aspect ?? null,
      });
    } catch (error) {
      playerNativeCapture = {
        error: error instanceof Error ? error.message : String(error),
      };
      stage("player-native-capture-failed", playerNativeCapture);
    }
  }
  stage("player-metrics-captured", {
    hasHtmlVideo: Boolean(playerInitial.htmlVideo),
    hasMpvState: Boolean(playerInitial.mpvState),
    mpvStateTimedOut: playerInitial.mpvStateTimedOut === true,
  });
  const playerAspectEvidence = playbackAspectEvidence(playerInitial);
  stage("player-aspect-evidence", playerAspectEvidence);

  let seekBack = null;
  const seekBackCenter = centerOf(playerInitial.playerControls?.seekBack);
  if (seekBackCenter && playerVisualReady.ready) {
    stage("seek-back-start");
    try {
      await cdpEvalAfterContextReset(ws, `
        (async () => {
          const video = document.querySelector("video");
          if (video && Number.isFinite(video.duration)) video.currentTime = Math.min(15, Math.max(0, video.duration - 1));
          else if (window.hillsLite) await window.hillsLite.invoke("seek", { payload: { positionMs: 15000 } });
          else {
            const { api } = await import("/src/api/index.ts");
            await api.seek(15000);
          }
          return true;
        })()
      `);
      let before = null;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await wait(250);
        before = await cdpEvalAfterContextReset(ws, metricsExpression());
        const state = before.htmlVideo ?? before.mpvState;
        if ((state?.positionMs ?? 0) >= 12000) break;
      }
      await cdpClick(ws, seekBackCenter);
      await wait(1100);
      const after = await cdpEvalAfterContextReset(ws, metricsExpression());
      seekBack = { before: before.htmlVideo ?? before.mpvState, after: after.htmlVideo ?? after.mpvState };
      stage("seek-back-complete", {
        beforePositionMs: seekBack.before?.positionMs ?? null,
        afterPositionMs: seekBack.after?.positionMs ?? null,
      });
    } catch (error) {
      seekBack = {
        error: error instanceof Error ? error.message : String(error),
      };
      stage("seek-back-failed", seekBack);
    }
  } else if (seekBackCenter) {
    seekBack = { skipped: "player did not become ready" };
    stage("seek-back-skipped", seekBack);
  }

  let fullscreen = null;
  const fullscreenCenter = centerOf(playerInitial.playerControls?.fullscreen);
  if (fullscreenCenter) {
    stage("fullscreen-start");
    await cdpClick(ws, fullscreenCenter);
    await wait(1200);
    const entered = await cdpEvalAfterContextReset(ws, metricsExpression());
    await cdpEvalAfterContextReset(ws, `
      (async () => {
        if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
        else if (window.hillsLite) await window.hillsLite.invoke("set_fullscreen", { enabled: false });
        else {
          const { api } = await import("/src/api/index.ts");
          await api.setFullscreen(false);
        }
        return true;
      })()
    `);
    await wait(900);
    const exited = await cdpEvalAfterContextReset(ws, metricsExpression());
    fullscreen = { entered, exited };
    stage("fullscreen-complete");
  }

  let resizeVisualRestore = null;
  if (playerInitialState && playerVisualReady.ready) {
    const durationMs = playerInitialState.durationMs ?? 0;
    const initialPositionMs = playerInitialState.positionMs ?? 0;
    const targetMs = Math.max(0, Math.min(initialPositionMs, Math.max(0, durationMs - 3000)));
    stage("player-resize-visual-restore-start", { targetMs });
    await cdpEvalAfterContextReset(ws, `
      (async () => {
        const targetMs = ${Math.floor(targetMs)};
        const video = document.querySelector("video");
        if (video && Number.isFinite(video.duration)) {
          video.currentTime = targetMs / 1000;
          await video.play().catch(() => {});
        } else if (window.hillsLite) {
          await window.hillsLite.invoke("seek", { payload: { positionMs: targetMs } });
        } else {
          const { api } = await import("/src/api/index.ts");
          await api.seek(targetMs);
        }
        return true;
      })()
    `);
    resizeVisualRestore = await waitForPlaybackVisualReady(ws);
    stage("player-resize-visual-restore-complete", resizeVisualRestore);
    await wait(1200);
  }

  const playerResizes = [];
  stage("player-resize-start");
  for (const size of [
    { width: 1366, height: 768 },
    { width: 960, height: 600 },
    { width: 760, height: 430 },
  ]) {
    const entry = await resizeAndInspect(ws, child.pid, null, size, `player-${size.width}x${size.height}-ui`);
    if (!entry.metrics.htmlVideo && entry.metrics.mpvState) {
      try {
        const nativeCapture = await capturePlaybackNativeLayer(
          ws,
          child.pid,
          `player-${size.width}x${size.height}-native`,
        );
        entry.nativeCapture = nativeCapture;
        entry.visiblePixels = nativeCapture.capture;
      } catch (error) {
        entry.nativeCapture = {
          error: error instanceof Error ? error.message : String(error),
        };
        entry.visiblePixels = entry.pixels;
      }
    } else {
      entry.visiblePixels = entry.pixels;
    }
    entry.aspectEvidence = playbackAspectEvidence(entry.metrics);
    playerResizes.push(entry);
    stage("player-resize-size", {
      ...size,
      aspectEvidence: entry.aspectEvidence,
      nativeWindow: entry.visiblePixels?.windowInfo
        ? {
            processName: entry.visiblePixels.windowInfo.processName,
            width: entry.visiblePixels.windowInfo.width,
            height: entry.visiblePixels.windowInfo.height,
          }
        : null,
    });
  }

  stage("runtime-cleanup-start");
  const runtimeCleanup = await verifyRuntimeCleanup(child, ws);
  stage("runtime-cleanup-complete", runtimeCleanup);

  const failures = [];
  if (!setup.detected || setup.detected.kind !== "emby") failures.push("line1 did not detect as Emby");
  if (setup.viewCount < 1) failures.push("real account loaded no library views");
  if (setup.playbackSummary.playMethod !== "DirectPlay" && setup.playbackSummary.playMethod !== "DirectStream") {
    failures.push(`playback source method is not local decode: ${setup.playbackSummary.playMethod}`);
  }
  if (setup.playbackSummary.selectedMediaSource?.supportsTranscoding === true) {
    failures.push("selected media source reports transcoding support; smoke requires direct-only selection");
  }
  for (const entry of home) {
    const m = entry.metrics;
    if (!m.hero) failures.push(`home ${entry.size.width}x${entry.size.height}: hero missing`);
    if (m.hasHorizontalOverflow) failures.push(`home ${entry.size.width}x${entry.size.height}: horizontal overflow`);
    if (m.heroAspect != null && (m.heroAspect < 2.25 || m.heroAspect > 2.75)) {
      failures.push(`home ${entry.size.width}x${entry.size.height}: hero aspect ${m.heroAspect.toFixed(2)} out of fixed-ratio range`);
    }
    if ((m.firstSectionVisible ?? 0) < 48) {
      failures.push(`home ${entry.size.width}x${entry.size.height}: first row not exposed`);
    }
    if (entry.size.height >= 600 && (m.secondSectionVisible ?? 0) < 40) {
      failures.push(`home ${entry.size.width}x${entry.size.height}: second row not exposed`);
    }
  }
  for (const entry of detail) {
    const m = entry.metrics;
    if (!m.detailHero) failures.push(`detail ${entry.size.width}x${entry.size.height}: hero missing`);
    if (m.detailHero && (Math.abs(m.detailHero.x) > 2 || Math.abs(m.detailHero.y) > 2)) {
      failures.push(`detail ${entry.size.width}x${entry.size.height}: hero not anchored to window origin`);
    }
    if (m.detailHero && m.detailHero.height < m.viewport.height * 0.68) {
      failures.push(`detail ${entry.size.width}x${entry.size.height}: hero is too short for immersive layout`);
    }
    if (entry.size.height >= 760 && (m.detailBelowVisible ?? 0) < 32) {
      failures.push(`detail ${entry.size.width}x${entry.size.height}: below-hero content is not exposed`);
    }
    if (!m.detailTitle) failures.push(`detail ${entry.size.width}x${entry.size.height}: title missing`);
    if (m.detailTitleClipped) failures.push(`detail ${entry.size.width}x${entry.size.height}: title clipped outside viewport`);
    if (m.appSidebarVisible || m.topbarVisible) failures.push(`detail ${entry.size.width}x${entry.size.height}: app chrome visible`);
    if (m.hasHorizontalOverflow) failures.push(`detail ${entry.size.width}x${entry.size.height}: horizontal overflow`);
  }
  if (!setup.series) failures.push("real account loaded no Series candidate for series detail playback smoke");
  for (const entry of seriesDetail) {
    const m = entry.metrics;
    if (!m.detailHero) failures.push(`series detail ${entry.size.width}x${entry.size.height}: hero missing`);
    if (m.detailHero && (Math.abs(m.detailHero.x) > 2 || Math.abs(m.detailHero.y) > 2)) {
      failures.push(`series detail ${entry.size.width}x${entry.size.height}: hero not anchored to window origin`);
    }
    if (m.detailHero && m.detailHero.height < m.viewport.height * 0.68) {
      failures.push(`series detail ${entry.size.width}x${entry.size.height}: hero is too short for immersive layout`);
    }
    if (entry.size.height >= 760 && (m.detailBelowVisible ?? 0) < 32) {
      failures.push(`series detail ${entry.size.width}x${entry.size.height}: below-hero content is not exposed`);
    }
    if (!m.detailTitle) failures.push(`series detail ${entry.size.width}x${entry.size.height}: title missing`);
    if (m.detailTitleClipped) failures.push(`series detail ${entry.size.width}x${entry.size.height}: title clipped outside viewport`);
    if (m.appSidebarVisible || m.topbarVisible) failures.push(`series detail ${entry.size.width}x${entry.size.height}: app chrome visible`);
    if (m.hasHorizontalOverflow) failures.push(`series detail ${entry.size.width}x${entry.size.height}: horizontal overflow`);
  }
  if (!seriesPlayProbe.attempted) failures.push(`series detail play was not attempted: ${seriesPlayProbe.reason}`);
  if (seriesPlayProbe.attempted && !seriesPlayProbe.hasButton) failures.push("series detail play button was not found");
  if (seriesPlayProbe.attempted && seriesPlayProbe.buttonDisabled) failures.push("series detail play button was disabled");
  if (seriesPlayProbe.exception) failures.push(`series detail play probe exception: ${seriesPlayProbe.exception}`);
  if (seriesPlayProbe.actionError) failures.push(`series detail play action error: ${seriesPlayProbe.actionError}`);
  if (seriesPlayProbe.attempted && !seriesPlayProbe.opened) {
    failures.push(`series detail play did not open player route: ${seriesPlayProbe.routeAfterClick ?? seriesPlayProbe.routeBeforeClick}`);
  }
  if (seriesPlayProbe.opened && seriesPlayProbe.playerItemId === setup.series?.id) {
    failures.push("series detail play opened the Series item itself instead of a playable episode");
  }
  if (seriesPlayProbe.attempted && !seriesPlayProbe.stopOk) failures.push("series detail play probe could not stop playback after route check");
  for (const route of routes) {
    if (route.errorCount > 0) failures.push(`${route.route}: rendered error state`);
    if (route.posterCount > 0 && route.loadedImageCount < Math.min(route.posterCount, 2)) {
      failures.push(`${route.route}: visible cards did not load images`);
    }
  }
  if (!search.attempted || search.count < 1) failures.push("search did not return the selected real item");
  const playerState = playerInitialState;
  if (!playerState) failures.push("player did not expose a playback state");
  if (playerInitial.htmlVideo?.error) failures.push(`player video error code ${playerInitial.htmlVideo.error.code}`);
  if (playerInitial.htmlVideo && (playerInitial.htmlVideo.readyState ?? 0) < 2) {
    failures.push("player video did not reach HAVE_CURRENT_DATA");
  }
  if (playerInitial.htmlVideo && ((playerInitial.htmlVideo.videoWidth ?? 0) < 1 || (playerInitial.htmlVideo.videoHeight ?? 0) < 1)) {
    failures.push("player video has no decoded dimensions");
  }
  if (playerInitial.mpvState && (playerInitial.mpvState.trackCount ?? 0) < 1) {
    failures.push("mpv player has no tracks");
  }
  if ((playerState?.durationMs ?? 0) < 1) failures.push("player duration is unknown");
  if (!playerVisualReady.ready) failures.push("player did not become ready before delayed screenshot");
  if (playerInitial.playerPosterCard) failures.push("player DOM still renders poster card while mpv playback is active");
  if (playerInitial.mpvState && playerNativeCapture?.error) {
    failures.push(`native mpv playback capture failed: ${playerNativeCapture.error}`);
  }
  if (playerInitial.mpvState && !playerNativeCapture?.capture) {
    failures.push("native mpv playback capture missing; page screenshot is not valid video evidence");
  }
  if (
    playerInitial.mpvState &&
    playerNativeCapture?.embedState?.mode !== "wid" &&
    playerNativeCapture?.embedState?.mode !== "reparent" &&
    playerNativeCapture?.embedState?.mode !== "embedded"
  ) {
    failures.push(`mpv playback is not using embedded mpv mode: ${playerNativeCapture?.embedState?.mode ?? "unknown"}`);
  }
  if (playerInitial.mpvState && playerNativeCapture?.embedState?.hostKind !== "native-child") {
    failures.push(`mpv playback is not using the native child host: ${playerNativeCapture?.embedState?.hostKind ?? "unknown"}`);
  }
  if (playerInitial.mpvState && playerNativeCapture?.embedState?.mode !== "embedded" && playerNativeCapture?.usedHandle !== true) {
    failures.push("native mpv playback capture did not use the app-owned child hwnd");
  }
  if (!pixelSampleOk(playerVisiblePixels)) failures.push("player screenshot is visually black/blank");
  if (!playerAspectEvidence.ok) {
    failures.push(
      `player video aspect evidence failed: expected ${
        playerAspectEvidence.expectedAspect?.toFixed?.(2) ?? "unknown"
      }, output ${
        playerAspectEvidence.outputAspect?.toFixed?.(2) ??
        playerAspectEvidence.osdContentAspect?.toFixed?.(2) ??
        "unknown"
      }`,
    );
  }
  if (!playerInitial.playerControls?.bottom || !playerInitial.playerControls?.seekBack || !playerInitial.playerControls?.fullscreen) {
    failures.push("player controls/progress buttons are not visible");
  }
  if (seekBack?.error) failures.push(`seek back failed: ${seekBack.error}`);
  if (seekBack?.skipped) failures.push(`seek back skipped: ${seekBack.skipped}`);
  if (seekBack?.before && seekBack?.after && (seekBack.after.positionMs ?? 0) >= (seekBack.before.positionMs ?? 0) - 5000) {
    failures.push("seek back did not move playback backward");
  }
  if (!fullscreen?.entered?.playerStage || fullscreen.entered.playerStage.height < fullscreen.entered.viewport.height * 0.82) {
    failures.push("fullscreen did not expand player stage");
  }
  for (const entry of playerResizes) {
    const m = entry.metrics;
    if (m.hasHorizontalOverflow) failures.push(`player ${entry.size.width}x${entry.size.height}: horizontal overflow`);
    if (m.playerPosterCard) failures.push(`player ${entry.size.width}x${entry.size.height}: DOM poster card visible during mpv playback`);
    if (!m.playerControls?.bottom || !m.playerControls?.fullscreen) {
      failures.push(`player ${entry.size.width}x${entry.size.height}: controls missing after resize`);
    }
    if (entry.nativeCapture?.error) {
      failures.push(`player ${entry.size.width}x${entry.size.height}: native capture failed: ${entry.nativeCapture.error}`);
    }
    if (
      m.mpvState &&
      entry.nativeCapture?.embedState?.mode !== "wid" &&
      entry.nativeCapture?.embedState?.mode !== "reparent" &&
      entry.nativeCapture?.embedState?.mode !== "embedded"
    ) {
      failures.push(`player ${entry.size.width}x${entry.size.height}: mpv is not using embedded mpv mode`);
    }
    if (m.mpvState && entry.nativeCapture?.embedState?.hostKind !== "native-child") {
      failures.push(`player ${entry.size.width}x${entry.size.height}: mpv is not using the native child host`);
    }
    if (m.mpvState && entry.nativeCapture?.embedState?.mode !== "embedded" && entry.nativeCapture?.usedHandle !== true) {
      failures.push(`player ${entry.size.width}x${entry.size.height}: native capture did not use the app-owned child hwnd`);
    }
    if (!pixelSampleOk(entry.visiblePixels)) {
      failures.push(`player ${entry.size.width}x${entry.size.height}: resize screenshot is visually black/blank`);
    }
    if (!entry.aspectEvidence?.ok) {
      failures.push(
        `player ${entry.size.width}x${entry.size.height}: video aspect evidence failed: expected ${
          entry.aspectEvidence?.expectedAspect?.toFixed?.(2) ?? "unknown"
        }, output ${
          entry.aspectEvidence?.outputAspect?.toFixed?.(2) ??
          entry.aspectEvidence?.osdContentAspect?.toFixed?.(2) ??
          "unknown"
        }`,
      );
    }
  }
  if (!runtimeCleanup.ok) failures.push("runtime cleanup left playback/electron child processes alive");

  const output = {
    ok: failures.length === 0,
    failures,
    tmpDir,
    setup,
    home,
    detail,
    seriesDetail,
    routes,
    search,
    seriesPlayProbe,
    player: {
      screenshotPath: playerScreenshot,
      pixels: playerPixels,
      visiblePixels: playerVisiblePixels,
      nativeCapture: playerNativeCapture,
      aspectEvidence: playerAspectEvidence,
      visualReady: playerVisualReady,
      initial: playerInitial,
      seekBack,
      fullscreen,
      resizeVisualRestore,
      resizes: playerResizes,
    },
    runtimeCleanup,
    diagnostics: {
      electronStdout,
      electronStderr,
      pageConsole: pageConsole.slice(-12),
      pageExceptions,
    },
  };
  const redactedOutput = JSON.parse(redactSensitiveText(JSON.stringify(output)));
  console.log(JSON.stringify(redactedOutput, null, 2));
  if (!output.ok) process.exitCode = 1;
  }
} finally {
  ws?.close();
  if (child.exitCode == null && !child.killed) child.kill();
  setTimeout(() => {
    if (child.exitCode == null) child.kill("SIGKILL");
  }, 1000);
  if (process.env.HILLS_REAL_VISUAL_KEEP_ARTIFACTS !== "1") {
    await wait(1500);
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
