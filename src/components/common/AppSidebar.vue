<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

import { useAuthStore } from "@/stores/auth";
import { useDownloadsStore } from "@/stores/downloads";
import { useLocalFilesStore } from "@/stores/localFiles";
import { useNotificationsStore } from "@/stores/notifications";
import { useServerStore } from "@/stores/server";
import { useSettingsStore } from "@/stores/settings";
import { useWebDavStore } from "@/stores/webdav";
import { openFileDialog } from "@/platform";
import LineStatusDot from "@/components/common/LineStatusDot.vue";
import AddServerDialog from "@/components/login/AddServerDialog.vue";
import { serverActiveLine, serverKindIcon, serverKindLabel } from "@/utils/serverVisuals";

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const serverStore = useServerStore();
const settings = useSettingsStore();
const downloads = useDownloadsStore();
const localFiles = useLocalFilesStore();
const notifications = useNotificationsStore();
const webdav = useWebDavStore();

const showAdd = ref(false);
const showVisibility = ref(false);

const hiddenIds = computed(() => settings.settings.hiddenServerIds ?? []);
const visibleServers = computed(() =>
  serverStore.servers.filter((s) => !hiddenIds.value.includes(s.id)),
);

const activeServerId = computed(() => auth.activeAccount?.serverId ?? null);

const activeDownloads = computed(
  () => downloads.tasks.filter((t) => t.status === "running" || t.status === "paused").length,
);
const activeDownloadsLabel = computed(() =>
  activeDownloads.value > 99 ? "99+" : String(activeDownloads.value),
);
const unreadNotificationsLabel = computed(() =>
  notifications.unread > 99 ? "99+" : String(notifications.unread),
);
const favoriteLocalFiles = computed(() => localFiles.favoriteItems.slice(0, 3));
const favoriteLocalFileKeys = computed(
  () => new Set(localFiles.favoriteItems.map((entry) => entry.filePath.toLowerCase())),
);
const recentLocalFiles = computed(() =>
  localFiles.items
    .filter((entry) => !favoriteLocalFileKeys.value.has(entry.filePath.toLowerCase()))
    .slice(0, 3),
);
const favoriteLocalFolders = computed(() => localFiles.favoriteFolderItems.slice(0, 2));
const favoriteLocalFolderKeys = computed(
  () => new Set(localFiles.favoriteFolderItems.map((entry) => entry.folderPath.toLowerCase())),
);
const recentLocalFolders = computed(() =>
  localFiles.folderItems
    .filter((entry) => !favoriteLocalFolderKeys.value.has(entry.folderPath.toLowerCase()))
    .slice(0, 2),
);
const favoriteWebDavConnections = computed(() => webdav.favoriteConnections.slice(0, 2));
const favoriteWebDavConnectionIds = computed(
  () => new Set(webdav.favoriteConnections.map((entry) => entry.id)),
);
const recentWebDavConnections = computed(() =>
  webdav.recentConnections
    .filter((entry) => !favoriteWebDavConnectionIds.value.has(entry.id))
    .slice(0, 2),
);

function loggedInOn(serverId: string): boolean {
  return auth.accounts.some((a) => a.serverId === serverId);
}

async function pickServer(serverId: string) {
  const acc = auth.accounts.find((a) => a.serverId === serverId);
  if (acc) {
    if (auth.activeId !== acc.id) {
      try {
        await auth.switchTo(acc.id);
      } catch {
        /* ignore */
      }
    }
    router.push("/home").catch(() => {});
  } else {
    router.push({ name: "login", query: { server: serverId } }).catch(() => {});
  }
}

async function toggleHidden(serverId: string, hidden: boolean) {
  try {
    await settings.toggleHidden(serverId, hidden);
  } catch {
    /* ignore */
  }
}

function gotoSettings(category?: string) {
  router.push({ name: "settings", query: { c: category ?? "servers" } }).catch(() => {});
}

function gotoHome() {
  router.push("/home").catch(() => {});
}
function gotoFavorites() {
  router.push("/favorites").catch(() => {});
}
function gotoHistory() {
  router.push("/history").catch(() => {});
}
function gotoAggregate() {
  router.push("/aggregate").catch(() => {});
}
function gotoDownloads() {
  router.push("/downloads").catch(() => {});
}
function gotoRemote() {
  router.push("/remote").catch(() => {});
}
function gotoWebDav() {
  router.push("/webdav").catch(() => {});
}
function openWebDavConnection(id: string) {
  router.push({ name: "webdav", query: { connection: id } }).catch(() => {});
}
function gotoLocalFolder(folderPath?: string) {
  router
    .push({
      name: "local-folder",
      query: folderPath ? { folder: folderPath } : {},
    })
    .catch(() => {});
}

function openLocalFolderPath(folderPath: string) {
  localFiles.rememberFolder(folderPath);
  gotoLocalFolder(folderPath);
}

function openLocalPath(filePath: string) {
  localFiles.remember(filePath);
  router
    .push({ name: "player", params: { id: "local-file" }, query: { file: filePath } })
    .catch(() => {});
}

async function openLocalFile() {
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
  const selected = await openFileDialog({
    multiple: false,
    directory: true,
    title: "打开本地文件夹",
  }).catch(() => null);
  if (typeof selected === "string" && selected.length > 0) {
    openLocalFolderPath(selected);
  } else {
    gotoLocalFolder();
  }
}
</script>

<template>
  <aside class="sb glass">
    <header class="sb__brand">
      <button class="brand-btn" @click="gotoHome">
        <Icon icon="lucide:menu" width="18" class="brand-btn__menu" />
        <span class="brand-btn__name">Hills Lite</span>
      </button>
    </header>

    <nav class="sb__nav">
      <button
        class="nav-btn"
        :class="{ active: route.name === 'home' }"
        @click="gotoHome"
      >
        <Icon icon="lucide:home" width="16" />
        <span>首页</span>
      </button>
      <button
        class="nav-btn"
        :class="{ active: route.name === 'favorites' }"
        @click="gotoFavorites"
      >
        <Icon icon="lucide:heart" width="16" />
        <span>收藏</span>
      </button>
      <button
        class="nav-btn"
        :class="{ active: route.name === 'history' }"
        @click="gotoHistory"
      >
        <Icon icon="lucide:history" width="16" />
        <span>历史</span>
      </button>
      <button
        class="nav-btn"
        :class="{ active: route.name === 'aggregate' }"
        @click="gotoAggregate"
      >
        <Icon icon="lucide:infinity" width="16" />
        <span>聚合视界</span>
      </button>
      <button
        class="nav-btn"
        :class="{ active: route.name === 'downloads' }"
        @click="gotoDownloads"
      >
        <Icon icon="lucide:download" width="16" />
        <span>下载</span>
        <span v-if="activeDownloads > 0" class="badge">{{ activeDownloadsLabel }}</span>
      </button>
      <button
        class="nav-btn"
        :class="{ active: notifications.centerOpen }"
        @click="notifications.toggleCenter"
      >
        <Icon icon="lucide:bell" width="16" />
        <span>通知</span>
        <span v-if="notifications.unread > 0" class="badge danger">{{ unreadNotificationsLabel }}</span>
      </button>
      <button
        class="nav-btn"
        :class="{ active: route.name === 'remote' }"
        @click="gotoRemote"
      >
        <Icon icon="lucide:cast" width="16" />
        <span>遥控</span>
      </button>
    </nav>

    <section class="sb__section">
      <header class="sec-head">
        <span>服务器</span>
        <div class="sec-head__actions">
          <button
            class="iconbtn"
            :class="{ active: showVisibility }"
            aria-label="管理可见性"
            @click="showVisibility = !showVisibility"
          >
            <Icon icon="lucide:settings-2" width="14" />
          </button>
        </div>
      </header>

      <div v-if="showVisibility" class="visibility glass-thin">
        <div class="visibility__title">显示哪些服务器</div>
        <div v-if="serverStore.servers.length === 0" class="visibility__empty">
          还没有服务器
        </div>
        <label v-for="s in serverStore.servers" :key="s.id" class="visibility__row">
          <input
            type="checkbox"
            :checked="!hiddenIds.includes(s.id)"
            @change="(e: any) => toggleHidden(s.id, !e.target.checked)"
          />
          <span class="visibility__name">{{ s.name }}</span>
        </label>
      </div>

      <ul class="srv-list">
        <li
          v-for="s in visibleServers"
          :key="s.id"
          class="srv-row"
          :class="{ 'is-active': s.id === activeServerId }"
        >
          <button class="srv-row__btn" @click="pickServer(s.id)">
            <div class="srv-row__avatar" :title="serverKindLabel(s.kind)">
              <Icon :icon="serverKindIcon(s.kind)" width="16" />
              <LineStatusDot
                class="srv-row__dot"
                :status="serverActiveLine(s)?.lastStatus"
                :latency-ms="serverActiveLine(s)?.lastLatencyMs"
              />
            </div>
            <div class="srv-row__text">
              <div class="srv-row__name" :title="s.name">{{ s.name }}</div>
              <div class="srv-row__sub">
                <span v-if="loggedInOn(s.id)">已连接</span>
                <span v-else class="dim">未登录</span>
              </div>
            </div>
          </button>
          <button
            class="srv-row__minus"
            aria-label="隐藏服务器"
            @click.stop="toggleHidden(s.id, true)"
          >
            <Icon icon="lucide:minus" width="14" />
          </button>
        </li>
        <li
          v-if="visibleServers.length === 0 && serverStore.servers.length === 0"
          class="srv-empty"
        >
          马上添加 Emby 服务器，以开始您的媒体之旅！
        </li>
        <li
          v-else-if="visibleServers.length === 0"
          class="srv-empty"
        >
          全部服务器被隐藏，点击右上 ⚙️ 取消隐藏。
        </li>
      </ul>
    </section>

    <div class="sb__flex" />

    <section class="sb__bottom">
      <button class="nav-btn about-btn" type="button" @click="gotoSettings('about')">
        <Icon icon="lucide:info" width="16" />
        <span>关于 Hills Lite</span>
      </button>

      <button class="add-srv" @click="showAdd = true">
        <Icon icon="lucide:plus" width="14" />
        <span>添加服务器</span>
      </button>

      <button class="add-srv" @click="openLocalFile">
        <Icon icon="lucide:file-video" width="14" />
        <span>打开本地文件</span>
      </button>

      <div v-if="favoriteLocalFiles.length > 0" class="local-recent">
        <div class="local-recent__head">
          <span>收藏本地文件</span>
          <button class="iconbtn" aria-label="清空收藏本地文件" @click="localFiles.clearFavoriteFiles()">
            <Icon icon="lucide:x" width="13" />
          </button>
        </div>
        <button
          v-for="entry in favoriteLocalFiles"
          :key="entry.filePath"
          class="local-recent__item"
          :title="entry.filePath"
          @click="openLocalPath(entry.filePath)"
        >
          <Icon icon="lucide:star" width="14" />
          <span>{{ entry.name }}</span>
        </button>
      </div>

      <button
        class="add-srv"
        :class="{ active: route.name === 'local-folder' }"
        @click="openLocalFolder"
      >
        <Icon icon="lucide:folder-open" width="14" />
        <span>打开本地文件夹</span>
      </button>

      <button
        class="add-srv"
        :class="{ active: route.name === 'webdav' }"
        @click="gotoWebDav"
      >
        <Icon icon="lucide:cloud" width="14" />
        <span>WebDAV</span>
      </button>

      <div v-if="favoriteWebDavConnections.length > 0" class="local-recent">
        <div class="local-recent__head">
          <span>收藏 WebDAV</span>
          <button class="iconbtn" aria-label="清空收藏 WebDAV" @click="webdav.clearFavorites()">
            <Icon icon="lucide:x" width="13" />
          </button>
        </div>
        <button
          v-for="entry in favoriteWebDavConnections"
          :key="entry.id"
          class="local-recent__item"
          :title="entry.baseUrl"
          @click="openWebDavConnection(entry.id)"
        >
          <Icon icon="lucide:star" width="14" />
          <span>{{ entry.name }}</span>
        </button>
      </div>

      <div v-if="recentWebDavConnections.length > 0" class="local-recent">
        <div class="local-recent__head">
          <span>最近 WebDAV</span>
        </div>
        <button
          v-for="entry in recentWebDavConnections"
          :key="entry.id"
          class="local-recent__item"
          :title="entry.baseUrl"
          @click="openWebDavConnection(entry.id)"
        >
          <Icon icon="lucide:cloud" width="14" />
          <span>{{ entry.name }}</span>
        </button>
      </div>

      <div v-if="favoriteLocalFolders.length > 0" class="local-recent">
        <div class="local-recent__head">
          <span>收藏本地文件夹</span>
          <button
            class="iconbtn"
            aria-label="清空收藏本地文件夹"
            @click="localFiles.clearFavoriteFolders()"
          >
            <Icon icon="lucide:x" width="13" />
          </button>
        </div>
        <button
          v-for="entry in favoriteLocalFolders"
          :key="entry.folderPath"
          class="local-recent__item"
          :title="entry.folderPath"
          @click="openLocalFolderPath(entry.folderPath)"
        >
          <Icon icon="lucide:star" width="14" />
          <span>{{ entry.name }}</span>
        </button>
      </div>

      <div v-if="recentLocalFolders.length > 0" class="local-recent">
        <div class="local-recent__head">
          <span>最近本地文件夹</span>
          <button class="iconbtn" aria-label="清空最近本地文件夹" @click="localFiles.clearFolders()">
            <Icon icon="lucide:x" width="13" />
          </button>
        </div>
        <button
          v-for="entry in recentLocalFolders"
          :key="entry.folderPath"
          class="local-recent__item"
          :title="entry.folderPath"
          @click="openLocalFolderPath(entry.folderPath)"
        >
          <Icon icon="lucide:folder" width="14" />
          <span>{{ entry.name }}</span>
        </button>
      </div>

      <div v-if="recentLocalFiles.length > 0" class="local-recent">
        <div class="local-recent__head">
          <span>最近本地文件</span>
          <button class="iconbtn" aria-label="清空最近本地文件" @click="localFiles.clear()">
            <Icon icon="lucide:x" width="13" />
          </button>
        </div>
        <button
          v-for="entry in recentLocalFiles"
          :key="entry.filePath"
          class="local-recent__item"
          :title="entry.filePath"
          @click="openLocalPath(entry.filePath)"
        >
          <Icon icon="lucide:file-video" width="14" />
          <span>{{ entry.name }}</span>
        </button>
      </div>

      <button
        class="nav-btn settings-btn"
        :class="{ active: route.name === 'settings' }"
        @click="gotoSettings()"
      >
        <Icon icon="lucide:settings" width="16" />
        <span>设置</span>
      </button>
    </section>

    <AddServerDialog
      v-if="showAdd"
      @close="showAdd = false"
      @created="
        (id, loggedIn) => {
          showAdd = false;
          router.push(loggedIn ? { name: 'home' } : { name: 'login', query: { server: id } });
        }
      "
    />
  </aside>
</template>

<style scoped>
.sb {
  width: var(--sidebar-w);
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--separator);
  border-radius: 0;
  padding: 8px 10px 12px;
  gap: 6px;
  background: var(--glass-bg);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  overflow: hidden;
  position: relative;
  z-index: 10;
}

.sb__brand {
  padding: 4px 4px 6px;
  border-bottom: 1px solid var(--separator);
  margin-bottom: 4px;
}
.brand-btn {
  appearance: none;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  color: inherit;
  width: 100%;
  padding: 6px;
  border-radius: 10px;
  transition: background 180ms var(--easing-glide);
}
.brand-btn:hover {
  background: rgba(255, 255, 255, 0.04);
}
.brand-btn__icon {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: linear-gradient(135deg, #0a84ff, #bf5aff);
  display: grid;
  place-items: center;
  color: white;
}
.brand-btn__text {
  text-align: left;
  line-height: 1.15;
}
.brand-btn__name {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.01em;
}
.brand-btn__ver {
  font-size: 11px;
  color: var(--fg-tertiary);
}

.sb__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--fg-secondary);
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  transition: background 160ms var(--easing-glide);
  position: relative;
  width: 100%;
}
.nav-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--fg-primary);
}
.nav-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.nav-btn .chev {
  margin-left: auto;
}
.nav-btn .badge {
  margin-left: auto;
  font-size: 10px;
  background: rgba(255, 255, 255, 0.12);
  color: var(--fg-primary);
  padding: 2px 7px;
  border-radius: 999px;
  font-weight: 700;
}
.nav-btn .badge.danger {
  background: var(--danger);
  color: white;
}

.sb__section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  padding-top: 8px;
}
.sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px 2px;
  font-size: 10px;
  color: var(--fg-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
}
.sec-head__actions {
  display: inline-flex;
  gap: 2px;
}
.iconbtn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--fg-secondary);
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  transition: background 160ms var(--easing-glide);
}
.iconbtn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--fg-primary);
}
.iconbtn.active {
  background: rgba(10, 132, 255, 0.18);
  color: var(--accent);
}

.visibility {
  margin: 4px 4px 4px;
  padding: 10px 10px 8px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--glass-border);
}
.visibility__title {
  font-size: 11px;
  color: var(--fg-tertiary);
  margin-bottom: 2px;
}
.visibility__empty {
  font-size: 12px;
  color: var(--fg-tertiary);
  padding: 4px 0;
}
.visibility__row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--fg-secondary);
  cursor: pointer;
  user-select: none;
}
.visibility__row input {
  accent-color: var(--accent);
}
.visibility__name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.srv-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow-y: auto;
  max-height: 44vh;
}
.srv-empty {
  padding: 14px 8px;
  font-size: 11px;
  color: var(--fg-tertiary);
  text-align: center;
  line-height: 1.5;
}
.srv-row {
  padding: 0;
  display: flex;
  align-items: center;
  gap: 2px;
}
.srv-row__minus {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--fg-tertiary);
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.srv-row__minus:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--fg-primary);
}
.srv-row__btn {
  appearance: none;
  border: none;
  background: transparent;
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 10px;
  align-items: center;
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 10px;
  cursor: pointer;
  width: 100%;
  color: inherit;
  text-align: left;
  transition: background 160ms var(--easing-glide);
}
.srv-row__btn:hover {
  background: rgba(255, 255, 255, 0.04);
}
.srv-row.is-active .srv-row__btn {
  background: rgba(10, 132, 255, 0.16);
}

.srv-row__avatar {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.04));
  border: 1px solid var(--glass-border);
  display: grid;
  place-items: center;
  font-size: 14px;
  font-weight: 700;
  color: var(--fg-primary);
}
.srv-row__dot {
  position: absolute;
  right: -3px;
  bottom: -3px;
}
.srv-row__text {
  min-width: 0;
}
.srv-row__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--fg-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.srv-row__sub {
  font-size: 11px;
  color: var(--fg-secondary);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.srv-row.is-active .srv-row__name {
  color: var(--accent);
}
.dim {
  color: var(--fg-tertiary);
}

.sb__flex {
  flex: 1;
  min-height: 8px;
}

.sb__bottom {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 6px;
  border-top: 1px solid var(--separator);
}

.add-srv {
  appearance: none;
  border: 1px dashed var(--glass-border-strong);
  background: transparent;
  color: var(--fg-secondary);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  margin-bottom: 4px;
  transition:
    background 160ms var(--easing-glide),
    border-color 160ms var(--easing-glide),
    color 160ms var(--easing-glide);
}
.add-srv:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(10, 132, 255, 0.06);
}
.add-srv.active {
  border-color: color-mix(in srgb, var(--accent) 60%, transparent);
  color: var(--accent);
  background: var(--accent-soft);
}

.local-recent {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 2px 0 5px;
}
.local-recent__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 1px 6px;
  color: var(--fg-tertiary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.local-recent__item {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--fg-secondary);
  display: grid;
  grid-template-columns: 16px 1fr;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 30px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  font-size: 12px;
  transition:
    background 160ms var(--easing-glide),
    color 160ms var(--easing-glide);
}
.local-recent__item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--fg-primary);
}
.local-recent__item span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-btn .chev {
  margin-left: auto;
}

.settings-cat {
  list-style: none;
  margin: 0 0 0 18px;
  padding: 4px 0 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-left: 1px solid var(--separator);
  padding-left: 6px;
}
.settings-cat__btn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--fg-secondary);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  width: 100%;
  text-align: left;
  font-size: 12px;
}
.settings-cat__btn:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--fg-primary);
}
.settings-cat__btn.active {
  color: var(--accent);
  background: rgba(10, 132, 255, 0.12);
}
</style>
