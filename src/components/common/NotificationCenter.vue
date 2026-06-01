<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

import { useNotificationsStore } from "@/stores/notifications";
import { runNotificationAction } from "@/utils/notificationActions";
import type {
  AppNotification,
  NotificationAction,
  NotificationCategory,
  NotificationKind,
} from "@/types/models";

const store = useNotificationsStore();
const router = useRouter();

type FilterKey = "all" | NotificationCategory;
const filter = ref<FilterKey>("all");

const CATEGORY_TABS: Array<{ key: FilterKey; label: string; icon: string }> = [
  { key: "all", label: "全部", icon: "lucide:layers" },
  { key: "download", label: "下载", icon: "lucide:download" },
  { key: "server", label: "线路", icon: "lucide:radio" },
  { key: "auth", label: "登录", icon: "lucide:user-round" },
  { key: "system", label: "系统", icon: "lucide:settings-2" },
];

const KIND_ICON: Record<NotificationKind, string> = {
  success: "lucide:check-circle-2",
  info: "lucide:info",
  warning: "lucide:alert-triangle",
  error: "lucide:alert-octagon",
};

const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  download: "下载",
  server: "线路",
  auth: "登录",
  system: "系统",
};

const filtered = computed(() => {
  if (filter.value === "all") return store.sorted;
  return store.byCategory(filter.value);
});

const categoryCounts = computed(() => {
  const c: Record<FilterKey, number> = {
    all: store.items.length,
    download: 0,
    server: 0,
    auth: 0,
    system: 0,
  };
  for (const n of store.items) c[n.category] += 1;
  return c;
});

function fmtTime(ts: string): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} 天前`;
  return d.toLocaleDateString();
}

async function trigger(n: AppNotification, action: NotificationAction) {
  await store.markRead(n.id);
  store.closeCenter();
  await runNotificationAction(router, n, action);
}

function close() {
  store.closeCenter();
}
</script>

<template>
  <transition name="drawer-overlay">
    <div v-if="store.centerOpen" class="overlay" @click.self="close" />
  </transition>
  <transition name="drawer">
    <aside v-if="store.centerOpen" class="drawer glass glass-strong" role="dialog">
      <header class="drawer__head">
        <div class="title">
          <Icon icon="lucide:bell" width="16" />
          <h2>通知中心</h2>
          <span class="dim">{{ store.items.length }}</span>
        </div>
        <div class="actions">
          <button
            class="iconbtn"
            :disabled="store.unread === 0"
            title="全部标为已读"
            @click="store.markAllRead"
          >
            <Icon icon="lucide:check-check" width="16" />
          </button>
          <button
            class="iconbtn danger"
            :disabled="store.items.length === 0"
            title="清空全部"
            @click="store.clear"
          >
            <Icon icon="lucide:trash-2" width="16" />
          </button>
          <button class="iconbtn" title="关闭" @click="close">
            <Icon icon="lucide:x" width="18" />
          </button>
        </div>
      </header>

      <nav class="tabs">
        <button
          v-for="tab in CATEGORY_TABS"
          :key="tab.key"
          :class="['tab', { active: filter === tab.key }]"
          @click="filter = tab.key"
        >
          <Icon :icon="tab.icon" width="13" />
          <span>{{ tab.label }}</span>
          <span class="count">{{ categoryCounts[tab.key] }}</span>
        </button>
      </nav>

      <section class="list">
        <article
          v-for="n in filtered"
          :key="n.id"
          class="item"
          :class="['item--' + n.kind, { unread: !n.read }]"
        >
          <div class="item__icon">
            <Icon :icon="KIND_ICON[n.kind]" width="16" />
          </div>
          <div class="item__main">
            <header class="item__head">
              <h4>{{ n.title }}</h4>
              <time>{{ fmtTime(n.createdAt) }}</time>
            </header>
            <p v-if="n.body" class="item__body">{{ n.body }}</p>
            <footer class="item__foot">
              <span class="category">{{ CATEGORY_LABEL[n.category] }}</span>
              <div class="item__actions">
                <button
                  v-if="n.action"
                  class="action"
                  @click="trigger(n, n.action!)"
                >
                  <Icon icon="lucide:arrow-right" width="12" />
                  {{ n.action.label }}
                </button>
                <button
                  v-if="!n.read"
                  class="ghost"
                  title="标为已读"
                  @click="store.markRead(n.id)"
                >
                  <Icon icon="lucide:check" width="12" />
                </button>
                <button class="ghost danger" title="删除" @click="store.dismiss(n.id)">
                  <Icon icon="lucide:x" width="12" />
                </button>
              </div>
            </footer>
          </div>
        </article>

        <div v-if="filtered.length === 0" class="empty">
          <Icon icon="lucide:bell-off" width="22" />
          <span>没有通知</span>
        </div>
      </section>
    </aside>
  </transition>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.32);
  z-index: 1100;
  backdrop-filter: blur(2px);
}
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(380px, 92vw);
  z-index: 1101;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--glass-border);
  border-radius: 22px 0 0 22px;
  padding: 14px 14px 0;
  background: var(--glass-bg-strong);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
}
.drawer__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--glass-border);
}
.title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.title h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fg-secondary);
}
.title .dim {
  font-size: 11px;
  color: var(--fg-tertiary);
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 8px;
  border-radius: 999px;
}
.actions {
  display: flex;
  gap: 4px;
}
.iconbtn {
  appearance: none;
  background: transparent;
  border: none;
  color: var(--fg-secondary);
  width: 30px;
  height: 30px;
  border-radius: 10px;
  cursor: pointer;
}
.iconbtn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: var(--fg-primary);
}
.iconbtn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.iconbtn.danger:hover:not(:disabled) {
  color: var(--danger);
}

.tabs {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  margin-bottom: 10px;
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--glass-border);
  color: var(--fg-secondary);
  cursor: pointer;
  white-space: nowrap;
  appearance: none;
}
.tab.active {
  background: rgba(10, 132, 255, 0.18);
  color: var(--accent);
  border-color: rgba(10, 132, 255, 0.4);
}
.tab .count {
  color: var(--fg-tertiary);
  font-size: 10px;
  background: rgba(0, 0, 0, 0.18);
  padding: 0 6px;
  border-radius: 999px;
}
.tab.active .count {
  color: var(--accent);
  background: rgba(10, 132, 255, 0.28);
}

.list {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--fg-tertiary);
  font-size: 12px;
  padding: 60px 12px;
}

.item {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--glass-border);
  position: relative;
}
.item.unread::before {
  content: "";
  position: absolute;
  left: -2px;
  top: 16px;
  width: 4px;
  height: 24px;
  background: var(--accent);
  border-radius: 999px;
}
.item__icon {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  display: grid;
  place-items: center;
}
.item--success .item__icon { color: var(--success); background: rgba(48, 209, 88, 0.12); }
.item--info .item__icon { color: var(--accent); background: rgba(10, 132, 255, 0.12); }
.item--warning .item__icon { color: #ff9f0a; background: rgba(255, 159, 10, 0.12); }
.item--error .item__icon { color: var(--danger); background: rgba(255, 69, 58, 0.12); }

.item__main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.item__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.item__head h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--fg-primary);
  line-height: 1.3;
}
.item__head time {
  font-size: 10px;
  color: var(--fg-tertiary);
  white-space: nowrap;
}
.item__body {
  margin: 0;
  font-size: 12px;
  color: var(--fg-secondary);
  line-height: 1.4;
  word-break: break-word;
}
.item__foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2px;
}
.category {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--fg-tertiary);
}
.item__actions {
  display: flex;
  gap: 4px;
}
.action {
  appearance: none;
  background: rgba(10, 132, 255, 0.18);
  border: 1px solid rgba(10, 132, 255, 0.4);
  color: var(--accent);
  border-radius: 999px;
  font-size: 11px;
  padding: 3px 9px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.action:hover {
  background: rgba(10, 132, 255, 0.28);
}
.ghost {
  appearance: none;
  background: transparent;
  border: none;
  color: var(--fg-tertiary);
  width: 22px;
  height: 22px;
  border-radius: 8px;
  cursor: pointer;
}
.ghost:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--fg-primary);
}
.ghost.danger:hover {
  color: var(--danger);
}

:global(:root[data-theme="light"]) .overlay {
  background: rgba(18, 24, 38, 0.16);
}

:global(:root[data-theme="light"]) .drawer {
  background: rgba(255, 255, 255, 0.94);
}

:global(:root[data-theme="light"]) .title .dim,
:global(:root[data-theme="light"]) .iconbtn:hover:not(:disabled),
:global(:root[data-theme="light"]) .ghost:hover {
  background: rgba(18, 24, 38, 0.07);
}

:global(:root[data-theme="light"]) .tab {
  background: rgba(18, 24, 38, 0.04);
}

:global(:root[data-theme="light"]) .tab .count {
  background: rgba(18, 24, 38, 0.08);
}

:global(:root[data-theme="light"]) .item {
  background: rgba(18, 24, 38, 0.035);
}

:global(:root[data-theme="light"]) .item__icon {
  background: rgba(18, 24, 38, 0.06);
}

.drawer-enter-active,
.drawer-leave-active {
  transition: transform 260ms var(--easing-glide);
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
}
.drawer-overlay-enter-active,
.drawer-overlay-leave-active {
  transition: opacity 200ms var(--easing-glide);
}
.drawer-overlay-enter-from,
.drawer-overlay-leave-to {
  opacity: 0;
}
</style>
