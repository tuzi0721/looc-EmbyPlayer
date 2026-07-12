import { defineStore } from "pinia";
import { computed, ref } from "vue";

import {
  commitSecureSecretChanges,
  getRendererSecureStorageStatus,
  readSecureSecret,
  secureSecretTransactionError,
  webDavPasswordSecretKey,
  type SecureSecretTransactionResult,
} from "@/services/secureSecrets";

export interface WebDavConnection {
  id: string;
  name: string;
  baseUrl: string;
  username?: string | null;
  password?: string | null;
  lastPath?: string | null;
  savedAt: string;
  lastUsedAt?: string | null;
  favoritedAt?: string | null;
}

export type WebDavCredentialMode = "preserve" | "replace" | "clear";
export type WebDavCredentialStatus =
  | "available"
  | "missing"
  | "unavailable"
  | "read-error";

type PersistedWebDavConnection = Omit<WebDavConnection, "password"> & {
  password?: string | null;
};

type CredentialState =
  | { status: "value"; source: "local" | "secure" }
  | { status: "missing"; source: "local" | "secure" }
  | { status: "unresolved" }
  | { status: "unavailable"; message: string }
  | { status: "read-error"; message: string };

interface NormalizedConnection {
  connection: WebDavConnection;
  localPasswordPresent: boolean;
}

const STORAGE_KEY = "hills-lite:webdav-connections:v1";
const MAX_CONNECTIONS = 16;

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `webdav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function displayNameFromUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    const leaf = decodeURIComponent(url.pathname.replace(/\/+$/, "").split("/").pop() ?? "");
    return leaf || url.hostname || "WebDAV";
  } catch {
    return "WebDAV";
  }
}

function normalizePath(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  return value.trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

function normalizeConnection(value: unknown): NormalizedConnection | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<WebDavConnection>;
  if (typeof entry.baseUrl !== "string" || entry.baseUrl.trim().length === 0) return null;
  const savedAt =
    typeof entry.savedAt === "string" && !Number.isNaN(Date.parse(entry.savedAt))
      ? entry.savedAt
      : new Date().toISOString();
  const lastUsedAt =
    typeof entry.lastUsedAt === "string" && !Number.isNaN(Date.parse(entry.lastUsedAt))
      ? entry.lastUsedAt
      : null;
  const favoritedAt =
    typeof entry.favoritedAt === "string" && !Number.isNaN(Date.parse(entry.favoritedAt))
      ? entry.favoritedAt
      : null;
  const baseUrl = entry.baseUrl.trim();
  return {
    connection: {
      id: typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : createId(),
      name:
        typeof entry.name === "string" && entry.name.trim()
          ? entry.name.trim()
          : displayNameFromUrl(baseUrl),
      baseUrl,
      username:
        typeof entry.username === "string" && entry.username.length > 0 ? entry.username : null,
      password:
        typeof entry.password === "string" && entry.password.length > 0 ? entry.password : null,
      lastPath: normalizePath(entry.lastPath),
      savedAt,
      lastUsedAt,
      favoritedAt,
    },
    localPasswordPresent: Object.prototype.hasOwnProperty.call(entry, "password"),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rollbackErrors(result: SecureSecretTransactionResult): string[] {
  return "rollbackErrors" in result ? result.rollbackErrors : [];
}

export const useWebDavStore = defineStore("webdav", () => {
  const connections = ref<WebDavConnection[]>([]);
  let retainedLocalPasswordIds = new Set<string>();
  const credentialStates = new Map<string, CredentialState>();
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
    entry: WebDavConnection,
    localPasswordIds = retainedLocalPasswordIds,
  ): PersistedWebDavConnection {
    const persisted: PersistedWebDavConnection = { ...entry };
    if (!localPasswordIds.has(entry.id)) delete persisted.password;
    return persisted;
  }

  function save(
    next = connections.value,
    localPasswordIds = retainedLocalPasswordIds,
  ) {
    const serialized = JSON.stringify(
      next.map((entry) => persistedConnection(entry, localPasswordIds)),
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
          `WebDAV 元数据写入失败：${errorMessage(writeError)}；回滚失败：${errorMessage(restoreError)}`,
        );
      }
      throw writeError;
    }
  }

  function setKnownCredentialState(
    id: string,
    password: string | null,
    source: "local" | "secure",
  ) {
    credentialStates.set(
      id,
      password ? { status: "value", source } : { status: "missing", source },
    );
  }

  function load() {
    retainedLocalPasswordIds = new Set<string>();
    credentialStates.clear();
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
        if (entry.localPasswordPresent) {
          retainedLocalPasswordIds.add(entry.connection.id);
          setKnownCredentialState(entry.connection.id, entry.connection.password ?? null, "local");
        } else {
          credentialStates.set(entry.connection.id, { status: "unresolved" });
        }
      }
    } catch {
      connections.value = [];
      retainedLocalPasswordIds.clear();
      credentialStates.clear();
    }
  }

  function setUnavailableStates(message: string) {
    for (const connection of connections.value) {
      if (retainedLocalPasswordIds.has(connection.id)) continue;
      const state = credentialStates.get(connection.id);
      if (state?.status === "value" || state?.status === "missing") continue;
      credentialStates.set(connection.id, { status: "unavailable", message });
    }
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
      if (!retainedLocalPasswordIds.has(connection.id)) continue;
      const nextLocalIds = new Set(retainedLocalPasswordIds);
      nextLocalIds.delete(connection.id);
      const result = await commitSecureSecretChanges(
        [{ key: webDavPasswordSecretKey(connection.id), value: connection.password ?? null }],
        () => save(connections.value, nextLocalIds),
      );
      if (result.status === "committed") {
        retainedLocalPasswordIds = nextLocalIds;
        setKnownCredentialState(connection.id, connection.password ?? null, "secure");
      } else {
        retryNeeded = true;
      }
    }

    for (const connection of connections.value) {
      if (retainedLocalPasswordIds.has(connection.id)) continue;
      const currentState = credentialStates.get(connection.id);
      if (
        (currentState?.status === "value" || currentState?.status === "missing") &&
        currentState.source === "secure"
      ) {
        continue;
      }

      const result = await readSecureSecret(webDavPasswordSecretKey(connection.id));
      if (result.status === "value") {
        connection.password = result.value;
        credentialStates.set(connection.id, { status: "value", source: "secure" });
      } else if (result.status === "missing") {
        connection.password = null;
        credentialStates.set(connection.id, { status: "missing", source: "secure" });
      } else if (result.status === "read-error") {
        credentialStates.set(connection.id, {
          status: "read-error",
          message: `安全凭据读取失败：${result.error}`,
        });
        retryNeeded = true;
      } else {
        credentialStates.set(connection.id, {
          status: "unavailable",
          message:
            result.status === "unavailable" && result.reason
              ? `安全凭据存储暂不可用：${result.reason}`
              : "当前无法读取安全凭据",
        });
        retryNeeded = result.status !== "local-only";
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

  function credentialStatus(id: string): WebDavCredentialStatus {
    const state = credentialStates.get(id);
    if (state?.status === "value") return "available";
    if (state?.status === "missing") return "missing";
    if (state?.status === "read-error") return "read-error";
    return "unavailable";
  }

  function credentialError(id: string): string | null {
    const state = credentialStates.get(id);
    if (state?.status === "read-error" || state?.status === "unavailable") {
      return `${state.message}；原凭据未更改，请重试。`;
    }
    if (state?.status === "unresolved") {
      return "安全凭据尚未完成读取；原凭据未更改，请重试。";
    }
    return null;
  }

  function requireReadableCredential(id: string) {
    const issue = credentialError(id);
    if (issue) throw new Error(issue);
  }

  function applySuccessfulUpdate(
    next: WebDavConnection[],
    nextLocalIds: Set<string>,
    target: WebDavConnection,
    credentialMode: WebDavCredentialMode,
    source: "local" | "secure" | null,
    evicted: WebDavConnection[],
  ) {
    connections.value = next;
    retainedLocalPasswordIds = nextLocalIds;
    if (credentialMode !== "preserve" && source) {
      setKnownCredentialState(target.id, target.password ?? null, source);
    }
    for (const entry of evicted) credentialStates.delete(entry.id);
  }

  async function upsert(payload: {
    id?: string | null;
    name?: string | null;
    baseUrl: string;
    username?: string | null;
    password?: string | null;
    lastPath?: string | null;
    rememberPassword?: boolean;
    credentialMode?: WebDavCredentialMode;
  }): Promise<WebDavConnection> {
    await initialize();

    const baseUrl = payload.baseUrl.trim();
    if (!baseUrl) throw new Error("WebDAV URL 不能为空");
    const id = payload.id?.trim() || createId();
    const now = new Date().toISOString();
    const previous = connections.value.find((entry) => entry.id === id);
    const requestedMode =
      payload.credentialMode ?? (payload.rememberPassword ? "replace" : "clear");
    const credentialMode =
      requestedMode === "preserve" && !previous ? "clear" : requestedMode;
    if (credentialMode === "preserve" && previous) requireReadableCredential(id);

    const password =
      credentialMode === "preserve"
        ? previous?.password ?? null
        : credentialMode === "replace" && payload.password
          ? payload.password
          : null;
    const connection: WebDavConnection = {
      id,
      name: payload.name?.trim() || displayNameFromUrl(baseUrl),
      baseUrl,
      username: payload.username?.trim() || null,
      password,
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
      const nextLocalIds = new Set(retainedLocalPasswordIds);
      if (targetChanged) nextLocalIds.add(id);
      for (const entry of evicted) nextLocalIds.delete(entry.id);
      save(next, nextLocalIds);
      applySuccessfulUpdate(next, nextLocalIds, connection, credentialMode, targetChanged ? "local" : null, evicted);
      initializationComplete = true;
      return connection;
    }

    if (!secureStatus.available) {
      if (evicted.length > 0) {
        throw new Error("安全凭据存储暂不可用，无法安全清理被淘汰的 WebDAV 凭据；连接未保存。");
      }
      if (!targetChanged) {
        requireReadableCredential(id);
        save(next, retainedLocalPasswordIds);
        connections.value = next;
        return connection;
      }

      const nextLocalIds = new Set(retainedLocalPasswordIds);
      nextLocalIds.add(id);
      save(next, nextLocalIds);
      applySuccessfulUpdate(next, nextLocalIds, connection, credentialMode, "local", evicted);
      initializationComplete = false;
      return connection;
    }

    const changes = [];
    if (targetChanged) {
      changes.push({ key: webDavPasswordSecretKey(id), value: password });
    }
    for (const entry of evicted) {
      changes.push({ key: webDavPasswordSecretKey(entry.id), value: null });
    }

    if (changes.length === 0) {
      save(next, retainedLocalPasswordIds);
      connections.value = next;
      return connection;
    }

    const secureLocalIds = new Set(retainedLocalPasswordIds);
    if (targetChanged) secureLocalIds.delete(id);
    for (const entry of evicted) secureLocalIds.delete(entry.id);
    const result = await commitSecureSecretChanges(changes, () => save(next, secureLocalIds));
    if (result.status === "committed") {
      applySuccessfulUpdate(next, secureLocalIds, connection, credentialMode, targetChanged ? "secure" : null, evicted);
      return connection;
    }

    if (
      result.status === "metadata-error" ||
      rollbackErrors(result).length > 0 ||
      evicted.length > 0
    ) {
      throw secureSecretTransactionError("保存 WebDAV 连接", result);
    }

    const fallbackLocalIds = new Set(retainedLocalPasswordIds);
    fallbackLocalIds.add(id);
    save(next, fallbackLocalIds);
    applySuccessfulUpdate(next, fallbackLocalIds, connection, credentialMode, "local", evicted);
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
    const nextLocalIds = new Set(retainedLocalPasswordIds);
    nextLocalIds.delete(id);
    const secureStatus = await getRendererSecureStorageStatus();
    if (secureStatus === null) {
      save(next, nextLocalIds);
    } else {
      if (!secureStatus.available) {
        throw new Error("安全凭据存储暂不可用，未删除 WebDAV 连接或原凭据，请稍后重试。");
      }
      const result = await commitSecureSecretChanges(
        [{ key: webDavPasswordSecretKey(id), value: null }],
        () => save(next, nextLocalIds),
      );
      if (result.status !== "committed") {
        throw secureSecretTransactionError("删除 WebDAV 连接", result);
      }
    }

    connections.value = next;
    retainedLocalPasswordIds = nextLocalIds;
    credentialStates.delete(id);
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