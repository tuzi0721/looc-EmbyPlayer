export type ServerKind = "emby" | "jellyfin";

export type LineStatus = "healthy" | "slow" | "degraded" | "down" | "unknown";

export interface Line {
  id: string;
  name: string;
  baseUrl: string;
  userAgent?: string | null;
  headers: [string, string][];
  priority: number;
  enabled: boolean;
  lastLatencyMs?: number | null;
  lastStatus?: LineStatus | null;
  lastCheckedAt?: string | null;
}

export interface Server {
  id: string;
  name: string;
  kind: ServerKind;
  lines: Line[];
  activeLineId?: string | null;
  defaultUserAgent?: string | null;
  autoFailover: boolean;
  createdAt: string;
}

export interface Account {
  id: string;
  serverId: string;
  userId: string;
  username: string;
  accessToken: string;
  avatarTag?: string | null;
  createdAt: string;
  lastUsedAt: string;
}

export interface AppSettings {
  heartbeatIntervalSecs: number;
  healthCheckIntervalSecs: number;
  raceTimeoutMs: number;
  requestTimeoutMs: number;
  defaultUserAgent: string;
  theme: "dark" | "light" | "auto";
  blurStrength: number;
  enableWindowVibrancy: boolean;
  mpvBackend: "ipc" | "embedded";
  mpvExecutablePath?: string | null;
  hardwareDecoding: boolean;
  mpvCacheMb: number;
  hiddenServerIds: string[];
}

export interface LineHealthReport {
  lineId: string;
  status: LineStatus;
  latencyMs?: number | null;
  httpStatus?: number | null;
  error?: string | null;
}

export interface UserData {
  PlayedPercentage?: number | null;
  PlaybackPositionTicks?: number | null;
  Played: boolean;
  IsFavorite: boolean;
  PlayCount: number;
}

export interface MediaItem {
  Id: string;
  Name: string;
  Type?: string | null;
  Overview?: string | null;
  ProductionYear?: number | null;
  CommunityRating?: number | null;
  OfficialRating?: string | null;
  RunTimeTicks?: number | null;
  SeriesName?: string | null;
  SeriesId?: string | null;
  SeasonId?: string | null;
  IndexNumber?: number | null;
  ParentIndexNumber?: number | null;
  ImageTags?: Record<string, string> | null;
  BackdropImageTags?: string[] | null;
  UserData?: UserData | null;
}

export interface ItemsResponse {
  Items: MediaItem[];
  TotalRecordCount: number;
}

export interface ViewsResponse {
  Items: MediaItem[];
  TotalRecordCount: number;
}

export interface MpvTrackInfo {
  id: number;
  kind: "video" | "audio" | "subtitle";
  title?: string | null;
  lang?: string | null;
  selected: boolean;
}

export interface MpvSnapshot {
  url?: string | null;
  paused: boolean;
  positionMs: number;
  durationMs: number;
  speed: number;
  volume: number;
  muted: boolean;
  eof: boolean;
  tracks: MpvTrackInfo[];
  subDelayMs?: number;
  subScale?: number;
}

export type DanmakuMode = "scroll" | "top" | "bottom" | "reverse";

export interface DanmakuComment {
  time: number;
  mode: DanmakuMode;
  color: string;
  text: string;
  source?: string | null;
}

export interface DanmakuResult {
  provider: string;
  episodeId: string;
  comments: DanmakuComment[];
}

export interface DanmakuProviderInfo {
  id: string;
  displayName: string;
}

export interface RemotePlayState {
  positionTicks?: number | null;
  isPaused: boolean;
  isMuted: boolean;
  volumeLevel?: number | null;
  playMethod?: string | null;
}

export interface RemoteSession {
  id: string;
  userId?: string | null;
  userName?: string | null;
  deviceId?: string | null;
  deviceName?: string | null;
  client?: string | null;
  applicationVersion?: string | null;
  supportsMediaControl: boolean;
  supportsRemoteControl: boolean;
  nowPlayingItem?: MediaItem | null;
  playState?: RemotePlayState | null;
}

export type NotificationKind = "info" | "success" | "warning" | "error";
export type NotificationCategory = "download" | "server" | "auth" | "system";

export interface NotificationAction {
  kind: "navigate" | "open-task" | "retry" | string;
  label: string;
  payload?: unknown;
}

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  category: NotificationCategory;
  title: string;
  body?: string | null;
  action?: NotificationAction | null;
  createdAt: string;
  read: boolean;
  sticky: boolean;
  sourceId?: string | null;
}

export type DownloadStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface EmbySubtitle {
  index: number;
  language?: string | null;
  displayTitle?: string | null;
  codec?: string | null;
  isDefault: boolean;
  isForced: boolean;
  isExternal: boolean;
  url: string;
}

export interface SubtitleList {
  itemId: string;
  mediaSourceId: string;
  tracks: EmbySubtitle[];
}

export interface DownloadTask {
  id: string;
  serverId: string;
  accountId: string;
  itemId: string;
  mediaSourceId: string;
  playSessionId: string;
  title: string;
  filePath: string;
  streamUrl: string;
  container?: string | null;
  totalBytes?: number | null;
  downloadedBytes: number;
  status: DownloadStatus;
  stealth: boolean;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}
