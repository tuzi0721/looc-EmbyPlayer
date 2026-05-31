<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

import { useSettingsStore } from "@/stores/settings";
import { useServerStore } from "@/stores/server";

const settings = useSettingsStore();
const servers = useServerStore();
const router = useRouter();

const hasServers = computed(() => servers.servers.length > 0);

async function finish() {
  await settings.update({ firstRunCompleted: true });
}

async function go(path: string) {
  await finish();
  router.push(path).catch(() => {});
}
</script>

<template>
  <div class="first-run" role="dialog" aria-modal="true" aria-labelledby="first-run-title">
    <div class="first-run__panel glass glass-strong">
      <button class="first-run__close" type="button" aria-label="关闭" @click="finish">
        <Icon icon="lucide:x" width="18" />
      </button>
      <div class="first-run__mark">
        <Icon icon="lucide:play" width="26" />
      </div>
      <h2 id="first-run-title">开始使用 Hills Lite</h2>
      <div class="first-run__actions">
        <button type="button" class="primary" @click="go('/settings?c=servers')">
          <Icon icon="lucide:server" width="17" />
          <span>{{ hasServers ? "管理服务器" : "添加服务器" }}</span>
        </button>
        <button type="button" @click="go('/settings?c=player')">
          <Icon icon="lucide:play-circle" width="17" />
          <span>播放器设置</span>
        </button>
        <button type="button" @click="go('/home')">
          <Icon icon="lucide:library" width="17" />
          <span>进入首页</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.first-run {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.48);
  backdrop-filter: blur(18px);
}
.first-run__panel {
  position: relative;
  width: min(420px, 100%);
  border-radius: 14px;
  padding: 28px;
  text-align: center;
}
.first-run__close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 34px;
  height: 34px;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--fg-secondary);
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
}
.first-run__mark {
  width: 54px;
  height: 54px;
  margin: 0 auto 14px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: var(--accent);
  background: var(--accent-soft);
}
h2 {
  margin: 0 0 18px;
  color: var(--fg-primary);
  font-size: 22px;
  letter-spacing: 0;
}
.first-run__actions {
  display: grid;
  gap: 10px;
}
.first-run__actions button {
  min-height: 42px;
  border: 1px solid var(--glass-border);
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--fg-primary);
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  font-size: 14px;
}
.first-run__actions button.primary {
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  color: var(--accent);
  background: var(--accent-soft);
}
</style>
