<script setup lang="ts">
import { Icon } from "@iconify/vue";

withDefaults(
  defineProps<{
    label: string;
    description?: string;
    icon?: string;
    /** Render the control on its own full-width line below the label (sliders, segmented, inputs). */
    stacked?: boolean;
    /** 🔸 advanced option badge. */
    advanced?: boolean;
    /** 🆕 previously had no dedicated UI. */
    isNew?: boolean;
    /** Whole row behaves as a navigation/jump button. */
    clickable?: boolean;
    disabled?: boolean;
  }>(),
  {
    stacked: false,
    advanced: false,
    isNew: false,
    clickable: false,
    disabled: false,
  },
);

defineEmits<{ (e: "click"): void }>();
</script>

<template>
  <component
    :is="clickable ? 'button' : 'div'"
    class="setting-row"
    :class="{
      'setting-row--stacked': stacked,
      'setting-row--clickable': clickable,
    }"
    :type="clickable ? 'button' : undefined"
    :disabled="clickable ? disabled : undefined"
    @click="clickable && $emit('click')"
  >
    <div class="setting-row__main">
      <Icon v-if="icon" :icon="icon" width="18" class="setting-row__icon" />
      <div class="setting-row__text">
        <span class="setting-row__label">
          {{ label }}
          <span v-if="advanced" class="setting-row__badge" title="高级选项">高级</span>
          <span v-if="isNew" class="setting-row__badge setting-row__badge--new" title="新增设置">新</span>
        </span>
        <span v-if="description" class="setting-row__desc">{{ description }}</span>
      </div>
      <div v-if="!stacked" class="setting-row__control">
        <slot />
      </div>
    </div>
    <div v-if="stacked" class="setting-row__control setting-row__control--block">
      <slot />
    </div>
  </component>
</template>

<style scoped>
.setting-row {
  display: block;
  width: 100%;
  padding: 14px 6px;
  border-bottom: 1px solid var(--separator);
  text-align: left;
  color: var(--fg-primary);
  font: inherit;
}
.setting-row:last-child {
  border-bottom: none;
}
.setting-row--clickable {
  appearance: none;
  background: transparent;
  border-left: none;
  border-right: none;
  border-top: none;
  cursor: pointer;
  transition: color 160ms var(--easing-glide);
}
.setting-row--clickable:hover:not(:disabled) {
  color: var(--accent-hover);
}
.setting-row--clickable:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.setting-row__main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 28px;
}
.setting-row__icon {
  flex-shrink: 0;
  color: var(--fg-tertiary);
}
.setting-row__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.setting-row__label {
  font-size: 14px;
  color: var(--fg-primary);
  line-height: 1.3;
}
.setting-row__badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  color: var(--fg-tertiary);
  font-size: 10px;
  font-weight: 600;
  vertical-align: middle;
}
.setting-row__badge--new {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 42%, transparent);
}
.setting-row__desc {
  font-size: 12px;
  color: var(--fg-tertiary);
  line-height: 1.4;
}
.setting-row__control {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
}
.setting-row__control--block {
  display: block;
  margin-top: 10px;
}
</style>
