import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

import {
  downloadTransportCredentialKey,
  embyAccessTokenCredentialKey,
  serverLineHeadersCredentialKey,
} from "./secure-credentials.mjs";

export const DEFAULT_SETTINGS = {
  heartbeatIntervalSecs: 180,
  healthCheckIntervalSecs: 60,
  raceTimeoutMs: 3500,
  requestTimeoutMs: 15000,
  defaultUserAgent: "Hills Lite/0.1 (Electron)",
  theme: "dark",
  blurStrength: 24,
  accentColorDark: null,
  accentColorLight: null,
  progressColor: null,
  enableWindowVibrancy: true,
  closeToTray: false,
  ignoreSslErrors: false,
  networkProxyMode: "system",
  httpProxyUrl: "",
  preferredAudioLanguage: "",
  preferredSubtitleLanguage: "",
  forceStereoAudio: false,
  danmakuEnabledDefault: true,
  danmakuScrollMaxRows: 5,
  danmakuTopMaxRows: 3,
  danmakuBottomMaxRows: 3,
  danmakuBold: false,
  danmakuRememberSelection: true,
  externalMpvEnabled: false,
  externalMpvPath: null,
  externalMpvUseProxy: false,
  externalPotplayerEnabled: false,
  externalPotplayerPath: null,
  markWatchedThresholdPct: 90,
  imageCacheLimitMB: 1024,
  preferredVersionStrategy: "default",
  playerLogEnabled: false,
  mpvBackend: "ipc",
  externalPlayerPath: null,
  externalPlayerArgs: "",
  hardwareDecoding: true,
  hwdecMode: "auto",
  mpvCacheMb: 256,
  videoOutputDriver: "gpu-next",
  mpvCacheSecs: 0,
  lowQualityDecoding: false,
  hiddenServerIds: [],
  hideJavCodes: false,
  hideContinueWatching: false,
  showCoverRating: false,
  showNetworkSpeed: false,
  statsOverlayMode: "winui",
  blackoutOtherDisplays: false,
  preserveTrackSwitchCache: true,
  skipIntroOutroEnabled: false,
  skipIntroSeconds: 90,
  seekForwardSeconds: 10,
  seekBackwardSeconds: 10,
  longPressSpeedRate: 2.0,
  skipOutroSeconds: 90,
  screenshotIncludeSubtitles: true,
  appendAuthQuery: false,
  downloadDirectory: null,
  homeHeroStyle: "cinema",
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
  subtitleBold: false,
  subtitleSecondaryPositionPct: 0,
  anime4kMode: "off",
  danmakuApiBase: null,
};

export const DEFAULT_GLOBAL_SHORTCUTS = [
  { action: "play_pause", accelerator: "MediaPlayPause" },
  { action: "stop", accelerator: "MediaStop" },
  { action: "next_track", accelerator: "MediaNextTrack" },
  { action: "prev_track", accelerator: "MediaPreviousTrack" },
  { action: "toggle_window", accelerator: "CommandOrControl+Alt+E" },
];

const LEGACY_ACCELERATOR_ALIASES = new Map([
  ["MediaTrackNext", "MediaNextTrack"],
  ["MediaTrackPrevious", "MediaPreviousTrack"],
]);

const EMPTY_STATE = {
  settings: DEFAULT_SETTINGS,
  servers: [],
  accounts: [],
  activeAccountId: null,
  notifications: [],
  notificationsClearedAt: null,
  clearedNotificationKeys: [],
  downloads: [],
  globalShortcuts: DEFAULT_GLOBAL_SHORTCUTS,
};

function normalizeSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    Object.entries(DEFAULT_SETTINGS).map(([key, fallback]) => [
      key,
      Object.prototype.hasOwnProperty.call(source, key) ? source[key] : fallback,
    ]),
  );
}

function normalizeGlobalShortcuts(value, fallback = DEFAULT_GLOBAL_SHORTCUTS) {
  if (!Array.isArray(value)) return structuredClone(fallback);
  const seen = new Set();
  return value
    .filter((item) => {
      if (typeof item?.action !== "string" || typeof item?.accelerator !== "string") return false;
      const action = item.action.trim();
      const accelerator = item.accelerator.trim();
      if (action.length === 0 || accelerator.length === 0) return false;
      if (seen.has(action)) return false;
      seen.add(action);
      return true;
    })
    .map((item) => ({
      action: item.action.trim(),
      accelerator: LEGACY_ACCELERATOR_ALIASES.get(item.accelerator.trim()) ?? item.accelerator.trim(),
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

function isoOrNull(value) {
  const text = textOrNull(value);
  if (!text) return null;
  return Number.isNaN(Date.parse(text)) ? null : text;
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

function notificationKey(value) {
  const sourceId = textOrNull(value?.sourceId) ?? textOrNull(value?.source_id);
  const title = textOrNull(value?.title);
  if (!sourceId || !title) return null;
  const actionKind = textOrNull(value?.action?.kind) ?? "";
  return [
    oneOf(value.category, ["download", "server", "auth", "system"], "system"),
    sourceId,
    oneOf(value.kind, ["info", "success", "warning", "error"], "info"),
    title,
    actionKind,
  ].join("\u0000");
}

function normalizeNotificationKeys(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(textOrNull).filter(Boolean))].slice(-250);
}

function filterClearedNotifications(notifications, clearedAt, clearedKeys) {
  const clearedTime = clearedAt ? Date.parse(clearedAt) : null;
  const keys = new Set(clearedKeys);
  return notifications.filter((notification) => {
    const key = notificationKey(notification);
    if (key && keys.has(key)) return false;
    if (clearedTime != null && Date.parse(notification.createdAt) <= clearedTime) return false;
    return true;
  });
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
  const transportProtected = value.transportProtected === true;
  if (!id || !filePath || (!streamUrl && !transportProtected)) return null;
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
    streamUrl: streamUrl ?? "",
    transportProtected,
    transportFingerprint: textOrNull(value.transportFingerprint),
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

function accountIdentityKey(account) {
  const serverId = textOrNull(account?.serverId);
  if (!serverId) return `id:${textOrNull(account?.id) ?? ""}`;
  const userId = textOrNull(account?.userId);
  if (userId) return `${serverId}\u0000user:${userId}`;
  const username = textOrNull(account?.username);
  if (username) return `${serverId}\u0000name:${username.toLocaleLowerCase()}`;
  return `${serverId}\u0000id:${textOrNull(account?.id) ?? ""}`;
}

function accountTime(account) {
  const parsed = Date.parse(account?.lastUsedAt ?? account?.createdAt ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function preferredAccount(left, right, activeAccountId) {
  const leftActive = left?.id === activeAccountId;
  const rightActive = right?.id === activeAccountId;
  const preferred =
    rightActive && !leftActive
      ? right
      : leftActive && !rightActive
        ? left
        : accountTime(right) >= accountTime(left)
          ? right
          : left;
  const olderCreatedAt =
    accountTime(left) <= accountTime(right)
      ? (left?.createdAt ?? right?.createdAt)
      : (right?.createdAt ?? left?.createdAt);
  return {
    ...preferred,
    createdAt: olderCreatedAt ?? preferred.createdAt,
  };
}

function dedupeAccounts(accounts, activeAccountId) {
  const byIdentity = new Map();
  let active = activeAccountId;
  for (const account of accounts) {
    const key = accountIdentityKey(account);
    const existing = byIdentity.get(key);
    if (!existing) {
      byIdentity.set(key, account);
      continue;
    }
    const preferred = preferredAccount(existing, account, active);
    if (existing.id === active || account.id === active) active = preferred.id;
    byIdentity.set(key, preferred);
  }
  const list = [...byIdentity.values()];
  if (active && !list.some((account) => account.id === active)) {
    active = list[0]?.id ?? null;
  }
  return { accounts: list, activeAccountId: active ?? null };
}

function normalizeDownloads(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeDownloadTask)
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeBackupAccounts(value) {
  return value.map((item) => ({
    id: textOrNull(item.id),
    serverId: textOrNull(item.serverId),
    userId: textOrNull(item.userId),
    username: textOrNull(item.username) ?? "",
    accessToken: textOrNull(item.accessToken),
    avatarTag: textOrNull(item.avatarTag),
    createdAt: textOrNull(item.createdAt) ?? new Date().toISOString(),
    lastUsedAt: textOrNull(item.lastUsedAt) ?? new Date().toISOString(),
  }));
}

function normalizeAccountProfiles(value) {
  return value.map((item) => ({
    id: textOrNull(item.id),
    serverId: textOrNull(item.serverId),
    userId: textOrNull(item.userId),
    username: textOrNull(item.username) ?? "",
    avatarTag: textOrNull(item.avatarTag),
    createdAt: textOrNull(item.createdAt),
    lastUsedAt: textOrNull(item.lastUsedAt),
  }));
}

function stripAccountSecret(account) {
  const { accessToken: _accessToken, ...metadata } = account ?? {};
  return metadata;
}

function accountProfileForBackup(account) {
  const metadata = stripAccountSecret(account);
  return {
    id: textOrNull(metadata.id) ?? "",
    serverId: textOrNull(metadata.serverId) ?? "",
    userId: textOrNull(metadata.userId) ?? "",
    username: textOrNull(metadata.username) ?? "",
    avatarTag: textOrNull(metadata.avatarTag),
    createdAt: textOrNull(metadata.createdAt),
    lastUsedAt: textOrNull(metadata.lastUsedAt),
  };
}

const BACKUP_SCHEMA = "hills-lite-config";
const SENSITIVE_HEADER_NAME = /(?:authorization|authentication|proxy-auth|cookie|token|session|api[-_]?key|(?:^|[-_])key(?:$|[-_])|password|passwd|secret|signature|credential|jwt|hmac)/i;
const SENSITIVE_QUERY_NAME = /(?:^|[-_.])(?:api[-_]?key|key|token|auth(?:orization)?|session|password|passwd|secret|signature|sig|credential|jwt|hmac|ticket|code|sso)(?:$|[-_.])/i;

function backupError(message, code = "INVALID_BACKUP") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isSensitiveHeaderName(value) {
  return typeof value === "string" && SENSITIVE_HEADER_NAME.test(value);
}

function isSensitiveQueryName(value) {
  return typeof value === "string" && SENSITIVE_QUERY_NAME.test(value);
}

function suspiciousRawUrl(value) {
  if (typeof value !== "string") return false;
  if (/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*@/i.test(value.trim())) return true;
  const queryIndex = value.indexOf("?");
  if (queryIndex < 0) return false;
  const fragmentIndex = value.indexOf("#", queryIndex);
  const query = value.slice(queryIndex + 1, fragmentIndex < 0 ? undefined : fragmentIndex);
  return query.split("&").some((part) => {
    const rawName = part.split("=", 1)[0].replace(/\+/g, " ");
    try {
      return isSensitiveQueryName(decodeURIComponent(rawName));
    } catch {
      return isSensitiveQueryName(rawName);
    }
  });
}

function splitSensitiveUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return { publicUrl: value, protectedUrl: null };
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    if (suspiciousRawUrl(value)) {
      const wrapped = new Error("URL containing credentials or sensitive query parameters must be a valid URL");
      wrapped.code = "UNSAFE_URL";
      wrapped.cause = error;
      throw wrapped;
    }
    return { publicUrl: value, protectedUrl: null };
  }

  let containsSensitiveMaterial = Boolean(parsed.username || parsed.password);
  parsed.username = "";
  parsed.password = "";
  for (const key of [...parsed.searchParams.keys()]) {
    if (isSensitiveQueryName(key)) {
      parsed.searchParams.delete(key);
      containsSensitiveMaterial = true;
    }
  }
  return containsSensitiveMaterial
    ? { publicUrl: parsed.toString(), protectedUrl: value }
    : { publicUrl: value, protectedUrl: null };
}

function urlContainsSensitiveMaterial(value) {
  try {
    return Boolean(splitSensitiveUrl(value).protectedUrl);
  } catch {
    return true;
  }
}

function sanitizeBackupUrl(value) {
  return splitSensitiveUrl(value).publicUrl;
}

function canonicalPublicUrl(value) {
  const sanitized = sanitizeBackupUrl(value);
  try {
    return new URL(sanitized).toString();
  } catch {
    return sanitized;
  }
}

function sameHttpOrigin(left, right) {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    return (
      ["http:", "https:"].includes(leftUrl.protocol) &&
      ["http:", "https:"].includes(rightUrl.protocol) &&
      leftUrl.origin === rightUrl.origin
    );
  } catch {
    return false;
  }
}

function sanitizeServersForBackup(servers) {
  return structuredClone(servers).map((server) => ({
    ...server,
    lines: Array.isArray(server?.lines)
      ? server.lines.map((line) => {
          const {
            headersProtected: _headersProtected,
            headersFingerprint: _headersFingerprint,
            ...metadata
          } = line ?? {};
          return {
            ...metadata,
            baseUrl: sanitizeBackupUrl(line?.baseUrl),
            headers: normalizeHeaderPairs(line?.headers).filter(
              ([name]) => !isSensitiveHeaderName(name),
            ),
          };
        })
      : [],
  }));
}

function sameServerConnectionIdentity(existing, imported) {
  if (!existing || !imported || existing.id !== imported.id) return false;
  const importedLines = Array.isArray(imported.lines) ? imported.lines : [];
  if (importedLines.length === 0) return false;
  return importedLines.every((line) => {
    const existingLine = (existing.lines ?? []).find((candidate) => candidate.id === line.id);
    return existingLine && sameHttpOrigin(existingLine.baseUrl, line.baseUrl);
  });
}

function restoreOmittedServerCredentials(imported, existing) {
  if (!existing || existing.id !== imported.id) return imported;
  return {
    ...imported,
    lines: (imported.lines ?? []).map((line) => {
      const existingLine = (existing.lines ?? []).find((candidate) => candidate.id === line.id);
      if (!existingLine || !sameHttpOrigin(existingLine.baseUrl, line.baseUrl)) return line;

      const incomingHeaders = normalizeHeaderPairs(line.headers);
      const incomingNames = new Set(
        incomingHeaders.map(([name]) => name.toLocaleLowerCase()),
      );
      const preservedHeaders = normalizeHeaderPairs(existingLine.headers).filter(
        ([name]) =>
          isSensitiveHeaderName(name) &&
          !incomingNames.has(name.toLocaleLowerCase()),
      );
      const baseUrl =
        canonicalPublicUrl(existingLine.baseUrl) === canonicalPublicUrl(line.baseUrl)
          ? existingLine.baseUrl
          : line.baseUrl;
      return {
        ...line,
        baseUrl,
        headers: [...preservedHeaders, ...incomingHeaders],
      };
    }),
  };
}

function stripSecretsForChangedOrigin(imported, existing) {
  if (!existing) return imported;
  return {
    ...imported,
    lines: (imported.lines ?? []).map((line) => {
      const existingLine = (existing.lines ?? []).find((candidate) => candidate.id === line.id);
      if (!existingLine || sameHttpOrigin(existingLine.baseUrl, line.baseUrl)) return line;
      return {
        ...line,
        baseUrl: sanitizeBackupUrl(line.baseUrl),
        headers: normalizeHeaderPairs(line.headers).filter(
          ([name]) => !isSensitiveHeaderName(name),
        ),
      };
    }),
  };
}

function serializeLineCredential(headers, protectedBaseUrl) {
  return JSON.stringify({
    version: 1,
    headers: normalizeHeaderPairs(headers),
    baseUrl: protectedBaseUrl ?? null,
  });
}

function parseLineCredential(raw) {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    return { headers: normalizeHeaderPairs(parsed), baseUrl: null };
  }
  if (
    !isRecord(parsed) ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.headers) ||
    (parsed.baseUrl != null && typeof parsed.baseUrl !== "string")
  ) {
    throw new Error("invalid protected server line credential");
  }
  return {
    headers: normalizeHeaderPairs(parsed.headers),
    baseUrl: parsed.baseUrl ?? null,
  };
}

function secretFingerprint(body) {
  return createHash("sha256").update(body).digest("hex");
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

function validateBackupServer(server, index) {
  if (!isRecord(server)) throw backupError(`backup server ${index} must be an object`);
  if (!textOrNull(server.id)) throw backupError(`backup server ${index} is missing id`);
  if (!Array.isArray(server.lines)) throw backupError(`backup server ${index} is missing lines`);
  server.lines.forEach((line, lineIndex) => {
    if (!isRecord(line)) throw backupError(`backup server ${index} line ${lineIndex} must be an object`);
    if (!textOrNull(line.id)) throw backupError(`backup server ${index} line ${lineIndex} is missing id`);
    if (!textOrNull(line.baseUrl)) {
      throw backupError(`backup server ${index} line ${lineIndex} is missing baseUrl`);
    }
    if (line.headers != null && !Array.isArray(line.headers)) {
      throw backupError(`backup server ${index} line ${lineIndex} has invalid headers`);
    }
  });
}

function validateBackupAccount(account, index, profileOnly) {
  if (!isRecord(account)) throw backupError(`backup account ${index} must be an object`);
  for (const field of ["id", "serverId", "userId"]) {
    if (!textOrNull(account[field])) throw backupError(`backup account ${index} is missing ${field}`);
  }
  if (!profileOnly && !textOrNull(account.accessToken)) {
    throw backupError(`backup account ${index} is missing accessToken`);
  }
  if (profileOnly && Object.prototype.hasOwnProperty.call(account, "accessToken")) {
    throw backupError(`backup account profile ${index} must not contain accessToken`);
  }
}

function validateBackup(backup) {
  if (!isRecord(backup)) throw backupError("invalid backup file");
  if (backup.schema !== BACKUP_SCHEMA) throw backupError("unsupported backup schema");
  if (!Number.isInteger(backup.version)) throw backupError("backup version is missing or invalid");
  if (![1, 2].includes(backup.version)) {
    throw backupError(`unsupported backup version: ${backup.version}`, "UNSUPPORTED_BACKUP_VERSION");
  }
  if (!isRecord(backup.data)) throw backupError("backup data is missing");
  const { data } = backup;
  if (!isRecord(data.settings)) throw backupError("backup data.settings is required");
  if (!Array.isArray(data.servers)) throw backupError("backup data.servers is required");
  if (!Array.isArray(data.globalShortcuts ?? data.global_shortcuts)) {
    throw backupError("backup data.globalShortcuts is required");
  }
  if (!(data.activeAccountId == null || typeof data.activeAccountId === "string")) {
    throw backupError("backup data.activeAccountId must be a string or null");
  }
  data.servers.forEach(validateBackupServer);

  if (backup.version === 1) {
    if (!Array.isArray(data.accounts)) throw backupError("v1 backup data.accounts is required");
    data.accounts.forEach((account, index) => validateBackupAccount(account, index, false));
  } else {
    if (!isRecord(backup.security) || backup.security.credentials !== "omitted") {
      throw backupError("v2 backup must declare omitted credentials");
    }
    if (!Array.isArray(data.accountProfiles)) {
      throw backupError("v2 backup data.accountProfiles is required");
    }
    data.accountProfiles.forEach((account, index) => validateBackupAccount(account, index, true));
  }
  return {
    version: backup.version,
    data,
    credentialsOmitted: backup.version === 2,
  };
}

function protectedLineKeys(servers) {
  return new Set(
    servers.flatMap((server) =>
      (server.lines ?? [])
        .filter((line) => line.headersProtected === true)
        .map((line) => serverLineHeadersCredentialKey(server.id, line.id)),
    ),
  );
}

function hasCredentialChanges(changes) {
  return (changes.set?.size ?? 0) > 0 || (changes.delete?.size ?? 0) > 0;
}

function emptyCredentialChanges() {
  return { set: new Map(), delete: new Set() };
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
      settings: normalizeSettings(parsed.settings),
      servers,
      accounts,
      activeAccountId: parsed.active_account_id ?? parsed.activeAccountId ?? accounts[0]?.id ?? null,
      notifications: normalizeNotifications(parsed.notifications),
      downloads: normalizeDownloads(parsed.downloads),
      globalShortcuts: normalizeGlobalShortcuts(
        parsed.global_shortcuts ?? parsed.globalShortcuts,
        DEFAULT_GLOBAL_SHORTCUTS,
      ),
      notificationsClearedAt: null,
      clearedNotificationKeys: [],
    };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export class JsonStore {
  constructor(userDataDir, options = {}) {
    this.filePath = path.join(userDataDir, "state.json");
    this.credentialStore = options.credentialStore ?? null;
    this.state = structuredClone(EMPTY_STATE);
    this.loaded = false;
    this.loadPromise = null;
    this.writeChain = Promise.resolve();
    this.mutationChain = Promise.resolve();
    this.securityDegraded = false;
    this.securityDegradedReasons = [];
  }

  _storageStatus() {
    if (this.credentialStore?.status) return this.credentialStore.status();
    return {
      available: false,
      backend: "unavailable",
      degraded: true,
      reason: "secure credential store missing",
    };
  }

  securityStatus() {
    const storage = this._storageStatus();
    return {
      ...storage,
      degraded: storage.degraded === true || this.securityDegraded,
      legacyPlaintextRetained: this.securityDegraded,
      reasons: [...this.securityDegradedReasons],
    };
  }

  _markSecurityDegraded(reason) {
    this.securityDegraded = true;
    if (!this.securityDegradedReasons.includes(reason)) {
      this.securityDegradedReasons.push(reason);
      console.warn(`secure storage degraded: ${reason}`);
    }
  }

  _enqueueMutation(operation) {
    const result = this.mutationChain.then(operation, operation);
    this.mutationChain = result.catch(() => {});
    return result;
  }

  async _waitForMutations() {
    await this.mutationChain;
  }

  async _persistState(snapshot) {
    const body = `${JSON.stringify(snapshot, null, 2)}\n`;
    this.writeChain = this.writeChain.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(tempPath, body, "utf8");
        await fs.rename(tempPath, this.filePath);
      } catch (error) {
        await fs.rm(tempPath, { force: true }).catch(() => {});
        throw error;
      }
    });
    await this.writeChain;
  }

  async _commitState(nextState, changes = emptyCredentialChanges()) {
    const setEntries = changes.set instanceof Map ? new Map(changes.set) : new Map(changes.set ?? []);
    const deleteKeys = changes.delete instanceof Set ? new Set(changes.delete) : new Set(changes.delete ?? []);
    for (const key of setEntries.keys()) deleteKeys.delete(key);

    const persistState = () => this._persistState(nextState);
    if (setEntries.size > 0 || (deleteKeys.size > 0 && this.credentialStore)) {
      if (!this.credentialStore) {
        const error = new Error("secure credential storage is unavailable");
        error.code = "SECURE_STORAGE_UNAVAILABLE";
        throw error;
      }
      await this.credentialStore.transact(
        { set: [...setEntries.entries()], delete: [...deleteKeys] },
        persistState,
      );
    } else {
      await persistState();
    }
    this.state = nextState;
  }

  _planAccountForStorage(account, existing = null) {
    const id = textOrNull(account?.id);
    const serverId = textOrNull(account?.serverId);
    const userId = textOrNull(account?.userId);
    if (!id || !serverId || !userId) throw new Error("invalid account");

    const token = textOrNull(account?.accessToken);
    const metadata = stripAccountSecret({
      ...account,
      id,
      serverId,
      userId,
      username: textOrNull(account?.username) ?? "",
    });
    const changes = emptyCredentialChanges();
    if (token) {
      changes.set.set(embyAccessTokenCredentialKey(id), token);
      return { account: metadata, changes };
    }
    if (existing) {
      const legacyToken = textOrNull(existing.accessToken);
      return {
        account: {
          ...existing,
          ...metadata,
          ...(legacyToken ? { accessToken: legacyToken } : {}),
        },
        changes,
      };
    }
    throw new Error("account access token is required");
  }

  async _hydrateAccount(account) {
    const legacyToken = textOrNull(account?.accessToken);
    if (legacyToken) return { ...account, accessToken: legacyToken };
    if (!this.credentialStore || !account?.id) return { ...account, accessToken: "" };
    try {
      const token = textOrNull(
        await this.credentialStore.get(embyAccessTokenCredentialKey(account.id)),
      );
      return { ...account, accessToken: token ?? "" };
    } catch (error) {
      console.warn("failed to read protected account credential", account.id, error);
      return { ...account, accessToken: "" };
    }
  }

  _planServerForStorage(server, existing = null) {
    const serverId = textOrNull(server?.id);
    if (!serverId || !Array.isArray(server?.lines)) throw new Error("invalid server");
    const changes = emptyCredentialChanges();
    const lines = server.lines.map((line) => {
      const lineId = textOrNull(line?.id);
      if (!lineId) throw new Error("invalid server line");
      const existingLine = existing?.lines?.find((item) => item.id === lineId);
      const headers = normalizeHeaderPairs(line.headers);
      const { publicUrl, protectedUrl } = splitSensitiveUrl(line.baseUrl);
      const {
        headersProtected: _headersProtected,
        headersFingerprint: _headersFingerprint,
        ...lineMetadata
      } = line;

      if (headers.length === 0 && !protectedUrl) {
        if (line.headersProtected === true && existingLine?.headersProtected === true) {
          return {
            ...lineMetadata,
            id: lineId,
            baseUrl: publicUrl,
            headers: [],
            headersProtected: true,
            headersFingerprint: existingLine.headersFingerprint ?? null,
          };
        }
        return { ...lineMetadata, id: lineId, baseUrl: publicUrl, headers: [] };
      }

      const body = serializeLineCredential(headers, protectedUrl);
      const fingerprint = secretFingerprint(body);
      if (
        existingLine?.headersProtected !== true ||
        existingLine.headersFingerprint !== fingerprint
      ) {
        changes.set.set(serverLineHeadersCredentialKey(serverId, lineId), body);
      }
      return {
        ...lineMetadata,
        id: lineId,
        baseUrl: publicUrl,
        headers: [],
        headersProtected: true,
        headersFingerprint: fingerprint,
      };
    });
    return { server: { ...server, id: serverId, lines }, changes };
  }

  async _hydrateServer(server) {
    const lines = await Promise.all(
      (Array.isArray(server.lines) ? server.lines : []).map(async (line) => {
        const headers = normalizeHeaderPairs(line.headers);
        if (!line.headersProtected || !this.credentialStore) {
          return { ...line, headers };
        }
        try {
          const raw = await this.credentialStore.get(
            serverLineHeadersCredentialKey(server.id, line.id),
          );
          if (!raw) return { ...line, headers };
          const protectedConnection = parseLineCredential(raw);
          return {
            ...line,
            baseUrl: protectedConnection.baseUrl ?? line.baseUrl,
            headers: protectedConnection.headers,
          };
        } catch (error) {
          console.warn("failed to read protected server line credentials", server.id, line.id, error);
          return { ...line, headers };
        }
      }),
    );
    return { ...server, lines };
  }

  _planDownloadForStorage(task, existing = null) {
    const normalized = normalizeDownloadTask(task);
    if (!normalized) throw new Error("invalid download task");
    const changes = emptyCredentialChanges();
    if (!normalized.streamUrl) {
      if (normalized.transportProtected && existing?.transportProtected) {
        return { task: normalized, changes };
      }
      throw new Error("download transport is unavailable");
    }

    const transportBody = JSON.stringify({
      streamUrl: normalized.streamUrl,
      headers: normalized.headers,
      userAgent: normalized.userAgent,
    });
    const transportFingerprint = secretFingerprint(transportBody);
    if (
      existing?.transportProtected !== true ||
      existing.transportFingerprint !== transportFingerprint
    ) {
      changes.set.set(downloadTransportCredentialKey(normalized.id), transportBody);
    }
    return {
      task: {
        ...normalized,
        streamUrl: "",
        headers: [],
        userAgent: null,
        transportProtected: true,
        transportFingerprint,
      },
      changes,
    };
  }

  async _hydrateDownload(task) {
    const normalized = normalizeDownloadTask(task);
    if (!normalized) return null;
    if (normalized.streamUrl) return normalized;
    if (!normalized.transportProtected || !this.credentialStore) return null;
    try {
      const raw = await this.credentialStore.get(downloadTransportCredentialKey(normalized.id));
      if (!raw) return null;
      const transport = JSON.parse(raw);
      return normalizeDownloadTask({
        ...normalized,
        streamUrl: transport?.streamUrl,
        headers: transport?.headers,
        userAgent: transport?.userAgent,
        transportProtected: true,
      });
    } catch (error) {
      console.warn("failed to read protected download transport", normalized.id, error);
      return null;
    }
  }

  _legacyPlaintextSecretCount(state) {
    let count = 0;
    for (const account of state.accounts) {
      if (textOrNull(account?.accessToken)) count += 1;
    }
    for (const server of state.servers) {
      for (const line of server?.lines ?? []) {
        if (normalizeHeaderPairs(line?.headers).length > 0 || urlContainsSensitiveMaterial(line?.baseUrl)) {
          count += 1;
        }
      }
    }
    for (const task of state.downloads) {
      if (textOrNull(task?.streamUrl)) count += 1;
    }
    return count;
  }

  _planLegacySecretMigration(state) {
    const nextState = structuredClone(state);
    const changes = emptyCredentialChanges();

    nextState.accounts = nextState.accounts.map((account) => {
      const token = textOrNull(account?.accessToken);
      if (!token) return account;
      changes.set.set(embyAccessTokenCredentialKey(account.id), token);
      return stripAccountSecret(account);
    });

    nextState.servers = nextState.servers.map((server) => {
      const planned = this._planServerForStorage(server, server);
      for (const [key, value] of planned.changes.set) changes.set.set(key, value);
      return planned.server;
    });

    nextState.downloads = nextState.downloads.map((task) => {
      if (!textOrNull(task?.streamUrl)) return task;
      const planned = this._planDownloadForStorage(task, task);
      for (const [key, value] of planned.changes.set) changes.set.set(key, value);
      return planned.task;
    });
    return { nextState, changes };
  }

  async load() {
    if (this.loaded) return this.state;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      let shouldSave = false;
      try {
        const raw = await fs.readFile(this.filePath, "utf8");
        const parsed = JSON.parse(raw);
        this.state = {
          ...structuredClone(EMPTY_STATE),
          ...parsed,
          settings: normalizeSettings(parsed.settings),
          servers: Array.isArray(parsed.servers) ? parsed.servers : [],
          accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
          notificationsClearedAt: isoOrNull(parsed.notificationsClearedAt),
          clearedNotificationKeys: normalizeNotificationKeys(parsed.clearedNotificationKeys),
          notifications: filterClearedNotifications(
            normalizeNotifications(parsed.notifications),
            isoOrNull(parsed.notificationsClearedAt),
            normalizeNotificationKeys(parsed.clearedNotificationKeys),
          ),
          downloads: normalizeDownloads(parsed.downloads),
          globalShortcuts: normalizeGlobalShortcuts(parsed.globalShortcuts),
        };
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        this.state = (await readLegacyTauriState()) ?? structuredClone(EMPTY_STATE);
        shouldSave = true;
      }

      const deduped = dedupeAccounts(this.state.accounts, this.state.activeAccountId);
      if (
        deduped.accounts.length !== this.state.accounts.length ||
        deduped.activeAccountId !== this.state.activeAccountId
      ) {
        this.state = {
          ...this.state,
          accounts: deduped.accounts,
          activeAccountId: deduped.activeAccountId,
        };
        shouldSave = true;
      }

      const legacySecretCount = this._legacyPlaintextSecretCount(this.state);
      if (legacySecretCount > 0) {
        const status = this._storageStatus();
        if (!status.available) {
          this._markSecurityDegraded(
            `${legacySecretCount} legacy plaintext credential record(s) retained because ${status.reason ?? "secure storage is unavailable"}`,
          );
        } else {
          const migration = this._planLegacySecretMigration(this.state);
          await this._commitState(migration.nextState, migration.changes);
          shouldSave = false;
        }
      }
      if (shouldSave) await this._persistState(this.state);

      this.loaded = true;
      return this.state;
    })();
    try {
      return await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }
  async save() {
    await this.load();
    return this._enqueueMutation(async () => {
      await this._persistState(this.state);
    });
  }

  async getSettings() {
    await this.load();
    await this._waitForMutations();
    return normalizeSettings(this.state.settings);
  }

  getSettingsSync() {
    return normalizeSettings(this.state.settings);
  }

  async updateSettings(patch) {
    await this.load();
    return this._enqueueMutation(async () => {
      const nextState = {
        ...this.state,
        settings: normalizeSettings({ ...this.state.settings, ...patch }),
      };
      await this._commitState(nextState);
      return structuredClone(nextState.settings);
    });
  }

  async listGlobalShortcuts() {
    await this.load();
    await this._waitForMutations();
    return structuredClone(this.state.globalShortcuts);
  }

  async setGlobalShortcut(action, accelerator) {
    await this.load();
    return this._enqueueMutation(async () => {
      const binding = normalizeGlobalShortcuts([{ action, accelerator }], []);
      if (binding.length === 0) throw new Error("invalid global shortcut binding");
      const next = this.state.globalShortcuts.filter((item) => item.action !== binding[0].action);
      next.push(binding[0]);
      const nextState = { ...this.state, globalShortcuts: next };
      await this._commitState(nextState);
      return structuredClone(next);
    });
  }

  async clearGlobalShortcut(action) {
    await this.load();
    return this._enqueueMutation(async () => {
      const shortcuts = this.state.globalShortcuts.filter((item) => item.action !== action);
      await this._commitState({ ...this.state, globalShortcuts: shortcuts });
      return structuredClone(shortcuts);
    });
  }

  async resetGlobalShortcuts() {
    await this.load();
    return this._enqueueMutation(async () => {
      const shortcuts = structuredClone(DEFAULT_GLOBAL_SHORTCUTS);
      await this._commitState({ ...this.state, globalShortcuts: shortcuts });
      return structuredClone(shortcuts);
    });
  }

  async exportBackup() {
    await this.load();
    await this._waitForMutations();
    const hydratedServers = await Promise.all(
      this.state.servers.map((server) => this._hydrateServer(server)),
    );
    return {
      schema: BACKUP_SCHEMA,
      version: 2,
      exportedAt: new Date().toISOString(),
      security: {
        credentials: "omitted",
        note: "Account tokens, URL credentials, sensitive query parameters and sensitive headers are not included.",
      },
      data: {
        settings: normalizeSettings(this.state.settings),
        servers: sanitizeServersForBackup(hydratedServers),
        accountProfiles: this.state.accounts.map(accountProfileForBackup),
        activeAccountId: this.state.activeAccountId,
        globalShortcuts: structuredClone(this.state.globalShortcuts),
      },
    };
  }

  async importBackup(backup, options = {}) {
    const validated = validateBackup(backup);
    await this.load();
    return this._enqueueMutation(async () => {
      const { data, version, credentialsOmitted } = validated;
      const mode = options.mode === "replace" ? "replace" : "merge";
      const currentState = this.state;
      const existingHydratedServers = credentialsOmitted
        ? await Promise.all(currentState.servers.map((server) => this._hydrateServer(server)))
        : [];
      const createdServers = data.servers.map((server) => createServer(server));
      const trustedServers = new Map(
        createdServers.map((server) => {
          const existing = existingHydratedServers.find((item) => item.id === server.id);
          return [server.id, sameServerConnectionIdentity(existing, server)];
        }),
      );
      const restoredServers = createdServers.map((server) => {
        if (!credentialsOmitted) return server;
        const existing = existingHydratedServers.find((item) => item.id === server.id);
        return restoreOmittedServerCredentials(server, existing);
      });

      const changes = emptyCredentialChanges();
      const importedServers = restoredServers.map((server) => {
        const existing = currentState.servers.find((item) => item.id === server.id);
        const planned = this._planServerForStorage(server, existing);
        for (const [key, value] of planned.changes.set) changes.set.set(key, value);
        return planned.server;
      });

      let importedAccountCount = 0;
      let nextAccounts;
      if (version === 1) {
        const importedAccounts = normalizeBackupAccounts(data.accounts).map((account) => {
          const existing = currentState.accounts.find((item) => item.id === account.id);
          const planned = this._planAccountForStorage(account, existing);
          for (const [key, value] of planned.changes.set) changes.set.set(key, value);
          return planned.account;
        });
        importedAccountCount = importedAccounts.length;
        nextAccounts =
          mode === "replace"
            ? importedAccounts
            : mergeById(currentState.accounts, importedAccounts);
      } else {
        const profiles = normalizeAccountProfiles(data.accountProfiles);
        importedAccountCount = profiles.length;
        const retainedProfiles = profiles
          .map((profile) => {
            const existing = currentState.accounts.find(
              (account) =>
                account.id === profile.id &&
                account.serverId === profile.serverId &&
                account.userId === profile.userId,
            );
            if (!existing || trustedServers.get(profile.serverId) !== true) return null;
            return {
              ...existing,
              ...profile,
              id: existing.id,
              serverId: existing.serverId,
              userId: existing.userId,
              createdAt: profile.createdAt ?? existing.createdAt,
              lastUsedAt: profile.lastUsedAt ?? existing.lastUsedAt,
            };
          })
          .filter(Boolean);

        if (mode === "replace") {
          nextAccounts = retainedProfiles;
        } else {
          const importedServerIds = new Set(importedServers.map((server) => server.id));
          const byId = new Map(
            currentState.accounts
              .filter(
                (account) =>
                  !importedServerIds.has(account.serverId) ||
                  trustedServers.get(account.serverId) === true,
              )
              .map((account) => [account.id, account]),
          );
          for (const account of retainedProfiles) byId.set(account.id, account);
          nextAccounts = [...byId.values()];
        }
      }

      const nextServers =
        mode === "replace"
          ? importedServers
          : mergeById(currentState.servers, importedServers);
      const serverIds = new Set(nextServers.map((server) => server.id));
      nextAccounts = nextAccounts.filter((account) => serverIds.has(account.serverId));

      const importedSettingsPatch = data.settings;
      const nextSettings =
        mode === "replace"
          ? normalizeSettings(importedSettingsPatch)
          : normalizeSettings({ ...currentState.settings, ...importedSettingsPatch });
      const normalizedShortcuts = normalizeGlobalShortcuts(
        data.globalShortcuts ?? data.global_shortcuts,
        [],
      );
      const nextShortcuts =
        mode === "replace"
          ? normalizedShortcuts
          : mergeShortcuts(currentState.globalShortcuts, normalizedShortcuts);

      const deduped = dedupeAccounts(nextAccounts, currentState.activeAccountId);
      nextAccounts = deduped.accounts;
      let nextActiveAccountId = deduped.activeAccountId;
      const requestedActiveAccountId = textOrNull(data.activeAccountId);
      if (
        requestedActiveAccountId &&
        nextAccounts.some((account) => account.id === requestedActiveAccountId)
      ) {
        nextActiveAccountId = requestedActiveAccountId;
      } else if (!nextAccounts.some((account) => account.id === nextActiveAccountId)) {
        nextActiveAccountId = nextAccounts[0]?.id ?? null;
      }

      const nextState = {
        ...currentState,
        settings: nextSettings,
        servers: nextServers,
        accounts: nextAccounts,
        activeAccountId: nextActiveAccountId,
        globalShortcuts: nextShortcuts,
      };

      const nextLineKeys = protectedLineKeys(nextServers);
      for (const key of protectedLineKeys(currentState.servers)) {
        if (!nextLineKeys.has(key)) changes.delete.add(key);
      }
      const nextAccountIds = new Set(nextAccounts.map((account) => account.id));
      for (const account of currentState.accounts) {
        if (account.id && !nextAccountIds.has(account.id)) {
          changes.delete.add(embyAccessTokenCredentialKey(account.id));
        }
      }

      await this._commitState(nextState, changes);
      return {
        mode,
        servers: importedServers.length,
        accounts: importedAccountCount,
        shortcuts: normalizedShortcuts.length,
        credentialsImported: version === 1 && importedAccountCount > 0,
      };
    });
  }
  async listNotifications() {
    await this.load();
    await this._waitForMutations();
    return structuredClone(normalizeNotifications(this.state.notifications));
  }

  async pushNotification(spec) {
    await this.load();
    return this._enqueueMutation(async () => {
      const notification = normalizeNotification({
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        read: false,
        sticky: false,
        ...spec,
      });
      if (!notification) throw new Error("invalid notification");
      const key = notificationKey(notification);
      if (key && this.state.clearedNotificationKeys.includes(key)) return null;
      const notifications = [...this.state.notifications];
      const existingIndex = key
        ? notifications.findIndex((item) => notificationKey(item) === key)
        : -1;
      if (existingIndex >= 0) {
        notification.id = notifications[existingIndex].id;
        notification.read = notifications[existingIndex].read;
        notifications[existingIndex] = notification;
      } else {
        notifications.unshift(notification);
      }
      const nextState = {
        ...this.state,
        notifications: normalizeNotifications(notifications),
      };
      await this._commitState(nextState);
      return structuredClone(notification);
    });
  }

  async unreadCount() {
    await this.load();
    await this._waitForMutations();
    return this.state.notifications.filter((item) => !item.read).length;
  }

  async dismissNotification(id) {
    await this.load();
    return this._enqueueMutation(async () => {
      const notification = this.state.notifications.find((item) => item.id === id);
      const key = notificationKey(notification);
      const clearedNotificationKeys = key
        ? normalizeNotificationKeys([...this.state.clearedNotificationKeys, key])
        : this.state.clearedNotificationKeys;
      await this._commitState({
        ...this.state,
        clearedNotificationKeys,
        notifications: this.state.notifications.filter((item) => item.id !== id),
      });
    });
  }

  async markNotificationRead(id) {
    await this.load();
    return this._enqueueMutation(async () => {
      const notifications = this.state.notifications.map((notification) =>
        notification.id === id ? { ...notification, read: true } : notification,
      );
      await this._commitState({ ...this.state, notifications });
    });
  }

  async markAllNotificationsRead() {
    await this.load();
    return this._enqueueMutation(async () => {
      const notifications = this.state.notifications.map((item) => ({ ...item, read: true }));
      await this._commitState({ ...this.state, notifications });
    });
  }

  async clearNotifications() {
    await this.load();
    return this._enqueueMutation(async () => {
      const keys = this.state.notifications.map(notificationKey).filter(Boolean);
      await this._commitState({
        ...this.state,
        notificationsClearedAt: new Date().toISOString(),
        clearedNotificationKeys: normalizeNotificationKeys([
          ...this.state.clearedNotificationKeys,
          ...keys,
        ]),
        notifications: [],
      });
    });
  }

  async listDownloads() {
    await this.load();
    await this._waitForMutations();
    const hydrated = await Promise.all(
      normalizeDownloads(this.state.downloads).map((task) => this._hydrateDownload(task)),
    );
    return structuredClone(hydrated.filter(Boolean));
  }

  async getDownload(id) {
    await this.load();
    await this._waitForMutations();
    const task = this.state.downloads.find((item) => item.id === id) ?? null;
    return structuredClone(task ? await this._hydrateDownload(task) : null);
  }

  async upsertDownload(task) {
    await this.load();
    return this._enqueueMutation(async () => {
      const existing = this.state.downloads.find((item) => item.id === task?.id) ?? null;
      const planned = this._planDownloadForStorage(task, existing);
      const downloads = this.state.downloads.filter((item) => item.id !== planned.task.id);
      downloads.push(planned.task);
      await this._commitState({ ...this.state, downloads }, planned.changes);
      return structuredClone(await this._hydrateDownload(planned.task));
    });
  }

  async removeDownload(id) {
    await this.load();
    return this._enqueueMutation(async () => {
      const existed = this.state.downloads.some((item) => item.id === id);
      if (!existed) return;
      const changes = emptyCredentialChanges();
      changes.delete.add(downloadTransportCredentialKey(id));
      await this._commitState(
        {
          ...this.state,
          downloads: this.state.downloads.filter((item) => item.id !== id),
        },
        changes,
      );
    });
  }

  async listServers() {
    await this.load();
    await this._waitForMutations();
    return Promise.all(this.state.servers.map((server) => this._hydrateServer(server)));
  }

  async upsertServer(server) {
    await this.load();
    return this._enqueueMutation(async () => {
      let incoming = createServer(server);
      const existing = this.state.servers.find((item) => item.id === incoming.id) ?? null;
      const existingHydrated = existing ? await this._hydrateServer(existing) : null;
      const identityTrusted = !existing || sameServerConnectionIdentity(existingHydrated, incoming);
      if (existing && !identityTrusted) {
        incoming = stripSecretsForChangedOrigin(incoming, existingHydrated);
      }

      const planned = this._planServerForStorage(incoming, existing);
      const servers = this.state.servers.filter((item) => item.id !== planned.server.id);
      servers.push(planned.server);
      let accounts = this.state.accounts;
      const changes = planned.changes;
      if (existing && !identityTrusted) {
        const removedAccounts = accounts.filter((account) => account.serverId === planned.server.id);
        accounts = accounts.filter((account) => account.serverId !== planned.server.id);
        for (const account of removedAccounts) {
          if (account.id) changes.delete.add(embyAccessTokenCredentialKey(account.id));
        }
      }

      const nextLineKeys = protectedLineKeys([planned.server]);
      for (const key of protectedLineKeys(existing ? [existing] : [])) {
        if (!nextLineKeys.has(key)) changes.delete.add(key);
      }
      const activeAccountId = accounts.some((account) => account.id === this.state.activeAccountId)
        ? this.state.activeAccountId
        : (accounts[0]?.id ?? null);
      await this._commitState(
        { ...this.state, servers, accounts, activeAccountId },
        changes,
      );
      return this._hydrateServer(planned.server);
    });
  }

  async removeServer(id) {
    await this.load();
    return this._enqueueMutation(async () => {
      const removedServer = this.state.servers.find((server) => server.id === id);
      if (!removedServer) return;
      const removedAccounts = this.state.accounts.filter((account) => account.serverId === id);
      const accounts = this.state.accounts.filter((account) => account.serverId !== id);
      const changes = emptyCredentialChanges();
      for (const key of protectedLineKeys([removedServer])) changes.delete.add(key);
      for (const account of removedAccounts) {
        if (account.id) changes.delete.add(embyAccessTokenCredentialKey(account.id));
      }
      const activeAccountId = accounts.some((account) => account.id === this.state.activeAccountId)
        ? this.state.activeAccountId
        : (accounts[0]?.id ?? null);
      await this._commitState(
        {
          ...this.state,
          servers: this.state.servers.filter((server) => server.id !== id),
          accounts,
          activeAccountId,
        },
        changes,
      );
    });
  }
  async listAccounts() {
    await this.load();
    await this._waitForMutations();
    const active = this.state.activeAccountId;
    const sorted = [...this.state.accounts].sort((left, right) => {
      if (left.id === active) return -1;
      if (right.id === active) return 1;
      return Date.parse(right.lastUsedAt) - Date.parse(left.lastUsedAt);
    });
    const hydrated = await Promise.all(sorted.map((account) => this._hydrateAccount(account)));
    return hydrated.filter((account) => textOrNull(account.accessToken));
  }

  async upsertAccount(account, active = false) {
    await this.load();
    return this._enqueueMutation(async () => {
      const key = accountIdentityKey(account);
      const existing = this.state.accounts.find((item) => accountIdentityKey(item) === key) ?? null;
      const nextAccount = existing
        ? {
            ...account,
            id: existing.id,
            createdAt: existing.createdAt ?? account.createdAt,
          }
        : account;
      const planned = this._planAccountForStorage(nextAccount, existing);
      const deduped = dedupeAccounts(
        [...this.state.accounts.filter((item) => item.id !== planned.account.id), planned.account],
        active ? planned.account.id : this.state.activeAccountId,
      );
      const changes = planned.changes;
      const nextIds = new Set(deduped.accounts.map((item) => item.id));
      for (const current of this.state.accounts) {
        if (current.id && !nextIds.has(current.id)) {
          changes.delete.add(embyAccessTokenCredentialKey(current.id));
        }
      }
      const nextState = {
        ...this.state,
        accounts: deduped.accounts,
        activeAccountId: deduped.activeAccountId,
      };
      await this._commitState(nextState, changes);
      const saved =
        nextState.accounts.find(
          (item) => accountIdentityKey(item) === accountIdentityKey(planned.account),
        ) ?? planned.account;
      return this._hydrateAccount(saved);
    });
  }

  async removeAccount(id) {
    await this.load();
    return this._enqueueMutation(async () => {
      if (!this.state.accounts.some((account) => account.id === id)) return;
      const accounts = this.state.accounts.filter((account) => account.id !== id);
      const activeAccountId = this.state.activeAccountId === id
        ? (accounts[0]?.id ?? null)
        : this.state.activeAccountId;
      const changes = emptyCredentialChanges();
      changes.delete.add(embyAccessTokenCredentialKey(id));
      await this._commitState(
        { ...this.state, accounts, activeAccountId },
        changes,
      );
    });
  }

  async setActiveAccount(id) {
    await this.load();
    return this._enqueueMutation(async () => {
      const account = this.state.accounts.find((item) => item.id === id);
      if (!account) throw new Error(`account not found: ${id}`);
      const hydrated = await this._hydrateAccount(account);
      if (!textOrNull(hydrated.accessToken)) {
        throw new Error("account credential is unavailable; please sign in again");
      }
      const updatedAccount = { ...account, lastUsedAt: new Date().toISOString() };
      const accounts = this.state.accounts.map((item) =>
        item.id === id ? updatedAccount : item,
      );
      await this._commitState({ ...this.state, accounts, activeAccountId: id });
      return { ...hydrated, lastUsedAt: updatedAccount.lastUsedAt };
    });
  }

  async activePair() {
    await this.load();
    return this._enqueueMutation(async () => {
      const account =
        this.state.accounts.find((item) => item.id === this.state.activeAccountId) ??
        this.state.accounts[0] ??
        null;
      if (!account) throw new Error("no active account");
      const server = this.state.servers.find((item) => item.id === account.serverId);
      if (!server) throw new Error(`server not found: ${account.serverId}`);
      const [hydratedAccount, hydratedServer] = await Promise.all([
        this._hydrateAccount(account),
        this._hydrateServer(server),
      ]);
      if (!textOrNull(hydratedAccount.accessToken)) {
        throw new Error("account credential is unavailable; please sign in again");
      }
      if (this.state.activeAccountId !== account.id) {
        await this._commitState({ ...this.state, activeAccountId: account.id });
      }
      return { server: hydratedServer, account: hydratedAccount };
    });
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
