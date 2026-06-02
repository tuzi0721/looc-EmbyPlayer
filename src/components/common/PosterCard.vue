<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Icon } from "@iconify/vue";

import { useAuthStore } from "@/stores/auth";
import { useServerStore } from "@/stores/server";
import { useLazyVisible } from "@/composables/useLazyVisible";
import type { MediaItem } from "@/types/models";
import { mediaImageUrl, type MediaImageType } from "@/utils/mediaImages";
import { mediaItemSourceLabel } from "@/utils/sourceContext";

type PosterAspect = "portrait" | "backdrop" | "square";

const props = defineProps<{
  item: MediaItem;
  aspect?: PosterAspect | "auto";
  eager?: boolean;
  activateHandler?: (item: MediaItem) => void | Promise<void>;
}>();

const emit = defineEmits<{
  (e: "activate"): void;
}>();

const artEl = ref<HTMLDivElement | null>(null);
const { visible } = useLazyVisible(artEl, { rootMargin: "300px 0px" });
const loaded = ref(false);
const imageCandidateIndex = ref(0);

const auth = useAuthStore();
const serverStore = useServerStore();

const isCollection = computed(() => props.item.Type === "BoxSet");
const resolvedAspect = computed<PosterAspect>(() => {
  if (props.aspect && props.aspect !== "auto") return props.aspect;
  if (!isCollection.value) return "portrait";
  const ratio = Number(props.item.PrimaryImageAspectRatio ?? 0);
  if (Number.isFinite(ratio) && ratio >= 1.2) return "backdrop";
  return "portrait";
});

const activeServer = computed(() => {
  const sourceServerId = props.item._source?.serverId;
  if (sourceServerId) return serverStore.byId(sourceServerId) ?? null;
  const acc = auth.activeAccount;
  if (!acc) return null;
  return serverStore.byId(acc.serverId) ?? null;
});

interface ImageCandidate {
  itemId: string;
  imageType: MediaImageType;
  tag?: string | null;
}

const imageCandidates = computed<ImageCandidate[]>(() => {
  const item = props.item;
  const useBackdrop = resolvedAspect.value === "backdrop" && !isCollection.value;
  const candidates: ImageCandidate[] = [];
  const seen = new Set<string>();

  function add(itemId: string | null | undefined, imageType: MediaImageType, tag?: string | null, allowUntagged = false) {
    if (!itemId || (!tag && !allowUntagged)) return;
    const key = `${itemId}:${imageType}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ itemId, imageType, tag });
  }

  const parentBackdropId = item.ParentBackdropItemId ?? item.SeriesId;
  const parentBackdropTag = item.ParentBackdropImageTags?.[0] ?? item.BackdropImageTags?.[0];
  const parentThumbId = item.ParentThumbItemId ?? item.SeriesId;
  const parentThumbTag = item.ParentThumbImageTag ?? item.SeriesThumbImageTag ?? item.ImageTags?.Thumb;
  const parentPrimaryId = item.ParentPrimaryImageItemId ?? item.SeriesId;
  const parentPrimaryTag = item.ParentPrimaryImageTag ?? item.SeriesPrimaryImageTag;

  if (useBackdrop) {
    add(item.Id, "Backdrop", item.BackdropImageTags?.[0]);
    add(parentBackdropId, "Backdrop", parentBackdropTag);
    add(parentThumbId, "Thumb", parentThumbTag, item.Type === "Episode");
    add(parentPrimaryId, "Primary", parentPrimaryTag, item.Type === "Episode");
    add(item.Id, "Primary", item.ImageTags?.Primary, true);
    add(parentBackdropId, "Backdrop", parentBackdropTag, item.Type === "Episode");
  } else {
    add(item.Id, "Primary", item.ImageTags?.Primary, true);
    add(parentPrimaryId, "Primary", parentPrimaryTag, item.Type === "Episode");
    add(parentThumbId, "Thumb", parentThumbTag, item.Type === "Episode");
    add(item.Id, "Backdrop", item.BackdropImageTags?.[0]);
    add(parentBackdropId, "Backdrop", parentBackdropTag);
    add(parentBackdropId, "Backdrop", parentBackdropTag, item.Type === "Episode");
  }

  return candidates;
});

watch(
  () => `${props.item.Id}:${props.item._source?.serverId ?? ""}:${props.item._source?.accountId ?? ""}:${resolvedAspect.value}`,
  () => {
    imageCandidateIndex.value = 0;
    loaded.value = false;
  },
);

const imageUrl = computed(() => {
  const server = activeServer.value;
  if (!server) return null;

  const candidate = imageCandidates.value[Math.min(imageCandidateIndex.value, imageCandidates.value.length - 1)];
  if (!candidate) return null;
  const maxWidth = resolvedAspect.value === "backdrop" ? "640" : "320";
  return mediaImageUrl(server, candidate.itemId, candidate.imageType, {
    accountId: props.item._source?.accountId,
    maxWidth,
    quality: 82,
    format: "webp",
    tag: candidate.tag,
  });
});

function onImageLoad() {
  loaded.value = true;
}

function onImageError() {
  loaded.value = false;
  if (imageCandidateIndex.value < imageCandidates.value.length - 1) {
    imageCandidateIndex.value += 1;
  }
}

const progress = computed(() => props.item.UserData?.PlayedPercentage ?? 0);
const watched = computed(() => props.item.UserData?.Played === true);

const subtitle = computed(() => {
  const i = props.item;
  if (i.Type === "Episode" && i.SeriesName) {
    return `${i.SeriesName} · S${i.ParentIndexNumber ?? "?"}E${i.IndexNumber ?? "?"}`;
  }
  if (i.Type === "BoxSet") return "合集";
  if (i.ProductionYear) return String(i.ProductionYear);
  return "";
});
const sourceLabel = computed(() => mediaItemSourceLabel(props.item));

function activate() {
  if (props.activateHandler) void props.activateHandler(props.item);
  emit("activate");
}
</script>

<template>
  <article
    class="poster"
    :class="[`poster--${resolvedAspect}`, { 'poster--collection': isCollection }]"
    role="button"
    tabindex="0"
    @click="activate"
    @keydown.enter.prevent="activate"
    @keydown.space.prevent="activate"
  >
    <div ref="artEl" class="poster__art">
      <img
        v-if="imageUrl && (eager || visible)"
        :src="imageUrl"
        :alt="item.Name"
        loading="lazy"
        decoding="async"
        :class="{ loaded }"
        @load="onImageLoad"
        @error="onImageError"
      />
      <div v-if="!imageUrl || !loaded" class="poster__placeholder" :class="{ shimmer: imageUrl && !loaded }">
        <span v-if="!imageUrl">{{ item.Name?.slice(0, 1) }}</span>
      </div>
      <div v-if="watched" class="poster__badge">
        <Icon icon="lucide:check" width="13" />
      </div>
      <div v-if="progress > 0 && progress < 100" class="poster__progress">
        <span :style="{ width: `${progress}%` }" />
      </div>
    </div>
    <div class="poster__meta">
      <h4>{{ item.Name }}</h4>
      <p v-if="subtitle">{{ subtitle }}</p>
      <p v-if="sourceLabel" class="poster__source">{{ sourceLabel }}</p>
    </div>
  </article>
</template>

<style scoped>
.poster {
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.poster__art {
  position: relative;
  overflow: hidden;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--glass-border);
  transition: transform 240ms var(--easing-spring), box-shadow 240ms var(--easing-glide);
}
.poster:hover .poster__art {
  transform: translateY(-3px) scale(1.02);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
}
.poster--portrait .poster__art {
  aspect-ratio: 2 / 3;
}
.poster--backdrop .poster__art {
  aspect-ratio: 16 / 9;
}
.poster--square .poster__art {
  aspect-ratio: 1 / 1;
}
.poster__art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  opacity: 0;
  transition: opacity 240ms var(--easing-glide);
  position: absolute;
  inset: 0;
}
.poster__art img.loaded {
  opacity: 1;
}
.poster__placeholder {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 42px;
  color: var(--fg-tertiary);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
}
.poster__placeholder.shimmer {
  position: relative;
  overflow: hidden;
  background-image: linear-gradient(
    100deg,
    rgba(255, 255, 255, 0.04) 0%,
    rgba(255, 255, 255, 0.08) 45%,
    rgba(255, 255, 255, 0.04) 90%
  );
  background-size: 200% 100%;
  animation: poster-shimmer 1.2s linear infinite;
}
@keyframes poster-shimmer {
  from { background-position: -100% 0; }
  to { background-position: 200% 0; }
}
.poster__badge {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(10, 132, 255, 0.9);
  display: grid;
  place-items: center;
  color: white;
  font-size: 13px;
}
.poster__progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4px;
  background: rgba(0, 0, 0, 0.4);
}
.poster__progress span {
  display: block;
  height: 100%;
  background: var(--accent);
}
.poster__meta h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--fg-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.poster__meta p {
  margin: 0;
  font-size: 11px;
  color: var(--fg-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.poster__source {
  color: var(--accent) !important;
}
</style>
