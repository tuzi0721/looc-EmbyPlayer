<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import { open } from "@tauri-apps/plugin-dialog";

import GlassButton from "@/components/common/GlassButton.vue";
import { api } from "@/api";
import { usePlayerStore } from "@/stores/player";
import type { EmbySubtitle } from "@/types/models";

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: "close"): void }>();

const player = usePlayerStore();

const embyTracks = ref<EmbySubtitle[]>([]);
const loading = ref(false);

const mpvSubs = computed(
  () => player.snapshot?.tracks.filter((t) => t.kind === "subtitle") ?? [],
);
const activeSubId = computed(
  () => mpvSubs.value.find((t) => t.selected)?.id ?? null,
);
const delay = computed({
  get: () => player.snapshot?.subDelayMs ?? 0,
  set: (v) => player.setSubtitleDelay(Math.round(v)),
});
const scale = computed({
  get: () => player.snapshot?.subScale ?? 1,
  set: (v) => player.setSubtitleScale(Number(v.toFixed(2))),
});

async function refresh() {
  loading.value = true;
  try {
    const list = await api.listSubtitles();
    embyTracks.value = list?.tracks ?? [];
  } catch {
    embyTracks.value = [];
  } finally {
    loading.value = false;
  }
}

async function attach(t: EmbySubtitle) {
  await player.addSubtitle({
    source: t.url,
    title: t.displayTitle ?? undefined,
    lang: t.language ?? undefined,
    select: true,
  });
}

async function pickExternal() {
  const result = (await open({
    multiple: false,
    filters: [
      {
        name: "Subtitles",
        extensions: ["srt", "ass", "ssa", "vtt", "sub", "sup", "idx"],
      },
    ],
  })) as string | null;
  if (!result) return;
  await player.addSubtitle({ source: result, select: true });
}

function setActive(id: number | null) {
  player.setSubtitleTrack(id);
}

function nudgeDelay(deltaMs: number) {
  const next = (player.snapshot?.subDelayMs ?? 0) + deltaMs;
  player.setSubtitleDelay(next);
}

function resetDelay() {
  player.setSubtitleDelay(0);
}

watch(
  () => props.visible,
  (v) => {
    if (v) refresh();
  },
);

onMounted(() => {
  if (props.visible) refresh();
});
</script>

<template>
  <transition name="slide-right">
    <aside v-if="visible" class="sub-panel glass glass-strong">
      <header class="head">
        <h3>
          <Icon icon="lucide:captions" width="16" />
          字幕
        </h3>
        <button class="iconbtn" @click="emit('close')" aria-label="Close">
          <Icon icon="lucide:x" width="18" />
        </button>
      </header>

      <section class="block">
        <div class="row-head">
          <span>当前轨道</span>
          <button class="ghost" :disabled="loading" @click="refresh">
            <Icon :icon="loading ? 'lucide:loader' : 'lucide:refresh-cw'" width="13"
              :class="{ spin: loading }" />
          </button>
        </div>

        <ul class="tracks">
          <li :class="{ active: activeSubId == null }" @click="setActive(null)">
            <Icon icon="lucide:eye-off" width="14" />
            <span>关闭字幕</span>
          </li>
          <li
            v-for="t in mpvSubs"
            :key="t.id"
            :class="{ active: t.selected }"
            @click="setActive(t.id)"
          >
            <Icon icon="lucide:captions" width="14" />
            <span>{{ t.title || t.lang || `字幕 ${t.id}` }}</span>
            <button
              class="micro"
              :title="'移除'"
              @click.stop="player.removeSubtitle(t.id)"
            >
              <Icon icon="lucide:trash-2" width="12" />
            </button>
          </li>
        </ul>
      </section>

      <section class="block">
        <div class="row-head">
          <span>来自服务器</span>
          <button class="ghost" :disabled="loading" @click="refresh">
            <Icon icon="lucide:plus" width="13" />
          </button>
        </div>
        <ul class="tracks">
          <li v-for="t in embyTracks" :key="t.index" @click="attach(t)">
            <Icon icon="lucide:download" width="14" />
            <span>{{ t.displayTitle || t.language || `轨道 ${t.index}` }}</span>
            <span v-if="t.isExternal" class="tag">外挂</span>
            <span v-if="t.isForced" class="tag forced">强制</span>
          </li>
          <li v-if="!loading && embyTracks.length === 0" class="hint">
            服务器未提供额外字幕
          </li>
        </ul>
      </section>

      <section class="block">
        <div class="row-head"><span>外挂字幕</span></div>
        <GlassButton variant="secondary" size="md" @click="pickExternal">
          <Icon icon="lucide:folder-open" width="14" />
          选择本地字幕文件
        </GlassButton>
      </section>

      <section class="block">
        <div class="row-head">
          <span>同步</span>
          <button class="ghost" @click="resetDelay">归零</button>
        </div>
        <div class="delay-row">
          <button class="micro" @click="nudgeDelay(-1000)">
            <Icon icon="lucide:chevron-first" width="13" />
          </button>
          <button class="micro" @click="nudgeDelay(-100)">−0.1s</button>
          <span class="delay-value">{{ (delay / 1000).toFixed(2) }}s</span>
          <button class="micro" @click="nudgeDelay(100)">+0.1s</button>
          <button class="micro" @click="nudgeDelay(1000)">
            <Icon icon="lucide:chevron-last" width="13" />
          </button>
        </div>
        <input
          type="range"
          min="-10000"
          max="10000"
          step="50"
          :value="delay"
          @input="(e: any) => (delay = Number(e.target.value))"
        />
      </section>

      <section class="block">
        <div class="row-head"><span>字幕大小</span></div>
        <div class="delay-row">
          <button class="micro" @click="scale = Math.max(0.5, scale - 0.1)">A−</button>
          <span class="delay-value">{{ scale.toFixed(2) }}×</span>
          <button class="micro" @click="scale = Math.min(2.5, scale + 0.1)">A+</button>
        </div>
        <input
          type="range"
          min="0.5"
          max="2.5"
          step="0.05"
          :value="scale"
          @input="(e: any) => (scale = Number(e.target.value))"
        />
      </section>
    </aside>
  </transition>
</template>

<style scoped>
.sub-panel {
  position: absolute;
  right: 12px;
  top: 64px;
  bottom: 140px;
  width: 320px;
  border-radius: 22px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  z-index: 8;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.head h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--fg-secondary);
  text-transform: uppercase;
}
.iconbtn {
  appearance: none;
  background: transparent;
  border: none;
  color: var(--fg-secondary);
  width: 28px;
  height: 28px;
  border-radius: 8px;
  cursor: pointer;
}
.iconbtn:hover {
  background: rgba(255, 255, 255, 0.08);
}
.block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.row-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--fg-tertiary);
}
.row-head .ghost {
  appearance: none;
  background: transparent;
  border: none;
  color: var(--fg-secondary);
  font-size: 11px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.tracks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tracks li {
  display: grid;
  grid-template-columns: 16px 1fr auto auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  cursor: pointer;
  color: var(--fg-primary);
}
.tracks li:hover {
  background: rgba(255, 255, 255, 0.08);
}
.tracks li.active {
  background: rgba(10, 132, 255, 0.18);
  color: var(--accent);
}
.tracks li.hint {
  color: var(--fg-tertiary);
  cursor: default;
  background: transparent;
  font-style: italic;
}
.tag {
  font-size: 10px;
  text-transform: uppercase;
  color: var(--fg-tertiary);
  padding: 1px 6px;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
}
.tag.forced {
  color: #ff9f0a;
  border-color: rgba(255, 159, 10, 0.4);
}
.delay-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}
.delay-value {
  flex: 1;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-size: 13px;
}
.micro {
  appearance: none;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  color: var(--fg-primary);
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.micro:hover {
  background: rgba(255, 255, 255, 0.12);
}
input[type="range"] {
  width: 100%;
  accent-color: var(--accent);
}

.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 220ms var(--easing-glide), opacity 220ms var(--easing-glide);
}
.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(20px);
  opacity: 0;
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
