<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

import PosterCard from "@/components/common/PosterCard.vue";
import { api } from "@/api";
import { useAuthStore } from "@/stores/auth";
import type { MediaItem } from "@/types/models";

const router = useRouter();
const auth = useAuthStore();

const items = ref<MediaItem[]>([]);
const loading = ref(false);

const hasAccount = computed(() => !!auth.activeAccount);

async function load() {
  if (!hasAccount.value) return;
  loading.value = true;
  try {
    const r = await api.listItems({
      params: [
        ["Filters", "IsFavorite"],
        ["Recursive", "true"],
        ["IncludeItemTypes", "Movie,Series"],
        ["Fields", "PrimaryImageAspectRatio,ProductionYear,Overview"],
        ["SortBy", "SortName"],
        ["SortOrder", "Ascending"],
        ["Limit", "400"],
      ],
    });
    items.value = r.Items;
  } catch {
    items.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => auth.activeId, load);

function open(id: string) {
  router.push(`/item/${id}`).catch(() => {});
}
</script>

<template>
  <section class="fav">
    <header class="fav__head">
      <h1>收藏</h1>
      <p v-if="items.length > 0" class="fav__count">{{ items.length }} 项</p>
    </header>

    <div class="fav__body">
      <div v-if="!hasAccount" class="empty">
        <Icon icon="lucide:user-x" width="28" />
        <p>请先登录到服务器</p>
      </div>
      <div v-else-if="loading" class="empty">
        <Icon icon="lucide:loader" width="22" class="spin" />
        <p>加载中…</p>
      </div>
      <div v-else-if="items.length === 0" class="empty">
        <Icon icon="lucide:heart-off" width="28" />
        <p>还没有收藏</p>
        <span class="hint">在影片或剧集详情页点击爱心来添加收藏</span>
      </div>
      <div v-else class="grid">
        <PosterCard
          v-for="item in items"
          :key="item.Id"
          :item="item"
          @activate="open(item.Id)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.fav {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.fav__head {
  padding: 18px var(--content-pad) 6px;
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.fav__head h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.fav__count {
  margin: 0;
  font-size: 12px;
  color: var(--fg-tertiary);
}
.fav__body {
  flex: 1;
  overflow-y: auto;
  padding: 12px var(--content-pad) 40px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 18px;
}
.empty {
  height: 60vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--fg-tertiary);
  font-size: 14px;
}
.empty p {
  margin: 0;
  font-weight: 500;
}
.empty .hint {
  font-size: 12px;
  color: var(--fg-quaternary);
}
.spin {
  animation: spin 800ms linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
