import { defineStore } from "pinia";
import { ref } from "vue";

import { api } from "@/api";
import { listen, type UnlistenFn } from "@/platform";
import type { DownloadTask } from "@/types/models";

export const useDownloadsStore = defineStore("downloads", () => {
  const tasks = ref<DownloadTask[]>([]);
  const loading = ref(false);

  const unlistens: UnlistenFn[] = [];

  function upsertLocal(task: Partial<DownloadTask> & { id: string }) {
    const idx = tasks.value.findIndex((t) => t.id === task.id);
    if (idx >= 0) {
      tasks.value[idx] = { ...tasks.value[idx], ...task } as DownloadTask;
    } else if ((task as DownloadTask).serverId) {
      tasks.value.unshift(task as DownloadTask);
    }
  }

  async function refresh() {
    loading.value = true;
    try {
      tasks.value = await api.listDownloads();
    } finally {
      loading.value = false;
    }
  }

  async function start(itemId: string, opts?: { stealth?: boolean; preferDirect?: boolean }) {
    const t = await api.startDownload({
      itemId,
      stealth: opts?.stealth ?? false,
      preferDirect: opts?.preferDirect ?? true,
    });
    upsertLocal(t);
    return t;
  }

  async function pause(id: string) {
    await api.pauseDownload(id);
  }
  async function resume(id: string) {
    await api.resumeDownload(id);
  }
  async function cancel(id: string) {
    await api.cancelDownload(id);
  }
  async function remove(id: string, deleteFile = false) {
    await api.removeDownload(id, deleteFile);
    tasks.value = tasks.value.filter((t) => t.id !== id);
  }

  async function startListening() {
    if (unlistens.length > 0) return;
    unlistens.push(
      await listen<{ id: string; downloadedBytes: number; totalBytes?: number | null }>(
        "download:progress",
        (e) => {
          upsertLocal({
            id: e.payload.id,
            downloadedBytes: e.payload.downloadedBytes,
            totalBytes: e.payload.totalBytes ?? null,
          } as any);
        },
      ),
    );
    unlistens.push(
      await listen<DownloadTask>("download:state", (e) => {
        upsertLocal(e.payload);
      }),
    );
  }
  function stopListening() {
    unlistens.splice(0).forEach((fn) => fn());
  }

  return {
    tasks,
    loading,
    refresh,
    start,
    pause,
    resume,
    cancel,
    remove,
    startListening,
    stopListening,
  };
});
