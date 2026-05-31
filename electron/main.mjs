import { app, BrowserWindow, dialog, globalShortcut, ipcMain, protocol, screen, shell } from "electron";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

import { EmbyClient } from "./backend/emby.mjs";
import { MpvController } from "./backend/mpv.mjs";
import { DownloadManager } from "./backend/downloads.mjs";
import { DanmakuClient } from "./backend/danmaku.mjs";
import { DesktopIntegration, extractProtocolUrls } from "./backend/desktop.mjs";
import { JsonStore, createServer } from "./backend/store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const devServerUrl = process.env.HILLS_ELECTRON_DEV_SERVER_URL;
const writableRootDir = app.isPackaged ? path.dirname(process.execPath) : rootDir;
const userDataDir = process.env.HILLS_ELECTRON_USER_DATA_DIR
  ? path.resolve(process.env.HILLS_ELECTRON_USER_DATA_DIR)
  : path.join(writableRootDir, ".electron-user-data");
const imageCacheDir = path.join(userDataDir, "image-cache");
const imageCacheInflight = new Map();
const imageQueryKeys = new Set(["maxWidth", "maxHeight", "width", "height", "quality", "format", "tag"]);
const noOpCommands = new Set([]);

fs.mkdirSync(userDataDir, { recursive: true });
app.setPath("userData", userDataDir);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "hills-image",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-software-rasterizer");
app.commandLine.appendSwitch("in-process-gpu");

let desktopIntegration = null;
const pendingProtocolUrls = [];
let mainWindow = null;
let secondaryBlackoutEnabled = false;
let secondaryBlackoutWindows = [];
let embedHostRect = null;
let embedHostParent = null;
let embedHostProcess = null;
let embedHostHwnd = null;
let embedHostStdout = "";

function queueProtocolUrl(url) {
  if (desktopIntegration) {
    desktopIntegration.handleProtocolUrl(url);
    return;
  }
  pendingProtocolUrls.push(url);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    for (const url of extractProtocolUrls(argv)) queueProtocolUrl(url);
    desktopIntegration?.showWindow();
  });
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  queueProtocolUrl(url);
});

const store = new JsonStore(userDataDir);
const emby = new EmbyClient(store);
const danmaku = new DanmakuClient(store, emby);
const mpv = new MpvController(store, { logDir: userDataDir });
const downloads = new DownloadManager(store, emby, mpv, {
  userDataDir,
  emit: (event, payload) => emitAppEvent(event, payload),
  notify: (spec) => pushNotification(spec),
});
desktopIntegration = new DesktopIntegration({
  app,
  store,
  getWindow: () => getMainAppWindow(),
  emit: (event, payload) => emitAppEvent(event, payload),
});
const playbackLogPath = path.join(userDataDir, "playback.log");
const storeReady = store.load().catch((error) => {
  console.error("failed to initialize Electron state store", error);
});
let playQueue = Promise.resolve();
let pendingPlay = null;
let pendingPlayKey = null;
let currentPlaySession = null;
const registeredGlobalShortcuts = new Map();

function platformType() {
  switch (process.platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "macos";
    case "linux":
      return "linux";
    default:
      return process.platform;
  }
}

function defaultSnapshot() {
  return {
    url: null,
    paused: true,
    positionMs: 0,
    durationMs: 0,
    speed: 1,
    volume: 80,
    muted: false,
    eof: false,
    tracks: [],
    subDelayMs: 0,
    subScale: 1,
    networkBps: null,
    bufferedMs: 0,
    buffering: false,
    cacheBufferingState: null,
  };
}

function redactUrl(value) {
  if (typeof value !== "string") return value;
  try {
    const url = new URL(value);
    if (url.username) url.username = "[redacted]";
    if (url.password) url.password = "[redacted]";
    for (const key of ["api_key", "X-Emby-Token", "token", "access_token"]) {
      if (url.searchParams.has(key)) url.searchParams.set(key, "[redacted]");
    }
    return url.toString();
  } catch {
    return value
      .replace(/(api_key|X-Emby-Token|token|access_token)=([^&\s]+)/gi, "$1=[redacted]")
      .replace(/(Token=")[^"]+(")/gi, "$1[redacted]$2");
  }
}

function redactSensitive(value) {
  if (value == null) return value;
  if (typeof value === "string") return redactUrl(value);
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (/token|api[-_]?key|authorization/i.test(key)) return [key, "[redacted]"];
        return [key, redactSensitive(item)];
      }),
    );
  }
  return value;
}

function writePlaybackLog(event, details = {}) {
  const entry = {
    at: new Date().toISOString(),
    event,
    details: redactSensitive(details),
  };
  fs.appendFile(playbackLogPath, `${JSON.stringify(entry)}\n`, "utf8", (error) => {
    if (error) console.error("failed to write playback log", error);
  });
}

const sidecarSubtitleExtensions = new Map([
  [".srt", 0],
  [".ass", 1],
  [".ssa", 2],
  [".vtt", 3],
]);

function sidecarSubtitleRank(videoStem, subtitleStem) {
  const video = videoStem.toLowerCase();
  const subtitle = subtitleStem.toLowerCase();
  if (subtitle === video) return 0;
  for (const separator of [".", " ", "_", "-"]) {
    if (subtitle.startsWith(`${video}${separator}`)) return 1;
  }
  return null;
}

async function findSidecarSubtitles(videoPath) {
  const dir = path.dirname(videoPath);
  const videoStem = path.basename(videoPath, path.extname(videoPath));
  const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const ext = path.extname(entry.name).toLowerCase();
      if (!sidecarSubtitleExtensions.has(ext)) return null;
      const stem = path.basename(entry.name, ext);
      const rank = sidecarSubtitleRank(videoStem, stem);
      if (rank == null) return null;
      return {
        filePath: path.join(dir, entry.name),
        fileName: entry.name,
        rank,
        extRank: sidecarSubtitleExtensions.get(ext) ?? 99,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || a.extRank - b.extRank || a.fileName.localeCompare(b.fileName))
    .slice(0, 8);
}

async function addSidecarSubtitles(videoPath) {
  const subtitles = await findSidecarSubtitles(videoPath);
  let loaded = 0;
  const loadedFiles = [];
  for (const [index, subtitle] of subtitles.entries()) {
    try {
      await mpv.command([
        "sub-add",
        pathToFileURL(subtitle.filePath).toString(),
        index === 0 ? "select" : "auto",
        subtitle.fileName,
      ]);
      loaded += 1;
      loadedFiles.push(subtitle.fileName);
    } catch (error) {
      console.warn("failed to load sidecar subtitle", subtitle.fileName, error);
    }
  }
  if (loaded > 0) {
    writePlaybackLog("sidecar_subtitles_loaded", {
      fileName: path.basename(videoPath),
      subtitleFiles: loadedFiles,
    });
  }
  return loaded;
}

function sanitizeFilename(name, fallback = "screenshot") {
  const safe = String(name || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return safe || fallback;
}

function screenshotTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
}

async function uniqueScreenshotPath(dir, baseName) {
  await fs.promises.mkdir(dir, { recursive: true });
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? "" : `-${index + 1}`;
    const candidate = path.join(dir, `${baseName}${suffix}.png`);
    try {
      await fs.promises.access(candidate);
    } catch {
      return candidate;
    }
  }
  return path.join(dir, `${baseName}-${randomUUID().slice(0, 8)}.png`);
}

async function takeMpvScreenshot(payload = {}) {
  if (!mpv.isRunning()) {
    throw new Error("播放器未运行，无法截图");
  }
  const dir = path.join(userDataDir, "screenshots");
  const title = sanitizeFilename(payload.title, "Hills Lite");
  const baseName = `${title}-${screenshotTimestamp()}`;
  const filePath = await uniqueScreenshotPath(dir, baseName);
  const mode = payload.includeSubtitles === false ? "video" : "subtitles";
  await mpv.command(["screenshot-to-file", filePath, mode], { start: false });
  writePlaybackLog("screenshot_saved", { filePath, mode });
  return { filePath };
}

function imageProtocolError(status, message) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function parseImageProtocolUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "hills-image:" || url.hostname !== "media") {
    throw new Error("invalid image cache protocol");
  }
  const [serverId, lineId, itemId, imageType] = url.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
  if (!serverId || !lineId || !itemId || !["Primary", "Backdrop"].includes(imageType)) {
    throw new Error("invalid image cache route");
  }

  const query = new URLSearchParams();
  for (const [key, rawValue] of url.searchParams.entries()) {
    if (!imageQueryKeys.has(key)) continue;
    const value = String(rawValue).trim();
    if (value) query.set(key, value);
  }
  return { serverId, lineId, itemId, imageType, query };
}

function imageCacheKey(spec) {
  return createHash("sha256")
    .update(JSON.stringify({
      serverId: spec.serverId,
      lineId: spec.lineId,
      itemId: spec.itemId,
      imageType: spec.imageType,
      query: [...spec.query.entries()].sort(([left], [right]) => left.localeCompare(right)),
    }))
    .digest("hex");
}

function cachedImageResponse(buffer, contentType, state) {
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      "X-Hills-Image-Cache": state,
    },
  });
}

function imageUserAgent(settings, server, line) {
  return line.userAgent ?? server.defaultUserAgent ?? settings.defaultUserAgent;
}

function imageRequestHeaders(settings, server, line, account) {
  const headers = {
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Encoding": "identity",
    "User-Agent": imageUserAgent(settings, server, line),
    "X-Emby-Authorization": "MediaBrowser Client=\"Hills Lite\", Device=\"Desktop\", DeviceId=\"hills-lite-electron-001\", Version=\"0.1.0\"",
  };

  if (account?.accessToken) {
    headers["X-Emby-Token"] = account.accessToken;
    headers.Authorization = `MediaBrowser Token="${account.accessToken}"`;
  }

  for (const [name, value] of line.headers ?? []) {
    if (name && value != null) headers[name] = String(value);
  }
  return headers;
}

function buildRemoteImageUrl(line, spec) {
  const baseUrl = line.baseUrl.endsWith("/") ? line.baseUrl : `${line.baseUrl}/`;
  const url = new URL(`Items/${encodeURIComponent(spec.itemId)}/Images/${spec.imageType}`, baseUrl);
  for (const [key, value] of spec.query.entries()) url.searchParams.set(key, value);
  return url;
}

async function fetchImageWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readImageCacheEntry(cacheKey) {
  const dataPath = path.join(imageCacheDir, `${cacheKey}.bin`);
  const metaPath = path.join(imageCacheDir, `${cacheKey}.json`);
  const [data, rawMeta] = await Promise.all([
    fs.promises.readFile(dataPath),
    fs.promises.readFile(metaPath, "utf8"),
  ]);
  const meta = JSON.parse(rawMeta);
  return { data, contentType: meta.contentType || "application/octet-stream" };
}

async function writeImageCacheEntry(cacheKey, data, contentType) {
  await fs.promises.mkdir(imageCacheDir, { recursive: true });
  await Promise.all([
    fs.promises.writeFile(path.join(imageCacheDir, `${cacheKey}.bin`), data),
    fs.promises.writeFile(
      path.join(imageCacheDir, `${cacheKey}.json`),
      `${JSON.stringify({ contentType, savedAt: new Date().toISOString() })}\n`,
      "utf8",
    ),
  ]);
}

async function resolveImageSource(spec) {
  await storeReady;
  const [servers, accounts, settings] = await Promise.all([
    store.listServers(),
    store.listAccounts(),
    store.getSettings(),
  ]);
  const server = servers.find((item) => item.id === spec.serverId);
  if (!server) throw new Error(`image server not found: ${spec.serverId}`);
  const line =
    server.lines.find((item) => item.id === spec.lineId) ??
    server.lines.find((item) => item.id === server.activeLineId) ??
    server.lines[0];
  if (!line) throw new Error(`image line not found: ${spec.lineId}`);
  const account = accounts.find((item) => item.serverId === server.id) ?? null;
  return { server, line, account, settings };
}

async function fetchAndCacheImage(cacheKey, spec) {
  const { server, line, account, settings } = await resolveImageSource(spec);
  const remoteUrl = buildRemoteImageUrl(line, spec);
  const response = await fetchImageWithTimeout(
    remoteUrl,
    {
      method: "GET",
      headers: imageRequestHeaders(settings, server, line, account),
    },
    settings.requestTimeoutMs,
  );

  if (!response.ok) {
    throw new Error(`image request failed: HTTP ${response.status} from ${redactUrl(remoteUrl.toString())}`);
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const data = Buffer.from(await response.arrayBuffer());
  if (data.byteLength === 0) throw new Error("image request returned an empty body");
  await writeImageCacheEntry(cacheKey, data, contentType);
  return cachedImageResponse(data, contentType, "miss");
}

async function handleImageProtocolRequest(request) {
  let spec;
  try {
    spec = parseImageProtocolUrl(request.url);
  } catch (error) {
    return imageProtocolError(400, String(error));
  }

  const cacheKey = imageCacheKey(spec);
  try {
    const cached = await readImageCacheEntry(cacheKey);
    return cachedImageResponse(cached.data, cached.contentType, "hit");
  } catch {
    // Cache misses are normal; fall through to the network path.
  }

  if (!imageCacheInflight.has(cacheKey)) {
    imageCacheInflight.set(cacheKey, fetchAndCacheImage(cacheKey, spec));
  }

  try {
    return await imageCacheInflight.get(cacheKey);
  } catch (error) {
    console.warn("failed to resolve cached image", error);
    return imageProtocolError(502, "image request failed");
  } finally {
    imageCacheInflight.delete(cacheKey);
  }
}

function emitAppEvent(event, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(`hills:event:${event}`, payload);
  }
  if (event.startsWith("download:") || event.startsWith("notification:")) {
    desktopIntegration?.scheduleTrayRefresh();
  }
}

function getMainAppWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  return BrowserWindow.getAllWindows().find((win) => {
    return !secondaryBlackoutWindows.includes(win) && !win.isDestroyed();
  }) ?? null;
}

function nativeWindowHandleDecimal(win) {
  const handle = win.getNativeWindowHandle();
  if (handle.length >= 8) return handle.readBigUInt64LE(0).toString();
  return String(handle.readUInt32LE(0));
}

function detachEmbedHostParentListeners() {
  if (!embedHostParent || embedHostParent.isDestroyed()) {
    embedHostParent = null;
    return;
  }
  embedHostParent.off("move", applyEmbedHostBounds);
  embedHostParent.off("resize", applyEmbedHostBounds);
  embedHostParent.off("closed", destroyEmbedHostWindow);
  embedHostParent = null;
}

function applyEmbedHostBounds() {
  if (!embedHostProcess || !embedHostRect) return;
  const parent = getMainAppWindow();
  if (!parent || parent.isDestroyed()) return;
  const parentBounds = parent.getContentBounds();
  sendEmbedHostCommand({
    type: "rect",
    x: parentBounds.x + embedHostRect.x,
    y: parentBounds.y + embedHostRect.y,
    width: embedHostRect.width,
    height: embedHostRect.height,
    scale: embedHostRect.scale ?? 1,
    top: process.env.HILLS_ELECTRON_MPV_HOST_TOP === "1",
  });
}

function resolveEmbedHostHelperPath() {
  const name = process.platform === "win32" ? "electron_mpv_host.exe" : "electron_mpv_host";
  const candidates = [
    path.join(process.resourcesPath ?? "", name),
    path.join(rootDir, "src-tauri", "target", "debug", name),
    path.join(rootDir, "src-tauri", "target", "release", name),
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) ?? null;
}

function sendEmbedHostCommand(command) {
  if (!embedHostProcess?.stdin?.writable) return;
  embedHostProcess.stdin.write(`${JSON.stringify(command)}\n`);
}

function startEmbedHostProcess(parent) {
  if (embedHostProcess && embedHostHwnd) return Promise.resolve(embedHostHwnd);

  const helperPath = resolveEmbedHostHelperPath();
  if (!helperPath) {
    throw new Error("electron mpv host helper not found; build src-tauri electron_mpv_host first");
  }

  detachEmbedHostParentListeners();
  embedHostParent = parent;
  const parentHandle = nativeWindowHandleDecimal(parent);
  embedHostProcess = spawn(helperPath, [parentHandle], {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  embedHostHwnd = null;
  embedHostStdout = "";

  embedHostProcess.stderr?.on("data", (chunk) => {
    console.warn(`[electron_mpv_host] ${String(chunk)}`);
  });
  embedHostProcess.once("exit", () => {
    embedHostProcess = null;
    embedHostHwnd = null;
  });
  parent.on("move", applyEmbedHostBounds);
  parent.on("resize", applyEmbedHostBounds);
  parent.once("closed", destroyEmbedHostWindow);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("electron mpv host helper timed out")), 5000);
    const onData = (chunk) => {
      embedHostStdout += String(chunk);
      let index = embedHostStdout.indexOf("\n");
      while (index >= 0) {
        const line = embedHostStdout.slice(0, index).trim();
        embedHostStdout = embedHostStdout.slice(index + 1);
        if (line) {
          try {
            const message = JSON.parse(line);
            if (message.type === "ready" && message.hwnd) {
              clearTimeout(timer);
              embedHostProcess?.stdout?.off("data", onData);
              embedHostHwnd = String(message.hwnd);
              applyEmbedHostBounds();
              resolve(embedHostHwnd);
              return;
            }
          } catch (error) {
            clearTimeout(timer);
            reject(error);
            return;
          }
        }
        index = embedHostStdout.indexOf("\n");
      }
    };
    embedHostProcess?.stdout?.on("data", onData);
    embedHostProcess?.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function destroyEmbedHostWindow() {
  detachEmbedHostParentListeners();
  const child = embedHostProcess;
  embedHostProcess = null;
  embedHostHwnd = null;
  embedHostRect = null;
  if (child) {
    if (child.stdin?.writable) child.stdin.write(`${JSON.stringify({ type: "destroy" })}\n`);
    setTimeout(() => {
      if (!child.killed) child.kill();
    }, 500);
  }
}

async function attachEmbeddedMpvHost() {
  const host = getMainAppWindow();
  if (!host || host.isDestroyed()) {
    throw new Error("main window not ready for embedded mpv");
  }
  const hwnd = await startEmbedHostProcess(host);
  await mpv.setEmbedWindowHandle(hwnd);
  return null;
}

async function setEmbeddedMpvRect(rect = {}) {
  embedHostRect = {
    x: Number(rect.x) || 0,
    y: Number(rect.y) || 0,
    width: Math.max(1, Number(rect.width) || 1),
    height: Math.max(1, Number(rect.height) || 1),
    scale: Math.max(0.1, Number(rect.scale) || 1),
  };
  applyEmbedHostBounds();
  return null;
}

async function setEmbeddedMpvVisible(visible) {
  if (!embedHostProcess) return null;
  sendEmbedHostCommand({ type: "visible", visible: Boolean(visible) });
  if (visible) applyEmbedHostBounds();
  return null;
}

async function detachEmbeddedMpvHost() {
  await mpv.shutdown().catch(() => {});
  await mpv.clearEmbedWindowHandle();
  destroyEmbedHostWindow();
  return null;
}

function closeSecondaryBlackoutWindows() {
  const windows = secondaryBlackoutWindows;
  secondaryBlackoutWindows = [];
  for (const win of windows) {
    if (!win.isDestroyed()) win.close();
  }
}

const blackoutWindowUrl = `data:text/html;charset=utf-8,${encodeURIComponent(
  "<!doctype html><html><head><meta charset=\"UTF-8\"><style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#000;cursor:none;}</style></head><body></body></html>",
)}`;

function createSecondaryBlackoutWindow(display) {
  const { x, y, width, height } = display.bounds;
  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    fullscreen: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#000000",
    show: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    focusable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.setAlwaysOnTop(true, "screen-saver");
  win.once("closed", () => {
    secondaryBlackoutWindows = secondaryBlackoutWindows.filter((item) => item !== win);
  });
  void win.loadURL(blackoutWindowUrl);
  win.showInactive();
  return win;
}

function setSecondaryDisplayBlackout(enabled) {
  secondaryBlackoutEnabled = Boolean(enabled);
  closeSecondaryBlackoutWindows();
  if (!secondaryBlackoutEnabled) return { count: 0 };

  const target = BrowserWindow.getFocusedWindow() ?? getMainAppWindow();
  const targetBounds = target && !target.isDestroyed()
    ? target.getBounds()
    : screen.getPrimaryDisplay().bounds;
  const activeDisplay = screen.getDisplayMatching(targetBounds);
  secondaryBlackoutWindows = screen
    .getAllDisplays()
    .filter((display) => display.id !== activeDisplay.id)
    .map(createSecondaryBlackoutWindow);
  return { count: secondaryBlackoutWindows.length };
}

function refreshSecondaryDisplayBlackout() {
  if (secondaryBlackoutEnabled) setSecondaryDisplayBlackout(true);
}

async function emitNotificationUnread() {
  emitAppEvent("notification:unread", { unread: await store.unreadCount() });
}

async function pushNotification(spec) {
  const notification = await store.pushNotification(spec);
  emitAppEvent("notification:new", notification);
  await emitNotificationUnread();
  return notification;
}

function notificationId(args) {
  const id = args.payload?.id;
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new Error("notification id is required");
  }
  return id;
}

function toggleMainWindow() {
  const win = getMainAppWindow();
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) {
    if (win.isFocused()) win.hide();
    else win.focus();
  } else {
    win.show();
    win.focus();
  }
}

function triggerGlobalShortcut(action) {
  emitAppEvent("shortcut:trigger", action);
  if (action === "toggle_window") toggleMainWindow();
}

function unregisterElectronGlobalShortcut(action) {
  const accelerator = registeredGlobalShortcuts.get(action);
  if (!accelerator) return;
  globalShortcut.unregister(accelerator);
  registeredGlobalShortcuts.delete(action);
}

function registerElectronGlobalShortcut(action, accelerator) {
  if (typeof action !== "string" || action.trim().length === 0) {
    throw new Error("global shortcut action is required");
  }
  if (typeof accelerator !== "string" || accelerator.trim().length === 0) {
    throw new Error("global shortcut accelerator is required");
  }

  const actionName = action.trim();
  const combo = accelerator.trim();
  const registered = globalShortcut.register(combo, () => triggerGlobalShortcut(actionName));
  if (!registered) throw new Error(`global shortcut register failed: ${combo}`);
  registeredGlobalShortcuts.set(actionName, combo);
}

function replaceElectronGlobalShortcut(action, accelerator) {
  const previous = registeredGlobalShortcuts.get(action);
  unregisterElectronGlobalShortcut(action);
  try {
    registerElectronGlobalShortcut(action, accelerator);
  } catch (error) {
    if (previous) {
      try {
        registerElectronGlobalShortcut(action, previous);
      } catch (restoreError) {
        console.warn("failed to restore previous global shortcut", restoreError);
      }
    }
    throw error;
  }
}

async function registerStoredGlobalShortcuts() {
  await storeReady;
  globalShortcut.unregisterAll();
  registeredGlobalShortcuts.clear();
  const bindings = await store.listGlobalShortcuts();
  for (const binding of bindings) {
    try {
      registerElectronGlobalShortcut(binding.action, binding.accelerator);
    } catch (error) {
      console.warn("failed to register stored global shortcut", binding, error);
    }
  }
}

async function runMpvIfRunning(action) {
  if (!mpv.isRunning()) return null;
  await action();
  return null;
}

async function playLocalFilePath(filePath, startMs = null) {
  if (typeof filePath !== "string" || filePath.trim().length === 0) {
    throw new Error("file path is required");
  }
  const resolved = path.resolve(filePath);
  const stat = await fs.promises.stat(resolved).catch(() => null);
  if (!stat?.isFile()) throw new Error(`local file missing: ${resolved}`);
  await mpv.load({
    url: pathToFileURL(resolved).toString(),
    headers: [],
    userAgent: null,
    startMs,
    autoloadSubtitles: false,
  });
  await applySubtitleStyle(await store.getSettings()).catch((error) => {
    console.warn("failed to apply subtitle style", error);
  });
  await addSidecarSubtitles(resolved).catch((error) => {
    console.warn("failed to scan sidecar subtitles", error);
  });
  currentPlaySession = null;
  writePlaybackLog("play_file_loaded", {
    fileName: path.basename(resolved),
    startMs: startMs ?? null,
  });
}

async function preserveTrackSwitchCache() {
  const settings = await store.getSettings();
  return settings.preserveTrackSwitchCache !== false;
}

async function dropBuffersAfterTrackSwitch(preserveCache) {
  if (preserveCache) return;
  try {
    await mpv.command(["drop-buffers"]);
    writePlaybackLog("track_switch_drop_buffers", {});
  } catch (error) {
    writePlaybackLog("track_switch_drop_buffers_failed", { error: String(error) });
  }
}

function pictureModeProperties(mode) {
  switch (mode) {
    case "fill":
      return [
        ["keepaspect", true],
        ["panscan", 1],
        ["video-zoom", 0],
        ["video-scale-x", 1],
        ["video-scale-y", 1],
        ["video-aspect-override", -2],
      ];
    case "stretch":
      return [
        ["keepaspect", false],
        ["panscan", 0],
        ["video-zoom", 0],
        ["video-scale-x", 1],
        ["video-scale-y", 1],
        ["video-aspect-override", -2],
      ];
    case "autocrop":
      return [
        ["keepaspect", true],
        ["panscan", 1],
        ["video-zoom", 0.16],
        ["video-scale-x", 1],
        ["video-scale-y", 1],
        ["video-aspect-override", -2],
      ];
    case "fit":
    default:
      return [
        ["keepaspect", true],
        ["panscan", 0],
        ["video-zoom", 0],
        ["video-scale-x", 1],
        ["video-scale-y", 1],
        ["video-aspect-override", -2],
      ];
  }
}

async function applyPictureMode(mode) {
  for (const [property, value] of pictureModeProperties(mode)) {
    await mpv.setProperty(property, value, { start: false });
  }
}

async function showMpvStatsOsd(page) {
  const pageNumber = clampNumber(page, 1, 5, 1);
  const binding = `stats/display-page-${Math.round(pageNumber)}`;
  try {
    await mpv.command(["script-binding", binding], { start: false });
  } catch {
    await mpv.command(["script-binding", "stats/display-stats"], { start: false });
  }
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeHexColor(value, fallback) {
  const text = String(value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toUpperCase() : fallback;
}

function textValue(value) {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? text : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function assrtRequest(pathname, token, params = {}) {
  const authToken = String(token ?? "").trim();
  if (!authToken) throw new Error("ASSRT token is required");
  const url = new URL(`https://api.assrt.net/v1/${pathname.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${authToken}`,
      "User-Agent": "Hills Lite/0.1 (subtitle-search)",
    },
  });
  const body = await response.text();
  let json;
  try {
    json = body ? JSON.parse(body) : {};
  } catch {
    throw new Error(`ASSRT response is not valid JSON: HTTP ${response.status}`);
  }
  if (!response.ok) {
    throw new Error(json?.message ?? json?.error ?? `ASSRT HTTP ${response.status}`);
  }
  const status = numberValue(json?.status ?? json?.code);
  if (status != null && status !== 0) {
    throw new Error(json?.message ?? json?.error ?? `ASSRT status ${status}`);
  }
  return json;
}

function assrtSubList(json) {
  const data = json?.data ?? json;
  const candidates = [data?.sub?.subs, data?.subs, data?.result?.subs, data?.result];
  return candidates.find((value) => Array.isArray(value)) ?? [];
}

function normalizeAssrtSearchItem(item) {
  const id = textValue(item?.id ?? item?.sid ?? item?.sub_id);
  if (!id) return null;
  const title =
    textValue(item?.native_name) ??
    textValue(item?.title) ??
    textValue(item?.videoname) ??
    textValue(item?.filename) ??
    id;
  return {
    provider: "assrt",
    id,
    title,
    videoName: textValue(item?.videoname ?? item?.video_name),
    language: textValue(item?.lang?.desc ?? item?.lang?.name ?? item?.lang ?? item?.language),
    format: textValue(item?.subtype ?? item?.file_type ?? item?.format),
    releaseSite: textValue(item?.release_site ?? item?.releaseSite),
    uploadTime: textValue(item?.upload_time ?? item?.uploadTime),
    score: numberValue(item?.vote_score ?? item?.score ?? item?.rate),
  };
}

async function searchOnlineSubtitles(payload = {}) {
  if (payload.provider !== "assrt") throw new Error("unsupported subtitle provider");
  const query = String(payload.query ?? "").trim();
  if (query.length < 3) return { provider: "assrt", results: [] };
  const limit = clampNumber(payload.limit, 1, 15, 10);
  const json = await assrtRequest("sub/search", payload.token, {
    q: query,
    cnt: limit,
    pos: 0,
  });
  const results = assrtSubList(json)
    .map(normalizeAssrtSearchItem)
    .filter(Boolean)
    .slice(0, limit);
  return {
    provider: "assrt",
    results,
    quota: numberValue(json?.quota ?? json?.data?.quota),
  };
}

function preferredAssrtSubtitleFile(files) {
  const list = Array.isArray(files) ? files : [];
  const supported = [".srt", ".ass", ".ssa", ".vtt"];
  return (
    list.find((file) => {
      const name = textValue(file?.f ?? file?.filename ?? file?.name) ?? "";
      return supported.some((ext) => name.toLowerCase().endsWith(ext));
    }) ??
    list.find((file) => textValue(file?.url ?? file?.download_url ?? file?.link)) ??
    null
  );
}

async function resolveOnlineSubtitle(payload = {}) {
  if (payload.provider !== "assrt") throw new Error("unsupported subtitle provider");
  const id = String(payload.id ?? "").trim();
  if (!id) throw new Error("subtitle id is required");
  const json = await assrtRequest("sub/detail", payload.token, { id });
  const detail = assrtSubList(json)[0] ?? json?.sub ?? json?.data?.sub ?? json?.data ?? {};
  const file = preferredAssrtSubtitleFile(detail?.filelist ?? detail?.files);
  const source =
    textValue(file?.url ?? file?.download_url ?? file?.link) ??
    textValue(detail?.url ?? detail?.download_url ?? detail?.link);
  if (!source) throw new Error("ASSRT detail did not include a playable subtitle URL");
  const fileName = textValue(file?.f ?? file?.filename ?? file?.name);
  const title =
    textValue(detail?.native_name) ??
    textValue(detail?.title) ??
    textValue(detail?.videoname) ??
    fileName ??
    id;
  return {
    provider: "assrt",
    id,
    title,
    source,
    fileName,
    format: fileName?.split(".").pop()?.toLowerCase() ?? null,
  };
}

function subtitleStyleFrom(value = {}) {
  return {
    scale: clampNumber(value.scale ?? value.subtitleScale, 0.5, 2.5, 1),
    textColor: normalizeHexColor(value.textColor ?? value.subtitleTextColor, "#FFFFFF"),
    outlineColor: normalizeHexColor(value.outlineColor ?? value.subtitleOutlineColor, "#000000"),
    outlineSize: clampNumber(value.outlineSize ?? value.subtitleOutlineSize, 0, 8, 1.65),
    shadowOffset: clampNumber(value.shadowOffset ?? value.subtitleShadowOffset, 0, 8, 0),
    positionPct: Math.round(
      clampNumber(value.positionPct ?? value.subtitlePositionPct, 0, 100, 100),
    ),
    forceStyle: Boolean(value.forceStyle ?? value.subtitleForceStyle),
  };
}

async function applySubtitleStyle(value) {
  const style = subtitleStyleFrom(value);
  await mpv.setProperty("sub-scale", style.scale, { start: false });
  await mpv.setProperty("sub-color", style.textColor, { start: false });
  await mpv.setProperty("sub-outline-color", style.outlineColor, { start: false });
  await mpv.setProperty("sub-outline-size", style.outlineSize, { start: false });
  await mpv.setProperty("sub-shadow-offset", style.shadowOffset, { start: false });
  await mpv.setProperty("sub-pos", style.positionPct, { start: false });
  await mpv.setProperty("sub-ass-override", style.forceStyle ? "force" : "scale", {
    start: false,
  });
}

async function requireActivePair() {
  return store.activePair();
}

async function pairForSession(session) {
  const [servers, accounts] = await Promise.all([store.listServers(), store.listAccounts()]);
  const server = servers.find((item) => item.id === session.serverId);
  const account = accounts.find((item) => item.id === session.accountId);
  if (!server) throw new Error(`server not found: ${session.serverId}`);
  if (!account) throw new Error(`account not found: ${session.accountId}`);
  return { server, account };
}

function playRequestKey(payload) {
  return [
    payload.itemId ?? "",
    Number(payload.startMs ?? 0),
    payload.preferDirect ?? true,
    payload.lineId ?? "",
    payload.mediaSourceId ?? "",
  ].join("|");
}

function parseArgumentTemplate(input) {
  const args = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if ((char === "\"" || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char;
      continue;
    }
    if (!quote && /\s/.test(char)) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (escaped) current += "\\";
  if (current.length > 0) args.push(current);
  return args;
}

function mpvHeaderArgs(headers) {
  if (!Array.isArray(headers) || headers.length === 0) return [];
  const fields = headers
    .filter(([key, value]) => key && value)
    .map(([key, value]) => `${key}: ${value}`);
  return fields.length > 0 ? [`--http-header-fields=${fields.join(",")}`] : [];
}

function looksLikeMpv(playerPath) {
  const name = path.basename(playerPath ?? "").toLowerCase();
  return name === "mpv" || name === "mpv.exe";
}

function expandExternalPlayerArgs(settings, playerPath, source, title, startMs) {
  const template = typeof settings.externalPlayerArgs === "string" ? settings.externalPlayerArgs.trim() : "";
  const headers = mpvHeaderArgs(source.headers);
  const seconds = Math.max(0, Number(startMs ?? 0) / 1000);
  if (!template) {
    if (looksLikeMpv(playerPath)) {
      return [
        `--force-media-title=${title || source.itemId}`,
        ...(seconds > 0 ? [`--start=${seconds.toFixed(3)}`] : []),
        ...(source.userAgent ? [`--user-agent=${source.userAgent}`] : []),
        ...headers,
        source.streamUrl,
      ];
    }
    return [source.streamUrl];
  }
  return parseArgumentTemplate(template).flatMap((arg) => {
    if (arg === "{headers}") return headers;
    return [
      arg
        .replaceAll("{url}", source.streamUrl)
        .replaceAll("{title}", title || source.itemId)
        .replaceAll("{itemId}", source.itemId)
        .replaceAll("{userAgent}", source.userAgent ?? "")
        .replaceAll("{startMs}", String(Math.max(0, Number(startMs ?? 0))))
        .replaceAll("{startSeconds}", seconds.toFixed(3)),
    ];
  });
}

async function openInExternalPlayer(payload) {
  const { server, account } = await requireActivePair();
  const settings = await store.getSettings();
  const source = await emby.mpvPlaybackSource(
    server,
    account,
    payload.itemId,
    payload.startMs ?? 0,
    true,
    {
      lineId: payload.lineId ?? null,
      mediaSourceId: payload.mediaSourceId ?? null,
    },
  );
  const playerPath = typeof settings.externalPlayerPath === "string"
    ? settings.externalPlayerPath.trim()
    : "";

  if (!playerPath) {
    await shell.openExternal(source.streamUrl);
    return;
  }
  if (!fs.existsSync(playerPath)) {
    throw new Error(`external player not found: ${playerPath}`);
  }

  const args = expandExternalPlayerArgs(
    settings,
    playerPath,
    source,
    payload.title ?? source.itemId,
    payload.startMs ?? 0,
  );
  const child = spawn(playerPath, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
}

async function runPlayRequest(payload) {
  const started = performance.now();
  const { server, account } = await requireActivePair();
  writePlaybackLog("play_request_start", {
    itemId: payload.itemId,
    startMs: payload.startMs ?? 0,
    preferDirect: payload.preferDirect ?? true,
    lineId: payload.lineId ?? null,
    mediaSourceId: payload.mediaSourceId ?? null,
    serverId: server.id,
    accountId: account.id,
    mpvLogPath: path.join(userDataDir, "mpv.log"),
  });
  try {
    const source = await emby.mpvPlaybackSource(
      server,
      account,
      payload.itemId,
      payload.startMs ?? 0,
      payload.preferDirect ?? true,
      {
        lineId: payload.lineId ?? null,
        mediaSourceId: payload.mediaSourceId ?? null,
      },
    );
    writePlaybackLog("play_source_ready", {
      itemId: source.itemId,
      playSessionId: source.playSessionId,
      mediaSourceId: source.mediaSourceId,
      lineId: source.lineId,
      streamUrl: source.streamUrl,
      durationMs: source.durationMs,
      tracks: source.tracks,
      diagnostics: source.diagnostics,
    });

    const loadResult = await mpv.load({
      url: source.streamUrl,
      headers: source.headers ?? [],
      userAgent: source.userAgent ?? null,
      startMs: payload.startMs ?? null,
    });
    await applySubtitleStyle(await store.getSettings()).catch((error) => {
      console.warn("failed to apply subtitle style", error);
    });
    currentPlaySession = {
      serverId: server.id,
      accountId: account.id,
      itemId: source.itemId,
      playSessionId: source.playSessionId,
      mediaSourceId: source.mediaSourceId,
      lineId: source.lineId,
    };
    const snapshot = await mpv.snapshot().catch(() => defaultSnapshot());
    writePlaybackLog("mpv_load_complete", {
      itemId: payload.itemId,
      playSessionId: source.playSessionId,
      elapsedMs: Math.round(performance.now() - started),
      loadResult,
      snapshot: {
        url: snapshot.url,
        durationMs: snapshot.durationMs,
        positionMs: snapshot.positionMs,
        paused: snapshot.paused,
        tracks: snapshot.tracks,
      },
    });
    return source;
  } catch (error) {
    writePlaybackLog("play_request_failed", {
      itemId: payload.itemId,
      elapsedMs: Math.round(performance.now() - started),
      error: error?.message ?? String(error),
    });
    throw error;
  }
}

function enqueuePlayRequest(payload) {
  const key = playRequestKey(payload);
  if (pendingPlay && pendingPlayKey === key) return pendingPlay;

  const request = playQueue.catch(() => null).then(() => runPlayRequest(payload));
  pendingPlay = request;
  request.then(
    () => {
      if (pendingPlay === request) {
        pendingPlay = null;
        pendingPlayKey = null;
      }
    },
    () => {
      if (pendingPlay === request) {
        pendingPlay = null;
        pendingPlayKey = null;
      }
    },
  );
  if (pendingPlay === request) {
    pendingPlayKey = key;
  }
  playQueue = request.catch(() => null);
  return request;
}

function mergeServer(existing, payload) {
  const next = {
    ...existing,
    ...payload,
    id: existing.id,
    createdAt: existing.createdAt,
  };
  if (payload.lines) {
    next.lines = createServer({
      ...existing,
      lines: payload.lines,
    }).lines;
    next.activeLineId =
      payload.activeLineId ??
      next.lines.find((line) => line.id === existing.activeLineId)?.id ??
      next.lines[0]?.id ??
      null;
  }
  return next;
}

async function handleInvoke(command, args = {}) {
  await storeReady;

  if (command === "open_external") {
    const url = typeof args === "string" ? args : args.url;
    if (typeof url !== "string" || url.length === 0) {
      throw new Error("open_external requires a url");
    }
    await shell.openExternal(url);
    return null;
  }

  if (command === "open_path") {
    const targetPath = typeof args === "string" ? args : args.path;
    if (typeof targetPath !== "string" || targetPath.length === 0) {
      throw new Error("open_path requires a path");
    }
    const error = await shell.openPath(targetPath);
    if (error) throw new Error(error);
    return null;
  }

  if (command === "set_always_on_top") {
    const enabled = Boolean(args.enabled);
    const target = BrowserWindow.getFocusedWindow() ?? getMainAppWindow();
    target?.setAlwaysOnTop(enabled, enabled ? "screen-saver" : "normal");
    return null;
  }

  if (command === "set_secondary_display_blackout") {
    return setSecondaryDisplayBlackout(args.enabled);
  }

  if (command === "embed_attach") {
    return attachEmbeddedMpvHost();
  }

  if (command === "embed_set_rect") {
    return setEmbeddedMpvRect(args.rect ?? {});
  }

  if (command === "embed_set_visible") {
    return setEmbeddedMpvVisible(args.visible);
  }

  if (command === "embed_detach") {
    return detachEmbeddedMpvHost();
  }

  if (command === "take_screenshot") {
    return takeMpvScreenshot(args.payload ?? {});
  }

  if (command === "get_settings") {
    return store.getSettings();
  }

  if (command === "update_settings") {
    const updated = await store.updateSettings(args.patch ?? {});
    await desktopIntegration?.reloadSettings();
    return updated;
  }

  if (command === "export_config") {
    const backup = await store.exportBackup();
    const stamp = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow() ?? undefined, {
      title: "导出配置",
      defaultPath: `hills-lite-config-${stamp}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return null;
    await fs.promises.writeFile(result.filePath, `${JSON.stringify(backup, null, 2)}\n`, "utf8");
    return {
      filePath: result.filePath,
      servers: backup.data.servers.length,
      accounts: backup.data.accounts.length,
      shortcuts: backup.data.globalShortcuts.length,
    };
  }

  if (command === "import_config") {
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() ?? undefined, {
      title: "导入配置",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const parsed = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
    const summary = await store.importBackup(parsed, { mode: args.payload?.mode ?? "merge" });
    emitAppEvent("config:imported", summary);
    return { ...summary, filePath };
  }

  if (command === "list_servers") {
    return store.listServers();
  }

  if (command === "detect_server") {
    const server = createServer({
      name: args.payload?.name ?? "Detect",
      kind: "emby",
      lines: args.payload?.lines ?? [],
      defaultUserAgent: args.payload?.defaultUserAgent ?? null,
    });
    return emby.detectServer(server);
  }

  if (command === "add_server") {
    const server = createServer(args.payload ?? {});
    return store.upsertServer(server);
  }

  if (command === "update_server") {
    const payload = args.payload ?? {};
    const servers = await store.listServers();
    const existing = servers.find((server) => server.id === payload.id);
    if (!existing) throw new Error(`server not found: ${payload.id}`);
    return store.upsertServer(mergeServer(existing, payload));
  }

  if (command === "remove_server") {
    await store.removeServer(args.id);
    return null;
  }

  if (command === "set_active_line") {
    const { serverId, lineId } = args.payload ?? {};
    const servers = await store.listServers();
    const server = servers.find((item) => item.id === serverId);
    if (!server) throw new Error(`server not found: ${serverId}`);
    if (!server.lines.some((line) => line.id === lineId)) {
      throw new Error(`line not found: ${lineId}`);
    }
    return store.upsertServer({ ...server, activeLineId: lineId });
  }

  if (command === "test_lines") {
    const servers = await store.listServers();
    const server = servers.find((item) => item.id === args.serverId);
    if (!server) throw new Error(`server not found: ${args.serverId}`);
    const reports = await Promise.all(
      server.lines.map((line) =>
        line.enabled
          ? emby.testLine(server, line)
          : Promise.resolve({
              lineId: line.id,
              status: "unknown",
              latencyMs: null,
              httpStatus: null,
              error: "line disabled",
            }),
      ),
    );
    const checkedAt = new Date().toISOString();
    const updated = {
      ...server,
      lines: server.lines.map((line) => {
        const report = reports.find((item) => item.lineId === line.id);
        return {
          ...line,
          lastLatencyMs: report?.latencyMs ?? null,
          lastStatus: report?.status ?? "unknown",
          lastCheckedAt: checkedAt,
        };
      }),
    };
    await store.upsertServer(updated);
    return { serverId: server.id, reports };
  }

  if (command === "list_accounts") {
    return store.listAccounts();
  }

  if (command === "login") {
    const { serverId, username, password } = args.payload ?? {};
    const servers = await store.listServers();
    const server = servers.find((item) => item.id === serverId);
    if (!server) throw new Error(`server not found: ${serverId}`);
    return emby.login(server, username, password);
  }

  if (command === "switch_account") {
    return store.setActiveAccount(args.accountId);
  }

  if (command === "logout") {
    await store.removeAccount(args.accountId);
    return null;
  }

  if (command === "list_views") {
    const { server, account } = await requireActivePair();
    return emby.listViews(server, account);
  }

  if (command === "list_items") {
    const { server, account } = await requireActivePair();
    const payload = args.payload ?? {};
    return emby.listItems(server, account, payload.parentId ?? null, payload.params ?? []);
  }

  if (command === "get_item_detail") {
    const { server, account } = await requireActivePair();
    return emby.getItem(server, account, args.itemId);
  }

  if (command === "search") {
    const { server, account } = await requireActivePair();
    return emby.search(server, account, args.term ?? "");
  }

  if (command === "resume_items") {
    const { server, account } = await requireActivePair();
    return emby.resumeItems(server, account);
  }

  if (command === "list_seasons") {
    const { server, account } = await requireActivePair();
    return emby.listSeasons(server, account, args.seriesId);
  }

  if (command === "list_episodes") {
    const { server, account } = await requireActivePair();
    const payload = args.payload ?? {};
    return emby.listEpisodes(server, account, payload.seriesId, payload.seasonId ?? null);
  }

  if (command === "similar_items") {
    const { server, account } = await requireActivePair();
    return emby.similarItems(server, account, args.itemId, args.limit ?? 18);
  }

  if (command === "special_features") {
    const { server, account } = await requireActivePair();
    return emby.specialFeatures(server, account, args.itemId, args.limit ?? 18);
  }

  if (command === "set_item_favorite") {
    const { server, account } = await requireActivePair();
    const payload = args.payload ?? {};
    return emby.setFavorite(server, account, payload.itemId, payload.value);
  }

  if (command === "set_item_played") {
    const { server, account } = await requireActivePair();
    const payload = args.payload ?? {};
    return emby.setPlayed(server, account, payload.itemId, payload.value);
  }

  if (command === "get_playback_source") {
    const { server, account } = await requireActivePair();
    const payload = args.payload ?? {};
    return emby.playbackSource(server, account, payload.itemId, payload.startMs ?? 0, {
      lineId: payload.lineId ?? null,
      mediaSourceId: payload.mediaSourceId ?? null,
    });
  }

  if (command === "play") {
    const payload = args.payload ?? {};
    return enqueuePlayRequest(payload);
  }

  if (command === "play_external") {
    const payload = args.payload ?? {};
    await openInExternalPlayer(payload);
    return null;
  }

  if (command === "report_playback_progress") {
    const { server, account } = await requireActivePair();
    await emby.reportProgress(server, account, args.progress ?? {});
    return null;
  }

  if (command === "report_playback_stopped") {
    const { server, account } = await requireActivePair();
    await emby.reportStopped(server, account, args.payload ?? {});
    if (
      !args.payload?.playSessionId ||
      currentPlaySession?.playSessionId === args.payload.playSessionId
    ) {
      currentPlaySession = null;
    }
    return null;
  }

  if (command === "get_state") {
    if (!mpv.isRunning()) return defaultSnapshot();
    try {
      return await mpv.snapshot();
    } catch {
      return defaultSnapshot();
    }
  }

  if (command === "pause") {
    return runMpvIfRunning(() => mpv.setProperty("pause", true));
  }

  if (command === "resume") {
    return runMpvIfRunning(() => mpv.setProperty("pause", false));
  }

  if (command === "stop") {
    if (mpv.isRunning()) await mpv.command(["stop"]);
    currentPlaySession = null;
    return null;
  }

  if (command === "seek") {
    const positionMs = Number(args.payload?.positionMs ?? 0);
    return runMpvIfRunning(() =>
      mpv.command(["seek", Math.max(0, positionMs) / 1000, "absolute"]),
    );
  }

  if (command === "set_speed") {
    return runMpvIfRunning(() => mpv.setProperty("speed", Number(args.payload?.speed ?? 1)));
  }

  if (command === "set_audio_track") {
    return runMpvIfRunning(async () => {
      const preserveCache = await preserveTrackSwitchCache();
      await mpv.setProperty("aid", Number(args.payload?.trackId));
      await dropBuffersAfterTrackSwitch(preserveCache);
    });
  }

  if (command === "set_subtitle_track") {
    const trackId = args.payload?.trackId;
    return runMpvIfRunning(async () => {
      const preserveCache = await preserveTrackSwitchCache();
      await mpv.setProperty("sid", trackId == null ? "no" : Number(trackId));
      await dropBuffersAfterTrackSwitch(preserveCache);
    });
  }

  if (command === "set_secondary_subtitle_track") {
    const trackId = args.payload?.trackId;
    return runMpvIfRunning(async () => {
      await mpv.setProperty("secondary-sid", trackId == null ? "no" : Number(trackId));
      await mpv.setProperty("secondary-sub-visibility", trackId != null);
    });
  }

  if (command === "set_volume") {
    return runMpvIfRunning(() => mpv.setProperty("volume", Number(args.payload?.volume ?? 80)));
  }

  if (command === "set_muted") {
    return runMpvIfRunning(() => mpv.setProperty("mute", Boolean(args.payload?.muted)));
  }

  if (command === "set_picture_mode") {
    return runMpvIfRunning(() => applyPictureMode(args.payload?.mode));
  }

  if (command === "show_mpv_stats_osd") {
    return runMpvIfRunning(() => showMpvStatsOsd(args.page ?? 1));
  }

  if (command === "set_now_playing") {
    desktopIntegration?.setNowPlaying(args.info ?? {});
    return null;
  }

  if (command === "set_now_playing_status") {
    desktopIntegration?.setNowPlayingStatus(args.payload?.status ?? "stopped");
    return null;
  }

  if (command === "set_now_playing_position") {
    desktopIntegration?.setNowPlayingPosition(args.payload ?? {});
    return null;
  }

  if (command === "clear_now_playing") {
    desktopIntegration?.clearNowPlaying();
    return null;
  }

  if (command === "add_subtitle") {
    const payload = args.payload ?? {};
    const commandArgs = ["sub-add", payload.source, payload.select === false ? "auto" : "select"];
    if (payload.title) commandArgs.push(payload.title);
    if (payload.lang) {
      if (!payload.title) commandArgs.push("");
      commandArgs.push(payload.lang);
    }
    return runMpvIfRunning(() => mpv.command(commandArgs));
  }

  if (command === "search_online_subtitles") {
    return searchOnlineSubtitles(args.payload ?? {});
  }

  if (command === "resolve_online_subtitle") {
    return resolveOnlineSubtitle(args.payload ?? {});
  }

  if (command === "remove_subtitle") {
    return runMpvIfRunning(() => mpv.command(["sub-remove", Number(args.payload?.trackId)]));
  }

  if (command === "set_subtitle_delay") {
    return runMpvIfRunning(() =>
      mpv.setProperty("sub-delay", Number(args.payload?.delayMs ?? 0) / 1000),
    );
  }

  if (command === "set_subtitle_scale") {
    return runMpvIfRunning(() =>
      mpv.setProperty("sub-scale", Number(args.payload?.scale ?? 1)),
    );
  }

  if (command === "set_subtitle_style") {
    return runMpvIfRunning(() => applySubtitleStyle(args.payload ?? {}));
  }

  if (command === "cycle_subtitle") {
    return runMpvIfRunning(() => mpv.command(["cycle", "sub"]));
  }

  if (command === "list_downloads") return downloads.list();
  if (command === "start_download") {
    return downloads.start(args.payload ?? {});
  }
  if (command === "pause_download") {
    await downloads.pause(args.payload?.id);
    return null;
  }
  if (command === "resume_download") {
    await downloads.resume(args.payload?.id);
    return null;
  }
  if (command === "cancel_download") {
    await downloads.cancel(args.payload?.id);
    return null;
  }
  if (command === "remove_download") {
    await downloads.remove(args.payload?.id, args.payload?.deleteFile === true);
    return null;
  }
  if (command === "play_local") {
    await downloads.playLocal(args.payload?.id, args.payload?.startMs ?? null);
    return null;
  }
  if (command === "play_file") {
    await playLocalFilePath(args.payload?.filePath, args.payload?.startMs ?? null);
    return null;
  }
  if (command === "list_notifications") return store.listNotifications();
  if (command === "unread_count") return store.unreadCount();
  if (command === "list_danmaku_providers") return danmaku.listProviders();
  if (command === "fetch_danmaku") return danmaku.fetch(args.itemId, args.provider ?? null);
  if (command === "import_danmaku_xml") return danmaku.importXml(args.payload?.filePath);
  if (command === "list_remote_sessions") {
    const { server, account } = await requireActivePair();
    return emby.listSessions(server, account);
  }
  if (command === "remote_playstate") {
    const { server, account } = await requireActivePair();
    const payload = args.payload ?? {};
    await emby.sendPlaystate(
      server,
      account,
      payload.sessionId,
      payload.command,
      payload.seekPositionTicks ?? null,
    );
    return null;
  }
  if (command === "remote_play") {
    const { server, account } = await requireActivePair();
    const payload = args.payload ?? {};
    await emby.sendPlay(
      server,
      account,
      payload.sessionId,
      payload.itemIds ?? [],
      payload.startPositionTicks ?? null,
    );
    return null;
  }
  if (command === "remote_set_volume") {
    const { server, account } = await requireActivePair();
    const payload = args.payload ?? {};
    await emby.sendGeneralCommand(server, account, payload.sessionId, "SetVolume", {
      Volume: Math.max(0, Math.min(100, Math.round(Number(payload.volume ?? 80)))),
    });
    return null;
  }
  if (command === "remote_display_message") {
    const { server, account } = await requireActivePair();
    const payload = args.payload ?? {};
    await emby.sendGeneralCommand(server, account, payload.sessionId, "DisplayMessage", {
      Header: payload.header ?? "Hills Lite",
      Text: payload.text ?? "",
      TimeoutMs: 5000,
    });
    return null;
  }
  if (command === "list_global_shortcuts") return store.listGlobalShortcuts();
  if (command === "set_global_shortcut") {
    const { action, accelerator } = args.payload ?? {};
    replaceElectronGlobalShortcut(action, accelerator);
    return store.setGlobalShortcut(action, accelerator);
  }
  if (command === "clear_global_shortcut") {
    const { action } = args.payload ?? {};
    unregisterElectronGlobalShortcut(action);
    return store.clearGlobalShortcut(action);
  }
  if (command === "reset_global_shortcuts") {
    globalShortcut.unregisterAll();
    registeredGlobalShortcuts.clear();
    const bindings = await store.resetGlobalShortcuts();
    for (const binding of bindings) {
      try {
        registerElectronGlobalShortcut(binding.action, binding.accelerator);
      } catch (error) {
        console.warn("failed to register default global shortcut", binding, error);
      }
    }
    return store.listGlobalShortcuts();
  }
  if (command === "list_subtitles") {
    if (!currentPlaySession) return null;
    const { server, account } = await pairForSession(currentPlaySession);
    return emby.listSubtitles(server, account, currentPlaySession);
  }

  if (command === "dismiss_notification") {
    const id = notificationId(args);
    await store.dismissNotification(id);
    emitAppEvent("notification:dismiss", { id });
    await emitNotificationUnread();
    return null;
  }

  if (command === "mark_notification_read") {
    const id = notificationId(args);
    await store.markNotificationRead(id);
    emitAppEvent("notification:updated", { id });
    await emitNotificationUnread();
    return null;
  }

  if (command === "mark_all_notifications_read") {
    await store.markAllNotificationsRead();
    emitAppEvent("notification:updated", { all: true });
    await emitNotificationUnread();
    return null;
  }

  if (command === "clear_notifications") {
    await store.clearNotifications();
    emitAppEvent("notification:cleared", {});
    await emitNotificationUnread();
    return null;
  }

  if (noOpCommands.has(command)) {
    return null;
  }

  throw new Error(`Electron backend command not migrated yet: ${command}`);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: "Hills Lite",
    backgroundColor: "#000000",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
  });
  mainWindow = win;

  win.once("ready-to-show", () => win.show());
  win.on("close", (event) => {
    if (desktopIntegration?.isQuitting()) return;
    if (!desktopIntegration?.shouldCloseToTray()) {
      desktopIntegration?.markQuitting();
      return;
    }
    event.preventDefault();
    if (secondaryBlackoutEnabled) setSecondaryDisplayBlackout(false);
    win.hide();
  });
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
    if (secondaryBlackoutEnabled) setSecondaryDisplayBlackout(false);
    destroyEmbedHostWindow();
  });

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
    if (process.env.HILLS_ELECTRON_OPEN_DEVTOOLS !== "0") {
      win.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    void win.loadFile(path.join(rootDir, "dist", "index.html"));
  }
}

ipcMain.handle("hills:platform:type", () => platformType());

ipcMain.handle("hills:dialog:open", async (_event, options = {}) => {
  const properties = [];
  if (options.directory) properties.push("openDirectory");
  else properties.push("openFile");
  if (options.multiple) properties.push("multiSelections");

  const result = await dialog.showOpenDialog({
    title: options.title,
    filters: options.filters,
    properties,
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  return options.multiple ? result.filePaths : result.filePaths[0];
});

ipcMain.handle("hills:invoke", async (_event, command, args = {}) => {
  return handleInvoke(command, args);
});

app.whenReady().then(async () => {
  protocol.handle("hills-image", handleImageProtocolRequest);
  createWindow();
  screen.on("display-added", refreshSecondaryDisplayBlackout);
  screen.on("display-removed", refreshSecondaryDisplayBlackout);
  screen.on("display-metrics-changed", refreshSecondaryDisplayBlackout);
  await desktopIntegration?.init().catch((error) => {
    console.warn("failed to initialize Electron desktop integration", error);
  });
  for (const url of [...extractProtocolUrls(process.argv), ...pendingProtocolUrls]) {
    desktopIntegration?.handleProtocolUrl(url);
  }
  pendingProtocolUrls.length = 0;
  await registerStoredGlobalShortcuts().catch((error) => {
    console.warn("failed to initialize Electron global shortcuts", error);
  });
  await downloads.resumePersisted().catch((error) => {
    console.warn("failed to resume persisted downloads", error);
  });

  app.on("activate", () => {
    if (!getMainAppWindow()) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  desktopIntegration?.markQuitting();
  desktopIntegration?.stopPowerSaveBlocker();
  setSecondaryDisplayBlackout(false);
  globalShortcut.unregisterAll();
  void mpv.shutdown();
});
