<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

import { api, type WebDavEntry, type WebDavListing } from "@/api";
import { usePlayerStore, type DirectQueueEntry } from "@/stores/player";
import { useWebDavStore } from "@/stores/webdav";

const route = useRoute();
const router = useRouter();
const player = usePlayerStore();
const webdav = useWebDavStore();

const selectedConnectionId = ref<string | null>(null);
const nameDraft = ref("");
const baseUrlDraft = ref("");
const usernameDraft = ref("");
const passwordDraft = ref("");
const rememberPassword = ref(false);
const listing = ref<WebDavListing | null>(null);
const loading = ref(false);
const playingUrl = ref<string | null>(null);
const errorText = ref<string | null>(null);

const currentPath = computed(() => {
  const value = route.query.path;
  return typeof value === "string" ? value : "";
});
const folderTitle = computed(() => {
  if (!currentPath.value) return "WebDAV";
  return currentPath.value.replace(/\/+$/, "").split("/").filter(Boolean).pop() ?? "WebDAV";
});
const directoryItems = computed(() => (listing.value?.items ?? []).filter((entry) => entry.isDirectory));
const playableItems = computed(() =>
  (listing.value?.items ?? []).filter((entry) => !entry.isDirectory && entry.playable),
);
const otherItems = computed(() =>
  (listing.value?.items ?? []).filter((entry) => !entry.isDirectory && !entry.playable),
);
const canLoad = computed(() => baseUrlDraft.value.trim().length > 0);
const selectedConnection = computed(() =>
  selectedConnectionId.value
    ? webdav.connections.find((entry) => entry.id === selectedConnectionId.value) ?? null
    : null,
);
const connectionFavorited = computed(() =>
  selectedConnection.value ? webdav.isFavorite(selectedConnection.value.id) : false,
);
const favoriteConnectionIds = computed(
  () => new Set(webdav.favoriteConnections.map((entry) => entry.id)),
);
const recentShortcutConnections = computed(() =>
  webdav.recentConnections
    .filter((entry) => !favoriteConnectionIds.value.has(entry.id))
    .slice(0, 4),
);

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function formatDate(ms?: number | null): string {
  if (!ms) return "";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return "";
  }
}

function parentPath(path: string): string {
  const parts = path.replace(/\/+$/, "").split("/").filter(Boolean);
  parts.pop();
  return parts.length > 0 ? `${parts.join("/")}/` : "";
}

function fillConnection(id: string | null) {
  const connection = id ? webdav.connections.find((entry) => entry.id === id) : null;
  selectedConnectionId.value = connection?.id ?? null;
  nameDraft.value = connection?.name ?? "";
  baseUrlDraft.value = connection?.baseUrl ?? "";
  usernameDraft.value = connection?.username ?? "";
  passwordDraft.value = connection?.password ?? "";
  rememberPassword.value = Boolean(connection?.password);
}

function selectConnection(id: string) {
  fillConnection(id);
  router.replace({ name: "webdav", query: { connection: id, path: "" } }).catch(() => {});
}

function toggleSelectedConnectionFavorite() {
  if (!selectedConnectionId.value) return;
  webdav.toggleFavorite(selectedConnectionId.value);
}

function newConnection() {
  selectedConnectionId.value = null;
  nameDraft.value = "";
  baseUrlDraft.value = "";
  usernameDraft.value = "";
  passwordDraft.value = "";
  rememberPassword.value = false;
  listing.value = null;
  errorText.value = null;
  router.replace({ name: "webdav" }).catch(() => {});
}

async function connectAndLoad(path = currentPath.value) {
  if (!canLoad.value || loading.value) return;
  loading.value = true;
  errorText.value = null;
  try {
    const connection = webdav.upsert({
      id: selectedConnectionId.value,
      name: nameDraft.value,
      baseUrl: baseUrlDraft.value,
      username: usernameDraft.value,
      password: passwordDraft.value,
      rememberPassword: rememberPassword.value,
    });
    selectedConnectionId.value = connection.id;
    listing.value = await api.listWebDavFolder({
      baseUrl: connection.baseUrl,
      path,
      username: usernameDraft.value || null,
      password: passwordDraft.value || null,
    });
    webdav.touch(connection.id);
    router
      .replace({ name: "webdav", query: { connection: connection.id, path: listing.value.path } })
      .catch(() => {});
  } catch (error) {
    listing.value = null;
    errorText.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

function openDirectory(entry: WebDavEntry) {
  router
    .push({ name: "webdav", query: { connection: selectedConnectionId.value ?? "", path: entry.path } })
    .catch(() => {});
}

function goUp() {
  router
    .push({
      name: "webdav",
      query: { connection: selectedConnectionId.value ?? "", path: parentPath(currentPath.value) },
    })
    .catch(() => {});
}

async function playEntry(entry: WebDavEntry) {
  if (!entry.playable || playingUrl.value) return;
  playingUrl.value = entry.url;
  errorText.value = null;
  try {
    const queue = playableItems.value.map((item): DirectQueueEntry => ({
      url: item.url,
      title: item.name,
      sourceLabel: "WebDAV",
      username: usernameDraft.value || null,
      password: passwordDraft.value || null,
    }));
    const startIndex = Math.max(0, queue.findIndex((item) => item.url === entry.url));
    player.setDirectQueue(queue, startIndex);
    await player.playWebDavFile({
      url: entry.url,
      title: entry.name,
      sourceLabel: "WebDAV",
      username: usernameDraft.value || null,
      password: passwordDraft.value || null,
    });
    router
      .push({
        name: "player",
        params: { id: "webdav-file" },
        query: {
          connection: selectedConnectionId.value ?? "",
          webdavPath: currentPath.value,
        },
      })
      .catch(() => {});
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error);
  } finally {
    playingUrl.value = null;
  }
}

function forgetConnection(id: string) {
  webdav.remove(id);
  if (selectedConnectionId.value === id) newConnection();
}

watch(
  () => route.query.connection,
  (value) => {
    const id = typeof value === "string" ? value : null;
    if (id && id !== selectedConnectionId.value) fillConnection(id);
  },
  { immediate: true },
);

watch(currentPath, (path, previous) => {
  if (path === previous) return;
  if (canLoad.value) void connectAndLoad(path);
});

onMounted(() => {
  const hasConnectionQuery = typeof route.query.connection === "string" && route.query.connection.length > 0;
  if (!selectedConnectionId.value && webdav.recentConnections.length > 0) {
    fillConnection(webdav.recentConnections[0]!.id);
  }
  if (hasConnectionQuery && canLoad.value) {
    void connectAndLoad(currentPath.value);
  }
});
</script>

<template>
  <section class="webdav">
    <header class="webdav__head">
      <div class="webdav__title">
        <h1>{{ folderTitle }}</h1>
        <p v-if="listing?.directoryUrl" :title="listing.directoryUrl">{{ listing.directoryUrl }}</p>
      </div>
      <div class="webdav__actions">
        <button
          v-if="selectedConnection"
          class="icon-btn favorite-connection-btn"
          :class="{ active: connectionFavorited }"
          type="button"
          :title="connectionFavorited ? '取消收藏 WebDAV' : '收藏 WebDAV'"
          :aria-pressed="connectionFavorited"
          @click="toggleSelectedConnectionFavorite"
        >
          <Icon icon="lucide:star" width="16" />
        </button>
        <button v-if="currentPath" class="icon-btn" type="button" title="上一级" @click="goUp">
          <Icon icon="lucide:corner-up-left" width="16" />
        </button>
        <button class="icon-btn" type="button" :disabled="loading || !canLoad" title="刷新" @click="connectAndLoad()">
          <Icon icon="lucide:refresh-cw" width="16" :class="{ spin: loading }" />
        </button>
      </div>
    </header>

    <div class="webdav__body">
      <aside class="webdav-config glass">
        <div class="config-head">
          <strong>WebDAV</strong>
          <button class="link-btn" type="button" @click="newConnection">新建</button>
        </div>

        <div v-if="webdav.recentConnections.length > 0" class="connection-list">
          <button
            v-for="connection in webdav.recentConnections"
            :key="connection.id"
            class="connection-pill"
            :class="{ active: connection.id === selectedConnectionId }"
            type="button"
            :title="connection.baseUrl"
            @click="selectConnection(connection.id)"
          >
            <Icon icon="lucide:cloud" width="14" />
            <span>{{ connection.name }}</span>
          </button>
        </div>

        <label class="field">
          <span>名称</span>
          <input v-model="nameDraft" class="plain-input" placeholder="WebDAV" />
        </label>
        <label class="field">
          <span>URL</span>
          <input v-model="baseUrlDraft" class="plain-input" placeholder="https://example.com/dav/" />
        </label>
        <label class="field">
          <span>用户名</span>
          <input v-model="usernameDraft" class="plain-input" autocomplete="username" />
        </label>
        <label class="field">
          <span>密码</span>
          <input
            v-model="passwordDraft"
            class="plain-input"
            type="password"
            autocomplete="current-password"
          />
        </label>
        <label class="check-row">
          <input v-model="rememberPassword" type="checkbox" />
          <span>保存凭据</span>
        </label>
        <div class="config-actions">
          <button class="tool-btn" type="button" :disabled="loading || !canLoad" @click="connectAndLoad('')">
            <Icon icon="lucide:plug-zap" width="16" />
            <span>{{ loading ? "连接中" : "连接" }}</span>
          </button>
          <button
            v-if="selectedConnectionId"
            class="tool-btn tool-btn--danger"
            type="button"
            @click="forgetConnection(selectedConnectionId)"
          >
            <Icon icon="lucide:trash-2" width="16" />
          </button>
        </div>
      </aside>

      <main class="webdav-list">
        <div v-if="errorText" class="empty glass empty--error">
          <Icon icon="lucide:triangle-alert" width="32" />
          <strong>{{ errorText }}</strong>
        </div>

        <div v-else-if="loading" class="empty glass">
          <Icon icon="lucide:loader" width="32" class="spin" />
          <strong>读取目录中</strong>
        </div>

        <div v-else-if="!listing" class="empty glass">
          <Icon icon="lucide:cloud" width="36" />
          <strong>选择或填写 WebDAV 连接</strong>
          <div v-if="webdav.favoriteConnections.length > 0" class="shortcut-block">
            <span>收藏 WebDAV</span>
            <div class="shortcut-list">
              <button
                v-for="connection in webdav.favoriteConnections.slice(0, 4)"
                :key="connection.id"
                class="shortcut-pill"
                type="button"
                :title="connection.baseUrl"
                @click="selectConnection(connection.id)"
              >
                <Icon icon="lucide:star" width="14" />
                <span>{{ connection.name }}</span>
              </button>
            </div>
          </div>
          <div v-if="recentShortcutConnections.length > 0" class="shortcut-block">
            <span>最近 WebDAV</span>
            <div class="shortcut-list">
              <button
                v-for="connection in recentShortcutConnections"
                :key="connection.id"
                class="shortcut-pill"
                type="button"
                :title="connection.baseUrl"
                @click="selectConnection(connection.id)"
              >
                <Icon icon="lucide:cloud" width="14" />
                <span>{{ connection.name }}</span>
              </button>
            </div>
          </div>
        </div>

        <div v-else-if="listing.items.length === 0" class="empty glass">
          <Icon icon="lucide:file-question" width="32" />
          <strong>目录为空</strong>
        </div>

        <ul v-else class="entry-list">
          <li v-for="entry in directoryItems" :key="entry.url">
            <button class="entry-row" type="button" :title="entry.url" @click="openDirectory(entry)">
              <Icon icon="lucide:folder" width="18" />
              <span>
                <strong>{{ entry.name }}</strong>
                <small>{{ formatDate(entry.modifiedAtMs) || "目录" }}</small>
              </span>
              <Icon icon="lucide:chevron-right" width="16" />
            </button>
          </li>
          <li v-for="entry in playableItems" :key="entry.url">
            <button
              class="entry-row"
              type="button"
              :title="entry.url"
              :disabled="playingUrl === entry.url"
              @click="playEntry(entry)"
            >
              <Icon icon="lucide:file-video" width="18" />
              <span>
                <strong>{{ entry.name }}</strong>
                <small>
                  {{ entry.extension.toUpperCase() }} · {{ formatBytes(entry.sizeBytes) }}
                  <template v-if="formatDate(entry.modifiedAtMs)">
                    · {{ formatDate(entry.modifiedAtMs) }}
                  </template>
                </small>
              </span>
              <Icon :icon="playingUrl === entry.url ? 'lucide:loader' : 'lucide:play'" width="16" :class="{ spin: playingUrl === entry.url }" />
            </button>
          </li>
          <li v-for="entry in otherItems" :key="entry.url">
            <div class="entry-row entry-row--muted" :title="entry.url">
              <Icon icon="lucide:file" width="18" />
              <span>
                <strong>{{ entry.name }}</strong>
                <small>{{ entry.extension || entry.contentType || "文件" }} · {{ formatBytes(entry.sizeBytes) }}</small>
              </span>
            </div>
          </li>
        </ul>
      </main>
    </div>
  </section>
</template>

<style scoped>
.webdav {
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--surface-1);
}
.webdav__head {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px var(--content-pad) 12px;
  border-bottom: 1px solid var(--separator);
}
.webdav__title {
  min-width: 0;
}
.webdav__title h1 {
  margin: 0;
  color: var(--fg-primary);
  font-size: 22px;
  font-weight: 700;
}
.webdav__title p {
  margin: 6px 0 0;
  max-width: min(760px, 68vw);
  color: var(--fg-tertiary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.webdav__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.webdav__body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 14px;
  padding: 14px var(--content-pad) 32px;
  overflow: hidden;
}
.webdav-config {
  min-height: 0;
  overflow-y: auto;
  border-radius: 8px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.config-head,
.config-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.config-head strong {
  color: var(--fg-primary);
  font-size: 15px;
}
.connection-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.connection-pill {
  appearance: none;
  min-width: 0;
  max-width: 100%;
  border: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.04);
  color: var(--fg-secondary);
  border-radius: 8px;
  min-height: 30px;
  display: inline-grid;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  cursor: pointer;
}
.connection-pill.active,
.connection-pill:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.connection-pill span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.field {
  display: grid;
  gap: 6px;
}
.field span,
.check-row {
  color: var(--fg-secondary);
  font-size: 12px;
  font-weight: 700;
}
.plain-input {
  min-width: 0;
  width: 100%;
  height: 34px;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--fg-primary);
  padding: 0 10px;
  outline: none;
}
.plain-input:focus {
  border-color: var(--accent);
}
.check-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.check-row input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--accent);
}
.webdav-list {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}
.entry-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-width: 900px;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--separator);
}
.entry-row {
  width: 100%;
  min-height: 56px;
  border: none;
  border-bottom: 1px solid var(--separator);
  appearance: none;
  background: transparent;
  color: var(--fg-secondary);
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  text-align: left;
  cursor: pointer;
}
.entry-row:hover:not(:disabled) {
  color: var(--accent);
}
.entry-row:disabled {
  cursor: default;
  opacity: 0.7;
}
.entry-row--muted {
  cursor: default;
  opacity: 0.58;
}
.entry-row span {
  min-width: 0;
}
.entry-row strong,
.entry-row small {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.entry-row strong {
  color: var(--fg-primary);
  font-size: 14px;
}
.entry-row small {
  margin-top: 4px;
  color: var(--fg-tertiary);
  font-size: 12px;
}
.tool-btn,
.icon-btn,
.link-btn {
  appearance: none;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  color: var(--fg-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 34px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
}
.tool-btn {
  flex: 1;
  padding: 0 12px;
}
.tool-btn--danger,
.icon-btn,
.link-btn {
  flex: 0 0 auto;
  min-width: 34px;
  padding: 0 10px;
}
.tool-btn:hover:not(:disabled),
.icon-btn:hover:not(:disabled),
.link-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.tool-btn--danger:hover:not(:disabled) {
  border-color: var(--danger);
  color: var(--danger);
}
.tool-btn:disabled,
.icon-btn:disabled {
  opacity: 0.55;
  cursor: default;
}
.favorite-connection-btn {
  color: var(--fg-secondary);
}
.favorite-connection-btn.active {
  color: #fbbf24;
}
.empty {
  min-height: 260px;
  max-width: 900px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 14px;
  color: var(--fg-tertiary);
  border-radius: 8px;
}
.empty strong {
  max-width: 520px;
  color: var(--fg-secondary);
  font-size: 13px;
  text-align: center;
}
.empty--error {
  color: var(--danger);
}
.shortcut-block {
  width: min(520px, 100%);
  display: grid;
  gap: 8px;
}
.shortcut-block > span {
  justify-self: start;
  color: var(--fg-tertiary);
  font-size: 11px;
  font-weight: 700;
}
.shortcut-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
}
.shortcut-pill {
  appearance: none;
  min-width: 0;
  min-height: 34px;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--fg-secondary);
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  cursor: pointer;
  text-align: left;
}
.shortcut-pill:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.shortcut-pill span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 920px) {
  .webdav__body {
    grid-template-columns: minmax(0, 1fr);
    overflow-y: auto;
  }
  .webdav-config,
  .webdav-list {
    overflow: visible;
  }
  .shortcut-list {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
