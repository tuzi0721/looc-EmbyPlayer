import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const DEFAULT_SETTINGS = {
  heartbeatIntervalSecs: 180,
  healthCheckIntervalSecs: 60,
  raceTimeoutMs: 3500,
  requestTimeoutMs: 15000,
  defaultUserAgent: "Hills Lite/0.1 (Electron)",
  firstRunCompleted: false,
  theme: "dark",
  blurStrength: 24,
  enableWindowVibrancy: true,
  mpvBackend: "ipc",
  externalPlayerPath: null,
  externalPlayerArgs: "",
  hardwareDecoding: true,
  mpvCacheMb: 256,
  hiddenServerIds: [],
  hideJavCodes: false,
  showNetworkSpeed: false,
  statsOverlayMode: "winui",
  blackoutOtherDisplays: false,
  preserveTrackSwitchCache: true,
  skipIntroOutroEnabled: false,
  skipIntroSeconds: 90,
  skipOutroSeconds: 90,
  screenshotIncludeSubtitles: true,
  appendAuthQuery: false,
  homeHeroStyle: "classic",
  closeToTray: true,
  traktSyncEnabled: false,
  traktUsername: null,
  traktSyncWatched: true,
  traktSyncRatings: true,
  traktSyncFavorites: false,
  danmakuOpacity: 0.85,
  danmakuSpeed: 1,
  danmakuFontSize: 22,
  danmakuAvoidSubtitles: true,
  danmakuBottomReservePct: 18,
  subtitleScale: 1,
  subtitleTextColor: "#FFFFFF",
  subtitleOutlineColor: "#000000",
  subtitleOutlineSize: 1.65,
  subtitleShadowOffset: 0,
  subtitlePositionPct: 100,
  subtitleForceStyle: false,
};

export const DEFAULT_GLOBAL_SHORTCUTS = [
  { action: "play_pause", accelerator: "MediaPlayPause" },
  { action: "stop", accelerator: "MediaStop" },
  { action: "next_track", accelerator: "MediaTrackNext" },
  { action: "prev_track", accelerator: "MediaTrackPrevious" },
  { action: "toggle_window", accelerator: "CommandOrControl+Alt+E" },
];

const EMPTY_STATE = {
  settings: DEFAULT_SETTINGS,
  servers: [],
  accounts: [],
  activeAccountId: null,
  notifications: [],
  downloads: [],
  globalShortcuts: DEFAULT_GLOBAL_SHORTCUTS,
};

function normalizeGlobalShortcuts(value, fallback = DEFAULT_GLOBAL_SHORTCUTS) {
  if (!Array.isArray(value)) return structuredClone(fallback);
  const seen = new Set();
  return value
    .filter((item) => {
      if (typeof item?.action !== "string" || typeof item?.accelerator !== "string") return false;
      if (item.action.trim().length === 0 || item.accelerator.trim().length === 0) return false;
      if (seen.has(item.action)) return false;
      seen.add(item.action);
      return true;
    })
    .map((item) => ({
      action: item.action.trim(),
      accelerator: item.accelerator.trim(),
    }));
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function textOrNull(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function normalizeNotificationAction(value) {
  if (!value || typeof value !== "object") return null;
  const kind = textOrNull(value.kind);
  const label = textOrNull(value.label);
  if (!kind || !label) return null;
  return {
    kind,
    label,
    payload: value.payload ?? null,
  };
}

function normalizeNotification(value) {
  if (!value || typeof value !== "object") return null;
  const title = textOrNull(value.title);
  if (!title) return null;
  const rawCreatedAt =
    textOrNull(value.createdAt) ?? textOrNull(value.created_at) ?? new Date().toISOString();
  const createdAt = Number.isNaN(Date.parse(rawCreatedAt)) ? new Date().toISOString() : rawCreatedAt;
  return {
    id: textOrNull(value.id) ?? randomUUID(),
    kind: oneOf(value.kind, ["info", "success", "warning", "error"], "info"),
    category: oneOf(value.category, ["download", "server", "auth", "system"], "system"),
    title,
    body: textOrNull(value.body),
    action: normalizeNotificationAction(value.action),
    createdAt,
    read: value.read === true,
    sticky: value.sticky === true,
    sourceId: textOrNull(value.sourceId) ?? textOrNull(value.source_id),
  };
}

function normalizeNotifications(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeNotification)
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 100);
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeHeaderPairs(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => Array.isArray(item) && item.length >= 2)
    .map(([name, headerValue]) => [String(name), String(headerValue)]);
}

function normalizeDownloadTask(value) {
  if (!value || typeof value !== "object") return null;
  const id = textOrNull(value.id);
  const filePath = textOrNull(value.filePath);
  const streamUrl = textOrNull(value.streamUrl);
  if (!id || !filePath || !streamUrl) return null;
  const now = new Date().toISOString();
  const status = oneOf(
    value.status,
    ["pending", "running", "paused", "completed", "failed", "cancelled"],
    "pending",
  );
  return {
    id,
    serverId: textOrNull(value.serverId) ?? "",
    accountId: textOrNull(value.accountId) ?? "",
    itemId: textOrNull(value.itemId) ?? "",
    mediaSourceId: textOrNull(value.mediaSourceId) ?? "",
    playSessionId: textOrNull(value.playSessionId) ?? "",
    title: textOrNull(value.title) ?? "Untitled",
    filePath,
    streamUrl,
    container: textOrNull(value.container),
    totalBytes: numberOrNull(value.totalBytes),
    downloadedBytes: numberOrNull(value.downloadedBytes) ?? 0,
    status,
    stealth: value.stealth === true,
    error: textOrNull(value.error),
    createdAt: textOrNull(value.createdAt) ?? now,
    updatedAt: textOrNull(value.updatedAt) ?? now,
    headers: normalizeHeaderPairs(value.headers),
    userAgent: textOrNull(value.userAgent),
  };
}

function normalizeDownloads(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeDownloadTask)
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

function normalizeBackupAccounts(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: textOrNull(item.id) ?? randomUUID(),
      serverId: textOrNull(item.serverId) ?? "",
      userId: textOrNull(item.userId) ?? "",
      username: textOrNull(item.username) ?? "",
      accessToken: textOrNull(item.accessToken) ?? "",
      avatarTag: textOrNull(item.avatarTag),
      createdAt: textOrNull(item.createdAt) ?? new Date().toISOString(),
      lastUsedAt: textOrNull(item.lastUsedAt) ?? new Date().toISOString(),
    }))
    .filter((item) => item.serverId && item.userId && item.accessToken);
}

function mergeById(existing, incoming) {
  const map = new Map();
  for (const item of existing) {
    if (item?.id) map.set(item.id, item);
  }
  for (const item of incoming) {
    if (item?.id) map.set(item.id, item);
  }
  return [...map.values()];
}

function mergeShortcuts(existing, incoming) {
  const map = new Map();
  for (const item of normalizeGlobalShortcuts(existing, [])) map.set(item.action, item);
  for (const item of normalizeGlobalShortcuts(incoming, [])) map.set(item.action, item);
  return [...map.values()];
}

async function readLegacyTauriState() {
  const appData = process.env.APPDATA;
  if (!appData) return null;
  const filePath = path.join(appData, "app.embyplayer", "config.json");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const servers = Array.isArray(parsed.servers) ? parsed.servers : [];
    const accounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
    if (servers.length === 0 && accounts.length === 0 && !parsed.settings) return null;
    return {
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      servers,
      accounts,
      activeAccountId: parsed.active_account_id ?? parsed.activeAccountId ?? accounts[0]?.id ?? null,
      notifications: normalizeNotifications(parsed.notifications),
      downloads: normalizeDownloads(parsed.downloads),
      globalShortcuts: normalizeGlobalShortcuts(
        parsed.global_shortcuts ?? parsed.globalShortcuts,
        DEFAULT_GLOBAL_SHORTCUTS,
      ),
    };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export class JsonStore {
  constructor(userDataDir) {
    this.filePath = path.join(userDataDir, "state.json");
    this.state = structuredClone(EMPTY_STATE);
    this.loaded = false;
    this.writeChain = Promise.resolve();
  }

  async load() {
    if (this.loaded) return this.state;
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      this.state = {
        ...structuredClone(EMPTY_STATE),
        ...parsed,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
        servers: Array.isArray(parsed.servers) ? parsed.servers : [],
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
        notifications: normalizeNotifications(parsed.notifications),
        downloads: normalizeDownloads(parsed.downloads),
        globalShortcuts: normalizeGlobalShortcuts(parsed.globalShortcuts),
      };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.state = (await readLegacyTauriState()) ?? structuredClone(EMPTY_STATE);
      await this.save();
    }
    if (this.state.servers.length === 0 && this.state.accounts.length === 0) {
      const legacy = await readLegacyTauriState();
      if (legacy && (legacy.servers.length > 0 || legacy.accounts.length > 0)) {
        this.state = legacy;
        await this.save();
      }
    }
    this.loaded = true;
    return this.state;
  }

  async save() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const body = `${JSON.stringify(this.state, null, 2)}\n`;
    this.writeChain = this.writeChain.then(() => fs.writeFile(this.filePath, body, "utf8"));
    await this.writeChain;
  }

  async getSettings() {
    await this.load();
    return { ...DEFAULT_SETTINGS, ...this.state.settings };
  }

  async updateSettings(patch) {
    await this.load();
    this.state.settings = { ...DEFAULT_SETTINGS, ...this.state.settings, ...patch };
    await this.save();
    return this.state.settings;
  }

  async listGlobalShortcuts() {
    await this.load();
    return structuredClone(this.state.globalShortcuts);
  }

  async setGlobalShortcut(action, accelerator) {
    await this.load();
    const binding = normalizeGlobalShortcuts([{ action, accelerator }], []);
    if (binding.length === 0) throw new Error("invalid global shortcut binding");
    const next = this.state.globalShortcuts.filter((item) => item.action !== binding[0].action);
    next.push(binding[0]);
    this.state.globalShortcuts = next;
    await this.save();
    return this.listGlobalShortcuts();
  }

  async clearGlobalShortcut(action) {
    await this.load();
    this.state.globalShortcuts = this.state.globalShortcuts.filter((item) => item.action !== action);
    await this.save();
    return this.listGlobalShortcuts();
  }

  async resetGlobalShortcuts() {
    await this.load();
    this.state.globalShortcuts = structuredClone(DEFAULT_GLOBAL_SHORTCUTS);
    await this.save();
    return this.listGlobalShortcuts();
  }

  async exportBackup() {
    await this.load();
    return {
      schema: "hills-lite-config",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        settings: { ...DEFAULT_SETTINGS, ...this.state.settings },
        servers: structuredClone(this.state.servers),
        accounts: structuredClone(this.state.accounts),
        activeAccountId: this.state.activeAccountId,
        globalShortcuts: structuredClone(this.state.globalShortcuts),
      },
    };
  }

  async importBackup(backup, options = {}) {
    await this.load();
    const data = backup?.data && typeof backup.data === "object" ? backup.data : backup;
    if (!data || typeof data !== "object") throw new Error("invalid backup file");

    const importedServers = Array.isArray(data.servers)
      ? data.servers.map((server) => createServer(server))
      : [];
    const importedAccounts = normalizeBackupAccounts(data.accounts);
    const importedSettingsPatch =
      data.settings && typeof data.settings === "object" ? data.settings : {};
    const importedSettings = { ...DEFAULT_SETTINGS, ...importedSettingsPatch };
    const importedShortcuts = normalizeGlobalShortcuts(
      data.globalShortcuts ?? data.global_shortcuts,
      this.state.globalShortcuts,
    );
    const mode = options.mode === "replace" ? "replace" : "merge";

    if (mode === "replace") {
      this.state.settings = importedSettings;
      this.state.servers = importedServers;
      this.state.accounts = importedAccounts;
      this.state.globalShortcuts = importedShortcuts;
    } else {
      this.state.settings = { ...DEFAULT_SETTINGS, ...this.state.settings, ...importedSettingsPatch };
      this.state.servers = mergeById(this.state.servers, importedServers);
      this.state.accounts = mergeById(this.state.accounts, importedAccounts);
      this.state.globalShortcuts = mergeShortcuts(this.state.globalShortcuts, importedShortcuts);
    }

    const activeAccountId = textOrNull(data.activeAccountId) ?? textOrNull(data.active_account_id);
    if (activeAccountId && this.state.accounts.some((account) => account.id === activeAccountId)) {
      this.state.activeAccountId = activeAccountId;
    } else if (!this.state.accounts.some((account) => account.id === this.state.activeAccountId)) {
      this.state.activeAccountId = this.state.accounts[0]?.id ?? null;
    }

    await this.save();
    return {
      mode,
      servers: importedServers.length,
      accounts: importedAccounts.length,
      shortcuts: importedShortcuts.length,
    };
  }

  async listNotifications() {
    await this.load();
    return structuredClone(normalizeNotifications(this.state.notifications));
  }

  async pushNotification(spec) {
    await this.load();
    const notification = normalizeNotification({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      read: false,
      sticky: false,
      ...spec,
    });
    if (!notification) throw new Error("invalid notification");
    this.state.notifications.unshift(notification);
    this.state.notifications = normalizeNotifications(this.state.notifications);
    await this.save();
    return structuredClone(notification);
  }

  async unreadCount() {
    await this.load();
    return this.state.notifications.filter((item) => !item.read).length;
  }

  async dismissNotification(id) {
    await this.load();
    this.state.notifications = this.state.notifications.filter((item) => item.id !== id);
    await this.save();
  }

  async markNotificationRead(id) {
    await this.load();
    const item = this.state.notifications.find((notification) => notification.id === id);
    if (item) item.read = true;
    await this.save();
  }

  async markAllNotificationsRead() {
    await this.load();
    for (const item of this.state.notifications) item.read = true;
    await this.save();
  }

  async clearNotifications() {
    await this.load();
    this.state.notifications = [];
    await this.save();
  }

  async listDownloads() {
    await this.load();
    return structuredClone(normalizeDownloads(this.state.downloads));
  }

  async getDownload(id) {
    await this.load();
    return structuredClone(this.state.downloads.find((item) => item.id === id) ?? null);
  }

  async upsertDownload(task) {
    await this.load();
    const normalized = normalizeDownloadTask(task);
    if (!normalized) throw new Error("invalid download task");
    const index = this.state.downloads.findIndex((item) => item.id === normalized.id);
    if (index >= 0) this.state.downloads[index] = normalized;
    else this.state.downloads.push(normalized);
    await this.save();
    return structuredClone(normalized);
  }

  async removeDownload(id) {
    await this.load();
    this.state.downloads = this.state.downloads.filter((item) => item.id !== id);
    await this.save();
  }

  async listServers() {
    await this.load();
    return this.state.servers;
  }

  async upsertServer(server) {
    await this.load();
    const index = this.state.servers.findIndex((item) => item.id === server.id);
    if (index >= 0) this.state.servers[index] = server;
    else this.state.servers.push(server);
    await this.save();
    return server;
  }

  async removeServer(id) {
    await this.load();
    this.state.servers = this.state.servers.filter((server) => server.id !== id);
    this.state.accounts = this.state.accounts.filter((account) => account.serverId !== id);
    if (!this.state.accounts.some((account) => account.id === this.state.activeAccountId)) {
      this.state.activeAccountId = this.state.accounts[0]?.id ?? null;
    }
    await this.save();
  }

  async listAccounts() {
    await this.load();
    const active = this.state.activeAccountId;
    return [...this.state.accounts].sort((left, right) => {
      if (left.id === active) return -1;
      if (right.id === active) return 1;
      return Date.parse(right.lastUsedAt) - Date.parse(left.lastUsedAt);
    });
  }

  async upsertAccount(account, active = false) {
    await this.load();
    const index = this.state.accounts.findIndex((item) => item.id === account.id);
    if (index >= 0) this.state.accounts[index] = account;
    else this.state.accounts.push(account);
    if (active) this.state.activeAccountId = account.id;
    await this.save();
    return account;
  }

  async removeAccount(id) {
    await this.load();
    this.state.accounts = this.state.accounts.filter((account) => account.id !== id);
    if (this.state.activeAccountId === id) {
      this.state.activeAccountId = this.state.accounts[0]?.id ?? null;
    }
    await this.save();
  }

  async setActiveAccount(id) {
    await this.load();
    const account = this.state.accounts.find((item) => item.id === id);
    if (!account) throw new Error(`account not found: ${id}`);
    account.lastUsedAt = new Date().toISOString();
    this.state.activeAccountId = id;
    await this.save();
    return account;
  }

  async activePair() {
    await this.load();
    const account =
      this.state.accounts.find((item) => item.id === this.state.activeAccountId) ??
      this.state.accounts[0] ??
      null;
    if (!account) throw new Error("no active account");
    const server = this.state.servers.find((item) => item.id === account.serverId);
    if (!server) throw new Error(`server not found: ${account.serverId}`);
    if (this.state.activeAccountId !== account.id) {
      this.state.activeAccountId = account.id;
      await this.save();
    }
    return { server, account };
  }
}

export function createServer(payload) {
  const now = new Date().toISOString();
  const lines = (payload.lines ?? []).map((line, index) => ({
    id: line.id ?? randomUUID(),
    name: line.name || `线路 ${index + 1}`,
    baseUrl: line.baseUrl,
    userAgent: line.userAgent ?? null,
    headers: line.headers ?? [],
    priority: line.priority ?? index,
    enabled: line.enabled ?? true,
    lastLatencyMs: line.lastLatencyMs ?? null,
    lastStatus: line.lastStatus ?? null,
    lastCheckedAt: line.lastCheckedAt ?? null,
  }));

  return {
    id: payload.id ?? randomUUID(),
    name: payload.name,
    kind: payload.kind ?? "emby",
    lines,
    activeLineId: payload.activeLineId ?? lines[0]?.id ?? null,
    defaultUserAgent: payload.defaultUserAgent ?? null,
    autoFailover: payload.autoFailover ?? true,
    createdAt: payload.createdAt ?? now,
  };
}
