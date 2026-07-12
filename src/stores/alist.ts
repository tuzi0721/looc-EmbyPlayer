import { defineStore } from "pinia";
import { computed, ref } from "vue";

import {
  alistPathPasswordSecretKey,
  alistTokenSecretKey,
  commitSecureSecretChanges,
  getRendererSecureStorageStatus,
  readSecureSecret,
  secureSecretTransactionError,
  type SecureSecretChange,
  type SecureSecretTransactionResult,
} from "@/services/secureSecrets";

export interface AlistConnection {
  id: string;
  name: string;
  baseUrl: string;
  token?: string | null;
  pathPassword?: string | null;
  lastPath?: string | null;
  savedAt: string;
  lastUsedAt?: string | null;
  favoritedAt?: string | null;
}

export type AlistCredentialMode = "preserve" | "replace" | "clear";
export type AlistCredentialStatus =
  | "available"
  | "missing"
  | "unavailable"
  | "read-error";

type PersistedAlistConnection = Omit<AlistConnection, "token" | "pathPassword"> & {
  token?: string | null;
  pathPassword?: string | null;
};

type CredentialState =
  | { status: "value"; source: "local" | "secure" }
  | { status: "missing"; source: "local" | "secure" }
  | { status: "unresolved" }
  | { status: "unavailable"; message: string }
  | { status: "read-error"; message: string };

interface NormalizedConnection {
  connection: AlistConnection;
  localTokenPresent: boolean;
  localPathPasswordPresent: boolean;
}

const STORAGE_KEY = "hills-lite:alist-connections:v1";
const MAX_CONNECTIONS = 16;

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `alist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function displayNameFromUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    return url.hostname || "Alist";
  } catch {
    return "Alist";
  }
}

function validIso(value?: string | null): string | null {
  return value && !Number.isNaN(Date.parse(value)) ? value : null;
}

function normalizePath(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  return value.trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

function normalizeConnection(value: unknown): NormalizedConnection | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<AlistConnection>;
  if (typeof entry.baseUrl !== "string" || entry.baseUrl.trim().length === 0) return null;
  const baseUrl = entry.baseUrl.trim();
  const savedAt = validIso(entry.savedAt) ?? new Date().toISOString();
  return {
    connection: {
      id: typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : createId(),
      name:
        typeof entry.name === "string" && entry.name.trim()
          ? entry.name.trim()
          : displayNameFromUrl(baseUrl),
      baseUrl,
      token: typeof entry.token === "string" && entry.token.length > 0 ? entry.token : null,
      pathPassword:
        typeof entry.pathPassword === "string" && entry.pathPassword.length > 0
          ? entry.pathPassword
          : null,
      lastPath: normalizePath(entry.lastPath),
      savedAt,
      lastUsedAt: validIso(entry.lastUsedAt),
      favoritedAt: validIso(entry.favoritedAt),
    },
    localTokenPresent: Object.prototype.hasOwnProperty.call(entry, "token"),
    localPathPasswordPresent: Object.prototype.hasOwnProperty.call(entry, "pathPassword"),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rollbackErrors(result: SecureSecretTransactionResult): string[] {
  return "rollbackErrors" in result ? result.rollbackErrors : [];
}

export const useAlistStore = defineStore("alist", () => {
  const connections = ref<AlistConnection[]>([]);
  let retainedLocalTokenIds = new Set<string>();
  let retainedLocalPathPasswordIds = new Set<string>();
  const tokenStates = new Map<string, CredentialState>();
  const pathPasswordStates = new Map<string, CredentialState>();
  let initializationComplete = false;
  let initializationPromise: Promise<void> | null = null;

  const recentConnections = computed(() =>
    [...connections.value].sort(
      (left, right) =>
        Date.parse(right.lastUsedAt ?? right.savedAt) -
        Date.parse(left.lastUsedAt ?? left.savedAt),
    ),
  );
  const favoriteConnections = computed(() =>
    connections.value
      .filter((entry) => entry.favoritedAt)
      .sort((left, right) => Date.parse(right.favoritedAt ?? "") - Date.parse(left.favoritedAt ?? "")),
  );

  function persistedConnection(
    entry: AlistConnection,
    localTokenIds = retainedLocalTokenIds,
    localPathPasswordIds = retainedLocalPathPasswordIds,
  ): PersistedAlistConnection {
    const persisted: PersistedAlistConnection = { ...entry };
    if (!localTokenIds.has(entry.id)) delete persisted.token;
    if (!localPathPasswordIds.has(entry.id)) delete persisted.pathPassword;
    return persisted;
  }

  function save(
    next = connections.value,
    localTokenIds = retainedLocalTokenIds,
    localPathPasswordIds = retainedLocalPathPasswordIds,
  ) {
    const serialized = JSON.stringify(
      next.map((entry) => persistedConnection(entry, localTokenIds, localPathPasswordIds)),
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
          `Alist 元数据写入失败：${errorMessage(writeError)}；回滚失败：${errorMessage(restoreError)}`,
        );
      }
      throw writeError;
    }
  }

  function knownState(
    value: string | null,
    source: "local" | "secure",
  ): CredentialState {
    return value ? { status: "value", source } : { status: "missing", source };
  }

  function load() {
    retainedLocalTokenIds = new Set<string>();
    retainedLocalPathPasswordIds = new Set<string>();
    tokenStates.clear();
    pathPasswordStates.clear();
    try {
      const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
      const normalized = Array.isArray(parsed)
        ? parsed
            .map(normalizeConnection)
            .filter((entry): entry is NormalizedConnection => entry != null)
            .slice(0, MAX_CONNECTIONS)
        : [];
      connections.value = normalized.map((entry) => entry.connection);
      for (const entry of normalized) {
        if (entry.localTokenPresent) {
          retainedLocalTokenIds.add(entry.connection.id);
          tokenStates.set(
            entry.connection.id,
            knownState(entry.connection.token ?? null, "local"),
          );
        } else {
          tokenStates.set(entry.connection.id, { status: "unresolved" });
        }
        if (entry.localPathPasswordPresent) {
          retainedLocalPathPasswordIds.add(entry.connection.id);
          pathPasswordStates.set(
            entry.connection.id,
            knownState(entry.connection.pathPassword ?? null, "local"),
          );
        } else {
          pathPasswordStates.set(entry.connection.id, { status: "unresolved" });
        }
      }
    } catch {
      connections.value = [];
      retainedLocalTokenIds.clear();
      retainedLocalPathPasswordIds.clear();
      tokenStates.clear();
      pathPasswordStates.clear();
    }
  }

  function setUnavailableStates(message: string) {
    for (const connection of connections.value) {
      if (!retainedLocalTokenIds.has(connection.id)) {
        const state = tokenStates.get(connection.id);
        if (state?.status !== "value" && state?.status !== "missing") {
          tokenStates.set(connection.id, { status: "unavailable", message });
        }
      }
      if (!retainedLocalPathPasswordIds.has(connection.id)) {
        const state = pathPasswordStates.get(connection.id);
        if (state?.status !== "value" && state?.status !== "missing") {
          pathPasswordStates.set(connection.id, { status: "unavailable", message });
        }
      }
    }
  }

  async function hydrateToken(connection: AlistConnection): Promise<boolean> {
    const currentState = tokenStates.get(connection.id);
    if (
      (currentState?.status === "value" || currentState?.status === "missing") &&
      currentState.source === "secure"
    ) {
      return false;
    }
    const result = await readSecureSecret(alistTokenSecretKey(connection.id));
    if (result.status === "value") {
      connection.token = result.value;
      tokenStates.set(connection.id, { status: "value", source: "secure" });
      return false;
    }
    if (result.status === "missing") {
      connection.token = null;
      tokenStates.set(connection.id, { status: "missing", source: "secure" });
      return false;
    }
    if (result.status === "read-error") {
      tokenStates.set(connection.id, {
        status: "read-error",
        message: `API Token 读取失败：${result.error}`,
      });
      return true;
    }
    tokenStates.set(connection.id, {
      status: "unavailable",
      message:
        result.status === "unavailable" && result.reason
          ? `安全凭据存储暂不可用：${result.reason}`
          : "当前无法读取 API Token",
    });
    return result.status !== "local-only";
  }

  async function hydratePathPassword(connection: AlistConnection): Promise<boolean> {
    const currentState = pathPasswordStates.get(connection.id);
    if (
      (currentState?.status === "value" || currentState?.status === "missing") &&
      currentState.source === "secure"
    ) {
      return false;
    }
    const result = await readSecureSecret(alistPathPasswordSecretKey(connection.id));
    if (result.status === "value") {
      connection.pathPassword = result.value;
      pathPasswordStates.set(connection.id, { status: "value", source: "secure" });
      return false;
    }
    if (result.status === "missing") {
      connection.pathPassword = null;
      pathPasswordStates.set(connection.id, { status: "missing", source: "secure" });
      return false;
    }
    if (result.status === "read-error") {
      pathPasswordStates.set(connection.id, {
        status: "read-error",
        message: `路径密码读取失败：${result.error}`,
      });
      return true;
    }
    pathPasswordStates.set(connection.id, {
      status: "unavailable",
      message:
        result.status === "unavailable" && result.reason
          ? `安全凭据存储暂不可用：${result.reason}`
          : "当前无法读取路径密码",
    });
    return result.status !== "local-only";
  }

  async function initializeSecureSecrets() {
    const secureStatus = await getRendererSecureStorageStatus();
    if (secureStatus === null) {
      setUnavailableStates("当前运行时无法读取 Electron 安全凭据");
      initializationComplete = true;
      return;
    }
    if (!secureStatus.available) {
      setUnavailableStates(
        secureStatus.reason
          ? `安全凭据存储暂不可用：${secureStatus.reason}`
          : "安全凭据存储暂不可用",
      );
      initializationComplete = false;
      return;
    }

    let retryNeeded = false;
    for (const connection of connections.value) {
      const migrateToken = retainedLocalTokenIds.has(connection.id);
      const migratePathPassword = retainedLocalPathPasswordIds.has(connection.id);
      if (!migrateToken && !migratePathPassword) continue;

      const changes: SecureSecretChange[] = [];
      const nextLocalTokenIds = new Set(retainedLocalTokenIds);
      const nextLocalPathPasswordIds = new Set(retainedLocalPathPasswordIds);
      if (migrateToken) {
        changes.push({
          key: alistTokenSecretKey(connection.id),
          value: connection.token ?? null,
        });
        nextLocalTokenIds.delete(connection.id);
      }
      if (migratePathPassword) {
        changes.push({
          key: alistPathPasswordSecretKey(connection.id),
          value: connection.pathPassword ?? null,
        });
        nextLocalPathPasswordIds.delete(connection.id);
      }

      const result = await commitSecureSecretChanges(
        changes,
        () => save(connections.value, nextLocalTokenIds, nextLocalPathPasswordIds),
      );
      if (result.status === "committed") {
        retainedLocalTokenIds = nextLocalTokenIds;
        retainedLocalPathPasswordIds = nextLocalPathPasswordIds;
        if (migrateToken) {
          tokenStates.set(connection.id, knownState(connection.token ?? null, "secure"));
        }
        if (migratePathPassword) {
          pathPasswordStates.set(
            connection.id,
            knownState(connection.pathPassword ?? null, "secure"),
          );
        }
      } else {
        retryNeeded = true;
      }
    }

    for (const connection of connections.value) {
      if (!retainedLocalTokenIds.has(connection.id)) {
        retryNeeded = (await hydrateToken(connection)) || retryNeeded;
      }
      if (!retainedLocalPathPasswordIds.has(connection.id)) {
        retryNeeded = (await hydratePathPassword(connection)) || retryNeeded;
      }
    }
    initializationComplete = !retryNeeded;
  }

  function initialize(): Promise<void> {
    if (initializationComplete) return Promise.resolve();
    if (initializationPromise) return initializationPromise;
    const pending = initializeSecureSecrets().finally(() => {
      if (initializationPromise === pending) initializationPromise = null;
    });
    initializationPromise = pending;
    return pending;
  }

  function credentialStatus(id: string): AlistCredentialStatus {
    const states = [tokenStates.get(id), pathPasswordStates.get(id)];
    if (states.some((state) => state?.status === "read-error")) return "read-error";
    if (
      states.some(
        (state) => !state || state.status === "unresolved" || state.status === "unavailable",
      )
    ) {
      return "unavailable";
    }
    if (states.some((state) => state?.status === "value")) return "available";
    return "missing";
  }

  function credentialError(id: string): string | null {
    const messages = [tokenStates.get(id), pathPasswordStates.get(id)]
      .map((state) => {
        if (state?.status === "read-error" || state?.status === "unavailable") {
          return state.message;
        }
        if (!state || state.status === "unresolved") return "安全凭据尚未完成读取";
        return null;
      })
      .filter((message): message is string => Boolean(message));
    return messages.length > 0
      ? `${[...new Set(messages)].join("；")}；原凭据未更改，请重试。`
      : null;
  }

  function requireReadableCredentials(id: string) {
    const issue = credentialError(id);
    if (issue) throw new Error(issue);
  }

  function applySuccessfulUpdate(
    next: AlistConnection[],
    nextLocalTokenIds: Set<string>,
    nextLocalPathPasswordIds: Set<string>,
    target: AlistConnection,
    credentialMode: AlistCredentialMode,
    source: "local" | "secure" | null,
    evicted: AlistConnection[],
  ) {
    connections.value = next;
    retainedLocalTokenIds = nextLocalTokenIds;
    retainedLocalPathPasswordIds = nextLocalPathPasswordIds;
    if (credentialMode !== "preserve" && source) {
      tokenStates.set(target.id, knownState(target.token ?? null, source));
      pathPasswordStates.set(
        target.id,
        knownState(target.pathPassword ?? null, source),
      );
    }
    for (const entry of evicted) {
      tokenStates.delete(entry.id);
      pathPasswordStates.delete(entry.id);
    }
  }

  async function upsert(payload: {
    id?: string | null;
    name?: string | null;
    baseUrl: string;
    token?: string | null;
    pathPassword?: string | null;
    lastPath?: string | null;
    rememberToken?: boolean;
    credentialMode?: AlistCredentialMode;
  }): Promise<AlistConnection> {
    await initialize();

    const baseUrl = payload.baseUrl.trim();
    if (!baseUrl) throw new Error("Alist URL 不能为空");
    const id = payload.id?.trim() || createId();
    const now = new Date().toISOString();
    const previous = connections.value.find((entry) => entry.id === id);
    const requestedMode =
      payload.credentialMode ?? (payload.rememberToken ? "replace" : "clear");
    const credentialMode =
      requestedMode === "preserve" && !previous ? "clear" : requestedMode;
    if (credentialMode === "preserve" && previous) requireReadableCredentials(id);

    const token =
      credentialMode === "preserve"
        ? previous?.token ?? null
        : credentialMode === "replace" && payload.token
          ? payload.token
          : null;
    const pathPassword =
      credentialMode === "preserve"
        ? previous?.pathPassword ?? null
        : credentialMode === "replace" && payload.pathPassword
          ? payload.pathPassword
          : null;
    const connection: AlistConnection = {
      id,
      name: payload.name?.trim() || displayNameFromUrl(baseUrl),
      baseUrl,
      token,
      pathPassword,
      lastPath: normalizePath(payload.lastPath ?? previous?.lastPath ?? null),
      savedAt: previous?.savedAt ?? now,
      lastUsedAt: now,
      favoritedAt: previous?.favoritedAt ?? null,
    };
    const next = [
      connection,
      ...connections.value.filter((entry) => entry.id !== id),
    ].slice(0, MAX_CONNECTIONS);
    const nextIds = new Set(next.map((entry) => entry.id));
    const evicted = connections.value.filter((entry) => !nextIds.has(entry.id));
    const targetChanged = credentialMode !== "preserve";
    const secureStatus = await getRendererSecureStorageStatus();

    if (secureStatus === null) {
      const nextLocalTokenIds = new Set(retainedLocalTokenIds);
      const nextLocalPathPasswordIds = new Set(retainedLocalPathPasswordIds);
      if (targetChanged) {
        nextLocalTokenIds.add(id);
        nextLocalPathPasswordIds.add(id);
      }
      for (const entry of evicted) {
        nextLocalTokenIds.delete(entry.id);
        nextLocalPathPasswordIds.delete(entry.id);
      }
      save(next, nextLocalTokenIds, nextLocalPathPasswordIds);
      applySuccessfulUpdate(
        next,
        nextLocalTokenIds,
        nextLocalPathPasswordIds,
        connection,
        credentialMode,
        targetChanged ? "local" : null,
        evicted,
      );
      initializationComplete = true;
      return connection;
    }

    if (!secureStatus.available) {
      if (evicted.length > 0) {
        throw new Error("安全凭据存储暂不可用，无法安全清理被淘汰的 Alist 凭据；连接未保存。");
      }
      if (!targetChanged) {
        requireReadableCredentials(id);
        save(next, retainedLocalTokenIds, retainedLocalPathPasswordIds);
        connections.value = next;
        return connection;
      }

      const nextLocalTokenIds = new Set(retainedLocalTokenIds);
      const nextLocalPathPasswordIds = new Set(retainedLocalPathPasswordIds);
      nextLocalTokenIds.add(id);
      nextLocalPathPasswordIds.add(id);
      save(next, nextLocalTokenIds, nextLocalPathPasswordIds);
      applySuccessfulUpdate(
        next,
        nextLocalTokenIds,
        nextLocalPathPasswordIds,
        connection,
        credentialMode,
        "local",
        evicted,
      );
      initializationComplete = false;
      return connection;
    }

    const changes: SecureSecretChange[] = [];
    if (targetChanged) {
      changes.push({ key: alistTokenSecretKey(id), value: token });
      changes.push({ key: alistPathPasswordSecretKey(id), value: pathPassword });
    }
    for (const entry of evicted) {
      changes.push({ key: alistTokenSecretKey(entry.id), value: null });
      changes.push({ key: alistPathPasswordSecretKey(entry.id), value: null });
    }

    if (changes.length === 0) {
      save(next, retainedLocalTokenIds, retainedLocalPathPasswordIds);
      connections.value = next;
      return connection;
    }

    const secureLocalTokenIds = new Set(retainedLocalTokenIds);
    const secureLocalPathPasswordIds = new Set(retainedLocalPathPasswordIds);
    if (targetChanged) {
      secureLocalTokenIds.delete(id);
      secureLocalPathPasswordIds.delete(id);
    }
    for (const entry of evicted) {
      secureLocalTokenIds.delete(entry.id);
      secureLocalPathPasswordIds.delete(entry.id);
    }
    const result = await commitSecureSecretChanges(
      changes,
      () => save(next, secureLocalTokenIds, secureLocalPathPasswordIds),
    );
    if (result.status === "committed") {
      applySuccessfulUpdate(
        next,
        secureLocalTokenIds,
        secureLocalPathPasswordIds,
        connection,
        credentialMode,
        targetChanged ? "secure" : null,
        evicted,
      );
      return connection;
    }

    if (
      result.status === "metadata-error" ||
      rollbackErrors(result).length > 0 ||
      evicted.length > 0
    ) {
      throw secureSecretTransactionError("保存 Alist 连接", result);
    }

    const fallbackLocalTokenIds = new Set(retainedLocalTokenIds);
    const fallbackLocalPathPasswordIds = new Set(retainedLocalPathPasswordIds);
    fallbackLocalTokenIds.add(id);
    fallbackLocalPathPasswordIds.add(id);
    save(next, fallbackLocalTokenIds, fallbackLocalPathPasswordIds);
    applySuccessfulUpdate(
      next,
      fallbackLocalTokenIds,
      fallbackLocalPathPasswordIds,
      connection,
      credentialMode,
      "local",
      evicted,
    );
    initializationComplete = false;
    return connection;
  }

  function touch(id: string, lastPath?: string | null) {
    const now = new Date().toISOString();
    const next = connections.value.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            lastUsedAt: now,
            lastPath: lastPath === undefined ? entry.lastPath ?? null : normalizePath(lastPath),
          }
        : entry,
    );
    save(next);
    connections.value = next;
  }

  async function remove(id: string): Promise<void> {
    await initialize();
    const connection = connections.value.find((entry) => entry.id === id);
    if (!connection) return;

    const next = connections.value.filter((entry) => entry.id !== id);
    const nextLocalTokenIds = new Set(retainedLocalTokenIds);
    const nextLocalPathPasswordIds = new Set(retainedLocalPathPasswordIds);
    nextLocalTokenIds.delete(id);
    nextLocalPathPasswordIds.delete(id);
    const secureStatus = await getRendererSecureStorageStatus();
    if (secureStatus === null) {
      save(next, nextLocalTokenIds, nextLocalPathPasswordIds);
    } else {
      if (!secureStatus.available) {
        throw new Error("安全凭据存储暂不可用，未删除 Alist 连接或原凭据，请稍后重试。");
      }
      const result = await commitSecureSecretChanges(
        [
          { key: alistTokenSecretKey(id), value: null },
          { key: alistPathPasswordSecretKey(id), value: null },
        ],
        () => save(next, nextLocalTokenIds, nextLocalPathPasswordIds),
      );
      if (result.status !== "committed") {
        throw secureSecretTransactionError("删除 Alist 连接", result);
      }
    }

    connections.value = next;
    retainedLocalTokenIds = nextLocalTokenIds;
    retainedLocalPathPasswordIds = nextLocalPathPasswordIds;
    tokenStates.delete(id);
    pathPasswordStates.delete(id);
  }

  function isFavorite(id: string) {
    return connections.value.some((entry) => entry.id === id && Boolean(entry.favoritedAt));
  }

  function toggleFavorite(id: string) {
    const connection = connections.value.find((entry) => entry.id === id);
    if (!connection) return;
    const favoritedAt = connection.favoritedAt ? null : new Date().toISOString();
    const next = connections.value.map((entry) =>
      entry.id === id ? { ...entry, favoritedAt } : entry,
    );
    save(next);
    connections.value = next;
  }

  function clearFavorites() {
    const next = connections.value.map((entry) => ({ ...entry, favoritedAt: null }));
    save(next);
    connections.value = next;
  }

  load();
  void initialize().catch(() => {});

  return {
    connections,
    recentConnections,
    favoriteConnections,
    initialize,
    credentialStatus,
    credentialError,
    upsert,
    touch,
    remove,
    isFavorite,
    toggleFavorite,
    clearFavorites,
  };
});