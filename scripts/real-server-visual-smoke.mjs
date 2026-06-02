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
const tmpDir = path.join(os.tmpdir(), `hills-lite-real-visual-${Date.now()}`);
const userDataDir = path.join(tmpDir, "user-data");
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
  for (let index = 0; index < 90; index += 1) {
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
    $x0 = [Math]::Floor($bmp.Width * 0.18)
    $x1 = [Math]::Floor($bmp.Width * 0.82)
    $y0 = [Math]::Floor($bmp.Height * 0.16)
    $y1 = [Math]::Floor($bmp.Height * 0.74)
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

function pixelSampleOk(pixels) {
  return pixels && (pixels.brightRatio >= 0.18 || pixels.colorfulRatio >= 0.04);
}

async function readEmbedState(ws) {
  return cdpEval(ws, `
    (async () => {
      if (!window.hillsLite) return null;
      return window.hillsLite.invoke("get_embed_state");
    })()
  `);
}

function captureNativeWindowAndAnalyze(rootPid, windowHandle, name) {
  const pid = Number(rootPid) || 0;
  if (!pid) throw new Error("missing Electron process id for native window capture");
  const hwndValue = windowHandle == null ? "0" : String(windowHandle).replace(/[^\d]/g, "");
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
      public static class Win32 {
        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
        [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
        [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
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
    [Win32]::ShowWindow($hWnd, 5) | Out-Null
    [Win32]::SetWindowPos($hWnd, [IntPtr](-1), 0, 0, 0, 0, 0x0043) | Out-Null
    Start-Sleep -Milliseconds 220
    $rect = New-Object RECT
    if (-not [Win32]::GetWindowRect($hWnd, [ref]$rect)) {
      throw "failed to read native window rect"
    }
    $width = [Math]::Max(1, $rect.Right - $rect.Left)
    $height = [Math]::Max(1, $rect.Bottom - $rect.Top)
    if ($width -lt 16 -or $height -lt 16) {
      throw "native window has invalid capture bounds $($width)x$($height)"
    }
    $bmp = New-Object System.Drawing.Bitmap($width, $height)
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bmp.Size)
    $bmp.Save(${JSON.stringify(outputPath)}, [System.Drawing.Imaging.ImageFormat]::Png)
    $gfx.Dispose()
    $bmp.Dispose()
    [Win32]::SetWindowPos($hWnd, [IntPtr](-2), 0, 0, 0, 0, 0x0043) | Out-Null
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
      screenshotPath = ${JSON.stringify(outputPath)}
    } | ConvertTo-Json -Compress
  `;
  const result = run("powershell", ["-NoProfile", "-Command", script]);
  return { ...analyzePng(outputPath), windowInfo: JSON.parse(result.stdout.trim()) };
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

function metricsExpression() {
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
      const playerStage = rect(".player__stage");
      const playerBottom = rect(".player__bottom");
      const video = document.querySelector("video");
      const mpvState = !video && window.hillsLite
        ? await window.hillsLite.invoke("get_state").catch(() => null)
        : null;
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
        detailPanel: rect(".hero__playback-panel"),
        appSidebarVisible: Boolean(document.querySelector(".app-sidebar")),
        topbarVisible: Boolean(document.querySelector(".topbar")),
        posterCount: document.querySelectorAll(".poster, .history-card").length,
        loadedImageCount: document.querySelectorAll(".poster__art img.loaded, .history-card img.loaded").length,
        playerStage,
        playerBottom,
        playerControls: {
          top: rect(".player__top"),
          bottom: playerBottom,
          progress: rect(".progress, .bar, .player__progress"),
          seekBack: rect('[data-control="seek-back"]'),
          fullscreen: rect('[data-control="fullscreen"]'),
        },
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
        } : null,
        bodyTextLength: document.body.innerText.length,
      };
    })()
  `;
}

async function resizeAndInspect(ws, route, size, name) {
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
  const filePath = await capture(ws, name);
  const metrics = await cdpEvalAfterContextReset(ws, metricsExpression());
  return { size, screenshotPath: filePath, metrics };
}

async function waitForPlaybackVisualReady(ws) {
  let previousPosition = null;
  let lastMetrics = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
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
        waitedMs: (attempt + 1) * 250,
        advancing,
        state: {
          durationMs: state?.durationMs ?? 0,
          positionMs: state?.positionMs ?? 0,
          trackCount: state?.trackCount ?? null,
          hasVideoParams: Boolean(lastMetrics.mpvState?.videoParams || lastMetrics.htmlVideo?.videoWidth),
        },
      };
    }
  }
  const state = lastMetrics?.htmlVideo ?? lastMetrics?.mpvState;
  return {
    ready: false,
    waitedMs: 25000,
    advancing: false,
    state: state
      ? {
          durationMs: state.durationMs ?? 0,
          positionMs: state.positionMs ?? 0,
          trackCount: state.trackCount ?? null,
          hasVideoParams: Boolean(lastMetrics?.mpvState?.videoParams || lastMetrics?.htmlVideo?.videoWidth),
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

stage("dev-server-check", { devServerUrl, forceNativeMpv });
await ensureDevServer();
stage("dev-server-ready");
await fsp.mkdir(screenshotsDir, { recursive: true });

const electron = path.resolve("node_modules/electron/dist/electron.exe");
stage("electron-launch", { remotePort });
const child = spawn(electron, [`--remote-debugging-port=${remotePort}`, "electron/main.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HILLS_ELECTRON_DEV_SERVER_URL: devServerUrl,
    HILLS_ELECTRON_DISABLE_GPU: "1",
    HILLS_ELECTRON_OPEN_DEVTOOLS: "0",
    HILLS_ELECTRON_USER_DATA_DIR: userDataDir,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
const electronStdout = [];
const electronStderr = [];
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
  const targets = await getTargets();
  stage("cdp-targets-ready", { count: targets.length });
  const target =
    targets.find((item) => item.type === "page" && item.url.startsWith(devServerUrl)) ??
    targets.find((item) => item.type === "page");
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
  const setup = await cdpEval(ws, `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      await wait(1200);
      const { api } = await import("/src/api/index.ts");
      const { useAuthStore } = await import("/src/stores/auth.ts");
      const { useLibraryStore } = await import("/src/stores/library.ts");
      const { useServerStore } = await import("/src/stores/server.ts");
      const { useSettingsStore } = await import("/src/stores/settings.ts");
      const auth = useAuthStore();
      const lib = useLibraryStore();
      const serverStore = useServerStore();
      const settings = useSettingsStore();
      const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      if (!appRouter) throw new Error("mounted Vue router not found");
      await settings.update({ theme: "light" });
      const lines = [
        { id: "real-line-1", name: "Line 1", baseUrl: ${JSON.stringify(line1)}, userAgent: null, headers: [], priority: 0, enabled: true },
        { id: "real-line-2", name: "Line 2", baseUrl: ${JSON.stringify(line2)}, userAgent: null, headers: [], priority: 1, enabled: true },
      ];
      let detected = null;
      let detectError = null;
      try {
        detected = await serverStore.detectServer({ defaultUserAgent: null, lines });
      } catch (error) {
        detectError = error?.message ?? String(error);
      }
      const server = await serverStore.addServer({
        name: detected?.serverName || "Real Visual Smoke",
        kind: detected?.kind || "emby",
        activeLineId: detected?.winningLineId || "real-line-1",
        defaultUserAgent: null,
        lines,
      });
      const login = await auth.login({ serverId: server.id, username: ${JSON.stringify(username)}, password: ${JSON.stringify(password)} });
      lib.reset();
      await appRouter.push("/home");
      await lib.refreshHome();
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
        ...lib.resume,
        ...lib.heroItems.filter((item) => item.Type === "Movie" || item.Type === "Episode"),
        ...(mediaResp.Items ?? []),
      ];
      const seriesCandidates = [
        ...lib.heroItems.filter((item) => item.Type === "Series"),
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
        accountCount: auth.accounts.length,
        viewCount: lib.views.length,
        resumeCount: lib.resume.length,
        heroCount: lib.heroItems.length,
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
  `);
  stage("setup-complete", {
    viewCount: setup.viewCount,
    resumeCount: setup.resumeCount,
    heroCount: setup.heroCount,
    mediaSourceCount: setup.playbackSummary?.mediaSourceCount ?? null,
  });

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
    home.push(await resizeAndInspect(ws, "/home", size, `home-${size.width}x${size.height}`));
    stage("home-inspect-size", size);
  }

  const detail = [];
  const itemRoute = `/item/${setup.selected.id}`;
  stage("detail-inspect-start", { count: homeSizes.length });
  for (const size of homeSizes) {
    detail.push(await resizeAndInspect(ws, itemRoute, size, `detail-${size.width}x${size.height}`));
    stage("detail-inspect-size", size);
  }

  const seriesDetail = [];
  const seriesRoute = setup.series?.id ? `/item/${setup.series.id}` : null;
  if (seriesRoute) {
    stage("series-detail-inspect-start", { count: homeSizes.length });
    for (const size of homeSizes) {
      seriesDetail.push(await resizeAndInspect(ws, seriesRoute, size, `series-detail-${size.width}x${size.height}`));
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
  let playerNativeCapture = null;
  let playerVisiblePixels = playerPixels;
  if (!playerInitial.htmlVideo && playerInitial.mpvState) {
    try {
      const embedState = await readEmbedState(ws);
      const nativeWindowHandle = embedState?.mpvHostWindowHandle ?? embedState?.hwnd ?? null;
      playerNativeCapture = {
        embedState,
        capture: captureNativeWindowAndAnalyze(child.pid, nativeWindowHandle, "player-native-host"),
      };
      playerVisiblePixels = playerNativeCapture.capture;
      stage("player-native-captured", {
        hasHandle: Boolean(nativeWindowHandle),
        brightRatio: playerVisiblePixels.brightRatio,
        colorfulRatio: playerVisiblePixels.colorfulRatio,
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
  });

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
        return true;
      })()
    `);
    await wait(900);
    const exited = await cdpEvalAfterContextReset(ws, metricsExpression());
    fullscreen = { entered, exited };
    stage("fullscreen-complete");
  }

  const playerResizes = [];
  stage("player-resize-start");
  for (const size of [
    { width: 1366, height: 768 },
    { width: 960, height: 600 },
    { width: 760, height: 430 },
  ]) {
    playerResizes.push(await resizeAndInspect(ws, null, size, `player-${size.width}x${size.height}`));
    stage("player-resize-size", size);
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
    if (m.detailHero && m.detailHero.height < m.viewport.height * 0.88) {
      failures.push(`detail ${entry.size.width}x${entry.size.height}: hero does not fill viewport`);
    }
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
    if (m.detailHero && m.detailHero.height < m.viewport.height * 0.88) {
      failures.push(`series detail ${entry.size.width}x${entry.size.height}: hero does not fill viewport`);
    }
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
  const playerState = playerInitial.htmlVideo ?? playerInitial.mpvState;
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
  if (!pixelSampleOk(playerVisiblePixels)) failures.push("player screenshot is visually black/blank");
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
    if (!m.playerControls?.bottom || !m.playerControls?.fullscreen) {
      failures.push(`player ${entry.size.width}x${entry.size.height}: controls missing after resize`);
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
      visualReady: playerVisualReady,
      initial: playerInitial,
      seekBack,
      fullscreen,
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
