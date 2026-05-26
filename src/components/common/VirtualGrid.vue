<script setup lang="ts" generic="T">

import { computed, onBeforeUnmount, onMounted, ref } from "vue";



const props = withDefaults(

  defineProps<{

    items: T[];

    itemMinWidth?: number;

    itemHeight?: number;

    gap?: number;

    overscan?: number;

    keyField?: keyof T | ((item: T, index: number) => string | number);

  }>(),

  {

    itemMinWidth: 160,

    itemHeight: 280,

    gap: 16,

    overscan: 2,

    keyField: undefined,

  },

);



defineSlots<{

  default(props: { item: T; index: number }): unknown;

}>();



const root = ref<HTMLDivElement | null>(null);

const scroller = ref<HTMLDivElement | null>(null);

const innerWidth = ref(0);

const scrollTop = ref(0);

const viewportHeight = ref(0);



let ro: ResizeObserver | null = null;

let rafId = 0;

let nearEndLatch = false;

let latchTimer: number | null = null;



const emit = defineEmits<{

  (e: "scroll-near-end"): void;

}>();



function maybeLoadMore(remaining: number) {

  if (remaining >= 600) {

    nearEndLatch = false;

    return;

  }

  if (nearEndLatch) return;

  nearEndLatch = true;

  emit("scroll-near-end");

  if (latchTimer != null) window.clearTimeout(latchTimer);

  latchTimer = window.setTimeout(() => {

    nearEndLatch = false;

    latchTimer = null;

  }, 800);

}



function onScroll() {

  if (rafId) cancelAnimationFrame(rafId);

  rafId = requestAnimationFrame(() => {

    if (!scroller.value) return;

    scrollTop.value = scroller.value.scrollTop;

    viewportHeight.value = scroller.value.clientHeight;

    const remaining =

      scroller.value.scrollHeight - scrollTop.value - viewportHeight.value;

    maybeLoadMore(remaining);

  });

}



onMounted(() => {

  if (!root.value || !scroller.value) return;

  const update = () => {

    innerWidth.value = root.value!.clientWidth;

    viewportHeight.value = scroller.value!.clientHeight;

    scrollTop.value = scroller.value!.scrollTop;

  };

  update();

  ro = new ResizeObserver(update);

  ro.observe(root.value);

  scroller.value.addEventListener("scroll", onScroll, { passive: true });

});



onBeforeUnmount(() => {

  if (ro) ro.disconnect();

  if (scroller.value) scroller.value.removeEventListener("scroll", onScroll);

  if (rafId) cancelAnimationFrame(rafId);

  if (latchTimer != null) window.clearTimeout(latchTimer);

});



const columns = computed(() => {

  const w = innerWidth.value;

  if (!w) return 1;

  return Math.max(1, Math.floor((w + props.gap) / (props.itemMinWidth + props.gap)));

});



const colWidth = computed(() => {

  const cols = columns.value;

  const totalGap = props.gap * (cols - 1);

  return Math.max(props.itemMinWidth, (innerWidth.value - totalGap) / cols);

});



const rowHeight = computed(() => props.itemHeight + props.gap);

const totalRows = computed(() => Math.ceil(props.items.length / columns.value));

const totalHeight = computed(() => Math.max(0, totalRows.value * rowHeight.value - props.gap));



const visibleRange = computed(() => {

  const total = props.items.length;

  if (total === 0) return { start: 0, end: 0 };

  const startRow = Math.max(0, Math.floor(scrollTop.value / rowHeight.value) - props.overscan);

  const endRow = Math.min(

    totalRows.value,

    Math.ceil((scrollTop.value + viewportHeight.value) / rowHeight.value) + props.overscan,

  );

  return {

    start: startRow * columns.value,

    end: Math.min(total, endRow * columns.value),

  };

});



const visibleItems = computed(() => {

  const { start, end } = visibleRange.value;

  return props.items.slice(start, end).map((item, i) => ({

    item,

    index: start + i,

  }));

});



function styleFor(index: number) {

  const cols = columns.value;

  const row = Math.floor(index / cols);

  const col = index % cols;

  return {

    position: "absolute" as const,

    transform: `translate(${col * (colWidth.value + props.gap)}px, ${row * rowHeight.value}px)`,

    width: `${colWidth.value}px`,

    height: `${props.itemHeight}px`,

  };

}



function keyFor(item: T, index: number): string | number {

  if (!props.keyField) return index;

  if (typeof props.keyField === "function") return props.keyField(item, index);

  const v = item[props.keyField] as unknown;

  return typeof v === "string" || typeof v === "number" ? v : index;

}

</script>



<template>

  <div ref="scroller" class="vgrid">

    <div ref="root" class="vgrid__inner" :style="{ height: `${totalHeight}px` }">

      <div

        v-for="entry in visibleItems"

        :key="keyFor(entry.item, entry.index)"

        :style="styleFor(entry.index)"

      >

        <slot :item="entry.item" :index="entry.index" />

      </div>

    </div>

  </div>

</template>



<style scoped>

.vgrid {

  width: 100%;

  height: 100%;

  overflow-y: auto;

  position: relative;

}

.vgrid__inner {

  position: relative;

  width: 100%;

}

</style>

