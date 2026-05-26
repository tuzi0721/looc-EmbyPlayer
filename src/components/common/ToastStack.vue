<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from "vue";
import { useRouter } from "vue-router";
import { Icon } from "@iconify/vue";

import { useNotificationsStore } from "@/stores/notifications";
import type {
  AppNotification,
  NotificationAction,
  NotificationKind,
} from "@/types/models";

const DURATIONS_MS: Record<NotificationKind, number | null> = {
  success: 4_000,
  info: 4_000,
  warning: 7_000,
  error: null,
};

const KIND_ICON: Record<NotificationKind, string> = {
  success: "lucide:check-circle-2",
  info: "lucide:info",
  warning: "lucide:alert-triangle",
  error: "lucide:alert-octagon",
};

const store = useNotificationsStore();
const router = useRouter();

const visibleToasts = computed(() => store.toastQueue.slice(0, 5));

const timers = new Map<string, number>();

function arm(toast: AppNotification) {
  if (toast.sticky) return;
  const dur = DURATIONS_MS[toast.kind];
  if (dur == null) return;
  if (timers.has(toast.id)) return;
  const h = window.setTimeout(() => {
    timers.delete(toast.id);
    store.removeToast(toast.id);
  }, dur);
  timers.set(toast.id, h);
}

function disarm(id: string) {
  const h = timers.get(id);
  if (h != null) {
    window.clearTimeout(h);
    timers.delete(id);
  }
}

watch(
  () => store.toastQueue.map((t) => t.id),
  () => {
    for (const t of store.toastQueue) arm(t);
  },
  { immediate: true, deep: true },
);

function close(id: string) {
  disarm(id);
  store.removeToast(id);
}

async function trigger(toast: AppNotification, action: NotificationAction) {
  await store.markRead(toast.id);
  close(toast.id);
  switch (action.kind) {
    case "navigate": {
      const to = (action.payload as { route?: string })?.route;
      if (to) router.push(to);
      break;
    }
    case "open-task": {
      router.push("/downloads");
      break;
    }
    default:
      break;
  }
}

onBeforeUnmount(() => {
  for (const h of timers.values()) window.clearTimeout(h);
  timers.clear();
});
</script>

<template>
  <transition-group tag="div" name="toast" class="toast-stack" aria-live="polite">
    <article
      v-for="t in visibleToasts"
      :key="t.id"
      class="toast glass glass-strong"
      :class="['toast--' + t.kind, { sticky: t.sticky || t.kind === 'error' }]"
      @mouseenter="disarm(t.id)"
      @mouseleave="arm(t)"
    >
      <div class="toast__icon">
        <Icon :icon="KIND_ICON[t.kind]" width="18" />
      </div>
      <div class="toast__main">
        <header class="toast__head">
          <h4>{{ t.title }}</h4>
          <button class="iconbtn" :aria-label="'关闭'" @click="close(t.id)">
            <Icon icon="lucide:x" width="14" />
          </button>
        </header>
        <p v-if="t.body" class="toast__body">{{ t.body }}</p>
        <footer v-if="t.action" class="toast__foot">
          <button class="action" @click="trigger(t, t.action!)">
            <Icon icon="lucide:arrow-right" width="13" />
            {{ t.action.label }}
          </button>
        </footer>
      </div>
    </article>
  </transition-group>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  right: 18px;
  bottom: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 9999;
  width: min(360px, 90vw);
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg-strong);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  color: var(--fg-primary);
  font-size: 13px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
}
.toast__icon {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  color: var(--fg-secondary);
  margin-top: 2px;
}
.toast--success .toast__icon { color: var(--success); }
.toast--info .toast__icon { color: var(--accent); }
.toast--warning .toast__icon { color: #ff9f0a; }
.toast--error .toast__icon { color: var(--danger); }

.toast__main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.toast__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}
.toast__head h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}
.toast__body {
  margin: 0;
  font-size: 12px;
  color: var(--fg-secondary);
  word-break: break-word;
  white-space: pre-wrap;
}
.toast__foot {
  margin-top: 4px;
}
.action {
  appearance: none;
  background: rgba(10, 132, 255, 0.18);
  border: 1px solid rgba(10, 132, 255, 0.4);
  color: var(--accent);
  border-radius: 999px;
  font-size: 11px;
  padding: 4px 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.action:hover {
  background: rgba(10, 132, 255, 0.28);
}

.iconbtn {
  appearance: none;
  background: transparent;
  border: none;
  color: var(--fg-tertiary);
  width: 20px;
  height: 20px;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.iconbtn:hover {
  color: var(--fg-primary);
  background: rgba(255, 255, 255, 0.08);
}

.toast-enter-active,
.toast-leave-active {
  transition: transform 260ms var(--easing-glide), opacity 220ms var(--easing-glide);
}
.toast-enter-from {
  transform: translateX(40px) scale(0.97);
  opacity: 0;
}
.toast-leave-to {
  transform: translateY(-8px) scale(0.97);
  opacity: 0;
}
.toast-move {
  transition: transform 260ms var(--easing-glide);
}
</style>
