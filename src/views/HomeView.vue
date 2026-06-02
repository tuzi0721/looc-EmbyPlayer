<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

import PosterCard from "@/components/common/PosterCard.vue";
import HeroCarousel from "@/components/common/HeroCarousel.vue";
import GlassButton from "@/components/common/GlassButton.vue";
import Skeleton from "@/components/common/Skeleton.vue";
import LineStatusDot from "@/components/common/LineStatusDot.vue";

import { useAuthStore } from "@/stores/auth";
import { useLibraryStore } from "@/stores/library";
import { useServerStore } from "@/stores/server";
import { useSettingsStore } from "@/stores/settings";
import type { MediaItem } from "@/types/models";
import { serverActiveLine, serverKindIcon } from "@/utils/serverVisuals";
import { mediaItemKey, openMediaItemFromSource } from "@/utils/sourceContext";

const router = useRouter();
const auth = useAuthStore();
const lib = useLibraryStore();
const serverStore = useServerStore();
const settings = useSettingsStore();

const searchTerm = ref("");
const searching = ref(false);
let searchTimer: number | null = null;

function episodeLabel(item: { Name?: string; IndexNumber?: number | null; SeriesName?: string | null }) {
  if (item.IndexNumber != null && item.SeriesName) {
    return `S1:E${item.IndexNumber} - ${item.Name ?? ""}`;
  }
  return item.Name ?? "";
}

const activeServer = computed(() => {
  const a = auth.activeAccount;
  return a ? serverStore.byId(a.serverId) ?? null : null;
});
const activeLine = computed(() => {
  const s = activeServer.value;
  if (!s) return null;
  return s.lines.find((l) => l.id === s.activeLineId) ?? s.lines[0] ?? null;
});

const hasServer = computed(() => serverStore.servers.length > 0);
const hasAccount = computed(() => !!auth.activeAccount);
const visibleServers = computed(() => {
  const hidden = new Set(settings.settings.hiddenServerIds ?? []);
  return serverStore.servers.filter((s) => !hidden.has(s.id));
});

async function tryLoadHome() {
  if (hasAccount.value) {
    await lib.refreshHome().catch(() => {});
  }
}

onMounted(tryLoadHome);
watch(() => auth.activeId, tryLoadHome);

function onSearchInput() {
  if (searchTimer != null) window.clearTimeout(searchTimer);
  if (!searchTerm.value.trim()) {
    lib.searchResults = [];
    return;
  }
  searching.value = true;
  searchTimer = window.setTimeout(async () => {
    try {
      await lib.search(searchTerm.value.trim());
    } finally {
      searching.value = false;
    }
  }, 280);
}

function openItem(item: MediaItem) {
  openMediaItemFromSource(router, auth, item).catch(() => {});
}
function openLibrary(id: string) {
  router.push(`/library/${id}`);
}

function pickServerLogin(serverId: string) {
  router.push({ name: "login", query: { server: serverId } });
}

function gotoAddServer() {
  router.push({ name: "settings", query: { c: "servers" } });
}

// React to "add via sidebar then come back" — nothing to do here, just safe defaults.
</script>

<template>
  <section class="home">
    <div v-if="!hasServer" class="empty-state">
      <div class="empty-state__art">
        <Icon icon="lucide:server-cog" width="44" />
      </div>
      <h2>添加一台媒体服务器</h2>
      <p>从设置里的服务器面板开始，或点击下方按钮。</p>
      <div class="empty-state__actions">
        <GlassButton variant="primary" size="lg" @click="gotoAddServer">
          <Icon icon="lucide:plus" width="16" />
          添加服务器
        </GlassButton>
      </div>
    </div>

    <div v-else-if="!hasAccount" class="empty-state">
      <div class="empty-state__art">
        <Icon icon="lucide:user-circle-2" width="44" />
      </div>
      <h2>登录到一台服务器</h2>
      <p>从下方选择一台服务器登录。</p>
      <div class="server-grid">
        <button
          v-for="s in visibleServers"
          :key="s.id"
          class="server-card glass glass-hover"
          @click="pickServerLogin(s.id)"
        >
          <div class="server-card__icon">
            <Icon :icon="serverKindIcon(s.kind)" width="22" />
          </div>
          <div class="server-card__name">{{ s.name }}</div>
          <div class="server-card__sub">
            <LineStatusDot
              :status="serverActiveLine(s)?.lastStatus"
              :latency-ms="serverActiveLine(s)?.lastLatencyMs"
            />
          </div>
        </button>
      </div>
    </div>

    <div v-else class="content content--flush">
      <template v-if="lib.searchResults.length > 0">
        <section class="content__pad">
          <header class="row-head">
            <h2>搜索结果</h2>
            <span v-if="searching" class="dim">搜索中…</span>
          </header>
          <div class="grid">
            <PosterCard
              v-for="item in lib.searchResults"
              :key="mediaItemKey(item)"
              :item="item"
              @activate="openItem(item)"
            />
          </div>
        </section>
      </template>

      <template v-else>
        <HeroCarousel />

        <section v-if="lib.loading && lib.views.length === 0" class="content__pad">
          <Skeleton :rows="8" aspect="backdrop" />
        </section>

        <section v-if="lib.resume.length > 0" class="row-section">
          <header class="row-head content__pad">
            <h2>继续观看</h2>
          </header>
          <div class="hscroll content__pad">
            <button
              v-for="(item, idx) in lib.resume"
              :key="mediaItemKey(item)"
              class="resume-card"
              @click="openItem(item)"
            >
              <PosterCard :item="item" aspect="backdrop" :eager="idx < 4" />
              <div class="resume-card__title">{{ item.Name }}</div>
              <div class="resume-card__sub">{{ episodeLabel(item) }}</div>
            </button>
          </div>
        </section>

        <section v-if="lib.views.length > 0" class="row-section content__pad">
          <header class="row-head">
            <h2>媒体库</h2>
          </header>
          <div class="hscroll">
            <button
              v-for="v in lib.views"
              :key="v.Id"
              class="lib-thumb glass glass-hover"
              @click="openLibrary(v.Id)"
            >
              <PosterCard :item="v" aspect="square" />
              <span class="lib-thumb__name">{{ v.Name }}</span>
            </button>
          </div>
        </section>

        <section v-else-if="!lib.loading" class="hint content__pad">
          <Icon icon="lucide:inbox" width="22" />
          <span>当前账号下没有可用媒体库</span>
        </section>
      </template>
    </div>
  </section>
</template>

<style scoped>
.home {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  padding: 18px var(--content-pad) 8px;
  flex-shrink: 0;
}
.topbar__left h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.topbar__sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--fg-tertiary);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.topbar__sub .sep {
  opacity: 0.6;
}
.topbar__right {
  flex: 1;
  max-width: 440px;
}

.content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.content--flush {
  padding: 0;
}
.content__pad {
  padding: 0 var(--content-pad) 16px;
}
.row-section {
  margin-bottom: 8px;
}
.hscroll {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  padding-bottom: 8px;
  scrollbar-width: thin;
}
.resume-card {
  appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  flex: 0 0 220px;
  text-align: left;
  cursor: pointer;
  padding: 0;
}
.resume-card__title {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.resume-card__sub {
  margin-top: 2px;
  font-size: 11px;
  color: var(--fg-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.resume-card :deep(.poster__meta),
.lib-thumb :deep(.poster__meta) {
  display: none;
}
.lib-thumb {
  flex: 0 0 120px;
  appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0;
  text-align: center;
}
.lib-thumb__name {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  font-weight: 500;
}

@media (max-height: 820px) and (min-width: 1101px) {
  .content__pad {
    padding-bottom: 8px;
  }
  .row-section {
    margin-bottom: 2px;
  }
  .row-head {
    margin-bottom: 8px;
  }
  .resume-card {
    flex-basis: 184px;
  }
  .resume-card__title,
  .resume-card__sub {
    display: none;
  }
  .lib-thumb {
    flex-basis: 96px;
  }
}

@media (max-height: 700px) and (max-width: 1100px) {
  .content__pad {
    padding-bottom: 6px;
  }
  .row-section {
    margin-bottom: 2px;
  }
  .row-head {
    margin-bottom: 6px;
  }
  .row-head h2 {
    font-size: 16px;
    line-height: 1.1;
  }
  .hscroll {
    gap: 10px;
    padding-bottom: 2px;
  }
  .resume-card {
    flex-basis: 150px;
  }
  .resume-card__title,
  .resume-card__sub {
    display: none;
  }
  .lib-thumb {
    flex-basis: 78px;
  }
  .lib-thumb__name {
    margin-top: 4px;
    font-size: 11px;
  }
}

@media (max-height: 480px) and (max-width: 760px) {
  .content__pad {
    padding-bottom: 4px;
  }
  .row-section {
    margin-bottom: 0;
  }
  .row-head {
    margin-bottom: 4px;
  }
  .row-head h2 {
    font-size: 15px;
  }
  .hscroll {
    gap: 8px;
    padding-bottom: 0;
  }
  .resume-card {
    flex-basis: 120px;
  }
  .lib-thumb {
    flex-basis: 64px;
  }
  .lib-thumb__name {
    display: none;
  }
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px;
  gap: 14px;
}
.empty-state__art {
  width: 88px;
  height: 88px;
  border-radius: 24px;
  background: rgba(10, 132, 255, 0.16);
  color: var(--accent);
  display: grid;
  place-items: center;
  margin-bottom: 6px;
}
.empty-state h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.empty-state p {
  margin: 0;
  font-size: 14px;
  color: var(--fg-secondary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
}
.empty-state__actions {
  margin-top: 10px;
}

.server-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  width: 100%;
  max-width: 720px;
  margin-top: 14px;
}
.server-card {
  appearance: none;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  color: var(--fg-primary);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 16px;
  cursor: pointer;
  text-align: left;
}
.server-card__icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(10, 132, 255, 0.16);
  color: var(--accent);
  display: grid;
  place-items: center;
}
.server-card__name {
  font-size: 14px;
  font-weight: 600;
}
.server-card__sub {
  font-size: 11px;
  color: var(--fg-tertiary);
}

.row-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12px;
}
.row-head h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.dim {
  color: var(--fg-tertiary);
  font-size: 12px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
}
.grid--backdrop {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}

.libs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.lib-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 16px;
  cursor: pointer;
  text-align: left;
  appearance: none;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  color: var(--fg-primary);
}
.lib-card__icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(10, 132, 255, 0.18);
  display: grid;
  place-items: center;
  color: var(--accent);
}
.lib-card__title {
  font-size: 14px;
  font-weight: 600;
}

.hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 60px 20px;
  color: var(--fg-tertiary);
  font-size: 13px;
}
</style>
