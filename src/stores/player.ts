import { defineStore } from "pinia";
import { ref } from "vue";

import { api } from "@/api";
import { useAuthStore } from "@/stores/auth";
import { useLibraryStore } from "@/stores/library";
import { useServerStore } from "@/stores/server";
import type { PlaybackSource, WebDavSidecarDanmaku, WebDavSidecarSubtitle } from "@/api";
import type { MpvSnapshot, PictureMode, SubtitleStyleSettings } from "@/types/models";

type PlaybackQueueKind = "remote" | "local" | "direct";

export interface DirectQueueEntry {
  sourceKind?: "webdav" | "alist";
  url: string;
  title: string;
  sourceLabel?: string | null;
  username?: string | null;
  password?: string | null;
  token?: string | null;
  baseUrl?: string | null;
  path?: string | null;
  pathPassword?: string | null;
  sidecarSubtitles?: WebDavSidecarSubtitle[];
  sidecarDanmaku?: WebDavSidecarDanmaku | null;
}

export const usePlayerStore = defineStore("player", () => {
  const snapshot = ref<MpvSnapshot | null>(null);
  const playbackSource = ref<PlaybackSource | null>(null);
  const playSessionId = ref<string | null>(null);
  const itemId = ref<string | null>(null);
  const localFilePath = ref<string | null>(null);
  const localFileTitle = ref<string | null>(null);
  const directUrl = ref<string | null>(null);
  const directTitle = ref<string | null>(null);
  const directSourceLabel = ref<string | null>(null);
  const directQueue = ref<DirectQueueEntry[]>([]);
  const queue = ref<string[]>([]);
  const queueIndex = ref(-1);
  const queueKind = ref<PlaybackQueueKind>("remote");
  let pollHandle: number | null = null;
  let pollBusy = false;
  let lastEof = false;

  async function play(payload: {
    itemId: string;
    startMs?: number;
    preferDirect?: boolean;
    lineId?: string | null;
    mediaSourceId?: string | null;
    recordWhilePlaying?: boolean;
    stealthWhenRecording?: boolean;
  }) {
    const result = await api.play(payload as any);
    const source = typeof result === "string" ? null : result;
    const sessionId = typeof result === "string" ? result : result.playSessionId;
    itemId.value = payload.itemId;
    playSessionId.value = sessionId;
    playbackSource.value = source;
    if (queueKind.value === "local" || queueKind.value === "direct") clearQueue();
    localFilePath.value = null;
    localFileTitle.value = null;
    directUrl.value = null;
    directTitle.value = null;
    directSourceLabel.value = null;
    lastEof = false;
    void pushNowPlaying();
    startPolling();
    return sessionId;
  }

  function fileNameFromPath(filePath: string): string {
    return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
  }

  async function playFile(payload: {
    filePath: string;
    startMs?: number | null;
    title?: string | null;
  }) {
    await api.playFile({ filePath: payload.filePath, startMs: payload.startMs ?? null });
    const keepsLocalQueue =
      queueKind.value === "local" && queue.value[queueIndex.value] === payload.filePath;
    itemId.value = null;
    playSessionId.value = null;
    playbackSource.value = null;
    if (!keepsLocalQueue) clearQueue();
    localFilePath.value = payload.filePath;
    localFileTitle.value = payload.title?.trim() || fileNameFromPath(payload.filePath);
    directUrl.value = null;
    directTitle.value = null;
    directSourceLabel.value = null;
    lastEof = false;
    void pushNowPlaying();
    startPolling();
  }

  async function playWebDavFile(payload: {
    sourceKind?: "webdav" | "alist";
    url: string;
    title?: string | null;
    sourceLabel?: string | null;
    username?: string | null;
    password?: string | null;
    sidecarSubtitles?: WebDavSidecarSubtitle[];
    sidecarDanmaku?: WebDavSidecarDanmaku | null;
    startMs?: number | null;
  }) {
    await api.playWebDavFile(payload);
    const keepsDirectQueue =
      queueKind.value === "direct" && queue.value[queueIndex.value] === payload.url;
    itemId.value = null;
    playSessionId.value = null;
    playbackSource.value = null;
    if (!keepsDirectQueue) clearQueue();
    localFilePath.value = null;
    localFileTitle.value = null;
    directUrl.value = payload.url;
    directTitle.value = payload.title?.trim() || fileNameFromPath(new URL(payload.url).pathname);
    directSourceLabel.value = payload.sourceLabel?.trim() || "WebDAV";
    lastEof = false;
    void pushNowPlaying();
    startPolling();
  }

  async function playAlistFile(payload: {
    sourceKind?: "webdav" | "alist";
    url: string;
    title?: string | null;
    sourceLabel?: string | null;
    token?: string | null;
    sidecarSubtitles?: WebDavSidecarSubtitle[];
    sidecarDanmaku?: WebDavSidecarDanmaku | null;
    startMs?: number | null;
  }) {
    await api.playAlistFile(payload);
    const keepsDirectQueue =
      queueKind.value === "direct" && queue.value[queueIndex.value] === payload.url;
    itemId.value = null;
    playSessionId.value = null;
    playbackSource.value = null;
    if (!keepsDirectQueue) clearQueue();
    localFilePath.value = null;
    localFileTitle.value = null;
    directUrl.value = payload.url;
    directTitle.value = payload.title?.trim() || fileNameFromPath(new URL(payload.url).pathname);
    directSourceLabel.value = payload.sourceLabel?.trim() || "Alist";
    lastEof = false;
    void pushNowPlaying();
    startPolling();
  }

  function currentDirectQueueIndex(entry: DirectQueueEntry) {
    const currentIndex = queueKind.value === "direct" ? queueIndex.value : -1;
    const currentEntry = currentIndex >= 0 ? directQueue.value[currentIndex] : null;
    if (currentEntry === entry) return currentIndex;
    if (
      currentEntry &&
      entry.path &&
      currentEntry.path === entry.path &&
      currentEntry.sourceKind === entry.sourceKind
    ) {
      return currentIndex;
    }
    return directQueue.value.findIndex((item) => {
      if (entry.path && item.path === entry.path && item.sourceKind === entry.sourceKind) return true;
      return item.url === entry.url;
    });
  }

  function replaceDirectQueueEntry(index: number, entry: DirectQueueEntry) {
    if (index < 0 || index >= directQueue.value.length) return;
    directQueue.value = directQueue.value.map((item, itemIndex) =>
      itemIndex === index ? entry : item,
    );
    queue.value = queue.value.map((existingUrl, itemIndex) =>
      itemIndex === index ? entry.url : existingUrl,
    );
  }

  async function resolveAlistPath(entry: DirectQueueEntry, path: string) {
    const baseUrl = entry.baseUrl?.trim();
    if (!baseUrl || !path) throw new Error("Alist 队列缺少站点 URL 或文件路径");
    return api.resolveAlistFile({
      baseUrl,
      path,
      token: entry.token ?? null,
      pathPassword: entry.pathPassword ?? null,
    });
  }

  async function resolveAlistSidecarSubtitles(entry: DirectQueueEntry) {
    const subtitles = entry.sidecarSubtitles ?? [];
    return Promise.all(
      subtitles.map(async (subtitle) => {
        const path = subtitle.path?.trim();
        if (!path) return subtitle;
        try {
          const resolved = await resolveAlistPath(entry, path);
          return { ...subtitle, url: resolved.url };
        } catch {
          return subtitle;
        }
      }),
    );
  }

  async function resolveAlistSidecarDanmaku(entry: DirectQueueEntry) {
    const danmaku = entry.sidecarDanmaku;
    const path = danmaku?.path?.trim();
    if (!danmaku || !path) return danmaku ?? null;
    try {
      const resolved = await resolveAlistPath(entry, path);
      return { ...danmaku, url: resolved.url };
    } catch {
      return danmaku;
    }
  }

  async function resolveAlistDirectEntry(entry: DirectQueueEntry) {
    const path = entry.path?.trim();
    if (!entry.baseUrl?.trim() || !path) return entry;
    const [resolved, sidecarSubtitles, sidecarDanmaku] = await Promise.all([
      resolveAlistPath(entry, path),
      resolveAlistSidecarSubtitles(entry),
      resolveAlistSidecarDanmaku(entry),
    ]);
    return {
      ...entry,
      url: resolved.url,
      title: entry.title || resolved.name,
      sidecarSubtitles,
      sidecarDanmaku,
    };
  }

  async function playDirectEntry(entry: DirectQueueEntry) {
    if (entry.sourceKind === "alist") {
      const index = currentDirectQueueIndex(entry);
      const resolvedEntry = await resolveAlistDirectEntry(entry);
      replaceDirectQueueEntry(index, resolvedEntry);
      await playAlistFile(resolvedEntry);
    } else {
      await playWebDavFile(entry);
    }
  }

  async function pushNowPlaying() {
    if (directTitle.value) {
      try {
        await api.setNowPlaying({
          title: directTitle.value,
          subtitle: directSourceLabel.value ?? "网络文件",
          durationMs: snapshot.value?.durationMs ?? null,
          positionMs: snapshot.value?.positionMs ?? null,
          thumbnailUrl: null,
        });
        await api.setNowPlayingStatus(snapshot.value?.paused ? "paused" : "playing");
      } catch {
        /* SMTC is best-effort */
      }
      return;
    }

    if (localFileTitle.value) {
      try {
        await api.setNowPlaying({
          title: localFileTitle.value,
          subtitle: "本地文件",
          durationMs: snapshot.value?.durationMs ?? null,
          positionMs: snapshot.value?.positionMs ?? null,
          thumbnailUrl: null,
        });
        await api.setNowPlayingStatus(snapshot.value?.paused ? "paused" : "playing");
      } catch {
        /* SMTC is best-effort */
      }
      return;
    }

    if (!itemId.value) return;
    try {
      const lib = useLibraryStore();
      const auth = useAuthStore();
      const serverStore = useServerStore();

      const item = lib.itemCache[itemId.value] ?? null;
      if (!item) return;

      const subtitleParts: string[] = [];
      if (item.SeriesName) {
        subtitleParts.push(
          `${item.SeriesName} · S${item.ParentIndexNumber ?? "?"}E${item.IndexNumber ?? "?"}`,
        );
      }
      if (item.ProductionYear) subtitleParts.push(String(item.ProductionYear));

      let thumbnailUrl: string | null = null;
      const acc = auth.activeAccount;
      const server = acc ? serverStore.byId(acc.serverId) : null;
      if (server) {
        const line = server.lines.find((l) => l.id === server.activeLineId) ?? server.lines[0];
        if (line) {
          const tag = item.ImageTags?.Primary;
          const sep = line.baseUrl.endsWith("/") ? "" : "/";
          const params = new URLSearchParams({ maxWidth: "320", quality: "82" });
          if (tag) params.set("tag", tag);
          thumbnailUrl = `${line.baseUrl}${sep}Items/${item.Id}/Images/Primary?${params.toString()}`;
        }
      }

      await api.setNowPlaying({
        title: item.Name,
        subtitle: subtitleParts.join(" · ") || null,
        durationMs: snapshot.value?.durationMs ?? null,
        positionMs: snapshot.value?.positionMs ?? null,
        thumbnailUrl,
      });
      await api.setNowPlayingStatus(snapshot.value?.paused ? "paused" : "playing");
    } catch {
      /* SMTC is best-effort */
    }
  }

  /**
   * Replace the playback queue with `items` and start playing the entry at
   * `startIndex` (defaults to 0).
   */
  async function playQueue(items: string[], startIndex = 0) {
    if (items.length === 0) return;
    queue.value = [...items];
    queueIndex.value = Math.max(0, Math.min(items.length - 1, startIndex));
    queueKind.value = "remote";
    directQueue.value = [];
    await play({ itemId: queue.value[queueIndex.value]!, preferDirect: true });
  }

  function setLocalQueue(files: string[], startIndex = 0) {
    queue.value = [...files];
    queueIndex.value = files.length > 0 ? Math.max(0, Math.min(files.length - 1, startIndex)) : -1;
    queueKind.value = "local";
    directQueue.value = [];
  }

  function setDirectQueue(entries: DirectQueueEntry[], startIndex = 0) {
    directQueue.value = entries.filter((entry) => entry.url.trim().length > 0);
    queue.value = directQueue.value.map((entry) => entry.url);
    queueIndex.value =
      directQueue.value.length > 0
        ? Math.max(0, Math.min(directQueue.value.length - 1, startIndex))
        : -1;
    queueKind.value = "direct";
  }

  async function nextTrack() {
    if (queue.value.length === 0) return false;
    if (queueIndex.value + 1 >= queue.value.length) return false;
    queueIndex.value += 1;
    if (queueKind.value === "local") {
      const filePath = queue.value[queueIndex.value]!;
      await playFile({ filePath, title: fileNameFromPath(filePath) });
    } else if (queueKind.value === "direct") {
      const entry = directQueue.value[queueIndex.value];
      if (!entry) return false;
      await playDirectEntry(entry);
    } else {
      await play({ itemId: queue.value[queueIndex.value]!, preferDirect: true });
    }
    return true;
  }

  async function prevTrack() {
    if (queue.value.length === 0) return false;
    if (queueIndex.value <= 0) return false;
    queueIndex.value -= 1;
    if (queueKind.value === "local") {
      const filePath = queue.value[queueIndex.value]!;
      await playFile({ filePath, title: fileNameFromPath(filePath) });
    } else if (queueKind.value === "direct") {
      const entry = directQueue.value[queueIndex.value];
      if (!entry) return false;
      await playDirectEntry(entry);
    } else {
      await play({ itemId: queue.value[queueIndex.value]!, preferDirect: true });
    }
    return true;
  }

  function clearQueue() {
    queue.value = [];
    queueIndex.value = -1;
    queueKind.value = "remote";
    directQueue.value = [];
  }

  function setQueue(items: string[], index: number) {
    queue.value = [...items];
    queueIndex.value = items.length > 0 ? Math.max(0, Math.min(items.length - 1, index)) : -1;
    queueKind.value = "remote";
    directQueue.value = [];
  }

  async function pause() {
    await api.pause();
    await refresh();
  }
  async function resume() {
    await api.resume();
    await refresh();
  }
  async function stop() {
    stopPolling();
    if (itemId.value && playSessionId.value && snapshot.value) {
      try {
        await api.reportPlaybackStopped({
          itemId: itemId.value,
          playSessionId: playSessionId.value,
          positionTicks: snapshot.value.positionMs * 10_000,
        });
      } catch {
        /* ignore */
      }
    }
    await api.stop();
    snapshot.value = null;
    playbackSource.value = null;
    itemId.value = null;
    playSessionId.value = null;
    localFilePath.value = null;
    localFileTitle.value = null;
    directUrl.value = null;
    directTitle.value = null;
    directSourceLabel.value = null;
    try {
      await api.clearNowPlaying();
    } catch {
      /* ignore */
    }
  }

  async function seek(positionMs: number) {
    await api.seek(positionMs);
    if (snapshot.value) {
      const durationMs = snapshot.value.durationMs;
      const target = Math.max(0, Math.floor(positionMs));
      snapshot.value = {
        ...snapshot.value,
        positionMs: durationMs > 0 ? Math.min(target, durationMs) : target,
      };
    }
    await refresh();
    window.setTimeout(() => void refresh(), 350);
  }
  async function seekRelative(deltaMs: number) {
    await api.seekRelative(deltaMs);
    if (snapshot.value) {
      const durationMs = snapshot.value.durationMs;
      const target = Math.max(0, Math.floor(snapshot.value.positionMs + deltaMs));
      snapshot.value = {
        ...snapshot.value,
        positionMs: durationMs > 0 ? Math.min(target, durationMs) : target,
      };
    }
    await refresh();
    window.setTimeout(() => void refresh(), 350);
  }
  async function setSpeed(s: number) {
    await api.setSpeed(s);
    await refresh();
  }
  async function setAudioTrack(id: number) {
    await api.setAudioTrack(id);
    await refresh();
  }
  async function setSubtitleTrack(id: number | null) {
    await api.setSubtitleTrack(id);
    await refresh();
  }
  async function setSecondarySubtitleTrack(id: number | null) {
    await api.setSecondarySubtitleTrack(id);
    await refresh();
  }

  async function addSubtitle(payload: {
    source: string;
    title?: string;
    lang?: string;
    select?: boolean;
  }) {
    await api.addSubtitle(payload);
    await refresh();
  }
  async function removeSubtitle(trackId: number) {
    await api.removeSubtitle(trackId);
    await refresh();
  }
  async function setSubtitleDelay(delayMs: number) {
    await api.setSubtitleDelay(delayMs);
    await refresh();
  }
  async function setSubtitleScale(scale: number) {
    await api.setSubtitleScale(scale);
    await refresh();
  }
  async function setSubtitleStyle(style: SubtitleStyleSettings) {
    await api.setSubtitleStyle(style);
    await refresh();
  }
  async function cycleSubtitle() {
    await api.cycleSubtitle();
    await refresh();
  }
  async function setVolume(volume: number) {
    await api.setVolume(volume);
    await refresh();
  }
  async function setMuted(muted: boolean) {
    await api.setMuted(muted);
    await refresh();
  }
  async function setPictureMode(mode: PictureMode) {
    await api.setPictureMode(mode);
  }

  async function refresh() {
    try {
      snapshot.value = await api.getState();
    } catch {
      /* tolerate transient errors */
    }
  }

  function startPolling() {
    stopPolling();
    pollHandle = window.setInterval(async () => {
      if (pollBusy) return;
      pollBusy = true;
      try {
        await refresh();
        if (snapshot.value && (localFileTitle.value || directTitle.value)) {
          try {
            await api.setNowPlayingStatus(snapshot.value.paused ? "paused" : "playing");
            await api.setNowPlayingPosition({
              positionMs: snapshot.value.positionMs,
              durationMs: snapshot.value.durationMs,
            });
          } catch {
            /* ignore */
          }
        }

        if (snapshot.value && itemId.value && playSessionId.value) {
          try {
            await api.reportPlaybackProgress({
              itemId: itemId.value,
              playSessionId: playSessionId.value,
              positionTicks: snapshot.value.positionMs * 10_000,
              isPaused: snapshot.value.paused,
              playMethod: "DirectStream",
              volumeLevel: snapshot.value.volume,
            });
          } catch {
            /* ignore */
          }

          try {
            await api.setNowPlayingStatus(snapshot.value.paused ? "paused" : "playing");
            await api.setNowPlayingPosition({
              positionMs: snapshot.value.positionMs,
              durationMs: snapshot.value.durationMs,
            });
          } catch {
            /* ignore */
          }

          if (snapshot.value.eof && !lastEof) {
            lastEof = true;
            if (
              queueKind.value === "remote" &&
              queue.value.length > 0 &&
              queueIndex.value + 1 < queue.value.length
            ) {
              void nextTrack();
            }
          } else if (!snapshot.value.eof) {
            lastEof = false;
          }
        }
      } finally {
        pollBusy = false;
      }
    }, 1500);
  }

  function stopPolling() {
    if (pollHandle != null) {
      window.clearInterval(pollHandle);
      pollHandle = null;
    }
  }

  return {
    snapshot,
    playbackSource,
    playSessionId,
    itemId,
    localFilePath,
    localFileTitle,
    directUrl,
    directTitle,
    directSourceLabel,
    directQueue,
    queue,
    queueIndex,
    queueKind,
    play,
    playFile,
    playWebDavFile,
    playAlistFile,
    playDirectEntry,
    playQueue,
    setLocalQueue,
    setDirectQueue,
    nextTrack,
    prevTrack,
    clearQueue,
    setQueue,
    pause,
    resume,
    stop,
    seek,
    seekRelative,
    setSpeed,
    setAudioTrack,
    setSubtitleTrack,
    setSecondarySubtitleTrack,
    addSubtitle,
    removeSubtitle,
    setSubtitleDelay,
    setSubtitleScale,
    setSubtitleStyle,
    cycleSubtitle,
    setVolume,
    setMuted,
    setPictureMode,
    refresh,
  };
});
