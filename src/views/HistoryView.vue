<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

import PosterCard from "@/components/common/PosterCard.vue";
import { useAuthStore } from "@/stores/auth";
import { useSettingsStore } from "@/stores/settings";
import type { MediaItem } from "@/types/models";
import { filterJavItems } from "@/utils/javFilter";
import { fetchPersonalHistory, mergeMediaItems } from "@/utils/personalMedia";
import { mediaItemKey, openMediaItemFromSource } from "@/utils/sourceContext";

type HistoryFilter = "all" | "movie" | "episode";

const PAGE_SIZE = 120;

const router = useRouter();
const auth = useAuthStore();
const settings = useSettingsStore();

const filter = ref<HistoryFilter>("all");
const items = ref<MediaItem[]>([]);
const total = ref(0);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref<string | null>(null);
const rawLoaded = ref(0);

const hasAccount = computed(() => !!auth.activeAccount);
const canLoadMore = computed(() => hasAccount.value && items.value.length < total.value);

const filters: Array<{ id: HistoryFilter; label: string; icon: string }> = [
  { id: "all", label: "全部", icon: "lucide:clock-3" },
  { id: "movie", label: "电影", icon: "lucide:clapperboard" },
  { id: "episode", label: "剧集", icon: "lucide:tv" },
];

function includeTypesFor(value: HistoryFilter): "Movie,Episode" | "Movie" | "Episode" {
  if (value === "movie") return "Movie";
  if (value === "episode") return "Episode";
  return "Movie,Episode";
}

function loadErrorMessage(value: unknown) {
  if (value instanceof Error && value.message) return value.message;
  if (typeof value === "string" && value.trim()) return value;
  return "播放历史加载失败";
}

async function loadHistory(reset = true) {
  if (!hasAccount.value) {
    items.value = [];
    total.value = 0;
    rawLoaded.value = 0;
    error.value = null;
    return;
  }

  if (reset) {
    loading.value = true;
    items.value = [];
    total.value = 0;
    rawLoaded.value = 0;
  } else {
    loadingMore.value = true;
  }
  error.value = null;

  try {
    const r = await fetchPersonalHistory({
      includeTypes: includeTypesFor(filter.value),
      startIndex: reset ? 0 : rawLoaded.value,
      limit: PAGE_SIZE,
      includeResume: reset,
    });
    const filteredItems = filterJavItems(r.Items, settings.settings.hideJavCodes);
    rawLoaded.value = (reset ? 0 : rawLoaded.value) + r.playedLoaded;
    items.value = reset ? filteredItems : mergeMediaItems([items.value, filteredItems]);
    const rawTotal = r.TotalRecordCount ?? rawLoaded.value;
    total.value = settings.settings.hideJavCodes
      ? items.value.length + (rawLoaded.value < rawTotal ? 1 : 0)
      : rawTotal;
  } catch (e) {
    error.value = loadErrorMessage(e);
    if (reset) {
      items.value = [];
      total.value = 0;
      rawLoaded.value = 0;
    }
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function openItem(item: MediaItem) {
  openMediaItemFromSource(router, auth, item).catch(() => {});
}

function itemKind(item: MediaItem) {
  if (item.Type === "Episode") return "剧集";
  if (item.Type === "Movie") return "电影";
  return item.Type ?? "媒体";
}

function episodeLine(item: MediaItem) {
  if (item.Type !== "Episode") return null;
  const season = item.ParentIndexNumber == null ? "?" : String(item.ParentIndexNumber).padStart(2, "0");
  const episode = item.IndexNumber == null ? "?" : String(item.IndexNumber).padStart(2, "0");
  return `${item.SeriesName ?? "剧集"} · S${season}E${episode}`;
}

function playedDate(item: MediaItem) {
  const raw = item.UserData?.LastPlayedDate;
  if (!raw) return "最近看过";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "最近看过";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function progressLabel(item: MediaItem) {
  const progress = item.UserData?.PlayedPercentage ?? 0;
  if (item.UserData?.Played) return "已看完";
  if (progress > 0 && progress < 100) return `${Math.round(progress)}%`;
  return null;
}

onMounted(() => void loadHistory());
watch(() => auth.activeId, () => void loadHistory());
watch(filter, () => void loadHistory());
watch(() => settings.settings.hideJavCodes, () => void loadHistory());
</script>

<template>
  <section class="history">
    <header class="history__head">
      <div>
        <h1>播放历史</h1>
        <p v-if="hasAccount" class="history__sub">
          {{ items.length }} / {{ total || items.length }} 项
        </p>
      </div>

      <div class="history__tools">
        <div class="segmented" role="tablist" aria-label="历史类型">
          <button
            v-for="entry in filters"
            :key="entry.id"
            type="button"
            :class="{ active: filter === entry.id }"
            :aria-selected="filter === entry.id"
            role="tab"
            @click="filter = entry.id"
          >
            <Icon :icon="entry.icon" width="14" />
            <span>{{ entry.label }}</span>
          </button>
        </div>

        <button
          type="button"
          class="iconbtn"
          :disabled="loading"
          title="刷新"
          @click="loadHistory()"
        >
          <Icon icon="lucide:refresh-cw" width="16" :class="{ spin: loading }" />
        </button>
      </div>
    </header>

    <div class="history__body">
      <div v-if="!hasAccount" class="empty">
        <Icon icon="lucide:user-x" width="28" />
        <p>请先登录到服务器</p>
      </div>

      <div v-else-if="loading" class="empty">
        <Icon icon="lucide:loader" width="22" class="spin" />
        <p>正在读取播放历史</p>
      </div>

      <div v-else-if="error" class="empty empty--error">
        <Icon icon="lucide:triangle-alert" width="28" />
        <p>{{ error }}</p>
        <button type="button" class="retry" @click="loadHistory()">重试</button>
      </div>

      <div v-else-if="items.length === 0" class="empty">
        <Icon icon="lucide:history" width="28" />
        <p>还没有播放历史</p>
        <span class="hint">开始播放电影或剧集后，这里会按最近观看时间排列</span>
      </div>

      <template v-else>
        <div class="history-grid">
          <article v-for="item in items" :key="mediaItemKey(item)" class="history-card">
            <PosterCard
              :item="item"
              aspect="backdrop"
              @activate="openItem(item)"
            />
            <div class="history-card__meta">
              <span class="history-card__date">
                <Icon icon="lucide:clock-3" width="12" />
                {{ playedDate(item) }}
              </span>
              <span class="history-card__kind">{{ itemKind(item) }}</span>
              <span v-if="progressLabel(item)" class="history-card__progress">
                {{ progressLabel(item) }}
              </span>
            </div>
            <p v-if="episodeLine(item)" class="history-card__episode">
              {{ episodeLine(item) }}
            </p>
          </article>
        </div>

        <div v-if="canLoadMore" class="history__more">
          <button type="button" class="load-more" :disabled="loadingMore" @click="loadHistory(false)">
            <Icon
              :icon="loadingMore ? 'lucide:loader' : 'lucide:chevrons-down'"
              width="16"
              :class="{ spin: loadingMore }"
            />
            {{ loadingMore ? "加载中" : "加载更多" }}
          </button>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.history {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.history__head {
  padding: 18px var(--content-pad) 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}
.history__head h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0;
}
.history__sub {
  margin: 4px 0 0;
  color: var(--fg-tertiary);
  font-size: 12px;
}
.history__tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.segmented {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--separator);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
}
.segmented button,
.iconbtn,
.retry,
.load-more {
  appearance: none;
  color: inherit;
  cursor: pointer;
  font: inherit;
}
.segmented button {
  border: none;
  background: transparent;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--fg-secondary);
  font-size: 12px;
}
.segmented button:hover {
  color: var(--fg-primary);
  background: rgba(255, 255, 255, 0.06);
}
.segmented button.active {
  color: var(--accent);
  background: rgba(10, 132, 255, 0.16);
}
.iconbtn {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--separator);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--fg-secondary);
}
.iconbtn:hover {
  color: var(--fg-primary);
  background: rgba(255, 255, 255, 0.08);
}
.iconbtn:disabled {
  cursor: progress;
  opacity: 0.68;
}
.history__body {
  flex: 1;
  overflow-y: auto;
  padding: 12px var(--content-pad) 40px;
}
.history-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 18px;
}
.history-card {
  min-width: 0;
}
.history-card__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 7px;
  min-height: 22px;
}
.history-card__date,
.history-card__kind,
.history-card__progress {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 22px;
  max-width: 100%;
  padding: 3px 7px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--fg-secondary);
  font-size: 11px;
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-card__date {
  background: rgba(255, 255, 255, 0.05);
}
.history-card__kind {
  color: var(--accent);
  border-color: rgba(10, 132, 255, 0.26);
  background: rgba(10, 132, 255, 0.12);
}
.history-card__progress {
  color: var(--success);
  border-color: rgba(48, 209, 88, 0.24);
  background: rgba(48, 209, 88, 0.11);
}
.history-card__episode {
  margin: 3px 0 0;
  color: var(--fg-tertiary);
  font-size: 11px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.history__more {
  display: flex;
  justify-content: center;
  padding: 28px 0 4px;
}
.load-more,
.retry {
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--fg-primary);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 13px;
  font-size: 13px;
}
.load-more:hover,
.retry:hover {
  border-color: rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.1);
}
.load-more:disabled {
  cursor: progress;
  opacity: 0.72;
}
.empty {
  height: 60vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--fg-tertiary);
  text-align: center;
  font-size: 14px;
}
.empty p {
  max-width: min(640px, 100%);
  margin: 0;
  overflow-wrap: anywhere;
}
.empty .hint {
  color: var(--fg-quaternary);
  font-size: 12px;
}
.empty--error p {
  color: var(--danger);
}
.spin {
  animation: spin 800ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 720px) {
  .history__head {
    align-items: stretch;
  }
  .history__tools {
    width: 100%;
    justify-content: space-between;
  }
  .segmented {
    flex: 1;
  }
  .segmented button {
    flex: 1;
    justify-content: center;
    padding: 0 7px;
  }
  .history-grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 14px;
  }
}
</style>
