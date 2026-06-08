<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

import { useAuthStore } from "@/stores/auth";
import { useLibraryStore } from "@/stores/library";
import { useServerStore } from "@/stores/server";
import { useSettingsStore } from "@/stores/settings";
import type { MediaItem } from "@/types/models";
import { mediaImageUrl, type MediaImageType } from "@/utils/mediaImages";
import { openMediaItemFromSource } from "@/utils/sourceContext";

const router = useRouter();
const auth = useAuthStore();
const lib = useLibraryStore();
const serverStore = useServerStore();
const settings = useSettingsStore();

const index = ref(0);
const logoLoaded = ref(false);
const logoFailed = ref(false);
const backgroundIndex = ref(0);
let timer: number | null = null;

const HERO_LIMIT = 5;

const items = computed(() => {
  const seen = new Set<string>();
  return lib.heroItems
    .filter((x) => {
      if (!x || seen.has(x.Id)) return false;
      seen.add(x.Id);
      return true;
    })
    .slice(0, HERO_LIMIT);
});

const current = computed(() => items.value[index.value] ?? null);
const heroStyle = computed(() => settings.settings.homeHeroStyle ?? "cinema");
const heroImageWidth = computed(() => (heroStyle.value === "cinema" ? "2200" : "1280"));

interface ImageCandidate {
  itemId: string | null | undefined;
  imageType: MediaImageType;
  tag?: string | null;
  allowUntagged?: boolean;
}

function imageUrl(candidate: ImageCandidate | null | undefined, options: { width?: string; maxWidth?: string }): string | null {
  const acc = auth.activeAccount;
  if (!acc || !candidate?.itemId) return null;
  if (!candidate.tag && !candidate.allowUntagged) return null;
  const server = serverStore.byId(acc.serverId);
  return mediaImageUrl(server, candidate.itemId, candidate.imageType, {
    accountId: acc.id,
    accessToken: acc.accessToken,
    tag: candidate.tag,
    width: options.width,
    maxWidth: options.maxWidth,
    format: "webp",
  });
}

function firstImageUrl(candidates: ImageCandidate[], options: { width?: string; maxWidth?: string }): string | null {
  for (const candidate of candidates) {
    const url = imageUrl(candidate, options);
    if (url) return url;
  }
  return null;
}

function backgroundCandidates(item: MediaItem): ImageCandidate[] {
  const parentBackdropId = item.ParentBackdropItemId ?? item.SeriesId;
  const parentBackdropTag = item.ParentBackdropImageTags?.[0] ?? item.BackdropImageTags?.[0];
  const parentThumbId = item.ParentThumbItemId ?? item.SeriesId;
  const parentThumbTag = item.ParentThumbImageTag ?? item.SeriesThumbImageTag ?? item.ImageTags?.Thumb;
  const parentPrimaryId = item.ParentPrimaryImageItemId ?? item.SeriesId;
  const parentPrimaryTag = item.ParentPrimaryImageTag ?? item.SeriesPrimaryImageTag;
  const allowParent = item.Type === "Episode";
  return [
    { itemId: item.Id, imageType: "Backdrop", tag: item.BackdropImageTags?.[0] },
    { itemId: parentBackdropId, imageType: "Backdrop", tag: parentBackdropTag, allowUntagged: allowParent },
    { itemId: parentThumbId, imageType: "Thumb", tag: parentThumbTag, allowUntagged: allowParent },
    { itemId: item.Id, imageType: "Primary", tag: item.ImageTags?.Primary, allowUntagged: true },
    { itemId: parentPrimaryId, imageType: "Primary", tag: parentPrimaryTag, allowUntagged: allowParent },
  ];
}

const backgroundUrls = computed(() => {
  const item = current.value;
  if (!item) return [];
  return backgroundCandidates(item)
    .map((candidate) => imageUrl(candidate, { width: heroImageWidth.value }))
    .filter((url): url is string => Boolean(url));
});

// First (preferred) backdrop URL for an item, matching what the carousel renders
// when its background index is 0 — used to warm the browser cache for every slide.
function firstBackgroundUrl(item: MediaItem): string | null {
  for (const candidate of backgroundCandidates(item)) {
    const url = imageUrl(candidate, { width: heroImageWidth.value });
    if (url) return url;
  }
  return null;
}

// Hold references so the in-flight Image objects are not garbage collected before
// they finish decoding into the HTTP cache.
const preloadedImages = ref<HTMLImageElement[]>([]);
function preloadHeroBackgrounds() {
  const loaded: HTMLImageElement[] = [];
  for (const item of items.value) {
    const url = firstBackgroundUrl(item);
    if (!url) continue;
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    loaded.push(img);
  }
  preloadedImages.value = loaded;
}

watch(
  () => `${heroImageWidth.value}|${items.value.map((x) => x.Id).join(",")}`,
  () => preloadHeroBackgrounds(),
  { immediate: true },
);

const activeBackgroundUrl = computed(() => {
  const urls = backgroundUrls.value;
  return urls[Math.min(backgroundIndex.value, Math.max(0, urls.length - 1))] ?? null;
});

function onBackgroundError() {
  if (backgroundIndex.value < backgroundUrls.value.length - 1) {
    backgroundIndex.value += 1;
  }
}

function titleLogoCandidates(item: MediaItem): ImageCandidate[] {
  const parentLogoId = item.ParentLogoItemId ?? item.SeriesId;
  const parentLogoTag = item.ParentLogoImageTag;
  return [
    { itemId: item.Id, imageType: "Logo", tag: item.ImageTags?.Logo },
    { itemId: parentLogoId, imageType: "Logo", tag: parentLogoTag, allowUntagged: item.Type === "Episode" },
  ];
}

const titleLogoUrl = computed(() => (current.value ? firstImageUrl(titleLogoCandidates(current.value), { maxWidth: "900" }) : null));

function displayTitle(item: MediaItem): string {
  if (item.Type === "Episode" && item.SeriesName) return item.SeriesName;
  return item.Name;
}

function episodeSubtitle(item: MediaItem): string | null {
  if (item.Type !== "Episode") return null;
  const parts: string[] = [];
  if (item.ParentIndexNumber != null && item.IndexNumber != null) {
    parts.push(`S${String(item.ParentIndexNumber).padStart(2, "0")}E${String(item.IndexNumber).padStart(2, "0")}`);
  }
  if (item.Name && item.Name !== item.SeriesName) parts.push(item.Name);
  return parts.length ? parts.join(" · ") : null;
}

function formatRuntime(item: MediaItem): string | null {
  const ticks = item.RunTimeTicks ?? 0;
  if (!ticks) return null;
  const totalMin = Math.round(ticks / 10_000_000 / 60);
  if (totalMin <= 0) return null;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}分钟`;
}

const resumeMs = computed(() => {
  const ticks = current.value?.UserData?.PlaybackPositionTicks ?? 0;
  return ticks > 0 ? Math.floor(ticks / 10_000) : 0;
});
const resumePct = computed(() => Math.round(current.value?.UserData?.PlayedPercentage ?? 0));
const isResume = computed(() => resumeMs.value > 0 && resumePct.value > 0 && resumePct.value < 100);
const playable = computed(
  () => current.value?.Type === "Movie" || current.value?.Type === "Episode",
);
const primaryLabel = computed(() => (isResume.value ? "继续观看" : "播放"));

const heroPills = computed<string[]>(() => {
  const item = current.value;
  if (!item) return [];
  const pills: string[] = [];
  if (item.Type === "Series") pills.push("剧集");
  else if (item.Type === "Movie") pills.push("电影");
  else if (item.Type === "Episode") pills.push("单集");
  if (item.ProductionYear) pills.push(String(item.ProductionYear));
  if (item.CommunityRating != null) pills.push(`★ ${item.CommunityRating.toFixed(1)}`);
  if (item.OfficialRating) pills.push(item.OfficialRating);
  const rt = formatRuntime(item);
  if (rt) pills.push(rt);
  if (isResume.value) pills.push(`已看 ${resumePct.value}%`);
  return pills;
});

async function primaryAction() {
  const item = current.value;
  if (!item) return;
  if (!playable.value) {
    openItem();
    return;
  }
  const accountId = item._source?.accountId;
  if (accountId && auth.activeId !== accountId) {
    try {
      await auth.switchTo(accountId);
    } catch {
      // Best-effort account switch; the player route guards context again.
    }
  }
  const query: Record<string, string> = { start: String(resumeMs.value) };
  if (item._source?.serverId) query.server = item._source.serverId;
  if (item._source?.accountId) query.account = item._source.accountId;
  router.push({ path: `/player/${encodeURIComponent(item.Id)}`, query }).catch(() => {});
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
  if (current.value) openMediaItemFromSource(router, auth, current.value).catch(() => {});
}

watch(titleLogoUrl, () => {
  logoLoaded.value = false;
  logoFailed.value = false;
});

watch(
  () => `${current.value?.Id ?? ""}:${heroImageWidth.value}`,
  () => {
    backgroundIndex.value = 0;
  },
);

onMounted(() => {
  timer = window.setInterval(next, 8000);
});
onUnmounted(() => {
  if (timer != null) window.clearInterval(timer);
});
</script>

<template>
  <section
    v-if="current"
    class="hero"
    :class="`hero--${heroStyle}`"
    role="button"
    tabindex="0"
    @click="openItem"
    @keydown.enter.prevent="openItem"
    @keydown.space.prevent="openItem"
  >
    <div class="hero__bg">
      <img
        v-if="activeBackgroundUrl"
        :src="activeBackgroundUrl"
        :alt="displayTitle(current)"
        loading="eager"
        decoding="async"
        @error="onBackgroundError"
      />
    </div>
    <div class="hero__shade" />
    <button class="hero__nav hero__nav--prev" aria-label="上一张" @click.stop="prev">
      <Icon icon="lucide:chevron-left" width="22" />
    </button>
    <button class="hero__nav hero__nav--next" aria-label="下一张" @click.stop="next">
      <Icon icon="lucide:chevron-right" width="22" />
    </button>
    <div class="hero__content">
      <img
        v-if="titleLogoUrl && !logoFailed"
        class="hero__logo"
        :class="{ loaded: logoLoaded }"
        :src="titleLogoUrl"
        :alt="displayTitle(current)"
        decoding="async"
        @load="logoLoaded = true"
        @error="logoFailed = true"
      />
      <h2 class="hero__title" :class="{ 'hero__title--with-logo': titleLogoUrl && logoLoaded && !logoFailed }">
        {{ displayTitle(current) }}
      </h2>
      <p v-if="episodeSubtitle(current)" class="hero__episode">{{ episodeSubtitle(current) }}</p>
      <div v-if="heroPills.length" class="hero__pills">
        <span v-for="(pill, i) in heroPills" :key="i" class="hero__pill">{{ pill }}</span>
      </div>
      <p v-if="current.Overview" class="hero__desc">{{ current.Overview }}</p>
      <div class="hero__actions">
        <button class="hero__play" type="button" @click.stop="primaryAction">
          <Icon :icon="isResume ? 'lucide:rotate-ccw' : 'lucide:play'" width="18" />
          <span>{{ primaryLabel }}</span>
        </button>
        <button class="hero__detail" type="button" @click.stop="openItem">
          <Icon icon="lucide:info" width="17" />
          <span>详情</span>
        </button>
      </div>
    </div>
    <div v-if="items.length > 1" class="hero__dots">
      <button
        v-for="(_, i) in items"
        :key="i"
        class="hero__dot"
        :class="{ active: i === index }"
        @click.stop="index = i"
      />
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  width: 100%;
  margin: 0;
  aspect-ratio: 8 / 3;
  height: auto;
  min-height: 0;
  border-radius: 0;
  overflow: hidden;
  flex-shrink: 0;
  cursor: pointer;
  outline: none;
}
.hero--cinema {
  aspect-ratio: 8 / 3;
}
.hero__bg {
  position: absolute;
  inset: 0;
  background: #1a1a1a center/cover no-repeat;
}
.hero__bg img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
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
.hero--cinema .hero__shade {
  background:
    linear-gradient(
      90deg,
      rgba(0, 0, 0, 0.94) 0%,
      rgba(0, 0, 0, 0.56) 48%,
      rgba(0, 0, 0, 0.22) 100%
    ),
    linear-gradient(0deg, rgba(0, 0, 0, 0.82) 0%, rgba(0, 0, 0, 0.12) 48%);
}
/* Light theme: show the backdrop's real colors; only a soft bottom-left
   gradient keeps the title/actions legible instead of a full dark mask. */
:root[data-theme="light"] .hero__shade,
:root[data-theme="light"] .hero--cinema .hero__shade {
  background:
    linear-gradient(90deg, rgba(8, 10, 16, 0.52) 0%, rgba(8, 10, 16, 0.16) 40%, transparent 70%),
    linear-gradient(0deg, rgba(8, 10, 16, 0.46) 0%, rgba(8, 10, 16, 0.08) 42%, transparent 60%);
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
  bottom: 34px;
  max-width: min(620px, 56%);
  z-index: 2;
  cursor: pointer;
}
.hero--cinema .hero__content {
  left: clamp(36px, 7vw, 96px);
  bottom: clamp(38px, 7vh, 92px);
  max-width: min(840px, 72%);
}
.hero__title {
  margin: 0 0 8px;
  font-size: 38px;
  font-weight: 700;
  color: white;
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.55);
  letter-spacing: 0;
  line-height: 1.08;
}
.hero__title--with-logo {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.hero--cinema .hero__title {
  font-size: clamp(42px, 5.2vw, 74px);
  max-width: 12em;
}
.hero__logo {
  display: block;
  max-width: min(520px, 58vw);
  max-height: 132px;
  object-fit: contain;
  object-position: left center;
  margin: 0 0 14px;
  opacity: 0;
  filter: drop-shadow(0 12px 34px rgba(0, 0, 0, 0.5));
  transition: opacity 220ms var(--easing-glide);
}
.hero__logo.loaded {
  opacity: 1;
}
.hero--cinema .hero__logo {
  max-width: min(640px, 62vw);
  max-height: clamp(100px, 16vh, 184px);
  margin-bottom: 16px;
}
.hero__episode {
  margin: 0 0 8px;
  font-size: 15px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.78);
  max-width: 64ch;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hero__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 12px;
}
.hero__pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: var(--r-pill, 999px);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  white-space: nowrap;
}
.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}
.hero__play,
.hero__detail {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
  font-size: 14px;
  font-weight: 600;
  border-radius: var(--r-pill, 999px);
  cursor: pointer;
  border: 1px solid transparent;
  transition: transform 160ms var(--easing-spring), background 160ms var(--easing-glide),
    box-shadow 160ms var(--easing-glide);
}
.hero__play {
  color: #0b0b0f;
  background: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}
.hero__play:hover {
  transform: translateY(-1px) scale(1.02);
  background: #fff;
}
.hero__detail {
  color: #fff;
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.22);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.hero__detail:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.26);
}
.hero__desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.58;
  color: rgba(255, 255, 255, 0.68);
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.5);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.hero--cinema .hero__desc {
  max-width: 68ch;
  font-size: clamp(13px, 1.2vw, 16px);
  -webkit-line-clamp: 4;
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
@media (max-width: 760px) {
  .hero {
    width: 100%;
    aspect-ratio: 8 / 3;
    height: auto;
    min-height: 0;
  }
  .hero--cinema {
    aspect-ratio: 8 / 3;
  }
  .hero--cinema .hero__content {
    left: 18px;
    right: 18px;
    bottom: 32px;
    max-width: none;
  }
  .hero--cinema .hero__title {
    font-size: 40px;
  }
  .hero--cinema .hero__logo {
    max-width: min(520px, 82vw);
    max-height: 126px;
  }
  .hero__title {
    font-size: 28px;
  }
}
@media (max-height: 760px) and (min-width: 1101px) {
  .hero {
    aspect-ratio: 8 / 3;
    height: auto;
    min-height: 0;
  }
  .hero--cinema {
    aspect-ratio: 8 / 3;
  }
  .hero--cinema .hero__content {
    bottom: 34px;
  }
  .hero--cinema .hero__shade {
    background:
      linear-gradient(
        90deg,
        rgba(0, 0, 0, 0.96) 0%,
        rgba(0, 0, 0, 0.7) 52%,
        rgba(0, 0, 0, 0.35) 100%
      ),
      linear-gradient(0deg, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.2) 50%);
  }
  .hero--cinema .hero__title {
    font-size: clamp(34px, 4.5vw, 52px);
  }
  .hero--cinema .hero__logo {
    max-height: 112px;
  }
  .hero--cinema .hero__desc {
    -webkit-line-clamp: 2;
  }
}
@media (max-height: 700px) and (min-width: 761px) and (max-width: 1100px) {
  .hero {
    aspect-ratio: 8 / 3;
    height: auto;
    min-height: 0;
  }
  .hero--cinema {
    aspect-ratio: 8 / 3;
  }
  .hero--cinema .hero__content {
    left: clamp(28px, 5vw, 60px);
    bottom: 26px;
    max-width: min(620px, 76%);
  }
  .hero--cinema .hero__logo {
    max-height: 74px;
    margin-bottom: 8px;
  }
  .hero--cinema .hero__title {
    font-size: clamp(30px, 4.1vw, 42px);
  }
  .hero__pills {
    margin-bottom: 8px;
  }
  .hero__actions {
    margin-top: 10px;
  }
  .hero--cinema .hero__desc {
    max-width: 58ch;
    font-size: 13px;
    line-height: 1.45;
    -webkit-line-clamp: 2;
  }
  .hero__dots {
    bottom: 9px;
  }
}
@media (max-height: 480px) {
  .hero,
  .hero--cinema {
    width: 100%;
    aspect-ratio: 8 / 3;
    height: auto;
    min-height: 0;
  }
  .hero--cinema .hero__content {
    left: clamp(20px, 5vw, 44px);
    bottom: 14px;
    max-width: min(560px, 78%);
  }
  .hero--cinema .hero__logo {
    max-height: 48px;
    margin-bottom: 6px;
  }
  .hero--cinema .hero__title {
    font-size: clamp(24px, 3.8vw, 32px);
  }
  .hero__pills,
  .hero--cinema .hero__desc {
    display: none;
  }
  .hero__dots {
    bottom: 7px;
  }
}
@media (max-width: 420px) {
  .hero--cinema .hero__title {
    font-size: 34px;
  }
}
</style>
