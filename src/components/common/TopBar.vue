<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

import { useAuthStore } from "@/stores/auth";
import { useLibraryStore } from "@/stores/library";

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const lib = useLibraryStore();

const term = ref("");
const focused = ref(false);
let timer: number | null = null;

const canSearch = computed(() => !!auth.activeAccount);
const canGoBack = computed(() => {
  return route.name !== "home";
});

watch(term, (v) => {
  if (timer != null) window.clearTimeout(timer);
  const q = v.trim();
  if (!q) {
    lib.clearSearch();
    return;
  }
  timer = window.setTimeout(() => {
    if (!canSearch.value) return;
    lib.search(q).catch(() => {});
    if (route.name !== "home") router.push("/home").catch(() => {});
  }, 280);
});

function clear() {
  term.value = "";
  lib.clearSearch();
}

function back() {
  router.back();
}
</script>

<template>
  <header class="topbar">
    <div class="topbar__left">
      <button
        v-if="canGoBack"
        class="round-btn"
        aria-label="返回"
        @click="back"
      >
        <Icon icon="lucide:chevron-left" width="18" />
      </button>
    </div>

    <div class="topbar__center">
      <div class="search" :class="{ 'is-focused': focused }">
        <Icon
          v-if="!lib.searching"
          icon="lucide:search"
          width="14"
          class="search__icon"
        />
        <Icon
          v-else
          icon="lucide:loader-2"
          width="14"
          class="search__icon search__icon--spin"
        />
        <input
          v-model="term"
          class="search__input"
          type="text"
          placeholder="搜索"
          spellcheck="false"
          autocomplete="off"
          :disabled="!canSearch"
          @focus="focused = true"
          @blur="focused = false"
        />
        <button v-if="term" class="search__clear" aria-label="清空" @click="clear">
          <Icon icon="lucide:x" width="14" />
        </button>
      </div>
    </div>

    <div class="topbar__right">
      <!-- Window controls are provided by the OS title bar (decorations: true).
           This empty slot reserves space so the drag region balances the layout. -->
    </div>
  </header>
</template>

<style scoped>
.topbar {
  height: var(--topbar-h);
  flex-shrink: 0;
  display: grid;
  grid-template-columns: 1fr 480px 1fr;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  background: var(--surface-1);
  border-bottom: 1px solid var(--separator);
  position: relative;
  z-index: 8;
}
.topbar__left {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding-left: 4px;
}
.topbar__right {
  height: 100%;
}
.topbar__center {
  display: flex;
  justify-content: center;
}

.round-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--fg-secondary);
  width: 30px;
  height: 30px;
  display: inline-grid;
  place-items: center;
  border-radius: 8px;
  cursor: pointer;
  transition: background 160ms var(--easing-glide), color 160ms var(--easing-glide);
}
.round-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--fg-primary);
}

.search {
  display: inline-grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  width: 100%;
  max-width: 480px;
  height: 30px;
  padding: 0 10px;
  background: var(--surface-2);
  border: 1px solid var(--separator);
  border-radius: 999px;
  color: var(--fg-secondary);
  transition: border-color 160ms var(--easing-glide), background 160ms var(--easing-glide);
}
.search.is-focused {
  border-color: var(--accent);
  background: var(--surface-3);
}
.search__icon {
  color: var(--fg-tertiary);
}
.search__icon--spin {
  color: var(--accent);
  animation: tb-spin 800ms linear infinite;
}
@keyframes tb-spin {
  to { transform: rotate(360deg); }
}
.search__input {
  appearance: none;
  border: none;
  outline: none;
  background: transparent;
  color: var(--fg-primary);
  font-size: 13px;
  width: 100%;
  min-width: 0;
}
.search__input::placeholder {
  color: var(--fg-tertiary);
}
.search__input:disabled {
  cursor: not-allowed;
}
.search__clear {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--fg-tertiary);
  width: 20px;
  height: 20px;
  display: inline-grid;
  place-items: center;
  border-radius: 50%;
  cursor: pointer;
}
.search__clear:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--fg-primary);
}

@media (max-width: 900px) {
  .topbar {
    grid-template-columns: auto 1fr auto;
  }
  .topbar__center .search {
    max-width: 100%;
  }
}

@media (max-height: 480px) {
  .topbar {
    height: 38px;
  }
  .search {
    height: 28px;
  }
}
</style>
