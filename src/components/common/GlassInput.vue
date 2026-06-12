<script setup lang="ts">
import { computed } from "vue";
import { Icon } from "@iconify/vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    type?: string;
    placeholder?: string;
    icon?: string;
    autocomplete?: string;
    block?: boolean;
    rightIcon?: string;
  }>(),
  { type: "text", block: true, autocomplete: "off" },
);

const emit = defineEmits<{
  (e: "update:modelValue", v: string): void;
  (e: "change", v: string): void;
  (e: "blur", v: string): void;
  (e: "rightIconClick"): void;
}>();

const v = computed({
  get: () => props.modelValue,
  set: (val: string) => emit("update:modelValue", val),
});

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value;
}

function onChange(event: Event) {
  emit("change", inputValue(event));
}

function onBlur(event: FocusEvent) {
  emit("blur", inputValue(event));
}
</script>

<template>
  <label class="ginput" :class="{ 'ginput--block': block }">
    <span v-if="icon" class="ginput__icon">
      <Icon :icon="icon" width="16" aria-hidden="true" />
    </span>
    <input
      :type="type"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      v-model="v"
      @change="onChange"
      @blur="onBlur"
    />
    <button
      v-if="rightIcon"
      type="button"
      class="ginput__right"
      @click="emit('rightIconClick')"
    >
      <Icon :icon="rightIcon" width="16" aria-hidden="true" />
    </button>
  </label>
</template>

<style scoped>
.ginput {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  background: var(--surface-subtle);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
  backdrop-filter: blur(14px) saturate(160%);
  transition: border-color 180ms var(--easing-glide),
    background 180ms var(--easing-glide);
}
.ginput:focus-within {
  border-color: var(--accent);
  background: var(--surface-hover);
  box-shadow: 0 0 0 4px var(--accent-soft);
}
.ginput--block {
  display: flex;
  width: 100%;
}
.ginput input {
  flex: 1;
  outline: none;
  border: none;
  background: transparent;
  color: var(--fg-primary);
  font-size: 15px;
  letter-spacing: 0.01em;
}
.ginput input::placeholder {
  color: var(--fg-tertiary);
}
.ginput__icon,
.ginput__right {
  display: flex;
  align-items: center;
  color: var(--fg-tertiary);
}
.ginput__right {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
}
.ginput__right:hover {
  color: var(--fg-primary);
  background: var(--surface-hover);
}
</style>
