import { invoke } from "@tauri-apps/api/core";

import type {
  Account,
  AppNotification,
  AppSettings,
  DanmakuProviderInfo,
  DanmakuResult,
  DownloadTask,
  ItemsResponse,
  LineHealthReport,
  MediaItem,
  MpvSnapshot,
  RemoteSession,
  Server,
  ServerKind,
  SubtitleList,
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
    lines: Array<{
      name: string;
      baseUrl: string;
      userAgent?: string | null;
      headers?: [string, string][];
      priority?: number;
      enabled?: boolean;
    }>;
    defaultUserAgent?: string | null;
  }) => invoke<Server>("add_server", { payload }),
  updateServer: (payload: {
    id: string;
    name?: string;
    kind?: ServerKind;
    defaultUserAgent?: string | null;
    autoFailover?: boolean;
    lines?: Array<{
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
  listSeasons: (seriesId: string) =>
    invoke<ItemsResponse>("list_seasons", { seriesId }),
  listEpisodes: (payload: { seriesId: string; seasonId?: string | null }) =>
    invoke<ItemsResponse>("list_episodes", { payload }),

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
    recordWhilePlaying?: boolean;
    stealthWhenRecording?: boolean;
  }) => invoke<string>("play", { payload }),
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

  // Danmaku
  listDanmakuProviders: () =>
    invoke<DanmakuProviderInfo[]>("list_danmaku_providers"),
  fetchDanmaku: (itemId: string, provider?: string) =>
    invoke<DanmakuResult | null>("fetch_danmaku", { itemId, provider }),

  // Downloads
  listDownloads: () => invoke<DownloadTask[]>("list_downloads"),
  startDownload: (payload: { itemId: string; stealth?: boolean; preferDirect?: boolean }) =>
    invoke<DownloadTask>("start_download", { payload }),
  pauseDownload: (id: string) => invoke<void>("pause_download", { payload: { id } }),
  resumeDownload: (id: string) => invoke<void>("resume_download", { payload: { id } }),
  cancelDownload: (id: string) => invoke<void>("cancel_download", { payload: { id } }),
  removeDownload: (id: string, deleteFile: boolean) =>
    invoke<void>("remove_download", { payload: { id, deleteFile } }),
  playLocal: (id: string, startMs?: number | null) =>
    invoke<void>("play_local", { payload: { id, startMs } }),

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

  // Global shortcuts
  listGlobalShortcuts: () =>
    invoke<{ action: string; accelerator: string }[]>("list_global_shortcuts"),
  setGlobalShortcut: (payload: { action: string; accelerator: string }) =>
    invoke<{ action: string; accelerator: string }[]>("set_global_shortcut", { payload }),
  clearGlobalShortcut: (payload: { action: string }) =>
    invoke<{ action: string; accelerator: string }[]>("clear_global_shortcut", { payload }),
  resetGlobalShortcuts: () =>
    invoke<{ action: string; accelerator: string }[]>("reset_global_shortcuts"),

  detectMpv: () =>
    invoke<{ found: boolean; path: string; bundled: boolean }>("detect_mpv"),
  openExternal: (url: string) => invoke<void>("open_external", { url }),
};
