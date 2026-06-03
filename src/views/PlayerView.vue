<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { CSSProperties } from "vue";
import { useRoute, useRouter, type LocationQueryRaw, type RouteLocationRaw } from "vue-router";
import { Icon } from "@iconify/vue";
import Hls from "hls.js";

import GlassButton from "@/components/common/GlassButton.vue";
import DanmakuOverlay from "@/components/player/DanmakuOverlay.vue";
import SubtitlePanel from "@/components/player/SubtitlePanel.vue";
import { api, type PlaybackLineOption, type PlaybackMediaSource } from "@/api";
import { useKeyboard } from "@/composables/useKeyboard";
import { openFileDialog } from "@/platform";
import { useAuthStore } from "@/stores/auth";
import { useLibraryStore } from "@/stores/library";
import { usePlayerStore, type DirectQueueEntry } from "@/stores/player";
import { useServerStore } from "@/stores/server";
import { useSettingsStore } from "@/stores/settings";
import type {
  DanmakuComment,
  DanmakuResult,
  MediaItem,
  MpvSnapshot,
  MpvTrackInfo,
  PictureMode,
} from "@/types/models";
import { writeTextToClipboard } from "@/utils/clipboard";
import { keyboardBindingsForActions, PLAYER_SHORTCUTS, type PlayerShortcutAction } from "@/utils/keyboardShortcuts";
import { formatLatencyMs } from "@/utils/latency";
import { mediaItemImageUrl, type MediaImageType } from "@/utils/mediaImages";

const props = defineProps<{ id: string }>();
const route = useRoute();
const router = useRouter();
const player = usePlayerStore();
const auth = useAuthStore();
const lib = useLibraryStore();
const serverStore = useServerStore();
const settings = useSettingsStore();

const desktopBridge =
  typeof window !== "undefined" && Boolean((window as Window & { hillsLite?: unknown }).hillsLite);
const tauriBridge =
  typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
const nativeMpvDebug =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("nativeMpv") === "1";
const embedVideo =
  typeof window !== "undefined" &&
  (tauriBridge || desktopBridge || nativeMpvDebug);
const useHtmlVideo = !embedVideo;

const errorText = ref<string | null>(null);
const errorCopyStatus = ref<string | null>(null);
const showControls = ref(true);
const retryingPlayback = ref(false);
const stageEl = ref<HTMLElement | null>(null);
let hideTimer: number | null = null;
let hls: Hls | null = null;
let pendingStartSeconds: number | null = null;
let htmlProgressTimer: number | null = null;
let screenshotMessageTimer: number | null = null;
let errorCopyTimer: number | null = null;
let embedResizeObserver: ResizeObserver | null = null;
let embedResizeRaf = 0;
let embedLayoutSyncTimer: number | null = null;
let lastEmbedRectKey = "";
let blackoutSyncSeq = 0;
let introSkipAppliedItemId: string | null = null;
let outroSkipAppliedItemId: string | null = null;
let localQueueEofHandled = false;
let longPressSpeedTimer: number | null = null;
let longPressRestoreSpeed: number | null = null;
let longPressPointerId: number | null = null;
let longPressStart: { x: number; y: number } | null = null;

const subtitlePanelOpen = ref(false);
const settingsMenuOpen = ref(false);
const episodeMenuOpen = ref(false);
const chapterMenuOpen = ref(false);
const danmakuMenuOpen = ref(false);
const sourceMenuOpen = ref(false);
const statsOpen = ref(false);
const playbackSwitching = ref(false);
const longPressSpeedActive = ref(false);
const statsPage = ref<StatsPage>("summary");
const alwaysOnTop = ref(false);
const documentFullscreen = ref(false);
const nativeFullscreen = ref(false);
const screenshotBusy = ref(false);
const screenshotMessage = ref<string | null>(null);
const screenshotPath = ref<string | null>(null);
const secondaryBlackoutActive = ref(false);
const danmakuEnabled = ref(false);
const danmakuLoading = ref(false);
const danmakuComments = ref<DanmakuComment[]>([]);
const danmakuRawCount = ref(0);
const danmakuProvider = ref<string | null>(null);
const danmakuOpacity = computed(() => settings.settings.danmakuOpacity);
const danmakuSpeed = computed(() => settings.settings.danmakuSpeed);
const danmakuFontSize = computed(() => settings.settings.danmakuFontSize);
const danmakuAvoidSubtitles = computed(() => settings.settings.danmakuAvoidSubtitles);
const danmakuBottomReservePct = computed(() => settings.settings.danmakuBottomReservePct);
const queueLoading = ref(false);
const videoEl = ref<HTMLVideoElement | null>(null);
const htmlHasFrame = ref(false);
const htmlPositionMs = ref(0);
const htmlDurationMs = ref(0);
const htmlPaused = ref(true);
const htmlSpeed = ref(1);
const htmlVolume = ref(80);
const htmlMuted = ref(false);
const htmlTracks = ref<MpvTrackInfo[]>([]);
const htmlNetworkBps = ref<number | null>(null);
const htmlBufferedMs = ref(0);
const htmlBuffering = ref(false);
const pictureMode = ref<PictureMode>("fit");
const pictureModeOptions: Array<{ value: PictureMode; label: string; icon: string }> = [
  { value: "fit", label: "适应窗口", icon: "lucide:minimize-2" },
  { value: "fill", label: "填充裁切", icon: "lucide:maximize-2" },
  { value: "stretch", label: "拉伸铺满", icon: "lucide:move-horizontal" },
  { value: "autocrop", label: "自动去黑边", icon: "lucide:scan-line" },
];
type PlayerPanel = "subtitle" | "settings" | "episode" | "chapter" | "danmaku" | "source" | "stats";
type StatsPage = "summary" | "video" | "audio" | "tracks";
type StatsRow = { label: string; value: string };
type PlayerQueueEntry = {
  id: string;
  index: number;
  item: MediaItem | null;
  direct: DirectQueueEntry | null;
  active: boolean;
};

const statsPageOptions: Array<{ value: StatsPage; label: string; nativePage: number }> = [
  { value: "summary", label: "综合", nativePage: 1 },
  { value: "video", label: "视频", nativePage: 2 },
  { value: "audio", label: "音频", nativePage: 3 },
  { value: "tracks", label: "轨道", nativePage: 4 },
];

function isPlayerPanelOpen(panel: PlayerPanel): boolean {
  if (panel === "subtitle") return subtitlePanelOpen.value;
  if (panel === "settings") return settingsMenuOpen.value;
  if (panel === "episode") return episodeMenuOpen.value;
  if (panel === "chapter") return chapterMenuOpen.value;
  if (panel === "danmaku") return danmakuMenuOpen.value;
  if (panel === "source") return sourceMenuOpen.value;
  return statsOpen.value;
}

function setPlayerPanelOpen(panel: PlayerPanel, open: boolean) {
  if (panel === "subtitle") subtitlePanelOpen.value = open;
  else if (panel === "settings") settingsMenuOpen.value = open;
  else if (panel === "episode") episodeMenuOpen.value = open;
  else if (panel === "chapter") chapterMenuOpen.value = open;
  else if (panel === "danmaku") danmakuMenuOpen.value = open;
  else if (panel === "source") sourceMenuOpen.value = open;
  else statsOpen.value = open;
}

function closePlayerPanels(except?: PlayerPanel) {
  for (const panel of ["subtitle", "settings", "episode", "chapter", "danmaku", "source", "stats"] as const) {
    if (panel !== except) setPlayerPanelOpen(panel, false);
  }
}

function hasOpenPlayerPanel(): boolean {
  return ["subtitle", "settings", "episode", "chapter", "danmaku", "source", "stats"].some((panel) =>
    isPlayerPanelOpen(panel as PlayerPanel),
  );
}

function togglePlayerPanel(panel: PlayerPanel) {
  const wasOpen = isPlayerPanelOpen(panel);
  closePlayerPanels(panel);
  setPlayerPanelOpen(panel, !wasOpen);
  bumpControls();
}

function openPlayerPanel(panel: PlayerPanel) {
  closePlayerPanels(panel);
  setPlayerPanelOpen(panel, true);
  bumpControls();
}

async function toggleDanmaku() {
  if (!danmakuEnabled.value) {
    danmakuEnabled.value = true;
    if (danmakuComments.value.length === 0) {
      danmakuLoading.value = true;
      try {
        const r = await api.fetchDanmaku(currentItemId.value);
        const comments = r?.comments ?? [];
        danmakuRawCount.value = comments.reduce((total, c) => total + (c.count ?? 1), 0);
        danmakuProvider.value = r?.provider ?? null;
        danmakuComments.value = mergeDanmakuComments(comments);
      } catch {
        danmakuRawCount.value = 0;
        danmakuProvider.value = null;
        danmakuComments.value = [];
      } finally {
        danmakuLoading.value = false;
      }
    }
  } else {
    danmakuEnabled.value = false;
  }
}

function resetDanmakuState() {
  danmakuEnabled.value = false;
  danmakuComments.value = [];
  danmakuRawCount.value = 0;
  danmakuProvider.value = null;
}

function applyDanmakuResult(result: DanmakuResult) {
  const comments = result.comments ?? [];
  danmakuRawCount.value = comments.reduce((total, item) => total + (item.count ?? 1), 0);
  danmakuProvider.value = result.provider;
  danmakuComments.value = mergeDanmakuComments(comments);
  danmakuEnabled.value = danmakuComments.value.length > 0;
}

async function importDanmakuXml() {
  const selected = await openFileDialog({
    multiple: false,
    directory: false,
    filters: [
      { name: "Danmaku XML", extensions: ["xml"] },
      { name: "All", extensions: ["*"] },
    ],
    title: "选择弹幕 XML",
  });
  if (typeof selected !== "string" || selected.length === 0) return;

  danmakuLoading.value = true;
  try {
    const result = await api.importDanmakuXml({ filePath: selected });
    applyDanmakuResult(result);
  } catch {
    resetDanmakuState();
  } finally {
    danmakuLoading.value = false;
  }
}

function replacePathExtension(filePath: string, suffix: string): string {
  const slash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const dot = filePath.lastIndexOf(".");
  const base = dot > slash ? filePath.slice(0, dot) : filePath;
  return `${base}${suffix}`;
}

function localDanmakuXmlCandidates(filePath: string): string[] {
  return [
    replacePathExtension(filePath, ".xml"),
    replacePathExtension(filePath, ".danmaku.xml"),
    replacePathExtension(filePath, ".comments.xml"),
  ].filter((value, index, list) => list.indexOf(value) === index);
}

async function autoImportLocalDanmakuXml(filePath: string) {
  danmakuLoading.value = true;
  try {
    for (const candidate of localDanmakuXmlCandidates(filePath)) {
      try {
        const result = await api.importDanmakuXml({ filePath: candidate });
        if ((result.comments ?? []).length === 0) continue;
        applyDanmakuResult(result);
        return;
      } catch {
        // Try the next sidecar name.
      }
    }
    resetDanmakuState();
  } finally {
    danmakuLoading.value = false;
  }
}

function currentDirectQueueEntry(): DirectQueueEntry | null {
  if (player.queueKind === "direct" && player.queueIndex >= 0) {
    const entry = player.directQueue[player.queueIndex];
    if (entry) return entry;
  }
  const url = player.directUrl;
  if (!url) return null;
  return player.directQueue.find((entry) => entry.url === url) ?? null;
}

async function autoImportWebDavDanmaku(entry: DirectQueueEntry | null) {
  if (!entry?.sidecarDanmaku?.url) {
    resetDanmakuState();
    return;
  }
  danmakuLoading.value = true;
  try {
    const result = await api.importDanmakuXml({
      url: entry.sidecarDanmaku.url,
      username: entry.username ?? null,
      password: entry.password ?? null,
      token: entry.sourceKind === "alist" ? entry.token ?? null : null,
    });
    if ((result.comments ?? []).length > 0) {
      applyDanmakuResult(result);
    } else {
      resetDanmakuState();
    }
  } catch {
    resetDanmakuState();
  } finally {
    danmakuLoading.value = false;
  }
}

function normalizeDanmakuText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function mergeDanmakuComments(comments: DanmakuComment[]): DanmakuComment[] {
  const merged: Array<DanmakuComment & { lastTime: number }> = [];
  const recent = new Map<string, DanmakuComment & { lastTime: number }>();
  for (const comment of [...comments].sort((a, b) => a.time - b.time)) {
    const normalizedText = normalizeDanmakuText(comment.text);
    if (!normalizedText) continue;
    const key = `${comment.mode}:${normalizedText}`;
    const last = recent.get(key);
    if (last && comment.time - last.lastTime <= 1.2) {
      last.count = (last.count ?? 1) + (comment.count ?? 1);
      last.lastTime = comment.time;
      continue;
    }
    const next = { ...comment, count: comment.count ?? 1, lastTime: comment.time };
    recent.set(key, next);
    merged.push(next);
  }
  return merged.map(({ lastTime: _lastTime, ...comment }) => comment);
}

const currentItemId = computed(() => player.itemId ?? props.id);
const item = computed(() => lib.cachedItem(currentItemId.value, auth.activeId) ?? lib.cachedItem(props.id, auth.activeId));
const routeLocalFilePath = computed(() => {
  const value = route.query.file;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
});
const localFilePath = computed(() => player.localFilePath ?? routeLocalFilePath.value);
const localFileTitle = computed(() =>
  localFilePath.value ? fileNameFromPath(localFilePath.value) : null,
);
const isLocalFilePlayback = computed(() => Boolean(localFilePath.value));
const isDirectUrlPlayback = computed(() => Boolean(player.directUrl || player.directTitle));
const isLocalQueue = computed(() => player.queueKind === "local");
const isDirectQueue = computed(() => player.queueKind === "direct");
const displayTitle = computed(
  () =>
    item.value?.SeriesName ??
    item.value?.Name ??
    player.directTitle ??
    player.localFileTitle ??
    localFileTitle.value ??
    (props.id === "webdav-file" ? "WebDAV" : props.id === "alist-file" ? "Alist" : "本地文件"),
);
const displaySubtitle = computed(() => {
  if (isDirectUrlPlayback.value) return player.directSourceLabel ?? "网络文件";
  if (item.value?.Type === "Episode") {
    return `S${item.value.ParentIndexNumber ?? 1}:E${item.value.IndexNumber ?? "?"} - ${item.value.Name}`;
  }
  return isLocalFilePlayback.value ? "本地文件" : "";
});
const subtitleSearchQuery = computed(() => {
  if (player.directTitle) return player.directTitle.replace(/\.[^.]+$/, "");
  if (localFileTitle.value) return localFileTitle.value.replace(/\.[^.]+$/, "");
  const target = item.value;
  if (!target) return "";
  const names = [target.SeriesName, target.Name].filter(
    (name): name is string => typeof name === "string" && name.trim().length > 0,
  );
  return [...new Set(names.map((name) => name.trim()))].join(" ");
});
const activeServer = computed(() => {
  const account = auth.activeAccount;
  return account ? serverStore.byId(account.serverId) ?? null : null;
});

function playerImageUrl(target: MediaItem, imageType: MediaImageType, maxWidth = 2200): string | null {
  return mediaItemImageUrl(activeServer.value, target, imageType, maxWidth);
}

const backdropUrl = computed(() => (item.value ? playerImageUrl(item.value, "Backdrop", 2600) : null));
const primaryPosterUrl = computed(() =>
  item.value ? playerImageUrl(item.value, "Primary", 720) : null,
);

const positionMs = computed(() =>
  useHtmlVideo ? htmlPositionMs.value : player.snapshot?.positionMs ?? 0,
);
const durationMs = computed(() =>
  useHtmlVideo ? htmlDurationMs.value : player.snapshot?.durationMs ?? 0,
);
const paused = computed(() =>
  useHtmlVideo ? htmlPaused.value : player.snapshot?.paused ?? true,
);
const speed = computed(() => (useHtmlVideo ? htmlSpeed.value : player.snapshot?.speed ?? 1));
const volumeLevel = computed(() => (useHtmlVideo ? htmlVolume.value : player.snapshot?.volume ?? 80));
const muted = computed(() => (useHtmlVideo ? htmlMuted.value : player.snapshot?.muted ?? false));
const showNetworkSpeed = computed(() => settings.settings.showNetworkSpeed);
const skipIntroOutroEnabled = computed(() => settings.settings.skipIntroOutroEnabled);
const networkBps = computed(() =>
  useHtmlVideo ? htmlNetworkBps.value : player.snapshot?.networkBps ?? null,
);
const bufferedMs = computed(() =>
  useHtmlVideo ? htmlBufferedMs.value : player.snapshot?.bufferedMs ?? 0,
);
const buffering = computed(() =>
  useHtmlVideo ? htmlBuffering.value : player.snapshot?.buffering ?? false,
);
const danmakuMergedAway = computed(() =>
  Math.max(0, danmakuRawCount.value - danmakuComments.value.length),
);
const danmakuHeatmap = computed(() => {
  const durationSec = durationMs.value / 1000;
  if (!Number.isFinite(durationSec) || durationSec <= 0 || danmakuComments.value.length === 0) {
    return [];
  }
  const binCount = 60;
  const counts = Array.from({ length: binCount }, () => 0);
  for (const comment of danmakuComments.value) {
    if (!Number.isFinite(comment.time) || comment.time < 0) continue;
    const index = Math.max(0, Math.min(binCount - 1, Math.floor((comment.time / durationSec) * binCount)));
    counts[index] += comment.count ?? 1;
  }
  const max = Math.max(...counts, 1);
  return counts.map((count, index) => ({
    left: `${(index / binCount) * 100}%`,
    width: `${100 / binCount}%`,
    opacity: count > 0 ? 0.18 + (count / max) * 0.58 : 0,
    height: `${Math.max(2, Math.round(3 + (count / max) * 9))}px`,
  }));
});
const danmakuStatusLabel = computed(() => {
  if (danmakuLoading.value) return "加载中";
  return danmakuEnabled.value ? "开启" : "关闭";
});
const danmakuProviderLabel = computed(() => danmakuProvider.value ?? "未加载");
const danmakuCountLabel = computed(() => {
  if (danmakuLoading.value) return "加载中";
  if (danmakuRawCount.value === 0) return "0 条";
  if (danmakuMergedAway.value > 0) {
    return `${danmakuComments.value.length} 组 / ${danmakuRawCount.value} 条`;
  }
  return `${danmakuRawCount.value} 条`;
});
const htmlVideoStyle = computed<CSSProperties>(() => {
  const mode = pictureMode.value;
  const objectFit: CSSProperties["objectFit"] =
    mode === "stretch" ? "fill" : mode === "fill" ? "cover" : "contain";
  return {
    objectFit,
    transform: mode === "autocrop" ? "scale(1.16)" : "scale(1)",
  };
});
const networkSamples = ref<number[]>(Array.from({ length: 12 }, () => 0));

const allTracks = computed(() => (useHtmlVideo ? htmlTracks.value : player.snapshot?.tracks ?? []));
const audioTracks = computed(() => allTracks.value.filter((t) => t.kind === "audio"));
const subTracks = computed(() => allTracks.value.filter((t) => t.kind === "subtitle"));
const chapters = computed(() => (useHtmlVideo ? [] : player.snapshot?.chapters ?? []));
const activeChapterIndex = computed(() => player.snapshot?.chapter ?? null);
const activeChapter = computed(() =>
  chapters.value.find((chapter) => chapter.index === activeChapterIndex.value) ?? null,
);
const activeAudioTrack = computed(() => audioTracks.value.find((track) => track.selected) ?? null);
const activeSubtitleTrack = computed(() => subTracks.value.find((track) => track.selected) ?? null);
const videoTracks = computed(() => allTracks.value.filter((t) => t.kind === "video"));
const activeVideoTrack = computed(() =>
  videoTracks.value.find((track) => track.selected) ?? videoTracks.value[0] ?? null,
);
const playbackLineOptions = computed<PlaybackLineOption[]>(() => {
  const fromSource = player.playbackSource?.lines ?? [];
  if (fromSource.length > 0) return fromSource;
  return (
    activeServer.value?.lines.map((line) => ({
      id: line.id,
      name: line.name,
      baseUrl: line.baseUrl,
      enabled: line.enabled,
      status: line.lastStatus,
      latencyMs: line.lastLatencyMs,
      selected: line.id === activeServer.value?.activeLineId,
    })) ?? []
  );
});
const playbackMediaSources = computed<PlaybackMediaSource[]>(
  () => player.playbackSource?.mediaSources ?? [],
);
const selectedPlaybackLineId = computed(
  () =>
    player.playbackSource?.lineId ??
    playbackLineOptions.value.find((line) => line.selected)?.id ??
    activeServer.value?.activeLineId ??
    null,
);
const selectedPlaybackMediaSourceId = computed(
  () =>
    player.playbackSource?.mediaSourceId ??
    playbackMediaSources.value.find((source) => source.selected)?.id ??
    null,
);
const hasPlaybackSwitchOptions = computed(
  () =>
    playbackLineOptions.value.filter((line) => line.enabled).length > 1 ||
    playbackMediaSources.value.length > 1,
);
const statsNativePage = computed(
  () => statsPageOptions.find((page) => page.value === statsPage.value)?.nativePage ?? 1,
);
const statsSummaryRows = computed<StatsRow[]>(() => [
  { label: "时间", value: `${fmt(positionMs.value)} / ${fmt(durationMs.value)}` },
  { label: "进度", value: `${progressPct.value.toFixed(1)}%` },
  { label: "速度", value: `${speed.value.toFixed(2)}x` },
  { label: "音量", value: muted.value ? "静音" : `${Math.round(volumeLevel.value)}%` },
  { label: "缓存", value: `${fmt(bufferedMs.value)} · ${buffering.value ? "缓冲中" : "稳定"}` },
  { label: "网络", value: fmtNetwork(networkBps.value) },
  { label: "音轨", value: activeAudioTrack.value ? trackLabel(activeAudioTrack.value) : "默认" },
  { label: "字幕", value: activeSubtitleTrack.value ? trackLabel(activeSubtitleTrack.value) : "关闭" },
  { label: "章节", value: activeChapter.value ? chapterLabel(activeChapter.value) : "无" },
  { label: "轨道", value: `${allTracks.value.length} 条` },
]);
const statsVideoRows = computed<StatsRow[]>(() => {
  const snapshot = player.snapshot;
  const params = snapshot?.videoParams ?? null;
  return [
    { label: "视频轨", value: activeVideoTrack.value ? trackLabel(activeVideoTrack.value) : "无" },
    { label: "解码器", value: valueOrUnknown(snapshot?.videoCodec ?? activeVideoTrack.value?.codec) },
    { label: "硬解", value: valueOrUnknown(snapshot?.hwdecCurrent) },
    { label: "尺寸", value: formatVideoSize(params) },
    { label: "像素格式", value: valueOrUnknown(params?.pixelformat ?? params?.["hw-pixelformat"]) },
    { label: "容器 FPS", value: formatFps(snapshot?.containerFps) },
    { label: "渲染 FPS", value: formatFps(snapshot?.estimatedVfFps) },
    { label: "视频码率", value: formatBitrate(snapshot?.videoBitrate) },
    { label: "丢帧", value: formatDropCounts(snapshot) },
  ];
});
const statsAudioRows = computed<StatsRow[]>(() => {
  const snapshot = player.snapshot;
  const params = snapshot?.audioParams ?? null;
  return [
    { label: "音轨", value: activeAudioTrack.value ? trackLabel(activeAudioTrack.value) : "无" },
    { label: "解码器", value: valueOrUnknown(snapshot?.audioCodec ?? activeAudioTrack.value?.codec) },
    { label: "采样率", value: formatSampleRate(params?.samplerate) },
    { label: "声道", value: formatAudioChannels(params) },
    { label: "格式", value: valueOrUnknown(params?.format) },
    { label: "音频码率", value: formatBitrate(snapshot?.audioBitrate) },
    { label: "音量", value: muted.value ? "静音" : `${Math.round(volumeLevel.value)}%` },
    { label: "速度", value: `${speed.value.toFixed(2)}x` },
  ];
});
const statsTrackRows = computed<StatsRow[]>(() => {
  if (allTracks.value.length === 0) return [{ label: "轨道", value: "暂无轨道" }];
  return allTracks.value.map((track) => ({
    label: `${trackKindLabel(track.kind)} #${track.id}`,
    value: trackDetailLabel(track),
  }));
});
const statsRows = computed<StatsRow[]>(() => {
  if (statsPage.value === "video") return statsVideoRows.value;
  if (statsPage.value === "audio") return statsAudioRows.value;
  if (statsPage.value === "tracks") return statsTrackRows.value;
  return statsSummaryRows.value;
});
const queueEntries = computed<PlayerQueueEntry[]>(() => {
  if (isDirectQueue.value) {
    return player.directQueue.map((entry, index) => ({
      id: entry.url,
      index,
      item: null,
      direct: entry,
      active: index === player.queueIndex,
    }));
  }

  return player.queue.map((id, index) => ({
    id,
    index,
      item: lib.cachedItem(id, auth.activeId),
    direct: null,
    active: index === player.queueIndex,
  }));
});

const progressPct = computed(() => {
  if (!durationMs.value) return 0;
  return Math.max(0, Math.min(100, (positionMs.value / durationMs.value) * 100));
});
const bufferedPct = computed(() => {
  if (!durationMs.value) return progressPct.value;
  const bufferedEnd = positionMs.value + Math.max(0, bufferedMs.value);
  return Math.max(progressPct.value, Math.min(100, (bufferedEnd / durationMs.value) * 100));
});

const isScrubbing = ref(false);
const scrubPct = ref(0);
watch(progressPct, (v) => {
  if (!isScrubbing.value) scrubPct.value = v;
});

watch(networkBps, (value) => {
  if (!showNetworkSpeed.value) return;
  const sample = Number.isFinite(value ?? NaN) ? Math.max(0, value ?? 0) : 0;
  networkSamples.value = [...networkSamples.value.slice(-11), sample];
});

watch(
  () => settings.settings.statsOverlayMode,
  (mode) => {
    if (mode === "mpv-osd") statsOpen.value = false;
  },
);

watch(
  currentItemId,
  (id) => {
    if (props.id === "local-file" || props.id === "webdav-file") return;
    if (id && !lib.cachedItem(id, auth.activeId)) {
      void lib.loadItem(id, auth.activeId).catch(() => {});
    }
  },
  { immediate: true },
);

watch(currentItemId, (id, oldId) => {
  if (!oldId || id === oldId) return;
  introSkipAppliedItemId = null;
  outroSkipAppliedItemId = null;
  closePlayerPanels();
  resetDanmakuState();
});

watch(() => player.localFilePath, (filePath, oldFilePath) => {
  if (!filePath || filePath === oldFilePath) return;
  resetDanmakuState();
  void autoImportLocalDanmakuXml(filePath);
  if (props.id === "local-file" && routeLocalFilePath.value !== filePath) {
    const query: LocationQueryRaw = { ...route.query, file: filePath };
    delete query.start;
    router.replace({ name: "player", params: { id: "local-file" }, query }).catch(() => {});
  }
});

watch(() => player.directUrl, (url, oldUrl) => {
  if (!url || url === oldUrl) return;
  resetDanmakuState();
  void autoImportWebDavDanmaku(currentDirectQueueEntry());
});

watch(episodeMenuOpen, (open) => {
  if (open) void ensureQueueItems();
});

watch(
  () => player.snapshot?.eof ?? false,
  (eof) => {
    if (!isLocalQueue.value) {
      localQueueEofHandled = false;
      return;
    }
    if (!eof) {
      localQueueEofHandled = false;
      return;
    }
    if (localQueueEofHandled || player.queueIndex + 1 >= player.queue.length) return;
    localQueueEofHandled = true;
    void playNextTrack();
  },
);

watch(
  () => settings.settings.blackoutOtherDisplays,
  () => {
    void syncSecondaryDisplayBlackout();
  },
);

watch(
  [
    currentItemId,
    positionMs,
    durationMs,
    skipIntroOutroEnabled,
    () => settings.settings.skipIntroSeconds,
    () => settings.settings.skipOutroSeconds,
  ],
  () => {
    void maybeAutoSkipIntroOutro();
  },
);

function fmt(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}
function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function fmtNetwork(bytesPerSecond: number | null): string {
  const bps = bytesPerSecond ?? 0;
  if (!Number.isFinite(bps) || bps <= 0) return "0.0 MB/s";
  const mib = bps / 1024 / 1024;
  if (mib >= 1) return `${mib >= 10 ? mib.toFixed(0) : mib.toFixed(1)} MB/s`;
  return `${Math.max(1, Math.round(bps / 1024))} KB/s`;
}

function formatBytes(bytes?: number | null): string | null {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  const gib = value / 1024 / 1024 / 1024;
  if (gib >= 1) return `${gib >= 10 ? gib.toFixed(0) : gib.toFixed(1)} GB`;
  const mib = value / 1024 / 1024;
  return `${Math.max(1, Math.round(mib))} MB`;
}

function mediaSourceMeta(source: PlaybackMediaSource): string {
  const resolution = source.width && source.height ? `${source.width}×${source.height}` : null;
  const bitrate = source.bitrate ? formatBitrate(source.bitrate) : null;
  return [
    mediaSourceCapabilityLabel(source),
    resolution,
    source.videoCodec,
    source.audioCodec,
    source.container?.toUpperCase(),
    bitrate,
    formatBytes(source.size),
  ]
    .filter(Boolean)
    .join(" · ") || "PlaybackInfo";
}

function canUsePlaybackMediaSource(source: PlaybackMediaSource): boolean {
  return source.supportsDirectPlay === true || source.supportsDirectStream === true;
}

function mediaSourceCapabilityLabel(source: PlaybackMediaSource): string {
  if (source.playMethod === "DirectPlay" || source.supportsDirectPlay === true) return "本机直连";
  if (source.playMethod === "DirectStream" || source.supportsDirectStream === true) return "本机直流";
  if (!canUsePlaybackMediaSource(source) && source.supportsTranscoding) {
    return "仅服务端转码";
  }
  return "未确认本机解码";
}

function playbackReportMethod(): "DirectPlay" | "DirectStream" {
  return player.playbackSource?.playMethod === "DirectStream" ? "DirectStream" : "DirectPlay";
}

function lineMeta(line: PlaybackLineOption): string {
  if (!line.enabled) return "已停用";
  const parts = [
    line.status && line.status !== "unknown" ? line.status : null,
    formatLatencyMs(line.latencyMs),
  ].filter(Boolean);
  return parts.join(" · ") || "可用";
}

function valueOrUnknown(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "未上报";
}

function formatFps(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "未上报";
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(2)} fps`;
}

function formatBitrate(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "未上报";
  const mbps = value / 1000 / 1000;
  if (mbps >= 1) return `${mbps >= 10 ? mbps.toFixed(0) : mbps.toFixed(1)} Mbps`;
  return `${Math.round(value / 1000)} Kbps`;
}

function formatSampleRate(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "未上报";
  return `${(value / 1000).toFixed(value >= 100000 ? 0 : 1)} kHz`;
}

function formatVideoSize(params: MpvSnapshot["videoParams"]): string {
  const width = params?.dw ?? params?.w;
  const height = params?.dh ?? params?.h;
  if (!width || !height) return "未上报";
  return `${Math.round(width)} x ${Math.round(height)}`;
}

function formatAudioChannels(params: MpvSnapshot["audioParams"]): string {
  return valueOrUnknown(
    params?.["hr-channels"] ?? params?.channels ?? params?.["channel-count"],
  );
}

function formatDropCounts(snapshot: MpvSnapshot | null | undefined): string {
  const decoder = snapshot?.decoderFrameDropCount ?? 0;
  const vo = snapshot?.voFrameDropCount ?? 0;
  const total = snapshot?.frameDropCount ?? decoder + vo;
  if (![decoder, vo, total].some((value) => Number.isFinite(value) && value > 0)) return "0";
  return `总 ${Math.round(total)} · 解码 ${Math.round(decoder)} · 输出 ${Math.round(vo)}`;
}

function trackKindLabel(kind: MpvTrackInfo["kind"]): string {
  if (kind === "video") return "视频";
  if (kind === "audio") return "音频";
  return "字幕";
}

function trackLabel(track: MpvTrackInfo): string {
  return [
    track.title,
    track.lang,
    `#${track.id}`,
  ].filter(Boolean).join(" · ");
}

function trackDetailLabel(track: MpvTrackInfo): string {
  const flags = [
    track.selected ? "当前" : null,
    track.defaultTrack ? "默认" : null,
    track.forced ? "强制" : null,
    track.external ? "外部" : null,
  ].filter(Boolean);
  return [
    track.title,
    track.lang,
    track.codec,
    flags.length > 0 ? flags.join("/") : null,
  ].filter(Boolean).join(" · ") || "未命名";
}

function chapterLabel(chapter: { index: number; title?: string | null; timeMs: number }): string {
  return chapter.title?.trim() || `章节 ${chapter.index + 1}`;
}

function networkBarHeight(value: number): string {
  const max = Math.max(...networkSamples.value, 1);
  const px = Math.round((value / max) * 14);
  return `${Math.max(3, px)}px`;
}

async function maybeAutoSkipIntroOutro() {
  if (!skipIntroOutroEnabled.value || paused.value) return;
  if (isLocalFilePlayback.value || isDirectUrlPlayback.value) return;
  const itemId = currentItemId.value;
  const duration = durationMs.value;
  const position = positionMs.value;
  if (!itemId || duration <= 0 || position < 0) return;

  const introMs = Math.max(0, Math.min(600, settings.settings.skipIntroSeconds)) * 1000;
  if (
    introMs > 0 &&
    introSkipAppliedItemId !== itemId &&
    position <= 5_000 &&
    duration > introMs + 60_000
  ) {
    introSkipAppliedItemId = itemId;
    await seekToMs(introMs);
    return;
  }

  const outroMs = Math.max(0, Math.min(600, settings.settings.skipOutroSeconds)) * 1000;
  if (
    outroMs > 0 &&
    outroSkipAppliedItemId !== itemId &&
    duration > outroMs + 60_000 &&
    duration - position <= outroMs &&
    player.queueIndex >= 0 &&
    player.queueIndex + 1 < player.queue.length
  ) {
    outroSkipAppliedItemId = itemId;
    await player.nextTrack();
  }
}

function syncHtmlVideoState() {
  const video = videoEl.value;
  if (!video) return;
  htmlPositionMs.value = Math.max(0, Math.floor(video.currentTime * 1000));
  if (Number.isFinite(video.duration) && video.duration > 0) {
    htmlDurationMs.value = Math.floor(video.duration * 1000);
  }
  htmlPaused.value = video.paused;
  htmlSpeed.value = video.playbackRate;
  htmlVolume.value = Math.round(video.volume * 100);
  htmlMuted.value = video.muted;
  let bufferedEnd = 0;
  const current = video.currentTime;
  for (let i = 0; i < video.buffered.length; i += 1) {
    const start = video.buffered.start(i);
    const end = video.buffered.end(i);
    if (current >= start && current <= end) {
      bufferedEnd = Math.max(bufferedEnd, end);
    }
  }
  htmlBufferedMs.value = Math.max(0, Math.floor((bufferedEnd - current) * 1000));
  htmlBuffering.value = !video.paused && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA;
}

function destroyHtmlPlayback() {
  stopHtmlProgressReporter();
  hls?.destroy();
  hls = null;
  const video = videoEl.value;
  if (!video) return;
  video.pause();
  video.removeAttribute("src");
  video.load();
  htmlHasFrame.value = false;
  htmlPositionMs.value = 0;
  htmlNetworkBps.value = null;
  htmlBufferedMs.value = 0;
  htmlBuffering.value = false;
}

function applyPlaybackHeaders(xhr: XMLHttpRequest, headers?: [string, string][]) {
  for (const [name, value] of headers ?? []) {
    try {
      xhr.setRequestHeader(name, value);
    } catch {
      // Chromium blocks a few protected headers; keep loading with the rest.
    }
  }
}

function stopHtmlProgressReporter() {
  if (htmlProgressTimer != null) {
    window.clearInterval(htmlProgressTimer);
    htmlProgressTimer = null;
  }
}

function reportHtmlProgress(stopped = false) {
  const activeItemId = player.itemId;
  const activeSessionId = player.playSessionId;
  if (!activeItemId || !activeSessionId) return;
  const positionTicks = Math.max(0, Math.floor(positionMs.value * 10_000));
  if (stopped) {
    void api.reportPlaybackStopped({
      itemId: activeItemId,
      playSessionId: activeSessionId,
      positionTicks,
    }).catch(() => {});
    return;
  }
  void api.reportPlaybackProgress({
    itemId: activeItemId,
    playSessionId: activeSessionId,
    positionTicks,
    isPaused: paused.value,
    playMethod: playbackReportMethod(),
    volumeLevel: htmlVolume.value,
  }).catch(() => {});
}

function startHtmlProgressReporter() {
  stopHtmlProgressReporter();
  htmlProgressTimer = window.setInterval(() => reportHtmlProgress(false), 10_000);
}

async function startHtmlPlayback(
  itemId: string,
  startMs = 0,
  options: { lineId?: string | null; mediaSourceId?: string | null } = {},
) {
  const video = videoEl.value;
  if (!video) throw new Error("播放器尚未初始化");

  if (!lib.cachedItem(itemId, auth.activeId)) {
    await lib.loadItem(itemId, auth.activeId);
  }

  const source = await api.getPlaybackSource({
    itemId,
    startMs,
    lineId: options.lineId ?? null,
    mediaSourceId: options.mediaSourceId ?? null,
  });
  destroyHtmlPlayback();
  player.itemId = itemId;
  player.playSessionId = source.playSessionId;
  player.playbackSource = source;
  player.localFilePath = null;
  player.localFileTitle = null;
  htmlTracks.value = source.tracks ?? [];
  htmlDurationMs.value = source.durationMs ?? 0;
  htmlPaused.value = true;
  htmlSpeed.value = 1;
  pendingStartSeconds = startMs > 0 ? startMs / 1000 : null;

  video.volume = Math.max(0, Math.min(1, htmlVolume.value / 100));
  video.muted = htmlMuted.value;
  video.playbackRate = htmlSpeed.value;

  if (Hls.isSupported() && source.streamUrl.includes(".m3u8")) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      maxBufferLength: 60,
      backBufferLength: 30,
      xhrSetup: (xhr) => applyPlaybackHeaders(xhr, source.headers),
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      errorText.value = `HLS ${data.type}: ${data.details}`;
      showControls.value = true;
    });
    hls.on(Hls.Events.FRAG_LOADED, (_event, data) => {
      const stats = (data.part?.stats ?? data.frag.stats) as unknown as {
        loaded?: number;
        loading?: { start?: number; end?: number };
        trequest?: number;
        tload?: number;
      };
      const loaded = Number(stats.loaded ?? 0);
      const start = Number(stats.loading?.start ?? stats.trequest ?? 0);
      const end = Number(stats.loading?.end ?? stats.tload ?? 0);
      const elapsed = Math.max(1, end - start);
      if (loaded > 0 && Number.isFinite(elapsed)) {
        htmlNetworkBps.value = Math.round((loaded * 1000) / elapsed);
      }
    });
    hls.loadSource(source.streamUrl);
    hls.attachMedia(video);
  } else {
    video.src = source.streamUrl;
  }

  try {
    await video.play();
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== "NotAllowedError") {
      throw error;
    }
    htmlPaused.value = true;
    showControls.value = true;
  }
  startHtmlProgressReporter();
  reportHtmlProgress(false);
  bumpControls();
}

async function startDirectHtmlPlayback(startMs = 0) {
  const video = videoEl.value;
  if (!video) throw new Error("播放器尚未初始化");
  if (!player.directUrl) throw new Error("缺少直链播放地址");

  destroyHtmlPlayback();
  htmlTracks.value = [];
  htmlDurationMs.value = 0;
  htmlPaused.value = true;
  pendingStartSeconds = startMs > 0 ? startMs / 1000 : null;

  video.src = player.directUrl;
  video.volume = Math.max(0, Math.min(1, htmlVolume.value / 100));
  video.muted = htmlMuted.value;
  video.playbackRate = htmlSpeed.value;

  try {
    await video.play();
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== "NotAllowedError") {
      throw error;
    }
    htmlPaused.value = true;
    showControls.value = true;
  }
}

function onVideoLoadedMetadata() {
  const video = videoEl.value;
  if (!video) return;
  if (pendingStartSeconds != null && Number.isFinite(video.duration)) {
    video.currentTime = Math.min(Math.max(0, pendingStartSeconds), Math.max(0, video.duration - 1));
    pendingStartSeconds = null;
  }
  syncHtmlVideoState();
}

function onVideoFrame() {
  htmlHasFrame.value = true;
  syncHtmlVideoState();
}

function onVideoError() {
  const video = videoEl.value;
  const message = video?.error?.message || "视频解码或网络加载失败";
  errorText.value = message;
  showControls.value = true;
}

function onVideoEnded() {
  syncHtmlVideoState();
  reportHtmlProgress(true);
  if (player.queue.length > 0 && player.queueIndex + 1 < player.queue.length) {
    void playNextTrack();
  }
}

function queueTitle(entry: PlayerQueueEntry): string {
  if (isLocalQueue.value) return fileNameFromPath(entry.id);
  if (entry.direct) return entry.direct.title || fileNameFromPath(entry.direct.url);
  const media = entry.item;
  if (!media) return `第 ${entry.index + 1} 集`;
  const year = media.ProductionYear ? ` (${media.ProductionYear})` : "";
  if (media.Type === "Episode") {
    const season = media.ParentIndexNumber != null ? String(media.ParentIndexNumber).padStart(2, "0") : "?";
    const episode = media.IndexNumber != null ? String(media.IndexNumber).padStart(2, "0") : "?";
    return `S${season}E${episode} · ${media.Name}${year}`;
  }
  return `${media.Name}${year}`;
}

function queueSubtitle(entry: PlayerQueueEntry): string {
  if (isLocalQueue.value) return entry.active ? "正在播放" : "本地文件";
  if (entry.direct) return entry.active ? "正在播放" : (entry.direct.sourceLabel ?? "WebDAV");
  const media = entry.item;
  if (!media) return entry.active ? "正在播放" : "";
  const parts = [media.SeriesName].filter(Boolean);
  return parts.join(" · ");
}

function clearControlsHideTimer() {
  if (hideTimer != null) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function clearLongPressSpeedTimer() {
  if (longPressSpeedTimer != null) {
    window.clearTimeout(longPressSpeedTimer);
    longPressSpeedTimer = null;
  }
}

function isLongPressSpeedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !target.closest(
    [
      "button",
      "input",
      "select",
      "a",
      ".player__top",
      ".player__bottom",
      ".player__hint",
      ".player__error",
      ".popup-menu",
      ".stats-panel",
    ].join(","),
  );
}

async function activateLongPressSpeed() {
  longPressSpeedTimer = null;
  if (longPressSpeedActive.value || paused.value) return;
  longPressRestoreSpeed = speed.value;
  longPressSpeedActive.value = true;
  try {
    await setSpeed(2);
  } catch (error) {
    longPressSpeedActive.value = false;
    longPressRestoreSpeed = null;
    errorText.value = error instanceof Error ? error.message : String(error);
    showControls.value = true;
  }
}

async function stopLongPressSpeed(pointerId?: number) {
  if (pointerId != null && longPressPointerId != null && pointerId !== longPressPointerId) return;
  clearLongPressSpeedTimer();
  longPressPointerId = null;
  longPressStart = null;
  if (!longPressSpeedActive.value) {
    longPressRestoreSpeed = null;
    return;
  }
  const restoreSpeed = longPressRestoreSpeed ?? 1;
  longPressSpeedActive.value = false;
  longPressRestoreSpeed = null;
  if (Math.abs(speed.value - restoreSpeed) < 0.01) return;
  await setSpeed(restoreSpeed).catch((error) => {
    errorText.value = error instanceof Error ? error.message : String(error);
    showControls.value = true;
  });
}

function onPlayerPointerDown(event: PointerEvent) {
  if (event.button !== 0 || paused.value || !isLongPressSpeedTarget(event.target)) return;
  clearLongPressSpeedTimer();
  longPressPointerId = event.pointerId;
  longPressStart = { x: event.clientX, y: event.clientY };
  try {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture is best-effort; pointerup/cancel still restores the speed.
  }
  longPressSpeedTimer = window.setTimeout(() => {
    void activateLongPressSpeed();
  }, 420);
}

function onPlayerPointerMove(event: PointerEvent) {
  if (longPressPointerId == null || event.pointerId !== longPressPointerId || !longPressStart) return;
  const moved = Math.hypot(event.clientX - longPressStart.x, event.clientY - longPressStart.y);
  if (moved > 18 && !longPressSpeedActive.value) {
    clearLongPressSpeedTimer();
  }
}

function bumpControls() {
  showControls.value = true;
  scheduleEmbedRectLayoutSync();
  if (embedVideo) return;
  clearControlsHideTimer();
  hideTimer = window.setTimeout(() => {
    if (!hasOpenPlayerPanel()) showControls.value = false;
  }, 3200);
}

async function onScrubInput(e: Event) {
  isScrubbing.value = true;
  scrubPct.value = Number((e.target as HTMLInputElement).value);
}

async function onScrubCommit(e: Event) {
  const value = Number((e.target as HTMLInputElement).value);
  isScrubbing.value = false;
  if (!durationMs.value) return;
  const target = Math.floor((durationMs.value * value) / 100);
  await seekToMs(target);
  bumpControls();
}

async function togglePlay() {
  if (useHtmlVideo) {
    const video = videoEl.value;
    if (!video) return;
    if (video.paused) await playHtmlVideoFromUserAction(video);
    else video.pause();
    syncHtmlVideoState();
  } else if (paused.value) await player.resume();
  else await player.pause();
  bumpControls();
}

async function playHtmlVideoFromUserAction(video: HTMLVideoElement) {
  try {
    await video.play();
    errorText.value = null;
    return;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError" && !video.muted) {
      video.muted = true;
      htmlMuted.value = true;
      try {
        await video.play();
        errorText.value = null;
        return;
      } catch (retryError) {
        error = retryError;
      }
    }
    errorText.value = error instanceof Error ? error.message : String(error);
    showControls.value = true;
  }
}

async function ensureQueueItems() {
  if (isLocalQueue.value || isDirectQueue.value) return;
  const missing = player.queue.filter((id) => !lib.cachedItem(id, auth.activeId)).slice(0, 30);
  if (missing.length === 0) return;
  queueLoading.value = true;
  try {
    await Promise.allSettled(missing.map((id) => lib.loadItem(id, auth.activeId)));
  } finally {
    queueLoading.value = false;
  }
}

async function playQueueEntry(index: number) {
  if (index === player.queueIndex) {
    episodeMenuOpen.value = false;
    return;
  }
  await playQueueIndex(index);
  episodeMenuOpen.value = false;
  bumpControls();
}

async function jumpToChapter(chapter: { timeMs: number }) {
  await seekToMs(chapter.timeMs);
  chapterMenuOpen.value = false;
  bumpControls();
}

async function playQueueIndex(index: number) {
  if (isLocalQueue.value) {
    const filePath = player.queue[index];
    if (!filePath) return;
    player.queueIndex = index;
    resetDanmakuState();
    await player.playFile({ filePath, title: fileNameFromPath(filePath) });
  } else if (isDirectQueue.value) {
    const entry = player.directQueue[index];
    if (!entry) return;
    player.queueIndex = index;
    resetDanmakuState();
    await player.playDirectEntry(entry);
    if (useHtmlVideo) await startDirectHtmlPlayback(0);
  } else if (useHtmlVideo) {
    const id = player.queue[index];
    if (!id) return;
    player.queueIndex = index;
    await startHtmlPlayback(id, 0);
  } else {
    await player.playQueue(player.queue, index);
  }
  await applyPictureMode();
}

async function playPrevTrack() {
  if (useHtmlVideo) {
    if (player.queueIndex <= 0) return;
    await playQueueIndex(player.queueIndex - 1);
  } else {
    await player.prevTrack();
  }
  await applyPictureMode();
  bumpControls();
}

async function playNextTrack() {
  if (useHtmlVideo) {
    if (player.queueIndex + 1 >= player.queue.length) return;
    await playQueueIndex(player.queueIndex + 1);
  } else {
    await player.nextTrack();
  }
  await applyPictureMode();
  bumpControls();
}

function firstQueryString(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : null;
  return null;
}

function playerReturnRoute(): RouteLocationRaw {
  const folder = firstQueryString(route.query.folder);
  if (isLocalFilePlayback.value) {
    return folder && folder.trim().length > 0
      ? { name: "local-folder", query: { folder } }
      : { name: "home" };
  }

  if (isDirectUrlPlayback.value) {
    const connection = firstQueryString(route.query.connection);
    if (props.id === "alist-file") {
      const alistPath = firstQueryString(route.query.alistPath);
      return {
        name: "alist",
        query: {
          ...(connection ? { connection } : {}),
          ...(alistPath != null ? { path: alistPath } : {}),
        },
      };
    }

    const webdavPath = firstQueryString(route.query.webdavPath);
    return {
      name: "webdav",
      query: {
        ...(connection ? { connection } : {}),
        ...(webdavPath != null ? { path: webdavPath } : {}),
      },
    };
  }

  const from = firstQueryString(route.query.from) || item.value?.SeriesId || props.id;
  return { name: "item-detail", params: { id: from } };
}

async function back() {
  closePlayerPanels();
  showControls.value = true;
  await exitAnyFullscreen().catch(() => {});
  void player.stop();
  await router.push(playerReturnRoute()).catch(() => {});
}

function clampSeekMs(value: number) {
  const target = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  const duration = durationMs.value;
  return duration > 0 ? Math.min(target, duration) : target;
}

async function seekToMs(value: number) {
  const target = clampSeekMs(value);
  if (useHtmlVideo && videoEl.value) {
    const video = videoEl.value;
    const seconds = target / 1000;
    if (typeof video.fastSeek === "function") {
      try {
        video.fastSeek(seconds);
      } catch {
        video.currentTime = seconds;
      }
    } else {
      video.currentTime = seconds;
    }
    htmlPositionMs.value = target;
    syncHtmlVideoState();
    return;
  }
  await player.seek(target);
}

async function nudgeSeek(deltaSec: number) {
  if (!useHtmlVideo) {
    await player.seekRelative(deltaSec * 1000);
    bumpControls();
    return;
  }
  await seekToMs(positionMs.value + deltaSec * 1000);
  bumpControls();
}

async function nudgeVolume(delta: number) {
  const cur = useHtmlVideo ? htmlVolume.value : player.snapshot?.volume ?? 80;
  const next = Math.max(0, Math.min(useHtmlVideo ? 100 : 200, cur + delta));
  if (useHtmlVideo && videoEl.value) {
    videoEl.value.volume = next / 100;
    htmlVolume.value = next;
  } else {
    await player.setVolume(next);
  }
  bumpControls();
}

async function toggleMute() {
  const cur = useHtmlVideo ? htmlMuted.value : player.snapshot?.muted ?? false;
  if (useHtmlVideo && videoEl.value) {
    videoEl.value.muted = !cur;
    htmlMuted.value = !cur;
  } else {
    await player.setMuted(!cur);
  }
  bumpControls();
}

async function nudgeSpeed(delta: number) {
  const next = Math.max(0.25, Math.min(4, speed.value + delta));
  await setSpeed(Number(next.toFixed(2)));
}

async function nudgeSubDelay(deltaMs: number) {
  const cur = player.snapshot?.subDelayMs ?? 0;
  await player.setSubtitleDelay(cur + deltaMs);
}

async function seekToPercent(p: number) {
  if (!durationMs.value) return;
  const target = Math.floor((durationMs.value * p) / 100);
  if (useHtmlVideo && videoEl.value) {
    videoEl.value.currentTime = target / 1000;
    syncHtmlVideoState();
  } else {
    await player.seek(target);
  }
  bumpControls();
}

function activeFullscreenElement(): Element | null {
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function refreshDocumentFullscreen() {
  documentFullscreen.value = Boolean(activeFullscreenElement());
}

async function syncSecondaryDisplayBlackout() {
  const shouldEnable =
    settings.settings.blackoutOtherDisplays &&
    (Boolean(activeFullscreenElement()) || nativeFullscreen.value);
  if (secondaryBlackoutActive.value === shouldEnable) return;

  const seq = ++blackoutSyncSeq;
  try {
    await api.setSecondaryDisplayBlackout(shouldEnable);
    if (seq === blackoutSyncSeq) {
      secondaryBlackoutActive.value = shouldEnable;
    }
  } catch (error) {
    if (seq === blackoutSyncSeq) {
      secondaryBlackoutActive.value = false;
    }
    if (shouldEnable) {
      errorText.value = error instanceof Error ? error.message : String(error);
      showControls.value = true;
    }
  }
}

function onFullscreenChange() {
  refreshDocumentFullscreen();
  void syncSecondaryDisplayBlackout();
  scheduleEmbedRectSync();
}

async function requestDocumentFullscreen(enabled: boolean) {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => void;
  };
  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => void;
  };
  if (!enabled) {
    if (doc.exitFullscreen) void doc.exitFullscreen();
    else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
    return;
  }

  if (root.requestFullscreen) await root.requestFullscreen();
  else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
}

async function toggleFullscreen() {
  refreshDocumentFullscreen();
  const next = documentFullscreen.value || nativeFullscreen.value ? false : true;
  if (embedVideo) {
    try {
      nativeFullscreen.value = await api.setFullscreen(next);
      await syncSecondaryDisplayBlackout();
      scheduleEmbedRectSync();
      return;
    } catch {
      nativeFullscreen.value = false;
    }
  }

  await requestDocumentFullscreen(next);
}

async function exitAnyFullscreen() {
  if (nativeFullscreen.value) {
    try {
      nativeFullscreen.value = await api.setFullscreen(false);
    } catch {
      nativeFullscreen.value = false;
    }
  } else {
    await requestDocumentFullscreen(false);
  }
  await syncSecondaryDisplayBlackout();
}

function handleEscapeShortcut() {
  if (subtitlePanelOpen.value) {
    subtitlePanelOpen.value = false;
  } else if (danmakuMenuOpen.value) {
    danmakuMenuOpen.value = false;
  } else if (chapterMenuOpen.value) {
    chapterMenuOpen.value = false;
  } else if (statsOpen.value) {
    statsOpen.value = false;
  } else if (settingsMenuOpen.value) {
    settingsMenuOpen.value = false;
  } else if (episodeMenuOpen.value) {
    episodeMenuOpen.value = false;
  } else if (
    document.fullscreenElement ||
    (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement ||
    nativeFullscreen.value
  ) {
    void exitAnyFullscreen();
  } else {
    void back();
  }
}

function currentEmbedRect() {
  const el = stageEl.value;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width,
    height,
    scale: window.devicePixelRatio || 1,
  };
}

async function syncEmbedRect() {
  if (!embedVideo) return;
  const rect = currentEmbedRect();
  if (!rect) return;
  const key = `${rect.x}:${rect.y}:${rect.width}:${rect.height}:${rect.scale}`;
  if (key === lastEmbedRectKey) return;
  lastEmbedRectKey = key;
  await api.embedSetRect(rect);
}

function scheduleEmbedRectSync() {
  if (!embedVideo || embedResizeRaf) return;
  embedResizeRaf = window.requestAnimationFrame(() => {
    embedResizeRaf = 0;
    void syncEmbedRect().catch((error) => console.warn(error));
  });
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: number | null = null;
  return new Promise<T>((resolve, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => resolve(value),
      (error) => reject(error),
    ).finally(() => {
      if (timer != null) {
        window.clearTimeout(timer);
        timer = null;
      }
    });
  });
}

async function syncEmbedRectAfterLayout() {
  if (!embedVideo) return;
  await nextTick();
  await nextAnimationFrame();
  await nextAnimationFrame();
  await syncEmbedRect();
}

function scheduleEmbedRectLayoutSync(delayMs = 0) {
  if (!embedVideo) return;
  if (embedLayoutSyncTimer != null) {
    window.clearTimeout(embedLayoutSyncTimer);
    embedLayoutSyncTimer = null;
  }
  embedLayoutSyncTimer = window.setTimeout(() => {
    embedLayoutSyncTimer = null;
    void syncEmbedRectAfterLayout().catch((error) => console.warn(error));
  }, delayMs);
}

async function prepareScreenshotFrame() {
  clearControlsHideTimer();
  closePlayerPanels();
  showControls.value = false;
  await nextTick();
  await nextAnimationFrame();
  await syncEmbedRect();
  await nextAnimationFrame();
}

async function setupEmbeddedVideoHost() {
  if (!embedVideo) return;
  await withTimeout(api.embedAttach(), 8000, "embedded mpv host attach timed out");
  if (typeof ResizeObserver !== "undefined" && stageEl.value) {
    embedResizeObserver = new ResizeObserver(scheduleEmbedRectSync);
    embedResizeObserver.observe(stageEl.value);
  }
  window.addEventListener("resize", scheduleEmbedRectSync, { passive: true });
  scheduleEmbedRectSync();
  await syncEmbedRect();
  await withTimeout(api.embedSetVisible(true), 3000, "embedded mpv host show timed out");
  scheduleEmbedRectLayoutSync();
}

function teardownEmbeddedVideoHost(cleanupTasks: Promise<unknown>[]) {
  if (!embedVideo) return;
  embedResizeObserver?.disconnect();
  embedResizeObserver = null;
  window.removeEventListener("resize", scheduleEmbedRectSync);
  if (embedResizeRaf) {
    window.cancelAnimationFrame(embedResizeRaf);
    embedResizeRaf = 0;
  }
  if (embedLayoutSyncTimer != null) {
    window.clearTimeout(embedLayoutSyncTimer);
    embedLayoutSyncTimer = null;
  }
  lastEmbedRectKey = "";
  cleanupTasks.push(api.embedSetVisible(false), api.embedDetach());
}

watch(showControls, () => scheduleEmbedRectLayoutSync());

const playerShortcutHandlers: Record<PlayerShortcutAction, () => void | Promise<void>> = {
  "toggle-play": togglePlay,
  "seek-back-small": () => nudgeSeek(-10),
  "seek-forward-small": () => nudgeSeek(10),
  "seek-back-large": () => nudgeSeek(-60),
  "seek-forward-large": () => nudgeSeek(60),
  "volume-up": () => nudgeVolume(5),
  "volume-down": () => nudgeVolume(-5),
  "toggle-mute": toggleMute,
  "toggle-fullscreen": toggleFullscreen,
  "retry-playback": () => {
    if (errorText.value) void retryPlayback();
  },
  "toggle-subtitle-panel": () => togglePlayerPanel("subtitle"),
  "cycle-subtitle": () => player.cycleSubtitle(),
  "toggle-danmaku": toggleDanmaku,
  "speed-up": () => nudgeSpeed(0.1),
  "speed-down": () => nudgeSpeed(-0.1),
  "subtitle-delay-down": () => nudgeSubDelay(-100),
  "subtitle-delay-up": () => nudgeSubDelay(100),
  "seek-percent-0": () => seekToPercent(0),
  "seek-percent-10": () => seekToPercent(10),
  "seek-percent-20": () => seekToPercent(20),
  "seek-percent-30": () => seekToPercent(30),
  "seek-percent-40": () => seekToPercent(40),
  "seek-percent-50": () => seekToPercent(50),
  "seek-percent-60": () => seekToPercent(60),
  "seek-percent-70": () => seekToPercent(70),
  "seek-percent-80": () => seekToPercent(80),
  "seek-percent-90": () => seekToPercent(90),
  escape: handleEscapeShortcut,
};

useKeyboard(keyboardBindingsForActions(PLAYER_SHORTCUTS, playerShortcutHandlers));

async function setSpeed(v: number) {
  if (useHtmlVideo && videoEl.value) {
    videoEl.value.playbackRate = v;
    htmlSpeed.value = v;
  } else {
    await player.setSpeed(v);
  }
  bumpControls();
}

async function chooseAudio(id: number) {
  if (useHtmlVideo) return;
  await player.setAudioTrack(id);
  bumpControls();
}
async function chooseSub(id: number | null) {
  if (useHtmlVideo) return;
  await player.setSubtitleTrack(id);
  bumpControls();
}

async function switchPlaybackSource(next: {
  lineId?: string | null;
  mediaSourceId?: string | null;
}) {
  if (playbackSwitching.value) return;
  const lineId = next.lineId ?? selectedPlaybackLineId.value;
  const mediaSourceId = next.mediaSourceId ?? selectedPlaybackMediaSourceId.value;
  if (lineId === selectedPlaybackLineId.value && mediaSourceId === selectedPlaybackMediaSourceId.value) {
    sourceMenuOpen.value = false;
    return;
  }

  playbackSwitching.value = true;
  errorText.value = null;
  showControls.value = true;
  try {
    const startMs = Math.max(0, Math.floor(positionMs.value));
    if (useHtmlVideo) {
      reportHtmlProgress(true);
      await startHtmlPlayback(currentItemId.value, startMs, { lineId, mediaSourceId });
    } else if (player.itemId && player.playSessionId && player.snapshot) {
      await api
        .reportPlaybackStopped({
          itemId: player.itemId,
          playSessionId: player.playSessionId,
          positionTicks: Math.max(0, Math.floor(player.snapshot.positionMs * 10_000)),
        })
        .catch(() => {});
      await player.play({
        itemId: currentItemId.value,
        startMs,
        preferDirect: true,
        lineId,
        mediaSourceId,
      });
    } else {
      await player.play({
        itemId: currentItemId.value,
        startMs,
        preferDirect: true,
        lineId,
        mediaSourceId,
      });
    }
    await applyPictureMode();
    sourceMenuOpen.value = false;
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error);
  } finally {
    playbackSwitching.value = false;
    bumpControls();
  }
}

async function switchPlaybackLine(line: PlaybackLineOption) {
  if (!line.enabled) return;
  await switchPlaybackSource({ lineId: line.id });
}

async function switchPlaybackMediaSource(source: PlaybackMediaSource) {
  if (!canUsePlaybackMediaSource(source)) {
    errorText.value = "该媒体源未明确支持本机直连或本机直流，已阻止切换，避免服务端解码/转码。";
    showControls.value = true;
    return;
  }
  await switchPlaybackSource({ mediaSourceId: source.id });
}

async function applyPictureMode() {
  if (useHtmlVideo) return;
  await player.setPictureMode(pictureMode.value).catch((error) => {
    errorText.value = String(error);
    showControls.value = true;
  });
}

async function setPictureMode(mode: PictureMode) {
  pictureMode.value = mode;
  await applyPictureMode();
  bumpControls();
}

async function openStatsInfo() {
  settingsMenuOpen.value = false;
  if (settings.settings.statsOverlayMode === "mpv-osd") {
    try {
      await api.showMpvStatsOsd(statsNativePage.value);
    } catch (error) {
      errorText.value = error instanceof Error ? error.message : String(error);
      showControls.value = true;
    }
    return;
  }
  openPlayerPanel("stats");
}

async function openExternalPlayer() {
  settingsMenuOpen.value = false;
  try {
    await api.playExternal({
      itemId: currentItemId.value,
      startMs: positionMs.value,
      title: item.value?.Name ?? item.value?.SeriesName ?? null,
    });
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error);
    showControls.value = true;
  }
}

async function toggleAlwaysOnTop() {
  const next = !alwaysOnTop.value;
  try {
    await api.setAlwaysOnTop(next);
    alwaysOnTop.value = next;
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error);
    showControls.value = true;
  }
}

function fileNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
}

function dirNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index > 0 ? filePath.slice(0, index) : filePath;
}

function showScreenshotMessage(message: string, filePath: string | null = null) {
  screenshotMessage.value = message;
  screenshotPath.value = filePath;
  if (screenshotMessageTimer) {
    window.clearTimeout(screenshotMessageTimer);
  }
  screenshotMessageTimer = window.setTimeout(() => {
    screenshotMessage.value = null;
    screenshotPath.value = null;
    screenshotMessageTimer = null;
  }, 4200);
}

async function openScreenshotFolder() {
  if (!screenshotPath.value) return;
  await api.openPath(dirNameFromPath(screenshotPath.value)).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    showScreenshotMessage(`打开目录失败：${message}`);
  });
}

async function copyScreenshotPath() {
  if (!screenshotPath.value) return;
  const filePath = screenshotPath.value;
  try {
    await writeTextToClipboard(filePath);
    showScreenshotMessage("截图路径已复制", filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showScreenshotMessage(`复制失败：${message}`, filePath);
  }
}

function showErrorCopyStatus(message: string) {
  errorCopyStatus.value = message;
  if (errorCopyTimer) {
    window.clearTimeout(errorCopyTimer);
  }
  errorCopyTimer = window.setTimeout(() => {
    errorCopyStatus.value = null;
    errorCopyTimer = null;
  }, 2400);
}

function clearErrorCopyStatus() {
  errorCopyStatus.value = null;
  if (errorCopyTimer) {
    window.clearTimeout(errorCopyTimer);
    errorCopyTimer = null;
  }
}

function formatPlayerErrorDetails(): string {
  const title = displayTitle.value;
  return [
    "Hills Lite player error",
    `Time: ${new Date().toISOString()}`,
    `ItemId: ${currentItemId.value}`,
    `Title: ${title}`,
    player.directUrl ? `Source: ${player.directSourceLabel ?? "Direct URL"}` : null,
    localFilePath.value ? `File: ${localFilePath.value}` : null,
    "",
    errorText.value ?? "",
  ].filter((line): line is string => line != null).join("\n");
}

async function copyPlayerError() {
  if (!errorText.value) return;
  try {
    await writeTextToClipboard(formatPlayerErrorDetails());
    showErrorCopyStatus("错误信息已复制");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showErrorCopyStatus(`复制失败：${message}`);
  }
}

async function startCurrentPlayback() {
  const start = Number(route.query.start ?? 0) || 0;
  const filePath = routeLocalFilePath.value;
  const localId = (route.query.local as string | undefined) ?? null;
  const recordWhilePlaying = route.query.record === "1";
  const stealthWhenRecording = route.query.stealth !== "0";
  const lineId = firstQueryString(route.query.lineId) || null;
  const mediaSourceId = firstQueryString(route.query.mediaSourceId) || null;

  if (filePath) {
    resetDanmakuState();
    await player.playFile({
      filePath,
      startMs: start,
      title: fileNameFromPath(filePath),
    });
  } else if (props.id === "webdav-file" || props.id === "alist-file") {
    if (!player.directUrl || !player.directTitle) {
      throw new Error(props.id === "alist-file" ? "请从 Alist 页面打开一个视频文件" : "请从 WebDAV 页面打开一个视频文件");
    }
    if (useHtmlVideo && videoEl.value) {
      await startDirectHtmlPlayback(start);
    } else {
      await player.refresh();
    }
  } else if (localId) {
    if (!lib.cachedItem(props.id, auth.activeId)) {
      await lib.loadItem(props.id, auth.activeId);
    }
    await api.playLocal(localId, start);
  } else if (useHtmlVideo) {
    if (!lib.cachedItem(props.id, auth.activeId)) {
      await lib.loadItem(props.id, auth.activeId);
    }
    await startHtmlPlayback(props.id, start, { lineId, mediaSourceId });
  } else {
    if (!lib.cachedItem(props.id, auth.activeId)) {
      await lib.loadItem(props.id, auth.activeId);
    }
    await player.play({
      itemId: props.id,
      startMs: start,
      preferDirect: true,
      lineId,
      mediaSourceId,
      recordWhilePlaying,
      stealthWhenRecording,
    });
  }
  await applyPictureMode();
  bumpControls();
}

async function retryPlayback() {
  if (retryingPlayback.value) return;
  retryingPlayback.value = true;
  errorText.value = null;
  clearErrorCopyStatus();
  closePlayerPanels();
  showControls.value = true;
  try {
    await startCurrentPlayback();
  } catch (error) {
    errorText.value = String(error);
    showControls.value = true;
  } finally {
    retryingPlayback.value = false;
  }
}

async function takeScreenshot() {
  if (screenshotBusy.value) return;
  screenshotBusy.value = true;
  try {
    await prepareScreenshotFrame();
    const result = await api.takeScreenshot({
      title: displayTitle.value,
      includeSubtitles: settings.settings.screenshotIncludeSubtitles,
    });
    showScreenshotMessage(`截图已保存：${fileNameFromPath(result.filePath)}`, result.filePath);
    bumpControls();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showScreenshotMessage(`截图失败：${message}`);
    bumpControls();
  } finally {
    screenshotBusy.value = false;
  }
}

onMounted(async () => {
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);
  try {
    await setupEmbeddedVideoHost();
    await startCurrentPlayback();
  } catch (e) {
    errorText.value = String(e);
    showControls.value = true;
  }
});

onBeforeUnmount(async () => {
  document.removeEventListener("fullscreenchange", onFullscreenChange);
  document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
  blackoutSyncSeq += 1;
  clearControlsHideTimer();
  clearLongPressSpeedTimer();
  if (screenshotMessageTimer != null) window.clearTimeout(screenshotMessageTimer);
  clearErrorCopyStatus();
  if (useHtmlVideo) {
    reportHtmlProgress(true);
    destroyHtmlPlayback();
  }
  const cleanupTasks: Promise<unknown>[] = [];
  if (alwaysOnTop.value) cleanupTasks.push(api.setAlwaysOnTop(false));
  if (secondaryBlackoutActive.value || settings.settings.blackoutOtherDisplays) {
    secondaryBlackoutActive.value = false;
    cleanupTasks.push(api.setSecondaryDisplayBlackout(false));
  }
  await player.stop().catch((error) => console.warn(error));
  teardownEmbeddedVideoHost(cleanupTasks);
  await Promise.allSettled(cleanupTasks);
});
</script>

<template>
  <main
    class="player"
    :class="{ 'player--embedded': embedVideo }"
    @mousemove="bumpControls"
    @pointerdown="onPlayerPointerDown"
    @pointermove="onPlayerPointerMove"
    @pointerup="(event) => void stopLongPressSpeed(event.pointerId)"
    @pointercancel="(event) => void stopLongPressSpeed(event.pointerId)"
    @pointerleave="(event) => void stopLongPressSpeed(event.pointerId)"
  >
    <div ref="stageEl" class="player__stage">
      <div
        v-if="backdropUrl && !htmlHasFrame"
        class="player__poster-bg"
        :style="{ backgroundImage: `url(${backdropUrl})` }"
      />
      <div v-if="(backdropUrl || primaryPosterUrl) && !htmlHasFrame" class="player__poster-shade" />
      <div v-if="useHtmlVideo" class="player__video-wrap">
        <video
          ref="videoEl"
          class="player__html-video"
          :class="{ ready: htmlHasFrame }"
          :style="htmlVideoStyle"
          playsinline
          @loadedmetadata="onVideoLoadedMetadata"
          @loadeddata="onVideoFrame"
          @timeupdate="syncHtmlVideoState"
          @progress="syncHtmlVideoState"
          @waiting="syncHtmlVideoState"
          @playing="syncHtmlVideoState"
          @play="syncHtmlVideoState"
          @pause="syncHtmlVideoState"
          @volumechange="syncHtmlVideoState"
          @ratechange="syncHtmlVideoState"
          @ended="onVideoEnded"
          @error="onVideoError"
        />
      </div>
      <div v-if="useHtmlVideo && primaryPosterUrl && !htmlHasFrame" class="player__poster-card">
        <img :src="primaryPosterUrl" :alt="item?.Name ?? ''" />
      </div>

      <DanmakuOverlay
        class="player__danmaku"
        :comments="danmakuComments"
        :position-ms="positionMs"
        :paused="paused"
        :enabled="danmakuEnabled"
        :opacity="danmakuOpacity"
        :speed="danmakuSpeed"
        :font-size="danmakuFontSize"
        :avoid-subtitles="danmakuAvoidSubtitles"
        :bottom-reserve-pct="danmakuBottomReservePct"
      />

      <SubtitlePanel
        :visible="subtitlePanelOpen"
        :default-query="subtitleSearchQuery"
        @close="subtitlePanelOpen = false"
      />

      <transition name="fade">
        <div v-if="screenshotMessage" class="player__hint glass glass-strong">
          <Icon icon="lucide:camera" width="18" />
          <span>{{ screenshotMessage }}</span>
          <button v-if="screenshotPath" type="button" @click="copyScreenshotPath">
            复制路径
          </button>
          <button v-if="screenshotPath" type="button" @click="openScreenshotFolder">
            打开目录
          </button>
        </div>
      </transition>

      <div v-if="errorText" class="player__error glass glass-strong">
        <Icon icon="lucide:triangle-alert" width="22" />
        <h3>操作失败</h3>
        <p>{{ errorText }}</p>
        <div class="player__error-actions">
          <GlassButton variant="primary" :loading="retryingPlayback" @click="retryPlayback">
            重试
          </GlassButton>
          <GlassButton variant="ghost" @click="copyPlayerError">复制错误</GlassButton>
          <GlassButton variant="secondary" @click="back">返回</GlassButton>
        </div>
        <span v-if="errorCopyStatus" class="player__error-status">{{ errorCopyStatus }}</span>
      </div>

      <transition name="fade">
        <div v-if="longPressSpeedActive" class="player__speed-hold" aria-live="polite">
          2.0x
        </div>
      </transition>

      <aside v-if="statsOpen" class="stats-panel glass glass-strong">
        <header>
          <strong>Stats</strong>
          <button type="button" aria-label="关闭" @click="statsOpen = false">
            <Icon icon="lucide:x" width="16" />
          </button>
        </header>
        <div class="stats-panel__tabs" role="tablist" aria-label="Stats 页面">
          <button
            v-for="page in statsPageOptions"
            :key="page.value"
            type="button"
            :class="{ active: statsPage === page.value }"
            @click="statsPage = page.value"
          >
            {{ page.label }}
          </button>
        </div>
        <dl>
          <div v-for="row in statsRows" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>
      </aside>
    </div>

    <transition name="fade">
      <header v-if="showControls" class="player__top">
        <div class="player__top-inner">
          <button class="iconbtn" @click="back" aria-label="返回">
            <Icon icon="lucide:chevron-left" width="22" />
          </button>
          <div class="player__title">
            <h2>{{ displayTitle }}</h2>
            <p v-if="displaySubtitle">{{ displaySubtitle }}</p>
          </div>
          <div class="player__top-right">
            <div v-if="showNetworkSpeed" class="net-meter" title="网络读取速度">
              <Icon icon="lucide:activity" width="14" />
              <span>{{ fmtNetwork(networkBps) }}</span>
              <div class="net-meter__bars" aria-hidden="true">
                <i
                  v-for="(sample, idx) in networkSamples"
                  :key="idx"
                  :style="{ height: networkBarHeight(sample) }"
                />
              </div>
            </div>
            <button
              class="iconbtn"
              :class="{ active: alwaysOnTop }"
              :title="alwaysOnTop ? '取消置顶' : '置顶'"
              @click="toggleAlwaysOnTop"
            >
              <Icon icon="lucide:pin" width="18" />
            </button>
          </div>
        </div>
      </header>
    </transition>

    <transition name="fade">
      <footer v-if="showControls" class="player__bottom">
        <div class="bar">
          <span class="time">{{ fmt(positionMs) }}</span>
          <div class="bar__slider">
            <div class="bar__track" aria-hidden="true">
              <span
                v-for="(bin, index) in danmakuHeatmap"
                :key="index"
                class="bar__heat"
                :style="bin"
              />
              <span class="bar__buffer" :style="{ width: `${bufferedPct}%` }" />
              <span class="bar__fill" :style="{ width: `${isScrubbing ? scrubPct : progressPct}%` }" />
            </div>
            <div v-if="buffering" class="bar__buffering">
              <Icon icon="lucide:loader" width="12" class="spin" />
              <span>缓冲</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="0.05"
              :value="isScrubbing ? scrubPct : progressPct"
              @input="onScrubInput"
              @change="onScrubCommit"
            />
          </div>
          <span class="time">{{ fmt(durationMs) }}</span>
        </div>

        <div class="controls">
          <div class="controls__left">
            <button
              v-if="player.queue.length > 0"
              class="iconbtn"
              data-control="queue-prev"
              data-hide-below="medium"
              :disabled="player.queueIndex <= 0"
              title="上一集"
              @click="playPrevTrack"
            >
              <Icon icon="lucide:skip-back" width="20" />
            </button>
            <button
              class="iconbtn"
              data-control="seek-back"
              title="后退 10 秒"
              @click="nudgeSeek(-10)"
            >
              <Icon icon="lucide:rotate-ccw" width="19" />
            </button>
            <button
              class="iconbtn xl primary"
              data-control="play-toggle"
              :title="paused ? '播放' : '暂停'"
              :aria-label="paused ? '播放' : '暂停'"
              @click="togglePlay"
            >
              <Icon :icon="paused ? 'lucide:play' : 'lucide:pause'" width="26" />
            </button>
            <button
              class="iconbtn"
              data-control="seek-forward"
              title="前进 30 秒"
              @click="nudgeSeek(30)"
            >
              <Icon icon="lucide:rotate-cw" width="19" />
            </button>
            <button
              v-if="player.queue.length > 0"
              class="iconbtn"
              data-control="queue-next"
              data-hide-below="medium"
              :disabled="player.queueIndex + 1 >= player.queue.length"
              title="下一集"
              @click="playNextTrack"
            >
              <Icon icon="lucide:skip-forward" width="20" />
            </button>
            <button
              class="iconbtn"
              data-control="mute-toggle"
              data-hide-below="small"
              title="音量"
              @click="toggleMute"
            >
              <Icon icon="lucide:volume-2" width="20" />
            </button>
          </div>

          <div class="controls__right">
            <select
              class="pill-select"
              data-control="speed"
              data-hide-below="wide"
              :value="speed"
              title="倍速"
              @change="(e: any) => setSpeed(Number(e.target.value))"
            >
              <option :value="0.5">0.5x</option>
              <option :value="0.75">0.75x</option>
              <option :value="1">1.0x</option>
              <option :value="1.25">1.25x</option>
              <option :value="1.5">1.5x</option>
              <option :value="2">2.0x</option>
            </select>

            <button
              class="iconbtn"
              data-control="screenshot"
              data-hide-below="wide"
              :disabled="screenshotBusy"
              :title="screenshotBusy ? '截图中' : '截图'"
              @click="takeScreenshot"
            >
              <Icon
                :icon="screenshotBusy ? 'lucide:loader' : 'lucide:camera'"
                width="18"
                :class="{ spin: screenshotBusy }"
              />
            </button>

            <div
              v-if="hasPlaybackSwitchOptions"
              class="menu-wrap"
              data-control="source"
              :data-hide-below="sourceMenuOpen ? undefined : 'medium'"
            >
              <button
                class="iconbtn"
                :class="{ active: sourceMenuOpen }"
                :disabled="playbackSwitching"
                :title="playbackSwitching ? '切换播放源中' : '播放源'"
                @click="togglePlayerPanel('source')"
              >
                <Icon
                  :icon="playbackSwitching ? 'lucide:loader' : 'lucide:server-cog'"
                  width="18"
                  :class="{ spin: playbackSwitching }"
                />
              </button>
              <div v-if="sourceMenuOpen" class="popup-menu popup-menu--source">
                <div class="popup-section__title">播放线路</div>
                <button
                  v-for="line in playbackLineOptions"
                  :key="line.id"
                  class="popup-option"
                  :class="{ active: line.id === selectedPlaybackLineId }"
                  :disabled="!line.enabled || playbackSwitching"
                  type="button"
                  @click="switchPlaybackLine(line)"
                >
                  <Icon icon="lucide:route" width="15" />
                  <span class="popup-option__text">
                    <strong>{{ line.name }}</strong>
                    <small>{{ lineMeta(line) }}</small>
                  </span>
                  <Icon
                    v-if="line.id === selectedPlaybackLineId"
                    icon="lucide:check"
                    width="14"
                    class="popup-option__check"
                  />
                </button>
                <div v-if="playbackMediaSources.length > 0" class="popup-section">
                  <div class="popup-section__title">媒体源</div>
                  <button
                    v-for="source in playbackMediaSources"
                    :key="source.id"
                    class="popup-option"
                    :class="{
                      active: source.id === selectedPlaybackMediaSourceId,
                      'popup-option--blocked': !canUsePlaybackMediaSource(source),
                    }"
                    :disabled="playbackSwitching || !canUsePlaybackMediaSource(source)"
                    type="button"
                    @click="switchPlaybackMediaSource(source)"
                  >
                    <Icon icon="lucide:file-video-2" width="15" />
                    <span class="popup-option__text">
                      <strong>{{ source.displayName }}</strong>
                      <small>{{ mediaSourceMeta(source) }}</small>
                    </span>
                    <Icon
                      v-if="source.id === selectedPlaybackMediaSourceId"
                      icon="lucide:check"
                      width="14"
                      class="popup-option__check"
                    />
                  </button>
                </div>
              </div>
            </div>

            <div
              v-if="audioTracks.length > 0"
              class="menu-wrap"
              data-control="audio"
              data-hide-below="medium"
            >
              <button class="iconbtn" title="音轨">
                <Icon icon="lucide:music-2" width="18" />
              </button>
              <select
                class="ghost-select"
                :value="audioTracks.find((t) => t.selected)?.id ?? ''"
                @change="(e: any) => chooseAudio(Number(e.target.value))"
              >
                <option v-for="t in audioTracks" :key="t.id" :value="t.id">
                  {{ t.title || t.lang || `音轨 ${t.id}` }}
                </option>
              </select>
            </div>

            <div v-if="subTracks.length > 0" class="menu-wrap" data-control="subtitle">
              <button
                class="iconbtn"
                :class="{ active: subtitlePanelOpen }"
                title="字幕"
                @click="togglePlayerPanel('subtitle')"
              >
                <Icon icon="lucide:captions" width="18" />
              </button>
              <select
                class="ghost-select"
                :value="subTracks.find((t) => t.selected)?.id ?? ''"
                @change="(e: any) => chooseSub(e.target.value === '' ? null : Number(e.target.value))"
              >
                <option value="">关闭</option>
                <option v-for="t in subTracks" :key="t.id" :value="t.id">
                  {{ t.title || t.lang || `字幕 ${t.id}` }}
                </option>
              </select>
            </div>
            <button
              v-else
              class="iconbtn"
              data-control="subtitle"
              :class="{ active: subtitlePanelOpen }"
              title="字幕"
              @click="togglePlayerPanel('subtitle')"
            >
              <Icon icon="lucide:captions" width="18" />
            </button>

            <div class="menu-wrap danmaku-wrap" data-control="danmaku">
              <button
                class="iconbtn danmaku-toggle"
                :class="{ active: danmakuEnabled }"
                title="弹幕"
                @click="toggleDanmaku"
              >
                <Icon
                  :icon="danmakuLoading ? 'lucide:loader' : 'lucide:message-square-text'"
                  width="18"
                  :class="{ spin: danmakuLoading }"
                />
                <span>弹幕</span>
              </button>
              <button
                class="iconbtn danmaku-menu-btn"
                :class="{ active: danmakuMenuOpen }"
                title="弹幕菜单"
                @click="togglePlayerPanel('danmaku')"
              >
                <Icon icon="lucide:chevron-up" width="15" />
              </button>
              <div v-if="danmakuMenuOpen" class="popup-menu popup-menu--danmaku">
                <div class="popup-section__title">弹幕</div>
                <div class="popup-row">
                  <span>状态</span>
                  <strong>{{ danmakuStatusLabel }}</strong>
                </div>
                <div class="popup-row">
                  <span>来源</span>
                  <strong>{{ danmakuProviderLabel }}</strong>
                </div>
                <div class="popup-row">
                  <span>数量</span>
                  <strong>{{ danmakuCountLabel }}</strong>
                </div>
                <button @click="toggleDanmaku">
                  {{ danmakuEnabled ? "关闭弹幕" : "开启弹幕" }}
                </button>
                <button @click="importDanmakuXml">导入 XML</button>
              </div>
            </div>

            <div class="menu-wrap" data-control="settings">
              <button
                class="iconbtn"
                :class="{ active: settingsMenuOpen }"
                title="设置"
                @click="togglePlayerPanel('settings')"
              >
                <Icon icon="lucide:settings" width="18" />
              </button>
              <div v-if="settingsMenuOpen" class="popup-menu">
                <button @click="settingsMenuOpen = false">设置</button>
                <div class="popup-section">
                  <div class="popup-section__title">画面模式</div>
                  <button
                    v-for="option in pictureModeOptions"
                    :key="option.value"
                    class="popup-option"
                    :class="{ active: pictureMode === option.value }"
                    type="button"
                    @click="setPictureMode(option.value)"
                  >
                    <Icon :icon="option.icon" width="15" />
                    <span>{{ option.label }}</span>
                    <Icon
                      v-if="pictureMode === option.value"
                      icon="lucide:check"
                      width="14"
                      class="popup-option__check"
                    />
                  </button>
                </div>
                <label class="popup-row">
                  <span>自动跳过片头/片尾</span>
                  <input
                    type="checkbox"
                    :checked="settings.settings.skipIntroOutroEnabled"
                    @change="(e: any) => settings.update({ skipIntroOutroEnabled: e.target.checked })"
                  />
                </label>
                <label class="popup-row">
                  <span>截图包含字幕</span>
                  <input
                    type="checkbox"
                    :checked="settings.settings.screenshotIncludeSubtitles"
                    @change="
                      (e: any) =>
                        settings.update({ screenshotIncludeSubtitles: e.target.checked })
                    "
                  />
                </label>
                <button v-if="hasPlaybackSwitchOptions" @click="openPlayerPanel('source')">
                  播放源
                </button>
                <button @click="openPlayerPanel('subtitle')">字幕设置</button>
                <button @click="openPlayerPanel('danmaku')">弹幕设置</button>
                <button @click="openExternalPlayer">外部播放器</button>
                <button @click="openStatsInfo">
                  {{ settings.settings.statsOverlayMode === "mpv-osd" ? "mpv Stats OSD" : "统计信息" }}
                </button>
              </div>
            </div>

            <div class="menu-wrap" data-control="chapter" data-hide-below="medium">
              <button
                class="iconbtn"
                :class="{ active: chapterMenuOpen }"
                :disabled="chapters.length === 0"
                :title="chapters.length > 0 ? '章节' : '暂无章节'"
                @click="togglePlayerPanel('chapter')"
              >
                <Icon icon="lucide:book-open" width="18" />
              </button>
              <div v-if="chapterMenuOpen" class="episode-menu chapter-menu">
                <div class="episode-menu__head">
                  <span>章节</span>
                  <span>{{ chapters.length }}</span>
                </div>
                <button
                  v-for="chapter in chapters"
                  :key="chapter.index"
                  class="episode-row chapter-row"
                  :class="{ active: chapter.index === activeChapterIndex }"
                  @click="jumpToChapter(chapter)"
                >
                  <span class="episode-row__index">{{ fmt(chapter.timeMs) }}</span>
                  <span class="episode-row__body">
                    <strong>{{ chapterLabel(chapter) }}</strong>
                  </span>
                  <Icon v-if="chapter.index === activeChapterIndex" icon="lucide:play" width="15" />
                </button>
              </div>
            </div>

            <div class="menu-wrap" data-control="episode">
              <button
                class="iconbtn"
                :class="{ active: episodeMenuOpen }"
                :disabled="player.queue.length === 0"
                :title="player.queue.length > 0 ? '选集' : '暂无选集队列'"
                @click="togglePlayerPanel('episode')"
              >
                <Icon icon="lucide:list-video" width="18" />
              </button>
              <div v-if="episodeMenuOpen" class="episode-menu">
                <div class="episode-menu__head">
                  <span>选集</span>
                  <span>{{ player.queueIndex + 1 }}/{{ player.queue.length }}</span>
                </div>
                <div v-if="queueLoading" class="episode-menu__loading">
                  <Icon icon="lucide:loader" width="16" class="spin" />
                </div>
                <button
                  v-for="entry in queueEntries"
                  :key="entry.id"
                  class="episode-row"
                  :class="{ active: entry.active }"
                  @click="playQueueEntry(entry.index)"
                >
                  <span class="episode-row__index">{{ entry.index + 1 }}</span>
                  <span class="episode-row__body">
                    <strong>{{ queueTitle(entry) }}</strong>
                    <small v-if="queueSubtitle(entry)">{{ queueSubtitle(entry) }}</small>
                  </span>
                  <Icon v-if="entry.active" icon="lucide:volume-2" width="15" />
                </button>
              </div>
            </div>

            <button
              class="iconbtn"
              data-control="fullscreen"
              :title="documentFullscreen || nativeFullscreen ? '退出全屏' : '全屏'"
              @click="toggleFullscreen"
            >
              <Icon :icon="documentFullscreen || nativeFullscreen ? 'lucide:minimize' : 'lucide:maximize'" width="18" />
            </button>
          </div>
        </div>
      </footer>
    </transition>
  </main>
</template>

<style scoped>
.player {
  --player-edge-x: clamp(14px, 2.4vw, 52px);
  --player-bottom-y: clamp(12px, 2vh, 20px);
  width: 100%;
  height: 100%;
  min-height: 0;
  position: relative;
  background: #000;
  color: white;
  overflow: hidden;
}
/* Embedded playback uses a native child window above the webview. Keep the
   app surface opaque so Windows composition cannot leak desktop pixels. */
.player--embedded {
  background: #000;
}
.player__stage {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}
.player__poster-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  filter: blur(18px);
  transform: scale(1.04);
  opacity: 0.52;
}
.player__poster-shade {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at center, rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.7) 72%),
    linear-gradient(180deg, rgba(0, 0, 0, 0.32), rgba(0, 0, 0, 0.72));
}
.player__poster-card {
  position: relative;
  z-index: 1;
  width: clamp(180px, min(22vw, 34vh), 360px);
  aspect-ratio: 2 / 3;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.55);
}
.player__poster-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.player__video {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.player__video-wrap {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: grid;
  place-items: center;
  background: transparent;
}
.player__html-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform-origin: center;
  opacity: 0;
  transition:
    opacity 180ms ease,
    transform 220ms ease;
}
.player__html-video.ready {
  opacity: 1;
}
.player--embedded .player__video {
  background: transparent;
}
.player--embedded .player__stage {
  background: #000;
}
.player__danmaku {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}
.spin {
  animation: spin 800ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.player__loading {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: grid;
  place-items: center;
  gap: 12px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  background: rgba(0, 0, 0, 0.45);
}
.player__hint {
  position: absolute;
  top: clamp(66px, 8vh, 94px);
  right: clamp(14px, 2.4vw, 52px);
  z-index: 9;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: min(520px, calc(100vw - 28px));
  padding: 10px 12px;
  color: var(--fg-primary);
  font-size: 12px;
  border-radius: 8px;
}
.player__hint span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.player__hint button {
  appearance: none;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--fg-primary);
  cursor: pointer;
  flex: 0 0 auto;
  height: 28px;
  padding: 0 9px;
  font-size: 12px;
}
.player__hint button:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.player__speed-hold {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 8;
  transform: translate(-50%, -50%);
  min-width: 92px;
  height: 46px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.48);
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  pointer-events: none;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(14px);
}
.player__error {
  position: absolute;
  inset: 0;
  z-index: 7;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  justify-content: center;
  padding: 26px;
  max-width: 420px;
  max-height: fit-content;
  margin: auto;
  text-align: center;
  border-radius: 18px;
  color: var(--fg-primary);
}
.player__error h3 {
  margin: 4px 0 0;
  font-size: 16px;
}
.player__error p {
  margin: 0;
  color: var(--fg-secondary);
  font-size: 13px;
  max-width: min(640px, 100%);
  max-height: 180px;
  overflow: auto;
  overflow-wrap: anywhere;
}
.player__error-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.player__error-status {
  min-height: 18px;
  color: var(--fg-secondary);
  font-size: 12px;
}

.stats-panel {
  position: absolute;
  top: 72px;
  right: clamp(14px, 2.4vw, 52px);
  z-index: 9;
  width: min(430px, calc(100% - 28px));
  max-height: calc(100% - 148px);
  overflow: auto;
  border-radius: 12px;
  padding: 14px;
  color: var(--fg-primary);
  pointer-events: auto;
}
.stats-panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.stats-panel header strong {
  font-size: 13px;
  letter-spacing: 0;
}
.stats-panel header button {
  width: 30px;
  height: 30px;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--fg-secondary);
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
}
.stats-panel__tabs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 12px;
}
.stats-panel__tabs button {
  min-width: 0;
  height: 28px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 7px;
  color: var(--fg-secondary);
  background: rgba(255, 255, 255, 0.05);
  font-size: 11px;
  cursor: pointer;
}
.stats-panel__tabs button.active {
  color: #fff;
  border-color: rgba(168, 85, 247, 0.55);
  background: rgba(168, 85, 247, 0.32);
}
.stats-panel dl {
  margin: 0;
  display: grid;
  gap: 7px;
}
.stats-panel dl > div {
  min-height: 28px;
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.stats-panel dt,
.stats-panel dd {
  min-width: 0;
  margin: 0;
  font-size: 12px;
}
.stats-panel dt {
  color: var(--fg-tertiary);
}
.stats-panel dd {
  color: var(--fg-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.player__top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  min-height: 56px;
  display: flex;
  align-items: center;
  padding: 0 var(--player-edge-x);
  z-index: 5;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.55), transparent);
}
.player__top-inner {
  width: 100%;
  max-width: 1760px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}
.player__top--always {
  z-index: 8;
  pointer-events: auto;
}
.player__title {
  min-width: 0;
  padding: 0 10px;
}
.player__title h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.player__title p {
  margin: 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.player__top-right {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 8px;
}
.net-meter {
  min-width: 138px;
  height: 32px;
  padding: 0 10px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: rgba(255, 255, 255, 0.88);
  background: rgba(0, 0, 0, 0.34);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(12px);
}
.net-meter span {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.net-meter__bars {
  height: 16px;
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
}
.net-meter__bars i {
  width: 2px;
  border-radius: 999px;
  background: var(--accent);
  opacity: 0.85;
}

.player__bottom {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16px var(--player-edge-x) calc(var(--player-bottom-y) + env(safe-area-inset-bottom, 0px));
  z-index: 8;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.75), transparent);
  pointer-events: auto;
}
.bar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  width: 100%;
  max-width: 1760px;
  margin: 0 auto;
}
.time {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  font-variant-numeric: tabular-nums;
  min-width: 56px;
  text-align: center;
}
.bar__slider {
  position: relative;
  height: 28px;
  display: flex;
  align-items: center;
  min-width: 0;
}
.bar__track {
  position: absolute;
  left: 0;
  right: 0;
  height: 4px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.18);
}
.bar__buffer,
.bar__fill {
  position: absolute;
  inset-block: 0;
  left: 0;
  border-radius: inherit;
}
.bar__heat {
  position: absolute;
  bottom: 0;
  border-radius: 999px 999px 0 0;
  background: #ffd166;
  transform-origin: bottom;
  pointer-events: none;
  z-index: 1;
}
.bar__buffer {
  background: rgba(255, 255, 255, 0.34);
}
.bar__fill {
  background: var(--accent);
}
.bar__buffering {
  position: absolute;
  right: 0;
  top: -22px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.48);
  color: rgba(255, 255, 255, 0.86);
  font-size: 11px;
  pointer-events: none;
}
.bar__slider input[type="range"] {
  position: relative;
  z-index: 1;
  appearance: none;
  background: transparent;
  width: 100%;
  height: 28px;
  margin: 0;
}
.bar__slider input[type="range"]::-webkit-slider-runnable-track {
  height: 4px;
  background: transparent;
}
.bar__slider input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 13px;
  height: 13px;
  margin-top: -4.5px;
  border-radius: 999px;
  background: white;
  border: 2px solid var(--accent);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}
.bar__slider input[type="range"]::-moz-range-track {
  height: 4px;
  background: transparent;
}
.bar__slider input[type="range"]::-moz-range-thumb {
  width: 13px;
  height: 13px;
  border-radius: 999px;
  background: white;
  border: 2px solid var(--accent);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}
.controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  max-width: 1760px;
  margin: 0 auto;
}
.controls__left,
.controls__right {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.controls__right {
  justify-content: flex-end;
  min-width: 0;
}
[data-control] {
  flex: 0 0 auto;
}
.menu-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.ghost-select {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.popup-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  min-width: 200px;
  padding: 6px;
  border-radius: 12px;
  background: rgba(28, 28, 32, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 10;
}
.popup-menu--danmaku {
  min-width: 216px;
}
.popup-menu--source {
  width: min(360px, calc(100vw - 32px));
  max-height: min(52vh, 430px);
  overflow-y: auto;
}
.episode-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  width: min(360px, calc(100vw - 32px));
  max-height: min(52vh, 420px);
  padding: 8px;
  border-radius: 12px;
  background: rgba(28, 28, 32, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  z-index: 10;
}
.episode-menu__head {
  display: flex;
  justify-content: space-between;
  padding: 6px 8px 8px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 12px;
}
.episode-menu__loading {
  display: flex;
  justify-content: center;
  padding: 10px;
  color: rgba(255, 255, 255, 0.72);
}
.chapter-menu {
  width: min(420px, calc(100vw - 32px));
}
.episode-row {
  appearance: none;
  border: none;
  width: 100%;
  min-height: 48px;
  padding: 8px;
  border-radius: 9px;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 8px;
  background: transparent;
  color: white;
  text-align: left;
  cursor: pointer;
}
.episode-row:hover {
  background: rgba(255, 255, 255, 0.08);
}
.episode-row.active {
  background: var(--accent-soft);
  color: var(--accent-hover);
}
.episode-row__index {
  width: 24px;
  color: rgba(255, 255, 255, 0.52);
  font-size: 12px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.chapter-row {
  grid-template-columns: 56px minmax(0, 1fr) 18px;
}
.chapter-row .episode-row__index {
  width: 54px;
}
.episode-row__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.episode-row__body strong {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.episode-row__body small {
  color: rgba(255, 255, 255, 0.58);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.popup-menu button {
  appearance: none;
  border: none;
  background: transparent;
  color: white;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}
.popup-menu button:hover {
  background: rgba(255, 255, 255, 0.08);
}
.popup-menu button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}
.popup-section {
  padding: 4px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.popup-section__title {
  padding: 4px 10px 6px;
  color: rgba(255, 255, 255, 0.52);
  font-size: 11px;
}
.popup-menu .popup-option {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 8px;
}
.popup-menu .popup-option.active {
  background: var(--accent-soft);
  color: var(--accent-hover);
}
.popup-menu .popup-option--blocked {
  color: rgba(255, 255, 255, 0.42);
}
.popup-option__text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.popup-option__text strong,
.popup-option__text small {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.popup-option__text strong {
  font-size: 13px;
  font-weight: 650;
}
.popup-option__text small {
  color: rgba(255, 255, 255, 0.56);
  font-size: 11px;
}
.popup-option__check {
  justify-self: end;
}
.popup-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  gap: 16px;
}
.popup-row strong {
  color: white;
  font-size: 12px;
  font-weight: 650;
  text-align: right;
  white-space: nowrap;
}
.pill-select {
  appearance: none;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
}

.iconbtn {
  appearance: none;
  border: none;
  background: transparent;
  color: white;
  height: 36px;
  width: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  cursor: pointer;
  transition: background 180ms var(--easing-glide);
}
.iconbtn:hover {
  background: rgba(255, 255, 255, 0.12);
}
.iconbtn:disabled {
  cursor: default;
  opacity: 0.45;
}
.iconbtn:disabled:hover {
  background: transparent;
}
.iconbtn.lg {
  height: 42px;
  width: 42px;
}
.iconbtn.xl {
  height: 52px;
  width: 52px;
}
.iconbtn.primary {
  background: var(--accent-grad);
  color: white;
  box-shadow: 0 10px 30px rgba(168, 85, 247, 0.4);
}
.iconbtn.active {
  background: var(--accent-soft);
  color: var(--accent-hover);
}
.danmaku-wrap {
  gap: 2px;
}
.danmaku-toggle {
  width: auto;
  min-width: 58px;
  gap: 6px;
  padding: 0 10px;
}
.danmaku-menu-btn {
  width: 28px;
}
.danmaku-toggle span {
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
}

@media (max-width: 1180px) {
  [data-hide-below="wide"] {
    display: none;
  }
}

@media (max-width: 920px) {
  [data-hide-below="medium"] {
    display: none;
  }
  .popup-menu--source {
    position: fixed;
    left: 16px;
    right: 16px;
    bottom: 96px;
    width: auto;
  }
  .controls {
    gap: 8px;
  }
  .controls__left,
  .controls__right {
    gap: 4px;
  }
}

@media (max-width: 760px) {
  .player {
    --player-edge-x: 12px;
  }
  .player__top {
    min-height: 50px;
  }
  .danmaku-toggle {
    min-width: 36px;
    width: 36px;
    padding: 0;
  }
  .danmaku-toggle span {
    display: none;
  }
  .net-meter {
    display: none;
  }
  .player__bottom {
    gap: 10px;
  }
  .popup-menu--source {
    bottom: 132px;
  }
  .controls {
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px 10px;
  }
  .controls__left,
  .controls__right {
    justify-content: center;
    flex-wrap: wrap;
  }
}

@media (max-width: 620px) {
  [data-hide-below="small"] {
    display: none;
  }
  .time {
    min-width: 44px;
    font-size: 11px;
  }
  .iconbtn {
    width: 34px;
    height: 34px;
    border-radius: 9px;
  }
  .iconbtn.xl {
    width: 48px;
    height: 48px;
  }
  .player__bottom {
    gap: 10px;
    padding-bottom: 14px;
  }
}

@media (max-height: 620px) {
  .player__poster-card {
    display: none;
  }
  .player {
    --player-edge-x: 12px;
    --player-bottom-y: 8px;
  }
  .player__top {
    min-height: 44px;
  }
  .player__title p,
  .net-meter {
    display: none;
  }
  .player__bottom {
    gap: 6px;
    padding-top: 8px;
  }
  .bar {
    gap: 7px;
  }
  .bar__slider,
  .bar__slider input[type="range"] {
    height: 22px;
  }
  [data-hide-below="small"] {
    display: none;
  }
  .iconbtn {
    width: 32px;
    height: 32px;
    border-radius: 8px;
  }
  .iconbtn.xl {
    width: 42px;
    height: 42px;
  }
  .danmaku-toggle {
    min-width: 32px;
    width: 32px;
    padding: 0;
  }
  .danmaku-toggle span {
    display: none;
  }
  .popup-menu,
  .episode-menu,
  .popup-menu--source {
    max-height: min(44vh, 260px);
  }
}

@supports (height: 100dvh) {
  .player {
    height: 100dvh;
  }
}
</style>
