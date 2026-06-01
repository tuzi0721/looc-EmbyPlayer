import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const devServerUrl = process.env.HILLS_SMOKE_DEV_SERVER_URL ?? "http://127.0.0.1:1420";
const remotePort = Number(process.env.HILLS_SMOKE_CDP_PORT ?? 9351);
const itemId = "local-embedded-smoke";
const mediaSourceId = "local-source";
const playSessionId = "local-play-session";
const tmpDir = path.join(os.tmpdir(), `hills-lite-embedded-local-${Date.now()}`);
const userDataDir = path.join(tmpDir, "user-data");
const videoPath = path.join(tmpDir, "sample.mp4");
const screenshotPath = path.join(tmpDir, "embedded-local.png");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function ensureDevServer() {
  try {
    const response = await fetch(devServerUrl);
    if (response.ok) return;
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`Vite dev server is not reachable at ${devServerUrl}: ${error.message}`);
  }
}

function json(res, value, status = 200) {
  const body = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.byteLength,
  });
  res.end(body);
}

function empty(res, status = 204) {
  res.writeHead(status);
  res.end();
}

function serveVideo(req, res) {
  const stat = fs.statSync(videoPath);
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : stat.size - 1;
    const safeStart = Math.max(0, Math.min(stat.size - 1, start));
    const safeEnd = Math.max(safeStart, Math.min(stat.size - 1, end));
    res.writeHead(206, {
      "Accept-Ranges": "bytes",
      "Content-Type": "video/mp4",
      "Content-Length": safeEnd - safeStart + 1,
      "Content-Range": `bytes ${safeStart}-${safeEnd}/${stat.size}`,
    });
    fs.createReadStream(videoPath, { start: safeStart, end: safeEnd }).pipe(res);
    return;
  }
  res.writeHead(200, {
    "Accept-Ranges": "bytes",
    "Content-Type": "video/mp4",
    "Content-Length": stat.size,
  });
  fs.createReadStream(videoPath).pipe(res);
}

function createFakeEmbyServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);

    if (req.method === "GET" && pathname === "/System/Info/Public") {
      json(res, { ProductName: "Emby Server", ServerName: "Local Embedded Smoke", Version: "4.8.0" });
      return;
    }

    if (req.method === "POST" && pathname === "/Users/AuthenticateByName") {
      req.resume();
      json(res, {
        User: { Id: "local-user", Name: "Local Smoke" },
        AccessToken: "local-token",
      });
      return;
    }

    if (req.method === "GET" && pathname === `/Users/local-user/Items/${itemId}`) {
      json(res, {
        Id: itemId,
        Name: "Local Embedded Smoke",
        Type: "Movie",
        RunTimeTicks: 120_000_000,
        UserData: { PlaybackPositionTicks: 0, PlayCount: 0, IsFavorite: false, Played: false },
      });
      return;
    }

    if (req.method === "POST" && pathname === `/Items/${itemId}/PlaybackInfo`) {
      req.resume();
      json(res, {
        PlaySessionId: playSessionId,
        MediaSources: [
          {
            Id: mediaSourceId,
            Name: "Local MP4",
            Container: "mp4",
            SupportsDirectPlay: true,
            SupportsDirectStream: true,
            RunTimeTicks: 120_000_000,
            DefaultAudioStreamIndex: 1,
            MediaStreams: [
              {
                Index: 0,
                Type: "Video",
                Codec: "h264",
                Width: 640,
                Height: 360,
                IsDefault: true,
              },
              {
                Index: 1,
                Type: "Audio",
                Codec: "aac",
                Language: "und",
                IsDefault: true,
              },
            ],
          },
        ],
      });
      return;
    }

    if (req.method === "GET" && pathname === `/Videos/${itemId}/stream`) {
      serveVideo(req, res);
      return;
    }

    if (req.method === "POST" && pathname.startsWith("/Sessions/Playing/")) {
      req.resume();
      empty(res);
      return;
    }

    json(res, { error: "not found", path: pathname }, 404);
  });
  return server;
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fake server did not bind");
  return `http://127.0.0.1:${address.port}`;
}

async function getTargets() {
  for (let index = 0; index < 80; index += 1) {
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

async function cdpCall(ws, method, params = {}) {
  const id = cdpCall.nextId;
  cdpCall.nextId += 1;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} timeout`)), 45_000);
    const listener = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      clearTimeout(timer);
      ws.removeEventListener("message", listener);
      if (message.error) reject(new Error(`${method}: ${JSON.stringify(message.error)}`));
      else resolve(message.result);
    };
    ws.addEventListener("message", listener);
  });
}
cdpCall.nextId = 1;

async function cdpEval(ws, expression) {
  const result = await cdpCall(ws, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }
  return result.result?.value ?? null;
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

function playerUiMetricsExpression() {
  return `
    (() => {
      const rectOf = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          center: {
            x: Math.round(rect.x + rect.width / 2),
            y: Math.round(rect.y + rect.height / 2),
          },
        };
      };
      const visible = (rect) => Boolean(rect && rect.width > 1 && rect.height > 1);
      const doc = document;
      const nativeFullscreen =
        Math.abs(window.screenX) <= 2 &&
        Math.abs(window.screenY) <= 2 &&
        Math.abs(window.outerWidth - window.screen.width) <= 2 &&
        Math.abs(window.outerHeight - window.screen.height) <= 2;
      const top = rectOf(".player__top");
      const bottom = rectOf(".player__bottom");
      const playButton = rectOf('[data-control="play-toggle"]');
      const seekBackButton = rectOf('[data-control="seek-back"]');
      const fullscreenButton = rectOf('[data-control="fullscreen"]');
      return {
        bounds: {
          x: window.screenX,
          y: window.screenY,
          width: window.outerWidth,
          height: window.outerHeight,
        },
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        },
        fullscreenActive: Boolean(doc.fullscreenElement || doc.webkitFullscreenElement || nativeFullscreen),
        top,
        bottom,
        stage: rectOf(".player__stage"),
        playButton,
        seekBackButton,
        fullscreenButton,
        topVisible: visible(top),
        bottomVisible: visible(bottom),
        playButtonVisible: visible(playButton),
        seekBackButtonVisible: visible(seekBackButton),
        fullscreenButtonVisible: visible(fullscreenButton),
        hasHorizontalOverflow:
          document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    })()
  `;
}

function wakePlayerControlsExpression() {
  return `
    (() => {
      const player = document.querySelector(".player");
      player?.dispatchEvent(new MouseEvent("mousemove", {
        bubbles: true,
        clientX: Math.round(window.innerWidth / 2),
        clientY: Math.round(window.innerHeight / 2),
      }));
      return true;
    })()
  `;
}

function foregroundHillsWindow(processId = null) {
  const pid = Number(processId) || 0;
  const script = `
    Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      public static class Win32 {
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
      }
"@
    $proc = $null
    if (${pid} -gt 0) {
      $proc = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
    }
    if (-not $proc -or $proc.MainWindowHandle -eq 0) {
      $proc = Get-Process | Where-Object { $_.MainWindowTitle -eq "Hills Lite" } | Select-Object -First 1
    }
    if ($proc -and $proc.MainWindowHandle -ne 0) {
      [Win32]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null
      [Win32]::SetWindowPos($proc.MainWindowHandle, [IntPtr](-1), 0, 0, 0, 0, 0x0043) | Out-Null
      [Win32]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
      Start-Sleep -Milliseconds 120
      [Win32]::SetWindowPos($proc.MainWindowHandle, [IntPtr](-2), 0, 0, 0, 0, 0x0043) | Out-Null
    }
  `;
  run("powershell", ["-NoProfile", "-Command", script]);
}

function normalizeJsonArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
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
  return stdout ? normalizeJsonArray(JSON.parse(stdout)) : [];
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
  return stdout ? normalizeJsonArray(JSON.parse(stdout)) : [];
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
    return (
      name.includes("mpv") ||
      name.includes("electron_mpv_host") ||
      commandLine.includes("hills-lite-mpv-")
    );
  });
  await cdpEval(ws, `
    (() => {
      setTimeout(() => window.close(), 0);
      return true;
    })()
  `);
  const electronExited = await waitForChildExit(childProcess, 12_000);
  await wait(1200);
  const remaining = processesByPid(before.map((processInfo) => processInfo.ProcessId));
  return {
    before,
    electronExited,
    remaining,
    ok: electronExited && remaining.length === 0,
  };
}

function analyzePng(imagePath) {
  const script = `
    Add-Type -AssemblyName System.Drawing
    $bmp = New-Object System.Drawing.Bitmap(${JSON.stringify(imagePath)})
    $total = 0
    $bright = 0
    $colorful = 0
    $x0 = [Math]::Floor($bmp.Width * 0.22)
    $x1 = [Math]::Floor($bmp.Width * 0.78)
    $y0 = [Math]::Floor($bmp.Height * 0.22)
    $y1 = [Math]::Floor($bmp.Height * 0.70)
    for ($y = $y0; $y -lt $y1; $y += 8) {
      for ($x = $x0; $x -lt $x1; $x += 8) {
        $p = $bmp.GetPixel($x, $y)
        $max = [Math]::Max($p.R, [Math]::Max($p.G, $p.B))
        $min = [Math]::Min($p.R, [Math]::Min($p.G, $p.B))
        $total += 1
        if ($max -gt 48) { $bright += 1 }
        if (($max - $min) -gt 36) { $colorful += 1 }
      }
    }
    [PSCustomObject]@{
      screenshotPath = ${JSON.stringify(imagePath)}
      width = $bmp.Width
      height = $bmp.Height
      total = $total
      bright = $bright
      colorful = $colorful
      brightRatio = if ($total -gt 0) { $bright / $total } else { 0 }
      colorfulRatio = if ($total -gt 0) { $colorful / $total } else { 0 }
    } | ConvertTo-Json -Compress
    $bmp.Dispose()
  `;
  const result = run("powershell", ["-NoProfile", "-Command", script]);
  return JSON.parse(result.stdout);
}

function captureAndAnalyze(bounds) {
  const rect = {
    x: Math.max(0, Math.round(bounds.x)),
    y: Math.max(0, Math.round(bounds.y)),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
  };
  const script = `
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $bmp = New-Object System.Drawing.Bitmap(${rect.width}, ${rect.height})
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.CopyFromScreen(${rect.x}, ${rect.y}, 0, 0, $bmp.Size)
    $bmp.Save(${JSON.stringify(screenshotPath)}, [System.Drawing.Imaging.ImageFormat]::Png)
    $gfx.Dispose()

    $bmp.Dispose()
  `;
  run("powershell", ["-NoProfile", "-Command", script]);
  return analyzePng(screenshotPath);
}

await fsp.mkdir(tmpDir, { recursive: true });
await ensureDevServer();
run("ffmpeg", [
  "-y",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=640x360:rate=30",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=660:sample_rate=48000",
  "-t",
  "12",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-shortest",
  videoPath,
]);

const fakeServer = createFakeEmbyServer();
const fakeBaseUrl = await listen(fakeServer);
const electron = path.resolve("node_modules/electron/dist/electron.exe");
const child = spawn(electron, [`--remote-debugging-port=${remotePort}`, "electron/main.mjs"], {
  env: {
    ...process.env,
    HILLS_ELECTRON_DEV_SERVER_URL: devServerUrl,
    HILLS_ELECTRON_OPEN_DEVTOOLS: "0",
    HILLS_ELECTRON_USER_DATA_DIR: userDataDir,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

let ws;
try {
  const targets = await getTargets();
  const target =
    targets.find((item) => item.type === "page" && item.url.startsWith(devServerUrl)) ??
    targets.find((item) => item.type === "page");
  if (!target?.webSocketDebuggerUrl) throw new Error("page target not found");

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("websocket error"));
  });
  await cdpCall(ws, "Runtime.enable");
  await cdpCall(ws, "Page.enable");
  await wait(500);

  const startResult = await cdpEval(ws, `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      await wait(1200);
      const { useAuthStore } = await import("/src/stores/auth.ts");
      const { useServerStore } = await import("/src/stores/server.ts");
      const serverStore = useServerStore();
      const auth = useAuthStore();
      const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      if (!appRouter) throw new Error("mounted Vue router not found");
      const server = await serverStore.addServer({
        name: "Local Embedded Smoke",
        kind: "emby",
        activeLineId: "local-line",
        defaultUserAgent: null,
        lines: [{
          id: "local-line",
          name: "Local",
          baseUrl: ${JSON.stringify(fakeBaseUrl)},
          userAgent: null,
          headers: [],
          priority: 0,
          enabled: true,
        }],
      });
      await auth.login({ serverId: server.id, username: "local", password: "local" });
      await appRouter.push("/player/${itemId}");
      await wait(9000);
      const state = await window.hillsLite.invoke("get_state");
      let mpvScreenshot = null;
      let mpvScreenshotError = null;
      try {
        mpvScreenshot = await window.hillsLite.invoke("take_screenshot", {
          payload: { title: "embedded-smoke", includeSubtitles: true },
        });
      } catch (error) {
        mpvScreenshotError = error?.message ?? String(error);
      }
      const stage = document.querySelector(".player__stage")?.getBoundingClientRect();
      return {
        route: appRouter.currentRoute.value.fullPath,
        bodyText: document.body.innerText.slice(0, 800),
        bounds: { x: window.screenX, y: window.screenY, width: window.outerWidth, height: window.outerHeight },
        stage: stage ? { x: stage.x, y: stage.y, width: stage.width, height: stage.height } : null,
        mpvScreenshot,
        mpvScreenshotError,
        state: {
          durationMs: state.durationMs,
          positionMs: state.positionMs,
          trackCount: Array.isArray(state.tracks) ? state.tracks.length : 0,
          speed: state.speed,
          paused: state.paused,
          eof: state.eof,
        },
      };
    })()
  `);

  const holdPoint = startResult.stage
    ? {
        x: Math.round(startResult.stage.x + startResult.stage.width / 2),
        y: Math.round(startResult.stage.y + startResult.stage.height / 2),
      }
    : { x: 640, y: 360 };
  await cdpCall(ws, "Input.dispatchMouseEvent", { type: "mouseMoved", ...holdPoint, button: "none" });
  await cdpCall(ws, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...holdPoint,
    button: "left",
    clickCount: 1,
  });
  await wait(850);
  const longPressActive = await cdpEval(ws, `
    (async () => {
      const state = await window.hillsLite.invoke("get_state");
      return {
        speed: state.speed,
        badgeVisible: Boolean(document.querySelector(".player__speed-hold")),
      };
    })()
  `);
  await cdpCall(ws, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...holdPoint,
    button: "left",
    clickCount: 1,
  });
  await wait(650);
  const longPressRestored = await cdpEval(ws, `
    (async () => {
      const state = await window.hillsLite.invoke("get_state");
      return {
        speed: state.speed,
        badgeVisible: Boolean(document.querySelector(".player__speed-hold")),
      };
    })()
  `);
  const longPressSpeed = {
    point: holdPoint,
    active: longPressActive,
    restored: longPressRestored,
  };

  let seekBackResult = null;
  let seekBackError = null;
  try {
    await cdpEval(ws, `
      (async () => {
        await window.hillsLite.invoke("seek", { payload: { positionMs: 10000 } });
        return true;
      })()
    `);
    await wait(650);
    const before = await cdpEval(ws, `
      (async () => {
        const state = await window.hillsLite.invoke("get_state");
        return { positionMs: state.positionMs, paused: state.paused };
      })()
    `);
    const controlsForSeek = await cdpEval(ws, playerUiMetricsExpression());
    if (!controlsForSeek.seekBackButton?.center) {
      throw new Error("seek back button not visible");
    }
    await cdpClick(ws, controlsForSeek.seekBackButton.center);
    await wait(900);
    const after = await cdpEval(ws, `
      (async () => {
        const state = await window.hillsLite.invoke("get_state");
        return { positionMs: state.positionMs, paused: state.paused };
      })()
    `);
    seekBackResult = { before, after, button: controlsForSeek.seekBackButton };
  } catch (error) {
    seekBackError = error?.message ?? String(error);
  }

  const controlsInitial = await cdpEval(ws, playerUiMetricsExpression());
  let fullscreenAfterEnter = null;
  let fullscreenAfterExit = null;
  let fullscreenStageCoversViewport = false;
  let fullscreenError = null;
  try {
    if (!controlsInitial.fullscreenButton?.center) {
      throw new Error("fullscreen button not visible");
    }
    await cdpClick(ws, controlsInitial.fullscreenButton.center);
    await wait(1100);
    fullscreenAfterEnter = await cdpEval(ws, playerUiMetricsExpression());
    fullscreenStageCoversViewport =
      fullscreenAfterEnter?.stage?.width >= fullscreenAfterEnter?.viewport?.width - 4 &&
      fullscreenAfterEnter?.stage?.height >= fullscreenAfterEnter?.viewport?.height - 4;
    if (fullscreenAfterEnter.fullscreenActive) {
      await cdpEval(ws, `
        (async () => {
          const doc = document;
          if (doc.fullscreenElement && doc.exitFullscreen) await doc.exitFullscreen();
          else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) doc.webkitExitFullscreen();
          else if (window.hillsLite) await window.hillsLite.invoke("set_fullscreen", { enabled: false });
          return true;
        })()
      `);
      await wait(900);
    }
    fullscreenAfterExit = await cdpEval(ws, playerUiMetricsExpression());
  } catch (error) {
    fullscreenError = error?.message ?? String(error);
  }

  let resizeResult = null;
  let compactResizeResult = null;
  let resizeError = null;
  let pixels = null;
  try {
    await cdpEval(ws, `
      (() => {
        window.moveTo(80, 80);
        window.resizeTo(960, 620);
        return {
          x: window.screenX,
          y: window.screenY,
          width: window.outerWidth,
          height: window.outerHeight,
        };
      })()
    `);
    await wait(1500);
    await cdpEval(ws, wakePlayerControlsExpression());
    await wait(180);
    resizeResult = await cdpEval(ws, playerUiMetricsExpression());
    foregroundHillsWindow(child.pid);
    await wait(500);
    pixels = captureAndAnalyze(resizeResult?.bounds ?? startResult.bounds);

    await cdpEval(ws, `
      (() => {
        window.moveTo(80, 80);
        window.resizeTo(760, 430);
        return {
          x: window.screenX,
          y: window.screenY,
          width: window.outerWidth,
          height: window.outerHeight,
        };
      })()
    `);
    await wait(1500);
    await cdpEval(ws, wakePlayerControlsExpression());
    await wait(180);
    compactResizeResult = await cdpEval(ws, playerUiMetricsExpression());

    await cdpEval(ws, `
      (() => {
        window.resizeTo(960, 620);
        return true;
      })()
    `);
    await wait(1500);
    await cdpEval(ws, wakePlayerControlsExpression());
    await wait(180);
  } catch (error) {
    resizeError = error?.message ?? String(error);
  }

  foregroundHillsWindow(child.pid);
  await wait(500);
  if (!pixels) pixels = captureAndAnalyze(resizeResult?.bounds ?? startResult.bounds);
  const mpvPixels = startResult.mpvScreenshot?.filePath
    ? analyzePng(startResult.mpvScreenshot.filePath)
    : null;
  const screenPixelsOk = pixels.brightRatio > 0.18 && pixels.colorfulRatio > 0.08;
  const mpvPixelsOk =
    (mpvPixels?.brightRatio ?? 0) > 0.18 && (mpvPixels?.colorfulRatio ?? 0) > 0.08;

  const functionalOk =
    startResult.route === `/player/${itemId}` &&
    startResult.state.durationMs > 0 &&
    startResult.state.trackCount >= 1 &&
    longPressSpeed.active.speed >= 1.95 &&
    Math.abs(longPressSpeed.restored.speed - startResult.state.speed) < 0.05 &&
    !longPressSpeed.restored.badgeVisible &&
    seekBackResult?.after?.positionMs < seekBackResult?.before?.positionMs - 5000 &&
    controlsInitial.topVisible &&
    controlsInitial.bottomVisible &&
    controlsInitial.playButtonVisible &&
    controlsInitial.seekBackButtonVisible &&
    controlsInitial.fullscreenButtonVisible &&
    !controlsInitial.hasHorizontalOverflow &&
    fullscreenAfterEnter?.fullscreenActive === true &&
    fullscreenStageCoversViewport &&
    fullscreenAfterExit?.fullscreenActive === false &&
    resizeResult?.bounds?.width <= 1100 &&
    resizeResult?.bounds?.height <= 720 &&
    resizeResult?.stage?.width >= 760 &&
    resizeResult?.stage?.height >= 480 &&
    !resizeResult?.hasHorizontalOverflow &&
    compactResizeResult?.bounds?.width <= 1000 &&
    compactResizeResult?.bounds?.height <= 640 &&
    compactResizeResult?.topVisible &&
    compactResizeResult?.bottomVisible &&
    compactResizeResult?.playButtonVisible &&
    compactResizeResult?.fullscreenButtonVisible &&
    compactResizeResult?.stage?.width >= 560 &&
    compactResizeResult?.stage?.height >= 420 &&
    (compactResizeResult?.bottom?.height ?? 999) <= 150 &&
    !compactResizeResult?.hasHorizontalOverflow &&
    (screenPixelsOk || mpvPixelsOk);

  let runtimeCleanup = null;
  let runtimeCleanupError = null;
  try {
    runtimeCleanup = await verifyRuntimeCleanup(child, ws);
  } catch (error) {
    runtimeCleanupError = error?.message ?? String(error);
  }

  const ok = functionalOk && runtimeCleanup?.ok === true;

  console.log(JSON.stringify({
    ok,
    functionalOk,
    screenshotPath,
    route: startResult.route,
    bodyText: startResult.bodyText,
    state: startResult.state,
    stage: startResult.stage,
    longPressSpeed,
    seekBack: {
      result: seekBackResult,
      error: seekBackError,
    },
    controlsInitial,
    fullscreen: {
      afterEnter: fullscreenAfterEnter,
      afterExit: fullscreenAfterExit,
      stageCoversViewport: fullscreenStageCoversViewport,
      error: fullscreenError,
    },
    resize: {
      result: resizeResult,
      compactResult: compactResizeResult,
      error: resizeError,
    },
    mpvScreenshot: startResult.mpvScreenshot,
    mpvScreenshotError: startResult.mpvScreenshotError,
    mpvPixels,
    pixels,
    pixelChecks: {
      screenPixelsOk,
      mpvPixelsOk,
    },
    runtimeCleanup,
    runtimeCleanupError,
  }, null, 2));

  if (!ok) process.exitCode = 1;
} finally {
  ws?.close();
  if (child.exitCode == null && !child.killed) child.kill();
  setTimeout(() => {
    if (child.exitCode == null) child.kill("SIGKILL");
  }, 1000);
  fakeServer.close();
  if (process.env.HILLS_SMOKE_KEEP_ARTIFACTS !== "1") {
    await wait(1200);
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
