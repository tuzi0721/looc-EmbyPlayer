import { Menu, Tray, nativeImage, powerSaveBlocker } from "electron";

const PROTOCOL_SCHEME = "rodelplayer";
const TRAY_ICON_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAPElEQVR4nO3OIQEAIAwAwYWiCuFoQB/CIIclAUOcePHuoq2RlQXAPbPvJwEAAAAAAAAAAAAAAPwLqAjgAOTrWnb1NUcCAAAAAElFTkSuQmCC";

function routeFromProtocolUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== `${PROTOCOL_SCHEME}:`) return null;

  const host = decodeURIComponent(url.hostname || "");
  const parts = url.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
  const action = url.searchParams.get("action") || host || parts[0] || "";
  const queryItemId = url.searchParams.get("itemId") || url.searchParams.get("id");
  const firstPayload = host && host !== action ? host : parts[0];
  const secondPayload = parts.length > 1 ? parts[1] : null;
  const itemId = queryItemId || secondPayload || firstPayload;

  if ((action === "play" || action === "player") && itemId) return `/player/${itemId}`;
  if ((action === "item" || action === "detail") && itemId) return `/item/${itemId}`;
  if (action === "downloads" || action === "download") return "/downloads";
  if (action === "remote") return "/remote";
  if (action === "settings") return "/settings";
  if (!host && parts.length > 0) return `/${parts.join("/")}`;
  return null;
}

export function extractProtocolUrls(argv = []) {
  return argv.filter((value) => {
    return typeof value === "string" && value.toLowerCase().startsWith(`${PROTOCOL_SCHEME}:`);
  });
}

export class DesktopIntegration {
  constructor({ app, store, getWindow, emit }) {
    this.app = app;
    this.store = store;
    this.getWindow = getWindow;
    this.emit = emit;
    this.tray = null;
    this.refreshTimer = null;
    this.powerSaveBlockerId = null;
    this.quitting = false;
    this.nowPlaying = null;
    this.playbackStatus = "stopped";
  }

  async init() {
    this.registerProtocolClient();
    this.createTray();
    await this.refreshTray();
  }

  markQuitting() {
    this.quitting = true;
  }

  isQuitting() {
    return this.quitting;
  }

  registerProtocolClient() {
    try {
      if (process.defaultApp && process.argv.length >= 2) {
        this.app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [process.argv[1]]);
      } else {
        this.app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
      }
    } catch (error) {
      console.warn("failed to register protocol client", error);
    }
  }

  createTray() {
    if (this.tray) return;
    const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL);
    this.tray = new Tray(icon);
    this.tray.setToolTip("Hills Lite");
    this.tray.on("click", () => this.toggleWindow());
  }

  showWindow() {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  hideWindow() {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;
    win.hide();
  }

  toggleWindow() {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;
    if (win.isVisible()) {
      if (win.isFocused()) win.hide();
      else win.focus();
    } else {
      this.showWindow();
    }
  }

  navigate(destination) {
    this.showWindow();
    this.emit("nav:goto", destination);
  }

  handleProtocolUrl(value) {
    const route = routeFromProtocolUrl(value);
    if (!route) return false;
    this.navigate(route);
    return true;
  }

  setNowPlaying(info) {
    this.nowPlaying = {
      title: typeof info?.title === "string" ? info.title : "",
      subtitle: typeof info?.subtitle === "string" ? info.subtitle : null,
      artist: typeof info?.artist === "string" ? info.artist : null,
      album: typeof info?.album === "string" ? info.album : null,
      durationMs: Number.isFinite(Number(info?.durationMs)) ? Number(info.durationMs) : null,
      positionMs: Number.isFinite(Number(info?.positionMs)) ? Number(info.positionMs) : null,
      thumbnailUrl: typeof info?.thumbnailUrl === "string" ? info.thumbnailUrl : null,
    };
    this.scheduleTrayRefresh();
  }

  setNowPlayingStatus(status) {
    this.playbackStatus = status === "playing" || status === "paused" ? status : "stopped";
    this.updatePowerSaveBlocker();
    this.scheduleTrayRefresh();
  }

  setNowPlayingPosition(payload) {
    if (!this.nowPlaying) return;
    this.nowPlaying = {
      ...this.nowPlaying,
      positionMs: Number.isFinite(Number(payload?.positionMs)) ? Number(payload.positionMs) : null,
      durationMs: Number.isFinite(Number(payload?.durationMs)) ? Number(payload.durationMs) : null,
    };
  }

  clearNowPlaying() {
    this.nowPlaying = null;
    this.playbackStatus = "stopped";
    this.stopPowerSaveBlocker();
    this.scheduleTrayRefresh();
  }

  updatePowerSaveBlocker() {
    if (this.playbackStatus === "playing") {
      if (this.powerSaveBlockerId == null) {
        this.powerSaveBlockerId = powerSaveBlocker.start("prevent-display-sleep");
      }
      return;
    }
    this.stopPowerSaveBlocker();
  }

  stopPowerSaveBlocker() {
    if (this.powerSaveBlockerId == null) return;
    if (powerSaveBlocker.isStarted(this.powerSaveBlockerId)) {
      powerSaveBlocker.stop(this.powerSaveBlockerId);
    }
    this.powerSaveBlockerId = null;
  }

  scheduleTrayRefresh() {
    if (!this.tray) return;
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTray().catch((error) => {
        console.warn("failed to refresh tray", error);
      });
    }, 200);
  }

  async refreshTray() {
    if (!this.tray) return;
    const [downloads, unread] = await Promise.all([
      this.store.listDownloads().catch(() => []),
      this.store.unreadCount().catch(() => 0),
    ]);
    const activeDownloads = downloads.filter((task) => {
      return ["pending", "running", "paused"].includes(task.status);
    }).length;
    const title = this.nowPlaying?.title || "未播放";
    const status =
      this.playbackStatus === "playing" ? "播放中" : this.playbackStatus === "paused" ? "已暂停" : "未播放";
    this.tray.setToolTip(
      `Hills Lite\n${status}: ${title}\n下载: ${activeDownloads} | 未读通知: ${unread}`,
    );
    this.tray.setContextMenu(this.buildTrayMenu(activeDownloads, unread));
  }

  buildTrayMenu(activeDownloads, unread) {
    return Menu.buildFromTemplate([
      { label: "显示窗口", click: () => this.showWindow() },
      { label: "隐藏窗口", click: () => this.hideWindow() },
      { type: "separator" },
      {
        label: `下载中心 (${activeDownloads})`,
        click: () => this.navigate("/downloads"),
      },
      {
        label: `通知中心 (${unread})`,
        click: () => this.navigate("/notifications-open"),
      },
      { label: "遥控", click: () => this.navigate("/remote") },
      { label: "设置", click: () => this.navigate("/settings") },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          this.markQuitting();
          this.app.quit();
        },
      },
    ]);
  }
}
