<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import { useRoute } from "vue-router";

import GlassInput from "@/components/common/GlassInput.vue";
import LineStatusDot from "@/components/common/LineStatusDot.vue";
import ShortcutsPanel from "@/components/settings/ShortcutsPanel.vue";
import AddServerDialog from "@/components/login/AddServerDialog.vue";
import { api } from "@/api";
import { openFileDialog, platformType } from "@/platform";
import { useAuthStore } from "@/stores/auth";
import { useLibraryStore } from "@/stores/library";
import { useSettingsStore } from "@/stores/settings";
import { useServerStore } from "@/stores/server";
import type { Line, Server } from "@/types/models";
import { headersToText, normalizeNullableText, parseHeaderText } from "@/utils/headerText";

type PanelId =
  | null
  | "about"
  | "theme"
  | "library"
  | "backup"
  | "sync"
  | "network"
  | "player"
  | "externalPlayer"
  | "danmaku"
  | "shortcuts"
  | "servers";

const auth = useAuthStore();
const lib = useLibraryStore();
const settings = useSettingsStore();
const serverStore = useServerStore();
const route = useRoute();

const probing = ref<string | null>(null);
const showAdd = ref(false);
const openPanel = ref<PanelId>(null);
const editingServerId = ref<string | null>(null);
const savingServerId = ref<string | null>(null);
const externalPlayerPathDraft = ref("");
const externalPlayerArgsDraft = ref("");
const traktUsernameDraft = ref("");
const backupBusy = ref<"export" | "import" | null>(null);
const backupStatus = ref("");
const backupAvailable = typeof window !== "undefined" && Boolean(window.hillsLite);
const appVersion = "0.1.0";
const platformLabel = ref("...");

type ServerLineDraft = {
  id?: string;
  name: string;
  baseUrl: string;
  userAgent: string;
  headersText: string;
  enabled: boolean;
};

type ServerDraft = {
  defaultUserAgent: string;
  lines: ServerLineDraft[];
  error: string | null;
};

type ServerLinePayload = {
  id?: string;
  name: string;
  baseUrl: string;
  userAgent: string | null;
  headers: [string, string][];
  priority: number;
  enabled: boolean;
};

const serverDrafts = ref<Record<string, ServerDraft>>({});

function panelFromQuery(value: unknown): PanelId {
  const category = Array.isArray(value) ? value[0] : value;
  switch (category) {
    case "servers":
    case "network":
    case "player":
    case "externalPlayer":
    case "danmaku":
    case "shortcuts":
    case "backup":
    case "sync":
      return category;
    case "external-player":
      return "externalPlayer";
    case "appearance":
      return "theme";
    case "library":
      return "library";
    case "about":
      return "about";
    default:
      return null;
  }
}

watch(
  () => route.query.c,
  (category) => {
    const panel = panelFromQuery(category);
    if (panel) openPanel.value = panel;
  },
  { immediate: true },
);

watch(
  () => settings.settings.externalPlayerPath,
  (path) => {
    externalPlayerPathDraft.value = path ?? "";
  },
  { immediate: true },
);

watch(
  () => settings.settings.externalPlayerArgs,
  (args) => {
    externalPlayerArgsDraft.value = args ?? "";
  },
  { immediate: true },
);

watch(
  () => settings.settings.traktUsername,
  (name) => {
    traktUsernameDraft.value = name ?? "";
  },
  { immediate: true },
);

onMounted(async () => {
  await Promise.all([settings.refresh(), serverStore.refresh()]);
  platformLabel.value = await platformType().catch(() => "unknown");
});

async function probe(id: string) {
  probing.value = id;
  try {
    await serverStore.testLines(id);
  } finally {
    probing.value = null;
  }
}

async function onServerCreated(_id: string, loggedIn = false) {
  showAdd.value = false;
  openPanel.value = "servers";
  await Promise.all([
    serverStore.refresh().catch(() => {}),
    loggedIn ? auth.refresh().catch(() => {}) : Promise.resolve(),
  ]);
  if (loggedIn) {
    await lib.refreshHome().catch(() => {});
  }
}

async function save<K extends keyof typeof settings.settings>(
  key: K,
  value: (typeof settings.settings)[K],
) {
  await settings.update({ [key]: value } as any);
}

function normalizeSkipSeconds(value: string | number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(600, Math.round(parsed)));
}

async function saveExternalPlayerPath(value = externalPlayerPathDraft.value) {
  const normalized = value.trim() || null;
  const current = settings.settings.externalPlayerPath ?? null;

  externalPlayerPathDraft.value = normalized ?? "";
  if (normalized === current) return;

  await save("externalPlayerPath", normalized as any);
}

async function saveExternalPlayerArgs(value = externalPlayerArgsDraft.value) {
  const normalized = value.trim();
  if (normalized === (settings.settings.externalPlayerArgs ?? "")) return;
  externalPlayerArgsDraft.value = normalized;
  await save("externalPlayerArgs", normalized as any);
}

async function pickExternalPlayer() {
  const selected = await openFileDialog({
    multiple: false,
    directory: false,
    filters: [
      { name: "Executable", extensions: ["exe"] },
      { name: "All", extensions: ["*"] },
    ],
    title: "选择外部播放器",
  });
  if (typeof selected === "string" && selected.length > 0) {
    externalPlayerPathDraft.value = selected;
    await saveExternalPlayerPath(selected);
  }
}

async function saveTraktUsername(value = traktUsernameDraft.value) {
  const normalized = value.trim() || null;
  const current = settings.settings.traktUsername ?? null;
  traktUsernameDraft.value = normalized ?? "";
  if (normalized === current) return;
  await save("traktUsername", normalized as any);
}

async function openWindowsHdrSettings() {
  await api.openExternal("ms-settings:display").catch(() => {});
}

const hiddenSet = computed(() => new Set(settings.settings.hiddenServerIds ?? []));

async function toggleHidden(serverId: string, currentlyHidden: boolean) {
  await settings.toggleHidden(serverId, !currentlyHidden);
}

function createServerLineDraft(line: Partial<Line> = {}, index = 0): ServerLineDraft {
  return {
    id: line.id,
    name: line.name ?? `线路 ${index + 1}`,
    baseUrl: line.baseUrl ?? "",
    userAgent: line.userAgent ?? "",
    headersText: headersToText(line.headers),
    enabled: line.enabled ?? true,
  };
}

function beginServerEdit(server: Server) {
  serverDrafts.value = {
    ...serverDrafts.value,
    [server.id]: {
      defaultUserAgent: server.defaultUserAgent ?? "",
      lines: server.lines.map((line, index) => createServerLineDraft(line, index)),
      error: null,
    },
  };
  editingServerId.value = server.id;
}

function cancelServerEdit(serverId: string) {
  const next = { ...serverDrafts.value };
  delete next[serverId];
  serverDrafts.value = next;
  if (editingServerId.value === serverId) editingServerId.value = null;
}

function addServerDraftLine(serverId: string) {
  const draft = serverDrafts.value[serverId];
  if (!draft) return;
  draft.lines.push(createServerLineDraft({}, draft.lines.length));
}

function removeServerDraftLine(serverId: string, index: number) {
  const draft = serverDrafts.value[serverId];
  if (!draft || draft.lines.length === 1) return;
  draft.lines.splice(index, 1);
}

async function saveServerDraft(server: Server) {
  const draft = serverDrafts.value[server.id];
  if (!draft) return;

  draft.error = null;
  let lines: ServerLinePayload[];
  try {
    lines = draft.lines.map((line, index) => {
      const baseUrl = line.baseUrl.trim();
      if (!baseUrl) throw new Error(`线路 ${index + 1} 需要填写 URL`);
      return {
        id: line.id,
        name: line.name.trim() || `线路 ${index + 1}`,
        baseUrl,
        userAgent: normalizeNullableText(line.userAgent),
        headers: parseHeaderText(line.headersText),
        priority: index,
        enabled: line.enabled,
      };
    });
  } catch (error) {
    draft.error = error instanceof Error ? error.message : String(error);
    return;
  }

  savingServerId.value = server.id;
  try {
    await serverStore.updateServer({
      id: server.id,
      name: server.name,
      kind: server.kind,
      defaultUserAgent: normalizeNullableText(draft.defaultUserAgent),
      lines,
    });
    cancelServerEdit(server.id);
  } catch (error) {
    draft.error = error instanceof Error ? error.message : String(error);
  } finally {
    savingServerId.value = null;
  }
}

function togglePanel(id: PanelId) {
  openPanel.value = openPanel.value === id ? null : id;
}

async function exportConfig() {
  backupBusy.value = "export";
  backupStatus.value = "";
  try {
    const result = await api.exportConfig();
    backupStatus.value = result ? `已导出：${result.filePath}` : "已取消";
  } catch (error) {
    backupStatus.value = error instanceof Error ? error.message : String(error);
  } finally {
    backupBusy.value = null;
  }
}

async function importConfig() {
  backupBusy.value = "import";
  backupStatus.value = "";
  try {
    const result = await api.importConfig("merge");
    if (!result) {
      backupStatus.value = "已取消";
      return;
    }
    await Promise.all([
      settings.refresh().catch(() => {}),
      serverStore.refresh().catch(() => {}),
      auth.refresh().catch(() => {}),
    ]);
    backupStatus.value = `已导入：${result.servers} 个服务，${result.accounts} 个账号`;
  } catch (error) {
    backupStatus.value = error instanceof Error ? error.message : String(error);
  } finally {
    backupBusy.value = null;
  }
}

const themeLabel = computed(() => {
  const t = settings.settings.theme;
  if (t === "light") return "浅色";
  if (t === "auto") return "Auto";
  return "深色";
});

const heroStyleLabel = computed(() =>
  settings.settings.homeHeroStyle === "cinema" ? "巨幕" : "标准",
);

const runtimeLabel = computed(() =>
  typeof window !== "undefined" && window.hillsLite
    ? "Electron"
    : platformLabel.value === "web"
      ? "Web Preview"
      : "Tauri",
);

const activeAccountLabel = computed(() => auth.activeAccount?.username ?? "未登录");
const isWindowsPlatform = computed(() => platformLabel.value.toLowerCase().includes("windows"));

const syncSummary = computed(() => {
  if (!settings.settings.traktSyncEnabled) return "未启用";
  return settings.settings.traktUsername?.trim() || "待授权";
});

const externalPlayerSummary = computed(() => {
  const path = settings.settings.externalPlayerPath?.trim();
  if (!path) return "系统默认";
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
});

const danmakuSummary = computed(() => {
  const avoidance = settings.settings.danmakuAvoidSubtitles ? "避让" : "覆盖";
  return `${settings.settings.danmakuFontSize}px · ${settings.settings.danmakuSpeed.toFixed(1)}x · ${avoidance}`;
});
</script>

<template>
  <section class="settings">
    <header class="settings__head">
      <h1>设置</h1>
    </header>

    <div class="settings__list">
      <h2 class="group-title">通用</h2>

      <button class="row" @click="togglePanel('about')">
        <span>关于 Hills Lite</span>
        <Icon icon="lucide:chevron-right" width="16" class="chev" />
      </button>
      <div v-if="openPanel === 'about'" class="panel glass about-panel">
        <div class="about-hero">
          <div class="about-hero__icon">
            <Icon icon="lucide:info" width="22" />
          </div>
          <div>
            <strong>Hills Lite</strong>
            <span>v{{ appVersion }}</span>
          </div>
        </div>
        <div class="about-grid">
          <div class="about-cell">
            <span>运行壳</span>
            <strong>{{ runtimeLabel }}</strong>
          </div>
          <div class="about-cell">
            <span>平台</span>
            <strong>{{ platformLabel }}</strong>
          </div>
          <div class="about-cell">
            <span>服务器</span>
            <strong>{{ serverStore.servers.length }}</strong>
          </div>
          <div class="about-cell">
            <span>账号</span>
            <strong>{{ activeAccountLabel }}</strong>
          </div>
          <div class="about-cell">
            <span>播放核心</span>
            <strong>{{ settings.settings.mpvBackend }}</strong>
          </div>
          <div class="about-cell">
            <span>打包产物</span>
            <strong>win-unpacked</strong>
          </div>
        </div>
        <div class="panel__actions">
          <button class="action-btn" type="button" @click="togglePanel('backup')">
            <Icon icon="lucide:archive-restore" width="15" />
            <span>备份配置</span>
          </button>
          <button class="action-btn" type="button" @click="togglePanel('servers')">
            <Icon icon="lucide:server" width="15" />
            <span>服务器</span>
          </button>
        </div>
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
              <button
                v-if="editingServerId !== s.id"
                class="link"
                @click="beginServerEdit(s)"
              >
                编辑
              </button>
              <button v-else class="link" @click="cancelServerEdit(s.id)">取消</button>
              <button class="link" @click="toggleHidden(s.id, hiddenSet.has(s.id))">
                {{ hiddenSet.has(s.id) ? "显示" : "隐藏" }}
              </button>
              <button class="link danger" @click="serverStore.removeServer(s.id)">删除</button>
            </div>
          </div>
          <ul v-if="editingServerId !== s.id" class="lines">
            <li v-for="l in s.lines" :key="l.id">
              <div>
                <div>{{ l.name }}</div>
                <div class="dim">{{ l.baseUrl }}</div>
                <div class="line-meta">
                  <span v-if="l.userAgent" class="line-pill">UA</span>
                  <span v-if="l.headers?.length" class="line-pill">Headers {{ l.headers.length }}</span>
                  <span v-if="l.enabled === false" class="line-pill muted">禁用</span>
                </div>
              </div>
              <LineStatusDot :status="l.lastStatus" :latency-ms="l.lastLatencyMs" />
            </li>
          </ul>
          <div v-else-if="serverDrafts[s.id]" class="server-edit">
            <label class="field">
              <span>默认 User-Agent</span>
              <input
                v-model="serverDrafts[s.id].defaultUserAgent"
                class="plain-input"
                placeholder="留空使用应用默认"
              />
            </label>

            <div
              v-for="(line, index) in serverDrafts[s.id].lines"
              :key="line.id ?? index"
              class="server-edit__line"
            >
              <div class="server-edit__line-head">
                <strong>线路 {{ index + 1 }}</strong>
                <button
                  class="link danger"
                  :disabled="serverDrafts[s.id].lines.length === 1"
                  @click="removeServerDraftLine(s.id, index)"
                >
                  移除
                </button>
              </div>
              <div class="server-edit__grid">
                <label class="field">
                  <span>名称</span>
                  <input v-model="line.name" class="plain-input" />
                </label>
                <label class="field">
                  <span>URL</span>
                  <input v-model="line.baseUrl" class="plain-input" />
                </label>
              </div>
              <label class="field field--inline">
                <span>启用线路</span>
                <input v-model="line.enabled" class="switch" type="checkbox" />
              </label>
              <label class="field">
                <span>User-Agent</span>
                <input
                  v-model="line.userAgent"
                  class="plain-input"
                  placeholder="留空使用默认 UA"
                />
              </label>
              <label class="field">
                <span>Headers</span>
                <textarea
                  v-model="line.headersText"
                  class="plain-textarea"
                  placeholder="X-Header: value"
                ></textarea>
              </label>
            </div>

            <p v-if="serverDrafts[s.id].error" class="status-line error">
              {{ serverDrafts[s.id].error }}
            </p>
            <div class="panel__actions">
              <button class="action-btn" type="button" @click="addServerDraftLine(s.id)">
                <Icon icon="lucide:plus" width="15" />
                <span>新增线路</span>
              </button>
              <button
                class="action-btn"
                type="button"
                :disabled="savingServerId === s.id"
                @click="saveServerDraft(s)"
              >
                <Icon icon="lucide:save" width="15" />
                <span>{{ savingServerId === s.id ? "保存中" : "保存" }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <button class="row" @click="togglePanel('library')">
        <span>媒体库</span>
        <span class="value">{{ heroStyleLabel }}</span>
      </button>
      <div v-if="openPanel === 'library'" class="panel glass">
        <label class="field">
          <span>首页轮播图风格</span>
          <div class="seg">
            <button
              type="button"
              :class="{ active: settings.settings.homeHeroStyle === 'classic' }"
              @click="save('homeHeroStyle', 'classic')"
            >
              标准
            </button>
            <button
              type="button"
              :class="{ active: settings.settings.homeHeroStyle === 'cinema' }"
              @click="save('homeHeroStyle', 'cinema')"
            >
              巨幕
            </button>
          </div>
        </label>
        <label class="field field--inline">
          <span>JAV 番号过滤</span>
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.hideJavCodes"
            @change="(e: any) => save('hideJavCodes', e.target.checked)"
          />
        </label>
      </div>

      <button
        class="row"
        :disabled="!backupAvailable"
        @click="backupAvailable && togglePanel('backup')"
      >
        <span>备份与还原</span>
        <Icon icon="lucide:chevron-right" width="16" class="chev dim" />
      </button>
      <div v-if="openPanel === 'backup'" class="panel glass">
        <div class="panel__actions">
          <button class="action-btn" :disabled="backupBusy !== null" @click="exportConfig">
            <Icon icon="lucide:download" width="15" />
            <span>{{ backupBusy === "export" ? "导出中" : "导出配置" }}</span>
          </button>
          <button class="action-btn" :disabled="backupBusy !== null" @click="importConfig">
            <Icon icon="lucide:upload" width="15" />
            <span>{{ backupBusy === "import" ? "导入中" : "导入配置" }}</span>
          </button>
        </div>
        <div v-if="backupStatus" class="status-line">{{ backupStatus }}</div>
      </div>
      <button class="row" @click="togglePanel('sync')">
        <span>同步</span>
        <span class="value">{{ syncSummary }}</span>
      </button>
      <div v-if="openPanel === 'sync'" class="panel glass">
        <label class="field field--inline">
          <span>Trakt 同步</span>
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.traktSyncEnabled"
            @change="(e: any) => save('traktSyncEnabled', e.target.checked)"
          />
        </label>
        <label class="field">
          <span>Trakt 用户名</span>
          <GlassInput
            v-model="traktUsernameDraft"
            placeholder="Trakt username"
            @change="() => saveTraktUsername()"
            @blur="() => saveTraktUsername()"
          />
        </label>
        <label class="field field--inline">
          <span>观看记录</span>
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.traktSyncWatched"
            @change="(e: any) => save('traktSyncWatched', e.target.checked)"
          />
        </label>
        <label class="field field--inline">
          <span>评分</span>
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.traktSyncRatings"
            @change="(e: any) => save('traktSyncRatings', e.target.checked)"
          />
        </label>
        <label class="field field--inline">
          <span>收藏</span>
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.traktSyncFavorites"
            @change="(e: any) => save('traktSyncFavorites', e.target.checked)"
          />
        </label>
      </div>
      <div class="row row--static">
        <span>关闭时最小化到托盘</span>
        <input
          class="switch"
          type="checkbox"
          :checked="settings.settings.closeToTray"
          @change="(e: any) => save('closeToTray', e.target.checked)"
        />
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
        <label class="field field--inline">
          <span>右上角网速</span>
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.showNetworkSpeed"
            @change="(e: any) => save('showNetworkSpeed', e.target.checked)"
          />
        </label>
        <label class="field">
          <span>统计浮层</span>
          <div class="seg">
            <button
              type="button"
              :class="{ active: settings.settings.statsOverlayMode === 'winui' }"
              @click="save('statsOverlayMode', 'winui')"
            >
              WinUI
            </button>
            <button
              type="button"
              :class="{ active: settings.settings.statsOverlayMode === 'mpv-osd' }"
              @click="save('statsOverlayMode', 'mpv-osd')"
            >
              mpv OSD
            </button>
          </div>
        </label>
        <label class="field field--inline">
          <span>全屏遮黑其他副屏</span>
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.blackoutOtherDisplays"
            @change="(e: any) => save('blackoutOtherDisplays', e.target.checked)"
          />
        </label>
        <label class="field field--inline">
          <span>切换轨道时保留缓存</span>
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.preserveTrackSwitchCache"
            @change="(e: any) => save('preserveTrackSwitchCache', e.target.checked)"
          />
        </label>
        <label class="field field--inline">
          <span>自动跳过片头/片尾</span>
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.skipIntroOutroEnabled"
            @change="(e: any) => save('skipIntroOutroEnabled', e.target.checked)"
          />
        </label>
        <label class="field field--inline">
          <span>截图包含字幕</span>
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.screenshotIncludeSubtitles"
            @change="(e: any) => save('screenshotIncludeSubtitles', e.target.checked)"
          />
        </label>
        <label class="field">
          <span>片头跳过秒数</span>
          <GlassInput
            type="number"
            :model-value="String(settings.settings.skipIntroSeconds)"
            @update:modelValue="
              (v) =>
                save(
                  'skipIntroSeconds',
                  normalizeSkipSeconds(v, settings.settings.skipIntroSeconds),
                )
            "
          />
        </label>
        <label class="field">
          <span>片尾跳过秒数</span>
          <GlassInput
            type="number"
            :model-value="String(settings.settings.skipOutroSeconds)"
            @update:modelValue="
              (v) =>
                save(
                  'skipOutroSeconds',
                  normalizeSkipSeconds(v, settings.settings.skipOutroSeconds),
                )
            "
          />
        </label>
        <label class="field field--inline">
          <span>附加授权查询参数</span>
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.appendAuthQuery"
            @change="(e: any) => save('appendAuthQuery', e.target.checked)"
          />
        </label>
        <div class="panel__actions">
          <button
            type="button"
            class="action-btn"
            :disabled="!isWindowsPlatform"
            @click="openWindowsHdrSettings"
          >
            <Icon icon="lucide:sun-medium" width="15" />
            <span>Windows HDR</span>
          </button>
        </div>
      </div>

      <button class="row" @click="togglePanel('externalPlayer')">
        <span>外部播放器</span>
        <span class="value">{{ externalPlayerSummary }}</span>
      </button>
      <div v-if="openPanel === 'externalPlayer'" class="panel glass">
        <label class="field">
          <span>播放器路径</span>
          <GlassInput
            v-model="externalPlayerPathDraft"
            placeholder="留空使用系统默认"
            @change="() => saveExternalPlayerPath()"
            @blur="() => saveExternalPlayerPath()"
          />
        </label>
        <div class="panel__actions">
          <button type="button" class="action-btn" @click="pickExternalPlayer">
            <Icon icon="lucide:folder-open" width="15" />
            <span>选择</span>
          </button>
          <button
            type="button"
            class="action-btn"
            :disabled="!settings.settings.externalPlayerPath"
            @click="externalPlayerPathDraft = ''; saveExternalPlayerPath('')"
          >
            <Icon icon="lucide:x" width="15" />
            <span>清除</span>
          </button>
        </div>
        <label class="field">
          <span>启动参数</span>
          <GlassInput
            v-model="externalPlayerArgsDraft"
            placeholder="{headers} {userAgent} {url}"
            @change="() => saveExternalPlayerArgs()"
            @blur="() => saveExternalPlayerArgs()"
          />
        </label>
      </div>
      <button class="row" @click="togglePanel('danmaku')">
        <span>弹幕</span>
        <span class="value">{{ danmakuSummary }}</span>
      </button>
      <div v-if="openPanel === 'danmaku'" class="panel glass">
        <label class="field">
          <span>透明度</span>
          <div class="range-row">
            <input
              type="range"
              min="0.2"
              max="1"
              step="0.05"
              :value="settings.settings.danmakuOpacity"
              @input="(e: any) => save('danmakuOpacity', Number(e.target.value))"
            />
            <strong>{{ Math.round(settings.settings.danmakuOpacity * 100) }}%</strong>
          </div>
        </label>
        <label class="field">
          <span>速度</span>
          <div class="range-row">
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.1"
              :value="settings.settings.danmakuSpeed"
              @input="(e: any) => save('danmakuSpeed', Number(e.target.value))"
            />
            <strong>{{ settings.settings.danmakuSpeed.toFixed(1) }}x</strong>
          </div>
        </label>
        <label class="field">
          <span>字号</span>
          <div class="range-row">
            <input
              type="range"
              min="12"
              max="48"
              step="1"
              :value="settings.settings.danmakuFontSize"
              @input="(e: any) => save('danmakuFontSize', Number(e.target.value))"
            />
            <strong>{{ settings.settings.danmakuFontSize }}px</strong>
          </div>
        </label>
        <label class="field field--inline">
          <span>避让字幕</span>
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.danmakuAvoidSubtitles"
            @change="(e: any) => save('danmakuAvoidSubtitles', e.target.checked)"
          />
        </label>
        <label class="field">
          <span>底部避让区域</span>
          <div class="range-row">
            <input
              type="range"
              min="8"
              max="36"
              step="1"
              :disabled="!settings.settings.danmakuAvoidSubtitles"
              :value="settings.settings.danmakuBottomReservePct"
              @input="(e: any) => save('danmakuBottomReservePct', Number(e.target.value))"
            />
            <strong>{{ settings.settings.danmakuBottomReservePct }}%</strong>
          </div>
        </label>
      </div>

      <button class="row" @click="togglePanel('shortcuts')">
        <span>快捷键</span>
        <Icon icon="lucide:chevron-right" width="16" class="chev" />
      </button>
      <div v-if="openPanel === 'shortcuts'" class="panel">
        <ShortcutsPanel />
      </div>
    </div>

    <AddServerDialog v-if="showAdd" @created="onServerCreated" @close="showAdd = false" />
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
.row:hover:not(.row--static):not(:disabled) {
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
.panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.about-panel {
  gap: 14px;
}
.about-hero {
  display: flex;
  align-items: center;
  gap: 12px;
}
.about-hero__icon {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--accent);
  background: var(--accent-soft);
}
.about-hero strong,
.about-hero span {
  display: block;
}
.about-hero strong {
  color: var(--fg-primary);
  font-size: 16px;
}
.about-hero span {
  margin-top: 2px;
  color: var(--fg-tertiary);
  font-size: 12px;
}
.about-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
  border-top: 1px solid var(--separator);
}
.about-cell {
  min-width: 0;
  padding: 10px 0;
  border-bottom: 1px solid var(--separator);
}
.about-cell span,
.about-cell strong {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.about-cell span {
  color: var(--fg-tertiary);
  font-size: 11px;
}
.about-cell strong {
  margin-top: 4px;
  color: var(--fg-primary);
  font-size: 13px;
  font-weight: 700;
}
.action-btn {
  appearance: none;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--fg-primary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding: 0 12px;
  font-size: 13px;
}
.action-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.action-btn:disabled,
.row:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.status-line {
  color: var(--fg-secondary);
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
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
  flex-wrap: wrap;
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
.line-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 5px;
}
.line-pill {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  color: var(--fg-secondary);
  font-size: 10px;
  padding: 0 7px;
}
.line-pill.muted {
  color: var(--danger);
  border-color: rgba(255, 69, 58, 0.35);
}
.server-edit {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top: 1px solid var(--separator);
  padding-top: 12px;
}
.server-edit__line {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid var(--separator);
  padding-top: 12px;
}
.server-edit__line-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.server-edit__line-head strong {
  font-size: 12px;
  color: var(--fg-secondary);
}
.server-edit__grid {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.6fr);
  gap: 10px;
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
.field--inline {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.field > span {
  font-size: 12px;
  color: var(--fg-secondary);
}
.plain-input,
.plain-textarea {
  width: 100%;
  min-width: 0;
  outline: none;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--fg-primary);
  font: inherit;
  padding: 10px 12px;
}
.plain-input:focus,
.plain-textarea:focus {
  border-color: rgba(10, 132, 255, 0.6);
  box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.16);
}
.plain-input::placeholder,
.plain-textarea::placeholder {
  color: var(--fg-tertiary);
}
.plain-textarea {
  min-height: 82px;
  resize: vertical;
}
.status-line.error {
  color: var(--danger);
}
.range-row {
  display: grid;
  grid-template-columns: 1fr 52px;
  align-items: center;
  gap: 12px;
}
.range-row strong {
  color: var(--fg-primary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
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
.switch {
  width: 42px;
  height: 24px;
  appearance: none;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  cursor: pointer;
  position: relative;
  transition: background 180ms var(--easing-glide), border-color 180ms var(--easing-glide);
}
.switch::before {
  content: "";
  position: absolute;
  width: 18px;
  height: 18px;
  top: 2px;
  left: 2px;
  border-radius: 999px;
  background: var(--fg-secondary);
  transition: transform 180ms var(--easing-glide), background 180ms var(--easing-glide);
}
.switch:checked {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.switch:checked::before {
  transform: translateX(18px);
  background: var(--accent);
}
</style>
