<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Icon } from "@iconify/vue";
import { open } from "@tauri-apps/plugin-dialog";

import { api } from "@/api";
import { useSettingsStore } from "@/stores/settings";

const settings = useSettingsStore();

const status = ref<{ found: boolean; path: string; bundled: boolean } | null>(null);
const dismissed = ref(false);
const busy = ref(false);
const message = ref("");

async function check() {
  try {
    status.value = await api.detectMpv();
  } catch {
    status.value = null;
  }
}

onMounted(check);

async function pickMpv() {
  busy.value = true;
  message.value = "";
  try {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        { name: "mpv executable", extensions: ["exe"] },
        { name: "All", extensions: ["*"] },
      ],
      title: "选择 mpv.exe",
    });
    if (typeof selected === "string" && selected.length > 0) {
      await settings.update({ mpvExecutablePath: selected });
      await check();
      if (status.value?.found) {
        message.value = "mpv 路径已设置";
        setTimeout(() => (message.value = ""), 2500);
      }
    }
  } catch (e) {
    message.value = `选择失败：${String(e)}`;
  } finally {
    busy.value = false;
  }
}

async function downloadMpv() {
  busy.value = true;
  message.value = "";
  try {
    await api.openExternal("https://mpv.io/installation/");
    message.value = "已在浏览器打开 mpv 下载页";
    setTimeout(() => (message.value = ""), 3000);
  } catch (e) {
    message.value = `打开失败：${String(e)}`;
  } finally {
    busy.value = false;
  }
}

function dismiss() {
  dismissed.value = true;
}
</script>

<template>
  <Teleport to="body">
    <Transition name="banner">
      <div
        v-if="status && !status.found && !dismissed"
        class="banner"
        role="alert"
      >
        <div class="banner__icon">
          <Icon icon="lucide:triangle-alert" width="22" />
        </div>
        <div class="banner__body">
          <div class="banner__title">未检测到 mpv 播放器内核</div>
          <p class="banner__desc">
            Hills Lite 使用 mpv 作为视频解码内核。请下载并安装 mpv，或选择本机已安装的 mpv 路径，否则视频无法播放。
          </p>
          <p v-if="message" class="banner__msg">{{ message }}</p>
          <div class="banner__actions">
            <button class="btn btn--primary" :disabled="busy" @click="downloadMpv">
              <Icon icon="lucide:download" width="14" />
              下载 mpv
            </button>
            <button class="btn" :disabled="busy" @click="pickMpv">
              <Icon icon="lucide:folder-open" width="14" />
              选择 mpv 路径
            </button>
            <button class="btn btn--ghost" :disabled="busy" @click="check">
              <Icon icon="lucide:rotate-cw" width="14" />
              重新检测
            </button>
          </div>
        </div>
        <button class="banner__close" aria-label="关闭" @click="dismiss">
          <Icon icon="lucide:x" width="16" />
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.banner {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: 380px;
  max-width: calc(100vw - 40px);
  padding: 14px 16px 14px 14px;
  background: var(--glass-bg-strong);
  border: 1px solid var(--separator-strong);
  border-radius: 14px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
  display: grid;
  grid-template-columns: 32px 1fr auto;
  gap: 10px;
  z-index: 9999;
  color: var(--fg-primary);
}
.banner__icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(255, 159, 10, 0.18);
  color: var(--warning);
  display: grid;
  place-items: center;
}
.banner__body {
  min-width: 0;
}
.banner__title {
  font-size: 14px;
  font-weight: 700;
}
.banner__desc {
  margin: 4px 0 10px;
  font-size: 12px;
  color: var(--fg-secondary);
  line-height: 1.5;
}
.banner__msg {
  margin: 0 0 8px;
  font-size: 11px;
  color: var(--accent);
}
.banner__actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
}
.btn {
  appearance: none;
  border: 1px solid var(--separator);
  background: var(--glass-bg);
  color: var(--fg-primary);
  font-size: 12px;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: background 160ms var(--easing-glide), border-color 160ms var(--easing-glide);
}
.btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn--primary {
  background: var(--accent-grad);
  border-color: transparent;
  color: white;
}
.btn--primary:hover:not(:disabled) {
  filter: brightness(1.08);
}
.btn--ghost {
  background: transparent;
  border-color: transparent;
  color: var(--fg-tertiary);
}
.btn--ghost:hover:not(:disabled) {
  color: var(--fg-primary);
}
.banner__close {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--fg-tertiary);
  width: 22px;
  height: 22px;
  border-radius: 6px;
  cursor: pointer;
  display: inline-grid;
  place-items: center;
}
.banner__close:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--fg-primary);
}

.banner-enter-active,
.banner-leave-active {
  transition: opacity 240ms var(--easing-glide), transform 240ms var(--easing-spring);
}
.banner-enter-from,
.banner-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
