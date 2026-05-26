<script setup lang="ts">
import { useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

defineProps<{ title?: string; backTo?: string; showBack?: boolean }>();

const router = useRouter();
function onBack(to?: string) {
  if (to) router.push(to);
  else router.back();
}
</script>

<template>
  <header class="navbar glass-thin">
    <div class="navbar__side left">
      <button v-if="showBack" class="iconbtn" @click="onBack(backTo)" aria-label="Back">
        <Icon icon="lucide:chevron-left" width="20" />
      </button>
      <slot name="left" />
    </div>
    <div class="navbar__title">
      <slot name="title">
        <span>{{ title }}</span>
      </slot>
    </div>
    <div class="navbar__side right">
      <slot name="right" />
    </div>
  </header>
</template>

<style scoped>
.navbar {
  position: sticky;
  top: 0;
  z-index: 30;
  height: var(--header-h);
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--separator);
  border-radius: 0;
}
.navbar__side {
  display: flex;
  align-items: center;
  gap: 8px;
}
.navbar__side.right {
  justify-content: flex-end;
}
.navbar__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--fg-primary);
  letter-spacing: 0.01em;
}

.iconbtn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--fg-primary);
  height: 32px;
  width: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  cursor: pointer;
  transition: background 180ms var(--easing-glide);
}
.iconbtn:hover {
  background: rgba(255, 255, 255, 0.06);
}
</style>
