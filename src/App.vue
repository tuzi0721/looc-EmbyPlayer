<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import TopBar from "./components/common/TopBar.vue";
import AppSidebar from "./components/common/AppSidebar.vue";
import NotificationCenter from "./components/common/NotificationCenter.vue";
import ToastStack from "./components/common/ToastStack.vue";
import { api } from "./api";
import { listen, platformType } from "./platform";
import { useAuthStore } from "./stores/auth";
import { useDownloadsStore } from "./stores/downloads";
import { useNotificationsStore } from "./stores/notifications";
import { usePlayerStore } from "./stores/player";
import { useServerStore } from "./stores/server";
import { useSettingsStore } from "./stores/settings";

const auth = useAuthStore();
const server = useServerStore();
const settings = useSettingsStore();
const downloads = useDownloadsStore();
const notifications = useNotificationsStore();
const player = usePlayerStore();
const router = useRouter();
const route = useRoute();
const bootstrapped = ref(false);
const sidebarCollapsed = ref(false);
const viewportWidth = ref(1280);

const isFullscreen = computed(() => Boolean(route.meta?.fullscreen));
const autoSidebarCollapsed = computed(() => viewportWidth.value < 900);
const effectiveSidebarCollapsed = computed(() => sidebarCollapsed.value || autoSidebarCollapsed.value);

function readSidebarCollapsed() {
  try {
    return window.localStorage.getItem("hills:sidebar-collapsed") === "1";
  } catch {
    return false;
  }
}

function persistSidebarCollapsed(value: boolean) {
  try {
    window.localStorage.setItem("hills:sidebar-collapsed", value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function toggleSidebarCollapsed() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
}

watch(sidebarCollapsed, persistSidebarCollapsed);

function updateViewportWidth() {
  viewportWidth.value = window.innerWidth;
}

function withBootstrapTimeout<T>(promise: Promise<T>, timeoutMs = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timer = null;
      reject(new Error(`bootstrap timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer != null) clearTimeout(timer);
  });
}

function ignoreBootstrapFailure<T>(promise: Promise<T>) {
  return withBootstrapTimeout(promise).catch(() => {});
}

watch(
  () => route.name,
  (name) => {
    if (name !== "player") {
      document.documentElement.classList.remove("embedded-player");
    }
  },
);

onMounted(async () => {
  updateViewportWidth();
  window.addEventListener("resize", updateViewportWidth);
  sidebarCollapsed.value = readSidebarCollapsed();
  try {
    if ((await platformType()) === "windows") {
      document.documentElement.classList.add("platform-windows");
    }
  } catch {
    /* ignore */
  }
  await Promise.all([
    ignoreBootstrapFailure(settings.refresh()),
    ignoreBootstrapFailure(server.refresh()),
    ignoreBootstrapFailure(auth.refresh()),
    ignoreBootstrapFailure(downloads.refresh()),
    ignoreBootstrapFailure(notifications.refresh()),
  ]);
  bootstrapped.value = true;
  server.startListening().catch(() => {});
  server.probeAllLines?.().catch(() => {});
  downloads.startListening().catch(() => {});
  notifications.startListening().catch(() => {});

  listen<string>("nav:goto", (e) => {
    const dest = e.payload;
    if (dest === "/notifications-open") {
      notifications.openCenter();
      return;
    }
    router.push(dest).catch(() => {});
  }).catch(() => {});

  listen("player:next_track", () => {
    void player.nextTrack();
  }).catch(() => {});
  listen("player:prev_track", () => {
    void player.prevTrack();
  }).catch(() => {});

  listen<string>("shortcut:trigger", async (e) => {
    const action = e.payload;
    try {
      if (action === "play_pause") {
        const snap = player.snapshot;
        if (snap?.paused) await player.resume();
        else await player.pause();
      } else if (action === "stop") {
        await player.stop();
      } else if (action === "next_track") {
        await player.nextTrack();
      } else if (action === "prev_track") {
        await player.prevTrack();
      }
    } catch {
      /* ignore */
    }
  }).catch(() => {});
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateViewportWidth);
});
</script>

<template>
  <div class="app-shell" :class="{ 'is-fullscreen': isFullscreen }">
    <div class="app-backdrop" />
    <AppSidebar
      v-if="!isFullscreen"
      class="app-sidebar"
      :collapsed="effectiveSidebarCollapsed"
      @toggle-collapsed="toggleSidebarCollapsed"
    />
    <div class="app-right" :class="{ 'is-fullscreen': isFullscreen }">
      <TopBar v-if="!isFullscreen" />
      <main class="app-main">
      <router-view v-slot="{ Component, route: r }">
        <transition :name="(r.meta?.transition as string) || 'fade'" mode="out-in">
          <component :is="Component" :key="r.fullPath" />
        </transition>
      </router-view>
    </main>
    </div>
    <NotificationCenter />
    <ToastStack />
  </div>
</template>

<style>
.app-shell {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
}
.app-shell.is-fullscreen {
  display: block;
}
.app-sidebar {
  flex-shrink: 0;
}
.app-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.app-right.is-fullscreen {
  width: 100%;
  height: 100%;
}
.app-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}
.app-shell.is-fullscreen .app-main,
.app-right.is-fullscreen .app-main {
  width: 100%;
  height: 100%;
}

/* Route transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 220ms var(--easing-glide);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.slide-up-enter-active,
.slide-up-leave-active {
  transition: opacity 220ms var(--easing-glide), transform 220ms var(--easing-glide);
}
.slide-up-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
