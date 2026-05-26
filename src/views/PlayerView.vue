<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

import GlassButton from "@/components/common/GlassButton.vue";
import DanmakuOverlay from "@/components/player/DanmakuOverlay.vue";
import SubtitlePanel from "@/components/player/SubtitlePanel.vue";
import { api } from "@/api";
import { useKeyboard } from "@/composables/useKeyboard";
import { useLibraryStore } from "@/stores/library";
import { usePlayerStore } from "@/stores/player";
import type { DanmakuComment } from "@/types/models";

const props = defineProps<{ id: string }>();
const route = useRoute();
const router = useRouter();
const player = usePlayerStore();
const lib = useLibraryStore();

/** Windows WebView2 cannot reliably host mpv via --wid; use mpv's own window. */
const embedVideo = false;

const errorText = ref<string | null>(null);
const showControls = ref(true);
let hideTimer: number | null = null;

const subtitlePanelOpen = ref(false);
const settingsMenuOpen = ref(false);
const episodeMenuOpen = ref(false);
const danmakuEnabled = ref(false);
const danmakuLoading = ref(false);
const danmakuComments = ref<DanmakuComment[]>([]);
const danmakuOpacity = ref(0.85);
const danmakuSpeed = ref(1);
const danmakuFontSize = ref(22);

async function toggleDanmaku() {
  if (!danmakuEnabled.value) {
    danmakuEnabled.value = true;
    if (danmakuComments.value.length === 0) {
      danmakuLoading.value = true;
      try {
        const r = await api.fetchDanmaku(props.id);
        danmakuComments.value = r?.comments ?? [];
      } catch {
        danmakuComments.value = [];
      } finally {
        danmakuLoading.value = false;
      }
    }
  } else {
    danmakuEnabled.value = false;
  }
}

const item = computed(() => lib.itemCache[props.id] ?? null);

const positionMs = computed(() => player.snapshot?.positionMs ?? 0);
const durationMs = computed(() => player.snapshot?.durationMs ?? 0);
const paused = computed(() => player.snapshot?.paused ?? true);
const speed = computed(() => player.snapshot?.speed ?? 1);

const audioTracks = computed(() =>
  (player.snapshot?.tracks ?? []).filter((t) => t.kind === "audio"),
);
const subTracks = computed(() =>
  (player.snapshot?.tracks ?? []).filter((t) => t.kind === "subtitle"),
);

const progressPct = computed(() => {
  if (!durationMs.value) return 0;
  return Math.max(0, Math.min(100, (positionMs.value / durationMs.value) * 100));
});

const isScrubbing = ref(false);
const scrubPct = ref(0);
watch(progressPct, (v) => {
  if (!isScrubbing.value) scrubPct.value = v;
});

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

function bumpControls() {
  showControls.value = true;
  if (hideTimer != null) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => (showControls.value = false), 3200);
}

async function onScrubInput(e: Event) {
  isScrubbing.value = true;
  scrubPct.value = Number((e.target as HTMLInputElement).value);
}

async function onScrubCommit(e: Event) {
  const value = Number((e.target as HTMLInputElement).value);
  isScrubbing.value = false;
  if (!durationMs.value) return;
  await player.seek(Math.floor((durationMs.value * value) / 100));
  bumpControls();
}

async function togglePlay() {
  if (paused.value) await player.resume();
  else await player.pause();
  bumpControls();
}

function back() {
  void player.stop();
  const from =
    (route.query.from as string | undefined) ||
    item.value?.SeriesId ||
    props.id;
  router.push(`/item/${from}`).catch(() => {});
}

async function nudgeSeek(deltaSec: number) {
  const target = Math.max(0, positionMs.value + deltaSec * 1000);
  await player.seek(Math.floor(target));
  bumpControls();
}

async function nudgeVolume(delta: number) {
  const cur = player.snapshot?.volume ?? 80;
  await player.setVolume(Math.max(0, Math.min(200, cur + delta)));
  bumpControls();
}

async function toggleMute() {
  const cur = player.snapshot?.muted ?? false;
  await player.setMuted(!cur);
  bumpControls();
}

async function nudgeSpeed(delta: number) {
  const next = Math.max(0.25, Math.min(4, speed.value + delta));
  await player.setSpeed(Number(next.toFixed(2)));
}

async function nudgeSubDelay(deltaMs: number) {
  const cur = player.snapshot?.subDelayMs ?? 0;
  await player.setSubtitleDelay(cur + deltaMs);
}

async function seekToPercent(p: number) {
  if (!durationMs.value) return;
  await player.seek(Math.floor((durationMs.value * p) / 100));
  bumpControls();
}

function toggleFullscreen() {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => void;
  };
  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => void;
  };
  if (doc.fullscreenElement || doc.webkitFullscreenElement) {
    if (doc.exitFullscreen) void doc.exitFullscreen();
    else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
  } else {
    if (root.requestFullscreen) void root.requestFullscreen();
    else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
  }
}

useKeyboard([
  { combo: "Space", description: "播放 / 暂停", handler: togglePlay },
  { combo: "k", description: "播放 / 暂停", handler: togglePlay },
  { combo: "ArrowLeft", description: "后退 10 秒", handler: () => nudgeSeek(-10) },
  { combo: "ArrowRight", description: "前进 10 秒", handler: () => nudgeSeek(10) },
  { combo: "Shift+ArrowLeft", description: "后退 60 秒", handler: () => nudgeSeek(-60) },
  { combo: "Shift+ArrowRight", description: "前进 60 秒", handler: () => nudgeSeek(60) },
  { combo: "j", description: "后退 10 秒", handler: () => nudgeSeek(-10) },
  { combo: "l", description: "前进 10 秒", handler: () => nudgeSeek(10) },
  { combo: "ArrowUp", description: "音量 +5", handler: () => nudgeVolume(5) },
  { combo: "ArrowDown", description: "音量 -5", handler: () => nudgeVolume(-5) },
  { combo: "m", description: "静音 / 取消静音", handler: toggleMute },
  { combo: "f", description: "切换全屏", handler: toggleFullscreen },
  { combo: "s", description: "字幕面板", handler: () => (subtitlePanelOpen.value = !subtitlePanelOpen.value) },
  { combo: "c", description: "循环字幕轨道", handler: () => player.cycleSubtitle() },
  { combo: "d", description: "弹幕开关", handler: toggleDanmaku },
  { combo: "=", description: "速度 +0.1", handler: () => nudgeSpeed(0.1) },
  { combo: "+", description: "速度 +0.1", handler: () => nudgeSpeed(0.1) },
  { combo: "-", description: "速度 -0.1", handler: () => nudgeSpeed(-0.1) },
  { combo: "[", description: "字幕延迟 -100ms", handler: () => nudgeSubDelay(-100) },
  { combo: "]", description: "字幕延迟 +100ms", handler: () => nudgeSubDelay(100) },
  { combo: "0", handler: () => seekToPercent(0) },
  { combo: "1", handler: () => seekToPercent(10) },
  { combo: "2", handler: () => seekToPercent(20) },
  { combo: "3", handler: () => seekToPercent(30) },
  { combo: "4", handler: () => seekToPercent(40) },
  { combo: "5", handler: () => seekToPercent(50) },
  { combo: "6", handler: () => seekToPercent(60) },
  { combo: "7", handler: () => seekToPercent(70) },
  { combo: "8", handler: () => seekToPercent(80) },
  { combo: "9", handler: () => seekToPercent(90) },
  {
    combo: "Escape",
    description: "关闭面板",
    handler: () => {
      if (subtitlePanelOpen.value) {
        subtitlePanelOpen.value = false;
      } else if (
        document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement
      ) {
        toggleFullscreen();
      } else {
        void back();
      }
    },
  },
]);

async function setSpeed(v: number) {
  await player.setSpeed(v);
  bumpControls();
}

async function chooseAudio(id: number) {
  await player.setAudioTrack(id);
  bumpControls();
}
async function chooseSub(id: number | null) {
  await player.setSubtitleTrack(id);
  bumpControls();
}

onMounted(async () => {
  try {
    if (!lib.itemCache[props.id]) {
      await lib.loadItem(props.id);
    }

    const start = Number(route.query.start ?? 0) || 0;
    const localId = (route.query.local as string | undefined) ?? null;
    const recordWhilePlaying = route.query.record === "1";
    const stealthWhenRecording = route.query.stealth !== "0";

    if (localId) {
      await api.playLocal(localId, start);
    } else {
      await player.play({
        itemId: props.id,
        startMs: start,
        preferDirect: true,
        recordWhilePlaying,
        stealthWhenRecording,
      });
    }
    bumpControls();
  } catch (e) {
    errorText.value = String(e);
    showControls.value = true;
  }
});

onBeforeUnmount(async () => {
  if (hideTimer != null) window.clearTimeout(hideTimer);
  await player.stop().catch(() => {});
});
</script>

<template>
  <main class="player" :class="{ 'player--embedded': embedVideo }" @mousemove="bumpControls">
    <div class="player__stage">
      <DanmakuOverlay
        class="player__danmaku"
        :comments="danmakuComments"
        :position-ms="positionMs"
        :paused="paused"
        :enabled="danmakuEnabled"
        :opacity="danmakuOpacity"
        :speed="danmakuSpeed"
        :font-size="danmakuFontSize"
      />

      <SubtitlePanel :visible="subtitlePanelOpen" @close="subtitlePanelOpen = false" />

      <div v-if="errorText" class="player__error glass glass-strong">
        <Icon icon="lucide:triangle-alert" width="22" />
        <h3>无法开始播放</h3>
        <p>{{ errorText }}</p>
        <GlassButton variant="primary" @click="back">返回</GlassButton>
      </div>
    </div>

    <transition name="fade">
      <header v-if="showControls" class="player__top">
        <button class="iconbtn" @click="back" aria-label="返回">
          <Icon icon="lucide:chevron-left" width="22" />
        </button>
        <div class="player__title">
          <h2>{{ item?.SeriesName ?? item?.Name }}</h2>
          <p v-if="item?.Type === 'Episode'">
            S{{ item.ParentIndexNumber ?? 1 }}:E{{ item.IndexNumber ?? "?" }} - {{ item.Name }}
          </p>
        </div>
        <div class="player__top-right">
          <button class="iconbtn" title="置顶">
            <Icon icon="lucide:pin" width="18" />
          </button>
        </div>
      </header>
    </transition>

    <transition name="fade">
      <footer v-if="showControls" class="player__bottom">
        <div class="bar">
          <span class="time">{{ fmt(positionMs) }}</span>
          <input
            type="range"
            min="0"
            max="100"
            step="0.05"
            :value="isScrubbing ? scrubPct : progressPct"
            @input="onScrubInput"
            @change="onScrubCommit"
          />
          <span class="time">{{ fmt(durationMs) }}</span>
        </div>

        <div class="controls">
          <div class="controls__left">
            <button
              v-if="player.queue.length > 0"
              class="iconbtn"
              :disabled="player.queueIndex <= 0"
              title="上一集"
              @click="player.prevTrack()"
            >
              <Icon icon="lucide:skip-back" width="20" />
            </button>
            <button class="iconbtn xl primary" @click="togglePlay">
              <Icon :icon="paused ? 'lucide:play' : 'lucide:pause'" width="26" />
            </button>
            <button
              v-if="player.queue.length > 0"
              class="iconbtn"
              :disabled="player.queueIndex + 1 >= player.queue.length"
              title="下一集"
              @click="player.nextTrack()"
            >
              <Icon icon="lucide:skip-forward" width="20" />
            </button>
            <button class="iconbtn" title="音量" @click="toggleMute">
              <Icon icon="lucide:volume-2" width="20" />
            </button>
          </div>

          <div class="controls__right">
            <select
              class="pill-select"
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

            <button class="iconbtn" title="版本">
              <Icon icon="lucide:clapperboard" width="18" />
            </button>

            <div v-if="audioTracks.length > 0" class="menu-wrap">
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
            <button v-else class="iconbtn" title="音轨">
              <Icon icon="lucide:music-2" width="18" />
            </button>

            <div v-if="subTracks.length > 0" class="menu-wrap">
              <button
                class="iconbtn"
                :class="{ active: subtitlePanelOpen }"
                title="字幕"
                @click="subtitlePanelOpen = !subtitlePanelOpen"
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
              :class="{ active: subtitlePanelOpen }"
              title="字幕"
              @click="subtitlePanelOpen = !subtitlePanelOpen"
            >
              <Icon icon="lucide:captions" width="18" />
            </button>

            <button
              class="iconbtn"
              :class="{ active: danmakuEnabled }"
              title="弹幕"
              @click="toggleDanmaku"
            >
              <Icon
                :icon="danmakuLoading ? 'lucide:loader' : 'lucide:message-square-text'"
                width="18"
                :class="{ spin: danmakuLoading }"
              />
            </button>

            <div class="menu-wrap">
              <button
                class="iconbtn"
                :class="{ active: settingsMenuOpen }"
                title="设置"
                @click="settingsMenuOpen = !settingsMenuOpen"
              >
                <Icon icon="lucide:settings" width="18" />
              </button>
              <div v-if="settingsMenuOpen" class="popup-menu">
                <button @click="settingsMenuOpen = false">设置</button>
                <button>缩放模式 ›</button>
                <button>Anime4K <span class="pro">PRO</span> ›</button>
                <label class="popup-row">
                  <span>跳过片头/片尾 <span class="pro">PRO</span></span>
                  <input type="checkbox" disabled />
                </label>
                <button @click="subtitlePanelOpen = true; settingsMenuOpen = false">字幕设置</button>
                <button @click="toggleDanmaku(); settingsMenuOpen = false">弹幕设置</button>
                <button>统计信息</button>
              </div>
            </div>

            <button
              class="iconbtn"
              :class="{ active: episodeMenuOpen }"
              title="选集"
              @click="episodeMenuOpen = !episodeMenuOpen"
            >
              <Icon icon="lucide:list-video" width="18" />
            </button>

            <button class="iconbtn" title="全屏" @click="toggleFullscreen">
              <Icon icon="lucide:maximize" width="18" />
            </button>
          </div>
        </div>
      </footer>
    </transition>
  </main>
</template>

<style scoped>
.player {
  width: 100%;
  height: 100%;
  position: relative;
  background: #000;
  color: white;
  overflow: hidden;
}
/* When embedded, the video area is rendered by a native child window; we
   leave the area fully transparent so the child shows through. */
.player--embedded {
  background: transparent;
}
.player__stage {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}
.player__video {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.player--embedded .player__video {
  background: transparent;
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
}

.player__top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  padding: 0 14px;
  z-index: 5;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.55), transparent);
}
.player__top--always {
  z-index: 8;
  pointer-events: auto;
}
.player__title h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
}
.player__title p {
  margin: 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
}
.player__top-right {
  justify-self: end;
}

.player__bottom {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16px 18px 20px;
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
}
.time {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  font-variant-numeric: tabular-nums;
  min-width: 56px;
  text-align: center;
}
.bar input[type="range"] {
  accent-color: var(--accent);
  width: 100%;
}
.controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.controls__left,
.controls__right {
  display: flex;
  align-items: center;
  gap: 6px;
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
.popup-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
}
.pro {
  font-size: 10px;
  color: var(--accent);
  font-weight: 700;
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
</style>
