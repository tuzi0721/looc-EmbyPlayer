<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Icon } from "@iconify/vue";

import GlassButton from "@/components/common/GlassButton.vue";
import { api } from "@/api";
import { openFileDialog } from "@/platform";
import { usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import type {
  AppSettings,
  EmbySubtitle,
  OnlineSubtitleSearchResult,
  SubtitleStyleSettings,
} from "@/types/models";

const props = defineProps<{ visible: boolean; defaultQuery?: string | null }>();
const emit = defineEmits<{ (e: "close"): void }>();

const player = usePlayerStore();
const settings = useSettingsStore();

const embyTracks = ref<EmbySubtitle[]>([]);
const loading = ref(false);
const ASSRT_TOKEN_KEY = "hills-lite:assrt-token:v1";
const MIN_ONLINE_QUERY_CHARS = 3;
const onlineToken = ref("");
const onlineQuery = ref("");
const onlineResults = ref<OnlineSubtitleSearchResult[]>([]);
const onlineLoading = ref(false);
const onlineError = ref<string | null>(null);
const onlineResolvingId = ref<string | null>(null);
type SubtitleStylePatch = Partial<
  Pick<
    AppSettings,
    | "subtitleScale"
    | "subtitleTextColor"
    | "subtitleOutlineColor"
    | "subtitleOutlineSize"
    | "subtitleShadowOffset"
    | "subtitlePositionPct"
    | "subtitleForceStyle"
  >
>;

const mpvSubs = computed(
  () => player.snapshot?.tracks.filter((t) => t.kind === "subtitle") ?? [],
);
const activeSubId = computed(
  () => mpvSubs.value.find((t) => t.selected)?.id ?? null,
);
const secondarySubId = computed(() => player.snapshot?.secondarySubId ?? null);
const delay = computed({
  get: () => player.snapshot?.subDelayMs ?? 0,
  set: (v) => player.setSubtitleDelay(Math.round(v)),
});
const scale = computed({
  get: () => settings.settings.subtitleScale,
  set: (v) => {
    void saveSubtitleStyle({ subtitleScale: Number(v.toFixed(2)) });
  },
});

const subtitleOutlineSize = computed({
  get: () => settings.settings.subtitleOutlineSize,
  set: (v) => {
    void saveSubtitleStyle({ subtitleOutlineSize: Number(v.toFixed(2)) });
  },
});
const subtitleShadowOffset = computed({
  get: () => settings.settings.subtitleShadowOffset,
  set: (v) => {
    void saveSubtitleStyle({ subtitleShadowOffset: Number(v.toFixed(2)) });
  },
});
const subtitlePositionPct = computed({
  get: () => settings.settings.subtitlePositionPct,
  set: (v) => {
    void saveSubtitleStyle({ subtitlePositionPct: Math.round(v) });
  },
});

function stylePayload(next: AppSettings): SubtitleStyleSettings {
  return {
    scale: next.subtitleScale,
    textColor: next.subtitleTextColor,
    outlineColor: next.subtitleOutlineColor,
    outlineSize: next.subtitleOutlineSize,
    shadowOffset: next.subtitleShadowOffset,
    positionPct: next.subtitlePositionPct,
    forceStyle: next.subtitleForceStyle,
  };
}

async function saveSubtitleStyle(patch: SubtitleStylePatch) {
  const next = { ...settings.settings, ...patch };
  await settings.update(patch);
  await player.setSubtitleStyle(stylePayload(next));
}

async function resetSubtitleStyle() {
  await saveSubtitleStyle({
    subtitleScale: 1,
    subtitleTextColor: "#FFFFFF",
    subtitleOutlineColor: "#000000",
    subtitleOutlineSize: 1.65,
    subtitleShadowOffset: 0,
    subtitlePositionPct: 100,
    subtitleForceStyle: false,
  });
}

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
  const result = (await openFileDialog({
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

function applyDefaultOnlineQuery() {
  if (onlineQuery.value.trim()) return;
  const query = props.defaultQuery?.trim();
  if (query) onlineQuery.value = query;
}

async function searchOnline() {
  const token = onlineToken.value.trim();
  const query = onlineQuery.value.trim();
  onlineError.value = null;
  if (!token) {
    onlineError.value = "需要 ASSRT Token";
    return;
  }
  if (query.length < MIN_ONLINE_QUERY_CHARS) {
    onlineError.value = `请输入至少 ${MIN_ONLINE_QUERY_CHARS} 个字符`;
    return;
  }
  onlineLoading.value = true;
  try {
    window.localStorage.setItem(ASSRT_TOKEN_KEY, token);
    const response = await api.searchOnlineSubtitles({
      provider: "assrt",
      token,
      query,
      limit: 10,
    });
    onlineResults.value = response.results ?? [];
    if (onlineResults.value.length === 0) onlineError.value = "未找到字幕";
  } catch (error: any) {
    onlineResults.value = [];
    onlineError.value = error?.message ?? String(error);
  } finally {
    onlineLoading.value = false;
  }
}

async function attachOnline(result: OnlineSubtitleSearchResult) {
  onlineError.value = null;
  onlineResolvingId.value = result.id;
  try {
    const resolved = await api.resolveOnlineSubtitle({
      provider: "assrt",
      token: onlineToken.value.trim(),
      id: result.id,
    });
    await player.addSubtitle({
      source: resolved.source,
      title: resolved.fileName ?? resolved.title,
      select: true,
    });
  } catch (error: any) {
    onlineError.value = error?.message ?? String(error);
  } finally {
    onlineResolvingId.value = null;
  }
}

async function setActive(id: number | null) {
  if (id != null && id === secondarySubId.value) {
    await player.setSecondarySubtitleTrack(null);
  }
  await player.setSubtitleTrack(id);
}

function setSecondary(id: number | null) {
  if (id != null && id === activeSubId.value) return;
  player.setSecondarySubtitleTrack(id);
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
    if (v) {
      applyDefaultOnlineQuery();
      refresh();
    }
  },
);

watch(
  () => props.defaultQuery,
  () => {
    if (props.visible) applyDefaultOnlineQuery();
  },
);

onMounted(() => {
  onlineToken.value = window.localStorage.getItem(ASSRT_TOKEN_KEY) ?? "";
  applyDefaultOnlineQuery();
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

      <section v-if="mpvSubs.length > 1" class="block">
        <div class="row-head">
          <span>第二字幕</span>
        </div>
        <ul class="tracks">
          <li :class="{ active: secondarySubId == null }" @click="setSecondary(null)">
            <Icon icon="lucide:layers-2" width="14" />
            <span>关闭第二字幕</span>
          </li>
          <li
            v-for="t in mpvSubs"
            :key="`secondary-${t.id}`"
            :class="{ active: secondarySubId === t.id, disabled: activeSubId === t.id }"
            @click="setSecondary(t.id)"
          >
            <Icon icon="lucide:captions" width="14" />
            <span>{{ t.title || t.lang || `字幕 ${t.id}` }}</span>
            <span v-if="activeSubId === t.id" class="tag muted">主字幕</span>
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
          <span>在线字幕</span>
          <button class="ghost" :disabled="onlineLoading" @click="searchOnline">
            <Icon :icon="onlineLoading ? 'lucide:loader' : 'lucide:search'" width="13"
              :class="{ spin: onlineLoading }" />
            <span>搜索</span>
          </button>
        </div>
        <input
          class="field"
          type="password"
          autocomplete="off"
          placeholder="ASSRT Token"
          v-model="onlineToken"
          @keydown.enter="searchOnline"
        />
        <p class="provider-note">
          字幕服务由 <a href="https://assrt.net" target="_blank" rel="noreferrer">assrt.net</a> 提供
        </p>
        <div class="search-row">
          <input
            class="field"
            type="search"
            placeholder="影片名 / 关键词"
            v-model="onlineQuery"
            @keydown.enter="searchOnline"
          />
          <button class="micro" :disabled="onlineLoading" @click="searchOnline">
            <Icon icon="lucide:search" width="13" />
          </button>
        </div>
        <ul class="tracks">
          <li
            v-for="result in onlineResults"
            :key="result.id"
            class="online-result"
            @click="attachOnline(result)"
          >
            <Icon icon="lucide:cloud-download" width="14" />
            <span>
              <span class="result-title">{{ result.title }}</span>
              <span class="result-meta">
                {{ [result.language, result.format, result.releaseSite].filter(Boolean).join(" · ") || "ASSRT" }}
              </span>
            </span>
            <button class="micro" :disabled="onlineResolvingId === result.id" @click.stop="attachOnline(result)">
              <Icon :icon="onlineResolvingId === result.id ? 'lucide:loader' : 'lucide:plus'" width="12"
                :class="{ spin: onlineResolvingId === result.id }" />
            </button>
          </li>
          <li v-if="onlineError" class="hint">{{ onlineError }}</li>
        </ul>
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
        <div class="row-head">
          <span>字幕样式</span>
          <button class="ghost" @click="resetSubtitleStyle">默认</button>
        </div>
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
        <div class="swatch-row">
          <label>
            <span>文字</span>
            <input
              type="color"
              :value="settings.settings.subtitleTextColor"
              @input="(e: any) => saveSubtitleStyle({ subtitleTextColor: e.target.value })"
            />
          </label>
          <label>
            <span>描边</span>
            <input
              type="color"
              :value="settings.settings.subtitleOutlineColor"
              @input="(e: any) => saveSubtitleStyle({ subtitleOutlineColor: e.target.value })"
            />
          </label>
        </div>
        <label class="metric-row">
          <span>描边宽度</span>
          <strong>{{ subtitleOutlineSize.toFixed(2) }}</strong>
          <input
            type="range"
            min="0"
            max="8"
            step="0.05"
            :value="subtitleOutlineSize"
            @input="(e: any) => (subtitleOutlineSize = Number(e.target.value))"
          />
        </label>
        <label class="metric-row">
          <span>阴影偏移</span>
          <strong>{{ subtitleShadowOffset.toFixed(2) }}</strong>
          <input
            type="range"
            min="0"
            max="8"
            step="0.05"
            :value="subtitleShadowOffset"
            @input="(e: any) => (subtitleShadowOffset = Number(e.target.value))"
          />
        </label>
        <label class="metric-row">
          <span>垂直位置</span>
          <strong>{{ subtitlePositionPct }}%</strong>
          <input
            type="range"
            min="70"
            max="100"
            step="1"
            :value="subtitlePositionPct"
            @input="(e: any) => (subtitlePositionPct = Number(e.target.value))"
          />
        </label>
        <label class="toggle-row">
          <span>强制覆盖 ASS</span>
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.subtitleForceStyle"
            @change="(e: any) => saveSubtitleStyle({ subtitleForceStyle: e.target.checked })"
          />
        </label>
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
.tracks li.disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.tracks li.disabled:hover {
  background: rgba(255, 255, 255, 0.04);
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
.tag.muted {
  text-transform: none;
}
.field {
  min-width: 0;
  width: 100%;
  height: 32px;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  padding: 0 10px;
  color: var(--fg-primary);
  background: rgba(255, 255, 255, 0.05);
  outline: none;
}
.field:focus {
  border-color: rgba(10, 132, 255, 0.55);
}
.provider-note {
  margin: -2px 0 0;
  color: var(--fg-tertiary);
  font-size: 10px;
  line-height: 1.4;
}
.provider-note a {
  color: inherit;
}
.search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}
.online-result {
  align-items: start;
}
.result-title,
.result-meta {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.result-meta {
  margin-top: 2px;
  color: var(--fg-tertiary);
  font-size: 10px;
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
.swatch-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.swatch-row label,
.metric-row,
.toggle-row {
  min-width: 0;
  display: grid;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--fg-tertiary);
}
.swatch-row label {
  grid-template-columns: 1fr 34px;
}
.swatch-row input[type="color"] {
  width: 34px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
}
.metric-row {
  grid-template-columns: 1fr 46px;
}
.metric-row input {
  grid-column: 1 / -1;
}
.metric-row strong {
  color: var(--fg-primary);
  font-size: 11px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.toggle-row {
  grid-template-columns: 1fr auto;
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
.switch {
  width: 42px;
  height: 24px;
  appearance: none;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  cursor: pointer;
  position: relative;
  transition: background 180ms var(--easing-glide), border-color 180ms var(--easing-glide);
}
.switch::before {
  content: "";
  position: absolute;
  width: 18px;
  height: 18px;
  top: 2px;
  left: 2px;
  border-radius: 999px;
  background: var(--fg-secondary);
  transition: transform 180ms var(--easing-glide), background 180ms var(--easing-glide);
}
.switch:checked {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.switch:checked::before {
  transform: translateX(18px);
  background: var(--accent);
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
