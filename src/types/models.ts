export type ServerKind = "emby" | "jellyfin";

export type LineStatus = "healthy" | "slow" | "degraded" | "down" | "unknown";
export type StatsOverlayMode = "winui" | "mpv-osd";

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

export type Anime4kMode = "off" | "modeAFast" | "modeA" | "modeB" | "modeC" | "high";

export interface AppSettings {
  heartbeatIntervalSecs: number;
  healthCheckIntervalSecs: number;
  raceTimeoutMs: number;
  requestTimeoutMs: number;
  defaultUserAgent: string;
  theme: "dark" | "light" | "auto";
  blurStrength: number;
  enableWindowVibrancy: boolean;
  closeToTray: boolean;
  mpvBackend: "ipc" | "embedded";
  externalPlayerPath?: string | null;
  externalPlayerArgs: string;
  hardwareDecoding: boolean;
  mpvCacheMb: number;
  hiddenServerIds: string[];
  hideJavCodes: boolean;
  showNetworkSpeed: boolean;
  statsOverlayMode: StatsOverlayMode;
  blackoutOtherDisplays: boolean;
  preserveTrackSwitchCache: boolean;
  skipIntroOutroEnabled: boolean;
  skipIntroSeconds: number;
  seekForwardSeconds: number;
  seekBackwardSeconds: number;
  longPressSpeedRate: number;
  skipOutroSeconds: number;
  screenshotIncludeSubtitles: boolean;
  appendAuthQuery: boolean;
  downloadDirectory?: string | null;
  homeHeroStyle: "classic" | "cinema";
  traktSyncEnabled: boolean;
  traktUsername?: string | null;
  traktSyncWatched: boolean;
  traktSyncRatings: boolean;
  traktSyncFavorites: boolean;
  danmakuOpacity: number;
  danmakuSpeed: number;
  danmakuFontSize: number;
  danmakuAvoidSubtitles: boolean;
  danmakuBottomReservePct: number;
  subtitleScale: number;
  subtitleTextColor: string;
  subtitleOutlineColor: string;
  subtitleOutlineSize: number;
  subtitleShadowOffset: number;
  subtitlePositionPct: number;
  subtitleForceStyle: boolean;
  anime4kMode: Anime4kMode;
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
  LastPlayedDate?: string | null;
  Played: boolean;
  IsFavorite: boolean;
  PlayCount: number;
}

export interface NameIdPair {
  Name: string;
  Id?: string | null;
}

export interface MediaPerson {
  Name: string;
  Id?: string | null;
  Role?: string | null;
  Type?: string | null;
  PrimaryImageTag?: string | null;
}

export interface MediaStreamInfo {
  Index?: number | null;
  Type?: string | null;
  Codec?: string | null;
  Language?: string | null;
  DisplayTitle?: string | null;
  Title?: string | null;
  Width?: number | null;
  Height?: number | null;
  BitRate?: number | null;
  Channels?: number | null;
  IsDefault?: boolean | null;
  IsExternal?: boolean | null;
  IsForced?: boolean | null;
}

export interface MediaSourceInfo {
  Id?: string | null;
  Name?: string | null;
  Path?: string | null;
  Container?: string | null;
  Size?: number | null;
  Bitrate?: number | null;
  SupportsDirectPlay?: boolean | null;
  SupportsDirectStream?: boolean | null;
  SupportsTranscoding?: boolean | null;
  MediaStreams?: MediaStreamInfo[] | null;
}

export interface MediaItemSourceContext {
  serverId: string;
  accountId: string;
  serverName?: string | null;
  username?: string | null;
}

export interface MediaItem {
  Id: string;
  Name: string;
  _source?: MediaItemSourceContext | null;
  Type?: string | null;
  CollectionType?: string | null;
  Overview?: string | null;
  ProductionYear?: number | null;
  CommunityRating?: number | null;
  OfficialRating?: string | null;
  PrimaryImageAspectRatio?: number | null;
  Genres?: string[] | null;
  GenreItems?: NameIdPair[] | null;
  Studios?: NameIdPair[] | null;
  RunTimeTicks?: number | null;
  SeriesName?: string | null;
  SeriesId?: string | null;
  SeasonId?: string | null;
  SeriesPrimaryImageTag?: string | null;
  SeriesThumbImageTag?: string | null;
  ParentBackdropItemId?: string | null;
  ParentBackdropImageTags?: string[] | null;
  ParentThumbItemId?: string | null;
  ParentThumbImageTag?: string | null;
  ParentPrimaryImageItemId?: string | null;
  ParentPrimaryImageTag?: string | null;
  ParentLogoItemId?: string | null;
  ParentLogoImageTag?: string | null;
  IndexNumber?: number | null;
  ParentIndexNumber?: number | null;
  ImageTags?: Record<string, string> | null;
  BackdropImageTags?: string[] | null;
  UserData?: UserData | null;
  People?: MediaPerson[] | null;
  ProviderIds?: Record<string, string | null | undefined> | null;
  MediaSources?: MediaSourceInfo[] | null;
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
  codec?: string | null;
  external?: boolean | null;
  defaultTrack?: boolean | null;
  forced?: boolean | null;
  selected: boolean;
}

export interface MpvChapterInfo {
  index: number;
  title?: string | null;
  timeMs: number;
}

export type PictureMode = "fit" | "fill" | "stretch" | "autocrop";

export interface MpvVideoParams {
  w?: number;
  h?: number;
  dw?: number;
  dh?: number;
  aspect?: number;
  rotate?: number;
  pixelformat?: string;
  "hw-pixelformat"?: string;
  "average-bpp"?: number;
}

export interface MpvOsdDimensions {
  w?: number;
  h?: number;
  par?: number;
  aspect?: number;
  mt?: number;
  mb?: number;
  ml?: number;
  mr?: number;
}

export interface MpvAudioParams {
  samplerate?: number;
  channels?: string;
  "hr-channels"?: string;
  "channel-count"?: number;
  format?: string;
}

export interface MpvBackendDiagnostics {
  loadGeneration?: number;
  eventCount?: number;
  fileLoadedCount?: number;
  videoReconfigCount?: number;
  audioReconfigCount?: number;
  playbackRestartCount?: number;
  lastEvent?: string | null;
  lastError?: string | null;
  lastProperty?: string | null;
  lastLog?: string | null;
  fileLoadedAfterLastLoad?: boolean;
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
  chapters?: MpvChapterInfo[];
  chapter?: number | null;
  secondarySubId?: number | null;
  subDelayMs?: number;
  subScale?: number;
  networkBps?: number | null;
  bufferedMs?: number;
  buffering?: boolean;
  cacheBufferingState?: number | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  videoParams?: MpvVideoParams | null;
  videoOutParams?: MpvVideoParams | null;
  osdDimensions?: MpvOsdDimensions | null;
  audioParams?: MpvAudioParams | null;
  hwdecCurrent?: string | null;
  idleActive?: boolean | null;
  demuxer?: string | null;
  fileFormat?: string | null;
  mediaTitle?: string | null;
  streamOpenFilename?: string | null;
  streamPath?: string | null;
  demuxerCacheState?: Record<string, unknown> | null;
  playlistCount?: number | null;
  playlistPos?: number | null;
  keepaspect?: boolean;
  panscan?: number;
  videoZoom?: number;
  videoScaleX?: number;
  videoScaleY?: number;
  videoAspectOverride?: number;
  containerFps?: number | null;
  estimatedVfFps?: number | null;
  videoBitrate?: number | null;
  audioBitrate?: number | null;
  frameDropCount?: number | null;
  decoderFrameDropCount?: number | null;
  voFrameDropCount?: number | null;
  backendDiagnostics?: MpvBackendDiagnostics | null;
}

export type DanmakuMode = "scroll" | "top" | "bottom" | "reverse";

export interface DanmakuComment {
  time: number;
  mode: DanmakuMode;
  color: string;
  text: string;
  source?: string | null;
  count?: number;
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

export interface SubtitleStyleSettings {
  scale: number;
  textColor: string;
  outlineColor: string;
  outlineSize: number;
  shadowOffset: number;
  positionPct: number;
  forceStyle: boolean;
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

export interface OnlineSubtitleSearchResult {
  provider: "assrt";
  id: string;
  title: string;
  videoName?: string | null;
  language?: string | null;
  format?: string | null;
  releaseSite?: string | null;
  uploadTime?: string | null;
  score?: number | null;
}

export interface OnlineSubtitleSearchResponse {
  provider: "assrt";
  results: OnlineSubtitleSearchResult[];
  quota?: number | null;
}

export interface OnlineSubtitleResolveResult {
  provider: "assrt";
  id: string;
  title: string;
  source: string;
  fileName?: string | null;
  format?: string | null;
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
  headers?: [string, string][];
  userAgent?: string | null;
  container?: string | null;
  totalBytes?: number | null;
  downloadedBytes: number;
  status: DownloadStatus;
  stealth: boolean;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}
