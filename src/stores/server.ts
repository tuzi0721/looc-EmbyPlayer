import { defineStore } from "pinia";
import { ref, computed } from "vue";

import { api } from "@/api";
import { listen, type UnlistenFn } from "@/platform";
import type { LineHealthReport, Server, ServerKind } from "@/types/models";

export const useServerStore = defineStore("server", () => {
  const servers = ref<Server[]>([]);
  const loading = ref(false);
  const lastReports = ref<Record<string, LineHealthReport[]>>({});

  function byId(id: string): Server | undefined {
    return servers.value.find((s) => s.id === id);
  }

  async function refresh() {
    loading.value = true;
    try {
      servers.value = await api.listServers();
    } finally {
      loading.value = false;
    }
  }

  async function addServer(payload: {
    name: string;
    kind: ServerKind;
    activeLineId?: string | null;
    lines: Array<{
      id?: string;
      name: string;
      baseUrl: string;
      userAgent?: string | null;
      headers?: [string, string][];
      priority?: number;
      enabled?: boolean;
    }>;
    defaultUserAgent?: string | null;
  }) {
    const s = await api.addServer(payload);
    await refresh();
    return s;
  }

  async function detectServer(payload: Parameters<typeof api.detectServer>[0]) {
    return api.detectServer(payload);
  }

  async function updateServer(payload: Parameters<typeof api.updateServer>[0]) {
    const s = await api.updateServer(payload);
    await refresh();
    return s;
  }

  async function removeServer(id: string) {
    await api.removeServer(id);
    await refresh();
  }

  async function testLines(serverId: string) {
    const r = await api.testLines(serverId);
    lastReports.value = { ...lastReports.value, [serverId]: r.reports };
    await refresh();
    return r;
  }

  async function probeAllLines() {
    const ids = servers.value.map((server) => server.id);
    if (ids.length === 0) return;

    const results = await Promise.allSettled(ids.map((id) => api.testLines(id)));
    const reports = { ...lastReports.value };
    let updated = false;
    results.forEach((result, index) => {
      const id = ids[index];
      if (!id || result.status !== "fulfilled") return;
      reports[id] = result.value.reports;
      updated = true;
    });
    if (!updated) return;

    lastReports.value = reports;
    await refresh();
  }

  async function setActiveLine(serverId: string, lineId: string) {
    await api.setActiveLine(serverId, lineId);
    await refresh();
  }

  const count = computed(() => servers.value.length);

  let unlisten: UnlistenFn | null = null;
  async function startListening() {
    if (unlisten) return;
    unlisten = await listen<{
      serverId: string;
      timestamp: string;
      reports: LineHealthReport[];
    }>("lines:health-tick", async (e) => {
      lastReports.value = {
        ...lastReports.value,
        [e.payload.serverId]: e.payload.reports,
      };
      await refresh();
    });
  }
  function stopListening() {
    unlisten?.();
    unlisten = null;
  }

  return {
    servers,
    loading,
    lastReports,
    count,
    byId,
    refresh,
    addServer,
    detectServer,
    updateServer,
    removeServer,
    testLines,
    probeAllLines,
    setActiveLine,
    startListening,
    stopListening,
  };
});
