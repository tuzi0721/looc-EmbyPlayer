<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

import { api } from "@/api";
import { hasNativeRuntime } from "@/platform";
import { useAuthStore } from "@/stores/auth";
import { useDownloadsStore } from "@/stores/downloads";
import { useLibraryStore } from "@/stores/library";
import { usePlayerStore } from "@/stores/player";
import { useServerStore } from "@/stores/server";
import { useSettingsStore } from "@/stores/settings";
import type { MediaItem, MediaPerson, MediaSourceInfo, MediaStreamInfo, NameIdPair, UserData } from "@/types/models";
import { writeTextToClipboard } from "@/utils/clipboard";
import { extractDominantColor, rgbToCss } from "@/utils/dominantColor";
import { filterJavItems } from "@/utils/javFilter";
import { mediaImageUrl, mediaItemImageUrl, mediaItemImageUrls, type MediaImageType } from "@/utils/mediaImages";

const props = defineProps<{ id: string }>();
const route = useRoute();
const router = useRouter();
const lib = useLibraryStore();
const auth = useAuthStore();
const downloads = useDownloadsStore();
const serverStore = useServerStore();
const playerStore = usePlayerStore();
const settings = useSettingsStore();

const routeAccountId = computed(() => {
  const value = route.query.account;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : auth.activeId;
});
const routeAccount = computed(() =>
  auth.accounts.find((account) => account.id === routeAccountId.value) ??
  (auth.activeAccount?.id === routeAccountId.value ? auth.activeAccount : null),
);
const item = computed(() => lib.cachedItem(props.id, routeAccountId.value));
const loading = ref(false);
const loadStage = ref("");
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);
const shareStatus = ref<string | null>(null);
const userDataUpdating = ref<"favorite" | "played" | null>(null);
const playNavigating = ref(false);
const downloadStarting = ref(false);
const showStudioPopover = ref(false);
const heroBackdropIndex = ref(0);
let shareStatusTimer: number | null = null;

const STUDIO_VISIBLE_LIMIT = 3;

type StudioEntry = {
  key: string;
  id?: string | null;
  name: string;
};
type GenreEntry = {
  key: string;
  id?: string | null;
  name: string;
};

type ExternalLink = {
  key: string;
  label: string;
  url: string;
};

type BadgeTone = "movie" | "series" | "episode" | "collection" | "folder" | "audio" | "progress" | "watched";
type MediaInfoRow = {
  key: string;
  icon: string;
  label: string;
  value: string;
  detail?: string;
};
type MediaSourceCard = {
  key: string;
  title: string;
  meta: string;
  detail: string;
  capabilities: string;
};
type HeroSelectOption = {
  key: string;
  label: string;
  detail?: string;
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function itemProgress(target?: MediaItem | null) {
  const explicit = target?.UserData?.PlayedPercentage;
  if (explicit != null) return clampPercent(explicit);
  const position = target?.UserData?.PlaybackPositionTicks ?? 0;
  const runtime = target?.RunTimeTicks ?? 0;
  if (position <= 0 || runtime <= 0) return 0;
  return clampPercent((position / runtime) * 100);
}

const loadErrorTitle = computed(() => {
  const message = loadError.value ?? "";
  if (/parse JSON|error decoding|expected .* at line/i.test(message)) return "详情数据解析失败";
  if (/network error|timeout|failed to fetch/i.test(message)) return "网络请求失败";
  return "详情加载失败";
});

const friendlyLoadError = computed(() => {
  const message = (loadError.value ?? "").replace(/\s+/g, " ").trim();
  if (!message) return "";
  if (/parse JSON|error decoding|expected .* at line/i.test(message)) {
    return "服务器返回了非标准详情字段，Hills Lite 会尽量兼容。请重试，或先返回上一页。";
  }
  if (/network error|timeout|failed to fetch/i.test(message)) {
    return "连接服务器失败，请检查服务器线路和网络状态后重试。";
  }
  return message.length > 220 ? `${message.slice(0, 220)}...` : message;
});

const loadErrorDetail = computed(() => {
  const message = (loadError.value ?? "").replace(/\s+/g, " ").trim();
  if (!message || message === friendlyLoadError.value) return "";
  return message.length > 720 ? `${message.slice(0, 720)}...` : message;
});

const seasons = ref<MediaItem[]>([]);
const activeSeasonId = ref<string | null>(null);
const selectedMediaSourceKey = ref<string | null>(null);
const selectedAudioStreamKey = ref<string | null>(null);
const selectedSubtitleStreamKey = ref<string | null>(null);
const episodes = ref<MediaItem[]>([]);
const loadingEpisodes = ref(false);
const specialFeatures = ref<MediaItem[]>([]);
const loadingSpecialFeatures = ref(false);
const similarItems = ref<MediaItem[]>([]);
const loadingSimilar = ref(false);
const collectionItems = ref<MediaItem[]>([]);
const loadingCollection = ref(false);
let detailLoadSeq = 0;
let episodeLoadSeq = 0;
let suppressNextSeasonWatch = false;
let detailOpenTimer: ReturnType<typeof setTimeout> | null = null;

function detailRequestTimeoutMs() {
  const value = Number(settings.settings.requestTimeoutMs);
  return Math.min(30000, Math.max(1000, Number.isFinite(value) ? value : 15000));
}

function withDetailTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = detailRequestTimeoutMs(),
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;
  const deadline = Date.now() + timeoutMs;
  const timeout = new Promise<never>((_, reject) => {
    const check = () => {
      if (settled) return;
      if (Date.now() >= deadline) {
          timer = null;
          reject(new Error(`${label}: timeout after ${timeoutMs}ms`));
          return;
        }
          timer = setTimeout(check, 100);
      };
      timer = setTimeout(check, 0);
    });

  return Promise.race([promise, timeout]).finally(() => {
    settled = true;
    if (timer != null) clearTimeout(timer);
  });
}

function detailBootstrapTimeoutMs() {
  return Math.min(5000, Math.max(1200, detailRequestTimeoutMs()));
}

function clearDetailOpenTimer() {
  if (detailOpenTimer == null) return;
  clearTimeout(detailOpenTimer);
  detailOpenTimer = null;
}

function armDetailOpenTimer(seq: number) {
  clearDetailOpenTimer();
  const timeoutMs = Math.min(16000, Math.max(6000, detailRequestTimeoutMs() + 1000));
  detailOpenTimer = setTimeout(() => {
    detailOpenTimer = null;
    if (seq !== detailLoadSeq || !loading.value) return;
    loadError.value = "详情加载超时，请检查当前服务器账号、线路或网络状态后重试。";
    loading.value = false;
    detailLoadSeq += 1;
  }, timeoutMs);
}

const isSeries = computed(() => item.value?.Type === "Series");
const isEpisode = computed(() => item.value?.Type === "Episode");
const isCollection = computed(() => item.value?.Type === "BoxSet");
const seriesId = computed(() =>
  isSeries.value ? props.id : item.value?.SeriesId ?? null,
);

const activeServer = computed(() => {
  const a = routeAccount.value;
  return a ? serverStore.byId(a.serverId) ?? null : null;
});

const hasPlaybackContext = computed(() => Boolean(routeAccount.value && activeServer.value));

function missingPlaybackContextError() {
  if (!auth.activeAccount) return "当前没有已登录账号，请先在服务器设置中登录 Emby/Jellyfin。";
  return "当前账号对应的服务器不存在，请重新登录或切换服务器。";
}

function itemImageUrl(
  itemId: string,
  imageType: MediaImageType = "Primary",
  tag?: string | null,
  maxWidth = 1600,
): string | null {
  return mediaImageUrl(activeServer.value, itemId, imageType, {
    accountId: routeAccount.value?.id,
    accessToken: routeAccount.value?.accessToken,
    maxWidth,
    quality: 82,
    format: "webp",
    tag,
  });
}

function activeLineBaseUrl(): string | null {
  const s = activeServer.value;
  if (!s) return null;
  const line = s.lines.find((l) => l.id === s.activeLineId) ?? s.lines[0];
  return line?.baseUrl ?? null;
}

function providerId(ids: MediaItem["ProviderIds"], ...names: string[]): string | null {
  if (!ids) return null;
  const expected = new Set(names.map((name) => name.toLowerCase()));
  for (const [key, value] of Object.entries(ids)) {
    if (expected.has(key.toLowerCase()) && value) return String(value);
  }
  return null;
}

function imageUrl(
  target: MediaItem,
  imageType: MediaImageType = "Backdrop",
  maxWidth = 1600,
): string | null {
  return mediaItemImageUrl(activeServer.value, target, imageType, maxWidth, {
    accountId: routeAccount.value?.id,
    accessToken: routeAccount.value?.accessToken,
  });
}

const backdropUrls = computed(() =>
  item.value
    ? mediaItemImageUrls(activeServer.value, item.value, "Backdrop", 2200, {
        accountId: routeAccount.value?.id,
        accessToken: routeAccount.value?.accessToken,
      })
    : [],
);
const backdropUrl = computed(() => {
  const urls = backdropUrls.value;
  return urls[Math.min(heroBackdropIndex.value, Math.max(0, urls.length - 1))] ?? null;
});

function onHeroBackdropError() {
  if (heroBackdropIndex.value < backdropUrls.value.length - 1) {
    heroBackdropIndex.value += 1;
  }
}

// Immersive ambient: tint the page with the backdrop's dominant color (falls
// back to the theme accent when extraction is blocked, e.g. no CORS).
const ambientColor = ref<string | null>(null);
const ambientStyle = computed(() => ({
  "--detail-ambient": ambientColor.value ?? "var(--ambient)",
}));
watch(
  backdropUrl,
  async (url) => {
    ambientColor.value = null;
    if (!url) return;
    const rgb = await extractDominantColor(url);
    if (rgb && backdropUrl.value === url) {
      ambientColor.value = rgbToCss(rgb);
    }
  },
  { immediate: true },
);

const runtimeText = computed(() => {
  const ticks = item.value?.RunTimeTicks ?? 0;
  if (!ticks) return "";
  const mins = Math.round(ticks / 10_000_000 / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
});

const episodeSubtitle = computed(() => {
  const i = item.value;
  if (!i) return "";
  if (i.Type === "Episode" && i.SeriesName) {
    return `S${i.ParentIndexNumber ?? 1}:E${i.IndexNumber ?? "?"} - ${i.Name ?? ""}`;
  }
  if (isSeries.value && continueEpisode.value) {
    const ep = continueEpisode.value;
    return `S${ep.ParentIndexNumber ?? 1}:E${ep.IndexNumber ?? "?"} - ${ep.Name ?? ""}`;
  }
  return i.Name ?? "";
});

const metaParts = computed(() => {
  const i = item.value;
  if (!i) return [];
  const parts: string[] = [];
  if (i.CommunityRating != null) parts.push(`★ ${i.CommunityRating.toFixed(1)}`);
  if (i.ProductionYear) parts.push(String(i.ProductionYear));
  if (runtimeText.value) parts.push(runtimeText.value);
  if (i.OfficialRating) parts.push(i.OfficialRating);
  return parts;
});

function compactNumber(value?: number | null, fractionDigits = 1) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "";
  const rounded = value.toFixed(fractionDigits);
  return rounded.endsWith(".0") ? rounded.slice(0, -2) : rounded;
}

function formatBitrate(value?: number | null) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "";
  if (value >= 1_000_000) return `${compactNumber(value / 1_000_000, value >= 10_000_000 ? 0 : 1)} Mbps`;
  if (value >= 1_000) return `${compactNumber(value / 1_000, value >= 10_000 ? 0 : 1)} Kbps`;
  return `${Math.round(value)} bps`;
}

function formatBytes(value?: number | null) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "";
  if (value >= 1024 ** 3) return `${compactNumber(value / 1024 ** 3, 1)} GB`;
  if (value >= 1024 ** 2) return `${compactNumber(value / 1024 ** 2, 0)} MB`;
  if (value >= 1024) return `${compactNumber(value / 1024, 0)} KB`;
  return `${Math.round(value)} B`;
}

function streamType(stream: MediaStreamInfo) {
  return (stream.Type ?? "").toLowerCase();
}

function streamCodec(stream?: MediaStreamInfo | null) {
  return stream?.Codec?.trim().toUpperCase() ?? "";
}

function streamLanguage(stream?: MediaStreamInfo | null) {
  return stream?.Language?.trim() || "";
}

function streamResolution(stream?: MediaStreamInfo | null) {
  const width = stream?.Width ?? 0;
  const height = stream?.Height ?? 0;
  return width > 0 && height > 0 ? `${width}×${height}` : "";
}

function audioChannels(stream?: MediaStreamInfo | null) {
  const channels = stream?.Channels ?? 0;
  if (channels <= 0) return "";
  if (channels === 1) return "Mono";
  if (channels === 2) return "Stereo";
  return `${channels}ch`;
}

function firstMediaStream(source: MediaSourceInfo | null, type: "video" | "audio" | "subtitle") {
  return (source?.MediaStreams ?? []).find((stream) => streamType(stream) === type) ?? null;
}

// Strip directory and a trailing media extension from a path/filename, the way
// Emby/Jellyfin derive a version label from the file (the server normally trims
// the common folder prefix already and sends a clean `Name`).
function fileLabelFromPath(value: string): string {
  const base = value.split(/[\\/]/).pop()?.trim() ?? "";
  return base.replace(/\.[A-Za-z0-9]{1,5}$/, "").trim();
}

function safeMediaSourceName(source: MediaSourceInfo, index: number) {
  const name = source.Name?.trim() || "";
  // Clean, server-provided version name (e.g. "WEB-DL.Baha", "导演剪辑版"). Emby
  // already trims the shared folder prefix for multi-version items, so use it.
  if (name && !/[\\/]/.test(name) && !/^https?:\/\//i.test(name)) return name;
  // Name is a full path/URL → fall back to the filename (no dir, no extension),
  // matching how Emby/Jellyfin label versions from the file.
  const fromName = name && !/^https?:\/\//i.test(name) ? fileLabelFromPath(name) : "";
  if (fromName) return fromName;
  const fromPath = source.Path?.trim() ? fileLabelFromPath(source.Path.trim()) : "";
  if (fromPath) return fromPath;
  // No usable name anywhere → describe the version by its specs so the entries
  // are still distinguishable, then a generic number as the last resort.
  const video = firstMediaStream(source, "video");
  const descriptor = [streamResolution(video), streamCodec(video)].filter(Boolean).join(" ");
  return descriptor || `版本 ${index + 1}`;
}

function mediaSourceKey(source: MediaSourceInfo, index: number) {
  return source.Id?.trim() || `source-${index}`;
}

function streamKey(stream: MediaStreamInfo, index: number) {
  return stream.Index != null ? String(stream.Index) : `stream-${index}`;
}

function streamLabel(stream: MediaStreamInfo, index: number) {
  return (
    stream.DisplayTitle?.trim() ||
    stream.Title?.trim() ||
    [streamLanguage(stream), streamCodec(stream), audioChannels(stream)].filter(Boolean).join(" ") ||
    `轨道 ${index + 1}`
  );
}

function mediaCapabilityText(source: MediaSourceInfo) {
  const parts: string[] = [];
  if (source.SupportsDirectPlay) parts.push("本机直连");
  if (source.SupportsDirectStream) parts.push("本机直流");
  if (parts.length > 0) return parts.join(" / ");
  if (source.SupportsTranscoding) return "仅服务端转码（不可播放）";
  return "未确认本机解码（不可播放）";
}

function pushMediaInfoRow(rows: MediaInfoRow[], row: MediaInfoRow) {
  if (!row.value) return;
  rows.push(row);
}

const mediaSourceOptions = computed<HeroSelectOption[]>(() =>
  (item.value?.MediaSources ?? []).map((source, index) => ({
    key: mediaSourceKey(source, index),
    label: safeMediaSourceName(source, index),
    detail: [source.Container?.trim().toUpperCase(), formatBytes(source.Size), formatBitrate(source.Bitrate)]
      .filter(Boolean)
      .join(" · "),
  })),
);

const selectedMediaSource = computed(() => {
  const sources = item.value?.MediaSources ?? [];
  return (
    sources.find((source, index) => mediaSourceKey(source, index) === selectedMediaSourceKey.value) ??
    sources[0] ??
    null
  );
});

const selectedMediaSourcePlaybackId = computed(() => selectedMediaSource.value?.Id?.trim() || null);

const mediaSourceCards = computed<MediaSourceCard[]>(() => {
  const sources = item.value?.MediaSources ?? [];
  return sources.map((source, index) => {
    const video = firstMediaStream(source, "video");
    const audioStreams = (source.MediaStreams ?? []).filter((stream) => streamType(stream) === "audio");
    const audio = audioStreams.find((stream) => stream.IsDefault) ?? audioStreams[0] ?? null;
    const subtitleCount = (source.MediaStreams ?? []).filter((stream) => streamType(stream) === "subtitle").length;
    const meta = [
      source.Container?.trim().toUpperCase(),
      streamResolution(video),
      streamCodec(video),
      streamCodec(audio),
      formatBitrate(source.Bitrate),
      formatBytes(source.Size),
    ]
      .filter(Boolean)
      .join(" · ");
    const detail = [
      audioStreams.length > 0 ? `${audioStreams.length} 音轨` : "",
      subtitleCount > 0 ? `${subtitleCount} 字幕` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      key: mediaSourceKey(source, index),
      title: safeMediaSourceName(source, index),
      meta,
      detail,
      capabilities: mediaCapabilityText(source),
    };
  });
});

const mediaInfoRows = computed<MediaInfoRow[]>(() => {
  const source = selectedMediaSource.value;
  if (!source) return [];

  const sources = item.value?.MediaSources ?? [];
  const video = firstMediaStream(source, "video");
  const audioStreams = (source.MediaStreams ?? []).filter((stream) => streamType(stream) === "audio");
  const audio = audioStreams.find((stream) => stream.IsDefault) ?? audioStreams[0] ?? null;
  const subtitles = (source.MediaStreams ?? []).filter((stream) => streamType(stream) === "subtitle");
  const rows: MediaInfoRow[] = [];

  pushMediaInfoRow(rows, {
    key: "source",
    icon: "lucide:layers-3",
    label: "媒体源",
    value: sources.length > 1 ? `${sources.length} 个版本` : source.Name?.trim() || source.Id?.trim() || "默认版本",
    detail: source.Name?.trim() && sources.length > 1 ? source.Name.trim() : undefined,
  });

  pushMediaInfoRow(rows, {
    key: "container",
    icon: "lucide:box",
    label: "容器",
    value: source.Container?.trim().toUpperCase() ?? "",
  });

  pushMediaInfoRow(rows, {
    key: "video",
    icon: "lucide:monitor-play",
    label: "视频",
    value: [streamCodec(video), streamResolution(video), formatBitrate(video?.BitRate)].filter(Boolean).join(" · "),
  });

  pushMediaInfoRow(rows, {
    key: "audio",
    icon: "lucide:volume-2",
    label: "音频",
    value: [streamCodec(audio), streamLanguage(audio), audioChannels(audio), formatBitrate(audio?.BitRate)]
      .filter(Boolean)
      .join(" · "),
    detail: audioStreams.length > 1 ? `${audioStreams.length} 条音轨` : undefined,
  });

  pushMediaInfoRow(rows, {
    key: "subtitles",
    icon: "lucide:captions",
    label: "字幕",
    value: subtitles.length ? `${subtitles.length} 条` : "",
    detail: subtitles
      .slice(0, 3)
      .map((stream) => stream.DisplayTitle?.trim() || streamLanguage(stream) || streamCodec(stream))
      .filter(Boolean)
      .join(" / "),
  });

  pushMediaInfoRow(rows, {
    key: "bitrate",
    icon: "lucide:gauge",
    label: "总码率",
    value: formatBitrate(source.Bitrate),
  });

  pushMediaInfoRow(rows, {
    key: "size",
    icon: "lucide:hard-drive",
    label: "大小",
    value: formatBytes(source.Size),
  });

  pushMediaInfoRow(rows, {
    key: "capabilities",
    icon: "lucide:radio",
    label: "播放能力",
    value: mediaCapabilityText(source),
  });

  return rows;
});

const heroMediaInfoRows = computed(() =>
  mediaInfoRows.value.filter((row) => ["video", "audio", "subtitles", "capabilities"].includes(row.key)).slice(0, 4),
);

const audioStreamOptions = computed<HeroSelectOption[]>(() =>
  (selectedMediaSource.value?.MediaStreams ?? [])
    .filter((stream) => streamType(stream) === "audio")
    .map((stream, index) => ({
      key: streamKey(stream, index),
      label: streamLabel(stream, index),
      detail: [streamCodec(stream), streamLanguage(stream), audioChannels(stream), formatBitrate(stream.BitRate)]
        .filter(Boolean)
        .join(" · "),
    })),
);

const subtitleStreamOptions = computed<HeroSelectOption[]>(() => [
  { key: "off", label: "关闭" },
  ...(selectedMediaSource.value?.MediaStreams ?? [])
    .filter((stream) => streamType(stream) === "subtitle")
    .map((stream, index) => ({
      key: streamKey(stream, index),
      label: streamLabel(stream, index),
      detail: [streamLanguage(stream), streamCodec(stream), stream.IsExternal ? "外置" : ""].filter(Boolean).join(" · "),
    })),
]);

watch(
  mediaSourceOptions,
  (options) => {
    if (options.some((option) => option.key === selectedMediaSourceKey.value)) return;
    selectedMediaSourceKey.value = options[0]?.key ?? null;
  },
  { immediate: true },
);

watch(
  audioStreamOptions,
  (options) => {
    if (options.some((option) => option.key === selectedAudioStreamKey.value)) return;
    const streams = (selectedMediaSource.value?.MediaStreams ?? []).filter((stream) => streamType(stream) === "audio");
    const defaultIndex = streams.findIndex((stream) => stream.IsDefault);
    selectedAudioStreamKey.value = options[Math.max(0, defaultIndex)]?.key ?? null;
  },
  { immediate: true },
);

watch(
  subtitleStreamOptions,
  (options) => {
    if (options.some((option) => option.key === selectedSubtitleStreamKey.value)) return;
    const streams = (selectedMediaSource.value?.MediaStreams ?? []).filter((stream) => streamType(stream) === "subtitle");
    const defaultIndex = streams.findIndex((stream) => stream.IsDefault || stream.IsForced);
    selectedSubtitleStreamKey.value = defaultIndex >= 0 ? options[defaultIndex + 1]?.key ?? "off" : "off";
  },
  { immediate: true },
);

const externalLinks = computed<ExternalLink[]>(() => {
  const i = item.value;
  if (!i) return [];
  const links: ExternalLink[] = [];
  const baseUrl = activeLineBaseUrl();
  if (baseUrl) {
    const sep = baseUrl.endsWith("/") ? "" : "/";
    links.push({
      key: "server",
      label: activeServer.value?.kind === "jellyfin" ? "Jellyfin" : "Emby",
      url: `${baseUrl}${sep}web/index.html#!/item?id=${encodeURIComponent(i.Id)}`,
    });
  }

  const imdb = providerId(i.ProviderIds, "Imdb", "IMDb");
  if (imdb) {
    links.push({
      key: "imdb",
      label: "IMDb",
      url: `https://www.imdb.com/title/${encodeURIComponent(imdb)}/`,
    });
  }

  const tmdb = providerId(i.ProviderIds, "Tmdb", "TMDb");
  if (tmdb) {
    const kind = i.Type === "Movie" ? "movie" : "tv";
    links.push({
      key: "tmdb",
      label: "TMDB",
      url: `https://www.themoviedb.org/${kind}/${encodeURIComponent(tmdb)}`,
    });
  }

  const tvdb = providerId(i.ProviderIds, "Tvdb", "TVDb");
  if (tvdb) {
    links.push({
      key: "tvdb",
      label: "TVDB",
      url: `https://thetvdb.com/dereferrer/series/${encodeURIComponent(tvdb)}`,
    });
  }

  const douban = providerId(i.ProviderIds, "Douban");
  if (douban) {
    links.push({
      key: "douban",
      label: "豆瓣",
      url: `https://movie.douban.com/subject/${encodeURIComponent(douban)}/`,
    });
  }

  return links;
});

const itemTypeLabel = computed(() => {
  switch (item.value?.Type) {
    case "Movie":
      return "电影";
    case "Series":
      return "剧集";
    case "Episode":
      return "单集";
    case "Season":
      return "季";
    case "Audio":
      return "音乐";
    case "MusicAlbum":
      return "专辑";
    case "BoxSet":
      return "合集";
    case "Folder":
      return "文件夹";
    default:
      return item.value?.Type ?? "";
  }
});

const itemTypeIcon = computed(() => {
  switch (item.value?.Type) {
    case "Movie":
      return "lucide:film";
    case "Series":
      return "lucide:tv";
    case "Episode":
      return "lucide:clapperboard";
    case "Season":
      return "lucide:layers-3";
    case "Audio":
    case "MusicAlbum":
      return "lucide:music";
    case "BoxSet":
      return "lucide:package";
    case "Folder":
      return "lucide:folder";
    default:
      return "lucide:tag";
  }
});

const itemTypeTone = computed<BadgeTone>(() => {
  switch (item.value?.Type) {
    case "Movie":
      return "movie";
    case "Series":
    case "Season":
      return "series";
    case "Episode":
      return "episode";
    case "Audio":
    case "MusicAlbum":
      return "audio";
    case "BoxSet":
      return "collection";
    case "Folder":
      return "folder";
    default:
      return "folder";
  }
});

const typeBadge = computed(() => {
  if (!itemTypeLabel.value) return null;
  return {
    icon: itemTypeIcon.value,
    label: itemTypeLabel.value,
    tone: itemTypeTone.value,
  };
});

const genreEntries = computed<GenreEntry[]>(() => {
  const i = item.value;
  if (!i) return [];
  const seen = new Set<string>();
  const seenNames = new Set<string>();
  const entries: GenreEntry[] = [];

  for (const genre of i.GenreItems ?? []) {
    const name = genre.Name?.trim();
    if (!name) continue;
    const nameKey = name.toLowerCase();
    const id = genre.Id?.trim() || null;
    const key = id ? `id:${id}` : `name:${name.toLowerCase()}`;
    if (seen.has(key) || seenNames.has(nameKey)) continue;
    seen.add(key);
    seenNames.add(nameKey);
    entries.push({ key, id, name });
  }

  for (const rawName of i.Genres ?? []) {
    const name = rawName.trim();
    const key = `name:${name.toLowerCase()}`;
    const nameKey = name.toLowerCase();
    if (!name || seen.has(key) || seenNames.has(nameKey)) continue;
    seen.add(key);
    seenNames.add(nameKey);
    entries.push({ key, id: null, name });
  }

  return entries.slice(0, 6);
});

function normalizeStudio(studio: NameIdPair): StudioEntry | null {
  const name = studio.Name?.trim();
  if (!name) return null;
  const id = studio.Id?.trim() || null;
  return {
    key: id ? `id:${id}` : `name:${name.toLowerCase()}`,
    id,
    name,
  };
}

const studioEntries = computed(() => {
  const seen = new Set<string>();
  const entries: StudioEntry[] = [];
  for (const studio of item.value?.Studios ?? []) {
    const entry = normalizeStudio(studio);
    if (!entry || seen.has(entry.key)) continue;
    seen.add(entry.key);
    entries.push(entry);
  }
  return entries;
});

const visibleStudioEntries = computed(() => studioEntries.value.slice(0, STUDIO_VISIBLE_LIMIT));
const hiddenStudioEntries = computed(() => studioEntries.value.slice(STUDIO_VISIBLE_LIMIT));

const castPeople = computed(() =>
  (item.value?.People ?? [])
    .filter((person) => person.Name?.trim())
    .slice(0, 18),
);

const resumeMs = computed(() => {
  const target = continueEpisode.value ?? item.value;
  const ticks = target?.UserData?.PlaybackPositionTicks ?? 0;
  return Math.round(ticks / 10_000);
});

const continueEpisode = computed(() => {
  if (isEpisode.value) return item.value;
  if (!isSeries.value) return null;
  const inProgress = episodes.value.find(
    (e) => (e.UserData?.PlaybackPositionTicks ?? 0) > 0 && !e.UserData?.Played,
  );
  return inProgress ?? episodes.value[0] ?? null;
});

const resumePercent = computed(() => itemProgress(continueEpisode.value ?? item.value));

const playStateBadge = computed(() => {
  const target = continueEpisode.value ?? item.value;
  if (!target) return null;
  if (target.UserData?.Played) {
    return { icon: "lucide:check", label: "已看", tone: "watched" as BadgeTone };
  }
  if (resumePercent.value > 0 && resumePercent.value < 100) {
    return {
      icon: "lucide:clock-3",
      label: `已看 ${Math.round(resumePercent.value)}%`,
      tone: "progress" as BadgeTone,
    };
  }
  return null;
});

const desktopDownloadAvailable = hasNativeRuntime();

const downloadTarget = computed(() => (isSeries.value ? continueEpisode.value : item.value));
const canStartDownload = computed(() => {
  const target = downloadTarget.value;
  return (
    desktopDownloadAvailable &&
    Boolean(target?.Id) &&
    (target?.Type === "Movie" || target?.Type === "Episode")
  );
});

const activeSeasonName = computed(() => {
  const s = seasons.value.find((x) => x.Id === activeSeasonId.value);
  return s?.Name ?? "第 1 季";
});

onMounted(() => void loadDetail());
onBeforeUnmount(() => {
  clearShareStatus();
  clearDetailOpenTimer();
});
watch([() => props.id, () => route.query.account], () => void loadDetail());
watch(
  () => `${item.value?.Id ?? ""}:${backdropUrls.value.length}`,
  () => {
    heroBackdropIndex.value = 0;
  },
);
watch(studioEntries, () => {
  showStudioPopover.value = false;
});

async function loadDetail() {
  const seq = ++detailLoadSeq;
  loading.value = true;
  loadStage.value = "正在准备详情页…";
  try {
    armDetailOpenTimer(seq);
  } catch {
    clearDetailOpenTimer();
  }
  loadError.value = null;
  seasons.value = [];
  episodes.value = [];
  specialFeatures.value = [];
  similarItems.value = [];
  collectionItems.value = [];
  loadingSpecialFeatures.value = false;
  loadingSimilar.value = false;
  loadingCollection.value = false;
  loadingEpisodes.value = false;
  episodeLoadSeq += 1;
  suppressNextSeasonWatch = false;
  activeSeasonId.value = null;
  try {
    if (routeAccountId.value && auth.activeId !== routeAccountId.value) {
      await auth.switchTo(routeAccountId.value);
    }
    if (seq !== detailLoadSeq) return;
    if (!hasPlaybackContext.value) {
      loadError.value = missingPlaybackContextError();
      void refreshPlaybackContextAndReload(seq);
      return;
    }
    loadStage.value = "正在读取媒体详情…";
    const detail = await withDetailTimeout(lib.loadItem(props.id, routeAccountId.value), "get_item_detail");
    if (seq !== detailLoadSeq) return;
    if (seq === detailLoadSeq) void loadSpecialFeatures(props.id, seq);
    if (seq === detailLoadSeq) void loadSimilar(props.id, seq);
    if (detail.Type === "BoxSet" && seq === detailLoadSeq) void loadCollectionItems(props.id, seq);
    if (isSeries.value) {
      void loadSeriesSeasons(props.id, seq);
    } else if (detail.Type === "Episode" && detail.SeasonId && detail.SeriesId) {
      void loadEpisodeSeasonContext(detail, seq);
    }
  } catch (e) {
    if (seq === detailLoadSeq) loadError.value = String(e);
  } finally {
    if (seq === detailLoadSeq) {
      clearDetailOpenTimer();
      loading.value = false;
      loadStage.value = "";
    }
  }
}

async function refreshPlaybackContextAndReload(seq: number) {
  const bootstrapTimeoutMs = detailBootstrapTimeoutMs();
  loadStage.value = "正在同步账号与服务器…";
  await Promise.all([
    withDetailTimeout(serverStore.refresh(), "list_servers", bootstrapTimeoutMs).catch(() => {}),
    withDetailTimeout(auth.refresh(), "list_accounts", bootstrapTimeoutMs).catch(() => {}),
  ]);
  if (seq !== detailLoadSeq || !hasPlaybackContext.value) return;
  void loadDetail();
}

async function loadSeriesSeasons(seriesItemId: string, seq: number) {
  const episodesSeq = ++episodeLoadSeq;
  loadingEpisodes.value = true;
  try {
    const resp = await withDetailTimeout(api.listSeasons(seriesItemId), "list_seasons");
    if (seq !== detailLoadSeq || episodesSeq !== episodeLoadSeq) return;
    seasons.value = resp.Items;
    if (resp.Items[0]) activeSeasonId.value = resp.Items[0].Id;
  } catch (error) {
    if (seq === detailLoadSeq && episodesSeq === episodeLoadSeq) seasons.value = [];
    console.warn(error);
  } finally {
    if (seq === detailLoadSeq && episodesSeq === episodeLoadSeq) loadingEpisodes.value = false;
  }
}

async function loadEpisodeSeasonContext(detail: MediaItem, seq: number) {
  const requestSeasonId = detail.SeasonId;
  const requestSeriesId = detail.SeriesId;
  if (!requestSeasonId || !requestSeriesId) return;

  const episodesSeq = ++episodeLoadSeq;
  loadingEpisodes.value = true;
  try {
    const [sresp, eresp] = await Promise.all([
      withDetailTimeout(api.listSeasons(requestSeriesId), "list_seasons"),
      withDetailTimeout(api.listEpisodes({ seriesId: requestSeriesId, seasonId: requestSeasonId }), "list_episodes"),
    ]);
    if (seq !== detailLoadSeq || episodesSeq !== episodeLoadSeq) return;
    seasons.value = sresp.Items;
    episodes.value = eresp.Items;
    suppressNextSeasonWatch = true;
    activeSeasonId.value = requestSeasonId;
  } catch (error) {
    if (seq === detailLoadSeq && episodesSeq === episodeLoadSeq) {
      seasons.value = [];
      episodes.value = [];
    }
    console.warn(error);
  } finally {
    if (seq === detailLoadSeq && episodesSeq === episodeLoadSeq) {
      loadingEpisodes.value = false;
    }
  }
}

async function loadSpecialFeatures(itemId: string, seq: number) {
  loadingSpecialFeatures.value = true;
  try {
    const resp = await api.specialFeatures(itemId, 18);
    if (seq !== detailLoadSeq) return;
    specialFeatures.value = filterJavItems(
      resp.Items.filter((candidate) => candidate.Id !== itemId),
      settings.settings.hideJavCodes,
    ).slice(0, 18);
  } catch (error) {
    if (seq === detailLoadSeq) specialFeatures.value = [];
    console.warn(error);
  } finally {
    if (seq === detailLoadSeq) loadingSpecialFeatures.value = false;
  }
}

async function loadSimilar(itemId: string, seq: number) {
  loadingSimilar.value = true;
  try {
    const resp = await api.similarItems(itemId, 18);
    if (seq !== detailLoadSeq) return;
    similarItems.value = filterJavItems(
      resp.Items.filter((candidate) => candidate.Id !== itemId),
      settings.settings.hideJavCodes,
    ).slice(0, 18);
  } catch (error) {
    if (seq === detailLoadSeq) similarItems.value = [];
    console.warn(error);
  } finally {
    if (seq === detailLoadSeq) loadingSimilar.value = false;
  }
}

async function loadCollectionItems(itemId: string, seq: number) {
  loadingCollection.value = true;
  try {
    const resp = await api.listItems({
      parentId: itemId,
      params: [
        ["Recursive", "false"],
        ["IncludeItemTypes", "Movie,Series"],
        ["Fields", "PrimaryImageAspectRatio,Overview,ProductionYear,UserData,SeriesInfo"],
        ["SortBy", "SortName"],
        ["SortOrder", "Ascending"],
        ["Limit", "60"],
      ],
    });
    if (seq === detailLoadSeq) {
      collectionItems.value = filterJavItems(resp.Items, settings.settings.hideJavCodes).filter(
        (candidate) => candidate.Id !== itemId,
      );
    }
  } catch {
    if (seq === detailLoadSeq) collectionItems.value = [];
  } finally {
    if (seq === detailLoadSeq) loadingCollection.value = false;
  }
}

watch(activeSeasonId, async (sid) => {
  if (!sid || !seriesId.value) return;
  if (suppressNextSeasonWatch) {
    suppressNextSeasonWatch = false;
    return;
  }
  const requestSeriesId = seriesId.value;
  const seq = detailLoadSeq;
  const episodesSeq = ++episodeLoadSeq;
  loadingEpisodes.value = true;
  try {
    const resp = await withDetailTimeout(
      api.listEpisodes({ seriesId: requestSeriesId, seasonId: sid }),
      "list_episodes",
    );
    if (seq !== detailLoadSeq || episodesSeq !== episodeLoadSeq || requestSeriesId !== seriesId.value) {
      return;
    }
    episodes.value = resp.Items;
  } catch (error) {
    if (seq === detailLoadSeq && episodesSeq === episodeLoadSeq) episodes.value = [];
    console.warn(error);
  } finally {
    if (seq === detailLoadSeq && episodesSeq === episodeLoadSeq) loadingEpisodes.value = false;
  }
});

watch(
  () => item.value?.SeasonId,
  (sid) => {
    if (sid && !activeSeasonId.value) activeSeasonId.value = sid;
  },
  { immediate: true },
);

function preferredEpisode(list: MediaItem[]): MediaItem | null {
  const inProgress = list.find(
    (episode) => (episode.UserData?.PlaybackPositionTicks ?? 0) > 0 && !episode.UserData?.Played,
  );
  return inProgress ?? list[0] ?? null;
}

function pushUniqueSeasonId(target: string[], id?: string | null) {
  if (id && !target.includes(id)) target.push(id);
}

async function ensureSeriesPlaybackEpisode(): Promise<MediaItem | null> {
  if (!seriesId.value) return null;
  if (continueEpisode.value) return continueEpisode.value;

  const requestSeriesId = seriesId.value;
  const detailSeq = detailLoadSeq;
  const episodesSeq = ++episodeLoadSeq;
  loadingEpisodes.value = true;
  try {
    const seasonIds: string[] = [];
    pushUniqueSeasonId(seasonIds, activeSeasonId.value);
    for (const season of seasons.value) pushUniqueSeasonId(seasonIds, season.Id);

    if (seasonIds.length === 0) {
      const seasonResp = await withDetailTimeout(api.listSeasons(requestSeriesId), "list_seasons");
      if (detailSeq !== detailLoadSeq || requestSeriesId !== seriesId.value) return null;
      seasons.value = seasonResp.Items;
      for (const season of seasonResp.Items) pushUniqueSeasonId(seasonIds, season.Id);
    }

    for (const targetSeasonId of seasonIds) {
      const episodeResp = await withDetailTimeout(
        api.listEpisodes({ seriesId: requestSeriesId, seasonId: targetSeasonId }),
        "list_episodes",
      );
      if (detailSeq !== detailLoadSeq || requestSeriesId !== seriesId.value) return null;
      const ep = preferredEpisode(episodeResp.Items);
      if (ep) {
        suppressNextSeasonWatch = true;
        activeSeasonId.value = targetSeasonId;
        episodes.value = episodeResp.Items;
        return ep;
      }
    }

    const allEpisodeResp = await withDetailTimeout(
      api.listEpisodes({ seriesId: requestSeriesId, seasonId: null }),
      "list_episodes",
    );
    if (detailSeq !== detailLoadSeq || requestSeriesId !== seriesId.value) return null;
    const fallbackEpisode = preferredEpisode(allEpisodeResp.Items);
    if (!fallbackEpisode) return null;

    if (fallbackEpisode.SeasonId) {
      suppressNextSeasonWatch = true;
      activeSeasonId.value = fallbackEpisode.SeasonId;
    }
    episodes.value = allEpisodeResp.Items;
    return fallbackEpisode;
  } finally {
    if (detailSeq === detailLoadSeq && requestSeriesId === seriesId.value && episodesSeq <= episodeLoadSeq) {
      loadingEpisodes.value = false;
    }
  }
}

function setSeriesPlaybackQueue(ep: MediaItem) {
  const idx = episodes.value.findIndex((e) => e.Id === ep.Id);
  if (idx >= 0) {
    playerStore.setQueue(
      episodes.value.slice(idx).map((e) => e.Id),
      0,
    );
  } else {
    playerStore.setQueue([ep.Id], 0);
  }
}

async function pushPlayerRoute(id: string, startMs: number) {
  const query: Record<string, string> = { start: String(startMs), from: props.id };
  if (routeAccountId.value) query.account = routeAccountId.value;
  const routeServerId = typeof route.query.server === "string" ? route.query.server.trim() : "";
  if (routeServerId) query.server = routeServerId;
  if (id === props.id && selectedMediaSourcePlaybackId.value) {
    query.mediaSourceId = selectedMediaSourcePlaybackId.value;
  }
  await router.push({
    name: "player",
    params: { id },
    query,
  });
}

function currentSourceQuery(): Record<string, string> | undefined {
  const query: Record<string, string> = {};
  if (routeAccountId.value) query.account = routeAccountId.value;
  const routeServerId = typeof route.query.server === "string" ? route.query.server.trim() : "";
  if (routeServerId) query.server = routeServerId;
  return Object.keys(query).length > 0 ? query : undefined;
}

async function playTarget(id: string, startMs: number) {
  if (playNavigating.value) return;
  playNavigating.value = true;
  actionError.value = null;
  try {
    await pushPlayerRoute(id, startMs);
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : String(error);
  } finally {
    playNavigating.value = false;
  }
}

async function continuePlay() {
  if (isSeries.value) {
    if (playNavigating.value) return;
    playNavigating.value = true;
    actionError.value = null;
    try {
      const ep = await ensureSeriesPlaybackEpisode();
      if (!ep?.Id) {
        actionError.value = "当前剧集没有可播放单集。";
        return;
      }
      setSeriesPlaybackQueue(ep);
      const start = Math.round((ep.UserData?.PlaybackPositionTicks ?? 0) / 10_000);
      await pushPlayerRoute(ep.Id, start);
    } catch (error) {
      actionError.value = error instanceof Error ? error.message : String(error);
    } finally {
      playNavigating.value = false;
    }
    return;
  }
  await playTarget(props.id, resumeMs.value > 0 ? resumeMs.value : 0);
}

async function playEpisode(ep: MediaItem) {
  setSeriesPlaybackQueue(ep);
  const start = Math.round((ep.UserData?.PlaybackPositionTicks ?? 0) / 10_000);
  await playTarget(ep.Id, start);
}

async function startDownload() {
  const target = downloadTarget.value;
  if (!target?.Id || !canStartDownload.value || downloadStarting.value) return;
  downloadStarting.value = true;
  actionError.value = null;
  try {
    const task = await downloads.start(target.Id, { preferDirect: true });
    await router.push({ name: "downloads", query: { task: task.id } });
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : String(error);
  } finally {
    downloadStarting.value = false;
  }
}

function goBack() {
  if (window.history.length > 1) router.back();
  else router.push("/home").catch(() => {});
}

function goServerSettings() {
  router.push({ name: "settings", query: { c: "servers" } }).catch(() => {});
}

function openStudio(studio: StudioEntry) {
  const routeId = studio.id ?? `name:${studio.name}`;
  router.push({
    name: "studio-detail",
    params: { id: routeId },
    query: { name: studio.name },
  }).catch(() => {});
}

function openPerson(person: MediaPerson) {
  const name = person.Name?.trim();
  if (!name) return;
  const id = person.Id?.trim() || `name:${name}`;
  router.push({
    name: "person-detail",
    params: { id },
    query: { name },
  }).catch(() => {});
}

function openGenre(genre: GenreEntry) {
  const routeId = genre.id ?? `name:${genre.name}`;
  router.push({
    name: "genre-detail",
    params: { id: routeId },
    query: { name: genre.name },
  }).catch(() => {});
}

function openRelatedItem(target: MediaItem) {
  router.push({
    name: "item-detail",
    params: { id: target.Id },
    query: currentSourceQuery(),
  }).catch(() => {});
}

async function playSpecialFeature(target: MediaItem) {
  await playTarget(target.Id, 0);
}

async function openExternalLink(link: ExternalLink) {
  try {
    await api.openExternal(link.url);
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : String(error);
  }
}

function clearShareStatus() {
  shareStatus.value = null;
  if (shareStatusTimer) {
    window.clearTimeout(shareStatusTimer);
    shareStatusTimer = null;
  }
}

function showShareStatus(message: string) {
  shareStatus.value = message;
  if (shareStatusTimer) {
    window.clearTimeout(shareStatusTimer);
  }
  shareStatusTimer = window.setTimeout(() => {
    shareStatus.value = null;
    shareStatusTimer = null;
  }, 2400);
}

function sharePayload() {
  const serverLink = externalLinks.value.find((link) => link.key === "server");
  if (serverLink) {
    return { text: serverLink.url, status: "分享链接已复制" };
  }
  const title = item.value?.Name ?? item.value?.SeriesName ?? "Hills Lite";
  return {
    text: [`${title}`, `ItemId: ${props.id}`].join("\n"),
    status: "条目信息已复制",
  };
}

async function shareItem() {
  try {
    actionError.value = null;
    const payload = sharePayload();
    await writeTextToClipboard(payload.text);
    showShareStatus(payload.status);
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : String(error);
  }
}

function isCurrentEpisode(ep: MediaItem) {
  if (isEpisode.value) return ep.Id === props.id;
  const c = continueEpisode.value;
  return c?.Id === ep.Id;
}

function episodeProgress(ep: MediaItem) {
  return itemProgress(ep);
}

function episodeProgressWidth(ep: MediaItem) {
  if (ep.UserData?.Played) return 100;
  return episodeProgress(ep);
}

function hasEpisodeProgress(ep: MediaItem) {
  return episodeProgressWidth(ep) > 0;
}

function episodeProgressLabel(ep: MediaItem) {
  if (ep.UserData?.Played) return "已看";
  const progress = episodeProgress(ep);
  if (progress > 0 && progress < 100) return `${Math.round(progress)}%`;
  return "";
}

function episodeIndexLabel(ep: MediaItem) {
  const season = ep.ParentIndexNumber;
  const episode = ep.IndexNumber;
  if (season != null && episode != null) return `S${season}E${episode}`;
  if (episode != null) return `E${episode}`;
  return "";
}

function relatedKindLabel(target: MediaItem) {
  if (target.Type === "Movie") return "电影";
  if (target.Type === "Series") return "剧集";
  if (target.Type === "Episode") return "单集";
  if (target.Type === "BoxSet") return "合集";
  return target.Type ?? "媒体";
}

function specialFeatureKindLabel(target: MediaItem) {
  if (target.Type === "Trailer") return "预告片";
  if (target.Type === "BehindTheScenes") return "幕后";
  if (target.Type === "DeletedScene") return "删减片段";
  if (target.Type === "Interview") return "访谈";
  if (target.Type === "Scene" || target.Type === "Clip") return "片段";
  return relatedKindLabel(target);
}

function relatedSubtitle(target: MediaItem) {
  if (target.Type === "Episode" && target.SeriesName) {
    const season = target.ParentIndexNumber == null ? "?" : String(target.ParentIndexNumber).padStart(2, "0");
    const episode = target.IndexNumber == null ? "?" : String(target.IndexNumber).padStart(2, "0");
    return `${target.SeriesName} · S${season}E${episode}`;
  }
  if (target.ProductionYear) return String(target.ProductionYear);
  return relatedKindLabel(target);
}

function personRole(person: MediaPerson) {
  return person.Role || person.Type || "";
}

function personImageUrl(person: MediaPerson) {
  if (!person.Id || !person.PrimaryImageTag) return null;
  return itemImageUrl(person.Id, "Primary", person.PrimaryImageTag, 220);
}

function mergedUserData(patch: Partial<UserData>): UserData {
  const cur = item.value?.UserData;
  return {
    PlayedPercentage: cur?.PlayedPercentage ?? null,
    PlaybackPositionTicks: cur?.PlaybackPositionTicks ?? null,
    Played: cur?.Played ?? false,
    IsFavorite: cur?.IsFavorite ?? false,
    PlayCount: cur?.PlayCount ?? 0,
    ...patch,
  };
}

async function toggleFavorite() {
  const current = item.value;
  if (!current || userDataUpdating.value) return;

  const next = !current.UserData?.IsFavorite;
  actionError.value = null;
  userDataUpdating.value = "favorite";
  lib.updateItemUserData(current.Id, mergedUserData({ IsFavorite: next }), routeAccountId.value);

  try {
    const userData = await api.setItemFavorite({ itemId: current.Id, value: next });
    lib.updateItemUserData(current.Id, userData, routeAccountId.value);
  } catch (e) {
    actionError.value = next ? "收藏失败，请稍后重试" : "取消收藏失败，请稍后重试";
    await lib.loadItem(current.Id, routeAccountId.value).catch(() => {});
    console.warn(e);
  } finally {
    userDataUpdating.value = null;
  }
}

async function togglePlayed() {
  const current = item.value;
  if (!current || userDataUpdating.value) return;

  const next = !current.UserData?.Played;
  actionError.value = null;
  userDataUpdating.value = "played";
  lib.updateItemUserData(
    current.Id,
    mergedUserData({
      Played: next,
      PlayedPercentage: next ? 100 : 0,
      PlaybackPositionTicks: next ? current.RunTimeTicks ?? 0 : 0,
    }),
    routeAccountId.value,
  );

  try {
    const userData = await api.setItemPlayed({ itemId: current.Id, value: next });
    lib.updateItemUserData(current.Id, userData, routeAccountId.value);
  } catch (e) {
    actionError.value = next ? "标记已看失败，请稍后重试" : "取消已看失败，请稍后重试";
    await lib.loadItem(current.Id, routeAccountId.value).catch(() => {});
    console.warn(e);
  } finally {
    userDataUpdating.value = null;
  }
}
</script>

<template>
  <main class="detail" :style="ambientStyle">
    <div v-if="loading && !item" class="detail__loading">
      <Icon icon="lucide:loader" width="24" class="spin" />
      <span>{{ loadStage || "加载中…" }}</span>
    </div>

    <div v-else-if="loadError && !item" class="detail__loading detail__loading--error">
      <Icon icon="lucide:triangle-alert" width="28" class="detail__error-icon" />
      <strong>{{ loadErrorTitle }}</strong>
      <p>{{ friendlyLoadError }}</p>
      <details v-if="loadErrorDetail" class="detail__error-detail">
        <summary>错误详情</summary>
        <code>{{ loadErrorDetail }}</code>
      </details>
      <div class="detail__error-actions">
        <button class="detail__retry" @click="loadDetail">重试</button>
        <button class="detail__retry" @click="goServerSettings">服务器设置</button>
        <button class="detail__retry" @click="goBack">返回</button>
      </div>
    </div>

    <template v-else-if="item">
      <section class="hero">
        <div v-if="backdropUrl" class="hero__bg">
          <img
            :src="backdropUrl"
            :alt="item.Name"
            loading="eager"
            decoding="async"
            @error="onHeroBackdropError"
          />
        </div>
        <div class="hero__shade" />

        <button class="hero__back" aria-label="返回" @click="goBack">
          <Icon icon="lucide:chevron-left" width="22" />
        </button>

        <div class="hero__body">
          <div class="hero__main">
            <div v-if="typeBadge || playStateBadge" class="hero__badges">
              <span
                v-if="typeBadge"
                class="media-badge"
                :class="`media-badge--${typeBadge.tone}`"
              >
                <Icon :icon="typeBadge.icon" width="14" />
                {{ typeBadge.label }}
              </span>
              <span
                v-if="playStateBadge"
                class="media-badge"
                :class="`media-badge--${playStateBadge.tone}`"
              >
                <Icon :icon="playStateBadge.icon" width="14" />
                {{ playStateBadge.label }}
              </span>
            </div>

            <div class="hero__actions">
              <button class="hero__play" :disabled="playNavigating" @click="continuePlay">
                <Icon
                  :icon="playNavigating ? 'lucide:loader' : 'lucide:play'"
                  width="20"
                  :class="{ spin: playNavigating }"
                />
                {{ resumeMs > 0 ? "继续播放" : "播放" }}
              </button>
              <div class="hero__circles">
                <button
                  v-if="desktopDownloadAvailable"
                  class="circle-btn"
                  :disabled="!canStartDownload || downloadStarting"
                  :title="downloadStarting ? '创建下载中' : canStartDownload ? '下载' : '当前条目不可下载'"
                  :aria-label="downloadStarting ? '创建下载中' : canStartDownload ? '下载' : '当前条目不可下载'"
                  @click="startDownload"
                >
                  <Icon
                    :icon="downloadStarting ? 'lucide:loader' : 'lucide:download'"
                    width="18"
                    :class="{ spin: downloadStarting }"
                  />
                </button>
                <button class="circle-btn" :title="shareStatus ?? '复制分享链接'" @click="shareItem">
                  <Icon icon="lucide:share-2" width="18" />
                </button>
                <button
                  class="circle-btn"
                  :class="{ active: item.UserData?.IsFavorite }"
                  :disabled="userDataUpdating === 'favorite'"
                  :title="item.UserData?.IsFavorite ? '取消收藏' : '收藏'"
                  @click="toggleFavorite"
                >
                  <Icon
                    :icon="userDataUpdating === 'favorite' ? 'lucide:loader' : 'lucide:heart'"
                    width="18"
                    :class="{ spin: userDataUpdating === 'favorite' }"
                  />
                </button>
                <button
                  class="circle-btn"
                  :class="{ active: item.UserData?.Played }"
                  :disabled="userDataUpdating === 'played'"
                  :title="item.UserData?.Played ? '取消已看' : '标记已看'"
                  @click="togglePlayed"
                >
                  <Icon
                    :icon="userDataUpdating === 'played' ? 'lucide:loader' : 'lucide:check'"
                    width="18"
                    :class="{ spin: userDataUpdating === 'played' }"
                  />
                </button>
              </div>
            </div>

            <h1 class="hero__title">{{ item.SeriesName ?? item.Name }}</h1>
            <p v-if="episodeSubtitle" class="hero__ep">{{ episodeSubtitle }}</p>

            <div v-if="genreEntries.length" class="hero__tags">
              <button
                v-for="genre in genreEntries"
                :key="genre.key"
                type="button"
                @click="openGenre(genre)"
              >
                {{ genre.name }}
              </button>
            </div>

            <div v-if="metaParts.length" class="hero__meta">
              <span v-for="(p, i) in metaParts" :key="i">{{ p }}</span>
            </div>

            <div v-if="studioEntries.length" class="hero__studios">
              <span class="hero__studios-label">制作公司</span>
              <div class="hero__studios-row">
                <button
                  v-for="studio in visibleStudioEntries"
                  :key="studio.key"
                  type="button"
                  class="hero__studio-pill"
                  @click="openStudio(studio)"
                >
                  {{ studio.name }}
                </button>
                <button
                  v-if="hiddenStudioEntries.length"
                  type="button"
                  class="hero__studio-more"
                  :aria-expanded="showStudioPopover"
                  @click.stop="showStudioPopover = !showStudioPopover"
                >
                  +{{ hiddenStudioEntries.length }}
                </button>
              </div>
              <div v-if="showStudioPopover && hiddenStudioEntries.length" class="hero__studio-popover">
                <button
                  v-for="studio in hiddenStudioEntries"
                  :key="studio.key"
                  type="button"
                  class="hero__studio-popover-item"
                  @click="openStudio(studio)"
                >
                  {{ studio.name }}
                </button>
              </div>
            </div>
            <div v-if="externalLinks.length" class="hero__links">
              <button
                v-for="link in externalLinks"
                :key="link.key"
                type="button"
                class="hero__link"
                @click="openExternalLink(link)"
              >
                <Icon icon="lucide:external-link" width="13" />
                {{ link.label }}
              </button>
            </div>
            <p v-if="actionError" class="hero__action-error">{{ actionError }}</p>
            <p v-if="shareStatus" class="hero__action-status">{{ shareStatus }}</p>
          </div>

          <aside
            v-if="mediaSourceOptions.length || audioStreamOptions.length || subtitleStreamOptions.length || heroMediaInfoRows.length"
            class="hero__playback-panel"
          >
            <div v-if="mediaSourceOptions.length" class="hero-select">
              <label for="hero-media-source">版本</label>
              <select id="hero-media-source" v-model="selectedMediaSourceKey">
                <option v-for="option in mediaSourceOptions" :key="option.key" :value="option.key">
                  {{ option.label }}
                </option>
              </select>
              <small v-if="mediaSourceOptions.find((option) => option.key === selectedMediaSourceKey)?.detail">
                {{ mediaSourceOptions.find((option) => option.key === selectedMediaSourceKey)?.detail }}
              </small>
            </div>

            <div v-if="audioStreamOptions.length" class="hero-select">
              <label for="hero-audio-source">音频</label>
              <select id="hero-audio-source" v-model="selectedAudioStreamKey">
                <option v-for="option in audioStreamOptions" :key="option.key" :value="option.key">
                  {{ option.label }}
                </option>
              </select>
              <small v-if="audioStreamOptions.find((option) => option.key === selectedAudioStreamKey)?.detail">
                {{ audioStreamOptions.find((option) => option.key === selectedAudioStreamKey)?.detail }}
              </small>
            </div>

            <div v-if="subtitleStreamOptions.length" class="hero-select">
              <label for="hero-subtitle-source">字幕</label>
              <select id="hero-subtitle-source" v-model="selectedSubtitleStreamKey">
                <option v-for="option in subtitleStreamOptions" :key="option.key" :value="option.key">
                  {{ option.label }}
                </option>
              </select>
              <small v-if="subtitleStreamOptions.find((option) => option.key === selectedSubtitleStreamKey)?.detail">
                {{ subtitleStreamOptions.find((option) => option.key === selectedSubtitleStreamKey)?.detail }}
              </small>
            </div>

            <div v-if="heroMediaInfoRows.length" class="hero__playback-meta">
              <div v-for="row in heroMediaInfoRows" :key="row.key" class="hero__playback-meta-item">
                <Icon :icon="row.icon" width="15" />
                <span>{{ row.label }}</span>
                <strong>{{ row.value }}</strong>
              </div>
            </div>
          </aside>

        </div>
      </section>

      <section v-if="item.Overview" class="overview-block">
        <p>{{ item.Overview }}</p>
      </section>

      <section v-if="mediaInfoRows.length" class="media-info">
        <header class="media-info__head">
          <h2>媒体信息</h2>
        </header>
        <div class="media-info__grid">
          <div v-for="row in mediaInfoRows" :key="row.key" class="media-info__item">
            <Icon :icon="row.icon" width="18" />
            <div>
              <span>{{ row.label }}</span>
              <strong>{{ row.value }}</strong>
              <small v-if="row.detail">{{ row.detail }}</small>
            </div>
          </div>
        </div>
        <div v-if="mediaSourceCards.length > 1" class="media-info__versions">
          <article v-for="card in mediaSourceCards" :key="card.key" class="media-info__version">
            <div>
              <strong>{{ card.title }}</strong>
              <span v-if="card.meta">{{ card.meta }}</span>
              <small v-if="card.detail">{{ card.detail }}</small>
            </div>
            <em v-if="card.capabilities">{{ card.capabilities }}</em>
          </article>
        </div>
      </section>

      <section v-if="isCollection && (loadingCollection || collectionItems.length)" class="related related--collection">
        <header class="related__head">
          <h2>合集内容</h2>
        </header>

        <div v-if="loadingCollection" class="related__loading">
          <Icon icon="lucide:loader" width="18" class="spin" />
        </div>

        <div v-else class="related__scroll">
          <button
            v-for="child in collectionItems"
            :key="child.Id"
            type="button"
            class="related-card"
            @click="openRelatedItem(child)"
          >
            <div class="related-card__art">
              <img
                v-if="imageUrl(child, 'Primary', 420)"
                :src="imageUrl(child, 'Primary', 420)!"
                :alt="child.Name"
                loading="lazy"
                decoding="async"
              />
              <div v-else class="related-card__placeholder">{{ child.Name.slice(0, 1) }}</div>
              <span class="related-card__kind">{{ relatedKindLabel(child) }}</span>
            </div>
            <div class="related-card__title">{{ child.Name }}</div>
            <div class="related-card__sub">{{ relatedSubtitle(child) }}</div>
          </button>
        </div>
      </section>

      <section v-if="seriesId && seasons.length > 0" class="episodes">
        <header class="episodes__head">
          <div class="episodes__left">
            <h2>更多来自 {{ activeSeasonName }}</h2>
            <select v-model="activeSeasonId" class="season-select">
              <option v-for="s in seasons" :key="s.Id" :value="s.Id">{{ s.Name }}</option>
            </select>
          </div>
        </header>

        <div v-if="loadingEpisodes" class="episodes__loading">
          <Icon icon="lucide:loader" width="18" class="spin" />
        </div>
        <div v-else class="episodes__scroll">
          <button
            v-for="ep in episodes"
            :key="ep.Id"
            class="ep-card"
            :class="{ 'is-current': isCurrentEpisode(ep) }"
            :disabled="playNavigating"
            @click="playEpisode(ep)"
          >
            <div class="ep-card__thumb">
              <img v-if="imageUrl(ep, 'Primary', 480)" :src="imageUrl(ep, 'Primary', 480)!" :alt="ep.Name" />
              <div v-else class="ep-card__placeholder">{{ ep.IndexNumber ?? "?" }}</div>
              <span v-if="episodeIndexLabel(ep)" class="ep-card__index">
                {{ episodeIndexLabel(ep) }}
              </span>
              <span
                v-if="episodeProgressLabel(ep)"
                class="ep-card__state"
                :class="{ 'ep-card__state--watched': ep.UserData?.Played }"
              >
                {{ episodeProgressLabel(ep) }}
              </span>
              <div
                v-if="hasEpisodeProgress(ep)"
                class="ep-card__progress"
                :class="{ 'ep-card__progress--watched': ep.UserData?.Played }"
              >
                <span :style="{ width: episodeProgressWidth(ep) + '%' }" />
              </div>
            </div>
            <div class="ep-card__title">{{ ep.Name }}</div>
          </button>
        </div>
      </section>

      <section v-if="castPeople.length" class="cast">
        <h2>演职人员</h2>
        <div class="cast__scroll">
          <button
            v-for="person in castPeople"
            :key="person.Id ?? person.Name"
            type="button"
            class="cast__item"
            @click="openPerson(person)"
          >
            <div class="cast__avatar">
              <img
                v-if="personImageUrl(person)"
                :src="personImageUrl(person)!"
                :alt="person.Name"
                loading="lazy"
                decoding="async"
              />
              <span v-else>{{ person.Name.slice(0, 1) }}</span>
            </div>
            <span class="cast__name">{{ person.Name }}</span>
            <span v-if="personRole(person)" class="cast__role">{{ personRole(person) }}</span>
          </button>
        </div>
      </section>

      <section v-if="loadingSpecialFeatures || specialFeatures.length" class="related related--extras">
        <header class="related__head">
          <h2>附加内容</h2>
        </header>

        <div v-if="loadingSpecialFeatures" class="related__loading">
          <Icon icon="lucide:loader" width="18" class="spin" />
        </div>

        <div v-else class="related__scroll">
          <button
            v-for="feature in specialFeatures"
            :key="feature.Id"
            type="button"
            class="related-card"
            @click="playSpecialFeature(feature)"
          >
            <div class="related-card__art">
              <img
                v-if="imageUrl(feature, 'Primary', 420)"
                :src="imageUrl(feature, 'Primary', 420)!"
                :alt="feature.Name"
                loading="lazy"
                decoding="async"
              />
              <div v-else class="related-card__placeholder">{{ feature.Name.slice(0, 1) }}</div>
              <span class="related-card__kind">{{ specialFeatureKindLabel(feature) }}</span>
            </div>
            <div class="related-card__title">{{ feature.Name }}</div>
            <div class="related-card__sub">{{ relatedSubtitle(feature) }}</div>
          </button>
        </div>
      </section>

      <section v-if="loadingSimilar || similarItems.length" class="related">
        <header class="related__head">
          <h2>相似内容</h2>
        </header>

        <div v-if="loadingSimilar" class="related__loading">
          <Icon icon="lucide:loader" width="18" class="spin" />
        </div>

        <div v-else class="related__scroll">
          <button
            v-for="related in similarItems"
            :key="related.Id"
            type="button"
            class="related-card"
            @click="openRelatedItem(related)"
          >
            <div class="related-card__art">
              <img
                v-if="imageUrl(related, related.Type === 'Episode' ? 'Backdrop' : 'Primary', 360)"
                :src="imageUrl(related, related.Type === 'Episode' ? 'Backdrop' : 'Primary', 360)!"
                :alt="related.Name"
                loading="lazy"
                decoding="async"
              />
              <div v-else class="related-card__placeholder">{{ related.Name.slice(0, 1) }}</div>
              <span class="related-card__kind">{{ relatedKindLabel(related) }}</span>
            </div>
            <div class="related-card__title">{{ related.Name }}</div>
            <div class="related-card__sub">{{ relatedSubtitle(related) }}</div>
          </button>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.detail {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  position: relative;
  /* Immersive ambient: a soft glow tinted with the backdrop's dominant color
     (falls back to the theme accent) layered over the base surface. The
     gradient is painted on the scroll container so it stays as a top ambient
     while content scrolls over it. */
  background:
    radial-gradient(
      150% 680px at 50% 2%,
      color-mix(in srgb, var(--detail-ambient, var(--ambient)) 26%, transparent),
      transparent 66%
    ),
    var(--surface-1);
}
.detail__loading {
  height: 100%;
  display: grid;
  place-items: center;
  gap: 10px;
  color: var(--fg-tertiary);
  font-size: 13px;
  padding: 24px;
  text-align: center;
}
.detail__loading--error {
  align-content: center;
  justify-items: center;
  overflow: hidden;
}
.detail__error-icon {
  color: var(--fg-tertiary);
}
.detail__loading--error strong {
  color: var(--fg-primary);
  font-size: 16px;
}
.detail__loading--error p {
  width: min(680px, 100%);
  margin: 0;
  color: var(--fg-secondary);
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.detail__error-detail {
  width: min(760px, 100%);
  text-align: left;
  color: var(--fg-tertiary);
}
.detail__error-detail summary {
  cursor: pointer;
  text-align: center;
  font-size: 12px;
}
.detail__error-detail code {
  display: block;
  max-height: 160px;
  margin-top: 8px;
  padding: 10px 12px;
  overflow: auto;
  border-radius: 8px;
  background: var(--surface-2);
  border: 1px solid var(--separator);
  color: var(--fg-tertiary);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.detail__error-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}
.detail__retry {
  appearance: none;
  border: 1px solid var(--glass-border);
  background: var(--surface-2);
  color: var(--fg-primary);
  padding: 8px 16px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  margin: 0 4px;
}
.detail__retry:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.hero {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  height: auto;
  min-height: 430px;
  max-height: min(70dvh, calc(100dvh - 220px));
  color: white;
  isolation: isolate;
  overflow: hidden;
}
.hero__bg {
  position: absolute;
  inset: 0;
  background: #08080a;
  pointer-events: none;
}
.hero__bg img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  object-position: center;
}
.hero__shade {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, rgba(10, 10, 12, 0.82) 0%, rgba(10, 10, 12, 0.3) 43%, rgba(10, 10, 12, 0.14) 100%),
    linear-gradient(0deg, var(--bg-base) 0%, rgba(10, 10, 12, 0.5) 26%, rgba(10, 10, 12, 0.06) 64%);
}
/* Light theme: keep the backdrop's real colors vibrant — only a soft
   bottom/left gradient for text legibility, and fade the bottom into the page. */
:root[data-theme="light"] .hero__shade {
  background:
    linear-gradient(90deg, rgba(8, 10, 16, 0.5) 0%, rgba(8, 10, 16, 0.12) 34%, transparent 64%),
    linear-gradient(0deg, var(--bg-base) 0%, rgba(8, 10, 16, 0.22) 22%, transparent 50%);
}
/* Subtle cinematic entrance for the hero content. */
@keyframes detail-hero-rise {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.hero__main {
  animation: detail-hero-rise 460ms var(--easing-spring) both;
}
@media (prefers-reduced-motion: reduce) {
  .hero__main {
    animation: none;
  }
}
.hero__back {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 2;
  pointer-events: auto;
  appearance: none;
  border: none;
  background: rgba(0, 0, 0, 0.35);
  color: white;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.hero__body {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 5;
  pointer-events: auto;
  padding: 0 var(--content-pad) clamp(24px, 6vh, 64px);
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 420px);
  gap: clamp(24px, 5vw, 72px);
  align-items: end;
}
.hero__main {
  min-width: 0;
  max-width: min(860px, 100%);
}
.hero__badges {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.media-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 5px 9px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.09);
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}
.media-badge--movie {
  border-color: rgba(10, 132, 255, 0.42);
  background: rgba(10, 132, 255, 0.16);
}
.media-badge--series,
.media-badge--episode {
  border-color: rgba(48, 209, 88, 0.36);
  background: rgba(48, 209, 88, 0.14);
}
.media-badge--collection {
  border-color: rgba(255, 214, 10, 0.4);
  background: rgba(255, 214, 10, 0.13);
}
.media-badge--audio {
  border-color: rgba(191, 90, 242, 0.42);
  background: rgba(191, 90, 242, 0.15);
}
.media-badge--folder {
  border-color: rgba(255, 255, 255, 0.16);
}
.media-badge--progress {
  border-color: rgba(255, 159, 10, 0.42);
  background: rgba(255, 159, 10, 0.15);
}
.media-badge--watched {
  border-color: rgba(10, 132, 255, 0.5);
  background: rgba(10, 132, 255, 0.2);
}
.hero__actions {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.hero__play {
  position: relative;
  z-index: 4;
  pointer-events: auto;
  appearance: none;
  border: none;
  background: var(--accent-grad);
  color: white;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 28px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(168, 85, 247, 0.35);
  flex-shrink: 0;
}
.hero__play:disabled {
  cursor: progress;
  opacity: 0.76;
}
.hero__circles {
  display: flex;
  gap: 10px;
}
.circle-btn {
  position: relative;
  z-index: 4;
  pointer-events: auto;
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: white;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.circle-btn.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent-hover);
}
.circle-btn:disabled {
  cursor: progress;
  opacity: 0.7;
}
.hero__playback-panel {
  width: 100%;
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(20, 20, 24, 0.42);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.26);
  backdrop-filter: blur(18px);
}
.hero-select {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  align-items: center;
  gap: 6px 10px;
}
.hero-select label {
  color: rgba(255, 255, 255, 0.74);
  font-size: 12px;
  font-weight: 700;
}
.hero-select select {
  min-width: 0;
  width: 100%;
  height: 38px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.12);
  color: white;
  padding: 0 34px 0 10px;
  outline: none;
}
.hero-select select:focus {
  border-color: rgba(168, 85, 247, 0.72);
}
.hero-select small {
  grid-column: 2;
  color: rgba(255, 255, 255, 0.56);
  font-size: 11px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hero__playback-meta {
  display: grid;
  gap: 8px;
  padding-top: 4px;
}
.hero__playback-meta-item {
  display: grid;
  grid-template-columns: 18px 56px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.64);
  font-size: 12px;
}
.hero__playback-meta-item strong {
  min-width: 0;
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hero__title {
  margin: 0;
  font-size: clamp(28px, 4.8vw, 54px);
  font-weight: 800;
  color: white;
  letter-spacing: 0;
  line-height: 1.08;
  text-shadow: 0 2px 22px rgba(0, 0, 0, 0.56);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.hero__ep {
  margin: 6px 0 0;
  font-size: clamp(13px, 1.4vw, 18px);
  color: rgba(255, 255, 255, 0.76);
}
.hero__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.hero__tags button {
  appearance: none;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.78);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}
.hero__tags button:hover {
  border-color: rgba(255, 255, 255, 0.28);
  color: white;
  background: rgba(255, 255, 255, 0.15);
}
.hero__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
  font-size: 12px;
}
.hero__meta span {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: var(--r-pill, 999px);
  white-space: nowrap;
}
.hero__studios {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(680px, 100%);
  margin-top: 10px;
  min-width: 0;
}
.hero__studios-label {
  flex: 0 0 auto;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.58);
}
.hero__studios-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
}
.hero__studio-pill,
.hero__studio-more,
.hero__studio-popover-item {
  appearance: none;
  min-width: 0;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.76);
  border-radius: 999px;
  padding: 5px 9px;
  font-size: 12px;
  line-height: 1;
}
.hero__studio-pill,
.hero__studio-popover-item {
  cursor: pointer;
}
.hero__studio-pill:hover,
.hero__studio-popover-item:hover {
  color: white;
  border-color: rgba(255, 255, 255, 0.24);
  background: rgba(255, 255, 255, 0.13);
}
.hero__studio-more {
  flex: 0 0 auto;
  cursor: pointer;
  color: var(--accent);
  border-color: rgba(168, 85, 247, 0.42);
  background: rgba(168, 85, 247, 0.14);
}
.hero__studio-popover {
  position: absolute;
  left: 70px;
  top: calc(100% + 8px);
  z-index: 5;
  width: min(420px, calc(100vw - 48px));
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--glass-border);
  background: rgba(18, 18, 22, 0.96);
  box-shadow: 0 18px 46px rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(18px);
}
.hero__studio-popover-item {
  max-width: 100%;
}
.hero__links {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 10px;
}
.hero__link {
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.76);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 0 10px;
  font-size: 12px;
}
.hero__link:hover {
  border-color: rgba(255, 255, 255, 0.26);
  color: white;
  background: rgba(255, 255, 255, 0.13);
}
.hero__action-error {
  margin: 10px 0 0;
  color: var(--danger);
  font-size: 12px;
}
.hero__action-status {
  margin: 10px 0 0;
  color: rgba(255, 255, 255, 0.76);
  font-size: 12px;
}
.overview-block {
  padding: 16px var(--content-pad) 8px;
  border-bottom: 1px solid var(--separator);
}
.overview-block p {
  margin: 0;
  max-width: 920px;
  font-size: 14px;
  line-height: 1.65;
  color: var(--fg-secondary);
}
.media-info {
  padding: 16px var(--content-pad) 10px;
  border-bottom: 1px solid var(--separator);
}
.media-info__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.media-info__head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--fg-primary);
}
.media-info__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
}
.media-info__item {
  min-width: 0;
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  padding: 10px 12px;
  border: 1px solid var(--separator);
  border-radius: 8px;
  background: var(--surface-1);
}
.media-info__item > svg {
  color: var(--fg-tertiary);
  margin-top: 1px;
}
.media-info__item span,
.media-info__item small {
  display: block;
  min-width: 0;
  color: var(--fg-tertiary);
  font-size: 11px;
  line-height: 1.3;
}
.media-info__item strong {
  display: block;
  min-width: 0;
  margin-top: 3px;
  color: var(--fg-primary);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.media-info__item small {
  margin-top: 3px;
  color: var(--fg-secondary);
  overflow-wrap: anywhere;
}
.media-info__versions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.media-info__version {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--separator);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
}
.media-info__version div {
  min-width: 0;
}
.media-info__version strong,
.media-info__version span,
.media-info__version small {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
}
.media-info__version strong {
  color: var(--fg-primary);
  font-size: 13px;
  line-height: 1.3;
}
.media-info__version span {
  margin-top: 4px;
  color: var(--fg-secondary);
  font-size: 12px;
  line-height: 1.35;
}
.media-info__version small {
  margin-top: 3px;
  color: var(--fg-tertiary);
  font-size: 11px;
  line-height: 1.3;
}
.media-info__version em {
  flex: 0 0 auto;
  max-width: 96px;
  padding: 4px 7px;
  border-radius: 999px;
  border: 1px solid rgba(168, 85, 247, 0.36);
  background: rgba(168, 85, 247, 0.12);
  color: var(--accent-hover);
  font-size: 11px;
  font-style: normal;
  line-height: 1.2;
  text-align: center;
}

@media (max-width: 960px) {
  .hero__body {
    grid-template-columns: 1fr;
    gap: 16px;
    align-items: stretch;
  }
  .hero__playback-panel {
    max-width: 520px;
  }
}

@media (max-width: 1100px), (max-height: 700px) {
  .hero__body {
    top: 56px;
    bottom: 0;
    gap: 12px;
    padding: 0 var(--content-pad) clamp(16px, 3vh, 28px);
    overflow-y: auto;
    align-content: end;
  }
  .hero__badges {
    margin-bottom: 8px;
  }
  .hero__actions {
    gap: 10px;
    margin-bottom: 10px;
  }
  .hero__title {
    font-size: clamp(26px, 4vw, 38px);
    line-height: 1.06;
  }
  .hero__ep {
    margin-top: 4px;
  }
  .hero__tags {
    gap: 6px;
    margin-top: 8px;
  }
  .hero__meta,
  .hero__studios,
  .hero__links {
    margin-top: 7px;
  }
  .hero__playback-panel {
    gap: 8px;
    padding: 12px;
  }
  .hero-select select {
    height: 34px;
  }
}

@media (max-height: 620px) {
  .hero {
    min-height: 0;
    max-height: none;
    height: calc(100dvh - var(--topbar-h) - 72px);
  }
  .hero__body {
    top: 48px;
    align-content: start;
  }
  .hero__title {
    font-size: clamp(24px, 3.6vw, 34px);
  }
  .hero__play {
    padding: 10px 22px;
  }
  .circle-btn {
    width: 36px;
    height: 36px;
  }
  .hero__playback-panel {
    max-height: min(312px, 48vh);
    overflow-y: auto;
  }
}

@media (max-width: 640px) {
  .hero {
    aspect-ratio: 16 / 10;
    min-height: 0;
    max-height: none;
    height: calc(100dvh - var(--topbar-h) - 88px);
  }
  .hero__title {
    font-size: 28px;
  }
  .hero__actions {
    flex-direction: column;
    align-items: stretch;
  }
  .hero__play {
    justify-content: center;
  }
  .hero__circles {
    justify-content: center;
  }
  .hero__playback-panel {
    padding: 12px;
  }
  .hero-select {
    grid-template-columns: 40px minmax(0, 1fr);
  }
  .hero__playback-meta-item {
    grid-template-columns: 18px 48px minmax(0, 1fr);
  }
  .hero__studios {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }
  .hero__studios-row {
    width: 100%;
  }
  .hero__studio-popover {
    left: 0;
  }
  .episodes__head {
    flex-direction: column;
    align-items: flex-start;
  }
  .ep-card {
    flex: 0 0 140px;
  }
}
.episodes {
  padding: 8px var(--content-pad) 24px;
}
.episodes__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.episodes__left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.episodes__head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  white-space: nowrap;
}
.season-select {
  appearance: none;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--glass-border);
  color: var(--fg-primary);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
}
.episodes__loading {
  padding: 24px;
  display: flex;
  justify-content: center;
}
.episodes__scroll {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 6px;
}
.ep-card {
  appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  flex: 0 0 160px;
  text-align: left;
  cursor: pointer;
  padding: 0;
}
.ep-card:disabled {
  cursor: progress;
  opacity: 0.72;
}
.ep-card__thumb {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 10px;
  overflow: hidden;
  border: 2px solid transparent;
  background: var(--surface-3);
}
.ep-card.is-current .ep-card__thumb {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.ep-card__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.ep-card__placeholder {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 22px;
  font-weight: 700;
  color: var(--fg-tertiary);
}
.ep-card__index,
.ep-card__state {
  position: absolute;
  top: 8px;
  z-index: 1;
  min-height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 7px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.58);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: white;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}
.ep-card__index {
  left: 8px;
}
.ep-card__state {
  right: 8px;
  color: var(--accent-hover);
}
.ep-card__state--watched {
  color: #6ee7b7;
}
.ep-card__progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 5px;
  background: rgba(0, 0, 0, 0.46);
}
.ep-card__progress span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
}
.ep-card__progress--watched span {
  background: #6ee7b7;
}
.ep-card__title {
  margin-top: 8px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.cast {
  padding: 4px var(--content-pad) 32px;
}
.cast h2 {
  margin: 0 0 14px;
  font-size: 16px;
  font-weight: 700;
}
.cast__scroll {
  display: flex;
  gap: 16px;
  overflow-x: auto;
}
.cast__item {
  appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  flex: 0 0 88px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0;
  cursor: pointer;
}
.cast__item:hover .cast__avatar {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.28);
}
.cast__item:hover .cast__name {
  color: var(--accent-hover);
}
.cast__avatar {
  width: 72px;
  height: 72px;
  border-radius: 999px;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
  border: 1px solid var(--glass-border);
  color: var(--fg-secondary);
  font-size: 24px;
  font-weight: 700;
  transition:
    transform 180ms var(--easing-glide),
    border-color 180ms var(--easing-glide);
}
.cast__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.cast__name {
  max-width: 100%;
  font-size: 12px;
  color: var(--fg-primary);
  font-weight: 600;
  text-align: center;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.cast__role {
  max-width: 100%;
  margin-top: -4px;
  font-size: 11px;
  color: var(--fg-tertiary);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.related {
  padding: 0 var(--content-pad) 36px;
}
.related__head {
  display: flex;
  align-items: center;
  margin-bottom: 14px;
}
.related__head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0;
}
.related__loading {
  min-height: 92px;
  display: grid;
  place-items: center;
  color: var(--fg-tertiary);
}
.related__scroll {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  padding-bottom: 8px;
}
.related-card {
  appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  flex: 0 0 138px;
  min-width: 0;
  padding: 0;
  text-align: left;
}
.related--extras .related-card {
  flex-basis: 190px;
}
.related-card__art {
  position: relative;
  aspect-ratio: 2 / 3;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.05);
  transition:
    transform 180ms var(--easing-glide),
    border-color 180ms var(--easing-glide);
}
.related--extras .related-card__art {
  aspect-ratio: 16 / 9;
}
.related-card:hover .related-card__art {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.24);
}
.related-card__art img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
.related-card__placeholder {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--fg-tertiary);
  font-size: 36px;
  font-weight: 700;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.03));
}
.related-card__kind {
  position: absolute;
  left: 8px;
  bottom: 8px;
  max-width: calc(100% - 16px);
  min-height: 22px;
  display: inline-flex;
  align-items: center;
  padding: 3px 7px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.58);
  color: white;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.related-card__title {
  margin-top: 8px;
  color: var(--fg-primary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.related-card__sub {
  margin-top: 3px;
  color: var(--fg-tertiary);
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.spin {
  animation: spin 800ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
