<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

import { useAuthStore } from "@/stores/auth";
import { useLibraryStore } from "@/stores/library";
import { useServerStore } from "@/stores/server";
import type { MediaItem } from "@/types/models";

const router = useRouter();
const auth = useAuthStore();
const lib = useLibraryStore();
const serverStore = useServerStore();

const index = ref(0);
let timer: number | null = null;

const items = computed(() => {
  const pool = [...lib.resume, ...lib.views].filter(Boolean);
  const seen = new Set<string>();
  return pool.filter((x) => {
    if (seen.has(x.Id)) return false;
    seen.add(x.Id);
    return true;
  }).slice(0, 6);
});

const current = computed(() => items.value[index.value] ?? null);

function posterUrl(item: MediaItem): string | null {
  const acc = auth.activeAccount;
  if (!acc) return null;
  const server = serverStore.byId(acc.serverId);
  const line = server?.lines.find((l) => l.id === server.activeLineId) ?? server?.lines[0];
  if (!line) return null;
  const tag = item.ImageTags?.Primary ?? item.BackdropImageTags?.[0];
  if (!tag && !item.Id) return null;
  const sep = line.baseUrl.includes("?") ? "&" : "?";
  const params = new URLSearchParams();
  if (tag) params.set("tag", tag);
  params.set("width", "1280");
  params.set("format", "webp");
  return `${line.baseUrl}${sep}Items/${item.Id}/Images/Backdrop?${params.toString()}`;
}

function metaLine(item: MediaItem): string {
  const parts: string[] = [];
  if (item.CommunityRating != null) parts.push(`★ ${item.CommunityRating.toFixed(1)}`);
  if (item.ProductionYear) parts.push(String(item.ProductionYear));
  if (item.OfficialRating) parts.push(item.OfficialRating);
  return parts.join(" · ");
}

function prev() {
  if (items.value.length === 0) return;
  index.value = (index.value - 1 + items.value.length) % items.value.length;
}
function next() {
  if (items.value.length === 0) return;
  index.value = (index.value + 1) % items.value.length;
}

function openItem() {
  if (current.value) router.push(`/item/${current.value.Id}`);
}

onMounted(() => {
  timer = window.setInterval(next, 8000);
});
onUnmounted(() => {
  if (timer != null) window.clearInterval(timer);
});
</script>

<template>
  <section v-if="current" class="hero">
    <div
      class="hero__bg"
      :style="posterUrl(current) ? { backgroundImage: `url(${posterUrl(current)})` } : undefined"
    />
    <div class="hero__shade" />
    <button class="hero__nav hero__nav--prev" aria-label="上一张" @click="prev">
      <Icon icon="lucide:chevron-left" width="22" />
    </button>
    <button class="hero__nav hero__nav--next" aria-label="下一张" @click="next">
      <Icon icon="lucide:chevron-right" width="22" />
    </button>
    <div class="hero__content" @click="openItem">
      <h2 class="hero__title">{{ current.Name }}</h2>
      <p v-if="metaLine(current)" class="hero__meta">{{ metaLine(current) }}</p>
      <p v-if="current.Overview" class="hero__desc">{{ current.Overview }}</p>
    </div>
    <div v-if="items.length > 1" class="hero__dots">
      <button
        v-for="(_, i) in items"
        :key="i"
        class="hero__dot"
        :class="{ active: i === index }"
        @click="index = i"
      />
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  height: min(42vh, 360px);
  min-height: 220px;
  border-radius: 0;
  overflow: hidden;
  flex-shrink: 0;
}
.hero__bg {
  position: absolute;
  inset: 0;
  background: #1a1a1a center/cover no-repeat;
}
.hero__shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    rgba(0, 0, 0, 0.85) 0%,
    rgba(0, 0, 0, 0.35) 55%,
    rgba(0, 0, 0, 0.15) 100%
  );
}
.hero__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.45);
  color: white;
  display: grid;
  place-items: center;
  cursor: pointer;
  z-index: 2;
}
.hero__nav--prev { left: 12px; }
.hero__nav--next { right: 12px; }
.hero__content {
  position: absolute;
  left: 24px;
  bottom: 36px;
  max-width: min(520px, 55%);
  z-index: 2;
  cursor: pointer;
}
.hero__title {
  margin: 0 0 8px;
  font-size: clamp(22px, 3vw, 34px);
  font-weight: 700;
  color: white;
  letter-spacing: -0.02em;
}
.hero__meta {
  margin: 0 0 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
}
.hero__desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.62);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.hero__dots {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  z-index: 2;
}
.hero__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.35);
  padding: 0;
  cursor: pointer;
}
.hero__dot.active {
  background: var(--accent);
  width: 18px;
  border-radius: 999px;
}
</style>
