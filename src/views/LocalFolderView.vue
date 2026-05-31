<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

import { api, type LocalFolderListing, type LocalFolderVideo } from "@/api";
import { openFileDialog } from "@/platform";
import { useLocalFilesStore } from "@/stores/localFiles";
import { usePlayerStore } from "@/stores/player";

const route = useRoute();
const router = useRouter();
const localFiles = useLocalFilesStore();
const player = usePlayerStore();

const listing = ref<LocalFolderListing | null>(null);
const loading = ref(false);
const errorText = ref<string | null>(null);
const recursive = ref(false);

const folderPath = computed(() => {
  const value = route.query.folder;
  return typeof value === "string" && value.trim().length > 0 ? value : "";
});

const folderTitle = computed(() => {
  if (!folderPath.value) return "本地文件夹";
  return fileNameFromPath(folderPath.value) || folderPath.value;
});

const countLabel = computed(() => {
  const count = listing.value?.items.length ?? 0;
  if (listing.value?.truncated) return `${count}+ 个视频`;
  return `${count} 个视频`;
});
const recentFolders = computed(() => localFiles.folderItems.slice(0, 6));

function fileNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
}

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

function relativePathLabel(item: LocalFolderVideo): string {
  const value = item.relativePath?.trim();
  return value && value !== item.name ? value : "";
}

async function chooseFolder() {
  const selected = await openFileDialog({
    multiple: false,
    directory: true,
    title: "打开本地文件夹",
  }).catch(() => null);
  if (typeof selected !== "string" || selected.length === 0) return;
  openFolderPath(selected);
}

async function loadFolder(directory = folderPath.value) {
  if (!directory) {
    listing.value = null;
    errorText.value = null;
    return;
  }
  loading.value = true;
  errorText.value = null;
  try {
    listing.value = await api.listLocalFolder({ directory, recursive: recursive.value });
    localFiles.rememberFolder(listing.value.directory);
  } catch (error) {
    listing.value = null;
    errorText.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

function openFolderPath(folderPath: string) {
  localFiles.rememberFolder(folderPath);
  router.push({ name: "local-folder", query: { folder: folderPath } }).catch(() => {});
}

function openVideo(item: LocalFolderVideo, index: number) {
  const items = listing.value?.items ?? [];
  player.setLocalQueue(items.map((entry) => entry.filePath), index);
  localFiles.remember(item.filePath);
  router
    .push({
      name: "player",
      params: { id: "local-file" },
      query: { file: item.filePath, folder: listing.value?.directory ?? folderPath.value },
    })
    .catch(() => {});
}

watch(folderPath, (directory) => void loadFolder(directory), { immediate: true });
watch(recursive, () => {
  if (folderPath.value) void loadFolder();
});
</script>

<template>
  <section class="local-folder">
    <header class="local-folder__head">
      <div class="local-folder__title">
        <h1>{{ folderTitle }}</h1>
        <p v-if="folderPath" :title="folderPath">{{ folderPath }}</p>
      </div>
      <div class="local-folder__actions">
        <label v-if="folderPath" class="toggle">
          <input v-model="recursive" type="checkbox" />
          <span>包含子文件夹</span>
        </label>
        <button class="tool-btn" type="button" @click="chooseFolder">
          <Icon icon="lucide:folder-open" width="16" />
          <span>选择文件夹</span>
        </button>
        <button
          v-if="folderPath"
          class="icon-btn"
          type="button"
          :disabled="loading"
          title="刷新"
          @click="loadFolder()"
        >
          <Icon icon="lucide:refresh-cw" width="16" :class="{ spin: loading }" />
        </button>
      </div>
    </header>

    <div v-if="!folderPath" class="empty glass">
      <Icon icon="lucide:folder-open" width="36" />
      <button class="tool-btn" type="button" @click="chooseFolder">
        <Icon icon="lucide:folder-open" width="16" />
        <span>选择文件夹</span>
      </button>
      <div v-if="recentFolders.length > 0" class="recent-folders">
        <button
          v-for="entry in recentFolders"
          :key="entry.folderPath"
          class="recent-folder"
          type="button"
          :title="entry.folderPath"
          @click="openFolderPath(entry.folderPath)"
        >
          <Icon icon="lucide:folder" width="15" />
          <span>{{ entry.name }}</span>
        </button>
      </div>
    </div>

    <div v-else class="local-folder__body">
      <div class="folder-meta">
        <span>{{ countLabel }}</span>
        <span v-if="listing?.recursive">包含子文件夹</span>
        <span v-if="listing?.truncated" class="folder-meta__warning">仅显示前 500 个</span>
        <span v-if="loading">扫描中</span>
      </div>

      <div v-if="errorText" class="empty glass empty--error">
        <Icon icon="lucide:triangle-alert" width="32" />
        <strong>{{ errorText }}</strong>
      </div>

      <div v-else-if="loading" class="empty glass">
        <Icon icon="lucide:loader" width="32" class="spin" />
        <strong>扫描中</strong>
      </div>

      <div v-else-if="listing && listing.items.length === 0" class="empty glass">
        <Icon icon="lucide:file-question" width="32" />
        <strong>未找到视频文件</strong>
      </div>

      <ul v-else class="file-list">
        <li v-for="(item, index) in listing?.items ?? []" :key="item.filePath">
          <button class="file-row" type="button" :title="item.filePath" @click="openVideo(item, index)">
            <span class="file-row__icon">
              <Icon icon="lucide:file-video" width="18" />
            </span>
            <span class="file-row__main">
              <strong>{{ item.name }}</strong>
              <small v-if="listing?.recursive && relativePathLabel(item)" class="file-row__path">
                {{ relativePathLabel(item) }}
              </small>
              <small>
                {{ item.extension.toUpperCase() }} · {{ formatBytes(item.sizeBytes) }}
                <template v-if="formatDate(item.modifiedAtMs)">
                  · {{ formatDate(item.modifiedAtMs) }}
                </template>
              </small>
            </span>
            <Icon icon="lucide:play" width="17" class="file-row__play" />
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.local-folder {
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--surface-1);
}
.local-folder__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px var(--content-pad) 12px;
  border-bottom: 1px solid var(--separator);
  flex-shrink: 0;
}
.local-folder__title {
  min-width: 0;
}
.local-folder__title h1 {
  margin: 0;
  color: var(--fg-primary);
  font-size: 22px;
  font-weight: 700;
}
.local-folder__title p {
  margin: 6px 0 0;
  max-width: min(760px, 70vw);
  color: var(--fg-tertiary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.local-folder__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.toggle {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--fg-secondary);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.toggle input {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: var(--accent);
}
.tool-btn,
.icon-btn {
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
  font-weight: 600;
  transition:
    background 160ms var(--easing-glide),
    border-color 160ms var(--easing-glide),
    color 160ms var(--easing-glide);
}
.tool-btn {
  padding: 0 12px;
}
.icon-btn {
  width: 34px;
  padding: 0;
}
.tool-btn:hover,
.icon-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.icon-btn:disabled {
  opacity: 0.55;
  cursor: default;
}
.local-folder__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px var(--content-pad) 32px;
}
.folder-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  min-height: 24px;
  color: var(--fg-tertiary);
  font-size: 12px;
}
.folder-meta__warning {
  color: var(--warning, #fbbf24);
}
.file-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  max-width: 900px;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--separator);
}
.file-list li {
  min-width: 0;
}
.file-row {
  appearance: none;
  border: none;
  border-bottom: 1px solid var(--separator);
  background: transparent;
  color: inherit;
  width: 100%;
  min-height: 58px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 12px;
  padding: 9px 4px;
  text-align: left;
  cursor: pointer;
}
.file-row:hover {
  color: var(--accent);
}
.file-row__icon {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--fg-secondary);
  background: rgba(255, 255, 255, 0.05);
}
.file-row__main {
  min-width: 0;
}
.file-row__main strong,
.file-row__main small {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-row__main strong {
  color: var(--fg-primary);
  font-size: 14px;
}
.file-row__main small {
  margin-top: 4px;
  color: var(--fg-tertiary);
  font-size: 12px;
}
.file-row__main .file-row__path {
  color: var(--fg-secondary);
}
.file-row__play {
  color: var(--fg-tertiary);
}
.file-row:hover .file-row__play {
  color: var(--accent);
}
.empty {
  margin: 16px var(--content-pad);
  min-height: 220px;
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
.recent-folders {
  width: min(520px, 100%);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.recent-folder {
  appearance: none;
  border: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.04);
  color: var(--fg-secondary);
  min-width: 0;
  min-height: 34px;
  border-radius: 8px;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  cursor: pointer;
  text-align: left;
}
.recent-folder:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.recent-folder span {
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
@media (max-width: 720px) {
  .local-folder__head {
    flex-direction: column;
    align-items: stretch;
  }
  .local-folder__actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
  .local-folder__title p {
    max-width: 100%;
  }
  .recent-folders {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
