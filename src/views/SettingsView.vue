<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import { useRoute, useRouter } from "vue-router";

import GlassInput from "@/components/common/GlassInput.vue";
import LineStatusDot from "@/components/common/LineStatusDot.vue";
import SettingRow from "@/components/settings/SettingRow.vue";
import SettingsSection from "@/components/settings/SettingsSection.vue";
import ShortcutsPanel from "@/components/settings/ShortcutsPanel.vue";
import AddServerDialog from "@/components/login/AddServerDialog.vue";
import { api } from "@/api";
import type { CacheUsage } from "@/api";
import { hasNativeRuntime, hasTauriRuntime, openFileDialog, platformType } from "@/platform";
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

type SectionId =
  | "general"
  | "servers"
  | "library"
  | "player"
  | "subtitle"
  | "danmaku"
  | "externalPlayer"
  | "downloads"
  | "backup"
  | "sync"
  | "network"
  | "shortcuts"
  | "cache"
  | "about";

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
const expanded = ref<Set<SectionId>>(new Set(["general"]));
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
const isTauriRuntime = hasTauriRuntime();
const backupAvailable = computed(
  () => hasNativeRuntime() || platformLabel.value === "web",
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

function isExpanded(id: SectionId): boolean {
  return expanded.value.has(id);
}

function toggleSection(id: SectionId) {
  const next = new Set(expanded.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
    if (id === "cache") void refreshCacheUsage();
  }
  expanded.value = next;
}

function openSection(id: SectionId) {
  if (expanded.value.has(id)) return;
  const next = new Set(expanded.value);
  next.add(id);
  expanded.value = next;
}

// Legacy `?c=` deep links keep working: map old panel ids onto the new sections.
function sectionFromQuery(value: unknown): SectionId | null {
  const category = Array.isArray(value) ? value[0] : value;
  switch (category) {
    case "general":
    case "servers":
    case "library":
    case "player":
    case "subtitle":
    case "danmaku":
    case "externalPlayer":
    case "downloads":
    case "backup":
    case "sync":
    case "network":
    case "shortcuts":
    case "cache":
    case "about":
      return category;
    case "download":
      return "downloads";
    case "external-player":
      return "externalPlayer";
    case "appearance":
    case "theme":
      return "general";
    case "interaction":
    case "enhancement":
      return "player";
    case "file-services":
    case "fileServices":
    case "files":
    case "connectors":
    case "sources":
      return "library";
    default:
      return null;
  }
}

watch(
  () => route.query.c,
  (category) => {
    const section = sectionFromQuery(category);
    if (section) openSection(section);
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
  if (isExpanded("cache")) void refreshCacheUsage();
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
  openSection("servers");
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

// Reference parity (HillsLite 设置·外部播放器): dedicated mpv / PotPlayer groups.
async function pickExternalExe(key: "externalMpvPath" | "externalPotplayerPath", title: string) {
  const selected = await openFileDialog({
    multiple: false,
    directory: false,
    filters: [
      { name: "Executable", extensions: ["exe"] },
      { name: "All", extensions: ["*"] },
    ],
    title,
  });
  if (typeof selected === "string" && selected.length > 0) {
    await save(key, selected as any);
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

// Reference parity (HillsLite 设置·通用·缓存管理).
const cacheUsage = ref<CacheUsage | null>(null);
const cacheBusy = ref(false);
const cacheStatus = ref("");
const cacheSummary = computed(() =>
  cacheUsage.value ? formatCacheBytes(cacheUsage.value.totalBytes) : "查看",
);

function formatCacheBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

async function refreshCacheUsage() {
  cacheBusy.value = true;
  try {
    cacheUsage.value = await api.getCacheUsage();
    cacheStatus.value = "";
  } catch {
    cacheStatus.value = "无法读取缓存大小";
  } finally {
    cacheBusy.value = false;
  }
}

async function clearCache() {
  cacheBusy.value = true;
  cacheStatus.value = "";
  try {
    cacheUsage.value = await api.clearAppCache();
    cacheStatus.value = "已清理（正在使用的缓存将在重启后释放）";
  } catch {
    cacheStatus.value = "清理失败";
  } finally {
    cacheBusy.value = false;
  }
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
const mpvBackendLabel = computed(() =>
  settings.settings.mpvBackend === "embedded" ? "Embedded mpv" : "IPC mpv",
);

// Reference parity (HillsLite 设置·播放器): preferred track language presets.
// Values are mpv --alang/--slang ISO 639 lists; empty = server default.
const preferredLanguageOptions = [
  { value: "", label: "默认" },
  { value: "zh,zho,chi", label: "中文" },
  { value: "ja,jpn", label: "日语" },
  { value: "en,eng", label: "英语" },
  { value: "ko,kor", label: "韩语" },
];

// Reference parity (HillsLite「首选版本」): multi-version auto-pick strategy.
const preferredVersionOptions = [
  { value: "default", label: "默认" },
  { value: "hdr-first", label: "HDR优先" },
  { value: "sdr-first", label: "SDR优先" },
  { value: "high-bitrate", label: "高码率" },
  { value: "low-bitrate", label: "低码率" },
  { value: "high-framerate", label: "高帧率" },
] as const;

const anime4kLabel = computed(() => {
  const map: Record<string, string> = {
    off: "关闭",
    modeAFast: "Mode A 快",
    modeA: "Mode A",
    modeB: "Mode B",
    modeC: "Mode C",
    high: "高质",
  };
  return map[settings.settings.anime4kMode] ?? "关闭";
});

async function editMpvConf() {
  try {
    const confPath = await api.ensureMpvConf();
    await api.openPath(confPath);
  } catch {
    /* opener failure is non-fatal */
  }
}

async function openPlayerLogs() {
  try {
    await api.openPlayerLogDir();
  } catch {
    /* opener failure is non-fatal */
  }
}
const isWindowsPlatform = computed(() => platformLabel.value.toLowerCase().includes("windows"));

type CapabilityStatus = "available" | "disabled";

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
  if (settings.settings.externalMpvEnabled) return "外部 mpv";
  if (settings.settings.externalPotplayerEnabled) return "PotPlayer";
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
      <!-- 1. 通用 -->
      <SettingsSection
        title="通用"
        :summary="themeLabel"
        :expanded="isExpanded('general')"
        @toggle="toggleSection('general')"
      >
        <SettingRow label="主题模式" description="应用整体配色" stacked>
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
        </SettingRow>
        <SettingRow label="模糊强度" description="玻璃模糊效果强度" stacked>
          <div class="range-row">
            <input
              type="range"
              min="0"
              max="48"
              :value="settings.settings.blurStrength"
              @input="(e: any) => save('blurStrength', Number(e.target.value))"
            />
            <strong>{{ settings.settings.blurStrength }}</strong>
          </div>
        </SettingRow>
        <SettingRow
          label="窗口亚克力效果"
          description="窗口背景材质，重启后生效"
          advanced
          is-new
        >
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.enableWindowVibrancy"
            @change="(e: any) => save('enableWindowVibrancy', e.target.checked)"
          />
        </SettingRow>
        <SettingRow label="关闭时最小化到托盘" description="点关闭按钮隐藏到托盘而不退出应用">
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.closeToTray"
            @change="(e: any) => save('closeToTray', e.target.checked)"
          />
        </SettingRow>
        <SettingRow
          label="通知中心"
          description="查看应用通知与消息"
          clickable
          @click="openNotificationsCenter"
        >
          <span v-if="notifications.unread > 0" class="row-value">{{ unreadNotificationsLabel }} 未读</span>
          <Icon icon="lucide:chevron-right" width="16" class="row-chev" />
        </SettingRow>
        <SettingRow
          label="遥控器"
          description="控制其他 Emby / Jellyfin 客户端"
          clickable
          @click="openRemoteControl"
        >
          <Icon icon="lucide:chevron-right" width="16" class="row-chev" />
        </SettingRow>
      </SettingsSection>

      <!-- 2. 服务器 -->
      <SettingsSection
        title="服务器"
        :expanded="isExpanded('servers')"
        @toggle="toggleSection('servers')"
      >
        <div class="servers-block">
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
      </SettingsSection>

      <!-- 3. 媒体库 -->
      <SettingsSection
        title="媒体库"
        :summary="heroStyleLabel"
        :expanded="isExpanded('library')"
        @toggle="toggleSection('library')"
      >
        <SettingRow label="首页轮播图风格" description="首页顶部 Hero 区样式" stacked>
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
        </SettingRow>
        <SettingRow label="隐藏继续观看" description="首页不显示继续观看区块">
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.hideContinueWatching"
            @change="(e: any) => save('hideContinueWatching', e.target.checked)"
          />
        </SettingRow>
        <SettingRow label="显示封面评分" description="海报角标显示社区评分">
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.showCoverRating"
            @change="(e: any) => save('showCoverRating', e.target.checked)"
          />
        </SettingRow>
        <SettingRow label="JAV 番号过滤" description="隐藏番号命名的内容" advanced>
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.hideJavCodes"
            @change="(e: any) => save('hideJavCodes', e.target.checked)"
          />
        </SettingRow>
        <SettingRow
          label="打开本地文件"
          description="选择单个视频用内嵌 mpv 播放（仅桌面端可用）"
          clickable
          :disabled="!canOpenFileDialogs"
          @click="openLocalFile"
        >
          <Icon icon="lucide:file-video" width="16" class="row-chev" />
        </SettingRow>
        <SettingRow label="本地文件夹" description="浏览本地目录作为媒体库" clickable @click="openLocalFolder">
          <Icon icon="lucide:chevron-right" width="16" class="row-chev" />
        </SettingRow>
        <SettingRow label="WebDAV" description="连接 WebDAV 服务浏览播放" clickable @click="openWebDav">
          <Icon icon="lucide:chevron-right" width="16" class="row-chev" />
        </SettingRow>
        <SettingRow label="Alist / OpenList" description="连接 Alist 站点浏览播放" clickable @click="openAlist">
          <Icon icon="lucide:chevron-right" width="16" class="row-chev" />
        </SettingRow>
        <details class="cap-details">
          <summary>
            <Icon icon="lucide:sliders-horizontal" width="14" />
            连接器能力说明
            <span class="cap-details__tag">高级</span>
          </summary>
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
        </details>
      </SettingsSection>

      <!-- 4. 播放器 -->
      <SettingsSection
        title="播放器"
        :summary="mpvBackendLabel"
        :expanded="isExpanded('player')"
        @toggle="toggleSection('player')"
      >
        <p class="settings-subhead">解码与输出</p>
        <SettingRow label="播放核心" description="当前使用的 mpv 后端">
          <strong class="row-value-strong">{{ mpvBackendLabel }}</strong>
        </SettingRow>
        <SettingRow label="视频输出驱动" description="下次播放生效" stacked>
          <div class="seg">
            <button
              type="button"
              :class="{ active: settings.settings.videoOutputDriver === 'gpu-next' }"
              @click="save('videoOutputDriver', 'gpu-next')"
            >
              gpu-next
            </button>
            <button
              type="button"
              :class="{ active: settings.settings.videoOutputDriver === 'gpu' }"
              @click="save('videoOutputDriver', 'gpu')"
            >
              gpu
            </button>
          </div>
        </SettingRow>
        <SettingRow label="硬件解码" description="用 GPU 解码降低 CPU 占用">
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.hardwareDecoding"
            @change="(e: any) => save('hardwareDecoding', e.target.checked)"
          />
        </SettingRow>
        <SettingRow
          v-if="settings.settings.hardwareDecoding"
          label="硬解方式"
          description="下次播放生效"
          stacked
        >
          <div class="seg">
            <button
              type="button"
              :class="{ active: settings.settings.hwdecMode === 'auto' }"
              @click="save('hwdecMode', 'auto')"
            >
              自动
            </button>
            <button
              type="button"
              :class="{ active: settings.settings.hwdecMode === 'd3d11va' }"
              @click="save('hwdecMode', 'd3d11va')"
            >
              D3D11VA
            </button>
            <button
              type="button"
              :class="{ active: settings.settings.hwdecMode === 'vulkan' }"
              @click="save('hwdecMode', 'vulkan')"
            >
              Vulkan
            </button>
            <button
              type="button"
              :class="{ active: settings.settings.hwdecMode === 'copy' }"
              @click="save('hwdecMode', 'copy')"
            >
              Copy
            </button>
          </div>
        </SettingRow>
        <SettingRow
          label="低质量视频解码"
          description="低性能设备减负；下次播放生效"
          advanced
        >
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.lowQualityDecoding"
            @change="(e: any) => save('lowQualityDecoding', e.target.checked)"
          />
        </SettingRow>
        <SettingRow label="播放缓存（MB）" description="mpv demuxer 缓存上限，默认 256" stacked>
          <GlassInput
            type="number"
            :model-value="String(settings.settings.mpvCacheMb)"
            @update:modelValue="(v) => save('mpvCacheMb', Number(v) || 256)"
          />
        </SettingRow>
        <SettingRow
          label="最大缓存时长（秒）"
          description="0 = mpv 默认"
          advanced
          stacked
        >
          <GlassInput
            type="number"
            :model-value="String(settings.settings.mpvCacheSecs)"
            @update:modelValue="(v) => save('mpvCacheSecs', Math.max(0, Number(v) || 0))"
          />
        </SettingRow>

        <p class="settings-subhead">音轨与语言</p>
        <SettingRow label="首选音频语言" description="下次播放生效" stacked>
          <div class="seg">
            <button
              v-for="opt in preferredLanguageOptions"
              :key="`alang-${opt.value}`"
              type="button"
              :class="{ active: settings.settings.preferredAudioLanguage === opt.value }"
              @click="save('preferredAudioLanguage', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </SettingRow>
        <SettingRow label="首选字幕语言" description="下次播放生效" stacked>
          <div class="seg">
            <button
              v-for="opt in preferredLanguageOptions"
              :key="`slang-${opt.value}`"
              type="button"
              :class="{ active: settings.settings.preferredSubtitleLanguage === opt.value }"
              @click="save('preferredSubtitleLanguage', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </SettingRow>
        <SettingRow label="强制输出立体声" description="多声道下混为立体声；下次播放生效">
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.forceStereoAudio"
            @change="(e: any) => save('forceStereoAudio', e.target.checked)"
          />
        </SettingRow>

        <p class="settings-subhead">播放行为</p>
        <SettingRow label="首选版本" description="多版本自动选源策略" stacked>
          <div class="seg">
            <button
              v-for="opt in preferredVersionOptions"
              :key="opt.value"
              type="button"
              :class="{ active: settings.settings.preferredVersionStrategy === opt.value }"
              @click="save('preferredVersionStrategy', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </SettingRow>
        <SettingRow label="标记已看阈值" description="播放进度超过此值标记为已观看" stacked>
          <div class="range-row">
            <input
              type="range"
              min="50"
              max="100"
              step="1"
              :value="settings.settings.markWatchedThresholdPct"
              @input="(e: any) => save('markWatchedThresholdPct', Number(e.target.value))"
            />
            <strong>{{ settings.settings.markWatchedThresholdPct }}%</strong>
          </div>
        </SettingRow>
        <SettingRow label="自动跳过片头/片尾" description="按固定秒数跳过">
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.skipIntroOutroEnabled"
            @change="(e: any) => save('skipIntroOutroEnabled', e.target.checked)"
          />
        </SettingRow>
        <SettingRow
          v-if="settings.settings.skipIntroOutroEnabled"
          label="片头跳过秒数"
          description="依赖自动跳过开启"
          stacked
        >
          <GlassInput
            type="number"
            :model-value="String(settings.settings.skipIntroSeconds)"
            @update:modelValue="
              (v) => save('skipIntroSeconds', normalizeSkipSeconds(v, settings.settings.skipIntroSeconds))
            "
          />
        </SettingRow>
        <SettingRow
          v-if="settings.settings.skipIntroOutroEnabled"
          label="片尾跳过秒数"
          description="依赖自动跳过开启"
          stacked
        >
          <GlassInput
            type="number"
            :model-value="String(settings.settings.skipOutroSeconds)"
            @update:modelValue="
              (v) => save('skipOutroSeconds', normalizeSkipSeconds(v, settings.settings.skipOutroSeconds))
            "
          />
        </SettingRow>
        <SettingRow label="截图包含字幕" description="播放器截图时烧入字幕">
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.screenshotIncludeSubtitles"
            @change="(e: any) => save('screenshotIncludeSubtitles', e.target.checked)"
          />
        </SettingRow>

        <p class="settings-subhead">交互</p>
        <SettingRow label="快进时间（秒）" description="方向键 / 按钮单次快进步长" stacked>
          <GlassInput
            type="number"
            :model-value="String(settings.settings.seekForwardSeconds)"
            @update:modelValue="(v) => save('seekForwardSeconds', Math.min(300, Math.max(1, Number(v) || 10)))"
          />
        </SettingRow>
        <SettingRow label="快退时间（秒）" description="单次快退步长" stacked>
          <GlassInput
            type="number"
            :model-value="String(settings.settings.seekBackwardSeconds)"
            @update:modelValue="(v) => save('seekBackwardSeconds', Math.min(300, Math.max(1, Number(v) || 10)))"
          />
        </SettingRow>
        <SettingRow label="长按倍速" description="长按时的播放速度" stacked>
          <GlassInput
            type="number"
            :model-value="String(settings.settings.longPressSpeedRate)"
            @update:modelValue="(v) => save('longPressSpeedRate', Math.min(5, Math.max(1.1, Number(v) || 2)))"
          />
        </SettingRow>

        <p class="settings-subhead">显示与统计</p>
        <SettingRow label="右上角网速" description="播放时显示实时网速">
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.showNetworkSpeed"
            @change="(e: any) => save('showNetworkSpeed', e.target.checked)"
          />
        </SettingRow>
        <SettingRow label="统计浮层" description="播放统计信息样式" stacked>
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
        </SettingRow>
        <SettingRow label="全屏遮黑其他副屏" description="多显示器全屏时遮黑副屏" advanced>
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.blackoutOtherDisplays"
            @change="(e: any) => save('blackoutOtherDisplays', e.target.checked)"
          />
        </SettingRow>
        <SettingRow label="Anime4K 超分" description="在播放器画质增强菜单中切换（关闭 / A快 / A / B / C / 高质）">
          <strong class="row-value-strong">{{ anime4kLabel }}</strong>
        </SettingRow>
        <SettingRow label="Windows HDR" description="仅 Windows 可用，跳转系统显示设置">
          <button
            type="button"
            class="action-btn"
            :disabled="!isWindowsPlatform"
            @click="openWindowsHdrSettings"
          >
            <Icon icon="lucide:external-link" width="14" />
            <span>打开系统设置</span>
          </button>
        </SettingRow>

        <p class="settings-subhead">调试</p>
        <SettingRow label="切换轨道时保留缓存" description="关闭可解决部分切轨问题" advanced>
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.preserveTrackSwitchCache"
            @change="(e: any) => save('preserveTrackSwitchCache', e.target.checked)"
          />
        </SettingRow>
        <SettingRow label="附加授权查询参数" description="流地址附加 api_key 参数，兼容部分服务器" advanced>
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.appendAuthQuery"
            @change="(e: any) => save('appendAuthQuery', e.target.checked)"
          />
        </SettingRow>
        <SettingRow label="播放器日志" description="下次播放生效" advanced>
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.playerLogEnabled"
            @change="(e: any) => save('playerLogEnabled', e.target.checked)"
          />
        </SettingRow>
        <SettingRow label="打开日志文件夹" description="查看播放器日志文件" advanced>
          <button type="button" class="action-btn" @click="openPlayerLogs">
            <Icon icon="lucide:folder-open" width="14" />
            <span>打开</span>
          </button>
        </SettingRow>
        <SettingRow label="编辑 mpv.conf" description="下次播放生效" advanced>
          <button type="button" class="action-btn" @click="editMpvConf">
            <Icon icon="lucide:file-cog" width="14" />
            <span>打开</span>
          </button>
        </SettingRow>
      </SettingsSection>

      <!-- 5. 字幕 -->
      <SettingsSection
        title="字幕"
        summary="播放器内可调"
        :expanded="isExpanded('subtitle')"
        @toggle="toggleSection('subtitle')"
      >
        <p class="subhint">以下字幕样式同样可在播放器内字幕面板实时调整，这里的修改将作为默认值。</p>
        <SettingRow label="字幕大小" description="相对缩放倍率" stacked>
          <div class="range-row">
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.05"
              :value="settings.settings.subtitleScale"
              @input="(e: any) => save('subtitleScale', Number(Number(e.target.value).toFixed(2)))"
            />
            <strong>{{ settings.settings.subtitleScale.toFixed(2) }}×</strong>
          </div>
        </SettingRow>
        <SettingRow label="字幕粗体">
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.subtitleBold"
            @change="(e: any) => save('subtitleBold', e.target.checked)"
          />
        </SettingRow>
        <SettingRow label="字体颜色" description="十六进制色值">
          <input
            class="color-input"
            type="color"
            :value="settings.settings.subtitleTextColor"
            @input="(e: any) => save('subtitleTextColor', e.target.value)"
          />
        </SettingRow>
        <SettingRow label="描边颜色" description="十六进制色值">
          <input
            class="color-input"
            type="color"
            :value="settings.settings.subtitleOutlineColor"
            @input="(e: any) => save('subtitleOutlineColor', e.target.value)"
          />
        </SettingRow>
        <SettingRow label="描边宽度" stacked>
          <div class="range-row">
            <input
              type="range"
              min="0"
              max="8"
              step="0.05"
              :value="settings.settings.subtitleOutlineSize"
              @input="(e: any) => save('subtitleOutlineSize', Number(Number(e.target.value).toFixed(2)))"
            />
            <strong>{{ settings.settings.subtitleOutlineSize.toFixed(2) }}</strong>
          </div>
        </SettingRow>
        <SettingRow label="阴影偏移" stacked>
          <div class="range-row">
            <input
              type="range"
              min="0"
              max="8"
              step="0.05"
              :value="settings.settings.subtitleShadowOffset"
              @input="(e: any) => save('subtitleShadowOffset', Number(Number(e.target.value).toFixed(2)))"
            />
            <strong>{{ settings.settings.subtitleShadowOffset.toFixed(2) }}</strong>
          </div>
        </SettingRow>
        <SettingRow label="主字幕位置" description="100 = 底部默认" stacked>
          <div class="range-row">
            <input
              type="range"
              min="0"
              max="150"
              step="1"
              :value="settings.settings.subtitlePositionPct"
              @input="(e: any) => save('subtitlePositionPct', Number(e.target.value))"
            />
            <strong>{{ settings.settings.subtitlePositionPct }}%</strong>
          </div>
        </SettingRow>
        <SettingRow label="次字幕位置" description="0 = 顶部默认" stacked>
          <div class="range-row">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              :value="settings.settings.subtitleSecondaryPositionPct"
              @input="(e: any) => save('subtitleSecondaryPositionPct', Number(e.target.value))"
            />
            <strong>{{ settings.settings.subtitleSecondaryPositionPct }}%</strong>
          </div>
        </SettingRow>
        <SettingRow label="强制覆盖 ASS 样式" description="覆盖内嵌字幕自带样式" advanced>
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.subtitleForceStyle"
            @change="(e: any) => save('subtitleForceStyle', e.target.checked)"
          />
        </SettingRow>
      </SettingsSection>

      <!-- 6. 弹幕 -->
      <SettingsSection
        title="弹幕"
        :summary="danmakuSummary"
        :expanded="isExpanded('danmaku')"
        @toggle="toggleSection('danmaku')"
      >
        <SettingRow label="开启弹幕" description="数据来源 DanDanPlay API">
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.danmakuEnabledDefault"
            @change="(e: any) => save('danmakuEnabledDefault', e.target.checked)"
          />
        </SettingRow>
        <SettingRow label="字号" stacked>
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
        </SettingRow>
        <SettingRow label="透明度" stacked>
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
        </SettingRow>
        <SettingRow label="速度" stacked>
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
        </SettingRow>
        <SettingRow label="滚动弹幕最大行数" stacked>
          <div class="range-row">
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              :value="settings.settings.danmakuScrollMaxRows"
              @input="(e: any) => save('danmakuScrollMaxRows', Number(e.target.value))"
            />
            <strong>{{ settings.settings.danmakuScrollMaxRows }}</strong>
          </div>
        </SettingRow>
        <SettingRow label="顶部弹幕最大行数" stacked>
          <div class="range-row">
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              :value="settings.settings.danmakuTopMaxRows"
              @input="(e: any) => save('danmakuTopMaxRows', Number(e.target.value))"
            />
            <strong>{{ settings.settings.danmakuTopMaxRows }}</strong>
          </div>
        </SettingRow>
        <SettingRow label="底部弹幕最大行数" stacked>
          <div class="range-row">
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              :value="settings.settings.danmakuBottomMaxRows"
              @input="(e: any) => save('danmakuBottomMaxRows', Number(e.target.value))"
            />
            <strong>{{ settings.settings.danmakuBottomMaxRows }}</strong>
          </div>
        </SettingRow>
        <SettingRow label="粗体">
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.danmakuBold"
            @change="(e: any) => save('danmakuBold', e.target.checked)"
          />
        </SettingRow>
        <SettingRow label="记忆手动选择的弹幕" description="下次播放同一剧集自动恢复">
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.danmakuRememberSelection"
            @change="(e: any) => save('danmakuRememberSelection', e.target.checked)"
          />
        </SettingRow>
        <SettingRow label="避让字幕" description="弹幕避开字幕区域">
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.danmakuAvoidSubtitles"
            @change="(e: any) => save('danmakuAvoidSubtitles', e.target.checked)"
          />
        </SettingRow>
        <SettingRow label="底部避让区域" description="底部保留高度" stacked>
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
        </SettingRow>
      </SettingsSection>

      <!-- 7. 外部播放器 -->
      <SettingsSection
        title="外部播放器"
        :summary="externalPlayerSummary"
        :expanded="isExpanded('externalPlayer')"
        @toggle="toggleSection('externalPlayer')"
      >
        <SettingRow label="外部 mpv 播放器" description="用独立 mpv 程序播放">
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.externalMpvEnabled"
            @change="(e: any) => save('externalMpvEnabled', e.target.checked)"
          />
        </SettingRow>
        <template v-if="settings.settings.externalMpvEnabled">
          <SettingRow label="mpv 位置" stacked>
            <div class="path-row">
              <GlassInput
                :model-value="settings.settings.externalMpvPath ?? ''"
                placeholder="例如 C:\\mpv\\mpv.exe"
                @update:modelValue="(v) => save('externalMpvPath', (String(v).trim() || null) as any)"
              />
              <button
                type="button"
                class="action-btn"
                @click="pickExternalExe('externalMpvPath', '选择 mpv.exe')"
              >
                <Icon icon="lucide:folder-open" width="15" />
                <span>选择</span>
              </button>
            </div>
          </SettingRow>
          <SettingRow label="mpv 使用代理" description="自定义代理时传给 mpv">
            <input
              class="switch"
              type="checkbox"
              :checked="settings.settings.externalMpvUseProxy"
              @change="(e: any) => save('externalMpvUseProxy', e.target.checked)"
            />
          </SettingRow>
        </template>
        <SettingRow label="外部 PotPlayer 播放器">
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.externalPotplayerEnabled"
            @change="(e: any) => save('externalPotplayerEnabled', e.target.checked)"
          />
        </SettingRow>
        <template v-if="settings.settings.externalPotplayerEnabled">
          <SettingRow label="PotPlayer 位置" stacked>
            <div class="path-row">
              <GlassInput
                :model-value="settings.settings.externalPotplayerPath ?? ''"
                placeholder="例如 C:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini64.exe"
                @update:modelValue="(v) => save('externalPotplayerPath', (String(v).trim() || null) as any)"
              />
              <button
                type="button"
                class="action-btn"
                @click="pickExternalExe('externalPotplayerPath', '选择 PotPlayer')"
              >
                <Icon icon="lucide:folder-open" width="15" />
                <span>选择</span>
              </button>
            </div>
          </SettingRow>
        </template>
        <SettingRow label="其他播放器路径" description="以上未开启时生效；留空用系统默认" advanced stacked>
          <div class="path-row">
            <GlassInput
              v-model="externalPlayerPathDraft"
              placeholder="留空使用系统默认"
              @change="() => saveExternalPlayerPath()"
              @blur="() => saveExternalPlayerPath()"
            />
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
        </SettingRow>
        <SettingRow label="启动参数" description="支持 {headers} {userAgent} {url} 占位符" advanced stacked>
          <GlassInput
            v-model="externalPlayerArgsDraft"
            placeholder="{headers} {userAgent} {url}"
            @change="() => saveExternalPlayerArgs()"
            @blur="() => saveExternalPlayerArgs()"
          />
        </SettingRow>
      </SettingsSection>

      <!-- 8. 下载 -->
      <SettingsSection
        title="下载"
        :summary="downloadDirectorySummary"
        :expanded="isExpanded('downloads')"
        @toggle="toggleSection('downloads')"
      >
        <SettingRow label="保存目录" description="留空使用默认目录" stacked>
          <div class="path-row">
            <GlassInput
              v-model="downloadDirectoryDraft"
              placeholder="留空使用默认目录"
              @change="() => saveDownloadDirectory()"
              @blur="() => saveDownloadDirectory()"
            />
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
        </SettingRow>
        <p v-if="downloadDirectoryStatus" class="status-line">{{ downloadDirectoryStatus }}</p>
        <SettingRow
          label="下载中心"
          description="查看与管理下载任务"
          clickable
          @click="openDownloadsCenter"
        >
          <span v-if="activeDownloads > 0" class="row-value">{{ activeDownloadsLabel }} 个任务</span>
          <Icon icon="lucide:chevron-right" width="16" class="row-chev" />
        </SettingRow>
      </SettingsSection>

      <!-- 9. 备份与还原 -->
      <SettingsSection
        title="备份与还原"
        :expanded="isExpanded('backup')"
        @toggle="toggleSection('backup')"
      >
        <template v-if="backupAvailable">
          <SettingRow label="导出配置" description="导出设置、服务器、账号和快捷键">
            <button class="action-btn" :disabled="backupBusy !== null" @click="exportConfig">
              <Icon icon="lucide:download" width="15" />
              <span>{{ backupBusy === "export" ? "导出中" : "导出" }}</span>
            </button>
          </SettingRow>
          <SettingRow label="合并导入" description="与现有配置合并">
            <button class="action-btn" :disabled="backupBusy !== null" @click="importConfig('merge')">
              <Icon icon="lucide:upload" width="15" />
              <span>{{ backupBusy === "import" ? "导入中" : "合并" }}</span>
            </button>
          </SettingRow>
          <SettingRow label="替换导入" description="覆盖当前全部配置">
            <button
              class="action-btn action-btn--danger"
              :disabled="backupBusy !== null"
              @click="importConfig('replace')"
            >
              <Icon icon="lucide:file-warning" width="15" />
              <span>替换</span>
            </button>
          </SettingRow>
          <p v-if="backupStatus" class="status-line">{{ backupStatus }}</p>
        </template>
        <p v-else class="subhint">当前运行环境不支持配置备份与还原。</p>
      </SettingsSection>

      <!-- 10. 同步（Trakt）：OAuth 授权流缺失，按项目「无占位 UI」约束暂不渲染该 section。 -->

      <!-- 11. 网络 -->
      <SettingsSection
        title="网络"
        :expanded="isExpanded('network')"
        @toggle="toggleSection('network')"
      >
        <SettingRow label="网络代理" description="重启后生效" stacked>
          <div class="seg">
            <button
              type="button"
              :class="{ active: settings.settings.networkProxyMode === 'none' }"
              @click="save('networkProxyMode', 'none')"
            >
              不使用
            </button>
            <button
              type="button"
              :class="{ active: settings.settings.networkProxyMode === 'system' }"
              @click="save('networkProxyMode', 'system')"
            >
              跟随系统
            </button>
            <button
              type="button"
              :class="{ active: settings.settings.networkProxyMode === 'custom' }"
              @click="save('networkProxyMode', 'custom')"
            >
              自定义
            </button>
          </div>
        </SettingRow>
        <SettingRow
          v-if="settings.settings.networkProxyMode === 'custom'"
          label="HTTP 代理地址"
          description="如 http://127.0.0.1:7897"
          stacked
        >
          <GlassInput
            placeholder="http://127.0.0.1:7897"
            :model-value="settings.settings.httpProxyUrl"
            @update:modelValue="(v) => save('httpProxyUrl', String(v).trim())"
          />
        </SettingRow>
        <SettingRow label="忽略 SSL 证书校验" description="重启后生效；自签证书服务器用">
          <input
            class="switch"
            type="checkbox"
            :checked="settings.settings.ignoreSslErrors"
            @change="(e: any) => save('ignoreSslErrors', e.target.checked)"
          />
        </SettingRow>
        <SettingRow label="心跳保号周期（秒）" description="默认 180" advanced stacked>
          <GlassInput
            :model-value="String(settings.settings.heartbeatIntervalSecs)"
            @update:modelValue="(v) => save('heartbeatIntervalSecs', Number(v) || 180)"
          />
        </SettingRow>
        <SettingRow label="线路测活周期（秒）" description="默认 60" advanced stacked>
          <GlassInput
            :model-value="String(settings.settings.healthCheckIntervalSecs)"
            @update:modelValue="(v) => save('healthCheckIntervalSecs', Number(v) || 60)"
          />
        </SettingRow>
        <SettingRow label="线路竞赛超时（ms）" description="默认 3500" advanced stacked>
          <GlassInput
            :model-value="String(settings.settings.raceTimeoutMs)"
            @update:modelValue="(v) => save('raceTimeoutMs', Number(v) || 3500)"
          />
        </SettingRow>
        <SettingRow label="请求超时（ms）" description="默认 15000" advanced stacked>
          <GlassInput
            :model-value="String(settings.settings.requestTimeoutMs)"
            @update:modelValue="(v) => save('requestTimeoutMs', Number(v) || 15000)"
          />
        </SettingRow>
        <SettingRow label="默认 User-Agent" description="线路未单独配置时使用" advanced is-new stacked>
          <GlassInput
            :model-value="settings.settings.defaultUserAgent"
            placeholder="Emby-Player/0.1 (Tauri; libmpv)"
            @update:modelValue="(v) => save('defaultUserAgent', String(v))"
          />
        </SettingRow>
      </SettingsSection>

      <!-- 12. 快捷键 -->
      <SettingsSection
        title="快捷键"
        :expanded="isExpanded('shortcuts')"
        @toggle="toggleSection('shortcuts')"
      >
        <ShortcutsPanel />
      </SettingsSection>

      <!-- 13. 缓存 -->
      <SettingsSection
        title="缓存"
        :summary="cacheSummary"
        :expanded="isExpanded('cache')"
        @toggle="toggleSection('cache')"
      >
        <ul v-if="cacheUsage" class="cap-list">
          <li v-for="entry in cacheUsage.entries" :key="entry.label" class="cap-row cap-row--plain">
            <div class="cap-row__main">
              <strong>{{ entry.label }}</strong>
            </div>
            <span class="row-value-strong">{{ formatCacheBytes(entry.bytes) }}</span>
          </li>
        </ul>
        <SettingRow label="刷新" description="重新统计缓存占用">
          <button class="action-btn" :disabled="cacheBusy" @click="refreshCacheUsage">
            <Icon icon="lucide:refresh-cw" width="15" />
            <span>刷新</span>
          </button>
        </SettingRow>
        <SettingRow label="清理缓存" description="使用中的缓存重启后释放">
          <button class="action-btn action-btn--danger" :disabled="cacheBusy" @click="clearCache">
            <Icon icon="lucide:trash-2" width="15" />
            <span>{{ cacheBusy ? "清理中" : "清理" }}</span>
          </button>
        </SettingRow>
        <p v-if="cacheStatus" class="status-line">{{ cacheStatus }}</p>
      </SettingsSection>

      <!-- 14. 关于 -->
      <SettingsSection
        title="关于"
        :summary="`v${appVersion}`"
        :expanded="isExpanded('about')"
        @toggle="toggleSection('about')"
      >
        <SettingRow label="版本">
          <strong class="row-value-strong">v{{ appVersion }}</strong>
        </SettingRow>
        <SettingRow label="运行壳">
          <strong class="row-value-strong">{{ runtimeLabel }}</strong>
        </SettingRow>
        <SettingRow label="平台">
          <strong class="row-value-strong">{{ platformLabel }}</strong>
        </SettingRow>
        <SettingRow label="服务器数量">
          <strong class="row-value-strong">{{ serverStore.servers.length }}</strong>
        </SettingRow>
        <SettingRow label="当前账号">
          <strong class="row-value-strong">{{ activeAccountLabel }}</strong>
        </SettingRow>
        <SettingRow label="播放核心">
          <strong class="row-value-strong">{{ mpvBackendLabel }}</strong>
        </SettingRow>
        <SettingRow label="备份配置" description="导出 / 导入应用配置" clickable @click="openSection('backup')">
          <Icon icon="lucide:chevron-right" width="16" class="row-chev" />
        </SettingRow>
        <SettingRow label="服务器" description="管理已保存的服务器与线路" clickable @click="openSection('servers')">
          <Icon icon="lucide:chevron-right" width="16" class="row-chev" />
        </SettingRow>
      </SettingsSection>
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
.row-value {
  color: var(--fg-secondary);
  font-size: 13px;
}
.row-value-strong {
  color: var(--fg-primary);
  font-size: 13px;
  font-weight: 700;
}
.row-chev {
  color: var(--fg-tertiary);
}
.subhint {
  margin: 6px 4px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--fg-tertiary);
}
.path-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.path-row :deep(.ginput) {
  flex: 1;
  min-width: 180px;
}
.color-input {
  width: 44px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
}
.panel__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: var(--fg-secondary);
  padding: 6px 0 2px;
}
.panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.cap-details {
  border-top: 1px solid var(--separator);
  padding-top: 8px;
}
.cap-details > summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: var(--fg-secondary);
  font-size: 13px;
  padding: 8px 0;
}
.cap-details[open] > summary {
  color: var(--accent);
  margin-bottom: 6px;
}
.cap-details__tag {
  margin-left: 2px;
  padding: 1px 6px;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  color: var(--fg-tertiary);
  font-size: 10px;
  font-weight: 600;
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
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--separator);
}
.cap-row--plain {
  grid-template-columns: minmax(0, 1fr) auto;
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
.action-btn--danger:hover:not(:disabled) {
  border-color: var(--danger);
  color: var(--danger);
}
.action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.status-line {
  color: var(--fg-secondary);
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
  padding: 4px 4px 0;
}
.status-line.error {
  color: var(--danger);
}
.empty {
  font-size: 13px;
  color: var(--fg-tertiary);
  padding: 8px 0;
}
.servers-block {
  display: flex;
  flex-direction: column;
}
.server {
  padding: 12px 0;
  border-top: 1px solid var(--separator);
}
.panel__head + .server {
  border-top: none;
  padding-top: 4px;
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
  flex-wrap: wrap;
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
  width: 100%;
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
