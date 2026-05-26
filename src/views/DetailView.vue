<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

import { api } from "@/api";
import { useAuthStore } from "@/stores/auth";
import { useLibraryStore } from "@/stores/library";
import { usePlayerStore } from "@/stores/player";
import { useServerStore } from "@/stores/server";
import type { MediaItem } from "@/types/models";

const props = defineProps<{ id: string }>();
const router = useRouter();
const lib = useLibraryStore();
const auth = useAuthStore();
const serverStore = useServerStore();
const playerStore = usePlayerStore();

const item = computed(() => lib.itemCache[props.id] ?? null);
const loading = ref(false);
const loadError = ref<string | null>(null);

const seasons = ref<MediaItem[]>([]);
const activeSeasonId = ref<string | null>(null);
const episodes = ref<MediaItem[]>([]);
const loadingEpisodes = ref(false);

const isSeries = computed(() => item.value?.Type === "Series");
const isEpisode = computed(() => item.value?.Type === "Episode");
const seriesId = computed(() =>
  isSeries.value ? props.id : item.value?.SeriesId ?? null,
);

const activeServer = computed(() => {
  const a = auth.activeAccount;
  return a ? serverStore.byId(a.serverId) ?? null : null;
});

function imageUrl(
  target: MediaItem,
  imageType: "Backdrop" | "Primary" = "Backdrop",
  maxWidth = 1600,
): string | null {
  const s = activeServer.value;
  if (!s) return null;
  const line = s.lines.find((l) => l.id === s.activeLineId) ?? s.lines[0];
  if (!line) return null;
  const tag =
    imageType === "Backdrop"
      ? target.BackdropImageTags?.[0] ?? target.ImageTags?.Primary
      : target.ImageTags?.Primary;
  const sep = line.baseUrl.endsWith("/") ? "" : "/";
  const params = new URLSearchParams({ maxWidth: String(maxWidth), quality: "82", format: "webp" });
  if (tag) params.set("tag", tag);
  return `${line.baseUrl}${sep}Items/${target.Id}/Images/${imageType}?${params.toString()}`;
}

const backdropUrl = computed(() => (item.value ? imageUrl(item.value) : null));

const runtimeText = computed(() => {
  const ticks = item.value?.RunTimeTicks ?? 0;
  if (!ticks) return "";
  const mins = Math.round(ticks / 10_000_000 / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
});

const episodeSubtitle = computed(() => {
  const i = item.value;
  if (!i) return "";
  if (i.Type === "Episode" && i.SeriesName) {
    return `S${i.ParentIndexNumber ?? 1}:E${i.IndexNumber ?? "?"} - ${i.Name ?? ""}`;
  }
  if (isSeries.value && continueEpisode.value) {
    const ep = continueEpisode.value;
    return `S${ep.ParentIndexNumber ?? 1}:E${ep.IndexNumber ?? "?"} - ${ep.Name ?? ""}`;
  }
  return i.Name ?? "";
});

const metaParts = computed(() => {
  const i = item.value;
  if (!i) return [];
  const parts: string[] = [];
  if (i.CommunityRating != null) parts.push(`★ ${i.CommunityRating.toFixed(1)}`);
  if (i.ProductionYear) parts.push(String(i.ProductionYear));
  if (runtimeText.value) parts.push(runtimeText.value);
  if (i.OfficialRating) parts.push(i.OfficialRating);
  return parts;
});

const resumeMs = computed(() => {
  const target = continueEpisode.value ?? item.value;
  const ticks = target?.UserData?.PlaybackPositionTicks ?? 0;
  return Math.round(ticks / 10_000);
});

const continueEpisode = computed(() => {
  if (isEpisode.value) return item.value;
  if (!isSeries.value) return null;
  const inProgress = episodes.value.find(
    (e) => (e.UserData?.PlaybackPositionTicks ?? 0) > 0 && !e.UserData?.Played,
  );
  return inProgress ?? episodes.value[0] ?? null;
});

const activeSeasonName = computed(() => {
  const s = seasons.value.find((x) => x.Id === activeSeasonId.value);
  return s?.Name ?? "第 1 季";
});

const versionLabel = ref("WEB-DL · 1080p · H264");
const audioLabel = ref("Japanese · AAC stereo (默认)");
const subLabel = ref("Chinese Simplified (默认 SUBRIP)");

onMounted(() => void loadDetail());
watch(() => props.id, () => void loadDetail());

async function loadDetail() {
  loading.value = true;
  loadError.value = null;
  seasons.value = [];
  episodes.value = [];
  activeSeasonId.value = null;
  try {
    await lib.loadItem(props.id);
    if (isSeries.value) {
      const sresp = await api.listSeasons(props.id);
      seasons.value = sresp.Items;
      if (sresp.Items[0]) activeSeasonId.value = sresp.Items[0].Id;
    } else if (isEpisode.value && item.value?.SeasonId) {
      activeSeasonId.value = item.value.SeasonId;
      if (seriesId.value) {
        const sresp = await api.listSeasons(seriesId.value);
        seasons.value = sresp.Items;
      }
    }
  } catch (e) {
    loadError.value = String(e);
  } finally {
    loading.value = false;
  }
}

watch(activeSeasonId, async (sid) => {
  if (!sid || !seriesId.value) return;
  loadingEpisodes.value = true;
  try {
    const resp = await api.listEpisodes({ seriesId: seriesId.value, seasonId: sid });
    episodes.value = resp.Items;
  } finally {
    loadingEpisodes.value = false;
  }
});

watch(
  () => item.value?.SeasonId,
  (sid) => {
    if (sid && !activeSeasonId.value) activeSeasonId.value = sid;
  },
  { immediate: true },
);

function playTarget(id: string, startMs: number) {
  router.push({
    name: "player",
    params: { id },
    query: { start: String(startMs), from: props.id },
  });
}

function continuePlay() {
  if (isSeries.value) {
    const ep = continueEpisode.value;
    if (!ep) return;
    const idx = episodes.value.findIndex((e) => e.Id === ep.Id);
    if (idx >= 0) {
      playerStore.setQueue(
        episodes.value.slice(idx).map((e) => e.Id),
        0,
      );
    }
    const start = Math.round((ep.UserData?.PlaybackPositionTicks ?? 0) / 10_000);
    playTarget(ep.Id, start);
    return;
  }
  playTarget(props.id, resumeMs.value > 0 ? resumeMs.value : 0);
}

function playEpisode(ep: MediaItem) {
  const idx = episodes.value.findIndex((e) => e.Id === ep.Id);
  if (idx >= 0) {
    playerStore.setQueue(
      episodes.value.slice(idx).map((e) => e.Id),
      0,
    );
  }
  const start = Math.round((ep.UserData?.PlaybackPositionTicks ?? 0) / 10_000);
  playTarget(ep.Id, start);
}

function goBack() {
  if (window.history.length > 1) router.back();
  else router.push("/home").catch(() => {});
}

function isCurrentEpisode(ep: MediaItem) {
  if (isEpisode.value) return ep.Id === props.id;
  const c = continueEpisode.value;
  return c?.Id === ep.Id;
}
</script>

<template>
  <main class="detail">
    <div v-if="loading && !item" class="detail__loading">
      <Icon icon="lucide:loader" width="24" class="spin" />
      <span>加载中…</span>
    </div>

    <div v-else-if="loadError && !item" class="detail__loading">
      <Icon icon="lucide:triangle-alert" width="24" />
      <span>{{ loadError }}</span>
      <button class="detail__retry" @click="loadDetail">重试</button>
      <button class="detail__retry" @click="goBack">返回</button>
    </div>

    <template v-else-if="item">
      <section class="hero">
        <div
          v-if="backdropUrl"
          class="hero__bg"
          :style="{ backgroundImage: `url(${backdropUrl})` }"
        />
        <div class="hero__shade" />

        <button class="hero__back" aria-label="返回" @click="goBack">
          <Icon icon="lucide:chevron-left" width="22" />
        </button>

        <div class="hero__body">
          <div class="hero__main">
            <div class="hero__actions">
              <button class="hero__play" @click="continuePlay">
                <Icon icon="lucide:play" width="20" />
                {{ resumeMs > 0 ? "继续播放" : "播放" }}
              </button>
              <div class="hero__circles">
                <button class="circle-btn" title="分享">
                  <Icon icon="lucide:share-2" width="18" />
                </button>
                <button
                  class="circle-btn"
                  :class="{ active: item.UserData?.IsFavorite }"
                  title="收藏"
                >
                  <Icon icon="lucide:heart" width="18" />
                </button>
                <button
                  class="circle-btn"
                  :class="{ active: item.UserData?.Played }"
                  title="已看"
                >
                  <Icon icon="lucide:check" width="18" />
                </button>
              </div>
            </div>

            <h1 class="hero__title">{{ item.SeriesName ?? item.Name }}</h1>
            <p v-if="episodeSubtitle" class="hero__ep">{{ episodeSubtitle }}</p>

            <div v-if="metaParts.length" class="hero__meta">
              <span v-for="(p, i) in metaParts" :key="i">{{ p }}</span>
            </div>
          </div>

          <div class="hero__pickers">
            <label class="picker">
              <span>版本</span>
              <select v-model="versionLabel">
                <option>WEB-DL · 1080p · H264</option>
                <option>BluRay · 1080p · HEVC</option>
              </select>
            </label>
            <label class="picker">
              <span>音频</span>
              <select v-model="audioLabel">
                <option>Japanese · AAC stereo (默认)</option>
                <option>Chinese · AAC stereo</option>
              </select>
            </label>
            <label class="picker">
              <span>字幕</span>
              <select v-model="subLabel">
                <option>Chinese Simplified (默认 SUBRIP)</option>
                <option>关闭</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section v-if="item.Overview" class="overview-block">
        <p>{{ item.Overview }}</p>
      </section>

      <section v-if="seriesId && seasons.length > 0" class="episodes">
        <header class="episodes__head">
          <div class="episodes__left">
            <h2>更多来自 {{ activeSeasonName }}</h2>
            <select v-model="activeSeasonId" class="season-select">
              <option v-for="s in seasons" :key="s.Id" :value="s.Id">{{ s.Name }}</option>
            </select>
          </div>
          <button class="link-btn">查看全部</button>
        </header>

        <div v-if="loadingEpisodes" class="episodes__loading">
          <Icon icon="lucide:loader" width="18" class="spin" />
        </div>
        <div v-else class="episodes__scroll">
          <button
            v-for="ep in episodes"
            :key="ep.Id"
            class="ep-card"
            :class="{ 'is-current': isCurrentEpisode(ep) }"
            @click="playEpisode(ep)"
          >
            <div class="ep-card__thumb">
              <img v-if="imageUrl(ep, 'Primary', 480)" :src="imageUrl(ep, 'Primary', 480)!" :alt="ep.Name" />
              <div v-else class="ep-card__placeholder">{{ ep.IndexNumber ?? "?" }}</div>
            </div>
            <div class="ep-card__title">{{ ep.Name }}</div>
          </button>
        </div>
      </section>

      <!-- Phase 2: load People API; hide empty placeholders for now -->
      <section v-if="false" class="cast">
        <h2>演职人员</h2>
        <div class="cast__scroll">
          <div v-for="n in 6" :key="n" class="cast__item">
            <div class="cast__avatar" />
            <span class="cast__name">—</span>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.detail {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  background: var(--surface-1);
}
.detail__loading {
  height: 100%;
  display: grid;
  place-items: center;
  gap: 10px;
  color: var(--fg-tertiary);
  font-size: 13px;
  padding: 24px;
  text-align: center;
}
.detail__retry {
  appearance: none;
  border: 1px solid var(--glass-border);
  background: var(--surface-2);
  color: var(--fg-primary);
  padding: 8px 16px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  margin: 0 4px;
}
.detail__retry:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.hero {
  position: relative;
  min-height: clamp(320px, 42vh, 480px);
}
.hero__bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center top;
}
.hero__shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(18, 18, 18, 0.05) 0%,
    rgba(18, 18, 18, 0.45) 55%,
    rgba(18, 18, 18, 0.92) 100%
  );
}
.hero__back {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 2;
  appearance: none;
  border: none;
  background: rgba(0, 0, 0, 0.35);
  color: white;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.hero__body {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  padding: 0 var(--content-pad) 24px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 20px;
  align-items: end;
}
.hero__main {
  min-width: 0;
}
.hero__actions {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.hero__play {
  appearance: none;
  border: none;
  background: var(--accent-grad);
  color: white;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 28px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(168, 85, 247, 0.35);
  flex-shrink: 0;
}
.hero__circles {
  display: flex;
  gap: 10px;
}
.circle-btn {
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: white;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.circle-btn.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent-hover);
}
.hero__title {
  margin: 0;
  font-size: clamp(20px, 2.4vw, 28px);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.hero__ep {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--fg-secondary);
}
.hero__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
  font-size: 13px;
  color: var(--fg-secondary);
}
.overview-block {
  padding: 16px var(--content-pad) 8px;
  border-bottom: 1px solid var(--separator);
}
.overview-block p {
  margin: 0;
  max-width: 920px;
  font-size: 14px;
  line-height: 1.65;
  color: var(--fg-secondary);
}

.hero__pickers {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  width: min(280px, 100%);
}

@media (max-width: 960px) {
  .hero__body {
    grid-template-columns: 1fr;
    gap: 16px;
    align-items: stretch;
  }
  .hero__pickers {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
  }
  .picker {
    flex: 1 1 calc(33.333% - 8px);
    min-width: 140px;
  }
}

@media (max-width: 640px) {
  .hero {
    min-height: 300px;
  }
  .hero__actions {
    flex-direction: column;
    align-items: stretch;
  }
  .hero__play {
    justify-content: center;
  }
  .hero__circles {
    justify-content: center;
  }
  .picker {
    flex: 1 1 100%;
  }
  .episodes__head {
    flex-direction: column;
    align-items: flex-start;
  }
  .ep-card {
    flex: 0 0 140px;
  }
}
.picker {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.picker span {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--fg-tertiary);
}
.picker select {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--fg-primary);
  font-size: 12px;
  cursor: pointer;
}

.episodes {
  padding: 8px var(--content-pad) 24px;
}
.episodes__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.episodes__left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.episodes__head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  white-space: nowrap;
}
.season-select {
  appearance: none;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--glass-border);
  color: var(--fg-primary);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
}
.link-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--fg-secondary);
  font-size: 13px;
  cursor: pointer;
}
.link-btn:hover {
  color: var(--accent);
}
.episodes__loading {
  padding: 24px;
  display: flex;
  justify-content: center;
}
.episodes__scroll {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 6px;
}
.ep-card {
  appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  flex: 0 0 160px;
  text-align: left;
  cursor: pointer;
  padding: 0;
}
.ep-card__thumb {
  aspect-ratio: 16 / 9;
  border-radius: 10px;
  overflow: hidden;
  border: 2px solid transparent;
  background: var(--surface-3);
}
.ep-card.is-current .ep-card__thumb {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.ep-card__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.ep-card__placeholder {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 22px;
  font-weight: 700;
  color: var(--fg-tertiary);
}
.ep-card__title {
  margin-top: 8px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.cast {
  padding: 0 var(--content-pad) 32px;
}
.cast h2 {
  margin: 0 0 14px;
  font-size: 16px;
  font-weight: 700;
}
.cast__scroll {
  display: flex;
  gap: 16px;
  overflow-x: auto;
}
.cast__item {
  flex: 0 0 72px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.cast__avatar {
  width: 64px;
  height: 64px;
  border-radius: 999px;
  background: var(--surface-3);
}
.cast__name {
  font-size: 11px;
  color: var(--fg-tertiary);
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
