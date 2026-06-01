<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

import { api } from "@/api";
import PosterCard from "@/components/common/PosterCard.vue";
import { useAuthStore } from "@/stores/auth";
import { useSettingsStore } from "@/stores/settings";
import type { MediaItem } from "@/types/models";
import { filterJavItems } from "@/utils/javFilter";
import { fetchFavoriteItems, fetchPersonalHistory } from "@/utils/personalMedia";
import { mediaItemKey, openMediaItemFromSource } from "@/utils/sourceContext";

type AggregateTab = "overview" | "favorites" | "history";

const router = useRouter();
const auth = useAuthStore();
const settings = useSettingsStore();

const activeTab = ref<AggregateTab>("overview");
const searchTerm = ref("");
const searching = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const resumeItems = ref<MediaItem[]>([]);
const favoriteItems = ref<MediaItem[]>([]);
const historyItems = ref<MediaItem[]>([]);
const searchResults = ref<MediaItem[]>([]);

let searchTimer: number | null = null;

const hasAccount = computed(() => !!auth.activeAccount);
const hasAnyContent = computed(
  () => resumeItems.value.length > 0 || favoriteItems.value.length > 0 || historyItems.value.length > 0,
);
const isSearchingView = computed(() => searchTerm.value.trim().length > 0);

const tabs: Array<{ id: AggregateTab; label: string; icon: string }> = [
  { id: "overview", label: "概览", icon: "lucide:layout-dashboard" },
  { id: "favorites", label: "收藏", icon: "lucide:heart" },
  { id: "history", label: "历史", icon: "lucide:history" },
];

function formatCount(count: number) {
  return `${count} 项`;
}

function openItem(item: MediaItem) {
  openMediaItemFromSource(router, auth, item).catch(() => {});
}

function gotoFavorites() {
  router.push("/favorites").catch(() => {});
}

function gotoHistory() {
  router.push("/history").catch(() => {});
}

function itemAspect(item: MediaItem): "backdrop" | "auto" {
  return item.Type === "Episode" ? "backdrop" : "auto";
}

function emptyMessage() {
  if (activeTab.value === "favorites") return "还没有收藏";
  if (activeTab.value === "history") return "还没有播放历史";
  return "暂无可聚合内容";
}

async function loadAggregate() {
  if (!hasAccount.value) {
    resumeItems.value = [];
    favoriteItems.value = [];
    historyItems.value = [];
    searchResults.value = [];
    error.value = null;
    return;
  }

  loading.value = true;
  error.value = null;
  const [resume, favorites, history] = await Promise.allSettled([
    api.resumeItemsAllAccounts(),
    fetchFavoriteItems(36),
    fetchPersonalHistory({ limit: 36 }),
  ]);

  if (resume.status === "fulfilled") {
    resumeItems.value = filterJavItems(resume.value.Items, settings.settings.hideJavCodes).slice(0, 24);
  }
  else resumeItems.value = [];

  if (favorites.status === "fulfilled") {
    favoriteItems.value = filterJavItems(favorites.value.Items, settings.settings.hideJavCodes).slice(0, 36);
  }
  else favoriteItems.value = [];

  if (history.status === "fulfilled") {
    historyItems.value = filterJavItems(history.value.Items, settings.settings.hideJavCodes).slice(0, 36);
  }
  else historyItems.value = [];

  if (resume.status === "rejected" && favorites.status === "rejected" && history.status === "rejected") {
    error.value = "聚合内容加载失败";
  }
  loading.value = false;
}

function onSearchInput() {
  if (searchTimer != null) window.clearTimeout(searchTimer);
  const term = searchTerm.value.trim();
  if (!term) {
    searchResults.value = [];
    searching.value = false;
    return;
  }

  searching.value = true;
  searchTimer = window.setTimeout(async () => {
    try {
      const result = await api.searchAllAccounts(term);
      if (searchTerm.value.trim() === term) {
        searchResults.value = filterJavItems(result.Items, settings.settings.hideJavCodes);
      }
    } catch {
      if (searchTerm.value.trim() === term) searchResults.value = [];
    } finally {
      if (searchTerm.value.trim() === term) searching.value = false;
    }
  }, 260);
}

onMounted(() => void loadAggregate());
watch(() => auth.activeId, () => void loadAggregate());
watch(() => settings.settings.hideJavCodes, () => void loadAggregate());
</script>

<template>
  <section class="aggregate">
    <header class="aggregate__head">
      <div>
        <h1>聚合视界</h1>
        <p v-if="hasAccount" class="aggregate__count">
          {{ formatCount(resumeItems.length + favoriteItems.length + historyItems.length) }}
        </p>
      </div>

      <div class="aggregate__tools">
        <label class="search">
          <Icon icon="lucide:search" width="15" />
          <input
            v-model="searchTerm"
            type="search"
            placeholder="搜索电影、剧集"
            @input="onSearchInput"
          />
          <Icon v-if="searching" icon="lucide:loader" width="14" class="spin" />
        </label>
        <button type="button" class="iconbtn" :disabled="loading" title="刷新" @click="loadAggregate()">
          <Icon icon="lucide:refresh-cw" width="16" :class="{ spin: loading }" />
        </button>
      </div>
    </header>

    <div class="tabs" role="tablist" aria-label="聚合视图">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.id"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        <Icon :icon="tab.icon" width="14" />
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <main class="aggregate__body">
      <div v-if="!hasAccount" class="empty">
        <Icon icon="lucide:user-x" width="28" />
        <p>请先登录到服务器</p>
      </div>

      <div v-else-if="loading && !hasAnyContent" class="empty">
        <Icon icon="lucide:loader" width="22" class="spin" />
        <p>正在加载聚合内容</p>
      </div>

      <div v-else-if="error && !hasAnyContent" class="empty empty--error">
        <Icon icon="lucide:triangle-alert" width="28" />
        <p>{{ error }}</p>
        <button type="button" class="retry" @click="loadAggregate()">重试</button>
      </div>

      <section v-else-if="isSearchingView" class="aggregate-section">
        <header class="section-head">
          <h2>搜索结果</h2>
          <span>{{ searching ? "搜索中" : formatCount(searchResults.length) }}</span>
        </header>
        <div v-if="!searching && searchResults.length === 0" class="empty empty--compact">
          <Icon icon="lucide:search-x" width="26" />
          <p>没有匹配结果</p>
        </div>
        <div v-else class="grid">
          <PosterCard
            v-for="item in searchResults"
            :key="mediaItemKey(item)"
            :item="item"
            :aspect="itemAspect(item)"
            @activate="openItem(item)"
          />
        </div>
      </section>

      <template v-else-if="activeTab === 'overview'">
        <section v-if="resumeItems.length" class="aggregate-section">
          <header class="section-head">
            <h2>继续观看</h2>
            <span>{{ formatCount(resumeItems.length) }}</span>
          </header>
          <div class="row-scroll">
            <PosterCard
              v-for="item in resumeItems"
              :key="mediaItemKey(item)"
              :item="item"
              aspect="backdrop"
              @activate="openItem(item)"
            />
          </div>
        </section>

        <section v-if="favoriteItems.length" class="aggregate-section">
          <header class="section-head">
            <h2>收藏</h2>
            <button type="button" class="link-btn" @click="gotoFavorites">
              <Icon icon="lucide:arrow-right" width="13" />
            </button>
          </header>
          <div class="row-scroll row-scroll--poster">
            <PosterCard
              v-for="item in favoriteItems.slice(0, 18)"
              :key="mediaItemKey(item)"
              :item="item"
              :aspect="itemAspect(item)"
              @activate="openItem(item)"
            />
          </div>
        </section>

        <section v-if="historyItems.length" class="aggregate-section">
          <header class="section-head">
            <h2>最近看过</h2>
            <button type="button" class="link-btn" @click="gotoHistory">
              <Icon icon="lucide:arrow-right" width="13" />
            </button>
          </header>
          <div class="row-scroll row-scroll--poster">
            <PosterCard
              v-for="item in historyItems.slice(0, 18)"
              :key="mediaItemKey(item)"
              :item="item"
              :aspect="itemAspect(item)"
              @activate="openItem(item)"
            />
          </div>
        </section>

        <div v-if="!hasAnyContent" class="empty">
          <Icon icon="lucide:inbox" width="28" />
          <p>{{ emptyMessage() }}</p>
        </div>
      </template>

      <section v-else class="aggregate-section">
        <header class="section-head">
          <h2>{{ activeTab === "favorites" ? "收藏" : "最近看过" }}</h2>
          <span>{{ formatCount((activeTab === "favorites" ? favoriteItems : historyItems).length) }}</span>
        </header>
        <div v-if="(activeTab === 'favorites' ? favoriteItems : historyItems).length === 0" class="empty empty--compact">
          <Icon :icon="activeTab === 'favorites' ? 'lucide:heart-off' : 'lucide:history'" width="26" />
          <p>{{ emptyMessage() }}</p>
        </div>
        <div v-else class="grid">
          <PosterCard
            v-for="item in activeTab === 'favorites' ? favoriteItems : historyItems"
            :key="mediaItemKey(item)"
            :item="item"
            :aspect="itemAspect(item)"
            @activate="openItem(item)"
          />
        </div>
      </section>
    </main>
  </section>
</template>

<style scoped>
.aggregate {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.aggregate__head {
  padding: 18px var(--content-pad) 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}
.aggregate__head h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0;
}
.aggregate__count {
  margin: 4px 0 0;
  color: var(--fg-tertiary);
  font-size: 12px;
}
.aggregate__tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.search {
  width: min(360px, calc(100vw - 48px));
  min-height: 36px;
  display: grid;
  grid-template-columns: 20px 1fr 18px;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--separator);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--fg-tertiary);
}
.search input {
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--fg-primary);
  font: inherit;
  font-size: 13px;
}
.search input::placeholder {
  color: var(--fg-tertiary);
}
.iconbtn,
.tabs button,
.link-btn,
.retry {
  appearance: none;
  color: inherit;
  cursor: pointer;
  font: inherit;
}
.iconbtn {
  width: 36px;
  height: 36px;
  border: 1px solid var(--separator);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--fg-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.iconbtn:hover,
.link-btn:hover,
.retry:hover {
  color: var(--fg-primary);
  background: rgba(255, 255, 255, 0.1);
}
.iconbtn:disabled {
  cursor: progress;
  opacity: 0.68;
}
.tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 var(--content-pad) 10px;
  overflow-x: auto;
}
.tabs button {
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--fg-secondary);
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 11px;
  font-size: 12px;
}
.tabs button:hover {
  color: var(--fg-primary);
  background: rgba(255, 255, 255, 0.06);
}
.tabs button.active {
  color: var(--accent);
  border-color: rgba(10, 132, 255, 0.26);
  background: rgba(10, 132, 255, 0.14);
}
.aggregate__body {
  flex: 1;
  overflow-y: auto;
  padding: 8px var(--content-pad) 40px;
}
.aggregate-section {
  margin-bottom: 26px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 13px;
}
.section-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0;
}
.section-head span {
  color: var(--fg-tertiary);
  font-size: 12px;
}
.link-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--separator);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--fg-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.row-scroll {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(220px, 260px);
  gap: 14px;
  overflow-x: auto;
  padding-bottom: 8px;
}
.row-scroll--poster {
  grid-auto-columns: minmax(132px, 156px);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(145px, 1fr));
  gap: 18px;
}
.empty {
  min-height: 48vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--fg-tertiary);
  text-align: center;
  font-size: 14px;
}
.empty--compact {
  min-height: 240px;
}
.empty p {
  max-width: min(580px, 100%);
  margin: 0;
  overflow-wrap: anywhere;
}
.empty--error p {
  color: var(--danger);
}
.retry {
  min-height: 34px;
  padding: 0 13px;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--fg-primary);
  font-size: 13px;
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
  .aggregate__head {
    align-items: stretch;
  }
  .aggregate__tools,
  .search {
    width: 100%;
  }
  .tabs {
    padding-top: 2px;
  }
  .tabs button {
    flex: 1 0 auto;
    justify-content: center;
  }
  .row-scroll {
    grid-auto-columns: minmax(190px, 220px);
  }
  .row-scroll--poster {
    grid-auto-columns: minmax(128px, 148px);
  }
  .grid {
    grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
    gap: 14px;
  }
}
</style>
