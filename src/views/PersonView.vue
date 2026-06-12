<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

import { api } from "@/api";
import GlassNavBar from "@/components/common/GlassNavBar.vue";
import PosterCard from "@/components/common/PosterCard.vue";
import { useSettingsStore } from "@/stores/settings";
import type { MediaItem } from "@/types/models";
import { filterJavItems } from "@/utils/javFilter";

const props = defineProps<{ id: string }>();
const route = useRoute();
const router = useRouter();
const settings = useSettingsStore();

const PAGE_SIZE = 48;

const sortBy = ref<"SortName" | "PremiereDate" | "DateCreated" | "CommunityRating" | "Bitrate">("PremiereDate");
const sortOrder = ref<"Ascending" | "Descending">("Descending");
const items = ref<MediaItem[]>([]);
const total = ref(0);
const loading = ref(false);
const loadingMore = ref(false);
const loadError = ref<string | null>(null);
const scroller = ref<HTMLElement | null>(null);
const rawLoaded = ref(0);

let scrollTimer: number | null = null;

const personName = computed(() => {
  const queryName = typeof route.query.name === "string" ? route.query.name.trim() : "";
  if (queryName) return queryName;
  if (props.id.startsWith("name:")) return props.id.slice(5);
  return "Person";
});

const hasMore = computed(() => items.value.length < total.value);

function personFilter(): [string, string] {
  if (props.id.startsWith("name:")) return ["Person", props.id.slice(5)];
  return ["PersonIds", props.id];
}

function baseParams(startIndex = 0): [string, string][] {
  return [
    personFilter(),
    ["Recursive", "true"],
    ["IncludeItemTypes", "Movie,Series"],
    ["Fields", "PrimaryImageAspectRatio,Overview,ProductionYear,People,Studios,UserData"],
    ["SortBy", sortBy.value],
    ["SortOrder", sortOrder.value],
    ["Limit", String(PAGE_SIZE)],
    ["StartIndex", String(startIndex)],
  ];
}

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const response = await api.listItems({ params: baseParams() });
    const filteredItems = filterJavItems(response.Items, settings.settings.hideJavCodes);
    rawLoaded.value = response.Items.length;
    items.value = filteredItems;
    const rawTotal = response.TotalRecordCount ?? response.Items.length;
    total.value = settings.settings.hideJavCodes
      ? filteredItems.length + (rawLoaded.value < rawTotal ? 1 : 0)
      : rawTotal;
  } catch (error) {
    loadError.value = String(error);
    items.value = [];
    total.value = 0;
    rawLoaded.value = 0;
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loadingMore.value || loading.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    const response = await api.listItems({ params: baseParams(rawLoaded.value) });
    const filteredItems = filterJavItems(response.Items, settings.settings.hideJavCodes);
    rawLoaded.value += response.Items.length;
    items.value = [...items.value, ...filteredItems];
    const rawTotal = response.TotalRecordCount ?? rawLoaded.value;
    total.value = settings.settings.hideJavCodes
      ? items.value.length + (rawLoaded.value < rawTotal ? 1 : 0)
      : rawTotal;
  } finally {
    loadingMore.value = false;
  }
}

function onScroll() {
  if (scrollTimer != null) window.clearTimeout(scrollTimer);
  scrollTimer = window.setTimeout(() => {
    scrollTimer = null;
    const el = scroller.value;
    if (!el) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining < 420) void loadMore();
  }, 120);
}

function openItem(id: string) {
  router.push(`/item/${id}`).catch(() => {});
}

onMounted(load);
watch([() => props.id, sortBy, sortOrder, () => settings.settings.hideJavCodes], load);

onBeforeUnmount(() => {
  if (scrollTimer != null) window.clearTimeout(scrollTimer);
});
</script>

<template>
  <main class="person">
    <GlassNavBar show-back>
      <template #title>{{ personName }}</template>
      <template #right>
        <div class="sort">
          <select v-model="sortBy" class="select">
            <option value="SortName">名称</option>
            <option value="PremiereDate">上映日期</option>
            <option value="DateCreated">添加日期</option>
            <option value="CommunityRating">评分</option>
            <option value="Bitrate">比特率</option>
          </select>
          <button
            class="iconbtn"
            type="button"
            @click="sortOrder = sortOrder === 'Ascending' ? 'Descending' : 'Ascending'"
          >
            <Icon :icon="sortOrder === 'Ascending' ? 'lucide:arrow-down-az' : 'lucide:arrow-down-za'" width="18" />
          </button>
        </div>
      </template>
    </GlassNavBar>

    <section class="person__head">
      <p>{{ total }} 部作品</p>
    </section>

    <section class="person__content">
      <div v-if="loading && items.length === 0" class="person__empty">
        <Icon icon="lucide:loader" width="22" class="spin" />
        <span>加载中</span>
      </div>
      <div v-else-if="loadError" class="person__empty person__empty--error">
        <Icon icon="lucide:triangle-alert" width="22" />
        <span>{{ loadError }}</span>
      </div>
      <div v-else-if="items.length === 0" class="person__empty">
        <Icon icon="lucide:inbox" width="22" />
        <span>暂无作品</span>
      </div>
      <div v-else ref="scroller" class="person__grid" @scroll.passive="onScroll">
        <PosterCard
          v-for="item in items"
          :key="item.Id"
          :item="item"
          :activate-handler="() => openItem(item.Id)"
        />
      </div>

      <div v-if="items.length > 0 && hasMore" class="person__more">
        <Icon v-if="loadingMore" icon="lucide:loader" width="16" class="spin" />
        <span>{{ loadingMore ? "加载中" : `${items.length} / ${total}` }}</span>
      </div>
    </section>
  </main>
</template>

<style scoped>
.person {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.person__head {
  padding: 18px var(--content-pad) 8px;
}
.person__head p {
  margin: 0;
  color: var(--fg-secondary);
  font-size: 13px;
}
.person__content {
  flex: 1;
  min-height: 0;
  padding: 8px var(--content-pad) 36px;
  display: flex;
  flex-direction: column;
}
.person__grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
  gap: 16px;
  align-content: start;
}
.person__empty {
  flex: 1;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 10px;
  color: var(--fg-tertiary);
  text-align: center;
  padding: 24px;
  font-size: 13px;
}
.person__empty--error {
  color: var(--danger);
}
.person__more {
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--fg-tertiary);
  font-size: 12px;
}
.sort {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.select {
  appearance: none;
  background: var(--glass-bg-strong);
  border: 1px solid var(--glass-border);
  color: var(--fg-primary);
  border-radius: 10px;
  padding: 6px 28px 6px 10px;
  font-size: 13px;
  background-image:
    linear-gradient(45deg, transparent 50%, var(--fg-secondary) 50%),
    linear-gradient(135deg, var(--fg-secondary) 50%, transparent 50%);
  background-position:
    calc(100% - 14px) 50%,
    calc(100% - 10px) 50%;
  background-size: 4px 4px;
  background-repeat: no-repeat;
}
.iconbtn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--fg-primary);
  height: 32px;
  width: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  cursor: pointer;
}
.iconbtn:hover {
  background: var(--surface-hover);
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
