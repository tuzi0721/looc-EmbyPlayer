<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

interface Comment {
  time: number;
  mode: "scroll" | "top" | "bottom" | "reverse";
  color: string;
  text: string;
  count?: number;
}

const props = withDefaults(
  defineProps<{
    comments: Comment[];
    positionMs: number;
    paused: boolean;
    enabled: boolean;
    opacity?: number;
    speed?: number;
    fontSize?: number;
    lanes?: number;
    avoidSubtitles?: boolean;
    bottomReservePct?: number;
  }>(),
  {
    opacity: 0.85,
    speed: 1,
    fontSize: 22,
    lanes: 14,
    avoidSubtitles: true,
    bottomReservePct: 18,
  },
);

const container = ref<HTMLDivElement | null>(null);
const cursor = ref(0);
const scrollLanes = ref<number[]>([]); // lane: free-time (sec) for next danmaku
const topLanes = ref<number[]>([]);
const bottomLanes = ref<number[]>([]);

interface Active {
  el: HTMLDivElement;
  mode: "scroll" | "top" | "bottom" | "reverse";
  bornAt: number; // playback seconds
  duration: number;
  lane: number;
  width: number;
}

const active: Active[] = [];
let rafHandle: number | null = null;
let lastPlaybackSec = 0;

const bottomReservePct = computed(() =>
  props.avoidSubtitles ? Math.max(0, Math.min(40, props.bottomReservePct)) : 0,
);
const containerStyle = computed(() => ({
  bottom: `${bottomReservePct.value}%`,
}));

function reset() {
  cursor.value = 0;
  active.splice(0).forEach((a) => a.el.remove());
  scrollLanes.value = Array.from({ length: props.lanes }, () => 0);
  topLanes.value = Array.from({ length: Math.min(6, props.lanes) }, () => 0);
  bottomLanes.value = Array.from({ length: Math.min(6, props.lanes) }, () => 0);
}

function findLane(lanes: number[], now: number): number {
  for (let i = 0; i < lanes.length; i++) {
    if (lanes[i] <= now) return i;
  }
  let best = 0;
  for (let i = 1; i < lanes.length; i++) {
    if (lanes[i] < lanes[best]) best = i;
  }
  return best;
}

function spawn(c: Comment, now: number) {
  if (!container.value || !props.enabled) return;
  const el = document.createElement("div");
  el.className = "dm-item";
  el.textContent = c.count && c.count > 1 ? `${c.text} ×${c.count}` : c.text;
  el.style.color = c.color;
  el.style.opacity = String(props.opacity);
  el.style.fontSize = `${props.fontSize}px`;
  container.value.appendChild(el);
  const w = el.offsetWidth;
  const containerW = container.value.clientWidth;
  const containerH = container.value.clientHeight;
  const laneCount = Math.max(2, Math.floor(containerH / (props.fontSize * 1.4)));
  const laneHeight = containerH / laneCount;

  let mode = c.mode;
  let lane = 0;
  let duration: number;

  if (mode === "scroll" || mode === "reverse") {
    if (scrollLanes.value.length !== laneCount) {
      scrollLanes.value = Array.from({ length: laneCount }, () => 0);
    }
    lane = findLane(scrollLanes.value, now);
    duration = 8 / props.speed;
    const traverseSpeed = (containerW + w) / duration;
    const freeAt = now + (w + 16) / traverseSpeed;
    scrollLanes.value[lane] = freeAt;
    if (mode === "scroll") {
      el.style.transform = `translate3d(${containerW}px, ${lane * laneHeight + 4}px, 0)`;
    } else {
      el.style.transform = `translate3d(${-w}px, ${lane * laneHeight + 4}px, 0)`;
    }
  } else if (mode === "top") {
    if (topLanes.value.length !== Math.min(6, laneCount)) {
      topLanes.value = Array.from({ length: Math.min(6, laneCount) }, () => 0);
    }
    lane = findLane(topLanes.value, now);
    duration = 5 / props.speed;
    topLanes.value[lane] = now + duration;
    el.style.left = `${(containerW - w) / 2}px`;
    el.style.top = `${lane * laneHeight + 4}px`;
  } else {
    // bottom
    if (bottomLanes.value.length !== Math.min(6, laneCount)) {
      bottomLanes.value = Array.from({ length: Math.min(6, laneCount) }, () => 0);
    }
    lane = findLane(bottomLanes.value, now);
    duration = 5 / props.speed;
    bottomLanes.value[lane] = now + duration;
    el.style.left = `${(containerW - w) / 2}px`;
    el.style.bottom = `${lane * laneHeight + 4}px`;
  }

  active.push({ el, mode, bornAt: now, duration, lane, width: w });
}

function tick() {
  rafHandle = requestAnimationFrame(tick);
  if (!container.value) return;
  if (!props.enabled) {
    if (active.length > 0) {
      active.splice(0).forEach((a) => a.el.remove());
    }
    return;
  }
  const sec = props.positionMs / 1000;
  if (Math.abs(sec - lastPlaybackSec) > 2) {
    // Seek detected: re-align cursor + clear screen.
    cursor.value = findCursor(props.comments, sec);
    active.splice(0).forEach((a) => a.el.remove());
  }
  lastPlaybackSec = sec;

  // Spawn due comments.
  while (
    cursor.value < props.comments.length &&
    props.comments[cursor.value].time <= sec
  ) {
    if (sec - props.comments[cursor.value].time < 1.5) {
      spawn(props.comments[cursor.value], sec);
    }
    cursor.value++;
  }

  const containerW = container.value.clientWidth;
  for (let i = active.length - 1; i >= 0; i--) {
    const a = active[i];
    const age = sec - a.bornAt;
    if (a.mode === "scroll") {
      const total = containerW + a.width;
      const x = containerW - (age / a.duration) * total;
      a.el.style.transform = `translate3d(${x}px, ${getLaneY(a)}px, 0)`;
    } else if (a.mode === "reverse") {
      const total = containerW + a.width;
      const x = -a.width + (age / a.duration) * total;
      a.el.style.transform = `translate3d(${x}px, ${getLaneY(a)}px, 0)`;
    }
    if (age > a.duration + (props.paused ? 999 : 0)) {
      a.el.remove();
      active.splice(i, 1);
    }
  }
}

function getLaneY(a: Active): number {
  if (!container.value) return 0;
  const laneCount = Math.max(2, Math.floor(container.value.clientHeight / (props.fontSize * 1.4)));
  const laneHeight = container.value.clientHeight / laneCount;
  return a.lane * laneHeight + 4;
}

function findCursor(arr: Comment[], time: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

watch(
  () => props.comments,
  () => reset(),
  { immediate: true },
);

watch(
  () => [props.fontSize, props.lanes, props.avoidSubtitles, props.bottomReservePct],
  () => reset(),
);

watch(
  () => props.enabled,
  (en) => {
    if (!en) {
      active.splice(0).forEach((a) => a.el.remove());
    }
  },
);

watch(
  () => props.positionMs,
  () => {
    if (rafHandle == null) {
      rafHandle = requestAnimationFrame(tick);
    }
  },
);

onBeforeUnmount(() => {
  if (rafHandle != null) cancelAnimationFrame(rafHandle);
  active.splice(0).forEach((a) => a.el.remove());
});
</script>

<template>
  <div ref="container" class="dm" :style="containerStyle" aria-hidden="true" />
</template>

<style scoped>
.dm {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.dm :deep(.dm-item) {
  position: absolute;
  left: 0;
  top: 0;
  white-space: nowrap;
  font-weight: 600;
  font-family: var(--font-sans);
  text-shadow:
    1px 0 1px rgba(0, 0, 0, 0.9),
    -1px 0 1px rgba(0, 0, 0, 0.9),
    0 1px 1px rgba(0, 0, 0, 0.9),
    0 -1px 1px rgba(0, 0, 0, 0.9);
  will-change: transform;
  letter-spacing: 0.02em;
}
</style>
