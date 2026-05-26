<script setup lang="ts">
import { computed } from "vue";
import type { LineStatus } from "@/types/models";

const props = defineProps<{
  status?: LineStatus | null;
  latencyMs?: number | null;
  compact?: boolean;
}>();

const tone = computed(() => {
  const s = props.status ?? "unknown";
  switch (s) {
    case "healthy":
      return "var(--line-healthy)";
    case "slow":
      return "var(--line-slow)";
    case "degraded":
      return "var(--line-degraded)";
    case "down":
      return "var(--line-down)";
    default:
      return "var(--line-unknown)";
  }
});
</script>

<template>
  <span class="line-status" :class="{ 'is-compact': compact }">
    <span class="dot" :style="{ background: tone, boxShadow: `0 0 8px ${tone}` }" />
    <span v-if="!compact && latencyMs != null" class="lbl">{{ latencyMs }}ms</span>
  </span>
</template>

<style scoped>
.line-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--fg-tertiary);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.line-status.is-compact .dot {
  width: 8px;
  height: 8px;
  border: 1.5px solid var(--bg-base);
}
</style>
