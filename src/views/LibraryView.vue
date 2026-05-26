<script setup lang="ts">

import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { useRouter } from "vue-router";

import { Icon } from "@iconify/vue";



import GlassNavBar from "@/components/common/GlassNavBar.vue";

import PosterCard from "@/components/common/PosterCard.vue";

import { useLibraryStore } from "@/stores/library";



const props = defineProps<{ id: string }>();

const router = useRouter();

const lib = useLibraryStore();



const sortBy = ref<"SortName" | "PremiereDate" | "DateCreated" | "CommunityRating">("SortName");

const sortOrder = ref<"Ascending" | "Descending">("Ascending");

const loading = ref(false);

const loadingMore = ref(false);

const scroller = ref<HTMLElement | null>(null);



const PAGE_SIZE = 48;



const items = computed(() => lib.itemsByParent[props.id] ?? []);

const total = computed(() => lib.totalByParent[props.id] ?? items.value.length);

const hasMore = computed(() => items.value.length < total.value);



let scrollTimer: number | null = null;



function baseParams(): [string, string][] {

  return [

    ["SortBy", sortBy.value],

    ["SortOrder", sortOrder.value],

    ["Recursive", "true"],

    ["IncludeItemTypes", "Movie,Series"],

    ["Fields", "PrimaryImageAspectRatio,Overview,ProductionYear"],

    ["Limit", String(PAGE_SIZE)],

  ];

}



async function load() {

  loading.value = true;

  try {

    await lib.loadParent(props.id, baseParams());

  } finally {

    loading.value = false;

  }

}



async function loadMore() {

  if (loadingMore.value || !hasMore.value) return;

  loadingMore.value = true;

  try {

    await lib.loadMore(props.id, baseParams());

  } finally {

    loadingMore.value = false;

  }

}



function onScroll() {

  if (scrollTimer != null) window.clearTimeout(scrollTimer);

  scrollTimer = window.setTimeout(() => {

    scrollTimer = null;

    const el = scroller.value;

    if (!el || loadingMore.value || !hasMore.value) return;

    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;

    if (remaining < 400) void loadMore();

  }, 120);

}



onMounted(load);

watch(() => props.id, load);

watch([sortBy, sortOrder], load);



onBeforeUnmount(() => {

  if (scrollTimer != null) window.clearTimeout(scrollTimer);

});



function openItem(id: string) {

  router.push(`/item/${id}`).catch(() => {});

}

</script>



<template>

  <main class="lib">

    <GlassNavBar show-back>

      <template #title>媒体库</template>

      <template #right>

        <div class="sort">

          <select v-model="sortBy" class="select">

            <option value="SortName">名称</option>

            <option value="PremiereDate">上映日期</option>

            <option value="DateCreated">添加日期</option>

            <option value="CommunityRating">评分</option>

          </select>

          <button class="iconbtn" @click="sortOrder = sortOrder === 'Ascending' ? 'Descending' : 'Ascending'">

            <Icon :icon="sortOrder === 'Ascending' ? 'lucide:arrow-down-az' : 'lucide:arrow-down-za'" width="18" />

          </button>

        </div>

      </template>

    </GlassNavBar>



    <div class="content">

      <div v-if="loading && items.length === 0" class="empty">

        <Icon icon="lucide:loader" class="spin" width="22" />

        <span>加载中…</span>

      </div>

      <div v-else-if="items.length === 0" class="empty">

        <Icon icon="lucide:inbox" width="22" />

        <span>这里空空如也</span>

      </div>

      <div v-else ref="scroller" class="grid" @scroll.passive="onScroll">

        <PosterCard

          v-for="item in items"

          :key="item.Id"

          :item="item"

          @activate="openItem(item.Id)"

        />

      </div>

      <div v-if="items.length > 0 && hasMore" class="more">

        <span v-if="loadingMore" class="dim">加载中…</span>

        <span v-else class="dim">{{ items.length }} / {{ total }}</span>

      </div>

    </div>

  </main>

</template>



<style scoped>

.lib {

  width: 100%;

  height: 100%;

  display: flex;

  flex-direction: column;

}

.content {

  flex: 1;

  overflow: hidden;

  padding: 20px var(--content-pad) 40px;

  display: flex;

  flex-direction: column;

  min-height: 0;

}

.grid {

  flex: 1;

  min-height: 0;

  overflow-y: auto;

  display: grid;

  grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));

  gap: 16px;

  align-content: start;

}

.more {

  text-align: center;

  font-size: 12px;

  padding: 8px 0;

  flex-shrink: 0;

}

.dim {

  color: var(--fg-tertiary);

}

.sort {

  display: inline-flex;

  align-items: center;

  gap: 6px;

}

.select {

  appearance: none;

  background: rgba(28, 28, 32, 0.92);

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

  border-radius: 10px;

  cursor: pointer;

}

.iconbtn:hover {

  background: rgba(255, 255, 255, 0.06);

}

.empty {

  display: flex;

  align-items: center;

  justify-content: center;

  flex-direction: column;

  gap: 10px;

  color: var(--fg-tertiary);

  font-size: 13px;

  height: 60%;

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

