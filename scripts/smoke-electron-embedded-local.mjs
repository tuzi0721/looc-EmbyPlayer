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

function foregroundHillsWindow() {
  const script = `
    Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      public static class Win32 {
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
      }
"@
    $proc = Get-Process | Where-Object { $_.MainWindowTitle -eq "Hills Lite" } | Select-Object -First 1
    if ($proc -and $proc.MainWindowHandle -ne 0) {
      [Win32]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null
      [Win32]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
    }
  `;
  run("powershell", ["-NoProfile", "-Command", script]);
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
    $bmp.Dispose()
    [PSCustomObject]@{
      screenshotPath = ${JSON.stringify(screenshotPath)}
      total = $total
      bright = $bright
      colorful = $colorful
      brightRatio = if ($total -gt 0) { $bright / $total } else { 0 }
      colorfulRatio = if ($total -gt 0) { $colorful / $total } else { 0 }
    } | ConvertTo-Json -Compress
  `;
  const result = run("powershell", ["-NoProfile", "-Command", script]);
  return JSON.parse(result.stdout);
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
  await cdpCall(ws, "Browser.getWindowForTarget", { targetId: target.id })
    .then(({ windowId }) =>
      cdpCall(ws, "Browser.setWindowBounds", {
        windowId,
        bounds: { left: 40, top: 40, width: 1280, height: 800, windowState: "normal" },
      }),
    )
    .catch(() => {});

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
      const stage = document.querySelector(".player__stage")?.getBoundingClientRect();
      return {
        route: appRouter.currentRoute.value.fullPath,
        bodyText: document.body.innerText.slice(0, 800),
        bounds: { x: window.screenX, y: window.screenY, width: window.outerWidth, height: window.outerHeight },
        stage: stage ? { x: stage.x, y: stage.y, width: stage.width, height: stage.height } : null,
        state: {
          durationMs: state.durationMs,
          positionMs: state.positionMs,
          trackCount: Array.isArray(state.tracks) ? state.tracks.length : 0,
          paused: state.paused,
          eof: state.eof,
        },
      };
    })()
  `);

  foregroundHillsWindow();
  await wait(500);
  const pixels = captureAndAnalyze(startResult.bounds);

  await cdpEval(ws, `
    (async () => {
      await window.hillsLite.invoke("stop").catch(() => {});
      await window.hillsLite.invoke("embed_set_visible", { visible: false }).catch(() => {});
      await window.hillsLite.invoke("embed_detach").catch(() => {});
      return true;
    })()
  `).catch(() => {});

  const ok =
    startResult.route === `/player/${itemId}` &&
    startResult.state.durationMs > 0 &&
    startResult.state.trackCount >= 1 &&
    pixels.brightRatio > 0.18 &&
    pixels.colorfulRatio > 0.08;

  console.log(JSON.stringify({
    ok,
    screenshotPath,
    route: startResult.route,
    bodyText: startResult.bodyText,
    state: startResult.state,
    stage: startResult.stage,
    pixels,
  }, null, 2));

  if (!ok) process.exitCode = 1;
} finally {
  ws?.close();
  child.kill();
  setTimeout(() => child.kill("SIGKILL"), 1000);
  fakeServer.close();
  if (process.env.HILLS_SMOKE_KEEP_ARTIFACTS !== "1") {
    await wait(1200);
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
