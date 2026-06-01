<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import { useRoute, useRouter } from "vue-router";

import GlassInput from "@/components/common/GlassInput.vue";
import LineStatusDot from "@/components/common/LineStatusDot.vue";
import ShortcutsPanel from "@/components/settings/ShortcutsPanel.vue";
import AddServerDialog from "@/components/login/AddServerDialog.vue";
import { api } from "@/api";
import { openFileDialog, platformType } from "@/platform";
import { useAuthStore } from "@/stores/auth";
import { useLibraryStore } from "@/stores/library";
import { useLocalFilesStore } from "@/stores/localFiles";
import { useDownloadsStore } from "@/stores/downloads";
import { useNotificationsStore } from "@/stores/notifications";
import { useSettingsStore } from "@/stores/settings";
import { useServerStore } from "@/stores/server";
import type { Line, Server } from "@/types/models";
import { headersToText, normalizeNullableText, parseHeaderText } from "@/utils/headerText";
import { normalizeServerBaseUrl } from "@/utils/serverUrl";

type PanelId =
  | null
  | "about"
  | "theme"
  | "library"
  | "fileServices"
  | "backup"
  | "network"
  | "player"
  | "downloads"
  | "enhancement"
  | "externalPlayer"
  | "danmaku"
  | "shortcuts"
  | "servers";

const auth = useAuthStore();
const lib = useLibraryStore();
const settings = useSettingsStore();
const serverStore = useServerStore();
const localFiles = useLocalFilesStore();
const downloads = useDownloadsStore();
const notifications = useNotificationsStore();
const route = useRoute();
const router = useRouter();

const probing = ref<string | null>(null);
const showAdd = ref(false);
const openPanel = ref<PanelId>(null);
const editingServerId = ref<string | null>(null);
const savingServerId = ref<string | null>(null);
const settingActiveLineId = ref<string | null>(null);
const externalPlayerPathDraft = ref("");
const externalPlayerArgsDraft = ref("");
const downloadDirectoryDraft = ref("");
const downloadDirectoryBusy = ref(false);
const downloadDirectoryStatus = ref("");
const backupBusy = ref<"export" | "import" | null>(null);
const backupStatus = ref("");
const appVersion = "0.1.0";
const platformLabel = ref("...");
const isElectronRuntime = typeof window !== "undefined" && Boolean(window.hillsLite);
const isTauriRuntime =
  typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
const backupAvailable = computed(
  () => isElectronRuntime || isTauriRuntime || platformLabel.value === "web",
);
const activeDownloads = computed(
  () => downloads.tasks.filter((t) => t.status === "running" || t.status === "paused").length,
);
const activeDownloadsLabel = computed(() =>
  activeDownloads.value > 99 ? "99+" : `${activeDownloads.value}`,
);
const unreadNotificationsLabel = computed(() =>
  notifications.unread > 99 ? "99+" : `${notifications.unread}`,
);

type ServerLineDraft = {
  id?: string;
  name: string;
  baseUrl: string;
  port: string;
  userAgent: string;
  headersText: string;
  enabled: boolean;
};

type ServerDraft = {
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
    case "downloads":
    case "externalPlayer":
    case "danmaku":
    case "shortcuts":
    case "backup":
      return category;
    case "download":
      return "downloads";
    case "file-services":
    case "fileServices":
    case "files":
    case "connectors":
    case "sources":
      return "fileServices";
    case "enhancement":
      return "enhancement";
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
  () => settings.settings.downloadDirectory,
  (path) => {
    downloadDirectoryDraft.value = path ?? "";
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

async function setActiveLine(serverId: string, lineId: string) {
  settingActiveLineId.value = lineId;
  try {
    await serverStore.setActiveLine(serverId, lineId);
  } finally {
    settingActiveLineId.value = null;
  }
}

function lineUrlPreview(baseUrl: string): string {
  const raw = baseUrl.trim();
  if (!raw) return "未填写 URL";

  try {
    const url = new URL(raw);
    const host = maskHostname(url.hostname);
    const port = url.port ? `:${url.port}` : "";
    const pathHint = url.pathname && url.pathname !== "/" ? "/..." : "";
    return `${url.protocol}//${host}${port}${pathHint}`;
  } catch {
    if (raw.length <= 12) return raw;
    return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
  }
}

function maskHostname(hostname: string): string {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "::1" ||
    lower === "[::1]" ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(lower)
  ) {
    return hostname;
  }

  const labels = hostname.split(".");
  return labels
    .map((label, index) => (index === labels.length - 1 ? label : maskHostLabel(label)))
    .join(".");
}

function maskHostLabel(label: string): string {
  if (label.length <= 1) return label;
  if (label.length <= 3) return `${label[0]}*${label.slice(-1)}`;
  return `${label.slice(0, 2)}***${label.slice(-1)}`;
}

function explicitPortFromUrl(value: string): string {
  const match = value
    .trim()
    .match(/^[a-z][a-z0-9+.-]*:\/\/(?:\[[^\]]+\]|[^/:?#]+):(\d{1,5})(?=[/?#]|$)/i);
  return match?.[1] ?? "";
}

function splitServerBaseUrl(baseUrl: string): { address: string; port: string } {
  const raw = baseUrl.trim();
  if (!raw) return { address: "", port: "" };

  try {
    const explicitPort = explicitPortFromUrl(raw);
    const url = new URL(raw);
    const port = explicitPort || url.port;
    url.port = "";
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    const text = url.toString();
    const address =
      url.pathname === "/" && text.endsWith("/") ? text.slice(0, -1) : text.replace(/\/+$/, "");
    return { address, port };
  } catch {
    return { address: raw, port: "" };
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

async function saveDownloadDirectory(value = downloadDirectoryDraft.value) {
  const normalized = value.trim() || null;
  const current = settings.settings.downloadDirectory ?? null;

  downloadDirectoryDraft.value = normalized ?? "";
  if (normalized === current) return;

  await save("downloadDirectory", normalized as any);
}

async function pickDownloadDirectory() {
  const selected = await openFileDialog({
    multiple: false,
    directory: true,
    title: "选择下载目录",
  });
  if (typeof selected === "string" && selected.length > 0) {
    downloadDirectoryDraft.value = selected;
    await saveDownloadDirectory(selected);
  }
}

async function openDownloadDirectory() {
  if (!canPickDownloadDirectory.value || downloadDirectoryBusy.value) return;
  downloadDirectoryBusy.value = true;
  downloadDirectoryStatus.value = "";
  try {
    const path = await api.openDownloadDirectory();
    downloadDirectoryStatus.value = path ? `已打开：${path}` : "已打开";
  } catch (error) {
    downloadDirectoryStatus.value = error instanceof Error ? error.message : String(error);
  } finally {
    downloadDirectoryBusy.value = false;
  }
}

function openLocalPath(filePath: string) {
  localFiles.remember(filePath);
  router
    .push({ name: "player", params: { id: "local-file" }, query: { file: filePath } })
    .catch(() => {});
}

async function openLocalFile() {
  if (!canOpenFileDialogs.value) return;
  const selected = await openFileDialog({
    multiple: false,
    directory: false,
    title: "打开本地视频",
    filters: [
      {
        name: "Video",
        extensions: [
          "mp4",
          "mkv",
          "mov",
          "avi",
          "wmv",
          "flv",
          "webm",
          "m4v",
          "ts",
          "m2ts",
        ],
      },
      { name: "All", extensions: ["*"] },
    ],
  }).catch(() => null);
  if (typeof selected !== "string" || selected.length === 0) return;
  openLocalPath(selected);
}

async function openLocalFolder() {
  if (!canOpenFileDialogs.value) {
    router.push({ name: "local-folder" }).catch(() => {});
    return;
  }

  const selected = await openFileDialog({
    multiple: false,
    directory: true,
    title: "打开本地文件夹",
  }).catch(() => null);

  if (typeof selected === "string" && selected.length > 0) {
    localFiles.rememberFolder(selected);
    router.push({ name: "local-folder", query: { folder: selected } }).catch(() => {});
  } else {
    router.push({ name: "local-folder" }).catch(() => {});
  }
}

function openWebDav() {
  router.push({ name: "webdav" }).catch(() => {});
}

function openAlist() {
  router.push({ name: "alist" }).catch(() => {});
}

function openDownloadsCenter() {
  router.push({ name: "downloads" }).catch(() => {});
}

function openRemoteControl() {
  router.push({ name: "remote" }).catch(() => {});
}

function openNotificationsCenter() {
  notifications.toggleCenter();
}

async function openWindowsHdrSettings() {
  await api.openExternal("ms-settings:display").catch(() => {});
}

const hiddenSet = computed(() => new Set(settings.settings.hiddenServerIds ?? []));

async function toggleHidden(serverId: string, currentlyHidden: boolean) {
  await settings.toggleHidden(serverId, !currentlyHidden);
}

function createServerLineDraft(line: Partial<Line> = {}, index = 0): ServerLineDraft {
  const { address, port } = splitServerBaseUrl(line.baseUrl ?? "");
  return {
    id: line.id,
    name: line.name ?? `线路 ${index + 1}`,
    baseUrl: address,
    port,
    userAgent: line.userAgent ?? "",
    headersText: headersToText(line.headers),
    enabled: line.enabled ?? true,
  };
}

function beginServerEdit(server: Server) {
  serverDrafts.value = {
    ...serverDrafts.value,
    [server.id]: {
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
      const baseUrl = normalizeServerBaseUrl(line.baseUrl, line.port);
      if (!baseUrl) throw new Error(`线路 ${index + 1} 需要填写地址`);
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
      defaultUserAgent: null,
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

async function importConfig(mode: "merge" | "replace" = "merge") {
  if (mode === "replace") {
    const confirmed = window.confirm("替换导入会覆盖当前设置、服务器、账号和快捷键，继续吗？");
    if (!confirmed) return;
  }
  backupBusy.value = "import";
  backupStatus.value = "";
  try {
    const result = await api.importConfig(mode);
    if (!result) {
      backupStatus.value = "已取消";
      return;
    }
    await Promise.all([
      settings.refresh().catch(() => {}),
      serverStore.refresh().catch(() => {}),
      auth.refresh().catch(() => {}),
    ]);
    const modeLabel = result.mode === "replace" ? "替换" : "合并";
    backupStatus.value = `已${modeLabel}导入：${result.servers} 个服务，${result.accounts} 个账号`;
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

type CapabilityStatus = "available" | "disabled";
type EnhancementStatus = CapabilityStatus;

type EnhancementCapability = {
  key: string;
  label: string;
  detail: string;
  icon: string;
  status: EnhancementStatus;
  action?: "windows-hdr";
};

type FileServiceCapability = {
  key: string;
  label: string;
  detail: string;
  icon: string;
  status: CapabilityStatus;
};

const capabilityStatusLabel: Record<CapabilityStatus, string> = {
  available: "可用",
  disabled: "禁用",
};

const enhancementSummary = computed(() =>
  isWindowsPlatform.value ? "HDR 系统入口" : "等待硬件路径",
);
const fileServicesSummary = computed(() => "本地 / WebDAV / Alist 可用");

const enhancementCapabilities = computed<EnhancementCapability[]>(() => {
  return [
    {
      key: "windows-hdr",
      label: "Windows HDR",
      detail: isWindowsPlatform.value ? "系统显示设置" : "仅 Windows",
      icon: "lucide:sun-medium",
      status: isWindowsPlatform.value ? "available" : "disabled",
      action: "windows-hdr",
    },
  ];
});

const fileServiceCapabilities = computed<FileServiceCapability[]>(() => [
  {
    key: "local-file",
    label: "本地单文件",
    detail: "设置页可选择单个视频并交给内嵌 mpv 播放",
    icon: "lucide:file-video",
    status: "available",
  },
  {
    key: "recent-local-files",
    label: "最近本地文件",
    detail: "当前客户端本地保存最近 8 条记录",
    icon: "lucide:history",
    status: "available",
  },
  {
    key: "favorite-local-files",
    label: "收藏本地文件",
    detail: "当前客户端本地保存常用视频入口",
    icon: "lucide:star",
    status: "available",
  },
  {
    key: "sidecar-posters",
    label: "同名封面",
    detail: "本地、WebDAV 与 Alist/OpenList 识别同名图片与 cover/poster/folder 图片",
    icon: "lucide:image",
    status: "available",
  },
  {
    key: "sidecar-nfo",
    label: "NFO 元数据",
    detail: "本地文件夹读取同名 .nfo 的标题、年份和简介",
    icon: "lucide:file-text",
    status: "available",
  },
  {
    key: "local-file-locate",
    label: "本地文件定位",
    detail: "可从文件夹页打开当前目录或视频所在目录",
    icon: "lucide:folder-search",
    status: "available",
  },
  {
    key: "sidecar-subtitles",
    label: "同名字幕",
    detail: "本地播放会自动关联同目录同名字幕，文件夹列表会提示数量",
    icon: "lucide:subtitles",
    status: "available",
  },
  {
    key: "sidecar-danmaku",
    label: "同名 XML 弹幕",
    detail: "本地播放会尝试导入同名 XML 弹幕，文件夹列表会提示",
    icon: "lucide:message-square-text",
    status: "available",
  },
  {
    key: "folder-library",
    label: "文件夹媒体库",
    detail: "可打开本地文件夹并列出一层或子目录视频文件",
    icon: "lucide:folder-open",
    status: "available",
  },
  {
    key: "manual-folder-path",
    label: "手动路径",
    detail: "本地文件夹页可粘贴盘符路径或已授权 UNC 共享路径",
    icon: "lucide:folder-input",
    status: "available",
  },
  {
    key: "local-folder-grouping",
    label: "文件夹分组",
    detail: "递归浏览时可按所在子目录聚合视频列表",
    icon: "lucide:folder-tree",
    status: "available",
  },
  {
    key: "favorite-local-folders",
    label: "收藏本地文件夹",
    detail: "当前客户端本地保存常用文件夹入口",
    icon: "lucide:star",
    status: "available",
  },
  {
    key: "webdav",
    label: "WebDAV",
    detail: "可保存/收藏连接、PROPFIND 浏览目录，识别同名封面/字幕/XML 弹幕并把视频直链交给内嵌 mpv 播放",
    icon: "lucide:cloud",
    status: "available",
  },
  {
    key: "alist-openlist",
    label: "Alist / OpenList",
    detail: "可配置/收藏站点，恢复上次目录，刷新签名直链并携带同名封面/字幕/XML 弹幕播放",
    icon: "lucide:list-tree",
    status: "available",
  },
]);

const externalPlayerSummary = computed(() => {
  const path = settings.settings.externalPlayerPath?.trim();
  if (!path) return "系统默认";
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
});

const downloadDirectorySummary = computed(() => {
  const path = settings.settings.downloadDirectory?.trim();
  if (!path) return "默认目录";
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
});

const canOpenFileDialogs = computed(() => isElectronRuntime || isTauriRuntime);
const canPickDownloadDirectory = computed(() => isElectronRuntime || isTauriRuntime);

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

      <h2 class="group-title">工具</h2>

      <button class="row" @click="openDownloadsCenter">
        <span>下载中心</span>
        <span v-if="activeDownloads > 0" class="value">{{ activeDownloadsLabel }} 个任务</span>
        <Icon v-else icon="lucide:chevron-right" width="16" class="chev" />
      </button>

      <button class="row" @click="openNotificationsCenter">
        <span>通知中心</span>
        <span v-if="notifications.unread > 0" class="value">{{ unreadNotificationsLabel }} 未读</span>
        <Icon v-else icon="lucide:chevron-right" width="16" class="chev" />
      </button>

      <button class="row" @click="openRemoteControl">
        <span>遥控器</span>
        <Icon icon="lucide:chevron-right" width="16" class="chev" />
      </button>

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
        <div v-for="s in serverStore.servers" :key="s.id" class="server">
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
                <div class="dim" title="编辑服务器可查看完整 URL">
                  {{ lineUrlPreview(l.baseUrl) }}
                </div>
                <div class="line-meta">
                  <span v-if="l.id === s.activeLineId" class="line-pill active">当前</span>
                  <span v-if="l.userAgent" class="line-pill">UA</span>
                  <span v-if="l.headers?.length" class="line-pill">Headers {{ l.headers.length }}</span>
                  <span v-if="l.enabled === false" class="line-pill muted">禁用</span>
                  <button
                    v-if="l.enabled !== false && l.id !== s.activeLineId"
                    type="button"
                    class="line-pill line-pill--button"
                    :disabled="settingActiveLineId === l.id"
                    @click="setActiveLine(s.id, l.id)"
                  >
                    {{ settingActiveLineId === l.id ? "切换中" : "设为当前" }}
                  </button>
                </div>
              </div>
              <LineStatusDot :status="l.lastStatus" :latency-ms="l.lastLatencyMs" />
            </li>
          </ul>
          <div v-else-if="serverDrafts[s.id]" class="server-edit">
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
                  <span>地址</span>
                  <input
                    v-model="line.baseUrl"
                    class="plain-input"
                    placeholder="https://example.com 或 192.168.1.2"
                  />
                </label>
                <label class="field">
                  <span>端口</span>
                  <input v-model="line.port" class="plain-input" placeholder="443 / 8096 / 任意" />
                </label>
              </div>
              <label class="field field--inline server-edit__toggle">
                <span>启用线路</span>
                <input v-model="line.enabled" class="switch" type="checkbox" />
              </label>
              <details class="server-edit__advanced">
                <summary>
                  <Icon icon="lucide:sliders-horizontal" width="14" />
                  高级
                </summary>
                <label class="field">
                  <span>线路名（可选）</span>
                  <input
                    v-model="line.name"
                    class="plain-input"
                    placeholder="留空自动使用线路序号"
                  />
                </label>
                <label class="field">
                  <span>User-Agent</span>
                  <input
                    v-model="line.userAgent"
                    class="plain-input"
                    placeholder="留空使用应用默认"
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
              </details>
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

      <button class="row" @click="togglePanel('fileServices')">
        <span>文件服务 / 连接器</span>
        <span class="value">{{ fileServicesSummary }}</span>
      </button>
      <div v-if="openPanel === 'fileServices'" class="panel glass">
        <div class="panel__actions">
          <button
            class="action-btn"
            :disabled="!canOpenFileDialogs"
            @click="openLocalFile"
          >
            <Icon icon="lucide:file-video" width="15" />
            <span>打开本地文件</span>
          </button>
          <button class="action-btn" @click="openLocalFolder">
            <Icon icon="lucide:folder-open" width="15" />
            <span>本地文件夹</span>
          </button>
          <button class="action-btn" @click="openWebDav">
            <Icon icon="lucide:cloud" width="15" />
            <span>WebDAV</span>
          </button>
          <button class="action-btn" @click="openAlist">
            <Icon icon="lucide:list-tree" width="15" />
            <span>Alist / OpenList</span>
          </button>
        </div>
        <ul class="cap-list">
          <li v-for="cap in fileServiceCapabilities" :key="cap.key" class="cap-row">
            <div class="cap-row__icon">
              <Icon :icon="cap.icon" width="16" />
            </div>
            <div class="cap-row__main">
              <strong>{{ cap.label }}</strong>
              <span>{{ cap.detail }}</span>
            </div>
            <span class="cap-status" :class="`cap-status--${cap.status}`">
              {{ capabilityStatusLabel[cap.status] }}
            </span>
          </li>
        </ul>
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
          <button class="action-btn" :disabled="backupBusy !== null" @click="importConfig('merge')">
            <Icon icon="lucide:upload" width="15" />
            <span>{{ backupBusy === "import" ? "导入中" : "合并导入" }}</span>
          </button>
          <button class="action-btn" :disabled="backupBusy !== null" @click="importConfig('replace')">
            <Icon icon="lucide:file-warning" width="15" />
            <span>替换导入</span>
          </button>
        </div>
        <div v-if="backupStatus" class="status-line">{{ backupStatus }}</div>
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
      </div>

      <button class="row" @click="togglePanel('downloads')">
        <span>下载</span>
        <span class="value">{{ downloadDirectorySummary }}</span>
      </button>
      <div v-if="openPanel === 'downloads'" class="panel glass">
        <label class="field">
          <span>保存目录</span>
          <GlassInput
            v-model="downloadDirectoryDraft"
            placeholder="留空使用默认目录"
            @change="() => saveDownloadDirectory()"
            @blur="() => saveDownloadDirectory()"
          />
        </label>
        <div class="panel__actions">
          <button
            type="button"
            class="action-btn"
            :disabled="!canPickDownloadDirectory"
            @click="pickDownloadDirectory"
          >
            <Icon icon="lucide:folder-open" width="15" />
            <span>选择</span>
          </button>
          <button
            type="button"
            class="action-btn"
            :disabled="!canPickDownloadDirectory || downloadDirectoryBusy"
            @click="openDownloadDirectory"
          >
            <Icon icon="lucide:external-link" width="15" />
            <span>{{ downloadDirectoryBusy ? "打开中" : "打开" }}</span>
          </button>
          <button
            type="button"
            class="action-btn"
            :disabled="!settings.settings.downloadDirectory"
            @click="downloadDirectoryDraft = ''; saveDownloadDirectory('')"
          >
            <Icon icon="lucide:x" width="15" />
            <span>清除</span>
          </button>
        </div>
        <div v-if="downloadDirectoryStatus" class="status-line">{{ downloadDirectoryStatus }}</div>
      </div>

      <button class="row" @click="togglePanel('enhancement')">
        <span>画质增强</span>
        <span class="value">{{ enhancementSummary }}</span>
      </button>
      <div v-if="openPanel === 'enhancement'" class="panel glass">
        <ul class="cap-list">
          <li v-for="cap in enhancementCapabilities" :key="cap.key" class="cap-row">
            <div class="cap-row__icon">
              <Icon :icon="cap.icon" width="16" />
            </div>
            <div class="cap-row__main">
              <strong>{{ cap.label }}</strong>
              <span>{{ cap.detail }}</span>
            </div>
            <span class="cap-status" :class="`cap-status--${cap.status}`">
              {{ capabilityStatusLabel[cap.status] }}
            </span>
            <button
              v-if="cap.action === 'windows-hdr'"
              type="button"
              class="action-btn cap-row__action"
              :disabled="cap.status !== 'available'"
              title="打开"
              @click="openWindowsHdrSettings"
            >
              <Icon icon="lucide:external-link" width="14" />
            </button>
          </li>
        </ul>
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
.cap-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.cap-row {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--separator);
}
.cap-row:last-child {
  border-bottom: none;
}
.cap-row__icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--fg-secondary);
  background: rgba(255, 255, 255, 0.05);
}
.cap-row__main {
  min-width: 0;
}
.cap-row__main strong,
.cap-row__main span {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cap-row__main strong {
  color: var(--fg-primary);
  font-size: 13px;
}
.cap-row__main span {
  margin-top: 3px;
  color: var(--fg-tertiary);
  font-size: 12px;
}
.cap-status {
  min-width: 52px;
  text-align: center;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  color: var(--fg-secondary);
  font-size: 11px;
  padding: 3px 8px;
}
.cap-status--available {
  color: var(--success);
  border-color: color-mix(in srgb, var(--success) 38%, transparent);
}
.cap-status--disabled {
  color: var(--danger);
  border-color: rgba(255, 69, 58, 0.35);
}
.cap-row__action {
  min-width: 34px;
  padding: 0 9px;
  justify-content: center;
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
  padding: 12px 0;
  border-top: 1px solid var(--separator);
}
.panel__head + .server {
  border-top: none;
  padding-top: 0;
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
.line-pill.active {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 42%, transparent);
}
.line-pill.muted {
  color: var(--danger);
  border-color: rgba(255, 69, 58, 0.35);
}
.line-pill--button {
  appearance: none;
  background: transparent;
  cursor: pointer;
}
.line-pill--button:hover:not(:disabled) {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
}
.line-pill--button:disabled {
  cursor: wait;
  opacity: 0.58;
}
.server-edit {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid var(--separator);
  padding-top: 12px;
}
.server-edit__line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px 12px;
  border-top: 1px solid var(--separator);
  padding: 12px 0 0;
}
.server-edit__line:first-child {
  border-top: none;
  padding-top: 0;
}
.server-edit__line-head {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.server-edit__line-head strong {
  font-size: 12px;
  color: var(--fg-secondary);
}
.server-edit__advanced {
  grid-column: 1 / -1;
  padding-top: 0;
}
.server-edit__advanced summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: var(--fg-secondary);
  font-size: 12px;
}
.server-edit__advanced[open] summary {
  margin-bottom: 10px;
  color: var(--accent);
}
.server-edit__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(108px, 0.25fr);
  gap: 10px;
}
.server-edit__toggle {
  min-height: 39px;
  justify-content: flex-start;
  gap: 8px;
  white-space: nowrap;
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
@media (max-width: 760px) {
  .server-edit__line,
  .server-edit__grid {
    grid-template-columns: 1fr;
  }

  .server-edit__toggle {
    justify-content: space-between;
  }
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
