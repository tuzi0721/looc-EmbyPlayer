import type {
  Account,
  AppSettings,
  ItemsResponse,
  Line,
  LineHealthReport,
  MediaItem,
  MpvSnapshot,
  MpvTrackInfo,
  Server,
  ServerKind,
} from "@/types/models";
import type {
  PlaybackLineOption,
  PlaybackMediaSource,
  PlaybackSource,
  AlistEntry,
  AlistListing,
  WebDavEntry,
  WebDavListing,
} from "@/api";

export type UnlistenFn = () => void;

export interface PlatformEvent<T> {
  event: string;
  payload: T;
}

export interface FileDialogFilter {
  name: string;
  extensions: string[];
}

export interface OpenFileDialogOptions {
  multiple?: boolean;
  directory?: boolean;
  filters?: FileDialogFilter[];
  title?: string;
}

interface HillsLiteBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  invokeCancellable<T>(
    command: string,
    args?: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<T>;
  listen<T>(
    event: string,
    handler: (event: PlatformEvent<T>) => void,
  ): UnlistenFn | Promise<UnlistenFn>;
  openFileDialog(options?: OpenFileDialogOptions): Promise<string | string[] | null>;
  platformType(): Promise<string>;
}

declare global {
  interface Window {
    hillsLite?: HillsLiteBridge;
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
    __TAURI_IPC__?: unknown;
  }
}

export function installTauriCompatBridge(): void {
  if (typeof window === "undefined" || window.hillsLite || !hasTauriRuntime()) return;
  window.hillsLite = {
    async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
      const tauri = await import("@tauri-apps/api/core");
      return tauri.invoke<T>(command, args);
    },
    async invokeCancellable<T>(
      command: string,
      args?: Record<string, unknown>,
      options?: { signal?: AbortSignal },
    ): Promise<T> {
      const tauri = await import("@tauri-apps/api/core");
      const signal = options?.signal;
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      return tauri.invoke<T>(command, args);
    },
    async listen<T>(
      event: string,
      handler: (event: PlatformEvent<T>) => void,
    ): Promise<UnlistenFn> {
      const tauri = await import("@tauri-apps/api/event");
      return tauri.listen<T>(event, handler);
    },
    async openFileDialog(
      options?: OpenFileDialogOptions,
    ): Promise<string | string[] | null> {
      const dialog = await import("@tauri-apps/plugin-dialog");
      return dialog.open(options);
    },
    async platformType(): Promise<string> {
      const os = await import("@tauri-apps/plugin-os");
      return os.type();
    },
  };
}

const WEB_DEFAULT_SETTINGS: AppSettings = {
  heartbeatIntervalSecs: 180,
  healthCheckIntervalSecs: 60,
  raceTimeoutMs: 3500,
  requestTimeoutMs: 15000,
  defaultUserAgent: "Emby-Player/0.1 (Web Preview)",
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
};

const WEB_STATE_KEY = "hills-lite:web-preview-state:v1";
const WEB_DAV_VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mkv",
  "mov",
  "avi",
  "wmv",
  "flv",
  "webm",
  "m4v",
  "ts",
  "m2ts",
  "mpeg",
  "mpg",
  "3gp",
  "ogv",
  "rmvb",
]);
const WEB_DAV_SUBTITLE_EXTENSIONS = new Map([
  ["srt", 0],
  ["ass", 1],
  ["ssa", 2],
  ["vtt", 3],
]);
const REMOTE_POSTER_EXTENSIONS = new Map([
  ["jpg", 0],
  ["jpeg", 1],
  ["png", 2],
  ["webp", 3],
  ["avif", 4],
  ["bmp", 5],
]);
const REMOTE_FOLDER_POSTER_STEMS = new Set(["poster", "cover", "folder"]);
let webSettings: AppSettings = { ...WEB_DEFAULT_SETTINGS };
let webServers: Server[] = [];
let webAccounts: Account[] = [];
let webActiveAccountId: string | null = null;
let webPlaybackSourceState: PlaybackSource | null = null;
let webPlaybackSnapshot: MpvSnapshot = webDefaultSnapshot();
loadWebPreviewState();

export function hasTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__TAURI_INTERNALS__ || window.__TAURI__ || window.__TAURI_IPC__) return true;
  const { hostname, protocol } = window.location;
  return hostname === "tauri.localhost" || protocol === "tauri:";
}

export function hasNativeRuntime(): boolean {
  return typeof window !== "undefined" && (Boolean(window.hillsLite) || hasTauriRuntime());
}

function getWebSettings(): AppSettings {
  return {
    ...webSettings,
    hiddenServerIds: [...webSettings.hiddenServerIds],
  };
}

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function webDefaultSnapshot(): MpvSnapshot {
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
    chapters: [],
    chapter: null,
    secondarySubId: null,
    subDelayMs: 0,
    subScale: 1,
    networkBps: null,
    bufferedMs: 0,
    buffering: false,
  };
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeWebLine(value: any, index: number, existing?: Line): Line {
  return {
    id: value?.id ?? existing?.id ?? createId("line"),
    name: String(value?.name ?? existing?.name ?? `线路 ${index + 1}`),
    baseUrl: String(value?.baseUrl ?? existing?.baseUrl ?? ""),
    userAgent: value?.userAgent ?? existing?.userAgent ?? null,
    headers: Array.isArray(value?.headers) ? value.headers : existing?.headers ?? [],
    priority: Number.isFinite(Number(value?.priority)) ? Number(value.priority) : index,
    enabled: value?.enabled ?? existing?.enabled ?? true,
    lastLatencyMs: existing?.lastLatencyMs ?? null,
    lastStatus: existing?.lastStatus ?? null,
    lastCheckedAt: existing?.lastCheckedAt ?? null,
  };
}

function createWebServer(payload: any): Server {
  const lines = Array.isArray(payload?.lines)
    ? payload.lines.map((line: any, index: number) => normalizeWebLine(line, index))
    : [];
  const now = new Date().toISOString();
  return {
    id: payload?.id ?? createId("server"),
    name: String(payload?.name ?? "Web Preview"),
    kind: (payload?.kind ?? "emby") as ServerKind,
    lines,
    activeLineId: payload?.activeLineId ?? lines[0]?.id ?? null,
    defaultUserAgent: payload?.defaultUserAgent ?? null,
    autoFailover: payload?.autoFailover ?? true,
    createdAt: payload?.createdAt ?? now,
  };
}

function normalizeWebAccount(value: any): Account | null {
  const account: Account = {
    id: stringFrom(value?.id) ?? createId("account"),
    serverId: stringFrom(value?.serverId) ?? "",
    userId: stringFrom(value?.userId) ?? "",
    username: stringFrom(value?.username) ?? "",
    accessToken: stringFrom(value?.accessToken) ?? "",
    avatarTag: stringFrom(value?.avatarTag),
    createdAt: stringFrom(value?.createdAt) ?? new Date().toISOString(),
    lastUsedAt: stringFrom(value?.lastUsedAt) ?? new Date().toISOString(),
  };
  if (!account.serverId || !account.userId || !account.username || !account.accessToken) {
    return null;
  }
  return account;
}

function loadWebPreviewState() {
  if (typeof localStorage === "undefined") return;
  try {
    const parsed = JSON.parse(localStorage.getItem(WEB_STATE_KEY) ?? "{}");
    webSettings = {
      ...WEB_DEFAULT_SETTINGS,
      ...(parsed.settings ?? {}),
      hiddenServerIds: Array.isArray(parsed.settings?.hiddenServerIds)
        ? parsed.settings.hiddenServerIds
        : [],
    };
    webServers = Array.isArray(parsed.servers)
      ? parsed.servers.map(createWebServer)
      : [];
    webAccounts = Array.isArray(parsed.accounts)
      ? parsed.accounts.map(normalizeWebAccount).filter((account: Account | null): account is Account => Boolean(account))
      : [];
    webActiveAccountId =
      typeof parsed.activeAccountId === "string" &&
      webAccounts.some((account) => account.id === parsed.activeAccountId)
        ? parsed.activeAccountId
        : webAccounts[0]?.id ?? null;
  } catch {
    webSettings = { ...WEB_DEFAULT_SETTINGS };
    webServers = [];
    webAccounts = [];
    webActiveAccountId = null;
  }
}

function saveWebPreviewState() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      WEB_STATE_KEY,
      JSON.stringify({
        settings: webSettings,
        servers: webServers,
        accounts: webAccounts,
        activeAccountId: webActiveAccountId,
      }),
    );
  } catch {
    // Local storage may be disabled in some preview hosts.
  }
}

function webAccountProfile(account: Account) {
  const { accessToken: _accessToken, ...profile } = account;
  return profile;
}

function webConfigBackup() {
  return {
    schema: "hills-lite-config",
    version: 2,
    exportedAt: new Date().toISOString(),
    security: {
      credentials: "omitted",
      note: "Account tokens are not included.",
    },
    data: {
      settings: getWebSettings(),
      servers: clone(webServers),
      accountProfiles: webAccounts.map(webAccountProfile),
      activeAccountId: webActiveAccountId,
      globalShortcuts: [],
    },
  };
}

function downloadWebBackup(backup: ReturnType<typeof webConfigBackup>): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `hills-lite-config-${stamp}.json`;
  const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return fileName;
}

function pickWebBackupFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", onFocus);
      input.remove();
      resolve(file);
    };
    const onFocus = () => {
      window.setTimeout(() => {
        if (!input.files || input.files.length === 0) finish(null);
      }, 300);
    };

    input.type = "file";
    input.accept = "application/json,.json";
    input.style.display = "none";
    input.addEventListener("change", () => finish(input.files?.[0] ?? null), { once: true });
    window.addEventListener("focus", onFocus, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

function mergeWebById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of existing) {
    if (item.id) map.set(item.id, item);
  }
  for (const item of incoming) {
    if (item.id) map.set(item.id, item);
  }
  return [...map.values()];
}

function importedWebSettingsPatch(value: unknown): Partial<AppSettings> {
  if (!value || typeof value !== "object") return {};
  const patch = value as Partial<AppSettings>;
  return {
    ...patch,
    hiddenServerIds: Array.isArray(patch.hiddenServerIds) ? patch.hiddenServerIds : [],
  };
}

function importWebBackupData(parsed: any, mode: "merge" | "replace", filePath: string) {
  const data = parsed?.data && typeof parsed.data === "object" ? parsed.data : parsed;
  if (!data || typeof data !== "object") throw new Error("invalid backup file");

  const importedServers = Array.isArray(data.servers)
    ? data.servers.map(createWebServer)
    : [];
  const includesLegacyAccounts = Array.isArray(data.accounts);
  const importedAccounts = includesLegacyAccounts
    ? data.accounts.map(normalizeWebAccount).filter((account: Account | null): account is Account => Boolean(account))
    : [];
  const settingsPatch = importedWebSettingsPatch(data.settings);
  const normalizedMode = mode === "replace" ? "replace" : "merge";

  if (normalizedMode === "replace") {
    webSettings = {
      ...WEB_DEFAULT_SETTINGS,
      ...settingsPatch,
      hiddenServerIds: Array.isArray(settingsPatch.hiddenServerIds)
        ? settingsPatch.hiddenServerIds
        : [],
    };
    webServers = importedServers;
    if (includesLegacyAccounts) {
      webAccounts = importedAccounts;
    } else {
      const serverIds = new Set<string>(importedServers.map((server: Server) => server.id));
      webAccounts = webAccounts.filter((account) => serverIds.has(account.serverId));
    }
  } else {
    webSettings = {
      ...WEB_DEFAULT_SETTINGS,
      ...webSettings,
      ...settingsPatch,
      hiddenServerIds: Array.isArray(settingsPatch.hiddenServerIds)
        ? settingsPatch.hiddenServerIds
        : webSettings.hiddenServerIds,
    };
    webServers = mergeWebById(webServers, importedServers);
    if (includesLegacyAccounts) {
      webAccounts = mergeWebById(webAccounts, importedAccounts);
    }
  }

  const activeAccountId = stringFrom(data.activeAccountId) ?? stringFrom(data.active_account_id);
  if (activeAccountId && webAccounts.some((account) => account.id === activeAccountId)) {
    webActiveAccountId = activeAccountId;
  } else if (!webAccounts.some((account) => account.id === webActiveAccountId)) {
    webActiveAccountId = webAccounts[0]?.id ?? null;
  }

  saveWebPreviewState();
  return {
    filePath,
    mode: normalizedMode,
    servers: importedServers.length,
    accounts: importedAccounts.length,
    shortcuts: 0,
  };
}

async function importWebBackup(mode: "merge" | "replace" = "merge") {
  const file = await pickWebBackupFile();
  if (!file) return null;
  const parsed = JSON.parse(await file.text());
  return importWebBackupData(parsed, mode, file.name);
}

function detectWebKind(payload: any): ServerKind {
  const lines = Array.isArray(payload?.lines) ? payload.lines : [];
  const haystack = [
    payload?.name,
    ...lines.flatMap((line: any) => [line?.name, line?.baseUrl]),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes("jellyfin") ? "jellyfin" : "emby";
}

function mergeWebServer(existing: Server, payload: any): Server {
  const next: Server = {
    ...existing,
    name: payload?.name ?? existing.name,
    kind: payload?.kind ?? existing.kind,
    defaultUserAgent:
      Object.prototype.hasOwnProperty.call(payload ?? {}, "defaultUserAgent")
        ? payload.defaultUserAgent ?? null
        : existing.defaultUserAgent,
    autoFailover: payload?.autoFailover ?? existing.autoFailover,
  };

  if (Array.isArray(payload?.lines)) {
    next.lines = payload.lines.map((line: any, index: number) => {
      const existingLine =
        existing.lines.find((item) => item.id === line?.id) ??
        existing.lines.find((item) => item.baseUrl === line?.baseUrl);
      return normalizeWebLine(line, index, existingLine);
    });
    next.activeLineId =
      payload.activeLineId ??
      next.lines.find((line) => line.id === existing.activeLineId)?.id ??
      next.lines[0]?.id ??
      null;
  }

  return next;
}

function emptyItemsResponse() {
  return { Items: [], TotalRecordCount: 0 };
}

function stringFrom(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function numberFrom(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolFrom(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return null;
}

function firstMediaStream(mediaSource: any, type: "video" | "audio" | "subtitle") {
  const streams = Array.isArray(mediaSource?.MediaStreams) ? mediaSource.MediaStreams : [];
  return (
    streams.find((stream: any) => stringFrom(stream?.Type)?.toLowerCase() === type) ??
    null
  );
}

function normalizeTrack(value: any): MpvTrackInfo {
  const stream = value && typeof value === "object" ? value : {};
  const type = stringFrom(stream.Type)?.toLowerCase();
  const kind: MpvTrackInfo["kind"] =
    type === "audio" ? "audio" : type === "subtitle" ? "subtitle" : "video";
  return {
    id: numberFrom(stream.Index) ?? numberFrom(stream.Id) ?? 0,
    kind,
    title: stringFrom(stream.DisplayTitle) ?? stringFrom(stream.Title),
    lang: stringFrom(stream.Language),
    codec: stringFrom(stream.Codec),
    external: boolFrom(stream.IsExternal),
    defaultTrack: boolFrom(stream.IsDefault),
    forced: boolFrom(stream.IsForced),
    selected: boolFrom(stream.IsDefault) ?? false,
  };
}

function playbackSourceLabel(mediaSource: any, index: number): string {
  const name = stringFrom(mediaSource?.Name);
  if (name) return name;
  const path = stringFrom(mediaSource?.Path);
  if (path) {
    const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts.at(-1) ?? path;
  }
  const id = stringFrom(mediaSource?.Id);
  return id ? `Media source ${id}` : `Media source ${index + 1}`;
}

function normalizePlaybackMediaSource(
  mediaSource: any,
  index: number,
  selectedId: string,
): PlaybackMediaSource {
  const video = firstMediaStream(mediaSource, "video");
  const audio = firstMediaStream(mediaSource, "audio");
  const id = stringFrom(mediaSource?.Id) ?? `source-${index}`;
  return {
    id,
    name: stringFrom(mediaSource?.Name),
    displayName: playbackSourceLabel(mediaSource, index),
    container: stringFrom(mediaSource?.Container),
    protocol: stringFrom(mediaSource?.Protocol),
    path: stringFrom(mediaSource?.Path),
    bitrate: numberFrom(mediaSource?.Bitrate),
    size: numberFrom(mediaSource?.Size),
    width: numberFrom(video?.Width),
    height: numberFrom(video?.Height),
    videoCodec: stringFrom(video?.Codec),
    audioCodec: stringFrom(audio?.Codec),
    audioLanguage: stringFrom(audio?.Language),
    supportsDirectPlay: boolFrom(mediaSource?.SupportsDirectPlay),
    supportsDirectStream: boolFrom(mediaSource?.SupportsDirectStream),
    playMethod: isLocalDecodeSource(mediaSource) ? localDecodePlayMethod(mediaSource) : undefined,
    supportsTranscoding: boolFrom(mediaSource?.SupportsTranscoding),
    isRemote: boolFrom(mediaSource?.IsRemote),
    selected: id === selectedId,
  };
}

function playbackLineOptions(server: Server, selectedLine: Line): PlaybackLineOption[] {
  return server.lines.map((line) => ({
    id: line.id,
    name: line.name || line.baseUrl || "Line",
    baseUrl: line.baseUrl,
    enabled: line.enabled !== false,
    status: line.lastStatus ?? null,
    latencyMs: line.lastLatencyMs ?? null,
    selected: line.id === selectedLine.id,
  }));
}

function appendToken(url: URL, token: string, enabled: boolean) {
  if (!enabled) return url;
  if (!url.searchParams.has("api_key") && !url.searchParams.has("X-Emby-Token")) {
    url.searchParams.set("api_key", token);
  }
  return url;
}

const DIRECT_VIDEO_CONTAINERS = [
  "mp4",
  "m4v",
  "mov",
  "mkv",
  "webm",
  "avi",
  "wmv",
  "flv",
  "ts",
  "m2ts",
  "mpeg",
  "mpg",
  "3gp",
  "ogv",
  "rmvb",
];
const DIRECT_AUDIO_CONTAINERS = ["mp3", "aac", "flac", "ogg", "opus", "wav", "m4a", "ape", "alac"];
const IMAGE_FALLBACK_FIELDS =
  "ParentBackdropItemId,ParentBackdropImageTags,ParentThumbItemId,ParentThumbImageTag,ParentPrimaryImageItemId,ParentPrimaryImageTag,ParentLogoItemId,ParentLogoImageTag,SeriesPrimaryImageTag,SeriesThumbImageTag";
const PERSONAL_ITEM_FIELDS =
  `PrimaryImageAspectRatio,ProductionYear,Overview,UserData,SeriesInfo,RunTimeTicks,${IMAGE_FALLBACK_FIELDS}`;

function directPlaybackOptions() {
  return {
    EnableDirectPlay: true,
    EnableDirectStream: true,
    EnableTranscoding: false,
    EnableVideoStreamCopy: true,
    EnableAudioStreamCopy: true,
  };
}

function directOnlyDeviceProfile(name = "Hills Lite Direct") {
  return {
    Name: name,
    MaxStreamingBitrate: 140000000,
    DirectPlayProfiles: [
      { Type: "Video", Container: DIRECT_VIDEO_CONTAINERS.join(",") },
      { Type: "Audio", Container: DIRECT_AUDIO_CONTAINERS.join(",") },
    ],
    TranscodingProfiles: [],
    SubtitleProfiles: [
      { Format: "vtt", Method: "External" },
      { Format: "srt", Method: "External" },
      { Format: "ass", Method: "External" },
      { Format: "ssa", Method: "External" },
    ],
  };
}

function isLocalDecodeSource(mediaSource: any): boolean {
  const supportsDirectPlay = boolFrom(mediaSource?.SupportsDirectPlay);
  const supportsDirectStream = boolFrom(mediaSource?.SupportsDirectStream);
  return supportsDirectPlay === true || supportsDirectStream === true;
}

function localDecodePlayMethod(mediaSource: any): "DirectPlay" | "DirectStream" {
  return boolFrom(mediaSource?.SupportsDirectPlay) === true ? "DirectPlay" : "DirectStream";
}

function localDecodeMode(mediaSource: any): "direct-play" | "direct-stream" {
  return localDecodePlayMethod(mediaSource) === "DirectPlay" ? "direct-play" : "direct-stream";
}

function safeStreamExtension(container: unknown): string | null {
  const ext = stringFrom(container)?.split(",")[0]?.trim().replace(/^\./, "") ?? "";
  if (!ext || ext.length > 16 || !/^[a-z0-9]+$/i.test(ext)) return null;
  return ext.toLowerCase();
}

function sanitizePlaybackMethod(value: any): "DirectPlay" | "DirectStream" {
  return stringFrom(value) === "DirectStream" ? "DirectStream" : "DirectPlay";
}

function pickLocalDecodeMediaSource(mediaSources: any[], requestedMediaSourceId?: string | null) {
  if (requestedMediaSourceId) {
    const selected = mediaSources.find((source: any) => stringFrom(source?.Id) === requestedMediaSourceId);
    if (!selected) {
      throw new Error(`get_playback_source: media source not found: ${requestedMediaSourceId}`);
    }
    if (!isLocalDecodeSource(selected)) {
      throw new Error(
        "已阻止播放：所选媒体源不支持本机直连或本机直流。Hills Lite 不允许服务端解码/转码，请换一个可本机解码的版本或线路。",
      );
    }
    return selected;
  }

  const selected = mediaSources.find(isLocalDecodeSource);
  if (!selected) {
    throw new Error(
      "已阻止播放：服务端没有返回可本机直连或本机直流的媒体源。Hills Lite 不允许服务端解码/转码，以避免压垮 NAS、路由器或 VPS。",
    );
  }
  return selected;
}

function defaultUserAgent(server: Server, line: Line): string | null {
  return line.userAgent ?? server.defaultUserAgent ?? webSettings.defaultUserAgent;
}

function proxiedStreamUrl(url: URL): string {
  return `/__hills_web_stream_proxy?url=${encodeURIComponent(url.toString())}`;
}

function playbackHeaders(server: Server, line: Line, token: string): [string, string][] {
  const headers: [string, string][] = [
    ["X-Emby-Token", token],
    ["Authorization", `MediaBrowser Token="${token}"`],
  ];
  for (const [name, value] of line.headers ?? []) {
    if (name && value != null) headers.push([name, String(value)]);
  }
  const userAgent = defaultUserAgent(server, line);
  if (userAgent) headers.push(["User-Agent", userAgent]);
  return headers;
}

function joinWebUrl(baseUrl: string, route: string): URL {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(route.replace(/^\/+/, ""), base);
}

function pickWebLine(server: Server, lineId?: string | null): Line {
  if (lineId) {
    const requested = server.lines.find((line) => line.id === lineId);
    if (!requested) throw new Error(`line not found: ${lineId}`);
    if (requested.enabled === false) throw new Error(`line disabled: ${lineId}`);
    return requested;
  }
  const line =
    server.lines.find((item) => item.id === server.activeLineId && item.enabled) ??
    server.lines.find((item) => item.enabled) ??
    server.lines[0];
  if (!line) throw new Error(`no available line for server ${server.id}`);
  return line;
}

function bestWebLineId(lines: Line[]): string | null {
  const priority = (line: Line) => {
    const value = Number(line.priority);
    return Number.isFinite(value) ? value : 0;
  };
  const latency = (line: Line) => {
    const value = Number(line.lastLatencyMs);
    return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
  };

  return (
    [...lines]
      .filter((line) => line.enabled !== false && line.lastStatus !== "down")
      .sort((left, right) => priority(left) - priority(right) || latency(left) - latency(right))[0]?.id ?? null
  );
}

function webHeaders(server: Server, line: Line, token?: string | null, hasBody = false) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Emby-Authorization":
      'MediaBrowser Client="Hills Lite", Device="Web Preview", DeviceId="hills-lite-web-preview", Version="0.1.0"',
  };
  if (hasBody) headers["Content-Type"] = "application/json";
  if (token) {
    headers["X-Emby-Token"] = token;
    headers.Authorization = `MediaBrowser Token="${token}"`;
  }
  for (const [name, value] of line.headers ?? []) {
    if (name && value != null) headers[name] = String(value);
  }
  const userAgent = line.userAgent ?? server.defaultUserAgent ?? webSettings.defaultUserAgent;
  if (userAgent) headers["User-Agent"] = userAgent;
  return headers;
}

async function fetchViaWebPreviewProxy(
  url: URL,
  init: { method?: string; headers?: Record<string, string>; body?: string },
  timeoutMs: number,
) {
  return fetchWithWebTimeout("/__hills_web_proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: url.toString(),
      method: init.method ?? "GET",
      headers: init.headers ?? {},
      body: init.body ?? null,
      timeoutMs,
    }),
  }, timeoutMs);
}

function webRequestTimeoutMs() {
  const value = Number(webSettings.requestTimeoutMs);
  return Math.max(1000, Number.isFinite(value) ? value : WEB_DEFAULT_SETTINGS.requestTimeoutMs);
}

async function fetchWithWebTimeout(input: string, init: RequestInit, timeoutMs: number) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    try {
      return await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      const name = (error as { name?: string })?.name;
      if (name === "AbortError" || name === "TimeoutError") {
        throw new Error(`request timeout after ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") {
      throw new Error(`request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function browserSafeHeaders(headers: Record<string, string>) {
  const next = { ...headers };
  delete next["User-Agent"];
  return next;
}

async function webJson(
  url: URL,
  init: { method?: string; headers?: Record<string, string>; body?: string },
  context: string,
) {
  let response: Response;
  const timeoutMs = webRequestTimeoutMs();
  try {
    response = await fetchViaWebPreviewProxy(url, init, timeoutMs);
  } catch (error) {
    try {
      response = await fetchWithWebTimeout(url.toString(), {
        method: init.method ?? "GET",
        headers: browserSafeHeaders(init.headers ?? {}),
        body: init.body,
      }, timeoutMs);
    } catch (directError) {
      const proxyMessage = error instanceof Error ? error.message : String(error);
      const directMessage = directError instanceof Error ? directError.message : String(directError);
      throw new Error(
        `${context}: request failed or timed out after ${timeoutMs}ms (proxy: ${proxyMessage}; direct: ${directMessage})`,
      );
    }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${context}: HTTP ${response.status}${text ? ` - ${text.slice(0, 500)}` : ""}`);
  }

  const text = await response.text();
  if (!text.trim()) return null;
  return JSON.parse(text);
}

function webDavRootUrl(value: unknown): URL {
  let url: URL;
  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    throw new Error("WebDAV URL 无效");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("WebDAV URL 必须使用 http 或 https");
  }
  if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
  return url;
}

function alistRootUrl(value: unknown): URL {
  let url: URL;
  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    throw new Error("Alist URL 无效");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Alist URL 必须使用 http 或 https");
  }
  if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
  return url;
}

function alistApiPath(value: unknown): string {
  const path = webDavRelativePath(value);
  return path ? `/${path}` : "/";
}

function alistJoinPath(parent: string, name: string, isDirectory: boolean): string {
  const base = webDavRelativePath(parent);
  const leaf = name.replace(/^\/+|\/+$/g, "");
  const joined = [base, leaf].filter(Boolean).join("/");
  return isDirectory && joined ? `${joined}/` : joined;
}

function alistApiUrl(root: URL, endpoint: "list" | "get"): URL {
  return new URL(`api/fs/${endpoint}`, root);
}

function alistDownloadUrl(root: URL, path: string, sign?: string | null): string {
  const encoded = webDavRelativePath(path)
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  const url = new URL(`d/${encoded}`, root);
  const cleanSign = String(sign ?? "").trim();
  if (cleanSign) url.searchParams.set("sign", cleanSign);
  return url.toString();
}

function alistDirectoryUrl(root: URL, path: string): string {
  const relative = webDavRelativePath(path);
  return relative ? new URL(`${relative}/`, root).toString() : root.toString();
}

function alistAuthorization(token?: string | null): Record<string, string> {
  const cleanToken = String(token ?? "").trim();
  return cleanToken ? { Authorization: cleanToken } : {};
}

function alistAssertData(value: any, action: string): any {
  if (!value || typeof value !== "object") throw new Error(`Alist ${action} 返回无效 JSON`);
  const code = Number(value.code);
  if (Number.isFinite(code) && code !== 200) {
    throw new Error(`Alist ${action} 失败：${value.message ?? `code ${code}`}`);
  }
  return value.data ?? {};
}

function alistEntryFromItem(root: URL, currentPath: string, item: unknown): AlistEntry | null {
  const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
  const name = String(record.name ?? "").replace(/\/+$/g, "");
  if (!name) return null;
  const isDirectory = record.is_dir === true;
  const path = alistJoinPath(currentPath, name, isDirectory);
  const extension = isDirectory ? "" : (name.split(".").pop() ?? "").toLowerCase();
  return {
    name,
    url: isDirectory ? alistDirectoryUrl(root, path) : alistDownloadUrl(root, path, String(record.sign ?? "")),
    path,
    isDirectory,
    extension,
    sizeBytes: numberFrom(record.size) ?? 0,
    modifiedAtMs: record.modified ? Date.parse(String(record.modified)) : null,
    contentType: record.type == null ? null : String(record.type),
    thumb: stringFrom(record.thumb) || null,
    sign: stringFrom(record.sign) || null,
    playable: !isDirectory && WEB_DAV_VIDEO_EXTENSIONS.has(extension),
    posterUrl: isDirectory ? null : stringFrom(record.thumb) || null,
  };
}

function alistSidecarSubtitlesFor(videoEntry: AlistEntry, entries: AlistEntry[]) {
  if (!videoEntry.playable) return [];
  const videoStem = webDavStemFromName(videoEntry.name);
  return entries
    .filter((entry) => !entry.isDirectory && WEB_DAV_SUBTITLE_EXTENSIONS.has(entry.extension))
    .map((entry) => {
      const rank = webDavSidecarSubtitleRank(videoStem, webDavStemFromName(entry.name));
      if (rank == null) return null;
      return {
        name: entry.name,
        url: entry.url,
        path: entry.path,
        extension: entry.extension,
        rank,
        extRank: WEB_DAV_SUBTITLE_EXTENSIONS.get(entry.extension) ?? 99,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)
    .sort((left, right) => left.rank - right.rank || left.extRank - right.extRank || left.name.localeCompare(right.name))
    .slice(0, 8)
    .map(({ name, url, path, extension }) => ({ name, url, path, extension }));
}

function alistSidecarDanmakuFor(videoEntry: AlistEntry, entries: AlistEntry[]) {
  if (!videoEntry.playable) return null;
  const videoStem = webDavStemFromName(videoEntry.name).toLocaleLowerCase();
  const candidates = new Set([
    `${videoStem}.xml`,
    `${videoStem}.danmaku.xml`,
    `${videoStem}.comments.xml`,
  ]);
  const match = entries.find(
    (entry) => !entry.isDirectory && entry.extension === "xml" && candidates.has(entry.name.toLocaleLowerCase()),
  );
  return match ? { name: match.name, url: match.url, path: match.path } : null;
}

function betterRemotePoster<T extends { extension: string }>(left: T | null, right: T): T {
  if (!left) return right;
  const leftRank = REMOTE_POSTER_EXTENSIONS.get(left.extension) ?? 99;
  const rightRank = REMOTE_POSTER_EXTENSIONS.get(right.extension) ?? 99;
  return rightRank < leftRank ? right : left;
}

function remotePosterFor<T extends { name: string; extension: string; isDirectory: boolean; playable: boolean }>(
  videoEntry: T,
  entries: T[],
): T | null {
  if (!videoEntry.playable) return null;
  const videoStem = webDavStemFromName(videoEntry.name).toLocaleLowerCase();
  let exact: T | null = null;
  let folderPoster: T | null = null;
  for (const entry of entries) {
    if (entry.isDirectory || !REMOTE_POSTER_EXTENSIONS.has(entry.extension)) continue;
    const stem = webDavStemFromName(entry.name).toLocaleLowerCase();
    if (stem === videoStem) exact = betterRemotePoster(exact, entry);
    if (REMOTE_FOLDER_POSTER_STEMS.has(stem)) folderPoster = betterRemotePoster(folderPoster, entry);
  }
  return exact ?? folderPoster;
}

function alistPosterUrl(entry?: AlistEntry | null, allowFileUrl = false): string | null {
  return stringFrom(entry?.thumb) || (allowFileUrl ? stringFrom(entry?.url) : null);
}

function alistAnnotateSidecars(entries: AlistEntry[]) {
  return entries.map((entry) => {
    if (!entry.playable) return entry;
    const sidecarSubtitles = alistSidecarSubtitlesFor(entry, entries);
    const sidecarDanmaku = alistSidecarDanmakuFor(entry, entries);
    const poster = remotePosterFor(entry, entries);
    return {
      ...entry,
      posterUrl: alistPosterUrl(poster, true) ?? alistPosterUrl(entry),
      sidecarSubtitleCount: sidecarSubtitles.length,
      sidecarSubtitles,
      sidecarDanmaku,
    };
  });
}

async function webListAlistFolder(payload: any): Promise<AlistListing> {
  const root = alistRootUrl(payload?.baseUrl);
  const path = webDavRelativePath(payload?.path);
  const timeoutMs = webRequestTimeoutMs();
  const response = await fetchViaWebPreviewProxy(
    alistApiUrl(root, "list"),
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...alistAuthorization(stringFrom(payload?.token)),
      },
      body: JSON.stringify({
        path: alistApiPath(path),
        password: stringFrom(payload?.pathPassword) ?? "",
        page: Math.max(1, Number(payload?.page) || 1),
        per_page: Math.max(0, Number(payload?.perPage) || 0),
        refresh: payload?.refresh === true,
      }),
    },
    timeoutMs,
  );
  if (!response.ok) throw new Error(`Alist list failed: HTTP ${response.status}`);
  const data = alistAssertData(await response.json(), "list");
  const content: unknown[] = Array.isArray(data.content) ? data.content : [];
  const items = alistAnnotateSidecars(
    content
      .map((item: unknown) => alistEntryFromItem(root, path, item))
      .filter((entry): entry is NonNullable<typeof entry> => entry != null),
  )
    .sort((left: AlistEntry, right: AlistEntry) => {
      if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1;
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
    });
  return {
    rootUrl: root.toString(),
    path,
    directoryUrl: alistDirectoryUrl(root, path),
    total: Number(data.total) || items.length,
    provider: data.provider == null ? null : String(data.provider),
    items,
  };
}

async function webResolveAlistFile(payload: any) {
  const root = alistRootUrl(payload?.baseUrl);
  const path = webDavRelativePath(payload?.path);
  if (!path) throw new Error("Alist 文件路径不能为空");
  const response = await fetchViaWebPreviewProxy(
    alistApiUrl(root, "get"),
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...alistAuthorization(stringFrom(payload?.token)),
      },
      body: JSON.stringify({
        path: alistApiPath(path),
        password: stringFrom(payload?.pathPassword) ?? "",
      }),
    },
    webRequestTimeoutMs(),
  );
  if (!response.ok) throw new Error(`Alist get failed: HTTP ${response.status}`);
  const data = alistAssertData(await response.json(), "get");
  return {
    path,
    name: path.split("/").filter(Boolean).pop() ?? path,
    url: stringFrom(data.raw_url) || alistDownloadUrl(root, path, data.sign),
  };
}

function webDavRelativePath(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .join("/");
}

function webDavJoin(root: URL, path: string): URL {
  if (!path) return new URL(root.toString());
  const encoded = path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return new URL(`${encoded}/`, root);
}

function webDavAuthorization(username?: string | null, password?: string | null) {
  if (!username && !password) return null;
  const bytes = new TextEncoder().encode(`${username ?? ""}:${password ?? ""}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

function webDavNameFromUrl(url: URL) {
  const path = url.pathname.replace(/\/+$/, "");
  const name = path.split("/").filter(Boolean).pop() ?? url.hostname;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function webDavStemFromName(name: string) {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(0, index) : name;
}

function webDavSidecarSubtitleRank(videoStem: string, subtitleStem: string) {
  const video = videoStem.toLocaleLowerCase();
  const subtitle = subtitleStem.toLocaleLowerCase();
  if (subtitle === video) return 0;
  for (const separator of [".", " ", "_", "-"]) {
    if (subtitle.startsWith(`${video}${separator}`)) return 1;
  }
  return null;
}

function webDavSidecarSubtitlesFor(videoEntry: WebDavEntry, entries: WebDavEntry[]) {
  if (!videoEntry.playable) return [];
  const videoStem = webDavStemFromName(videoEntry.name);
  return entries
    .filter((entry) => !entry.isDirectory && WEB_DAV_SUBTITLE_EXTENSIONS.has(entry.extension))
    .map((entry) => {
      const rank = webDavSidecarSubtitleRank(videoStem, webDavStemFromName(entry.name));
      if (rank == null) return null;
      return {
        name: entry.name,
        url: entry.url,
        extension: entry.extension,
        rank,
        extRank: WEB_DAV_SUBTITLE_EXTENSIONS.get(entry.extension) ?? 99,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)
    .sort((left, right) => left.rank - right.rank || left.extRank - right.extRank || left.name.localeCompare(right.name))
    .slice(0, 8)
    .map(({ name, url, extension }) => ({ name, url, extension }));
}

function webDavSidecarDanmakuFor(videoEntry: WebDavEntry, entries: WebDavEntry[]) {
  if (!videoEntry.playable) return null;
  const videoStem = webDavStemFromName(videoEntry.name).toLocaleLowerCase();
  const candidates = new Set([
    `${videoStem}.xml`,
    `${videoStem}.danmaku.xml`,
    `${videoStem}.comments.xml`,
  ]);
  const match = entries.find(
    (entry) => !entry.isDirectory && entry.extension === "xml" && candidates.has(entry.name.toLocaleLowerCase()),
  );
  return match ? { name: match.name, url: match.url } : null;
}

function webDavAnnotateSidecars(entries: WebDavEntry[]) {
  return entries.map((entry) => {
    if (!entry.playable) return entry;
    const sidecarSubtitles = webDavSidecarSubtitlesFor(entry, entries);
    const sidecarDanmaku = webDavSidecarDanmakuFor(entry, entries);
    const poster = remotePosterFor(entry, entries);
    return {
      ...entry,
      posterUrl: poster?.url ?? null,
      sidecarSubtitleCount: sidecarSubtitles.length,
      sidecarSubtitles,
      sidecarDanmaku,
    };
  });
}

function webDavRelativeFromUrl(root: URL, item: URL, isDirectory: boolean) {
  const decode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  const rootPath = decode(root.pathname).replace(/\/+$/, "");
  const itemPath = decode(item.pathname).replace(/\/+$/, "");
  let relative = itemPath.replace(/^\/+/, "");
  if (rootPath && itemPath.toLowerCase().startsWith(`${rootPath.toLowerCase()}/`)) {
    relative = itemPath.slice(rootPath.length + 1);
  }
  return isDirectory && relative && !relative.endsWith("/") ? `${relative}/` : relative;
}

function webDavComparable(value: URL) {
  const url = new URL(value.toString());
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function webDavListingFromXml(xml: string, root: URL, requestUrl: URL): WebDavListing {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = document.querySelector("parsererror");
  if (parserError) throw new Error("WebDAV 返回的 XML 无法解析");
  const current = webDavComparable(requestUrl);
  const responses = Array.from(document.getElementsByTagNameNS("*", "response"));
  const entries: WebDavEntry[] = responses
    .map((response): WebDavEntry | null => {
      const href = response.getElementsByTagNameNS("*", "href")[0]?.textContent?.trim();
      if (!href) return null;
      let url: URL;
      try {
        url = new URL(href, requestUrl);
      } catch {
        return null;
      }
      if (webDavComparable(url) === current) return null;
      const isDirectory = response.getElementsByTagNameNS("*", "collection").length > 0;
      const displayName = response.getElementsByTagNameNS("*", "displayname")[0]?.textContent?.trim();
      const name = (displayName || webDavNameFromUrl(url)).replace(/\/+$/, "");
      const extension = isDirectory ? "" : (name.split(".").pop() ?? "").toLowerCase();
      const sizeText = response.getElementsByTagNameNS("*", "getcontentlength")[0]?.textContent;
      const modifiedText = response.getElementsByTagNameNS("*", "getlastmodified")[0]?.textContent;
      const modifiedAtMs = modifiedText ? Date.parse(modifiedText) : NaN;
      return {
        name: name || webDavNameFromUrl(url),
        url: url.toString(),
        path: webDavRelativeFromUrl(root, url, isDirectory),
        isDirectory,
        extension,
        sizeBytes: Number(sizeText) || 0,
        modifiedAtMs: Number.isFinite(modifiedAtMs) ? modifiedAtMs : null,
        contentType: response.getElementsByTagNameNS("*", "getcontenttype")[0]?.textContent ?? null,
        playable: !isDirectory && WEB_DAV_VIDEO_EXTENSIONS.has(extension),
      };
    })
    .filter((entry): entry is WebDavEntry => entry != null);
  const items = webDavAnnotateSidecars(entries)
    .sort((left, right) => {
      if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1;
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
    });

  return {
    rootUrl: root.toString(),
    path: webDavRelativePath(webDavRelativeFromUrl(root, requestUrl, true)),
    directoryUrl: requestUrl.toString(),
    items,
  };
}

async function webListDavFolder(payload: any): Promise<WebDavListing> {
  const root = webDavRootUrl(payload?.baseUrl);
  const path = webDavRelativePath(payload?.path);
  const requestUrl = webDavJoin(root, path);
  const timeoutMs = webRequestTimeoutMs();
  const authorization = webDavAuthorization(
    stringFrom(payload?.username),
    stringFrom(payload?.password),
  );
  const headers: Record<string, string> = {
    Accept: "application/xml,text/xml,*/*",
    "Content-Type": "application/xml; charset=utf-8",
    Depth: "1",
  };
  if (authorization) headers.Authorization = authorization;
  const response = await fetchViaWebPreviewProxy(
    requestUrl,
    {
      method: "PROPFIND",
      headers,
      body:
        '<?xml version="1.0" encoding="utf-8" ?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname /><d:resourcetype /><d:getcontentlength /><d:getlastmodified /><d:getcontenttype /></d:prop></d:propfind>',
    },
    timeoutMs,
  );
  if (!response.ok) throw new Error(`WebDAV PROPFIND failed: HTTP ${response.status}`);
  return webDavListingFromXml(await response.text(), root, requestUrl);
}

function detectKindFromSystemInfo(info: any): ServerKind {
  const text = [
    info?.ProductName,
    info?.Product,
    info?.ServerName,
    info?.OperatingSystemDisplayName,
  ]
    .join(" ")
    .toLowerCase();
  return text.includes("jellyfin") ? "jellyfin" : "emby";
}

async function detectWebServerReal(payload: any) {
  const server = createWebServer({
    ...payload,
    kind: "emby",
  });
  const lines = server.lines
    .filter((line) => line.enabled !== false)
    .sort((left, right) => left.priority - right.priority);
  if (lines.length === 0) throw new Error("no available line");

  const reports = [];
  for (const line of lines) {
    const started = performance.now();
    try {
      const info = await webJson(
        joinWebUrl(line.baseUrl, "System/Info/Public"),
        { method: "GET", headers: webHeaders(server, line) },
        "system_info_public",
      );
      const kind = detectKindFromSystemInfo(info);
      const normalized = {
        serverName: stringFrom(info?.ServerName) ?? stringFrom(info?.LocalAddress) ?? server.name,
        version: stringFrom(info?.Version),
        productName: stringFrom(info?.ProductName) ?? (kind === "jellyfin" ? "Jellyfin" : "Emby"),
      };
      reports.push({
        lineId: line.id,
        lineName: line.name,
        status: "healthy",
        kind,
        ...normalized,
        latencyMs: Math.round(performance.now() - started),
        error: null,
      });
      return {
        kind,
        winningLineId: line.id,
        ...normalized,
        reports,
      };
    } catch (error) {
      reports.push({
        lineId: line.id,
        lineName: line.name,
        status: "down",
        kind: null,
        serverName: null,
        version: null,
        productName: null,
        latencyMs: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new Error(reports.map((report) => `${report.lineName}: ${report.error}`).join("; "));
}

function normalizeUserData(value: any) {
  return {
    PlayedPercentage: numberFrom(value?.PlayedPercentage),
    PlaybackPositionTicks: numberFrom(value?.PlaybackPositionTicks),
    LastPlayedDate: stringFrom(value?.LastPlayedDate),
    Played: boolFrom(value?.Played) ?? false,
    IsFavorite: boolFrom(value?.IsFavorite) ?? false,
    PlayCount: numberFrom(value?.PlayCount) ?? 0,
  };
}

function normalizeMediaStreamInfo(value: any) {
  return {
    Index: numberFrom(value?.Index),
    Type: stringFrom(value?.Type),
    Codec: stringFrom(value?.Codec),
    Language: stringFrom(value?.Language),
    DisplayTitle: stringFrom(value?.DisplayTitle),
    Title: stringFrom(value?.Title),
    Width: numberFrom(value?.Width),
    Height: numberFrom(value?.Height),
    BitRate: numberFrom(value?.BitRate),
    Channels: numberFrom(value?.Channels),
    IsDefault: boolFrom(value?.IsDefault),
    IsExternal: boolFrom(value?.IsExternal),
    IsForced: boolFrom(value?.IsForced),
  };
}

function normalizeMediaSourceInfo(value: any) {
  return {
    Id: stringFrom(value?.Id),
    Name: stringFrom(value?.Name),
    Container: stringFrom(value?.Container),
    Size: numberFrom(value?.Size),
    Bitrate: numberFrom(value?.Bitrate),
    SupportsDirectPlay: boolFrom(value?.SupportsDirectPlay),
    SupportsDirectStream: boolFrom(value?.SupportsDirectStream),
    SupportsTranscoding: boolFrom(value?.SupportsTranscoding),
    MediaStreams: Array.isArray(value?.MediaStreams) ? value.MediaStreams.map(normalizeMediaStreamInfo) : [],
  };
}

function normalizeMediaItem(value: any): MediaItem {
  return {
    Id: stringFrom(value?.Id) ?? "",
    Name: stringFrom(value?.Name) ?? "",
    _source: value?._source ?? null,
    Type: stringFrom(value?.Type),
    Overview: stringFrom(value?.Overview),
    ProductionYear: numberFrom(value?.ProductionYear),
    CommunityRating: numberFrom(value?.CommunityRating),
    OfficialRating: stringFrom(value?.OfficialRating),
    PrimaryImageAspectRatio: numberFrom(value?.PrimaryImageAspectRatio),
    Genres: Array.isArray(value?.Genres) ? value.Genres.map(stringFrom).filter(Boolean) : null,
    GenreItems: Array.isArray(value?.GenreItems) ? value.GenreItems : null,
    Studios: Array.isArray(value?.Studios) ? value.Studios : null,
    RunTimeTicks: numberFrom(value?.RunTimeTicks),
    SeriesName: stringFrom(value?.SeriesName),
    SeriesId: stringFrom(value?.SeriesId),
    SeasonId: stringFrom(value?.SeasonId),
    SeriesPrimaryImageTag: stringFrom(value?.SeriesPrimaryImageTag),
    SeriesThumbImageTag: stringFrom(value?.SeriesThumbImageTag),
    ParentBackdropItemId: stringFrom(value?.ParentBackdropItemId),
    ParentBackdropImageTags: Array.isArray(value?.ParentBackdropImageTags) ? value.ParentBackdropImageTags : null,
    ParentThumbItemId: stringFrom(value?.ParentThumbItemId),
    ParentThumbImageTag: stringFrom(value?.ParentThumbImageTag),
    ParentPrimaryImageItemId: stringFrom(value?.ParentPrimaryImageItemId),
    ParentPrimaryImageTag: stringFrom(value?.ParentPrimaryImageTag),
    ParentLogoItemId: stringFrom(value?.ParentLogoItemId),
    ParentLogoImageTag: stringFrom(value?.ParentLogoImageTag),
    IndexNumber: numberFrom(value?.IndexNumber),
    ParentIndexNumber: numberFrom(value?.ParentIndexNumber),
    ImageTags: value?.ImageTags && typeof value.ImageTags === "object" ? value.ImageTags : null,
    BackdropImageTags: Array.isArray(value?.BackdropImageTags) ? value.BackdropImageTags : null,
    UserData: normalizeUserData(value?.UserData),
    People: Array.isArray(value?.People) ? value.People : null,
    ProviderIds: value?.ProviderIds && typeof value.ProviderIds === "object" ? value.ProviderIds : null,
    MediaSources: Array.isArray(value?.MediaSources) ? value.MediaSources.map(normalizeMediaSourceInfo) : [],
  };
}

function normalizeItemsResponse(value: any): ItemsResponse {
  const rawItems = Array.isArray(value?.Items) ? value.Items : Array.isArray(value) ? value : [];
  const items = rawItems.map(normalizeMediaItem).filter((item: MediaItem) => item.Id && item.Name);
  return {
    Items: items,
    TotalRecordCount: numberFrom(value?.TotalRecordCount) ?? items.length,
  };
}

function annotateWebItemsResponse(value: any): ItemsResponse {
  const pair = webActivePair();
  const response = normalizeItemsResponse(value);
  return {
    ...response,
    Items: response.Items.map((item) => ({
      ...item,
      _source: {
        serverId: pair.server.id,
        accountId: pair.account.id,
        serverName: pair.server.name,
        username: pair.account.username,
      },
    })),
  };
}

function webActivePair() {
  const account =
    webAccounts.find((item) => item.id === webActiveAccountId) ?? webAccounts[0] ?? null;
  if (!account) throw new Error("not logged in");
  const server = webServers.find((item) => item.id === account.serverId);
  if (!server) throw new Error(`server not found: ${account.serverId}`);
  return { server, account };
}

async function webAuthedJson(
  method: string,
  route: string,
  query?: Record<string, unknown>,
  body?: unknown,
  lineId?: string | null,
) {
  const { server, account } = webActivePair();
  const line = pickWebLine(server, lineId ?? null);
  const url = joinWebUrl(line.baseUrl, route);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }
  return webJson(
    url,
    {
      method,
      headers: webHeaders(server, line, account.accessToken, body != null),
      body: body == null ? undefined : JSON.stringify(body),
    },
    route,
  );
}

async function webPlaybackSource(
  itemId: string,
  startMs = 0,
  options: { lineId?: string | null; mediaSourceId?: string | null } = {},
): Promise<PlaybackSource> {
  const { server, account } = webActivePair();
  const line = pickWebLine(server, options.lineId ?? null);
  const startTicks = Math.max(0, Math.floor((numberFrom(startMs) ?? 0) * 10_000));
  const url = joinWebUrl(line.baseUrl, `Items/${itemId}/PlaybackInfo`);
  for (const [key, value] of Object.entries({
    UserId: account.userId,
    StartTimeTicks: startTicks,
    IsPlayback: "true",
    AutoOpenLiveStream: "true",
    MaxStreamingBitrate: "140000000",
    ...directPlaybackOptions(),
  })) {
    url.searchParams.set(key, String(value));
  }

  const body = {
    UserId: account.userId,
    MaxStreamingBitrate: 140000000,
    StartTimeTicks: startTicks,
    IsPlayback: true,
    AutoOpenLiveStream: true,
    ...directPlaybackOptions(),
    DeviceProfile: directOnlyDeviceProfile("Hills Lite Web Preview Local Decode"),
  };

  const info = await webJson(
    url,
    {
      method: "POST",
      headers: webHeaders(server, line, account.accessToken, true),
      body: JSON.stringify(body),
    },
    "get_playback_source",
  );
  const mediaSources = Array.isArray(info?.MediaSources) ? info.MediaSources : [];
  const requestedMediaSourceId = stringFrom(options.mediaSourceId);
  const mediaSource = pickLocalDecodeMediaSource(mediaSources, requestedMediaSourceId);

  const mediaSourceId = stringFrom(mediaSource.Id) ?? "";
  const playMethod = localDecodePlayMethod(mediaSource);
  const playSessionId =
    stringFrom(info?.PlaySessionId) ?? stringFrom(mediaSource.PlaySessionId) ?? createId("play");
  // Remote/.strm sources (e.g. cnmbyd smartstrm) play from MediaSource.Path — an
  // absolute http(s) URL — NOT the server's /Videos/{id}/stream.{container} endpoint,
  // which returns 500 for a .strm container. Match the desktop path: play
  // MediaSource.Path directly (token-appended, proxied) when it's an http URL.
  const rawPath = stringFrom(mediaSource.Path) ?? "";
  const isHttpSource = /^https?:\/\//i.test(rawPath);
  let streamUrl: URL;
  if (isHttpSource) {
    try {
      streamUrl = new URL(rawPath);
    } catch {
      streamUrl = new URL(encodeURI(rawPath));
    }
    appendToken(streamUrl, account.accessToken, true);
  } else {
    const streamExt = safeStreamExtension(mediaSource.Container);
    const streamPath = streamExt ? `Videos/${itemId}/stream.${streamExt}` : `Videos/${itemId}/stream`;
    streamUrl = joinWebUrl(line.baseUrl, streamPath);
    streamUrl.searchParams.set("MediaSourceId", mediaSourceId);
    streamUrl.searchParams.set("PlaySessionId", playSessionId);
    streamUrl.searchParams.set("Static", "true");
    appendToken(streamUrl, account.accessToken, true);
  }

  const tracks = Array.isArray(mediaSource.MediaStreams)
    ? mediaSource.MediaStreams.map(normalizeTrack)
    : [];
  const source: PlaybackSource = {
    itemId,
    playSessionId,
    mediaSourceId,
    playMethod,
    lineId: line.id,
    lineName: line.name,
    streamUrl: proxiedStreamUrl(streamUrl),
    headers: playbackHeaders(server, line, account.accessToken),
    userAgent: defaultUserAgent(server, line),
    durationMs: Math.floor((numberFrom(mediaSource.RunTimeTicks) ?? 0) / 10_000),
    tracks,
    mediaSources: mediaSources.map((candidate: any, index: number) =>
      normalizePlaybackMediaSource(candidate, index, mediaSourceId),
    ),
    lines: playbackLineOptions(server, line),
    diagnostics: {
      streamKind: isHttpSource ? "web-preview-path-direct" : "web-preview-direct-static",
      sourceKind: localDecodeMode(mediaSource),
      mediaSourceCount: mediaSources.length,
      proxied: true,
      authQuery: true,
      serverTranscodingAllowed: false,
    },
  };
  return source;
}

function webSnapshotFromSource(source: PlaybackSource, startMs = 0): MpvSnapshot {
  return {
    ...webDefaultSnapshot(),
    url: source.streamUrl,
    paused: true,
    positionMs: Math.max(0, Math.floor(numberFrom(startMs) ?? 0)),
    durationMs: Math.max(0, Math.floor(source.durationMs ?? 0)),
    tracks: source.tracks ?? [],
  };
}

async function webReportPlaybackProgress(progress: any) {
  await webAuthedJson("POST", "Sessions/Playing/Progress", undefined, {
    ItemId: stringFrom(progress?.itemId) ?? "",
    PlaySessionId: stringFrom(progress?.playSessionId) ?? "",
    PositionTicks: numberFrom(progress?.positionTicks) ?? 0,
    IsPaused: boolFrom(progress?.isPaused) ?? false,
    PlayMethod: sanitizePlaybackMethod(
      webPlaybackSourceState?.playSessionId === progress?.playSessionId
        ? webPlaybackSourceState?.playMethod
        : progress?.playMethod,
    ),
    VolumeLevel: numberFrom(progress?.volumeLevel) ?? 80,
  }, webPlaybackSourceState?.lineId ?? null);
}

async function webReportPlaybackStopped(payload: any) {
  await webAuthedJson("POST", "Sessions/Playing/Stopped", undefined, {
    ItemId: stringFrom(payload?.itemId) ?? "",
    PlaySessionId: stringFrom(payload?.playSessionId) ?? "",
    PositionTicks: numberFrom(payload?.positionTicks) ?? 0,
  }, webPlaybackSourceState?.lineId ?? null);
  if (!payload?.playSessionId || webPlaybackSourceState?.playSessionId === payload.playSessionId) {
    webPlaybackSourceState = null;
    webPlaybackSnapshot = webDefaultSnapshot();
  }
}

function unsupportedWebCommand(command: string): Promise<never> {
  return Promise.reject(new Error(`Web Preview 不支持桌面命令：${command}，请使用桌面版`));
}

function webOpenExternal(url: unknown): Promise<void> {
  const text = stringFrom(url)?.trim();
  if (!text) return Promise.reject(new Error("open_external requires a url"));
  if (!/^(https?:|mailto:)/i.test(text)) {
    return Promise.reject(new Error("Web Preview 只能打开 http(s) 或 mailto 外部链接"));
  }
  window.open(text, "_blank", "noopener,noreferrer");
  return Promise.resolve();
}

function invokeWebFallback<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  switch (command) {
    case "get_settings":
      return Promise.resolve(getWebSettings() as T);
    case "update_settings":
      webSettings = { ...webSettings, ...((args?.patch as Partial<AppSettings>) ?? {}) };
      saveWebPreviewState();
      return Promise.resolve(getWebSettings() as T);
    case "list_servers":
      return Promise.resolve(clone(webServers) as T);
    case "detect_server": {
      const payload = args?.payload as any;
      return detectWebServerReal(payload) as Promise<T>;
    }
    case "add_server": {
      const server = createWebServer(args?.payload);
      webServers = [...webServers, server];
      saveWebPreviewState();
      return Promise.resolve(clone(server) as T);
    }
    case "update_server": {
      const payload = args?.payload as any;
      const index = webServers.findIndex((server) => server.id === payload?.id);
      if (index < 0) return Promise.reject(new Error(`server not found: ${payload?.id}`));
      const server = mergeWebServer(webServers[index]!, payload);
      webServers = webServers.map((item, itemIndex) => (itemIndex === index ? server : item));
      saveWebPreviewState();
      return Promise.resolve(clone(server) as T);
    }
    case "remove_server":
      webServers = webServers.filter((server) => server.id !== args?.id);
      webAccounts = webAccounts.filter((account) => account.serverId !== args?.id);
      if (!webAccounts.some((account) => account.id === webActiveAccountId)) {
        webActiveAccountId = webAccounts[0]?.id ?? null;
      }
      saveWebPreviewState();
      return Promise.resolve(undefined as T);
    case "set_active_line": {
      const payload = args?.payload as any;
      const server = webServers.find((item) => item.id === payload?.serverId);
      if (!server) return Promise.reject(new Error(`server not found: ${payload?.serverId}`));
      if (!server.lines.some((line) => line.id === payload?.lineId)) {
        return Promise.reject(new Error(`line not found: ${payload?.lineId}`));
      }
      server.activeLineId = payload.lineId;
      saveWebPreviewState();
      return Promise.resolve(clone(server) as T);
    }
    case "test_lines": {
      const server = webServers.find((item) => item.id === args?.serverId);
      if (!server) return Promise.reject(new Error(`server not found: ${args?.serverId}`));
      const checkedAt = new Date().toISOString();
      return (async () => {
        const reports: LineHealthReport[] = [];
        for (const line of server.lines) {
          if (!line.enabled) {
            reports.push({
              lineId: line.id,
              status: "unknown",
              latencyMs: null,
              httpStatus: null,
              error: "line disabled",
            });
            continue;
          }

          const started = performance.now();
          try {
            await webJson(
              joinWebUrl(line.baseUrl, "System/Info/Public"),
              { method: "GET", headers: webHeaders(server, line) },
              "test_lines",
            );
            const latencyMs = Math.round(performance.now() - started);
            reports.push({
              lineId: line.id,
              status: latencyMs > 1500 ? "slow" : "healthy",
              latencyMs,
              httpStatus: 200,
              error: null,
            });
          } catch (error) {
            reports.push({
              lineId: line.id,
              status: "down",
              latencyMs: null,
              httpStatus: null,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        server.lines = server.lines.map((line) => {
          const report = reports.find((item) => item.lineId === line.id);
          return {
            ...line,
            lastLatencyMs: report?.latencyMs ?? null,
            lastStatus: report?.status ?? "unknown",
            lastCheckedAt: checkedAt,
          };
        });
        if (server.autoFailover !== false) {
          server.activeLineId = bestWebLineId(server.lines) ?? server.activeLineId;
        }
        webServers = webServers.map((item) => (item.id === server.id ? { ...server } : item));
        saveWebPreviewState();
        return { serverId: server.id, reports } as T;
      })();
    }
    case "login": {
      const payload = args?.payload as any;
      const server = webServers.find((item) => item.id === payload?.serverId);
      if (!server) return Promise.reject(new Error(`server not found: ${payload?.serverId}`));
      const username = String(payload?.username ?? "").trim();
      if (!username || !payload?.password) {
        return Promise.reject(new Error("请输入账号和密码"));
      }
      return (async () => {
        const enabledLines = server.lines
          .filter((line) => line.enabled !== false)
          .sort((left, right) => left.priority - right.priority);
        if (enabledLines.length === 0) throw new Error("no available line");

        const errors: string[] = [];
        for (const line of enabledLines) {
          try {
            const auth = await webJson(
              joinWebUrl(line.baseUrl, "Users/AuthenticateByName"),
              {
                method: "POST",
                headers: webHeaders(server, line, null, true),
                body: JSON.stringify({ Username: username, Pw: payload.password }),
              },
              "authenticate",
            );
            const now = new Date().toISOString();
            const account: Account = {
              id: createId("account"),
              serverId: server.id,
              userId: stringFrom(auth?.User?.Id) ?? "",
              username: stringFrom(auth?.User?.Name) ?? username,
              accessToken: stringFrom(auth?.AccessToken) ?? "",
              avatarTag: stringFrom(auth?.User?.PrimaryImageTag),
              createdAt: now,
              lastUsedAt: now,
            };
            if (!account.userId || !account.accessToken) {
              throw new Error("authentication failed: missing user id or token");
            }
            server.activeLineId = line.id;
            webServers = webServers.map((item) => (item.id === server.id ? { ...server } : item));
            webAccounts = [
              account,
              ...webAccounts.filter(
                (item) => item.serverId !== server.id || item.username !== account.username,
              ),
            ];
            webActiveAccountId = account.id;
            saveWebPreviewState();
            return { account, winningLineId: line.id } as T;
          } catch (error) {
            errors.push(`${line.name}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        throw new Error(errors.join("; ") || "authentication failed");
      })();
    }
    case "list_accounts":
      return Promise.resolve(
        clone(
          [...webAccounts].sort((left, right) => {
            if (left.id === webActiveAccountId) return -1;
            if (right.id === webActiveAccountId) return 1;
            return Date.parse(right.lastUsedAt) - Date.parse(left.lastUsedAt);
          }),
        ) as T,
      );
    case "switch_account": {
      const account = webAccounts.find((item) => item.id === args?.accountId);
      if (!account) return Promise.reject(new Error(`account not found: ${args?.accountId}`));
      account.lastUsedAt = new Date().toISOString();
      webActiveAccountId = account.id;
      saveWebPreviewState();
      return Promise.resolve(clone(account) as T);
    }
    case "logout":
      webAccounts = webAccounts.filter((account) => account.id !== args?.accountId);
      if (webActiveAccountId === args?.accountId) {
        webActiveAccountId = webAccounts[0]?.id ?? null;
      }
      saveWebPreviewState();
      return Promise.resolve(undefined as T);
    case "list_downloads":
    case "list_notifications":
    case "list_danmaku_providers":
    case "list_remote_sessions":
    case "list_global_shortcuts":
      return Promise.resolve([] as T);
    case "open_download_directory":
      return unsupportedWebCommand(command) as Promise<T>;
    case "unread_count":
      return Promise.resolve(0 as T);
    case "list_views":
      return webAuthedJson("GET", `Users/${webActivePair().account.userId}/Views`)
        .then(normalizeItemsResponse) as Promise<T>;
    case "resume_items":
      return webAuthedJson("GET", `Users/${webActivePair().account.userId}/Items/Resume`, {
        Recursive: "true",
        MediaTypes: "Video",
        Fields: PERSONAL_ITEM_FIELDS,
        EnableUserData: "true",
        EnableImages: "true",
        ImageTypeLimit: "3",
        EnableImageTypes: "Primary,Backdrop,Thumb",
        Limit: "120",
      })
        .then(normalizeItemsResponse) as Promise<T>;
    case "resume_items_all_accounts":
      return webAuthedJson("GET", `Users/${webActivePair().account.userId}/Items/Resume`, {
        Recursive: "true",
        MediaTypes: "Video",
        Fields: PERSONAL_ITEM_FIELDS,
        EnableUserData: "true",
        EnableImages: "true",
        ImageTypeLimit: "3",
        EnableImageTypes: "Primary,Backdrop,Thumb",
        Limit: "120",
      })
        .then(annotateWebItemsResponse) as Promise<T>;
    case "list_items": {
      const payload = args?.payload as any;
      const query = Object.fromEntries((payload?.params as [string, string][] | undefined) ?? []);
      if (payload?.parentId) query.ParentId = payload.parentId;
      return webAuthedJson("GET", `Users/${webActivePair().account.userId}/Items`, query)
        .then(normalizeItemsResponse) as Promise<T>;
    }
    case "list_items_all_accounts": {
      const payload = args?.payload as any;
      const query = Object.fromEntries((payload?.params as [string, string][] | undefined) ?? []);
      if (payload?.parentId) query.ParentId = payload.parentId;
      return webAuthedJson("GET", `Users/${webActivePair().account.userId}/Items`, query)
        .then(annotateWebItemsResponse) as Promise<T>;
    }
    case "get_item_detail": {
      const pair = webActivePair();
      return webAuthedJson("GET", `Users/${pair.account.userId}/Items/${args?.itemId}`, {
        Fields:
          `Overview,Genres,GenreItems,Studios,People,ProviderIds,CommunityRating,OfficialRating,PrimaryImageAspectRatio,UserData,RunTimeTicks,SeriesInfo,ProductionYear,MediaSources,${IMAGE_FALLBACK_FIELDS}`,
      }).then(normalizeMediaItem) as Promise<T>;
    }
    case "search":
      return webAuthedJson("GET", `Users/${webActivePair().account.userId}/Items`, {
        SearchTerm: args?.term ?? "",
        Recursive: "true",
        Fields: `PrimaryImageAspectRatio,Overview,ProductionYear,UserData,${IMAGE_FALLBACK_FIELDS}`,
        Limit: "50",
      }).then(normalizeItemsResponse) as Promise<T>;
    case "search_all_accounts":
      return webAuthedJson("GET", `Users/${webActivePair().account.userId}/Items`, {
        SearchTerm: args?.term ?? "",
        Recursive: "true",
        Fields: `PrimaryImageAspectRatio,Overview,ProductionYear,UserData,${IMAGE_FALLBACK_FIELDS}`,
        Limit: "50",
      }).then(annotateWebItemsResponse) as Promise<T>;
    case "list_seasons":
      return webAuthedJson("GET", `Shows/${args?.seriesId}/Seasons`, {
        UserId: webActivePair().account.userId,
      }).then(normalizeItemsResponse) as Promise<T>;
    case "list_episodes": {
      const payload = args?.payload as any;
      return webAuthedJson("GET", `Shows/${payload?.seriesId}/Episodes`, {
        UserId: webActivePair().account.userId,
        SeasonId: payload?.seasonId ?? null,
        Fields: `Overview,PrimaryImageAspectRatio,UserData,RunTimeTicks,SeriesInfo,${IMAGE_FALLBACK_FIELDS}`,
      }).then(normalizeItemsResponse) as Promise<T>;
    }
    case "similar_items":
      return webAuthedJson("GET", `Items/${args?.itemId}/Similar`, {
        UserId: webActivePair().account.userId,
        Limit: args?.limit ?? 18,
        Fields: `PrimaryImageAspectRatio,Overview,ProductionYear,UserData,SeriesInfo,${IMAGE_FALLBACK_FIELDS}`,
      }).then(normalizeItemsResponse) as Promise<T>;
    case "special_features":
      return webAuthedJson("GET", `Users/${webActivePair().account.userId}/Items/${args?.itemId}/SpecialFeatures`, {
        Limit: args?.limit ?? 18,
        Fields: `PrimaryImageAspectRatio,Overview,ProductionYear,UserData,SeriesInfo,RunTimeTicks,${IMAGE_FALLBACK_FIELDS}`,
      }).then(normalizeItemsResponse) as Promise<T>;
    case "get_playback_source": {
      const payload = args?.payload as any;
      return (async () => {
        const source = await webPlaybackSource(String(payload?.itemId ?? ""), payload?.startMs ?? 0, {
          lineId: stringFrom(payload?.lineId),
          mediaSourceId: stringFrom(payload?.mediaSourceId),
        });
        webPlaybackSourceState = source;
        webPlaybackSnapshot = webSnapshotFromSource(source, payload?.startMs ?? 0);
        return source as T;
      })();
    }
    case "play": {
      const payload = args?.payload as any;
      return (async () => {
        const source = await webPlaybackSource(String(payload?.itemId ?? ""), payload?.startMs ?? 0, {
          lineId: stringFrom(payload?.lineId),
          mediaSourceId: stringFrom(payload?.mediaSourceId),
        });
        webPlaybackSourceState = source;
        webPlaybackSnapshot = webSnapshotFromSource(source, payload?.startMs ?? 0);
        return source as T;
      })();
    }
    case "report_playback_progress":
      return webReportPlaybackProgress(args?.progress).then(() => undefined as T);
    case "report_playback_stopped":
      return webReportPlaybackStopped(args?.payload).then(() => undefined as T);
    case "get_state":
      return Promise.resolve(clone(webPlaybackSnapshot) as T);
    case "pause":
      webPlaybackSnapshot = { ...webPlaybackSnapshot, paused: true };
      return Promise.resolve(undefined as T);
    case "resume":
      webPlaybackSnapshot = { ...webPlaybackSnapshot, paused: false };
      return Promise.resolve(undefined as T);
    case "seek": {
      const positionMs = numberFrom((args?.payload as any)?.positionMs) ?? 0;
      webPlaybackSnapshot = {
        ...webPlaybackSnapshot,
        positionMs: Math.max(0, Math.floor(positionMs)),
      };
      return Promise.resolve(undefined as T);
    }
    case "seek_relative": {
      const deltaMs = numberFrom((args?.payload as any)?.deltaMs) ?? 0;
      const durationMs = webPlaybackSnapshot.durationMs;
      const positionMs = Math.max(0, Math.floor(webPlaybackSnapshot.positionMs + deltaMs));
      webPlaybackSnapshot = {
        ...webPlaybackSnapshot,
        positionMs: durationMs > 0 ? Math.min(positionMs, durationMs) : positionMs,
      };
      return Promise.resolve(undefined as T);
    }
    case "set_speed": {
      const speed = numberFrom((args?.payload as any)?.speed) ?? 1;
      webPlaybackSnapshot = { ...webPlaybackSnapshot, speed };
      return Promise.resolve(undefined as T);
    }
    case "set_volume": {
      const volume = numberFrom((args?.payload as any)?.volume) ?? webPlaybackSnapshot.volume;
      webPlaybackSnapshot = { ...webPlaybackSnapshot, volume };
      return Promise.resolve(undefined as T);
    }
    case "set_muted": {
      const muted = boolFrom((args?.payload as any)?.muted) ?? webPlaybackSnapshot.muted;
      webPlaybackSnapshot = { ...webPlaybackSnapshot, muted };
      return Promise.resolve(undefined as T);
    }
    case "stop":
      webPlaybackSourceState = null;
      webPlaybackSnapshot = webDefaultSnapshot();
      return Promise.resolve(undefined as T);
    case "list_subtitles":
      return Promise.resolve(null as T);
    case "search_online_subtitles":
      return Promise.reject(new Error("Web Preview 不支持在线字幕搜索，请使用桌面版"));
    case "resolve_online_subtitle":
      return Promise.reject(new Error("Web Preview 不支持在线字幕加载，请使用桌面版"));
    case "play_file":
      return Promise.reject(
        new Error("Web Preview 不支持直接播放本地文件，请使用桌面版"),
      );
    case "list_local_folder":
      return unsupportedWebCommand(command) as Promise<T>;
    case "list_webdav_folder":
      return webListDavFolder(args?.payload) as Promise<T>;
    case "list_alist_folder":
      return webListAlistFolder(args?.payload) as Promise<T>;
    case "resolve_alist_file":
      return webResolveAlistFile(args?.payload) as Promise<T>;
    case "play_webdav_file": {
      const payload = args?.payload as any;
      webPlaybackSourceState = null;
      webPlaybackSnapshot = {
        ...webDefaultSnapshot(),
        url: stringFrom(payload?.url),
        paused: true,
        positionMs: Math.max(0, Math.floor(numberFrom(payload?.startMs) ?? 0)),
      };
      return Promise.resolve(undefined as T);
    }
    case "play_alist_file": {
      const payload = args?.payload as any;
      webPlaybackSourceState = null;
      webPlaybackSnapshot = {
        ...webDefaultSnapshot(),
        url: stringFrom(payload?.url),
        paused: true,
        positionMs: Math.max(0, Math.floor(numberFrom(payload?.startMs) ?? 0)),
      };
      return Promise.resolve(undefined as T);
    }
    case "import_danmaku_xml":
      return unsupportedWebCommand(command) as Promise<T>;
    case "export_config": {
      const backup = webConfigBackup();
      const filePath = downloadWebBackup(backup);
      return Promise.resolve({
        filePath,
        servers: backup.data.servers.length,
        accounts: backup.data.accountProfiles.length,
        shortcuts: backup.data.globalShortcuts.length,
        credentialsOmitted: true,
      } as T);
    }
    case "import_config":
      return importWebBackup(((args?.payload as any)?.mode ?? "merge") as "merge" | "replace") as Promise<T>;
    case "open_path":
    case "show_mpv_stats_osd":
    case "set_always_on_top":
    case "set_secondary_subtitle_track":
      return unsupportedWebCommand(command) as Promise<T>;
    case "open_external":
      return webOpenExternal(args?.url) as Promise<T>;
    case "set_secondary_display_blackout":
      return unsupportedWebCommand(command) as Promise<T>;
    case "set_fullscreen":
      return unsupportedWebCommand(command) as Promise<T>;
    default:
      return Promise.reject(new Error(`Web preview does not implement command: ${command}`));
  }
}

export async function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (window.hillsLite) {
    return window.hillsLite.invoke<T>(command, args);
  }

  if (!hasTauriRuntime()) {
    return invokeWebFallback<T>(command, args);
  }

  const tauri = await import("@tauri-apps/api/core");
  return tauri.invoke<T>(command, args);
}

export async function invokeCancellable<T>(
  command: string,
  args?: Record<string, unknown>,
  options?: { signal?: AbortSignal },
): Promise<T> {
  if (window.hillsLite) {
    return window.hillsLite.invokeCancellable<T>(command, args, options);
  }

  if (!hasTauriRuntime()) {
    const signal = options?.signal;
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    return invokeWebFallback<T>(command, args);
  }

  const signal = options?.signal;
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const tauri = await import("@tauri-apps/api/core");
  return tauri.invoke<T>(command, args);
}

export async function listen<T>(
  event: string,
  handler: (event: PlatformEvent<T>) => void,
): Promise<UnlistenFn> {
  if (window.hillsLite) {
    return window.hillsLite.listen(event, handler);
  }

  if (!hasTauriRuntime()) {
    return () => {};
  }

  const tauri = await import("@tauri-apps/api/event");
  return tauri.listen<T>(event, handler);
}

export async function openFileDialog(
  options?: OpenFileDialogOptions,
): Promise<string | string[] | null> {
  if (window.hillsLite) {
    return window.hillsLite.openFileDialog(options);
  }

  if (!hasTauriRuntime()) {
    return null;
  }

  const dialog = await import("@tauri-apps/plugin-dialog");
  return dialog.open(options);
}

export async function platformType(): Promise<string> {
  if (window.hillsLite) {
    return window.hillsLite.platformType();
  }

  if (!hasTauriRuntime()) {
    return "web";
  }

  const os = await import("@tauri-apps/plugin-os");
  return os.type();
}
