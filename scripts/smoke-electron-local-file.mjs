import { spawn, spawnSync } from "node:child_process";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const devServerUrl = process.env.HILLS_SMOKE_DEV_SERVER_URL ?? "http://127.0.0.1:1420";
const remotePort = Number(process.env.HILLS_SMOKE_CDP_PORT ?? 9352);
const tmpDir = path.join(os.tmpdir(), `hills-lite-local-file-${Date.now()}`);
const userDataDir = path.join(tmpDir, "user-data");
const videoPath = path.join(tmpDir, "sample-local-file.mp4");

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

function analyzePng(imagePath) {
  const script = `
    Add-Type -AssemblyName System.Drawing
    $bmp = New-Object System.Drawing.Bitmap(${JSON.stringify(imagePath)})
    $total = 0
    $bright = 0
    $colorful = 0
    $x0 = [Math]::Floor($bmp.Width * 0.18)
    $x1 = [Math]::Floor($bmp.Width * 0.82)
    $y0 = [Math]::Floor($bmp.Height * 0.18)
    $y1 = [Math]::Floor($bmp.Height * 0.82)
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
  "sine=frequency=550:sample_rate=48000",
  "-t",
  "8",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-shortest",
  videoPath,
]);

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
        bounds: { left: 80, top: 80, width: 1280, height: 800, windowState: "normal" },
      }),
    )
    .catch(() => {});

  const startResult = await cdpEval(ws, `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      await wait(1200);
      const { usePlayerStore } = await import("/src/stores/player.ts");
      const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      if (!appRouter) throw new Error("mounted Vue router not found");
      await appRouter.push({
        name: "player",
        params: { id: "local-file" },
        query: { file: ${JSON.stringify(videoPath)} },
      });
      await wait(7000);
      const state = await window.hillsLite.invoke("get_state");
      let mpvScreenshot = null;
      let mpvScreenshotError = null;
      try {
        mpvScreenshot = await window.hillsLite.invoke("take_screenshot", {
          payload: { title: "local-file-smoke", includeSubtitles: true },
        });
      } catch (error) {
        mpvScreenshotError = error?.message ?? String(error);
      }
      const player = usePlayerStore();
      const titleText =
        document.querySelector(".player__title")?.textContent?.replace(/\\s+/g, " ").trim() ?? "";
      return {
        routeStartsLocal: appRouter.currentRoute.value.fullPath.startsWith("/player/local-file"),
        titleText,
        bodyText: document.body.textContent?.replace(/\\s+/g, " ").trim().slice(0, 500) ?? "",
        localFileTitle: player.localFileTitle,
        mpvScreenshot,
        mpvScreenshotError,
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

  const mpvPixels = startResult.mpvScreenshot?.filePath
    ? analyzePng(startResult.mpvScreenshot.filePath)
    : null;

  await cdpEval(ws, `
    (async () => {
      await window.hillsLite.invoke("stop").catch(() => {});
      await window.hillsLite.invoke("embed_set_visible", { visible: false }).catch(() => {});
      await window.hillsLite.invoke("embed_detach").catch(() => {});
      return true;
    })()
  `).catch(() => {});

  const expectedTitle = path.basename(videoPath);
  const uiTitleOk =
    startResult.titleText.includes(expectedTitle) && startResult.titleText.includes("本地文件");
  const ok =
    startResult.routeStartsLocal &&
    startResult.localFileTitle === expectedTitle &&
    startResult.state.durationMs > 0 &&
    startResult.state.trackCount >= 1 &&
    mpvPixels &&
    mpvPixels.brightRatio > 0.18 &&
    mpvPixels.colorfulRatio > 0.08;

  console.log(
    JSON.stringify(
      {
        ok,
        expectedTitle,
        routeStartsLocal: startResult.routeStartsLocal,
        uiTitleOk,
        titleText: startResult.titleText,
        localFileTitle: startResult.localFileTitle,
        state: startResult.state,
        mpvScreenshotOk: Boolean(startResult.mpvScreenshot?.filePath),
        mpvScreenshotError: startResult.mpvScreenshotError,
        mpvPixels,
        bodyText: startResult.bodyText,
      },
      null,
      2,
    ),
  );

  if (!ok) process.exitCode = 1;
} finally {
  ws?.close();
  child.kill();
  setTimeout(() => child.kill("SIGKILL"), 1000);
  if (process.env.HILLS_SMOKE_KEEP_ARTIFACTS !== "1") {
    await wait(1200);
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
