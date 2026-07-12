import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { HillsCloudClient, CloudApiError, type CloudUser, type CloudEmbyAccount } from "@/api/cloud";
import {
  CLOUD_TOKEN_SECRET_KEY,
  commitSecureSecretChanges,
  getRendererSecureStorageStatus,
  readSecureSecret,
  secureSecretTransactionError,
  type SecureSecretTransactionResult,
} from "@/services/secureSecrets";
import { useServerStore } from "@/stores/server";
import { useAuthStore } from "@/stores/auth";

// Cloud account state lives in renderer persistence only; it never touches the
// backend AppSettings persistence, so it cannot regress local server/account state.
const STORAGE_KEY = "hills.cloud.v1";

interface PersistedCloud {
  baseUrl: string;
  token?: string | null;
}

type TokenState =
  | { status: "value"; source: "local" | "secure" }
  | { status: "missing"; source: "local" | "secure" }
  | { status: "unresolved" }
  | { status: "unavailable"; message: string }
  | { status: "read-error"; message: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rollbackErrors(result: SecureSecretTransactionResult): string[] {
  return "rollbackErrors" in result ? result.rollbackErrors : [];
}

export const useCloudStore = defineStore("cloud", () => {
  const baseUrl = ref("");
  const token = ref<string | null>(null);
  const user = ref<CloudUser | null>(null);
  const busy = ref(false);
  const error = ref<string | null>(null);
  let localTokenAuthoritative = false;
  let tokenState: TokenState = { status: "unresolved" };
  let initializationComplete = false;
  let initializationPromise: Promise<void> | null = null;
  let initializationRetryScheduled = false;
  let refreshPromise: Promise<void> | null = null;

  function persistedCloud(
    baseUrlForStorage = baseUrl.value,
    tokenForStorage = token.value,
    localAuthority = localTokenAuthoritative,
  ): PersistedCloud {
    const data: PersistedCloud = { baseUrl: baseUrlForStorage };
    if (localAuthority) data.token = tokenForStorage;
    return data;
  }

  function persistLocal(
    baseUrlForStorage = baseUrl.value,
    tokenForStorage = token.value,
    localAuthority = localTokenAuthoritative,
  ) {
    const serialized = JSON.stringify(
      persistedCloud(baseUrlForStorage, tokenForStorage, localAuthority),
    );
    const previous = window.localStorage.getItem(STORAGE_KEY);
    try {
      window.localStorage.setItem(STORAGE_KEY, serialized);
    } catch (writeError) {
      try {
        if (previous === null) window.localStorage.removeItem(STORAGE_KEY);
        else window.localStorage.setItem(STORAGE_KEY, previous);
      } catch (restoreError) {
        throw new Error(
          `云账号元数据写入失败：${errorMessage(writeError)}；回滚失败：${errorMessage(restoreError)}`,
        );
      }
      throw writeError;
    }
  }

  function setKnownTokenState(
    value: string | null,
    source: "local" | "secure",
  ) {
    tokenState = value ? { status: "value", source } : { status: "missing", source };
  }

  function load() {
    try {
      const parsed = JSON.parse(
        window.localStorage.getItem(STORAGE_KEY) ?? "{}",
      ) as Partial<PersistedCloud>;
      baseUrl.value = typeof parsed.baseUrl === "string" ? parsed.baseUrl : "";
      token.value = typeof parsed.token === "string" ? parsed.token : null;
      localTokenAuthoritative = Object.prototype.hasOwnProperty.call(parsed, "token");
      tokenState = localTokenAuthoritative
        ? token.value
          ? { status: "value", source: "local" }
          : { status: "missing", source: "local" }
        : { status: "unresolved" };
    } catch {
      baseUrl.value = "";
      token.value = null;
      localTokenAuthoritative = false;
      tokenState = { status: "unresolved" };
    }
  }

  async function initializeSecureToken() {
    const secureStatus = await getRendererSecureStorageStatus();
    if (secureStatus === null) {
      if (!localTokenAuthoritative) {
        tokenState = {
          status: "unavailable",
          message: "当前运行时无法读取 Electron 安全凭据",
        };
      }
      initializationComplete = true;
      return;
    }
    if (!secureStatus.available) {
      if (!localTokenAuthoritative) {
        tokenState = {
          status: "unavailable",
          message: secureStatus.reason
            ? `安全凭据存储暂不可用：${secureStatus.reason}`
            : "安全凭据存储暂不可用",
        };
      }
      initializationComplete = false;
      return;
    }

    if (localTokenAuthoritative) {
      const result = await commitSecureSecretChanges(
        [{ key: CLOUD_TOKEN_SECRET_KEY, value: token.value }],
        () => persistLocal(baseUrl.value, token.value, false),
      );
      if (result.status === "committed") {
        localTokenAuthoritative = false;
        setKnownTokenState(token.value, "secure");
        initializationComplete = true;
      } else {
        initializationComplete = false;
      }
      return;
    }

    const result = await readSecureSecret(CLOUD_TOKEN_SECRET_KEY);
    if (result.status === "value") {
      token.value = result.value;
      tokenState = { status: "value", source: "secure" };
      initializationComplete = true;
    } else if (result.status === "missing") {
      token.value = null;
      tokenState = { status: "missing", source: "secure" };
      initializationComplete = true;
    } else if (result.status === "read-error") {
      tokenState = {
        status: "read-error",
        message: `云账号 Token 读取失败：${result.error}`,
      };
      initializationComplete = false;
    } else {
      tokenState = {
        status: "unavailable",
        message:
          result.status === "unavailable" && result.reason
            ? `安全凭据存储暂不可用：${result.reason}`
            : "当前无法读取云账号 Token",
      };
      initializationComplete = result.status === "local-only";
    }
  }

  function initialize(): Promise<void> {
    if (initializationComplete) return Promise.resolve();
    if (initializationPromise) return initializationPromise;
    const pending = initializeSecureToken().finally(() => {
      if (initializationPromise === pending) initializationPromise = null;
    });
    initializationPromise = pending;
    return pending;
  }

  function tokenCredentialStatus(): TokenState["status"] {
    return tokenState.status;
  }

  async function saveToken(
    nextToken: string | null,
    options: { requireSecureDeletion?: boolean } = {},
  ) {
    await initialize();
    const secureStatus = await getRendererSecureStorageStatus();
    if (secureStatus === null) {
      persistLocal(baseUrl.value, nextToken, true);
      localTokenAuthoritative = true;
      setKnownTokenState(nextToken, "local");
      initializationComplete = true;
      return;
    }

    if (!secureStatus.available) {
      if (options.requireSecureDeletion) {
        throw new Error(
          secureStatus.reason
            ? `安全凭据存储暂不可用，云账号 Token 未删除：${secureStatus.reason}`
            : "安全凭据存储暂不可用，云账号 Token 未删除",
        );
      }
      persistLocal(baseUrl.value, nextToken, true);
      localTokenAuthoritative = true;
      setKnownTokenState(nextToken, "local");
      initializationComplete = false;
      return;
    }

    const result = await commitSecureSecretChanges(
      [{ key: CLOUD_TOKEN_SECRET_KEY, value: nextToken }],
      () => persistLocal(baseUrl.value, nextToken, false),
    );
    if (result.status === "committed") {
      localTokenAuthoritative = false;
      setKnownTokenState(nextToken, "secure");
      initializationComplete = true;
      return;
    }

    if (
      options.requireSecureDeletion ||
      result.status === "metadata-error" ||
      rollbackErrors(result).length > 0
    ) {
      throw secureSecretTransactionError(
        options.requireSecureDeletion ? "退出云账号" : "保存云账号 Token",
        result,
      );
    }

    persistLocal(baseUrl.value, nextToken, true);
    localTokenAuthoritative = true;
    setKnownTokenState(nextToken, "local");
    initializationComplete = false;
  }

  async function saveMetadata() {
    await initialize();
    if (
      !localTokenAuthoritative &&
      (tokenState.status === "unresolved" ||
        tokenState.status === "unavailable" ||
        tokenState.status === "read-error")
    ) {
      const detail =
        tokenState.status === "unresolved"
          ? "云账号 Token 尚未完成读取"
          : tokenState.message;
      throw new Error(`${detail}；服务地址未更改，请重试。`);
    }
    persistLocal(baseUrl.value, token.value, localTokenAuthoritative);
  }

  const configured = computed(() => baseUrl.value.trim().length > 0);
  const loggedIn = computed(() => Boolean(token.value && user.value));
  const isPro = computed(() => user.value?.proActive === true);

  function client(): HillsCloudClient {
    return new HillsCloudClient({ baseUrl: baseUrl.value.trim(), token: token.value });
  }

  async function setBaseUrl(url: string) {
    const previous = baseUrl.value;
    baseUrl.value = url.trim();
    try {
      await saveMetadata();
    } catch (setError) {
      baseUrl.value = previous;
      error.value = errorMessage(setError);
      throw setError;
    }
  }

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    await initialize();
    busy.value = true;
    error.value = null;
    try {
      return await fn();
    } catch (runError) {
      error.value =
        runError instanceof CloudApiError
          ? runError.code
          : runError instanceof Error
            ? runError.message
            : String(runError);
      throw runError;
    } finally {
      busy.value = false;
    }
  }

  async function register(username: string, password: string, email?: string) {
    await run(async () => {
      const result = await client().register(username, password, email);
      await saveToken(result.token);
      token.value = result.token;
      user.value = result.user;
    });
  }

  async function login(username: string, password: string) {
    await run(async () => {
      const result = await client().login(username, password);
      await saveToken(result.token);
      token.value = result.token;
      user.value = result.user;
    });
  }

  async function logout() {
    await run(async () => {
      await saveToken(null, { requireSecureDeletion: true });
      token.value = null;
      user.value = null;
    });
  }

  async function refreshMe() {
    await initialize();
    if (!token.value) return;
    if (refreshPromise) return refreshPromise;

    const expectedToken = token.value;
    refreshPromise = (async () => {
      try {
        const refreshedUser = await client().me();
        if (token.value === expectedToken) user.value = refreshedUser;
      } catch (refreshError) {
        if (
          token.value === expectedToken &&
          refreshError instanceof CloudApiError &&
          (refreshError.status === 401 || refreshError.code === "unauthorized")
        ) {
          // A failed secure deletion is intentionally allowed to reject so the
          // caller/UI can report that the recoverable session was preserved.
          await logout();
        }
      }
    })();

    try {
      await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }

  async function redeem(code: string) {
    await run(async () => {
      await client().redeemCode(code);
      user.value = await client().me();
      await saveMetadata();
    });
  }

  // Map local servers/accounts to cloud account backups (credentials are only read
  // locally, encrypted server-side). Restore remains an explicit action elsewhere.
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
      const result = await client().pushEmbyAccounts(accounts);
      return result.count;
    });
  }

  async function fetchCloudAccounts(): Promise<CloudEmbyAccount[]> {
    return run(async () => client().pullEmbyAccounts());
  }

  function scheduleInitializationRetry() {
    if (initializationComplete || initializationRetryScheduled) return;
    initializationRetryScheduled = true;
    window.setTimeout(() => {
      void initialize()
        .then(() => (token.value ? refreshMe() : undefined))
        .catch(() => {});
    }, 1000);
  }

  load();
  void initialize()
    .then(() => {
      if (token.value) return refreshMe();
      scheduleInitializationRetry();
      return undefined;
    })
    .catch(() => {
      scheduleInitializationRetry();
    });

  return {
    baseUrl,
    token,
    user,
    busy,
    error,
    configured,
    loggedIn,
    isPro,
    initialize,
    tokenCredentialStatus,
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