<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

import { useAuthStore } from "@/stores/auth";
import { useServerStore } from "@/stores/server";
import { useSettingsStore } from "@/stores/settings";
import LineStatusDot from "@/components/common/LineStatusDot.vue";
import { serverActiveLine, serverKindIcon, serverKindLabel } from "@/utils/serverVisuals";

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const serverStore = useServerStore();
const settings = useSettingsStore();

const props = defineProps<{
  collapsed?: boolean;
  overlay?: boolean;
}>();

const emit = defineEmits<{
  "toggle-collapsed": [];
}>();

const hiddenIds = computed(() => settings.settings.hiddenServerIds ?? []);
const visibleServers = computed(() =>
  serverStore.servers.filter((s) => !hiddenIds.value.includes(s.id)),
);

const activeServerId = computed(() => auth.activeAccount?.serverId ?? null);
const isCollapsed = computed(() => props.collapsed === true);
const isOverlay = computed(() => props.overlay === true);

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
</script>

<template>
  <aside class="sb glass" :class="{ 'is-collapsed': isCollapsed, 'is-overlay': isOverlay }">
    <header class="sb__brand">
      <button
        class="brand-menu"
        type="button"
        :aria-label="isCollapsed ? '展开边栏' : '折叠边栏'"
        :aria-expanded="!isCollapsed"
        :title="isCollapsed ? '展开边栏' : '折叠边栏'"
        @click="emit('toggle-collapsed')"
      >
        <Icon icon="lucide:menu" width="18" class="brand-btn__menu" />
      </button>
      <button class="brand-home" type="button" @click="gotoHome">
        <span class="brand-btn__name">Hills Lite</span>
      </button>
    </header>

    <nav class="sb__nav">
      <button
        class="nav-btn"
        :class="{ active: route.name === 'home' }"
        :title="isCollapsed ? '首页' : undefined"
        @click="gotoHome"
      >
        <Icon icon="lucide:home" width="16" />
        <span>首页</span>
      </button>
      <button
        class="nav-btn"
        :class="{ active: route.name === 'favorites' }"
        :title="isCollapsed ? '收藏' : undefined"
        @click="gotoFavorites"
      >
        <Icon icon="lucide:heart" width="16" />
        <span>收藏</span>
      </button>
      <button
        class="nav-btn"
        :class="{ active: route.name === 'history' }"
        :title="isCollapsed ? '历史' : undefined"
        @click="gotoHistory"
      >
        <Icon icon="lucide:history" width="16" />
        <span>历史</span>
      </button>
      <button
        class="nav-btn"
        :class="{ active: route.name === 'aggregate' }"
        :title="isCollapsed ? '聚合视界' : undefined"
        @click="gotoAggregate"
      >
        <Icon icon="lucide:infinity" width="16" />
        <span>聚合视界</span>
      </button>
    </nav>

    <section class="sb__section">
      <header class="sec-head">
        <span>服务器</span>
      </header>

      <ul class="srv-list">
        <li
          v-for="s in visibleServers"
          :key="s.id"
          class="srv-row"
          :class="{ 'is-active': s.id === activeServerId }"
        >
          <button class="srv-row__btn" :title="isCollapsed ? s.name : undefined" @click="pickServer(s.id)">
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
        </li>
        <li
          v-if="visibleServers.length === 0 && serverStore.servers.length === 0"
          class="srv-empty"
        >
          还没有服务器
        </li>
        <li
          v-else-if="visibleServers.length === 0"
          class="srv-empty"
        >
          服务器已隐藏，可在设置中恢复显示。
        </li>
      </ul>
    </section>

    <div class="sb__flex" />

    <section class="sb__bottom">
      <button
        class="nav-btn settings-btn"
        :class="{ active: route.name === 'settings' }"
        :title="isCollapsed ? '设置' : undefined"
        @click="gotoSettings()"
      >
        <Icon icon="lucide:settings" width="16" />
        <span>设置</span>
      </button>
    </section>
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
  transition: width 180ms var(--easing-glide), padding 180ms var(--easing-glide);
}
.sb.is-collapsed {
  width: 64px;
  padding: 8px 7px 12px;
}
.sb.is-overlay {
  width: var(--sidebar-w);
  padding: 8px 10px 12px;
}

.sb__brand {
  padding: 4px 4px 6px;
  border-bottom: 1px solid var(--separator);
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.brand-menu,
.brand-home {
  appearance: none;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  cursor: pointer;
  color: inherit;
  padding: 6px;
  border-radius: 10px;
  transition: background 180ms var(--easing-glide);
}
.brand-menu {
  width: 32px;
  height: 32px;
  justify-content: center;
  flex-shrink: 0;
}
.brand-home {
  min-width: 0;
  flex: 1;
  justify-content: flex-start;
}
.brand-menu:hover,
.brand-home:hover {
  background: rgba(255, 255, 255, 0.04);
}
.sb.is-collapsed .brand-home {
  display: none;
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
  font-weight: 600;
}
/* Left accent indicator on the active nav item. */
.nav-btn.active::before {
  content: "";
  position: absolute;
  left: 2px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  border-radius: var(--r-pill);
  background: var(--accent);
}
.sb.is-collapsed .nav-btn.active::before {
  left: 4px;
  height: 50%;
}
.sb.is-collapsed .nav-btn {
  justify-content: center;
  gap: 0;
  padding: 8px 0;
  min-height: 36px;
}
.sb.is-collapsed .nav-btn span,
.sb.is-collapsed .sec-head,
.sb.is-collapsed .srv-row__text,
.sb.is-collapsed .srv-empty {
  display: none;
}
.nav-btn .chev {
  margin-left: auto;
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
  justify-content: flex-start;
  padding: 4px 6px 2px;
  font-size: 10px;
  color: var(--fg-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
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
.sb.is-collapsed .srv-list {
  align-items: center;
  max-height: 48vh;
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
.sb.is-collapsed .srv-row,
.sb.is-collapsed .srv-row__btn {
  width: 40px;
}
.sb.is-collapsed .srv-row__btn {
  display: flex;
  justify-content: center;
  padding: 4px;
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
</style>
