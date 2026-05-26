<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Icon } from "@iconify/vue";

import GlassInput from "@/components/common/GlassInput.vue";
import LineStatusDot from "@/components/common/LineStatusDot.vue";
import ShortcutsPanel from "@/components/settings/ShortcutsPanel.vue";
import AddServerDialog from "@/components/login/AddServerDialog.vue";
import { useSettingsStore } from "@/stores/settings";
import { useServerStore } from "@/stores/server";

type PanelId =
  | null
  | "pro"
  | "theme"
  | "network"
  | "player"
  | "shortcuts"
  | "servers";

const settings = useSettingsStore();
const serverStore = useServerStore();

const probing = ref<string | null>(null);
const showAdd = ref(false);
const openPanel = ref<PanelId>(null);

onMounted(async () => {
  await settings.refresh();
  await serverStore.refresh();
});

async function probe(id: string) {
  probing.value = id;
  try {
    await serverStore.testLines(id);
  } finally {
    probing.value = null;
  }
}

async function save<K extends keyof typeof settings.settings>(
  key: K,
  value: (typeof settings.settings)[K],
) {
  await settings.update({ [key]: value } as any);
}

const hiddenSet = computed(() => new Set(settings.settings.hiddenServerIds ?? []));

async function toggleHidden(serverId: string, currentlyHidden: boolean) {
  await settings.toggleHidden(serverId, !currentlyHidden);
}

function togglePanel(id: PanelId) {
  openPanel.value = openPanel.value === id ? null : id;
}

const themeLabel = computed(() => {
  const t = settings.settings.theme;
  if (t === "light") return "浅色";
  if (t === "auto") return "Auto";
  return "深色";
});
</script>

<template>
  <section class="settings">
    <header class="settings__head">
      <h1>设置</h1>
    </header>

    <div class="settings__list">
      <h2 class="group-title">通用</h2>

      <button class="row" @click="togglePanel('pro')">
        <span>Hills Lite Pro</span>
        <Icon icon="lucide:chevron-right" width="16" class="chev" />
      </button>

      <div class="row row--static">
        <span>语言</span>
        <span class="value">Auto</span>
      </div>

      <button class="row" @click="togglePanel('theme')">
        <span>主题</span>
        <span class="value">{{ themeLabel }}</span>
      </button>
      <div v-if="openPanel === 'theme'" class="panel glass">
        <div class="seg">
          <button
            type="button"
            :class="{ active: settings.settings.theme === 'dark' }"
            @click="save('theme', 'dark')"
          >
            深色
          </button>
          <button
            type="button"
            :class="{ active: settings.settings.theme === 'light' }"
            @click="save('theme', 'light')"
          >
            浅色
          </button>
          <button
            type="button"
            :class="{ active: settings.settings.theme === 'auto' }"
            @click="save('theme', 'auto')"
          >
            Auto
          </button>
        </div>
        <label class="field">
          <span>模糊强度</span>
          <input
            type="range"
            min="0"
            max="48"
            :value="settings.settings.blurStrength"
            @input="(e: any) => save('blurStrength', Number(e.target.value))"
          />
        </label>
      </div>

      <button class="row" @click="togglePanel('servers')">
        <span>媒体库 / 服务器</span>
        <Icon icon="lucide:chevron-right" width="16" class="chev" />
      </button>
      <div v-if="openPanel === 'servers'" class="panel glass">
        <div class="panel__head">
          <span>已保存的服务器</span>
          <button class="link" @click="showAdd = true">添加</button>
        </div>
        <div v-if="serverStore.servers.length === 0" class="empty">还没有服务器</div>
        <div v-for="s in serverStore.servers" :key="s.id" class="server glass-thin">
          <div class="server__top">
            <strong>{{ s.name }}</strong>
            <div class="server__actions">
              <button class="link" :disabled="probing === s.id" @click="probe(s.id)">测活</button>
              <button class="link" @click="toggleHidden(s.id, hiddenSet.has(s.id))">
                {{ hiddenSet.has(s.id) ? "显示" : "隐藏" }}
              </button>
              <button class="link danger" @click="serverStore.removeServer(s.id)">删除</button>
            </div>
          </div>
          <ul class="lines">
            <li v-for="l in s.lines" :key="l.id">
              <div>
                <div>{{ l.name }}</div>
                <div class="dim">{{ l.baseUrl }}</div>
              </div>
              <LineStatusDot :status="l.lastStatus" :latency-ms="l.lastLatencyMs" />
            </li>
          </ul>
        </div>
      </div>

      <div class="row row--static">
        <span>备份与还原</span>
        <Icon icon="lucide:chevron-right" width="16" class="chev dim" />
      </div>
      <div class="row row--static">
        <span>同步</span>
        <Icon icon="lucide:chevron-right" width="16" class="chev dim" />
      </div>
      <div class="row row--static">
        <span>关闭时最小化到托盘</span>
        <input type="checkbox" disabled />
      </div>

      <button class="row" @click="togglePanel('network')">
        <span>网络</span>
        <Icon icon="lucide:chevron-right" width="16" class="chev" />
      </button>
      <div v-if="openPanel === 'network'" class="panel glass">
        <label class="field">
          <span>心跳保号周期（秒）</span>
          <GlassInput
            :model-value="String(settings.settings.heartbeatIntervalSecs)"
            @update:modelValue="(v) => save('heartbeatIntervalSecs', Number(v) || 180)"
          />
        </label>
        <label class="field">
          <span>线路测活周期（秒）</span>
          <GlassInput
            :model-value="String(settings.settings.healthCheckIntervalSecs)"
            @update:modelValue="(v) => save('healthCheckIntervalSecs', Number(v) || 60)"
          />
        </label>
        <label class="field">
          <span>线路竞赛超时（ms）</span>
          <GlassInput
            :model-value="String(settings.settings.raceTimeoutMs)"
            @update:modelValue="(v) => save('raceTimeoutMs', Number(v) || 3500)"
          />
        </label>
        <label class="field">
          <span>请求超时（ms）</span>
          <GlassInput
            :model-value="String(settings.settings.requestTimeoutMs)"
            @update:modelValue="(v) => save('requestTimeoutMs', Number(v) || 15000)"
          />
        </label>
      </div>

      <h2 class="group-title">播放器</h2>

      <div class="row row--static">
        <span>交互</span>
        <Icon icon="lucide:chevron-right" width="16" class="chev dim" />
      </div>

      <button class="row" @click="togglePanel('player')">
        <span>播放器</span>
        <Icon icon="lucide:chevron-right" width="16" class="chev" />
      </button>
      <div v-if="openPanel === 'player'" class="panel glass">
        <label class="field">
          <span>MPV 后端</span>
          <div class="seg">
            <button
              type="button"
              :class="{ active: settings.settings.mpvBackend === 'ipc' }"
              @click="save('mpvBackend', 'ipc')"
            >
              IPC
            </button>
            <button
              type="button"
              :class="{ active: settings.settings.mpvBackend === 'embedded' }"
              @click="save('mpvBackend', 'embedded')"
            >
              内嵌
            </button>
          </div>
        </label>
        <label class="field">
          <span>MPV 路径</span>
          <GlassInput
            :model-value="settings.settings.mpvExecutablePath ?? ''"
            placeholder="留空使用内置 mpv"
            @update:modelValue="(v) => save('mpvExecutablePath', v || null as any)"
          />
        </label>
        <label class="field">
          <span>硬件解码</span>
          <div class="seg">
            <button
              type="button"
              :class="{ active: settings.settings.hardwareDecoding }"
              @click="save('hardwareDecoding', true)"
            >
              开启
            </button>
            <button
              type="button"
              :class="{ active: !settings.settings.hardwareDecoding }"
              @click="save('hardwareDecoding', false)"
            >
              关闭
            </button>
          </div>
        </label>
        <label class="field">
          <span>缓存（MB）</span>
          <GlassInput
            :model-value="String(settings.settings.mpvCacheMb)"
            @update:modelValue="(v) => save('mpvCacheMb', Number(v) || 256)"
          />
        </label>
      </div>

      <div class="row row--static">
        <span>外部播放器</span>
        <Icon icon="lucide:chevron-right" width="16" class="chev dim" />
      </div>
      <div class="row row--static">
        <span>弹幕</span>
        <Icon icon="lucide:chevron-right" width="16" class="chev dim" />
      </div>

      <button class="row" @click="togglePanel('shortcuts')">
        <span>快捷键</span>
        <Icon icon="lucide:chevron-right" width="16" class="chev" />
      </button>
      <div v-if="openPanel === 'shortcuts'" class="panel">
        <ShortcutsPanel />
      </div>
    </div>

    <AddServerDialog v-if="showAdd" @close="showAdd = false" />
  </section>
</template>

<style scoped>
.settings {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-1);
}
.settings__head {
  padding: 18px var(--content-pad) 8px;
  flex-shrink: 0;
}
.settings__head h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}
.settings__list {
  flex: 1;
  overflow-y: auto;
  padding: 8px var(--content-pad) 32px;
  max-width: 720px;
}
.group-title {
  margin: 18px 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-tertiary);
}
.group-title:first-child {
  margin-top: 0;
}
.row {
  appearance: none;
  border: none;
  background: transparent;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 4px;
  border-bottom: 1px solid var(--separator);
  color: var(--fg-primary);
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}
.row--static {
  cursor: default;
}
.row:hover:not(.row--static) {
  color: var(--accent-hover);
}
.value {
  color: var(--fg-secondary);
  font-size: 14px;
}
.chev {
  color: var(--fg-tertiary);
}
.chev.dim {
  opacity: 0.5;
}
.panel {
  margin: 4px 0 8px;
  padding: 14px;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.panel__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: var(--fg-secondary);
}
.empty {
  font-size: 13px;
  color: var(--fg-tertiary);
  padding: 8px 0;
}
.server {
  padding: 12px;
  border-radius: 12px;
  margin-bottom: 8px;
}
.server__top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.server__actions {
  display: flex;
  gap: 10px;
}
.lines {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.lines li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  padding: 6px 0;
  border-top: 1px solid var(--separator);
}
.dim {
  color: var(--fg-tertiary);
  word-break: break-all;
}
.link {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}
.link.danger {
  color: var(--danger);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field > span {
  font-size: 12px;
  color: var(--fg-secondary);
}
.seg {
  display: inline-flex;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
}
.seg button {
  appearance: none;
  border: none;
  padding: 7px 12px;
  border-radius: 8px;
  cursor: pointer;
  background: transparent;
  color: var(--fg-secondary);
  font-size: 13px;
}
.seg .active {
  background: var(--accent-soft);
  color: var(--accent);
}
input[type="range"] {
  accent-color: var(--accent);
}
</style>
