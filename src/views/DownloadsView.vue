<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

import GlassNavBar from "@/components/common/GlassNavBar.vue";
import GlassButton from "@/components/common/GlassButton.vue";
import { useDownloadsStore } from "@/stores/downloads";
import type { DownloadStatus, DownloadTask } from "@/types/models";

const downloads = useDownloadsStore();
const router = useRouter();

onMounted(() => downloads.refresh());

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
  router.push({ name: "player", params: { id: t.itemId }, query: { local: t.id } });
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
      <section v-for="(arr, key) in grouped" :key="key" v-show="arr.length > 0">
        <header class="row-head">
          <h2>
            {{ statusLabel(key as DownloadStatus) }}
            <span class="dim">· {{ arr.length }}</span>
          </h2>
        </header>
        <div class="list">
          <article v-for="t in arr" :key="t.id" class="task glass glass-strong">
            <div class="task__main">
              <div class="task__title">
                <span>{{ t.title }}</span>
                <span v-if="t.stealth" class="badge stealth">伪装</span>
              </div>
              <div class="task__sub">
                <span>{{ fmtBytes(t.downloadedBytes) }} / {{ fmtBytes(t.totalBytes ?? undefined) }}</span>
                <span v-if="pct(t) != null">{{ pct(t)!.toFixed(1) }}%</span>
                <span v-if="t.error" class="err">{{ t.error }}</span>
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
                <GlassButton size="sm" variant="ghost" @click="downloads.pause(t.id)">
                  <Icon icon="lucide:pause" width="14" />
                </GlassButton>
                <GlassButton size="sm" variant="ghost" @click="downloads.cancel(t.id)">
                  <Icon icon="lucide:square" width="14" />
                </GlassButton>
              </template>
              <template v-else-if="t.status === 'paused'">
                <GlassButton size="sm" variant="primary" @click="downloads.resume(t.id)">
                  <Icon icon="lucide:play" width="14" />
                </GlassButton>
              </template>
              <GlassButton
                v-if="t.status === 'completed'"
                size="sm"
                variant="primary"
                @click="play(t)"
              >
                <Icon icon="lucide:play" width="14" />
                本地播放
              </GlassButton>
              <GlassButton size="sm" variant="danger" @click="downloads.remove(t.id, false)">
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
}
.task__title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-primary);
}
.task__sub {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--fg-tertiary);
  margin-top: 4px;
}
.err {
  color: var(--danger);
}
.task__bar {
  margin-top: 10px;
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.06);
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
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
  justify-content: center;
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
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--fg-tertiary);
  padding: 60px;
}
</style>
