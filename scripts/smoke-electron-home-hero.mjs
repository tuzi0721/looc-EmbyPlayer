import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "undici";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const electronPath = path.join(projectDir, "node_modules", "electron", "dist", "electron.exe");
const vitePath = path.join(projectDir, "node_modules", "vite", "bin", "vite.js");
const loopbackHost = "127.0.0.1";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X2YAAAAASUVORK5CYII=",
  "base64",
);

// Enough for the backend's HTTP Range probe; unlike the old mock this never 404s.
const mediaBytes = Buffer.alloc(4096);
Buffer.from("000000186674797069736f6d0000020069736f6d69736f32", "hex").copy(mediaBytes);

const playbackMediaSources = [
  {
    Id: "source-main",
    Name: "WEB-DL H.264",
    Type: "Default",
    Protocol: "File",
    Path: "X:\\Smoke\\hero-main.mkv",
    Container: "mkv",
    Size: 1_900_000_000,
    Bitrate: 2_400_000,
    RunTimeTicks: 7_200_000_000,
    SupportsDirectPlay: true,
    SupportsDirectStream: true,
    SupportsTranscoding: false,
    IsRemote: false,
    MediaStreams: [
      { Index: 0, Type: "Video", Codec: "h264", Width: 1920, Height: 1080, BitRate: 2_000_000, IsDefault: true },
      { Index: 1, Type: "Audio", Codec: "aac", Language: "jpn", DisplayTitle: "Japanese AAC Stereo", Channels: 2, BitRate: 192_000, IsDefault: true },
      { Index: 2, Type: "Subtitle", Codec: "subrip", Language: "chi", DisplayTitle: "Chinese Simplified", IsExternal: true },
    ],
  },
  {
    Id: "source-alt",
    Name: "BluRay HEVC",
    Type: "Default",
    Protocol: "File",
    Path: "X:\\Smoke\\hero-alt.mp4",
    Container: "mp4",
    Size: 2_400_000_000,
    Bitrate: 3_100_000,
    RunTimeTicks: 7_200_000_000,
    SupportsDirectPlay: true,
    SupportsDirectStream: false,
    SupportsTranscoding: false,
    IsRemote: false,
    MediaStreams: [
      { Index: 0, Type: "Video", Codec: "hevc", Width: 1920, Height: 1080, BitRate: 2_700_000, IsDefault: true },
      { Index: 1, Type: "Audio", Codec: "aac", Language: "jpn", DisplayTitle: "Japanese AAC Stereo", Channels: 2, BitRate: 192_000, IsDefault: true },
      { Index: 2, Type: "Subtitle", Codec: "subrip", Language: "eng", DisplayTitle: "English", IsExternal: true },
    ],
  },
];

const heroMovie = {
  Id: "hero-movie",
  Name: "Giant Screen Smoke",
  Type: "Movie",
  Overview: "A runtime media-library candidate used to verify the Electron home hero, detail navigation, and playback request.",
  ProductionYear: 2026,
  CommunityRating: 8.7,
  OfficialRating: "PG-13",
  RunTimeTicks: 7_200_000_000,
  ImageTags: { Primary: "primary-tag", Logo: "logo-tag" },
  BackdropImageTags: ["backdrop-tag"],
  MediaSources: playbackMediaSources,
  UserData: { PlaybackPositionTicks: 0, PlayCount: 0, IsFavorite: false, Played: false, PlayedPercentage: 0 },
};

const libraryView = {
  Id: "movies",
  Name: "Movies",
  Type: "CollectionFolder",
  CollectionType: "movies",
  ImageTags: { Primary: "view-primary-tag" },
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function appendBounded(target, key, chunk, limit = 16_000) {
  target[key] = `${target[key]}${String(chunk)}`;
  if (target[key].length > limit) target[key] = target[key].slice(-limit);
}

function captureChildOutput(child) {
  const output = { stdout: "", stderr: "" };
  child.stdout?.on("data", (chunk) => appendBounded(output, "stdout", chunk));
  child.stderr?.on("data", (chunk) => appendBounded(output, "stderr", chunk));
  return output;
}

async function waitFor(check, { timeoutMs = 20_000, intervalMs = 100, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await wait(intervalMs);
  }
  const suffix = lastError ? `; last error: ${lastError.message ?? String(lastError)}` : "";
  throw new Error(`${label} timed out after ${timeoutMs}ms${suffix}`);
}

async function reservePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, loopbackHost, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to reserve a temporary port");
  const port = address.port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForDevServer(url, child = null) {
  return waitFor(
    async () => {
      if (child?.exitCode != null) throw new Error(`Vite exited early with code ${child.exitCode}`);
      const response = await fetch(url);
      if (!response.ok) return false;
      const body = await response.text();
      return body.includes('id="app"') || body.includes("id='app'");
    },
    { timeoutMs: 30_000, intervalMs: 200, label: `Vite ${url}` },
  );
}

function normalizeLoopbackOrigin(value) {
  const parsed = new URL(value);
  const hostname = parsed.hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)) {
    throw new Error(`smoke dev server must be loopback, received ${parsed.hostname}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`smoke dev server must use http(s), received ${parsed.protocol}`);
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error("smoke dev server URL must be a credential-free origin");
  }
  return parsed.origin;
}

async function startDevServer() {
  const configured = process.env.HILLS_SMOKE_DEV_SERVER_URL?.trim();
  if (configured) {
    const url = normalizeLoopbackOrigin(configured);
    await waitForDevServer(url);
    return { url, child: null, output: { stdout: "", stderr: "" }, owned: false };
  }
  if (!fs.existsSync(vitePath)) throw new Error(`Vite entry not found: ${vitePath}`);
  const port = await reservePort();
  const url = `http://${loopbackHost}:${port}`;
  const child = spawn(process.execPath, [vitePath, "--host", loopbackHost, "--port", String(port), "--strictPort"], {
    cwd: projectDir,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const output = captureChildOutput(child);
  await waitForDevServer(url, child);
  return { url, child, output, owned: true };
}

function sendJson(entry, res, value, status = 200) {
  const body = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
  entry.responseStatus = status;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.byteLength,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendImage(entry, res) {
  entry.responseStatus = 200;
  res.writeHead(200, { "Content-Type": "image/png", "Content-Length": png.byteLength, "Cache-Control": "no-store" });
  res.end(png);
}

function sendEmpty(entry, res, status = 204) {
  entry.responseStatus = status;
  res.writeHead(status, { "Content-Length": "0", "Cache-Control": "no-store" });
  res.end();
}

async function readBody(req, maxBytes = 1_048_576) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.byteLength;
    if (size > maxBytes) throw new Error(`request body exceeded ${maxBytes} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendMedia(entry, req, res) {
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/i.exec(range);
    const start = match ? Number(match[1]) : 0;
    const requestedEnd = match?.[2] ? Number(match[2]) : mediaBytes.length - 1;
    const end = Math.min(mediaBytes.length - 1, Math.max(start, requestedEnd));
    const body = mediaBytes.subarray(start, end + 1);
    entry.responseStatus = 206;
    res.writeHead(206, {
      "Content-Type": "video/mp4",
      "Content-Length": body.byteLength,
      "Content-Range": `bytes ${start}-${end}/${mediaBytes.length}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    });
    if (req.method === "HEAD") res.end();
    else res.end(body);
    return;
  }
  entry.responseStatus = 200;
  res.writeHead(200, {
    "Content-Type": "video/mp4",
    "Content-Length": mediaBytes.byteLength,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  });
  if (req.method === "HEAD") res.end();
  else res.end(mediaBytes);
}

function createFakeEmbyServer() {
  const state = { requests: [], playbackInfoRequests: [], streamRequests: [], unhandledRequests: [] };
  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", `http://${loopbackHost}`);
      const pathname = decodeURIComponent(url.pathname);
      const entry = {
        method: req.method ?? "GET",
        pathname,
        query: Object.fromEntries(url.searchParams),
        range: req.headers.range ?? null,
        responseStatus: null,
      };
      state.requests.push(entry);

      if (entry.method === "GET" && pathname === "/System/Info/Public") {
        sendJson(entry, res, { ProductName: "Emby Server", ServerName: "Home Hero Smoke", Version: "4.8.11.0" });
        return;
      }
      if (entry.method === "POST" && pathname === "/Users/AuthenticateByName") {
        await readBody(req);
        sendJson(entry, res, { User: { Id: "home-user", Name: "Home Smoke" }, AccessToken: "home-token" });
        return;
      }
      if (entry.method === "GET" && pathname === "/Users/home-user/Views") {
        sendJson(entry, res, { Items: [libraryView], TotalRecordCount: 1 });
        return;
      }
      if (entry.method === "GET" && pathname === "/Users/home-user/Items/Resume") {
        sendJson(entry, res, { Items: [], TotalRecordCount: 0 });
        return;
      }
      if (entry.method === "GET" && pathname === "/Users/home-user/Items") {
        sendJson(entry, res, { Items: [heroMovie], TotalRecordCount: 1 });
        return;
      }
      if (entry.method === "GET" && pathname === "/Users/home-user/Items/hero-movie") {
        sendJson(entry, res, heroMovie);
        return;
      }
      if (entry.method === "GET" && pathname === "/Items/hero-movie/Similar") {
        sendJson(entry, res, { Items: [], TotalRecordCount: 0 });
        return;
      }
      if (entry.method === "GET" && pathname === "/Users/home-user/Items/hero-movie/SpecialFeatures") {
        sendJson(entry, res, { Items: [], TotalRecordCount: 0 });
        return;
      }
      if (entry.method === "POST" && pathname === "/Items/hero-movie/PlaybackInfo") {
        const rawBody = await readBody(req);
        try { entry.body = JSON.parse(rawBody); } catch { entry.body = rawBody; }
        state.playbackInfoRequests.push(entry);
        sendJson(entry, res, { PlaySessionId: "play-session-smoke", MediaSources: playbackMediaSources });
        return;
      }
      if (["GET", "HEAD"].includes(entry.method) && /^\/(?:emby\/)?Videos\/hero-movie\/stream$/i.test(pathname)) {
        state.streamRequests.push(entry);
        sendMedia(entry, req, res);
        return;
      }
      if (entry.method === "POST" && ["/Sessions/Playing/Progress", "/Sessions/Playing/Stopped"].includes(pathname)) {
        await readBody(req);
        sendEmpty(entry, res);
        return;
      }
      if (entry.method === "GET" && /^\/Items\/[^/]+\/Images\/(?:Primary|Backdrop|Thumb|Logo)$/i.test(pathname)) {
        sendImage(entry, res);
        return;
      }
      entry.responseStatus = 404;
      state.unhandledRequests.push(entry);
      sendJson(entry, res, { error: "not found", path: pathname }, 404);
    })().catch((error) => {
      const latest = state.requests.at(-1);
      if (latest && latest.responseStatus == null) latest.responseStatus = 500;
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(String(error?.stack ?? error));
    });
  });
  return { server, state };
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, loopbackHost, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fake Emby server did not bind");
  return `http://${loopbackHost}:${address.port}`;
}

async function closeServer(server) {
  if (!server) return;
  server.closeAllConnections?.();
  await new Promise((resolve) => {
    server.close(() => resolve());
    setTimeout(resolve, 1500);
  });
}

async function getPageTarget(remotePort, devServerUrl, electronChild) {
  let lastTargets = [];
  const target = await waitFor(
    async () => {
      if (electronChild.exitCode != null) throw new Error(`Electron exited early with code ${electronChild.exitCode}`);
      const response = await fetch(`http://${loopbackHost}:${remotePort}/json/list`);
      if (!response.ok) return false;
      const targets = await response.json();
      lastTargets = Array.isArray(targets) ? targets : [];
      return lastTargets.find((item) => item.type === "page" && String(item.url ?? "").startsWith(devServerUrl)) ?? false;
    },
    { timeoutMs: 35_000, intervalMs: 200, label: "Electron CDP page target" },
  ).catch((error) => {
    error.targetSummary = lastTargets.map(({ id, type, url, title }) => ({ id, type, url, title }));
    throw error;
  });
  return { target, summary: lastTargets.map(({ id, type, url, title }) => ({ id, type, url, title })) };
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
  ws.__hillsCdpHandlers = new Set();
  ws.addEventListener("message", async (event) => {
    let message;
    try { message = JSON.parse(await cdpMessageText(event)); } catch { return; }
    if (message.id != null && ws.__hillsCdpPending.has(message.id)) {
      const pending = ws.__hillsCdpPending.get(message.id);
      ws.__hillsCdpPending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`${pending.method}: ${JSON.stringify(message.error)}`));
      else pending.resolve(message.result);
      return;
    }
    for (const handler of ws.__hillsCdpHandlers) handler(message);
  });
  ws.addEventListener("close", () => {
    for (const pending of ws.__hillsCdpPending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`${pending.method}: CDP websocket closed`));
    }
    ws.__hillsCdpPending.clear();
  });
}

async function openCdp(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  ensureCdpDispatch(ws);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("CDP websocket open timeout")), 10_000);
    ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP websocket error")); }, { once: true });
  });
  return ws;
}

async function cdpCall(ws, method, params = {}) {
  ensureCdpDispatch(ws);
  const id = cdpCall.nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.__hillsCdpPending.delete(id);
      reject(new Error(`${method} timeout`));
    }, 30_000);
    ws.__hillsCdpPending.set(id, { method, resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
cdpCall.nextId = 1;

async function cdpEval(ws, expression) {
  const result = await cdpCall(ws, "Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? JSON.stringify(result.exceptionDetails);
    throw new Error(`Runtime.evaluate failed: ${description}`);
  }
  return result.result?.value ?? null;
}

async function cdpClick(ws, point) {
  await cdpCall(ws, "Page.bringToFront");
  for (const event of [
    { type: "mouseMoved", buttons: 0 },
    { type: "mousePressed", buttons: 1 },
    { type: "mouseReleased", buttons: 0 },
  ]) {
    await cdpCall(ws, "Input.dispatchMouseEvent", { ...event, x: point.x, y: point.y, button: "left", clickCount: 1 });
  }
}

async function clickSelector(ws, selector) {
  const point = await cdpEval(ws, `(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return null;
    node.scrollIntoView({ block: "center", inline: "center" });
    const rect = node.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return hit && (hit === node || node.contains(hit)) ? { x, y } : null;
  })()`);
  if (!point) throw new Error(`click target is missing, hidden, or covered: ${selector}`);
  await cdpClick(ws, point);
}

function installRendererErrorMonitor(ws) {
  const exceptions = new Map();
  const javascriptLogErrors = [];
  ws.__hillsCdpHandlers.add((message) => {
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params?.exceptionDetails ?? {};
      const id = details.exceptionId ?? `${Date.now()}:${exceptions.size}`;
      exceptions.set(id, {
        text: details.exception?.description ?? details.text ?? "renderer exception",
        url: details.url ?? null,
        lineNumber: details.lineNumber ?? null,
        columnNumber: details.columnNumber ?? null,
      });
    } else if (message.method === "Runtime.exceptionRevoked") {
      exceptions.delete(message.params?.exceptionId);
    } else if (message.method === "Log.entryAdded") {
      const entry = message.params?.entry;
      if (entry?.level === "error" && entry?.source === "javascript") {
        javascriptLogErrors.push({ text: entry.text, url: entry.url ?? null, lineNumber: entry.lineNumber ?? null });
      }
    }
  });
  return { exceptions, javascriptLogErrors };
}

async function prepareRenderer(ws) {
  await cdpCall(ws, "Runtime.enable");
  await cdpCall(ws, "Page.enable");
  await cdpCall(ws, "Log.enable");
  await cdpCall(ws, "Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const describe = (value) => {
        try {
          if (value instanceof Error) return value.stack || value.message || String(value);
          if (typeof value === "string") return value;
          return JSON.stringify(value);
        } catch { return String(value); }
      };
      window.__hillsSmokeUnhandled = [];
      window.addEventListener("error", (event) => {
        window.__hillsSmokeUnhandled.push({
          type: "error",
          message: event.message || describe(event.error),
          filename: event.filename || null,
          lineno: event.lineno || null,
          colno: event.colno || null,
        });
      }, true);
      window.addEventListener("unhandledrejection", (event) => {
        window.__hillsSmokeUnhandled.push({ type: "unhandledrejection", message: describe(event.reason) });
      });
    })();`,
  });
  await cdpCall(ws, "Page.reload", { ignoreCache: true });
  await waitFor(
    () => cdpEval(ws, `Boolean(document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router)`),
    { timeoutMs: 30_000, intervalMs: 150, label: "Vue renderer bootstrap" },
  );
}

async function readPlaybackEvents(playbackLogPath) {
  try {
    const text = await fsp.readFile(playbackLogPath, "utf8");
    return text.split(/\r?\n/).filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return { event: "unparsed", line }; }
    });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function eventDetails(event) {
  return event?.details ?? event?.payload ?? {};
}

async function requestGracefulStop(ws) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  await cdpEval(ws, `(async () => {
    if (!window.hillsLite) return false;
    await window.hillsLite.invoke("stop", {});
    return true;
  })()`);
}

async function terminateProcessTree(child, label) {
  if (!child?.pid || child.exitCode != null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), wait(3000)]);
  if (child.exitCode == null && child.signalCode == null) throw new Error(`${label} process tree did not exit`);
}

async function safeRemoveTempDir(tmpDir) {
  const resolved = path.resolve(tmpDir);
  const tempRoot = `${path.resolve(os.tmpdir())}${path.sep}`;
  if (!resolved.startsWith(tempRoot) || !path.basename(resolved).startsWith("hills-lite-home-hero-")) {
    throw new Error(`refusing to remove unexpected temp path: ${resolved}`);
  }
  await fsp.rm(resolved, { recursive: true, force: true });
  return !fs.existsSync(resolved);
}

function summarizeRequests(requests) {
  return requests.map(({ method, pathname, responseStatus, range }) => ({ method, pathname, responseStatus, range }));
}

async function runSmoke() {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "hills-lite-home-hero-"));
  const userDataDir = path.join(tmpDir, "user-data");
  const playbackLogPath = path.join(userDataDir, "playback.log");
  let devServer = null;
  let fake = null;
  let electronChild = null;
  let electronOutput = { stdout: "", stderr: "" };
  let ws = null;
  let remotePort = null;
  let targetSummary = [];
  let selectedTarget = null;
  let rendererMonitor = null;
  let result = null;
  let failure = null;
  const cleanupErrors = [];

  try {
    await fsp.mkdir(userDataDir, { recursive: true });
    devServer = await startDevServer();
    fake = createFakeEmbyServer();
    const fakeBaseUrl = await listen(fake.server);
    remotePort = await reservePort();

    if (!fs.existsSync(electronPath)) throw new Error(`Electron executable not found: ${electronPath}`);
    electronChild = spawn(electronPath, [`--remote-debugging-port=${remotePort}`, "electron/main.mjs"], {
      cwd: projectDir,
      env: {
        ...process.env,
        HILLS_ELECTRON_DEV_SERVER_URL: devServer.url,
        HILLS_ELECTRON_DISABLE_GPU: "1",
        HILLS_ELECTRON_OPEN_DEVTOOLS: "0",
        HILLS_ELECTRON_USER_DATA_DIR: userDataDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    electronOutput = captureChildOutput(electronChild);

    const targetResult = await getPageTarget(remotePort, devServer.url, electronChild);
    targetSummary = targetResult.summary;
    selectedTarget = {
      id: targetResult.target.id,
      type: targetResult.target.type,
      url: targetResult.target.url,
      title: targetResult.target.title,
    };
    ws = await openCdp(targetResult.target.webSocketDebuggerUrl);
    rendererMonitor = installRendererErrorMonitor(ws);
    await prepareRenderer(ws);

    const failures = [];
    const expect = (condition, message) => { if (!condition) failures.push(message); };

    const ipcProbe = await cdpEval(ws, `(async () => {
      const bridge = window.hillsLite;
      let listenCalls = 0;
      const unlisten = bridge?.listen?.("window:maximized", () => { listenCalls += 1; });
      const unlistenType = typeof unlisten;
      if (typeof unlisten === "function") unlisten();
      const platform = await bridge?.platformType?.();
      const servers = await bridge?.invoke?.("list_servers", {});
      const standalone = await bridge?.invoke?.("standalone_player_available", {});
      return {
        bridge: {
          exists: Boolean(bridge),
          invoke: typeof bridge?.invoke,
          listen: typeof bridge?.listen,
          openFileDialog: typeof bridge?.openFileDialog,
          platformType: typeof bridge?.platformType,
          unlistenType,
          listenCalls,
        },
        sandbox: {
          requireType: typeof window.require,
          processType: typeof window.process,
          moduleType: typeof window.module,
        },
        platform,
        initialServerCount: Array.isArray(servers) ? servers.length : null,
        standaloneAvailable: Boolean(standalone?.available),
      };
    })()`);

    expect(ipcProbe.bridge.exists, "preload bridge window.hillsLite is missing");
    for (const method of ["invoke", "listen", "openFileDialog", "platformType"]) {
      expect(ipcProbe.bridge[method] === "function", `preload bridge ${method} is unavailable`);
    }
    expect(ipcProbe.bridge.unlistenType === "function", "preload listen did not return an unsubscribe function");
    expect(ipcProbe.platform === "windows", `platform IPC returned ${ipcProbe.platform}`);
    expect(ipcProbe.initialServerCount === 0, `isolated userData was not empty: ${ipcProbe.initialServerCount}`);
    expect(ipcProbe.sandbox.requireType === "undefined", "sandbox exposed window.require");
    expect(ipcProbe.sandbox.processType === "undefined", "sandbox exposed window.process");
    expect(ipcProbe.sandbox.moduleType === "undefined", "sandbox exposed window.module");

    const setup = await cdpEval(ws, `(async () => {
      const { useAuthStore } = await import("/src/stores/auth.ts");
      const { useLibraryStore } = await import("/src/stores/library.ts");
      const { useServerStore } = await import("/src/stores/server.ts");
      const { useSettingsStore } = await import("/src/stores/settings.ts");
      const auth = useAuthStore();
      const lib = useLibraryStore();
      const serverStore = useServerStore();
      const settings = useSettingsStore();
      const router = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      if (!router) throw new Error("mounted Vue router not found");
      await settings.update({ closeToTray: false, heroStyle: "cinema" });
      const detected = await serverStore.detectServer({
        defaultUserAgent: null,
        lines: [{
          id: "home-line",
          name: "Smoke Loopback",
          baseUrl: ${JSON.stringify("__FAKE_BASE_URL__")},
          userAgent: null,
          headers: [],
          priority: 0,
          enabled: true,
        }],
      });
      const server = await serverStore.addServer({
        name: detected.serverName || "Home Hero Smoke",
        kind: detected.kind,
        activeLineId: detected.winningLineId,
        defaultUserAgent: null,
        lines: [{
          id: "home-line",
          name: "Smoke Loopback",
          baseUrl: ${JSON.stringify("__FAKE_BASE_URL__")},
          userAgent: null,
          headers: [],
          priority: 0,
          enabled: true,
        }],
      });
      const login = await auth.login({ serverId: server.id, username: "home", password: "smoke-password" });
      lib.reset();
      await router.push("/home");
      await lib.refreshHome();
      return {
        route: router.currentRoute.value.fullPath,
        detected,
        server: {
          id: server.id,
          name: server.name,
          kind: server.kind,
          activeLineId: server.activeLineId,
          baseUrl: server.lines[0]?.baseUrl ?? null,
        },
        accountId: auth.activeId,
        loginAccountId: login?.account?.id ?? null,
        heroItems: lib.heroItems.length,
        views: lib.views.length,
      };
    })()`.replaceAll("__FAKE_BASE_URL__", fakeBaseUrl));

    await waitFor(
      () => cdpEval(ws, `(() => {
        const hero = document.querySelector(".home .hero");
        const title = hero?.querySelector(".hero__title")?.textContent ?? "";
        const image = hero?.querySelector(".hero__bg img");
        return Boolean(hero && title.includes(${JSON.stringify(heroMovie.Name)}) && image?.complete && image.naturalWidth > 0);
      })()`),
      { timeoutMs: 20_000, intervalMs: 150, label: "home hero render" },
    );

    const home = await cdpEval(ws, `(() => {
      const router = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      const hero = document.querySelector(".home .hero");
      const rect = hero?.getBoundingClientRect();
      const image = hero?.querySelector(".hero__bg img");
      const logo = hero?.querySelector(".hero__logo");
      const navButtons = Array.from(document.querySelectorAll(".app-sidebar .nav-btn"));
      return {
        route: router?.currentRoute.value.fullPath ?? null,
        hero: rect ? { width: rect.width, height: rect.height } : null,
        heroClass: hero?.className ?? "",
        title: hero?.querySelector(".hero__title")?.textContent?.trim() ?? "",
        description: hero?.querySelector(".hero__desc")?.textContent?.trim() ?? "",
        actions: Array.from(hero?.querySelectorAll(".hero__actions button") ?? [])
          .map((node) => node.textContent?.replace(/\\s+/g, " ").trim()).filter(Boolean),
        backdrop: image ? { src: image.currentSrc || image.src || "", complete: image.complete, naturalWidth: image.naturalWidth } : null,
        logo: logo ? { complete: logo.complete, naturalWidth: logo.naturalWidth, loadedClass: logo.classList.contains("loaded") } : null,
        sidebarVisible: Boolean(document.querySelector(".app-sidebar")),
        topbarVisible: Boolean(document.querySelector(".topbar")),
        navLabels: navButtons.map((node) => node.textContent?.replace(/\\s+/g, " ").trim()).filter(Boolean),
        activeNav: navButtons.find((node) => node.classList.contains("active"))?.textContent?.replace(/\\s+/g, " ").trim() ?? null,
        libraryVisible: Array.from(document.querySelectorAll(".row-section h2")).some((node) => node.textContent?.trim() === "媒体库"),
        errorTexts: Array.from(document.querySelectorAll(".toast--error, .empty--error"))
          .map((node) => node.textContent?.replace(/\\s+/g, " ").trim()).filter(Boolean),
      };
    })()`);

    expect(setup.route === "/home", `setup ended on ${setup.route}`);
    expect(setup.detected?.kind === "emby", `server detection returned ${setup.detected?.kind}`);
    expect(setup.detected?.serverName === "Home Hero Smoke", `server detection name returned ${setup.detected?.serverName}`);
    expect(setup.detected?.winningLineId === "home-line", "server detection lost the temporary line");
    expect(setup.server?.baseUrl === fakeBaseUrl, `saved server URL drifted: ${setup.server?.baseUrl}`);
    expect(Boolean(setup.accountId), "login did not activate an account");
    expect(setup.heroItems >= 1, "home store has no hero items");
    expect(setup.views >= 1, "home store has no library views");
    expect(home.route === "/home", `home route is ${home.route}`);
    expect(home.hero?.width > 0 && home.hero?.height > 0, "home hero is missing or not visible");
    expect(home.heroClass.includes("hero--cinema"), `home hero style is ${home.heroClass}`);
    expect(home.title.includes(heroMovie.Name), `home hero title is ${home.title}`);
    expect(home.description.includes("playback request"), "home hero overview is missing");
    expect(home.actions.includes("播放") && home.actions.includes("详情"), `home actions are ${home.actions.join(", ")}`);
    expect(
      /^hills-image:\/\/media\d*\//.test(home.backdrop?.src ?? "") && home.backdrop?.complete && home.backdrop?.naturalWidth > 0,
      `home backdrop did not load through the Electron image protocol: ${JSON.stringify(home.backdrop)}`,
    );
    expect(home.logo?.complete && home.logo?.naturalWidth > 0 && home.logo?.loadedClass, `home logo did not decode: ${JSON.stringify(home.logo)}`);
    expect(home.sidebarVisible && home.topbarVisible, "home navigation shell is not visible");
    for (const label of ["首页", "收藏", "历史", "设置"]) expect(home.navLabels.includes(label), `home navigation is missing ${label}`);
    expect(home.activeNav === "首页", `active home navigation is ${home.activeNav}`);
    expect(home.libraryVisible, "home media-library navigation row is missing");
    expect(home.errorTexts.length === 0, `home rendered errors: ${home.errorTexts.join(" | ")}`);

    await clickSelector(ws, ".home .hero__detail");
    await waitFor(
      () => cdpEval(ws, `(() => {
        const router = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
        return router?.currentRoute.value.fullPath.startsWith("/item/hero-movie") &&
          document.querySelector(".detail .hero__title")?.textContent?.includes(${JSON.stringify(heroMovie.Name)});
      })()`),
      { timeoutMs: 20_000, intervalMs: 150, label: "hero detail navigation" },
    );

    await waitFor(
      () => cdpEval(ws, `(() => {
        const image = document.querySelector(".detail .hero__bg img");
        return Boolean(document.querySelector("#hero-media-source option[value='source-alt']") && image?.complete && image.naturalWidth > 0);
      })()`),
      { timeoutMs: 15_000, intervalMs: 150, label: "detail playback controls" },
    );

    const detail = await cdpEval(ws, `(() => {
      const router = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      const image = document.querySelector(".detail .hero__bg img");
      const mediaSelect = document.querySelector("#hero-media-source");
      const audioSelect = document.querySelector("#hero-audio-source");
      const subtitleSelect = document.querySelector("#hero-subtitle-source");
      const playButton = document.querySelector(".detail .hero__play");
      return {
        route: router?.currentRoute.value.fullPath ?? null,
        title: document.querySelector(".detail .hero__title")?.textContent?.trim() ?? "",
        overview: document.querySelector(".overview-block")?.textContent?.replace(/\\s+/g, " ").trim() ?? "",
        appSidebarVisible: Boolean(document.querySelector(".app-sidebar")),
        topbarVisible: Boolean(document.querySelector(".topbar")),
        panelVisible: Boolean(document.querySelector(".hero__playback-panel")),
        mediaOptions: Array.from(mediaSelect?.options ?? []).map((option) => ({ value: option.value, label: option.textContent?.trim() ?? "" })),
        audioOptionCount: audioSelect?.options.length ?? 0,
        subtitleOptionCount: subtitleSelect?.options.length ?? 0,
        playText: playButton?.textContent?.replace(/\\s+/g, " ").trim() ?? "",
        playDisabled: Boolean(playButton?.disabled),
        actionError: document.querySelector(".hero__action-error")?.textContent?.trim() ?? null,
        backdrop: image ? { src: image.currentSrc || image.src || "", complete: image.complete, naturalWidth: image.naturalWidth } : null,
      };
    })()`);

    expect(detail.route?.startsWith("/item/hero-movie"), `detail route is ${detail.route}`);
    expect(detail.title.includes(heroMovie.Name), `detail title is ${detail.title}`);
    expect(detail.overview.includes("playback request"), "detail overview is missing");
    expect(!detail.appSidebarVisible && !detail.topbarVisible, "detail did not enter the fullscreen shell");
    expect(detail.panelVisible, "detail playback panel is missing");
    expect(
      detail.mediaOptions.some((option) => option.value === "source-main") && detail.mediaOptions.some((option) => option.value === "source-alt"),
      `detail media-source options are ${JSON.stringify(detail.mediaOptions)}`,
    );
    expect(detail.audioOptionCount >= 1, "detail audio selector is empty");
    expect(detail.subtitleOptionCount >= 2, "detail subtitle selector is missing off/subtitle choices");
    expect(detail.playText === "播放" && !detail.playDisabled, `detail play button is ${detail.playText}`);
    expect(!detail.actionError, `detail showed an action error before play: ${detail.actionError}`);
    expect(
      /^hills-image:\/\/media\d*\//.test(detail.backdrop?.src ?? "") && detail.backdrop?.complete && detail.backdrop?.naturalWidth > 0,
      `detail backdrop did not load through the Electron image protocol: ${JSON.stringify(detail.backdrop)}`,
    );

    const selectedMediaSource = await cdpEval(ws, `(() => {
      const select = document.querySelector("#hero-media-source");
      if (!select) return null;
      select.value = "source-alt";
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return select.value;
    })()`);
    expect(selectedMediaSource === "source-alt", `failed to select alternate media source: ${selectedMediaSource}`);
    await wait(150);

    const playbackInfoCountBefore = fake.state.playbackInfoRequests.length;
    await clickSelector(ws, ".detail .hero__play");
    await waitFor(() => fake.state.playbackInfoRequests.length > playbackInfoCountBefore, {
      timeoutMs: 15_000,
      intervalMs: 50,
      label: "PlaybackInfo request",
    });

    const playbackState = await waitFor(
      async () => {
        const value = await cdpEval(ws, `(async () => {
          const { usePlayerStore } = await import("/src/stores/player.ts");
          const player = usePlayerStore();
          const router = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
          return {
            route: router?.currentRoute.value.fullPath ?? null,
            itemId: player.itemId,
            playSessionId: player.playSessionId,
            mediaSourceId: player.playbackSource?.mediaSourceId ?? null,
            playMethod: player.playbackSource?.playMethod ?? null,
            actionError: document.querySelector(".hero__action-error")?.textContent?.trim() ?? null,
            playDisabled: Boolean(document.querySelector(".detail .hero__play")?.disabled),
          };
        })()`);
        return value.playSessionId ? value : false;
      },
      { timeoutMs: 20_000, intervalMs: 100, label: "renderer playback state" },
    );

    await waitFor(() => fake.state.streamRequests.length > 0, {
      timeoutMs: 10_000,
      intervalMs: 50,
      label: "playback stream Range probe",
    });

    const playbackEvents = await waitFor(
      async () => {
        const events = await readPlaybackEvents(playbackLogPath);
        return events.some((event) => event.event === "play_source_ready") ? events : false;
      },
      { timeoutMs: 10_000, intervalMs: 100, label: "playback log source-ready event" },
    );

    const playbackRequest = fake.state.playbackInfoRequests.at(-1);
    const playRequestStart = playbackEvents.find((event) => event.event === "play_request_start");
    const playSourceReady = playbackEvents.find((event) => event.event === "play_source_ready");

    expect(playbackRequest?.method === "POST", "detail play did not POST PlaybackInfo");
    expect(playbackRequest?.query?.UserId === "home-user", "PlaybackInfo lost the active Emby user");
    expect(playbackRequest?.query?.IsPlayback === "true", "PlaybackInfo did not declare IsPlayback");
    expect(playbackRequest?.query?.EnableTranscoding === "false", "PlaybackInfo unexpectedly enabled server transcoding");
    expect(playbackRequest?.body?.IsPlayback === true, "PlaybackInfo body did not declare IsPlayback");
    expect(playbackRequest?.body?.EnableTranscoding === false, "PlaybackInfo body unexpectedly enabled server transcoding");
    expect(
      Array.isArray(playbackRequest?.body?.DeviceProfile?.TranscodingProfiles) && playbackRequest.body.DeviceProfile.TranscodingProfiles.length === 0,
      "PlaybackInfo device profile is not direct-only",
    );
    expect(playbackState.route?.startsWith("/item/hero-movie"), `standalone play navigated to ${playbackState.route}`);
    expect(playbackState.itemId === "hero-movie", `player store item is ${playbackState.itemId}`);
    expect(playbackState.playSessionId === "play-session-smoke", `player session is ${playbackState.playSessionId}`);
    expect(playbackState.mediaSourceId === "source-alt", `selected source is ${playbackState.mediaSourceId}`);
    expect(playbackState.playMethod === "DirectPlay", `play method is ${playbackState.playMethod}`);
    expect(!playbackState.actionError, `detail play surfaced an action error: ${playbackState.actionError}`);
    expect(eventDetails(playRequestStart).mediaSourceId === "source-alt", "main process play request lost source-alt");
    expect(eventDetails(playSourceReady).mediaSourceId === "source-alt", "main process resolved the wrong source");
    expect(
      fake.state.streamRequests.some((entry) => entry.range === "bytes=0-1" && entry.responseStatus === 206),
      `playback stream did not pass the Range probe: ${JSON.stringify(summarizeRequests(fake.state.streamRequests))}`,
    );

    const stopState = await cdpEval(ws, `(async () => {
      const { usePlayerStore } = await import("/src/stores/player.ts");
      const player = usePlayerStore();
      await player.stop();
      const embed = await window.hillsLite.invoke("get_embed_state", {});
      const router = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      return {
        route: router?.currentRoute.value.fullPath ?? null,
        itemId: player.itemId,
        playSessionId: player.playSessionId,
        playbackSource: player.playbackSource,
        hillsPlayerRunning: Boolean(embed?.hillsPlayerRunning),
      };
    })()`);

    expect(stopState.route?.startsWith("/item/hero-movie"), `stop changed the detail route: ${stopState.route}`);
    expect(stopState.itemId == null && stopState.playSessionId == null, "player store did not clear after stop");
    expect(stopState.playbackSource == null, "player playback source did not clear after stop");
    expect(!stopState.hillsPlayerRunning, "standalone player was still running after stop");

    await wait(400);
    const unhandled = await cdpEval(ws, `window.__hillsSmokeUnhandled ?? []`);
    const activeExceptions = [...rendererMonitor.exceptions.values()];
    const javascriptLogErrors = rendererMonitor.javascriptLogErrors;
    const failedMockRequests = fake.state.requests.filter((entry) => entry.responseStatus == null || entry.responseStatus >= 400);

    expect(unhandled.length === 0, `renderer window errors: ${JSON.stringify(unhandled)}`);
    expect(activeExceptions.length === 0, `renderer CDP exceptions: ${JSON.stringify(activeExceptions)}`);
    expect(javascriptLogErrors.length === 0, `renderer JavaScript log errors: ${JSON.stringify(javascriptLogErrors)}`);
    expect(
      fake.state.unhandledRequests.length === 0,
      `mock API missed requests: ${JSON.stringify(summarizeRequests(fake.state.unhandledRequests))}`,
    );
    expect(
      failedMockRequests.length === 0,
      `mock API returned failures: ${JSON.stringify(summarizeRequests(failedMockRequests))}`,
    );

    if (failures.length > 0) throw new Error(`home hero smoke failed:\n- ${failures.join("\n- ")}`);

    result = {
      ok: true,
      coverage: {
        sandboxPreloadIpc: true,
        homeHeroAndNavigation: true,
        detailNavigation: true,
        playbackRequest: true,
        rendererUnhandledErrors: true,
      },
      ports: {
        vite: Number(new URL(devServer.url).port),
        fakeEmby: Number(new URL(fakeBaseUrl).port),
        cdp: remotePort,
      },
      devServerOwned: devServer.owned,
      ipcProbe,
      setup,
      home,
      detail,
      playback: {
        state: playbackState,
        playbackInfo: {
          method: playbackRequest.method,
          pathname: playbackRequest.pathname,
          query: playbackRequest.query,
          requestedMediaSourceId: eventDetails(playRequestStart).mediaSourceId ?? null,
          resolvedMediaSourceId: eventDetails(playSourceReady).mediaSourceId ?? null,
        },
        streamRequests: summarizeRequests(fake.state.streamRequests),
        stopped: stopState,
      },
      requestCount: fake.state.requests.length,
    };
  } catch (error) {
    failure = error;
  } finally {
    let playbackLogTail = "";
    try { playbackLogTail = (await fsp.readFile(playbackLogPath, "utf8")).slice(-8000); } catch {}

    try { await requestGracefulStop(ws); } catch (error) { cleanupErrors.push(`renderer stop: ${error.message ?? String(error)}`); }
    try { if (ws && ws.readyState === WebSocket.OPEN) ws.close(); } catch (error) { cleanupErrors.push(`CDP close: ${error.message ?? String(error)}`); }
    try { await terminateProcessTree(electronChild, "Electron"); } catch (error) { cleanupErrors.push(error.message ?? String(error)); }
    try { await closeServer(fake?.server); } catch (error) { cleanupErrors.push(`fake Emby close: ${error.message ?? String(error)}`); }
    try { if (devServer?.owned) await terminateProcessTree(devServer.child, "Vite"); } catch (error) { cleanupErrors.push(error.message ?? String(error)); }

    let tempRemoved = false;
    try {
      tempRemoved = await safeRemoveTempDir(tmpDir);
      if (!tempRemoved) cleanupErrors.push(`temporary directory still exists: ${tmpDir}`);
    } catch (error) {
      cleanupErrors.push(`temp cleanup: ${error.message ?? String(error)}`);
    }

    if (cleanupErrors.length > 0 && !failure) {
      failure = new Error(`home hero smoke cleanup failed:\n- ${cleanupErrors.join("\n- ")}`);
    }
    if (failure) {
      console.error(`home hero smoke diagnostic:\n${JSON.stringify({
        ok: false,
        error: failure.stack ?? failure.message ?? String(failure),
        cleanupErrors,
        tempRemoved,
        ports: {
          vite: devServer?.url ? Number(new URL(devServer.url).port) : null,
          fakeEmby: fake?.server?.address?.()?.port ?? null,
          cdp: remotePort,
        },
        selectedTarget,
        targetSummary: failure.targetSummary ?? targetSummary,
        renderer: rendererMonitor ? {
          exceptions: [...rendererMonitor.exceptions.values()],
          javascriptLogErrors: rendererMonitor.javascriptLogErrors,
        } : null,
        mockRequests: fake ? summarizeRequests(fake.state.requests) : [],
        electron: {
          pid: electronChild?.pid ?? null,
          exitCode: electronChild?.exitCode ?? null,
          signalCode: electronChild?.signalCode ?? null,
          stdout: electronOutput.stdout.slice(-8000),
          stderr: electronOutput.stderr.slice(-8000),
        },
        vite: devServer ? {
          owned: devServer.owned,
          stdout: devServer.output.stdout.slice(-4000),
          stderr: devServer.output.stderr.slice(-4000),
        } : null,
        playbackLogTail,
      }, null, 2)}`);
    } else {
      result.cleanup = {
        tempRemoved,
        electronExited: electronChild?.exitCode != null || electronChild?.signalCode != null,
        viteExited: !devServer?.owned || devServer.child?.exitCode != null || devServer.child?.signalCode != null,
        fakeServerClosed: !fake?.server?.listening,
      };
    }
  }

  if (failure) throw failure;
  return result;
}

try {
  const result = await runSmoke();
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
}
