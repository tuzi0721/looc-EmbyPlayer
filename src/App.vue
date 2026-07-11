<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import TopBar from "./components/common/TopBar.vue";
import AppSidebar from "./components/common/AppSidebar.vue";
import NotificationCenter from "./components/common/NotificationCenter.vue";
import ToastStack from "./components/common/ToastStack.vue";
import PlayerOverlay from "./views/PlayerOverlay.vue";
import WindowControls from "./components/common/WindowControls.vue";
import { api } from "./api";
import { hasNativeRuntime, hasTauriRuntime, listen, platformType } from "./platform";

// Electron runs the main window frameless (no OS title-bar overlay) so the app draws
// its own window controls. Tauri/web keep their native chrome.
const showWindowControls =
  typeof window !== "undefined" && hasNativeRuntime() && !hasTauriRuntime();

// The dedicated transparent always-on-top `overlay` window loads the same bundle
// but is flagged via `?overlay=1`; it renders ONLY the player controls overlay
// and skips all of the main app shell + bootstrapping.
const isOverlayWindow =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("overlay") === "1";
import { useAuthStore } from "./stores/auth";
import { useDownloadsStore } from "./stores/downloads";
import { useNotificationsStore } from "./stores/notifications";
import { usePlayerStore } from "./stores/player";
import { useServerStore } from "./stores/server";
import { useSettingsStore } from "./stores/settings";
import type { MediaItem, MediaSourceInfo, MediaStreamInfo } from "./types/models";

const auth = useAuthStore();
const server = useServerStore();
const settings = useSettingsStore();
const downloads = useDownloadsStore();
const notifications = useNotificationsStore();
const player = usePlayerStore();
const router = useRouter();
const route = useRoute();
const bootstrapped = ref(false);
const desktopSidebarCollapsed = ref(false);
const mobileSidebarExpanded = ref(false);
const viewportWidth = ref(1280);

const isFullscreen = computed(() => Boolean(route.meta?.fullscreen));
const autoSidebarCollapsed = computed(() => viewportWidth.value < 900);
const effectiveSidebarCollapsed = computed(() =>
  autoSidebarCollapsed.value ? !mobileSidebarExpanded.value : desktopSidebarCollapsed.value,
);
const sidebarOverlayOpen = computed(
  () => autoSidebarCollapsed.value && mobileSidebarExpanded.value && !isFullscreen.value,
);

function readSidebarCollapsed() {
  try {
    return window.localStorage.getItem("hills:sidebar-collapsed") === "1";
  } catch {
    return false;
  }
}

function persistSidebarCollapsed(value: boolean) {
  try {
    window.localStorage.setItem("hills:sidebar-collapsed", value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function toggleSidebarCollapsed() {
  if (autoSidebarCollapsed.value) {
    mobileSidebarExpanded.value = !mobileSidebarExpanded.value;
    return;
  }
  desktopSidebarCollapsed.value = !desktopSidebarCollapsed.value;
}

function closeSidebarOverlay() {
  mobileSidebarExpanded.value = false;
}

watch(desktopSidebarCollapsed, persistSidebarCollapsed);

watch(autoSidebarCollapsed, (auto) => {
  if (!auto) closeSidebarOverlay();
});

watch(
  () => route.fullPath,
  () => {
    closeSidebarOverlay();
  },
);

function updateViewportWidth() {
  viewportWidth.value = window.innerWidth;
}

function withBootstrapTimeout<T>(promise: Promise<T>, timeoutMs = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timer = null;
      reject(new Error(`bootstrap timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer != null) clearTimeout(timer);
  });
}

function ignoreBootstrapFailure<T>(promise: Promise<T>) {
  return withBootstrapTimeout(promise).catch(() => {});
}

async function applyPlatformClass() {
  try {
    if ((await withBootstrapTimeout(platformType(), 1500)) === "windows") {
      document.documentElement.classList.add("platform-windows");
    }
  } catch {
    /* ignore */
  }
}

watch(
  () => route.name,
  (name) => {
    if (name !== "player") {
      document.documentElement.classList.remove("embedded-player");
    }
  },
);

// ── standalone Qt player selection panels (episodes / versions / quality) ──────
// The Qt player can't reach the Emby session, so it asks the host for a list
// (player:request_panel); we assemble it here (we own the library/API + queue) and
// push it back via api.setPlayerPanel. A pick returns as player:panel_select and we
// reload playback through playerStore.play with the chosen episode / media source.
// Cache the last episode list so a pick can rebuild the queue without a refetch.
let panelEpisodes: MediaItem[] = [];
// Prefetch caches so the player's 选集/版本/清晰度 panels open instantly instead of
// waiting on getItemDetail / listEpisodes round-trips at click time.
let panelDetailCache: { itemId: string; detail: MediaItem } | null = null;
let panelEpisodesSeriesId: string | null = null;

// Warm the panel caches for the item that just started playing. Runs in the
// background right after play() so the network round-trips overlap with playback
// startup rather than blocking the first panel open.
async function prefetchPanelData(id: string) {
  try {
    const detail = await api.getItemDetail(id);
    panelDetailCache = { itemId: id, detail };
    const seriesId = detail?.SeriesId ?? null;
    if (seriesId && seriesId !== panelEpisodesSeriesId) {
      try {
        const resp = await api.listEpisodes({ seriesId, seasonId: detail?.SeasonId ?? null });
        panelEpisodes = resp.Items ?? [];
        panelEpisodesSeriesId = seriesId;
      } catch {
        /* ignore — falls back to a fetch at panel-open time */
      }
    }
  } catch {
    /* ignore — currentPlayingDetail will fetch on demand */
  }
}

function panelVideoStream(source: MediaSourceInfo): MediaStreamInfo | null {
  return (source.MediaStreams ?? []).find((s) => (s.Type ?? "").toLowerCase() === "video") ?? null;
}

function panelResolutionLabel(source: MediaSourceInfo): string {
  const height = panelVideoStream(source)?.Height ?? 0;
  if (height >= 2000) return "4K";
  if (height >= 1) return `${height}p`;
  return "原画";
}

function panelMediaSourceKey(source: MediaSourceInfo, index: number): string {
  const id = source.Id == null ? "" : String(source.Id).trim();
  return id || `source-${index}`;
}

function panelVersionLabel(source: MediaSourceInfo, index: number): string {
  const name = (source.Name ?? "").trim();
  if (name && !/[\\/]/.test(name) && !/^https?:\/\//i.test(name)) return name;
  const file = (source.Path ?? "")
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .trim();
  return file || `版本 ${index + 1}`;
}

function panelVersionSublabel(source: MediaSourceInfo): string {
  const video = panelVideoStream(source);
  return [source.Container?.trim().toUpperCase(), panelResolutionLabel(source), video?.Codec?.trim().toUpperCase()]
    .filter(Boolean)
    .join(" · ");
}

function panelEpisodeLabel(ep: MediaItem): string {
  const prefix = ep.IndexNumber != null ? `E${ep.IndexNumber}` : "";
  return [prefix, ep.Name].filter(Boolean).join(" · ") || ep.Name || ep.Id;
}

function panelEpisodeSublabel(ep: MediaItem): string {
  if (ep.UserData?.Played) return "已看";
  const position = ep.UserData?.PlaybackPositionTicks ?? 0;
  const runtime = ep.RunTimeTicks ?? 0;
  if (position > 0 && runtime > 0) {
    const pct = Math.round((position / runtime) * 100);
    if (pct > 0) return `已看 ${pct}%`;
  }
  return "";
}

async function currentPlayingDetail(): Promise<MediaItem | null> {
  const id = player.itemId;
  if (!id) return null;
  if (panelDetailCache?.itemId === id) return panelDetailCache.detail;
  try {
    const detail = await api.getItemDetail(id);
    panelDetailCache = { itemId: id, detail };
    return detail;
  } catch {
    return null;
  }
}

async function handleRequestPanel(kind: "episodes" | "versions" | "quality") {
  if (!player.itemId) return;
  try {
    const detail = await currentPlayingDetail();
    if (kind === "episodes") {
      const seriesId = detail?.SeriesId ?? null;
      let episodes: MediaItem[] = [];
      if (seriesId) {
        // Reuse the prefetched list when it's for this same series.
        if (seriesId === panelEpisodesSeriesId && panelEpisodes.length > 0) {
          episodes = panelEpisodes;
        } else {
          try {
            const resp = await api.listEpisodes({ seriesId, seasonId: detail?.SeasonId ?? null });
            episodes = resp.Items ?? [];
            panelEpisodesSeriesId = seriesId;
          } catch {
            episodes = [];
          }
        }
      }
      panelEpisodes = episodes;
      const entries = episodes.map((ep) => ({
        key: ep.Id,
        label: panelEpisodeLabel(ep),
        sublabel: panelEpisodeSublabel(ep),
        checked: ep.Id === player.itemId,
      }));
      await api.setPlayerPanel({ kind, title: "选集", entries });
      return;
    }

    const sources = detail?.MediaSources ?? [];
    const currentMediaSourceId = player.playbackSource?.mediaSourceId ?? null;
    if (kind === "versions") {
      const entries = sources.map((source, index) => {
        const key = panelMediaSourceKey(source, index);
        return {
          key,
          label: panelVersionLabel(source, index),
          sublabel: panelVersionSublabel(source),
          checked: key === currentMediaSourceId,
        };
      });
      await api.setPlayerPanel({ kind, title: "版本", entries });
      return;
    }

    // quality: distinct resolutions among the (no-transcode) media sources; each
    // maps to the source carrying that resolution.
    const seen = new Set<string>();
    const entries: { key: string; label: string; sublabel?: string; checked?: boolean }[] = [];
    sources.forEach((source, index) => {
      const label = panelResolutionLabel(source);
      if (seen.has(label)) return;
      seen.add(label);
      const key = panelMediaSourceKey(source, index);
      entries.push({ key, label, sublabel: panelVersionSublabel(source), checked: key === currentMediaSourceId });
    });
    await api.setPlayerPanel({ kind, title: "清晰度", entries });
  } catch {
    /* ignore — panel is best-effort */
  }
}

async function handlePanelSelect(kind: string | null, key: string | null) {
  if (!key) return;
  try {
    if (kind === "episodes") {
      const index = panelEpisodes.findIndex((ep) => ep.Id === key);
      if (index >= 0) {
        player.setQueue(
          panelEpisodes.slice(index).map((ep) => ep.Id),
          0,
        );
      } else {
        player.setQueue([key], 0);
      }
      const ep = index >= 0 ? panelEpisodes[index] : null;
      const startMs = Math.round((ep?.UserData?.PlaybackPositionTicks ?? 0) / 10_000);
      await player.play({ itemId: key, startMs, preferDirect: true });
      return;
    }
    // versions / quality: switch the media source, resuming at the current position.
    const itemId = player.itemId;
    if (!itemId) return;
    const startMs = player.snapshot?.positionMs ?? 0;
    await player.play({ itemId, mediaSourceId: key, startMs, preferDirect: true });
  } catch {
    /* ignore — selection is best-effort */
  }
}

onMounted(async () => {
  if (isOverlayWindow) return;
  updateViewportWidth();
  window.addEventListener("resize", updateViewportWidth);
  desktopSidebarCollapsed.value = readSidebarCollapsed();
  await Promise.all([
    applyPlatformClass(),
    ignoreBootstrapFailure(settings.refresh()),
    ignoreBootstrapFailure(server.refresh()),
    ignoreBootstrapFailure(auth.refresh()),
    ignoreBootstrapFailure(downloads.refresh()),
    ignoreBootstrapFailure(notifications.refresh()),
  ]);
  bootstrapped.value = true;
  server.startListening().catch(() => {});
  server.probeAllLines?.().catch(() => {});
  downloads.startListening().catch(() => {});
  notifications.startListening().catch(() => {});

  listen<string>("nav:goto", (e) => {
    const dest = e.payload;
    if (dest === "/notifications-open") {
      notifications.openCenter();
      return;
    }
    router.push(dest).catch(() => {});
  }).catch(() => {});

  // Warm the panel caches whenever the playing item changes, so the Qt player's
  // 选集/版本/清晰度 panels open without a getItemDetail/listEpisodes round-trip.
  watch(
    () => player.itemId,
    (id) => {
      if (id) void prefetchPanelData(id);
    },
    { immediate: true },
  );

  // Natural end-of-file from the standalone Qt player. Advance the queue here,
  // immediately, rather than waiting on mpv-state polling — the Qt process exits at
  // EOF so polling races with the close cleanup. maybeAdvanceOnEof is idempotent.
  listen("player:eof", () => {
    player.maybeAdvanceOnEof();
  }).catch(() => {});
  listen("player:next_track", () => {
    void player.nextTrack();
  }).catch(() => {});
  listen("player:prev_track", () => {
    void player.prevTrack();
  }).catch(() => {});
  // Standalone Qt player closed by the user (playback started from the detail page without
  // navigating to the player route). Clean up the player store (stop polling, report
  // stopped, mark watched). The navigated player route cleans up via PlayerView, so skip
  // when we're on it.
  listen("player:standalone_closed", () => {
    if (router.currentRoute.value.name !== "player") {
      void player.stop({ stopBackend: false });
    }
  }).catch(() => {});

  // Standalone Qt player asked for a selection panel (选集 / 版本 / 清晰度): build
  // it and push it back; a pick reloads playback with the chosen entry.
  listen<{ kind: "episodes" | "versions" | "quality" }>("player:request_panel", (e) => {
    void handleRequestPanel(e.payload?.kind);
  }).catch(() => {});
  listen<{ kind: string | null; key: string | null }>("player:panel_select", (e) => {
    void handlePanelSelect(e.payload?.kind ?? null, e.payload?.key ?? null);
  }).catch(() => {});

  listen<string>("shortcut:trigger", async (e) => {
    const action = e.payload;
    try {
      if (action === "play_pause") {
        const snap = player.snapshot;
        if (snap?.paused) await player.resume();
        else await player.pause();
      } else if (action === "stop") {
        await player.stop();
      } else if (action === "next_track") {
        await player.nextTrack();
      } else if (action === "prev_track") {
        await player.prevTrack();
      }
    } catch {
      /* ignore */
    }
  }).catch(() => {});
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateViewportWidth);
});
</script>

<template>
  <PlayerOverlay v-if="isOverlayWindow" />
  <div
    v-else
    class="app-shell"
    :class="{ 'is-fullscreen': isFullscreen, 'sidebar-overlay-open': sidebarOverlayOpen }"
  >
    <div class="app-backdrop" />
    <div class="app-body" :class="{ 'is-fullscreen': isFullscreen }">
      <AppSidebar
        v-if="!isFullscreen"
        class="app-sidebar"
        :collapsed="effectiveSidebarCollapsed"
        :overlay="sidebarOverlayOpen"
        @toggle-collapsed="toggleSidebarCollapsed"
      />
      <button
        v-if="sidebarOverlayOpen"
        class="sidebar-scrim"
        type="button"
        aria-label="关闭侧栏"
        @click="closeSidebarOverlay"
      />
      <div class="app-right" :class="{ 'is-fullscreen': isFullscreen }">
        <TopBar v-if="!isFullscreen" />
        <main class="app-main">
          <router-view v-slot="{ Component, route: r }">
            <transition :name="(r.meta?.transition as string) || 'fade'" mode="out-in">
              <component :is="Component" :key="r.fullPath" />
            </transition>
          </router-view>
        </main>
      </div>
    </div>
    <NotificationCenter />
    <ToastStack />
    <WindowControls v-if="showWindowControls" />
  </div>
</template>

<style>
.app-shell {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
}
.app-shell.is-fullscreen {
  display: block;
}
.app-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  position: relative;
}
.app-body.is-fullscreen {
  display: block;
  height: 100%;
}
.app-sidebar {
  flex-shrink: 0;
}
.app-shell.sidebar-overlay-open .app-body .app-sidebar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 60;
  box-shadow: 18px 0 48px rgba(0, 0, 0, 0.28);
}
.sidebar-scrim {
  position: absolute;
  inset: 0;
  z-index: 50;
  padding: 0;
  border: 0;
  background: rgba(0, 0, 0, 0.34);
  cursor: default;
}
:root[data-theme="light"] .sidebar-scrim {
  background: rgba(18, 24, 38, 0.16);
}
.app-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.app-right.is-fullscreen {
  width: 100%;
  height: 100%;
}
.app-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}
.app-shell.is-fullscreen .app-main,
.app-right.is-fullscreen .app-main {
  width: 100%;
  height: 100%;
}

/* Route transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 220ms var(--easing-glide);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.slide-up-enter-active,
.slide-up-leave-active {
  transition: opacity 220ms var(--easing-glide), transform 220ms var(--easing-glide);
}
.slide-up-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
