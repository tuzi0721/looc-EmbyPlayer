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
const forceNativeMpv = process.env.HILLS_SMOKE_NATIVE_MPV === "1";

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

function readJsonBody(req, callback) {
  let raw = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => {
    try {
      callback(raw.trim() ? JSON.parse(raw) : null, raw);
    } catch (error) {
      callback({ parseError: error?.message ?? String(error) }, raw);
    }
  });
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

const localDecodeContract = {
  playbackInfoRequests: [],
  streamRequests: [],
  playstateReports: [],
};

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
      readJsonBody(req, (body) => {
        localDecodeContract.playbackInfoRequests.push({
          query: Object.fromEntries(url.searchParams),
          body,
        });
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
      });
      return;
    }

    if (req.method === "GET" && pathname === `/Videos/${itemId}/stream`) {
      localDecodeContract.streamRequests.push({
        query: Object.fromEntries(url.searchParams),
      });
      serveVideo(req, res);
      return;
    }

    if (req.method === "POST" && pathname.startsWith("/Sessions/Playing/")) {
      readJsonBody(req, (body) => {
        localDecodeContract.playstateReports.push({
          path: pathname,
          body,
        });
        empty(res);
      });
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

function playbackStateExpression() {
  return `
    (async () => {
      const video = document.querySelector("video");
      if (video) {
        return {
          mode: "html",
          durationMs: Number.isFinite(video.duration) ? Math.floor(video.duration * 1000) : 0,
          positionMs: Math.floor(video.currentTime * 1000),
          trackCount: 0,
          speed: video.playbackRate,
          paused: video.paused,
          eof: video.ended,
          readyState: video.readyState,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
        };
      }
      if (!window.hillsLite) return null;
      const state = await window.hillsLite.invoke("get_state");
      return {
        mode: "mpv",
        durationMs: state.durationMs,
        positionMs: state.positionMs,
        trackCount: Array.isArray(state.tracks) ? state.tracks.length : 0,
        speed: state.speed,
        paused: state.paused,
        eof: state.eof,
        readyState: null,
        videoWidth: null,
        videoHeight: null,
      };
    })()
  `;
}

async function readEmbedState(ws) {
  return cdpEval(ws, `
    (async () => {
      if (!window.hillsLite) return null;
      return window.hillsLite.invoke("get_embed_state");
    })()
  `);
}

function embeddedRectOk(state, metrics) {
  if (!state || !metrics) return false;
  const rect = state.lastRect;
  if (!rect) return false;
  const topLimit = (metrics.top?.height ?? 0) - 1;
  const bottomLimit = (metrics.bottom?.y ?? metrics.viewport?.height ?? rect.y + rect.height) + 1;
  const rectOk =
    rect.width >= Math.max(1, (metrics.stage?.width ?? rect.width) - 2) &&
    rect.height >= 1 &&
    rect.y >= topLimit &&
    rect.y + rect.height <= bottomLimit;
  if (state.mode === "overlay") {
    return (
      state.attachCount >= 1 &&
      state.rectCount >= 1 &&
      state.visibleCount >= 1 &&
      state.lastVisible === true &&
      state.hasRect === true &&
      state.mpvRunning === true &&
      rectOk
    );
  }
  if (state.mode !== "wid") return false;
  const sameHandle = state.hwnd && state.mpvEmbedWindowHandle === state.hwnd;
  return (
    state.attachCount >= 1 &&
    state.rectCount >= 1 &&
    state.visibleCount >= 1 &&
    state.lastVisible === true &&
    state.hasProcess === true &&
    state.hasHwnd === true &&
    state.hasRect === true &&
    state.mpvRunning === true &&
    Boolean(sameHandle) &&
    rectOk
  );
}

function numbersClose(actual, expected, tolerance = 10) {
  return Math.abs((Number(actual) || 0) - (Number(expected) || 0)) <= tolerance;
}

function rectsClose(actual, expected, tolerance = 10) {
  if (!actual || !expected) return false;
  return (
    numbersClose(actual.x, expected.x, tolerance) &&
    numbersClose(actual.y, expected.y, tolerance) &&
    numbersClose(actual.width, expected.width, tolerance) &&
    numbersClose(actual.height, expected.height, tolerance)
  );
}

function expectedMpvHostBounds(state) {
  if (!state) return null;
  if (state.mpvHostBounds) return state.mpvHostBounds;
  if (!state.hostContentBounds || !state.lastRect) return null;
  return {
    x: Math.round(state.hostContentBounds.x + state.lastRect.x),
    y: Math.round(state.hostContentBounds.y + state.lastRect.y),
    width: Math.max(1, Math.round(state.lastRect.width)),
    height: Math.max(1, Math.round(state.lastRect.height)),
  };
}

function embeddedHostWindowBoundsOk(state, windowInfo) {
  if (!state || !windowInfo) return false;
  const expected = expectedMpvHostBounds(state);
  return Boolean(expected && rectsClose(windowInfo, expected, 12));
}

function embeddedNativeWindowHandle(state) {
  return state?.mpvHostWindowHandle ?? state?.hwnd ?? null;
}

function captureWindowAndAnalyze(processId, name = "embedded-local", windowHandle = null, options = {}) {
  const pid = Number(processId) || 0;
  if (!pid) throw new Error("missing Electron process id for window capture");
  const hwndValue = windowHandle == null ? "0" : String(windowHandle).replace(/[^\d]/g, "");
  const ownerHwndValue =
    options.ownerWindowHandle == null ? "0" : String(options.ownerWindowHandle).replace(/[^\d]/g, "");
  const outputPath = path.join(tmpDir, `${name}.png`);
  const script = `
    Add-Type -AssemblyName System.Windows.Forms
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
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
        [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);
        [DllImport("user32.dll", EntryPoint="GetWindowLongW")] private static extern int GetWindowLong32(IntPtr hWnd, int nIndex);
        public static IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex) {
          return IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, nIndex) : new IntPtr(GetWindowLong32(hWnd, nIndex));
        }
      }
"@
    $GWL_STYLE = -16
    $WS_CHILD = 0x40000000
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
        throw "Electron owner window handle $ownerRequestedHwnd belongs to process $ownerPid outside launched process tree $root"
      }
    }
    $requestedHwnd = ${JSON.stringify(hwndValue || "0")}
    if ($requestedHwnd -ne "0") {
      $hWnd = [IntPtr]::new([int64]$requestedHwnd)
      $windowPid = 0
      [Win32]::GetWindowThreadProcessId($hWnd, [ref]$windowPid) | Out-Null
      if (-not $ids.Contains([int]$windowPid)) {
        throw "Electron window handle $requestedHwnd belongs to process $windowPid outside launched process tree $root"
      }
      $rect = New-Object RECT
      if (-not [Win32]::GetWindowRect($hWnd, [ref]$rect)) {
        throw "failed to read Electron window rect for handle $requestedHwnd"
      }
      $width = $rect.Right - $rect.Left
      $height = $rect.Bottom - $rect.Top
      $length = [Win32]::GetWindowTextLength($hWnd)
      $titleBuilder = New-Object System.Text.StringBuilder([Math]::Max(1, $length + 1))
      [Win32]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity) | Out-Null
      $style = [Win32]::GetWindowLongPtr($hWnd, $GWL_STYLE).ToInt64()
      $proc = $procById[[int]$windowPid]
      $target = [PSCustomObject]@{
        hwnd = $hWnd.ToInt64()
        processId = [int]$windowPid
        processName = [string]$proc.Name
        commandLine = [string]$proc.CommandLine
        title = $titleBuilder.ToString()
        visible = [Win32]::IsWindowVisible($hWnd)
        isChild = (($style -band $WS_CHILD) -ne 0)
        x = $rect.Left
        y = $rect.Top
        width = $width
        height = $height
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
        if ($width -lt 200 -or $height -lt 120) { return $true }
        $length = [Win32]::GetWindowTextLength($hWnd)
        $titleBuilder = New-Object System.Text.StringBuilder([Math]::Max(1, $length + 1))
        [Win32]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity) | Out-Null
        $style = [Win32]::GetWindowLongPtr($hWnd, $GWL_STYLE).ToInt64()
        $proc = $procById[[int]$windowPid]
        $windows.Add([PSCustomObject]@{
          hwnd = $hWnd.ToInt64()
          processId = [int]$windowPid
          processName = [string]$proc.Name
          commandLine = [string]$proc.CommandLine
          title = $titleBuilder.ToString()
          visible = [Win32]::IsWindowVisible($hWnd)
          isChild = (($style -band $WS_CHILD) -ne 0)
          x = $rect.Left
          y = $rect.Top
          width = $width
          height = $height
        })
        return $true
      }
      [Win32]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
      $target = $windows |
        Sort-Object @{ Expression = { if (($_.processName -match "mpv") -or ($_.commandLine -match "hills-lite-mpv")) { 0 } else { 1 } } }, @{ Expression = { if ($_.title -eq "Hills Lite") { 0 } else { 1 } } }, @{ Expression = { -($_.width * $_.height) } } |
        Select-Object -First 1
    }
    if (-not $target) {
      throw "no visible top-level Electron window found for launched process tree $root"
    }
    if ($target.width -lt 200 -or $target.height -lt 120) {
      throw "Electron window handle $($target.hwnd) has invalid capture bounds $($target.width)x$($target.height)"
    }

    $hwnd = [IntPtr]::new([int64]$target.hwnd)
    $isChild = if ($null -ne $target.isChild) { [bool]$target.isChild } else { $false }
    if ($isChild) {
      if ($ownerHwnd -eq [IntPtr]::Zero) {
        throw "child window capture requires an owner window handle"
      }
      [Win32]::ShowWindow($ownerHwnd, 9) | Out-Null
      [Win32]::SetForegroundWindow($ownerHwnd) | Out-Null
      [Win32]::SetWindowPos($ownerHwnd, [IntPtr](0), 0, 0, 0, 0, 0x0013) | Out-Null
      Start-Sleep -Milliseconds 120
      [Win32]::ShowWindow($hwnd, 5) | Out-Null
      [Win32]::SetWindowPos($hwnd, [IntPtr](0), 0, 0, 0, 0, 0x0053) | Out-Null
    } else {
      [Win32]::ShowWindow($hwnd, 9) | Out-Null
      [Win32]::SetWindowPos($hwnd, [IntPtr](-1), 0, 0, 0, 0, 0x0043) | Out-Null
      [Win32]::SetForegroundWindow($hwnd) | Out-Null
    }
    Start-Sleep -Milliseconds 180

    $rect = New-Object RECT
    [Win32]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
    if ($isChild -and -not [Win32]::IsWindowVisible($hwnd)) {
      throw "child window handle $($target.hwnd) is not visible after foregrounding the owner window"
    }
    $width = [Math]::Max(1, $rect.Right - $rect.Left)
    $height = [Math]::Max(1, $rect.Bottom - $rect.Top)
    $bmp = New-Object System.Drawing.Bitmap($width, $height)
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bmp.Size)
    $bmp.Save(${JSON.stringify(outputPath)}, [System.Drawing.Imaging.ImageFormat]::Png)
    $gfx.Dispose()
    $bmp.Dispose()

    if (-not $isChild) {
      [Win32]::SetWindowPos($hwnd, [IntPtr](-2), 0, 0, 0, 0, 0x0043) | Out-Null
    }
    [PSCustomObject]@{
      hwnd = $target.hwnd
      processId = $target.processId
      title = $target.title
      visible = $target.visible
      isChild = $isChild
      x = $rect.Left
      y = $rect.Top
      width = $width
      height = $height
      candidateCount = if ($null -ne $windows) { $windows.Count } else { 1 }
      screenshotPath = ${JSON.stringify(outputPath)}
    } | ConvertTo-Json -Compress
  `;
  const result = run("powershell", ["-NoProfile", "-Command", script]);
  const windowInfo = JSON.parse(result.stdout.trim());
  return { ...analyzePng(outputPath), windowInfo };
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

function booleanField(value, key, expected) {
  if (value == null || typeof value !== "object") return false;
  const actual = value[key];
  if (typeof actual === "boolean") return actual === expected;
  if (typeof actual === "string") return actual.toLowerCase() === String(expected);
  return false;
}

function emptyArrayField(value, key) {
  if (value == null || typeof value !== "object") return false;
  const actual = value[key];
  return Array.isArray(actual) && actual.length === 0;
}

function verifyLocalDecodeContract(contract) {
  const failures = [];
  if (contract.playbackInfoRequests.length < 1) {
    failures.push("PlaybackInfo was not requested");
  }
  for (const [index, request] of contract.playbackInfoRequests.entries()) {
    const query = request.query ?? {};
    const body = request.body ?? {};
    const profile = body.DeviceProfile ?? body.deviceProfile ?? {};
    for (const [key, expected] of [
      ["EnableDirectPlay", true],
      ["EnableDirectStream", true],
      ["EnableTranscoding", false],
      ["EnableVideoStreamCopy", true],
      ["EnableAudioStreamCopy", true],
    ]) {
      if (!booleanField(query, key, expected)) {
        failures.push(`PlaybackInfo query ${index} ${key} was not ${expected}`);
      }
      if (!booleanField(body, key, expected)) {
        failures.push(`PlaybackInfo body ${index} ${key} was not ${expected}`);
      }
    }
    if (!emptyArrayField(profile, "TranscodingProfiles")) {
      failures.push(`PlaybackInfo body ${index} DeviceProfile.TranscodingProfiles was not empty`);
    }
  }
  if (contract.streamRequests.length < 1) {
    failures.push("direct stream URL was not requested");
  }
  for (const [index, request] of contract.streamRequests.entries()) {
    if (request.query?.Static !== "true") {
      failures.push(`stream request ${index} Static was not true`);
    }
    if (Object.keys(request.query ?? {}).some((key) => /transcod/i.test(key))) {
      failures.push(`stream request ${index} contains a transcoding query key`);
    }
  }
  for (const [index, report] of contract.playstateReports.entries()) {
    const method = report.body?.PlayMethod;
    if (method != null && method !== "DirectPlay" && method !== "DirectStream") {
      failures.push(`playstate report ${index} PlayMethod was ${method}`);
    }
  }
  return {
    ok: failures.length === 0,
    failures,
    playbackInfoRequestCount: contract.playbackInfoRequests.length,
    streamRequestCount: contract.streamRequests.length,
    playstateReportCount: contract.playstateReports.length,
  };
}

function pixelSampleOk(pixels) {
  return pixels.brightRatio > 0.18 && pixels.colorfulRatio > 0.08;
}

async function capturePageAndAnalyze(ws, name = "embedded-local") {
  const outputPath = path.join(tmpDir, `${name}.png`);
  const result = await cdpCall(ws, "Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await fsp.writeFile(outputPath, Buffer.from(result.data, "base64"));
  return analyzePng(outputPath);
}

async function captureNativeWindowSample(processId, name, windowHandle) {
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return captureWindowAndAnalyze(processId, name, windowHandle);
    } catch (error) {
      lastError = error;
      await wait(300);
    }
  }
  throw lastError ?? new Error("failed to capture native Electron window");
}

async function captureVisibleSample(ws, { name, bounds, usingHtmlVideo, processId }) {
  let pixels;
  let uiPixels = null;
  let embedState = null;
  let hostBoundsOk = true;
  if (usingHtmlVideo) {
    pixels = await capturePageAndAnalyze(ws, name);
  } else {
    embedState = await readEmbedState(ws).catch(() => null);
    uiPixels = await capturePageAndAnalyze(ws, `${name}-ui`);
    const nativeWindowHandle = embeddedNativeWindowHandle(embedState);
    pixels = await captureNativeWindowSample(processId, `${name}-mpv-host`, nativeWindowHandle);
    hostBoundsOk =
      embedState?.mode === "overlay"
        ? true
        : embeddedHostWindowBoundsOk(embedState, pixels.windowInfo);
  }
  return {
    name,
    ok: pixelSampleOk(pixels) && hostBoundsOk,
    pixels,
    uiPixels,
    expectedBounds: bounds,
    embedState,
    hostBoundsOk,
    expectedMpvHostBounds: expectedMpvHostBounds(embedState),
  };
}

async function recordVisibleSample(samples, ws, options) {
  try {
    samples.push(await captureVisibleSample(ws, options));
  } catch (error) {
    samples.push({
      name: options.name,
      ok: false,
      error: error?.message ?? String(error),
    });
  }
}

function stageFillsViewport(metrics, tolerance = 4) {
  return (
    metrics?.stage?.width >= metrics?.viewport?.width - tolerance &&
    metrics?.stage?.height >= metrics?.viewport?.height - tolerance
  );
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
  "-t",
  "12",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-an",
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
const electronStdout = [];
const electronStderr = [];
child.stdout?.on("data", (chunk) => {
  const text = String(chunk).trim();
  if (text) electronStdout.push(text);
});
child.stderr?.on("data", (chunk) => {
  const text = String(chunk).trim();
  if (text) electronStderr.push(text);
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
  const pageConsole = [];
  const pageExceptions = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled") {
      pageConsole.push({
        type: message.params?.type,
        args: (message.params?.args ?? []).map((arg) => arg.value ?? arg.description ?? arg.type),
      });
    } else if (message.method === "Runtime.exceptionThrown") {
      pageExceptions.push(message.params?.exceptionDetails?.text ?? message.params?.exceptionDetails);
    }
  });
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
      await appRouter.push("/player/${itemId}${forceNativeMpv ? "?nativeMpv=1" : ""}");
      await wait(9000);
      const video = document.querySelector("video");
      const state = video
        ? {
            mode: "html",
            durationMs: Number.isFinite(video.duration) ? Math.floor(video.duration * 1000) : 0,
            positionMs: Math.floor(video.currentTime * 1000),
            trackCount: 0,
            speed: video.playbackRate,
            paused: video.paused,
            eof: video.ended,
            readyState: video.readyState,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
          }
        : {
            ...(await window.hillsLite.invoke("get_state")),
            mode: "mpv",
          };
      const embedState = video ? null : await window.hillsLite.invoke("get_embed_state");
      let mpvScreenshot = null;
      let mpvScreenshotError = null;
      if (!video) {
        try {
          mpvScreenshot = await window.hillsLite.invoke("take_screenshot", {
            payload: { title: "embedded-smoke", includeSubtitles: true },
          });
        } catch (error) {
          mpvScreenshotError = error?.message ?? String(error);
        }
      }
      const stage = document.querySelector(".player__stage")?.getBoundingClientRect();
      return {
        route: appRouter.currentRoute.value.fullPath,
        bodyText: document.body.innerText.slice(0, 800),
        hasHillsLite: Boolean(window.hillsLite),
        playerClassName: document.querySelector(".player")?.className ?? null,
        htmlVideoCount: document.querySelectorAll("video").length,
        bounds: { x: window.screenX, y: window.screenY, width: window.outerWidth, height: window.outerHeight },
        stage: stage ? { x: stage.x, y: stage.y, width: stage.width, height: stage.height } : null,
        mpvScreenshot,
        mpvScreenshotError,
        embedState,
        state,
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
      const state = await ${playbackStateExpression()};
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
      const state = await ${playbackStateExpression()};
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
        const video = document.querySelector("video");
        if (video) {
          video.currentTime = Math.min(10, Math.max(0, Number.isFinite(video.duration) ? video.duration - 1 : 10));
          return true;
        }
        await window.hillsLite.invoke("seek", { payload: { positionMs: 10000 } });
        return true;
      })()
    `);
    await wait(650);
    const before = await cdpEval(ws, playbackStateExpression());
    const controlsForSeek = await cdpEval(ws, playerUiMetricsExpression());
    if (!controlsForSeek.seekBackButton?.center) {
      throw new Error("seek back button not visible");
    }
    await cdpClick(ws, controlsForSeek.seekBackButton.center);
    await wait(900);
    const after = await cdpEval(ws, playbackStateExpression());
    seekBackResult = { before, after, button: controlsForSeek.seekBackButton };
  } catch (error) {
    seekBackError = error?.message ?? String(error);
  }

  const usingHtmlVideo = startResult.state?.mode === "html";
  const visualSamples = [];
  await cdpEval(ws, `
    (() => {
      window.moveTo(80, 80);
      window.resizeTo(1280, 800);
      window.focus();
      return true;
    })()
  `);
  await wait(900);
  await cdpEval(ws, wakePlayerControlsExpression());
  await wait(250);
  const controlsInitial = await cdpEval(ws, playerUiMetricsExpression());
  const controlsInitialEmbedState = await readEmbedState(ws);
  await recordVisibleSample(visualSamples, ws, {
    name: "player-initial-1280x800",
    bounds: controlsInitial.bounds,
    usingHtmlVideo,
    processId: child.pid,
  });
  let fullscreenAfterEnter = null;
  let fullscreenAfterEnterEmbedState = null;
  let fullscreenAfterExit = null;
  let fullscreenStageCoversViewport = false;
  let fullscreenError = null;
  try {
    if (!controlsInitial.fullscreenButton?.center) {
      throw new Error("fullscreen button not visible");
    }
    await cdpClick(ws, controlsInitial.fullscreenButton.center);
    await wait(1700);
    fullscreenAfterEnter = await cdpEval(ws, playerUiMetricsExpression());
    fullscreenAfterEnterEmbedState = await readEmbedState(ws);
    fullscreenStageCoversViewport = stageFillsViewport(fullscreenAfterEnter);
    await recordVisibleSample(visualSamples, ws, {
      name: "player-fullscreen",
      bounds: fullscreenAfterEnter.bounds,
      usingHtmlVideo,
      processId: child.pid,
    });
    await cdpEval(ws, `
      (async () => {
        const doc = document;
        if (window.hillsLite) await window.hillsLite.invoke("set_fullscreen", { enabled: false });
        if (doc.fullscreenElement && doc.exitFullscreen) await doc.exitFullscreen();
        else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) doc.webkitExitFullscreen();
        return true;
      })()
    `);
    await wait(1500);
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
    const resizeEmbedState = await readEmbedState(ws);
    resizeResult.embedState = resizeEmbedState;
    await recordVisibleSample(visualSamples, ws, {
      name: "embedded-local",
      bounds: resizeResult?.bounds ?? startResult.bounds,
      usingHtmlVideo,
      processId: child.pid,
    });

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
    const compactResizeEmbedState = await readEmbedState(ws);
    compactResizeResult.embedState = compactResizeEmbedState;
    await recordVisibleSample(visualSamples, ws, {
      name: "player-compact-760x430",
      bounds: compactResizeResult?.bounds ?? startResult.bounds,
      usingHtmlVideo,
      processId: child.pid,
    });

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

  pixels = visualSamples.find((sample) => sample.name === "embedded-local")?.pixels ?? visualSamples.at(-1)?.pixels ?? null;
  const mpvPixels = startResult.mpvScreenshot?.filePath
    ? analyzePng(startResult.mpvScreenshot.filePath)
    : null;
  const screenPixelsOk = visualSamples.length >= 4 && visualSamples.every((sample) => sample.ok);
  const mpvPixelsOk =
    (mpvPixels?.brightRatio ?? 0) > 0.18 && (mpvPixels?.colorfulRatio ?? 0) > 0.08;
  const playbackStateOk = usingHtmlVideo
    ? startResult.state.durationMs > 0 &&
      startResult.state.readyState >= 2 &&
      startResult.state.videoWidth > 0 &&
      startResult.state.videoHeight > 0
    : startResult.state.durationMs > 0 &&
      (startResult.state.trackCount >= 1 || (Array.isArray(startResult.state.tracks) && startResult.state.tracks.length >= 1)) &&
      embeddedRectOk(controlsInitialEmbedState, controlsInitial);

  const functionalChecks = {
    routeOk: startResult.route === `/player/${itemId}${forceNativeMpv ? "?nativeMpv=1" : ""}`,
    electronDefaultHtmlVideo: forceNativeMpv
      ? !usingHtmlVideo && startResult.htmlVideoCount === 0
      : !usingHtmlVideo && startResult.htmlVideoCount === 0,
    noNativeEmbedByDefault: forceNativeMpv ? startResult.embedState != null : startResult.embedState != null,
    playbackStateOk,
    longPressActivated: longPressSpeed.active.speed >= 1.95,
    longPressRestored:
      Math.abs(longPressSpeed.restored.speed - startResult.state.speed) < 0.05 &&
      !longPressSpeed.restored.badgeVisible,
    seekBackOk: seekBackResult?.after?.positionMs < seekBackResult?.before?.positionMs - 5000,
    initialControlsVisible:
      controlsInitial.topVisible &&
      controlsInitial.bottomVisible &&
      controlsInitial.playButtonVisible &&
      controlsInitial.seekBackButtonVisible &&
      controlsInitial.fullscreenButtonVisible,
    initialNoHorizontalOverflow: !controlsInitial.hasHorizontalOverflow,
    fullscreenEntered: fullscreenAfterEnter?.fullscreenActive === true,
    fullscreenStageCoversViewport,
    fullscreenEmbedRectOk: usingHtmlVideo || embeddedRectOk(fullscreenAfterEnterEmbedState, fullscreenAfterEnter),
    fullscreenExited: fullscreenAfterExit?.fullscreenActive === false,
    resizeWindowed: resizeResult?.bounds?.width <= 1100 && resizeResult?.bounds?.height <= 720,
    resizeStageFillsViewport: stageFillsViewport(resizeResult),
    resizeEmbedRectOk: usingHtmlVideo || embeddedRectOk(resizeResult?.embedState, resizeResult),
    resizeNoHorizontalOverflow: !resizeResult?.hasHorizontalOverflow,
    compactWindowed: compactResizeResult?.bounds?.width <= 1000 && compactResizeResult?.bounds?.height <= 640,
    compactControlsVisible:
      compactResizeResult?.topVisible &&
      compactResizeResult?.bottomVisible &&
      compactResizeResult?.playButtonVisible &&
      compactResizeResult?.fullscreenButtonVisible,
    compactStageFillsViewport: stageFillsViewport(compactResizeResult),
    compactControlsFit: (compactResizeResult?.bottom?.height ?? 999) <= 150,
    compactEmbedRectOk: usingHtmlVideo || embeddedRectOk(compactResizeResult?.embedState, compactResizeResult),
    compactNoHorizontalOverflow: !compactResizeResult?.hasHorizontalOverflow,
    screenPixelsOk,
  };
  const functionalOk = Object.values(functionalChecks).every(Boolean);

  let runtimeCleanup = null;
  let runtimeCleanupError = null;
  try {
    runtimeCleanup = await verifyRuntimeCleanup(child, ws);
  } catch (error) {
    runtimeCleanupError = error?.message ?? String(error);
  }

  const localDecodeContractResult = verifyLocalDecodeContract(localDecodeContract);
  const ok = functionalOk && runtimeCleanup?.ok === true && localDecodeContractResult.ok;

  console.log(JSON.stringify({
    ok,
    functionalOk,
    functionalChecks,
    localDecodeContract: localDecodeContractResult,
    screenshotPath,
    route: startResult.route,
    bodyText: startResult.bodyText,
    state: startResult.state,
    stage: startResult.stage,
    diagnostics: {
      hasHillsLite: startResult.hasHillsLite,
      playerClassName: startResult.playerClassName,
      htmlVideoCount: startResult.htmlVideoCount,
      embedState: startResult.embedState,
      electronStdout,
      electronStderr,
      pageConsole,
      pageExceptions,
    },
    longPressSpeed,
    seekBack: {
      result: seekBackResult,
      error: seekBackError,
    },
    controlsInitial,
    controlsInitialEmbedState,
    fullscreen: {
      afterEnter: fullscreenAfterEnter,
      afterEnterEmbedState: fullscreenAfterEnterEmbedState,
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
      usingHtmlVideo,
      visualSamples,
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
