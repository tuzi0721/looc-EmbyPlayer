<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md" | "lg";
    block?: boolean;
    disabled?: boolean;
    loading?: boolean;
  }>(),
  { variant: "secondary", size: "md", block: false, disabled: false, loading: false },
);
</script>

<template>
  <button
    class="gbtn"
    :class="[`gbtn--${variant}`, `gbtn--${size}`, block ? 'gbtn--block' : '']"
    :disabled="disabled || loading"
  >
    <span v-if="loading" class="spinner" />
    <slot />
  </button>
</template>

<style scoped>
.gbtn {
  appearance: none;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  color: var(--fg-primary);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  border-radius: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 180ms var(--easing-glide), transform 180ms var(--easing-spring),
    box-shadow 180ms var(--easing-glide);
}
.gbtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.gbtn:hover:not(:disabled) {
  background: var(--glass-bg-strong);
  transform: translateY(-1px);
}
.gbtn:active:not(:disabled) {
  transform: translateY(0);
}

.gbtn--sm {
  padding: 6px 14px;
  font-size: 13px;
  border-radius: 10px;
}
.gbtn--md {
  padding: 10px 18px;
  font-size: 14px;
}
.gbtn--lg {
  padding: 14px 22px;
  font-size: 16px;
  border-radius: 14px;
}

.gbtn--primary {
  background: linear-gradient(180deg, var(--accent) 0%, var(--accent-pressed) 100%);
  border-color: rgba(255, 255, 255, 0.18);
  color: white;
  box-shadow: 0 10px 30px rgba(10, 132, 255, 0.35);
}
.gbtn--primary:hover:not(:disabled) {
  filter: brightness(1.06);
  background: linear-gradient(180deg, var(--accent-hover) 0%, var(--accent) 100%);
}

.gbtn--danger {
  background: linear-gradient(180deg, var(--danger) 0%, #c33028 100%);
  color: white;
  border-color: rgba(255, 255, 255, 0.18);
}

.gbtn--ghost {
  background: transparent;
  border-color: transparent;
}
.gbtn--ghost:hover:not(:disabled) {
  background: var(--glass-bg);
}

.gbtn--block {
  width: 100%;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 700ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
