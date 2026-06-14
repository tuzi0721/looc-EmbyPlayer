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
  closeToTray: false,
  ignoreSslErrors: false,
  networkProxyMode: "system",
  httpProxyUrl: "",
  preferredAudioLanguage: "",
  preferredSubtitleLanguage: "",
  forceStereoAudio: false,
  danmakuEnabledDefault: true,
  danmakuScrollMaxRows: 5,
  danmakuTopMaxRows: 3,
  danmakuBottomMaxRows: 3,
  danmakuBold: false,
  danmakuRememberSelection: true,
  externalMpvEnabled: false,
  externalMpvPath: null,
  externalMpvUseProxy: false,
  externalPotplayerEnabled: false,
  externalPotplayerPath: null,
  markWatchedThresholdPct: 90,
  preferredVersionStrategy: "default",
  playerLogEnabled: false,
  mpvBackend: "embedded",
  externalPlayerPath: null,
  externalPlayerArgs: "",
  hardwareDecoding: true,
  hwdecMode: "auto",
  mpvCacheMb: 256,
  videoOutputDriver: "gpu-next",
  mpvCacheSecs: 0,
  lowQualityDecoding: false,
  hiddenServerIds: [],
  hideJavCodes: false,
  hideContinueWatching: false,
  showCoverRating: false,
  showNetworkSpeed: false,
  statsOverlayMode: "winui",
  blackoutOtherDisplays: false,
  preserveTrackSwitchCache: true,
  skipIntroOutroEnabled: false,
  skipIntroSeconds: 90,
  seekForwardSeconds: 10,
  seekBackwardSeconds: 10,
  longPressSpeedRate: 2.0,
  skipOutroSeconds: 90,
  screenshotIncludeSubtitles: true,
  appendAuthQuery: false,
  downloadDirectory: null,
  homeHeroStyle: "cinema",
  traktSyncEnabled: false,
  traktUsername: null,
  traktSyncWatched: true,
  traktSyncRatings: true,
  traktSyncFavorites: false,
  danmakuOpacity: 0.85,
  danmakuSpeed: 1,
  danmakuFontSize: 22,
  danmakuAvoidSubtitles: true,
  danmakuBottomReservePct: 18,
  subtitleScale: 1,
  subtitleTextColor: "#FFFFFF",
  subtitleOutlineColor: "#000000",
  subtitleOutlineSize: 1.65,
  subtitleShadowOffset: 0,
  subtitlePositionPct: 100,
  subtitleForceStyle: false,
  subtitleBold: false,
  subtitleSecondaryPositionPct: 0,
  anime4kMode: "off",
  danmakuApiBase: null,
};

function mergeSavedSettings(
  saved: AppSettings,
  patch: Partial<AppSettings> | null,
): AppSettings {
  return patch ? { ...saved, ...patch } : saved;
}

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS });
  const loading = ref(false);
  const saving = ref(false);
  let pendingPatch: Partial<AppSettings> | null = null;
  let updateDrain: Promise<void> | null = null;

  async function refresh() {
    loading.value = true;
    try {
      settings.value = await api.getSettings();
    } finally {
      loading.value = false;
    }
  }

  async function drainUpdates() {
    saving.value = true;
    try {
      while (pendingPatch) {
        const patch = pendingPatch;
        pendingPatch = null;
        const saved = await api.updateSettings(patch);

        // Keep any newer optimistic edits visible while the older request
        // finishes, then let the next loop persist them.
        settings.value = mergeSavedSettings(saved, pendingPatch);
      }
    } finally {
      saving.value = false;
      updateDrain = null;
    }
  }

  async function update(patch: Partial<AppSettings>) {
    // Optimistically reflect the user's latest edit immediately, then serialize
    // Tauri writes so repeated input events cannot pile up concurrent saves.
    settings.value = { ...settings.value, ...patch };
    pendingPatch = { ...(pendingPatch ?? {}), ...patch };
    updateDrain ??= drainUpdates();
    await updateDrain;
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

  // "auto" follows the OS theme; track it reactively so the app flips live
  // when the system theme changes.
  const prefersDarkQuery =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;
  const systemPrefersDark = ref(prefersDarkQuery?.matches ?? true);
  prefersDarkQuery?.addEventListener?.("change", (event) => {
    systemPrefersDark.value = event.matches;
  });

  watchEffect(() => {
    const theme = settings.value.theme;
    const root = document.documentElement;
    const light = theme === "light" || (theme === "auto" && !systemPrefersDark.value);
    if (light) root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");

    document.documentElement.style.setProperty(
      "--glass-blur",
      `${settings.value.blurStrength}px`,
    );
  });

  return { settings, loading, saving, refresh, update, isHidden, toggleHidden };
});
