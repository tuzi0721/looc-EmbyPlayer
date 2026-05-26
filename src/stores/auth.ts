import { defineStore } from "pinia";
import { ref, computed } from "vue";

import { api } from "@/api";
import type { Account } from "@/types/models";

export const useAuthStore = defineStore("auth", () => {
  const accounts = ref<Account[]>([]);
  const activeId = ref<string | null>(null);
  const loading = ref(false);
  const lastError = ref<string | null>(null);

  const activeAccount = computed(() =>
    accounts.value.find((a) => a.id === activeId.value) ?? null,
  );

  async function refresh() {
    loading.value = true;
    try {
      accounts.value = await api.listAccounts();
    } finally {
      loading.value = false;
    }
  }

  async function login(payload: { serverId: string; username: string; password: string }) {
    loading.value = true;
    lastError.value = null;
    try {
      const result = await api.login(payload);
      activeId.value = result.account.id;
      await refresh();
      return result;
    } catch (e) {
      lastError.value = String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function switchTo(id: string) {
    await api.switchAccount(id);
    activeId.value = id;
  }

  async function logout(id: string) {
    await api.logout(id);
    if (activeId.value === id) activeId.value = null;
    await refresh();
  }

  return {
    accounts,
    activeId,
    activeAccount,
    loading,
    lastError,
    refresh,
    login,
    switchTo,
    logout,
  };
});
