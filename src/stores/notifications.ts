import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { api } from "@/api";
import { listen, type UnlistenFn } from "@/platform";
import type {
  AppNotification,
  NotificationCategory,
} from "@/types/models";

/// Soft cap mirroring the backend ring buffer so we never grow unbounded.
const MAX_KEEP = 100;

/// Toasts that should appear once when a new notification arrives. The
/// `ToastStack` component reads & shrinks this queue.
export interface ToastEntry extends AppNotification {
  spawnedAt: number;
}

export const useNotificationsStore = defineStore("notifications", () => {
  const items = ref<AppNotification[]>([]);
  const unread = ref(0);
  const centerOpen = ref(false);
  /// New notifications appended here become Toasts. UI removes from the queue
  /// once they're dismissed / autoclosed.
  const toastQueue = ref<ToastEntry[]>([]);

  const unlistens: UnlistenFn[] = [];

  const sorted = computed(() =>
    [...items.value].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    ),
  );

  function byCategory(cat: NotificationCategory) {
    return sorted.value.filter((n) => n.category === cat);
  }

  async function refresh() {
    items.value = await api.listNotifications();
    unread.value = await api.unreadCount();
  }

  function _addLocal(n: AppNotification) {
    const idx = items.value.findIndex((x) => x.id === n.id);
    const previous = idx >= 0 ? items.value[idx] : null;
    if (idx >= 0) items.value[idx] = n;
    else items.value.unshift(n);
    if (items.value.length > MAX_KEEP) items.value.length = MAX_KEEP;
    if (previous) {
      if (previous.read && !n.read) unread.value += 1;
      else if (!previous.read && n.read) unread.value = Math.max(0, unread.value - 1);
      toastQueue.value = toastQueue.value.map((t) =>
        t.id === n.id ? { ...t, ...n } : t,
      );
      return;
    }
    if (!n.read) unread.value += 1;
    toastQueue.value.push({ ...n, spawnedAt: Date.now() });
  }

  function _dismissLocal(id: string) {
    const before = items.value.length;
    const idx = items.value.findIndex((n) => n.id === id);
    if (idx >= 0 && !items.value[idx].read) unread.value = Math.max(0, unread.value - 1);
    items.value = items.value.filter((n) => n.id !== id);
    if (before !== items.value.length) {
      toastQueue.value = toastQueue.value.filter((t) => t.id !== id);
    }
  }

  function _clearLocal() {
    items.value = [];
    unread.value = 0;
    toastQueue.value = [];
  }

  function _markReadLocal(id: string) {
    const n = items.value.find((x) => x.id === id);
    if (n && !n.read) {
      n.read = true;
      unread.value = Math.max(0, unread.value - 1);
    }
  }

  function _markAllReadLocal() {
    let changed = 0;
    for (const n of items.value) {
      if (!n.read) {
        n.read = true;
        changed += 1;
      }
    }
    if (changed > 0) unread.value = Math.max(0, unread.value - changed);
  }

  async function dismiss(id: string) {
    _dismissLocal(id);
    try {
      await api.dismissNotification(id);
    } catch {
      /* best effort; backend will re-sync via next event */
    }
  }

  async function clear() {
    _clearLocal();
    try {
      await api.clearNotifications();
    } catch {
      /* ignore */
    }
  }

  async function markRead(id: string) {
    _markReadLocal(id);
    try {
      await api.markNotificationRead(id);
    } catch {
      /* ignore */
    }
  }

  async function markAllRead() {
    _markAllReadLocal();
    try {
      await api.markAllNotificationsRead();
    } catch {
      /* ignore */
    }
  }

  function removeToast(id: string) {
    toastQueue.value = toastQueue.value.filter((t) => t.id !== id);
  }

  function openCenter() {
    centerOpen.value = true;
  }
  function closeCenter() {
    centerOpen.value = false;
  }
  function toggleCenter() {
    centerOpen.value ? closeCenter() : openCenter();
  }

  async function startListening() {
    if (unlistens.length > 0) return;
    unlistens.push(
      await listen<AppNotification>("notification:new", (e) => _addLocal(e.payload)),
    );
    unlistens.push(
      await listen<{ id: string }>("notification:dismiss", (e) =>
        _dismissLocal(e.payload.id),
      ),
    );
    unlistens.push(await listen<unknown>("notification:cleared", () => _clearLocal()));
    unlistens.push(
      await listen<{ unread: number }>("notification:unread", (e) => {
        unread.value = e.payload.unread;
      }),
    );
    unlistens.push(
      await listen<{ id?: string; all?: boolean }>("notification:updated", (e) => {
        if (e.payload.all) _markAllReadLocal();
        else if (e.payload.id) _markReadLocal(e.payload.id);
      }),
    );
  }

  function stopListening() {
    unlistens.splice(0).forEach((fn) => fn());
  }

  return {
    items,
    unread,
    sorted,
    centerOpen,
    toastQueue,
    byCategory,
    refresh,
    dismiss,
    clear,
    markRead,
    markAllRead,
    removeToast,
    openCenter,
    closeCenter,
    toggleCenter,
    startListening,
    stopListening,
  };
});
