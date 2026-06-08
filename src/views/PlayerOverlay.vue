<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Icon } from "@iconify/vue";

import { api } from "@/api";
import type { MpvSnapshot } from "@/types/models";

// This component renders ONLY inside the dedicated transparent, always-on-top
// `overlay` window that floats above the native mpv child window. It owns the
// player transport controls + a custom title bar, talks to the backend mpv
// directly (state poll + commands), drives the `main` window for min/max/close,
// and forwards higher-level actions (back / fullscreen) to `main` via events.

const snapshot = ref<MpvSnapshot | null>(null);
const title = ref("");
const subtitle = ref("");
const isFullscreen = ref(false);
const isMaximized = ref(false);
const controlsVisible = ref(true);
const scrubbing = ref(false);
const scrubMs = ref(0);

let poll: number | null = null;
let hideTimer: number | null = null;
const unlisteners: Array<() => void> = [];

const positionMs = computed(() =>
  scrubbing.value ? scrubMs.value : snapshot.value?.positionMs ?? 0,
);
const durationMs = computed(() => snapshot.value?.durationMs ?? 0);
const paused = computed(() => snapshot.value?.paused ?? true);
const buffering = computed(() => Boolean(snapshot.value?.buffering));
const volume = computed(() => snapshot.value?.volume ?? 100);
const muted = computed(() => snapshot.value?.muted ?? false);
const progressPct = computed(() =>
  durationMs.value > 0 ? Math.min(100, (positionMs.value / durationMs.value) * 100) : 0,
);

function fmt(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, "0")}` : `${mm}:${String(s).padStart(2, "0")}`;
}

async function refresh() {
  try {
    snapshot.value = await api.getState();
  } catch {
    /* tolerate transient errors while mpv is loading */
  }
}

async function togglePlay() {
  bumpControls();
  try {
    if (paused.value) await api.resume();
    else await api.pause();
  } finally {
    await refresh();
  }
}

async function nudge(deltaSec: number) {
  bumpControls();
  try {
    await api.seekRelative(deltaSec * 1000);
  } finally {
    await refresh();
  }
}

function onScrubInput(event: Event) {
  scrubbing.value = true;
  const pct = Number((event.target as HTMLInputElement).value);
  scrubMs.value = Math.floor((durationMs.value * pct) / 100);
  bumpControls();
}

async function onScrubCommit(event: Event) {
  const pct = Number((event.target as HTMLInputElement).value);
  const target = Math.floor((durationMs.value * pct) / 100);
  scrubbing.value = false;
  try {
    await api.seek(target);
  } finally {
    await refresh();
  }
}

async function onVolumeInput(event: Event) {
  const v = Number((event.target as HTMLInputElement).value);
  bumpControls();
  try {
    await api.setVolume(v);
  } finally {
    await refresh();
  }
}

async function toggleMute() {
  bumpControls();
  try {
    await api.setMuted(!muted.value);
  } finally {
    await refresh();
  }
}

async function emitCmd(action: string) {
  if (!isTauri) return;
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit("overlay:cmd", { action });
  } catch {
    /* ignore */
  }
}

async function mainWindow() {
  if (!isTauri) return null;
  try {
    const { Window } = await import("@tauri-apps/api/window");
    return await Window.getByLabel("main");
  } catch {
    return null;
  }
}

async function onMinimize() {
  const w = await mainWindow();
  await w?.minimize().catch(() => {});
}
async function onToggleMaximize() {
  // Fullscreen takes priority over maximize while in immersive playback.
  if (isFullscreen.value) {
    await emitCmd("toggle-fullscreen");
    return;
  }
  const w = await mainWindow();
  await w?.toggleMaximize().catch(() => {});
}
async function onClose() {
  const w = await mainWindow();
  await w?.close().catch(() => {});
}
function onBack() {
  void emitCmd("back");
}
function onToggleFullscreen() {
  bumpControls();
  void emitCmd("toggle-fullscreen");
}

function clearHideTimer() {
  if (hideTimer != null) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function bumpControls() {
  controlsVisible.value = true;
  clearHideTimer();
  if (paused.value || scrubbing.value) return;
  hideTimer = window.setTimeout(() => {
    if (!scrubbing.value && !paused.value) controlsVisible.value = false;
  }, 3200);
}

const isTauri =
  typeof window !== "undefined" &&
  (Boolean((window as any).__TAURI_INTERNALS__) ||
    window.location.hostname === "tauri.localhost" ||
    window.location.protocol === "tauri:");

onMounted(async () => {
  document.documentElement.classList.add("overlay-window");
  await refresh();
  poll = window.setInterval(refresh, 400);
  bumpControls();

  if (isTauri) {
    try {
      const { listen } = await import("@tauri-apps/api/event");
      unlisteners.push(
        await listen<{
          title?: string;
          subtitle?: string;
          isFullscreen?: boolean;
          isMaximized?: boolean;
        }>("overlay:sync", (e) => {
          if (typeof e.payload.title === "string") title.value = e.payload.title;
          if (typeof e.payload.subtitle === "string") subtitle.value = e.payload.subtitle;
          if (typeof e.payload.isFullscreen === "boolean") isFullscreen.value = e.payload.isFullscreen;
          if (typeof e.payload.isMaximized === "boolean") isMaximized.value = e.payload.isMaximized;
        }),
      );
    } catch {
      /* events optional */
    }
  }
});

onBeforeUnmount(() => {
  if (poll != null) window.clearInterval(poll);
  clearHideTimer();
  for (const off of unlisteners) {
    try {
      off();
    } catch {
      /* ignore */
    }
  }
  document.documentElement.classList.remove("overlay-window");
});
</script>

<template>
  <div
    class="ov"
    :class="{ 'ov--hidden': !controlsVisible }"
    @mousemove="bumpControls"
    @click.self="togglePlay"
  >
    <!-- Top bar: title + window controls -->
    <header class="ov__top" @click.stop>
      <button class="ov__icon" title="返回" @click="onBack">
        <Icon icon="lucide:chevron-left" width="22" />
      </button>
      <div class="ov__title">
        <span class="ov__title-main">{{ title || "正在播放" }}</span>
        <span v-if="subtitle" class="ov__title-sub">{{ subtitle }}</span>
      </div>
      <div class="ov__winbtns">
        <button class="ov__win" title="最小化" @click="onMinimize">
          <Icon icon="lucide:minus" width="18" />
        </button>
        <button class="ov__win" title="最大化/还原" @click="onToggleMaximize">
          <Icon :icon="isMaximized ? 'lucide:copy' : 'lucide:square'" width="15" />
        </button>
        <button class="ov__win ov__win--close" title="关闭" @click="onClose">
          <Icon icon="lucide:x" width="18" />
        </button>
      </div>
    </header>

    <!-- Center click target toggles play; show a buffering spinner. -->
    <div class="ov__center" @click="togglePlay">
      <div v-if="buffering" class="ov__spinner" />
    </div>

    <!-- Bottom transport bar -->
    <footer class="ov__bottom" @click.stop>
      <input
        class="ov__seek"
        type="range"
        min="0"
        max="100"
        step="0.1"
        :value="progressPct"
        :style="{ '--pct': progressPct + '%' }"
        @input="onScrubInput"
        @change="onScrubCommit"
      />
      <div class="ov__row">
        <button class="ov__icon" :title="paused ? '播放' : '暂停'" @click="togglePlay">
          <Icon :icon="paused ? 'lucide:play' : 'lucide:pause'" width="22" />
        </button>
        <button class="ov__icon" title="后退 10 秒" @click="nudge(-10)">
          <Icon icon="lucide:rotate-ccw" width="19" />
        </button>
        <button class="ov__icon" title="前进 10 秒" @click="nudge(10)">
          <Icon icon="lucide:rotate-cw" width="19" />
        </button>
        <span class="ov__time">{{ fmt(positionMs) }} / {{ fmt(durationMs) }}</span>
        <div class="ov__spacer" />
        <button class="ov__icon" :title="muted ? '取消静音' : '静音'" @click="toggleMute">
          <Icon :icon="muted || volume <= 0 ? 'lucide:volume-x' : 'lucide:volume-2'" width="19" />
        </button>
        <input
          class="ov__vol"
          type="range"
          min="0"
          max="100"
          step="1"
          :value="muted ? 0 : volume"
          @input="onVolumeInput"
        />
        <button class="ov__icon" :title="isFullscreen ? '退出全屏' : '全屏'" @click="onToggleFullscreen">
          <Icon :icon="isFullscreen ? 'lucide:minimize' : 'lucide:maximize'" width="19" />
        </button>
      </div>
    </footer>
  </div>
</template>

<style>
/* The overlay window itself must be see-through so the mpv video shows. */
html.overlay-window,
html.overlay-window body,
html.overlay-window #app {
  background: transparent !important;
}
</style>

<style scoped>
.ov {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: #fff;
  font-family: var(--font-sans, system-ui, sans-serif);
  user-select: none;
  cursor: default;
  transition: opacity 200ms ease;
}
.ov--hidden {
  opacity: 0;
  cursor: none;
}
.ov--hidden .ov__top,
.ov--hidden .ov__bottom {
  pointer-events: none;
}

.ov__top {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 18px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.62) 0%, rgba(0, 0, 0, 0) 100%);
}
.ov__title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.ov__title-main {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
}
.ov__title-sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ov__winbtns {
  display: flex;
  gap: 2px;
}
.ov__win {
  width: 40px;
  height: 30px;
  display: grid;
  place-items: center;
  border: none;
  background: transparent;
  color: #fff;
  cursor: pointer;
  border-radius: 6px;
  transition: background 140ms ease;
}
.ov__win:hover {
  background: rgba(255, 255, 255, 0.16);
}
.ov__win--close:hover {
  background: #e81123;
}

.ov__center {
  flex: 1;
  display: grid;
  place-items: center;
}
.ov__spinner {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  border: 4px solid rgba(255, 255, 255, 0.25);
  border-top-color: #fff;
  animation: ov-spin 0.9s linear infinite;
}
@keyframes ov-spin {
  to {
    transform: rotate(360deg);
  }
}

.ov__bottom {
  padding: 22px 18px 14px;
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.74) 0%, rgba(0, 0, 0, 0) 100%);
}
.ov__seek {
  width: 100%;
  height: 5px;
  margin: 0 0 10px;
  appearance: none;
  -webkit-appearance: none;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--accent, #3ea6ff) 0%,
    var(--accent, #3ea6ff) var(--pct, 0%),
    rgba(255, 255, 255, 0.28) var(--pct, 0%),
    rgba(255, 255, 255, 0.28) 100%
  );
  cursor: pointer;
}
.ov__seek::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.5);
  cursor: pointer;
}
.ov__row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ov__icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border: none;
  background: transparent;
  color: #fff;
  cursor: pointer;
  border-radius: 8px;
  transition: background 140ms ease;
}
.ov__icon:hover {
  background: rgba(255, 255, 255, 0.16);
}
.ov__time {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.92);
  margin-left: 4px;
  white-space: nowrap;
}
.ov__spacer {
  flex: 1;
}
.ov__vol {
  width: 96px;
  height: 4px;
  appearance: none;
  -webkit-appearance: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.3);
  cursor: pointer;
}
.ov__vol::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  cursor: pointer;
}
</style>
