<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { Icon } from "@iconify/vue";
import { invoke, listen } from "@/platform";

// Self-drawn window controls. The Electron window runs frameless (no OS title-bar
// overlay) so these can blend into the detail-page hero artwork; they drive the
// native window via window_* IPC commands.
const maximized = ref(false);
let unlisten: (() => void) | null = null;

async function refresh() {
  try {
    maximized.value = Boolean(await invoke("window_is_maximized"));
  } catch {
    /* ignore */
  }
}

function minimize() {
  invoke("window_minimize").catch(() => {});
}

async function toggleMaximize() {
  try {
    maximized.value = Boolean(await invoke("window_toggle_maximize"));
  } catch {
    /* ignore */
  }
}

function close() {
  invoke("window_close").catch(() => {});
}

onMounted(async () => {
  await refresh();
  try {
    unlisten = await listen<{ maximized: boolean }>("window:maximized", ({ payload }) => {
      maximized.value = Boolean(payload?.maximized);
    });
  } catch {
    /* ignore */
  }
});

onBeforeUnmount(() => {
  unlisten?.();
  unlisten = null;
});
</script>

<template>
  <div class="winctl">
    <button class="winctl__btn" type="button" aria-label="最小化" @click="minimize">
      <Icon icon="lucide:minus" width="16" />
    </button>
    <button
      class="winctl__btn"
      type="button"
      :aria-label="maximized ? '还原' : '最大化'"
      @click="toggleMaximize"
    >
      <Icon :icon="maximized ? 'lucide:copy' : 'lucide:square'" :width="maximized ? 13 : 12" />
    </button>
    <button class="winctl__btn winctl__btn--close" type="button" aria-label="关闭" @click="close">
      <Icon icon="lucide:x" width="17" />
    </button>
  </div>
</template>

<style scoped>
.winctl {
  position: fixed;
  top: 0;
  right: 0;
  height: var(--topbar-h, 44px);
  display: flex;
  z-index: 4000;
  -webkit-app-region: no-drag;
}
.winctl__btn {
  width: 46px;
  height: 100%;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  background: transparent;
  /* Theme-aware glyph: dark in light theme, light in dark theme (tracks the UI), so
     it reads correctly on bright hero artwork in light mode and dark UI in dark mode.
     A halo in the opposite (surface) color keeps it legible over busy artwork. */
  color: var(--fg-primary, #f5f5f7);
  filter: drop-shadow(0 0 2px var(--surface-1)) drop-shadow(0 0 1px var(--surface-1));
  opacity: 0.85;
  cursor: pointer;
  transition: background 120ms ease, opacity 120ms ease;
}
.winctl__btn:hover {
  background: rgba(255, 255, 255, 0.16);
  opacity: 1;
}
.winctl__btn--close:hover {
  background: #e81123;
  color: #fff;
}
</style>
