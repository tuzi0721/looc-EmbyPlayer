import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { HillsCloudClient, CloudApiError, type CloudUser, type CloudEmbyAccount } from "@/api/cloud";
import { useServerStore } from "@/stores/server";
import { useAuthStore } from "@/stores/auth";

// Cloud account state lives in renderer localStorage only — it never touches the
// backend AppSettings persistence, so it cannot regress local server/account state.
const STORAGE_KEY = "hills.cloud.v1";

interface PersistedCloud {
  baseUrl: string;
  token: string | null;
}

export const useCloudStore = defineStore("cloud", () => {
  const baseUrl = ref("");
  const token = ref<string | null>(null);
  const user = ref<CloudUser | null>(null);
  const busy = ref(false);
  const error = ref<string | null>(null);

  function save() {
    const data: PersistedCloud = { baseUrl: baseUrl.value, token: token.value };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* ignore quota/availability errors */
    }
  }

  function load() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<PersistedCloud>;
      baseUrl.value = typeof parsed.baseUrl === "string" ? parsed.baseUrl : "";
      token.value = typeof parsed.token === "string" ? parsed.token : null;
    } catch {
      baseUrl.value = "";
      token.value = null;
    }
  }
  load();

  const configured = computed(() => baseUrl.value.trim().length > 0);
  const loggedIn = computed(() => Boolean(token.value && user.value));
  const isPro = computed(() => user.value?.proActive === true);

  function client(): HillsCloudClient {
    return new HillsCloudClient({ baseUrl: baseUrl.value.trim(), token: token.value });
  }

  function setBaseUrl(url: string) {
    baseUrl.value = url.trim();
    save();
  }

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    busy.value = true;
    error.value = null;
    try {
      return await fn();
    } catch (e) {
      error.value = e instanceof CloudApiError ? e.code : e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      busy.value = false;
    }
  }

  async function register(username: string, password: string, email?: string) {
    await run(async () => {
      const r = await client().register(username, password, email);
      token.value = r.token;
      user.value = r.user;
      save();
    });
  }

  async function login(username: string, password: string) {
    await run(async () => {
      const r = await client().login(username, password);
      token.value = r.token;
      user.value = r.user;
      save();
    });
  }

  function logout() {
    token.value = null;
    user.value = null;
    save();
  }

  async function refreshMe() {
    if (!token.value) return;
    try {
      user.value = await client().me();
    } catch (e) {
      // Token expired / invalid → drop it so the UI shows the login form again.
      if (e instanceof CloudApiError && (e.status === 401 || e.code === "unauthorized")) {
        logout();
      }
    }
  }

  async function redeem(code: string) {
    await run(async () => {
      await client().redeemCode(code);
      user.value = await client().me();
      save();
    });
  }

  // 问6: map local servers/accounts → cloud account backups (credentials only read
  // locally, encrypted server-side). Restore (apply to local) is intentionally left
  // to an explicit user action elsewhere to avoid clobbering local state silently.
  function collectLocalAccounts(): CloudEmbyAccount[] {
    const serverStore = useServerStore();
    const auth = useAuthStore();
    const out: CloudEmbyAccount[] = [];
    for (const acc of auth.accounts) {
      const server = serverStore.servers.find((s) => s.id === acc.serverId);
      if (!server) continue;
      const line = server.lines.find((l) => l.id === server.activeLineId) ?? server.lines[0];
      if (!line) continue;
      out.push({
        serverName: server.name,
        baseUrl: line.baseUrl,
        username: acc.username,
        secret: acc.accessToken,
        meta: { kind: server.kind, serverId: server.id, userId: acc.userId },
      });
    }
    return out;
  }

  async function backupServers(): Promise<number> {
    return run(async () => {
      const accounts = collectLocalAccounts();
      const r = await client().pushEmbyAccounts(accounts);
      return r.count;
    });
  }

  async function fetchCloudAccounts(): Promise<CloudEmbyAccount[]> {
    return run(async () => client().pullEmbyAccounts());
  }

  return {
    baseUrl,
    token,
    user,
    busy,
    error,
    configured,
    loggedIn,
    isPro,
    setBaseUrl,
    register,
    login,
    logout,
    refreshMe,
    redeem,
    backupServers,
    fetchCloudAccounts,
  };
});
