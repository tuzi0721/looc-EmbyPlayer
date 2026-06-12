<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

import GlassNavBar from "@/components/common/GlassNavBar.vue";
import GlassButton from "@/components/common/GlassButton.vue";
import { api } from "@/api";
import { useDownloadsStore } from "@/stores/downloads";
import type { DownloadStatus, DownloadTask } from "@/types/models";

const downloads = useDownloadsStore();
const route = useRoute();
const router = useRouter();
const actionBusy = ref<string | null>(null);
const errorText = ref<string | null>(null);
const autoPlayTriggeredForId = ref<string | null>(null);

const highlightedTaskId = computed(() =>
  typeof route.query.task === "string" && route.query.task.trim()
    ? route.query.task.trim()
    : null,
);
const autoPlayHighlighted = computed(() => route.query.autoplay === "1");
const highlightedTask = computed(() =>
  highlightedTaskId.value
    ? downloads.tasks.find((task) => task.id === highlightedTaskId.value) ?? null
    : null,
);

function scrollToHighlightedTask() {
  const id = highlightedTaskId.value;
  if (!id) return;
  const el = Array.from(document.querySelectorAll<HTMLElement>("[data-task-id]")).find(
    (node) => node.dataset.taskId === id,
  );
  el?.scrollIntoView({ block: "center", behavior: "smooth" });
}

onMounted(async () => {
  await downloads.refresh();
  await nextTick();
  scrollToHighlightedTask();
});

watch(
  () => [highlightedTaskId.value, downloads.tasks.length],
  async () => {
    await nextTick();
    scrollToHighlightedTask();
  },
);

watch(
  () => highlightedTaskId.value,
  () => {
    autoPlayTriggeredForId.value = null;
  },
);

const grouped = computed(() => {
  const groups: Record<DownloadStatus, DownloadTask[]> = {
    running: [],
    paused: [],
    pending: [],
    completed: [],
    failed: [],
    cancelled: [],
  };
  for (const t of downloads.tasks) groups[t.status]?.push(t);
  return groups;
});

function fmtBytes(n: number | null | undefined) {
  if (n == null) return "?";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

function pct(t: DownloadTask) {
  if (!t.totalBytes) return null;
  return Math.min(100, (t.downloadedBytes / t.totalBytes) * 100);
}

async function play(t: DownloadTask) {
  await router.push({
    name: "player",
    params: { id: t.itemId },
    query: {
      local: t.id,
      account: t.accountId,
      server: t.serverId,
    },
  });
}

watch(
  () => ({
    autoPlay: autoPlayHighlighted.value,
    taskId: highlightedTask.value?.id ?? null,
    status: highlightedTask.value?.status ?? null,
  }),
  async ({ autoPlay, taskId, status }) => {
    if (!autoPlay || !taskId || status !== "completed") return;
    if (autoPlayTriggeredForId.value === taskId) return;
    const task = highlightedTask.value;
    if (!task) return;
    autoPlayTriggeredForId.value = taskId;
    await play(task);
  },
  { immediate: true },
);

function fileNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
}

function dirNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index > 0 ? filePath.slice(0, index) : filePath;
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runTaskAction(key: string, action: () => Promise<void>) {
  if (actionBusy.value) return;
  actionBusy.value = key;
  errorText.value = null;
  try {
    await action();
  } catch (error) {
    errorText.value = stringifyError(error);
  } finally {
    actionBusy.value = null;
  }
}

async function retry(t: DownloadTask) {
  await runTaskAction(`retry:${t.id}`, () => downloads.resume(t.id));
}

async function pause(t: DownloadTask) {
  await runTaskAction(`pause:${t.id}`, () => downloads.pause(t.id));
}

async function resume(t: DownloadTask) {
  await runTaskAction(`resume:${t.id}`, () => downloads.resume(t.id));
}

async function cancel(t: DownloadTask) {
  await runTaskAction(`cancel:${t.id}`, () => downloads.cancel(t.id));
}

async function remove(t: DownloadTask, deleteFile = false) {
  await runTaskAction(`remove:${t.id}:${deleteFile ? "file" : "record"}`, () =>
    downloads.remove(t.id, deleteFile),
  );
}

async function openFolder(t: DownloadTask) {
  if (!t.filePath) return;
  await runTaskAction(`folder:${t.id}`, () => api.openPath(dirNameFromPath(t.filePath)));
}

function statusLabel(s: DownloadStatus) {
  return {
    pending: "等待中",
    running: "下载中",
    paused: "已暂停",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
  }[s];
}
</script>

<template>
  <main class="dl">
    <GlassNavBar show-back title="下载" />

    <div class="content">
      <p v-if="errorText" class="error glass glass-strong">{{ errorText }}</p>

      <section v-for="(arr, key) in grouped" :key="key" v-show="arr.length > 0">
        <header class="row-head">
          <h2>
            {{ statusLabel(key as DownloadStatus) }}
            <span class="dim">· {{ arr.length }}</span>
          </h2>
        </header>
        <div class="list">
          <article
            v-for="t in arr"
            :key="t.id"
            class="task glass glass-strong"
            :class="{ highlighted: t.id === highlightedTaskId }"
            :data-task-id="t.id"
          >
            <div class="task__main">
              <div class="task__title">
                <span>{{ t.title }}</span>
                <span
                  v-if="autoPlayHighlighted && t.id === highlightedTaskId && t.status !== 'completed'"
                  class="badge autoplay"
                >
                  完成后播放
                </span>
                <span v-if="t.stealth" class="badge stealth">伪装</span>
              </div>
              <div class="task__sub">
                <span>{{ fmtBytes(t.downloadedBytes) }} / {{ fmtBytes(t.totalBytes ?? undefined) }}</span>
                <span v-if="pct(t) != null">{{ pct(t)!.toFixed(1) }}%</span>
                <span v-if="t.error" class="err">{{ t.error }}</span>
              </div>
              <div v-if="t.filePath" class="task__path" :title="t.filePath">
                {{ fileNameFromPath(t.filePath) }}
              </div>
              <div class="task__bar">
                <span
                  :style="{
                    width: `${pct(t) ?? (t.status === 'completed' ? 100 : 0)}%`,
                  }"
                  :class="{
                    indet: pct(t) == null && t.status === 'running',
                    done: t.status === 'completed',
                    err: t.status === 'failed',
                  }"
                />
              </div>
            </div>
            <div class="task__actions">
              <template v-if="t.status === 'running'">
                <GlassButton
                  size="sm"
                  variant="ghost"
                  title="暂停"
                  :loading="actionBusy === `pause:${t.id}`"
                  @click="pause(t)"
                >
                  <Icon icon="lucide:pause" width="14" />
                </GlassButton>
                <GlassButton
                  size="sm"
                  variant="ghost"
                  title="取消"
                  :loading="actionBusy === `cancel:${t.id}`"
                  @click="cancel(t)"
                >
                  <Icon icon="lucide:square" width="14" />
                </GlassButton>
              </template>
              <template v-else-if="t.status === 'paused'">
                <GlassButton
                  size="sm"
                  variant="primary"
                  title="继续"
                  :loading="actionBusy === `resume:${t.id}`"
                  @click="resume(t)"
                >
                  <Icon icon="lucide:play" width="14" />
                </GlassButton>
              </template>
              <GlassButton
                v-else-if="t.status === 'failed' || t.status === 'cancelled'"
                size="sm"
                variant="primary"
                title="重试"
                :loading="actionBusy === `retry:${t.id}`"
                @click="retry(t)"
              >
                <Icon icon="lucide:rotate-ccw" width="14" />
              </GlassButton>
              <GlassButton
                v-if="t.status === 'completed'"
                size="sm"
                variant="primary"
                title="本地播放"
                @click="play(t)"
              >
                <Icon icon="lucide:play" width="14" />
                本地播放
              </GlassButton>
              <GlassButton
                v-if="t.filePath"
                size="sm"
                variant="ghost"
                title="打开所在目录"
                :loading="actionBusy === `folder:${t.id}`"
                @click="openFolder(t)"
              >
                <Icon icon="lucide:folder-open" width="14" />
              </GlassButton>
              <GlassButton
                size="sm"
                variant="ghost"
                title="移除记录"
                :loading="actionBusy === `remove:${t.id}:record`"
                @click="remove(t, false)"
              >
                <Icon icon="lucide:x" width="14" />
              </GlassButton>
              <GlassButton
                v-if="t.filePath"
                size="sm"
                variant="danger"
                title="删除文件和记录"
                :loading="actionBusy === `remove:${t.id}:file`"
                @click="remove(t, true)"
              >
                <Icon icon="lucide:trash-2" width="14" />
              </GlassButton>
            </div>
          </article>
        </div>
      </section>

      <div v-if="downloads.tasks.length === 0" class="empty">
        <Icon icon="lucide:download" width="22" />
        <span>还没有下载任务</span>
      </div>
    </div>
  </main>
</template>

<style scoped>
.dl {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px var(--content-pad) 40px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.row-head h2 {
  margin: 0 0 10px;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--fg-secondary);
  font-weight: 700;
}
.dim {
  color: var(--fg-tertiary);
  font-weight: 500;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.task {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  padding: 16px 18px;
  border-radius: 18px;
  min-width: 0;
}
.task.highlighted {
  border-color: color-mix(in srgb, var(--accent) 62%, var(--glass-border));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--accent) 46%, transparent),
    0 18px 52px rgba(168, 85, 247, 0.18);
}
.task__main {
  min-width: 0;
}
.task__title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-primary);
  min-width: 0;
}
.task__title span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task__sub {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--fg-tertiary);
  margin-top: 4px;
}
.task__path {
  margin-top: 5px;
  max-width: 100%;
  color: var(--fg-tertiary);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.err {
  color: var(--danger);
}
.error {
  margin: 0;
  padding: 12px 14px;
  color: var(--danger);
  font-size: 13px;
  border-radius: 14px;
}
.task__bar {
  margin-top: 10px;
  width: 100%;
  height: 4px;
  background: var(--surface-subtle);
  border-radius: 999px;
  overflow: hidden;
}
.task__bar span {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 240ms var(--easing-glide);
}
.task__bar span.done {
  background: var(--success);
}
.task__bar span.err {
  background: var(--danger);
}
.task__bar span.indet {
  width: 30% !important;
  animation: indet 1.4s linear infinite;
}
@keyframes indet {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(300%);
  }
}
.task__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: flex-end;
  justify-content: center;
  max-width: 168px;
}
.badge.stealth {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 159, 10, 0.18);
  color: #ff9f0a;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.badge.autoplay {
  flex: 0 0 auto;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent-strong);
  font-weight: 700;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--fg-tertiary);
  padding: 60px;
}
@media (max-width: 720px) {
  .task {
    grid-template-columns: 1fr;
  }
  .task__actions {
    max-width: none;
    justify-content: flex-start;
  }
}
</style>
