import { defineStore } from "pinia";
import { computed, ref } from "vue";

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

function normalizeConnection(value: unknown): WebDavConnection | null {
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
  };
}

export const useWebDavStore = defineStore("webdav", () => {
  const connections = ref<WebDavConnection[]>([]);

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

  function save() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(connections.value));
  }

  function load() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
      connections.value = Array.isArray(parsed)
        ? parsed
            .map(normalizeConnection)
            .filter((entry): entry is WebDavConnection => entry != null)
            .slice(0, MAX_CONNECTIONS)
        : [];
    } catch {
      connections.value = [];
    }
  }

  function upsert(payload: {
    id?: string | null;
    name?: string | null;
    baseUrl: string;
    username?: string | null;
    password?: string | null;
    lastPath?: string | null;
    rememberPassword?: boolean;
  }) {
    const baseUrl = payload.baseUrl.trim();
    if (!baseUrl) throw new Error("WebDAV URL 不能为空");
    const id = payload.id?.trim() || createId();
    const now = new Date().toISOString();
    const previous = connections.value.find((entry) => entry.id === id);
    const connection: WebDavConnection = {
      id,
      name: payload.name?.trim() || displayNameFromUrl(baseUrl),
      baseUrl,
      username: payload.username?.trim() || null,
      password: payload.rememberPassword ? payload.password ?? null : null,
      lastPath: normalizePath(payload.lastPath ?? previous?.lastPath ?? null),
      savedAt: previous?.savedAt ?? now,
      lastUsedAt: now,
      favoritedAt: previous?.favoritedAt ?? null,
    };
    connections.value = [
      connection,
      ...connections.value.filter((entry) => entry.id !== id),
    ].slice(0, MAX_CONNECTIONS);
    save();
    return connection;
  }

  function touch(id: string, lastPath?: string | null) {
    const now = new Date().toISOString();
    connections.value = connections.value.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            lastUsedAt: now,
            lastPath: lastPath === undefined ? entry.lastPath ?? null : normalizePath(lastPath),
          }
        : entry,
    );
    save();
  }

  function remove(id: string) {
    connections.value = connections.value.filter((entry) => entry.id !== id);
    save();
  }

  function isFavorite(id: string) {
    return connections.value.some((entry) => entry.id === id && Boolean(entry.favoritedAt));
  }

  function toggleFavorite(id: string) {
    const connection = connections.value.find((entry) => entry.id === id);
    if (!connection) return;
    const favoritedAt = connection.favoritedAt ? null : new Date().toISOString();
    connections.value = connections.value.map((entry) =>
      entry.id === id ? { ...entry, favoritedAt } : entry,
    );
    save();
  }

  function clearFavorites() {
    connections.value = connections.value.map((entry) => ({ ...entry, favoritedAt: null }));
    save();
  }

  load();

  return {
    connections,
    recentConnections,
    favoriteConnections,
    upsert,
    touch,
    remove,
    isFavorite,
    toggleFavorite,
    clearFavorites,
  };
});
