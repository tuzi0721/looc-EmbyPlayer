<script setup lang="ts">
import { Icon } from "@iconify/vue";

defineProps<{
  title: string;
  summary?: string;
  icon?: string;
  expanded: boolean;
}>();

const emit = defineEmits<{ (e: "toggle"): void }>();
</script>

<template>
  <section class="settings-section" :class="{ 'is-expanded': expanded }">
    <button
      type="button"
      class="settings-section__head"
      :aria-expanded="expanded"
      @click="emit('toggle')"
    >
      <Icon v-if="icon" :icon="icon" width="18" class="settings-section__icon" />
      <span class="settings-section__title">{{ title }}</span>
      <span v-if="summary && !expanded" class="settings-section__summary">{{ summary }}</span>
      <Icon
        icon="lucide:chevron-down"
        width="18"
        class="settings-section__chev"
      />
    </button>
    <div v-if="expanded" class="settings-section__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.settings-section {
  border-bottom: 1px solid var(--separator);
}
.settings-section__head {
  appearance: none;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  color: var(--fg-primary);
  transition: color 160ms var(--easing-glide);
}
.settings-section__head:hover {
  color: var(--fg-primary);
}
.settings-section__head:hover .settings-section__chev {
  color: var(--fg-secondary);
}
.settings-section__icon {
  flex-shrink: 0;
  color: var(--fg-secondary);
}
.settings-section__title {
  font-size: 15px;
  font-weight: 600;
  flex: 1;
  min-width: 0;
}
.settings-section__summary {
  font-size: 12px;
  color: var(--fg-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 50%;
}
.settings-section__chev {
  flex-shrink: 0;
  color: var(--fg-tertiary);
  transition: transform 200ms var(--easing-spring);
}
.settings-section.is-expanded .settings-section__chev {
  transform: rotate(180deg);
}
.settings-section__body {
  padding: 0 4px 12px 4px;
  animation: section-reveal 220ms var(--easing-glide);
}
@keyframes section-reveal {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Sub-group heading inside a section (e.g. player: 解码与输出 / 音轨语言 ...) */
:slotted(.settings-subhead) {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fg-tertiary);
  padding: 14px 4px 6px;
  margin: 0;
}
</style>
