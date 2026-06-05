<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { Icon } from "@iconify/vue";

import { hasNativeRuntime } from "@/platform";

// Custom dark title bar shown when the window runs undecorated
// (`decorations:false`). Provides drag, minimize/maximize/restore/close, and
// edge/corner resize grips (Windows loses native resize borders when
// undecorated). No-ops gracefully outside the Tauri runtime.
const native = hasNativeRuntime();
const maximized = ref(false);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let appWindow: any = null;
let unlisten: (() => void) | null = null;

async function win() {
  if (appWindow) return appWindow;
  const mod = await import("@tauri-apps/api/window");
  appWindow = mod.getCurrentWindow();
  return appWindow;
}

async function refreshMaximized() {
  try {
    maximized.value = await (await win()).isMaximized();
  } catch {
    /* ignore */
  }
}

async function minimize() {
  try {
    await (await win()).minimize();
  } catch {
    /* ignore */
  }
}

async function toggleMaximize() {
  try {
    await (await win()).toggleMaximize();
    await refreshMaximized();
  } catch {
    /* ignore */
  }
}

async function closeWindow() {
  try {
    await (await win()).close();
  } catch {
    /* ignore */
  }
}

const resizeGrips = [
  { dir: "North", cls: "n" },
  { dir: "South", cls: "s" },
  { dir: "West", cls: "w" },
  { dir: "East", cls: "e" },
  { dir: "NorthWest", cls: "nw" },
  { dir: "NorthEast", cls: "ne" },
  { dir: "SouthWest", cls: "sw" },
  { dir: "SouthEast", cls: "se" },
] as const;

async function startResize(direction: string, event: PointerEvent) {
  if (event.button !== 0) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (await win()).startResizeDragging(direction as any);
  } catch {
    /* ignore */
  }
}

onMounted(async () => {
  if (!native) return;
  await refreshMaximized();
  try {
    unlisten = await (await win()).onResized(() => {
      void refreshMaximized();
    });
  } catch {
    /* ignore */
  }
});

onBeforeUnmount(() => {
  if (unlisten) unlisten();
});
</script>

<template>
  <div v-if="native" class="winbar">
    <div class="winbar__drag" data-tauri-drag-region>
      <span class="winbar__title" data-tauri-drag-region>Hills Lite</span>
    </div>
    <div class="winbar__controls">
      <button class="winbar__btn" type="button" title="最小化" @click="minimize">
        <Icon icon="lucide:minus" width="16" />
      </button>
      <button class="winbar__btn" type="button" :title="maximized ? '还原' : '最大化'" @click="toggleMaximize">
        <Icon :icon="maximized ? 'lucide:copy' : 'lucide:square'" :width="maximized ? 14 : 13" />
      </button>
      <button class="winbar__btn winbar__btn--close" type="button" title="关闭" @click="closeWindow">
        <Icon icon="lucide:x" width="16" />
      </button>
    </div>
    <div
      v-for="grip in resizeGrips"
      :key="grip.dir"
      class="winbar__resize"
      :class="`winbar__resize--${grip.cls}`"
      @pointerdown="(event) => startResize(grip.dir, event)"
    />
  </div>
</template>

<style scoped>
.winbar {
  flex: 0 0 auto;
  height: 34px;
  display: flex;
  align-items: stretch;
  background: var(--surface-1);
  border-bottom: 1px solid var(--separator);
  user-select: none;
  -webkit-user-select: none;
  position: relative;
  z-index: 70;
}
.winbar__drag {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  padding: 0 12px;
  -webkit-app-region: drag;
}
.winbar__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--fg-tertiary);
  letter-spacing: 0.2px;
  white-space: nowrap;
  pointer-events: none;
}
.winbar__controls {
  display: flex;
  align-items: stretch;
}
.winbar__btn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--fg-secondary);
  width: 46px;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background 140ms var(--easing-glide), color 140ms var(--easing-glide);
}
.winbar__btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--fg-primary);
}
:root[data-theme="light"] .winbar__btn:hover {
  background: rgba(15, 23, 42, 0.08);
}
.winbar__btn--close:hover {
  background: #e81123;
  color: #fff;
}
.winbar__resize {
  position: fixed;
  z-index: 9999;
}
.winbar__resize--n {
  top: 0;
  left: 8px;
  right: 8px;
  height: 4px;
  cursor: ns-resize;
}
.winbar__resize--s {
  bottom: 0;
  left: 8px;
  right: 8px;
  height: 4px;
  cursor: ns-resize;
}
.winbar__resize--w {
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 4px;
  cursor: ew-resize;
}
.winbar__resize--e {
  right: 0;
  top: 8px;
  bottom: 8px;
  width: 4px;
  cursor: ew-resize;
}
.winbar__resize--nw {
  top: 0;
  left: 0;
  width: 9px;
  height: 9px;
  cursor: nwse-resize;
}
.winbar__resize--ne {
  top: 0;
  right: 0;
  width: 9px;
  height: 9px;
  cursor: nesw-resize;
}
.winbar__resize--sw {
  bottom: 0;
  left: 0;
  width: 9px;
  height: 9px;
  cursor: nesw-resize;
}
.winbar__resize--se {
  bottom: 0;
  right: 0;
  width: 9px;
  height: 9px;
  cursor: nwse-resize;
}
</style>
