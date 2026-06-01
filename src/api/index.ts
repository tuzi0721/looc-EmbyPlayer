import { invoke } from "@/platform";

import type {
  Account,
  AppNotification,
  AppSettings,
  DanmakuProviderInfo,
  DanmakuResult,
  DownloadTask,
  ItemsResponse,
  LineStatus,
  LineHealthReport,
  MediaItem,
  MpvSnapshot,
  OnlineSubtitleResolveResult,
  OnlineSubtitleSearchResponse,
  PictureMode,
  RemoteSession,
  Server,
  ServerKind,
  SubtitleList,
  SubtitleStyleSettings,
  UserData,
  ViewsResponse,
} from "@/types/models";

// ── Auth ────────────────────────────────────────────────────────────────────

export interface LoginPayload {
  serverId: string;
  username: string;
  password: string;
}

export interface LoginResult {
  account: Account;
  winningLineId: string;
}

export interface PlaybackSource {
  itemId: string;
  playSessionId: string;
  mediaSourceId: string;
  lineId?: string | null;
  lineName?: string | null;
  streamUrl: string;
  durationMs?: number | null;
  tracks?: MpvSnapshot["tracks"];
  mediaSources?: PlaybackMediaSource[];
  lines?: PlaybackLineOption[];
  headers?: [string, string][];
  userAgent?: string | null;
  diagnostics?: unknown;
}

export interface PlaybackMediaSource {
  id: string;
  name?: string | null;
  displayName: string;
  container?: string | null;
  protocol?: string | null;
  path?: string | null;
  bitrate?: number | null;
  size?: number | null;
  width?: number | null;
  height?: number | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  audioLanguage?: string | null;
  supportsDirectPlay?: boolean | null;
  supportsDirectStream?: boolean | null;
  supportsTranscoding?: boolean | null;
  isRemote?: boolean | null;
  selected: boolean;
}

export interface PlaybackLineOption {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  status?: LineStatus | null;
  latencyMs?: number | null;
  selected: boolean;
}

export interface ConfigTransferSummary {
  filePath: string;
  mode?: "merge" | "replace";
  servers: number;
  accounts: number;
  shortcuts: number;
}

export interface DetectServerLineReport {
  lineId: string;
  lineName: string;
  status: "healthy" | "down";
  kind?: ServerKind | null;
  serverName?: string | null;
  version?: string | null;
  productName?: string | null;
  latencyMs?: number | null;
  error?: string | null;
}

export interface DetectServerResult {
  kind: ServerKind;
  winningLineId: string;
  serverName?: string | null;
  version?: string | null;
  productName?: string | null;
  reports: DetectServerLineReport[];
}

export interface LocalNfoMetadata {
  title?: string | null;
  year?: number | null;
  overview?: string | null;
}

export interface LocalFolderVideo {
  filePath: string;
  relativePath?: string | null;
  name: string;
  extension: string;
  posterPath?: string | null;
  posterUrl?: string | null;
  nfoPath?: string | null;
  nfo?: LocalNfoMetadata | null;
  sidecarSubtitleCount?: number;
  sidecarDanmakuPath?: string | null;
  sizeBytes: number;
  modifiedAtMs?: number | null;
}

export interface LocalFolderListing {
  directory: string;
  recursive: boolean;
  truncated: boolean;
  items: LocalFolderVideo[];
}

export interface WebDavEntry {
  name: string;
  url: string;
  path: string;
  isDirectory: boolean;
  extension: string;
  sizeBytes: number;
  modifiedAtMs?: number | null;
  contentType?: string | null;
  playable: boolean;
  sidecarSubtitleCount?: number;
  sidecarSubtitles?: WebDavSidecarSubtitle[];
  sidecarDanmaku?: WebDavSidecarDanmaku | null;
}

export interface WebDavSidecarSubtitle {
  name: string;
  url: string;
  extension: string;
}

export interface WebDavSidecarDanmaku {
  name: string;
  url: string;
}

export interface WebDavListing {
  rootUrl: string;
  path: string;
  directoryUrl: string;
  items: WebDavEntry[];
}

export interface AlistEntry {
  name: string;
  url: string;
  path: string;
  isDirectory: boolean;
  extension: string;
  sizeBytes: number;
  modifiedAtMs?: number | null;
  contentType?: string | null;
  thumb?: string | null;
  sign?: string | null;
  playable: boolean;
  sidecarSubtitleCount?: number;
  sidecarSubtitles?: WebDavSidecarSubtitle[];
  sidecarDanmaku?: WebDavSidecarDanmaku | null;
}

export interface AlistListing {
  rootUrl: string;
  path: string;
  directoryUrl: string;
  total: number;
  provider?: string | null;
  items: AlistEntry[];
}

export interface AlistFileResolution {
  path: string;
  name: string;
  url: string;
}

export interface ScreenshotResult {
  filePath: string;
}

export interface SecondaryDisplayBlackoutResult {
  count: number;
}

export const api = {
  // Auth
  login: (payload: LoginPayload) => invoke<LoginResult>("login", { payload }),
  logout: (accountId: string) => invoke<void>("logout", { accountId }),
  listAccounts: () => invoke<Account[]>("list_accounts"),
  switchAccount: (accountId: string) => invoke<Account>("switch_account", { accountId }),

  // Server
  listServers: () => invoke<Server[]>("list_servers"),
  addServer: (payload: {
    name: string;
    kind: ServerKind;
    activeLineId?: string | null;
    lines: Array<{
      id?: string;
      name: string;
      baseUrl: string;
      userAgent?: string | null;
      headers?: [string, string][];
      priority?: number;
      enabled?: boolean;
    }>;
    defaultUserAgent?: string | null;
  }) => invoke<Server>("add_server", { payload }),
  detectServer: (payload: {
    name?: string;
    lines: Array<{
      id?: string;
      name: string;
      baseUrl: string;
      userAgent?: string | null;
      headers?: [string, string][];
      priority?: number;
      enabled?: boolean;
    }>;
    defaultUserAgent?: string | null;
  }) => invoke<DetectServerResult>("detect_server", { payload }),
  updateServer: (payload: {
    id: string;
    name?: string;
    kind?: ServerKind;
    defaultUserAgent?: string | null;
    autoFailover?: boolean;
    lines?: Array<{
      id?: string;
      name: string;
      baseUrl: string;
      userAgent?: string | null;
      headers?: [string, string][];
      priority?: number;
      enabled?: boolean;
    }>;
  }) => invoke<Server>("update_server", { payload }),
  removeServer: (id: string) => invoke<void>("remove_server", { id }),
  testLines: (serverId: string) =>
    invoke<{ serverId: string; reports: LineHealthReport[] }>("test_lines", { serverId }),
  setActiveLine: (serverId: string, lineId: string) =>
    invoke<Server>("set_active_line", { payload: { serverId, lineId } }),

  // Media
  listViews: () => invoke<ViewsResponse>("list_views"),
  listItems: (payload: { parentId?: string; params?: [string, string][] }) =>
    invoke<ItemsResponse>("list_items", { payload }),
  getItemDetail: (itemId: string) => invoke<MediaItem>("get_item_detail", { itemId }),
  search: (term: string) => invoke<ItemsResponse>("search", { term }),
  resumeItems: () => invoke<ItemsResponse>("resume_items"),
  playbackHistory: (
    payload: {
      includeTypes?: "Movie,Episode" | "Movie" | "Episode";
      startIndex?: number;
      limit?: number;
    } = {},
  ) =>
    invoke<ItemsResponse>("list_items", {
      payload: {
        params: [
          ["Filters", "IsPlayed"],
          ["Recursive", "true"],
          ["IncludeItemTypes", payload.includeTypes ?? "Movie,Episode"],
          ["Fields", "PrimaryImageAspectRatio,ProductionYear,Overview,UserData,SeriesInfo,RunTimeTicks"],
          ["SortBy", "DatePlayed"],
          ["SortOrder", "Descending"],
          ["StartIndex", String(Math.max(0, payload.startIndex ?? 0))],
          ["Limit", String(Math.max(1, payload.limit ?? 120))],
        ],
      },
    }),
  listSeasons: (seriesId: string) =>
    invoke<ItemsResponse>("list_seasons", { seriesId }),
  listEpisodes: (payload: { seriesId: string; seasonId?: string | null }) =>
    invoke<ItemsResponse>("list_episodes", { payload }),
  similarItems: (itemId: string, limit = 18) =>
    invoke<ItemsResponse>("similar_items", { itemId, limit }),
  specialFeatures: (itemId: string, limit = 18) =>
    invoke<ItemsResponse>("special_features", { itemId, limit }),
  setItemFavorite: (payload: { itemId: string; value: boolean }) =>
    invoke<UserData>("set_item_favorite", { payload }),
  setItemPlayed: (payload: { itemId: string; value: boolean }) =>
    invoke<UserData>("set_item_played", { payload }),
  getPlaybackSource: (payload: {
    itemId: string;
    startMs?: number | null;
    lineId?: string | null;
    mediaSourceId?: string | null;
  }) =>
    invoke<PlaybackSource>("get_playback_source", { payload }),

  reportPlaybackProgress: (progress: {
    itemId: string;
    playSessionId: string;
    positionTicks: number;
    isPaused: boolean;
    playMethod: string;
    volumeLevel: number;
  }) => invoke<void>("report_playback_progress", { progress }),
  reportPlaybackStopped: (payload: {
    itemId: string;
    playSessionId: string;
    positionTicks: number;
  }) => invoke<void>("report_playback_stopped", { payload }),

  // Player
  play: (payload: {
    itemId: string;
    startMs?: number | null;
    preferDirect?: boolean;
    lineId?: string | null;
    mediaSourceId?: string | null;
    recordWhilePlaying?: boolean;
    stealthWhenRecording?: boolean;
  }) => invoke<string | PlaybackSource>("play", { payload }),
  playExternal: (payload: {
    itemId: string;
    startMs?: number | null;
    title?: string | null;
    lineId?: string | null;
    mediaSourceId?: string | null;
  }) =>
    invoke<void>("play_external", { payload }),
  pause: () => invoke<void>("pause"),
  resume: () => invoke<void>("resume"),
  stop: () => invoke<void>("stop"),
  seek: (positionMs: number) => invoke<void>("seek", { payload: { positionMs } }),
  setSpeed: (speed: number) => invoke<void>("set_speed", { payload: { speed } }),
  setAudioTrack: (trackId: number) => invoke<void>("set_audio_track", { payload: { trackId } }),
  setSubtitleTrack: (trackId: number | null) =>
    invoke<void>("set_subtitle_track", { payload: { trackId } }),
  setVolume: (volume: number) => invoke<void>("set_volume", { payload: { volume } }),
  setMuted: (muted: boolean) => invoke<void>("set_muted", { payload: { muted } }),
  setPictureMode: (mode: PictureMode) =>
    invoke<void>("set_picture_mode", { payload: { mode } }),
  showMpvStatsOsd: (page = 1) =>
    invoke<void>("show_mpv_stats_osd", { page }),
  setAlwaysOnTop: (enabled: boolean) =>
    invoke<void>("set_always_on_top", { enabled }),
  setSecondaryDisplayBlackout: (enabled: boolean) =>
    invoke<SecondaryDisplayBlackoutResult>("set_secondary_display_blackout", { enabled }),
  takeScreenshot: (payload: { title?: string | null; includeSubtitles?: boolean } = {}) =>
    invoke<ScreenshotResult>("take_screenshot", { payload }),
  getState: () => invoke<MpvSnapshot>("get_state"),

  // Embedded MPV native child window
  embedAttach: () => invoke<void>("embed_attach"),
  embedSetRect: (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
  }) => invoke<void>("embed_set_rect", { rect }),
  embedSetVisible: (visible: boolean) => invoke<void>("embed_set_visible", { visible }),
  embedDetach: () => invoke<void>("embed_detach"),

  // Settings
  getSettings: () => invoke<AppSettings>("get_settings"),
  updateSettings: (patch: Partial<AppSettings>) =>
    invoke<AppSettings>("update_settings", { patch }),
  exportConfig: () => invoke<ConfigTransferSummary | null>("export_config"),
  importConfig: (mode: "merge" | "replace" = "merge") =>
    invoke<ConfigTransferSummary | null>("import_config", { payload: { mode } }),

  // Danmaku
  listDanmakuProviders: () =>
    invoke<DanmakuProviderInfo[]>("list_danmaku_providers"),
  fetchDanmaku: (itemId: string, provider?: string) =>
    invoke<DanmakuResult | null>("fetch_danmaku", { itemId, provider }),
  importDanmakuXml: (payload: {
    filePath?: string;
    url?: string;
    username?: string | null;
    password?: string | null;
  }) =>
    invoke<DanmakuResult>("import_danmaku_xml", { payload }),

  // Downloads
  listDownloads: () => invoke<DownloadTask[]>("list_downloads"),
  startDownload: (payload: { itemId: string; stealth?: boolean; preferDirect?: boolean }) =>
    invoke<DownloadTask>("start_download", { payload }),
  openDownloadDirectory: () => invoke<string>("open_download_directory"),
  pauseDownload: (id: string) => invoke<void>("pause_download", { payload: { id } }),
  resumeDownload: (id: string) => invoke<void>("resume_download", { payload: { id } }),
  cancelDownload: (id: string) => invoke<void>("cancel_download", { payload: { id } }),
  removeDownload: (id: string, deleteFile: boolean) =>
    invoke<void>("remove_download", { payload: { id, deleteFile } }),
  playLocal: (id: string, startMs?: number | null) =>
    invoke<void>("play_local", { payload: { id, startMs } }),
  playFile: (payload: { filePath: string; startMs?: number | null }) =>
    invoke<void>("play_file", { payload }),
  listLocalFolder: (payload: { directory: string; recursive?: boolean }) =>
    invoke<LocalFolderListing>("list_local_folder", { payload }),
  listWebDavFolder: (payload: {
    baseUrl: string;
    path?: string | null;
    username?: string | null;
    password?: string | null;
    timeoutMs?: number | null;
  }) => invoke<WebDavListing>("list_webdav_folder", { payload }),
  listAlistFolder: (payload: {
    baseUrl: string;
    path?: string | null;
    token?: string | null;
    pathPassword?: string | null;
    refresh?: boolean;
    page?: number | null;
    perPage?: number | null;
    timeoutMs?: number | null;
  }) => invoke<AlistListing>("list_alist_folder", { payload }),
  resolveAlistFile: (payload: {
    baseUrl: string;
    path: string;
    token?: string | null;
    pathPassword?: string | null;
    timeoutMs?: number | null;
  }) => invoke<AlistFileResolution>("resolve_alist_file", { payload }),
  playWebDavFile: (payload: {
    url: string;
    title?: string | null;
    username?: string | null;
    password?: string | null;
    userAgent?: string | null;
    sidecarSubtitles?: WebDavSidecarSubtitle[];
    sidecarDanmaku?: WebDavSidecarDanmaku | null;
    startMs?: number | null;
  }) => invoke<void>("play_webdav_file", { payload }),
  playAlistFile: (payload: {
    url: string;
    title?: string | null;
    token?: string | null;
    userAgent?: string | null;
    sidecarSubtitles?: WebDavSidecarSubtitle[];
    sidecarDanmaku?: WebDavSidecarDanmaku | null;
    startMs?: number | null;
  }) => invoke<void>("play_alist_file", { payload }),

  // Notifications
  listNotifications: () => invoke<AppNotification[]>("list_notifications"),
  unreadCount: () => invoke<number>("unread_count"),
  dismissNotification: (id: string) =>
    invoke<void>("dismiss_notification", { payload: { id } }),
  markNotificationRead: (id: string) =>
    invoke<void>("mark_notification_read", { payload: { id } }),
  markAllNotificationsRead: () => invoke<void>("mark_all_notifications_read"),
  clearNotifications: () => invoke<void>("clear_notifications"),

  // Subtitles
  listSubtitles: () => invoke<SubtitleList | null>("list_subtitles"),
  searchOnlineSubtitles: (payload: {
    provider: "assrt";
    token: string;
    query: string;
    limit?: number;
  }) => invoke<OnlineSubtitleSearchResponse>("search_online_subtitles", { payload }),
  resolveOnlineSubtitle: (payload: {
    provider: "assrt";
    token: string;
    id: string;
  }) => invoke<OnlineSubtitleResolveResult>("resolve_online_subtitle", { payload }),
  addSubtitle: (payload: {
    source: string;
    title?: string;
    lang?: string;
    select?: boolean;
  }) => invoke<void>("add_subtitle", { payload }),
  removeSubtitle: (trackId: number) =>
    invoke<void>("remove_subtitle", { payload: { trackId } }),
  setSubtitleDelay: (delayMs: number) =>
    invoke<void>("set_subtitle_delay", { payload: { delayMs } }),
  setSubtitleScale: (scale: number) =>
    invoke<void>("set_subtitle_scale", { payload: { scale } }),
  setSubtitleStyle: (payload: SubtitleStyleSettings) =>
    invoke<void>("set_subtitle_style", { payload }),
  setSecondarySubtitleTrack: (trackId: number | null) =>
    invoke<void>("set_secondary_subtitle_track", { payload: { trackId } }),
  cycleSubtitle: () => invoke<void>("cycle_subtitle"),

  // Remote control / sync playback
  listRemoteSessions: () => invoke<RemoteSession[]>("list_remote_sessions"),
  remotePlaystate: (payload: {
    sessionId: string;
    command: string;
    seekPositionTicks?: number;
  }) => invoke<void>("remote_playstate", { payload }),
  remotePlay: (payload: {
    sessionId: string;
    itemIds: string[];
    startPositionTicks?: number;
  }) => invoke<void>("remote_play", { payload }),
  remoteSetVolume: (payload: { sessionId: string; volume: number }) =>
    invoke<void>("remote_set_volume", { payload }),
  remoteDisplayMessage: (payload: {
    sessionId: string;
    header: string;
    text: string;
  }) => invoke<void>("remote_display_message", { payload }),

  // System media (SMTC / MPRIS)
  setNowPlaying: (info: {
    title: string;
    subtitle?: string | null;
    artist?: string | null;
    album?: string | null;
    durationMs?: number | null;
    positionMs?: number | null;
    thumbnailUrl?: string | null;
  }) => invoke<void>("set_now_playing", { info }),
  setNowPlayingStatus: (status: "playing" | "paused" | "stopped") =>
    invoke<void>("set_now_playing_status", { payload: { status } }),
  setNowPlayingPosition: (payload: { positionMs: number; durationMs: number }) =>
    invoke<void>("set_now_playing_position", { payload }),
  clearNowPlaying: () => invoke<void>("clear_now_playing"),
  openPath: (path: string) => invoke<void>("open_path", { path }),

  // Global shortcuts
  listGlobalShortcuts: () =>
    invoke<{ action: string; accelerator: string }[]>("list_global_shortcuts"),
  setGlobalShortcut: (payload: { action: string; accelerator: string }) =>
    invoke<{ action: string; accelerator: string }[]>("set_global_shortcut", { payload }),
  clearGlobalShortcut: (payload: { action: string }) =>
    invoke<{ action: string; accelerator: string }[]>("clear_global_shortcut", { payload }),
  resetGlobalShortcuts: () =>
    invoke<{ action: string; accelerator: string }[]>("reset_global_shortcuts"),

  openExternal: (url: string) => invoke<void>("open_external", { url }),
};
