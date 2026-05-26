import { defineStore } from "pinia";
import { ref, watchEffect } from "vue";

import { api } from "@/api";
import type { AppSettings } from "@/types/models";

const DEFAULT_SETTINGS: AppSettings = {
  heartbeatIntervalSecs: 180,
  healthCheckIntervalSecs: 60,
  raceTimeoutMs: 3500,
  requestTimeoutMs: 15000,
  defaultUserAgent: "Emby-Player/0.1 (Tauri; libmpv)",
  theme: "dark",
  blurStrength: 24,
  enableWindowVibrancy: true,
  mpvBackend: "ipc",
  mpvExecutablePath: null,
  hardwareDecoding: true,
  mpvCacheMb: 256,
  hiddenServerIds: [],
};

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS });
  const loading = ref(false);

  async function refresh() {
    loading.value = true;
    try {
      settings.value = await api.getSettings();
    } finally {
      loading.value = false;
    }
  }

  async function update(patch: Partial<AppSettings>) {
    settings.value = await api.updateSettings(patch);
  }

  function isHidden(serverId: string): boolean {
    return (settings.value.hiddenServerIds ?? []).includes(serverId);
  }

  async function toggleHidden(serverId: string, hidden: boolean) {
    const cur = new Set(settings.value.hiddenServerIds ?? []);
    if (hidden) cur.add(serverId);
    else cur.delete(serverId);
    await update({ hiddenServerIds: Array.from(cur) });
  }

  watchEffect(() => {
    const theme = settings.value.theme;
    const root = document.documentElement;
    if (theme === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");

    document.documentElement.style.setProperty(
      "--glass-blur",
      `${settings.value.blurStrength}px`,
    );
  });

  return { settings, loading, refresh, update, isHidden, toggleHidden };
});
