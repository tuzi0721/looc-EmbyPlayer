import { defineStore } from "pinia";
import { computed, ref } from "vue";

export interface AlistConnection {
  id: string;
  name: string;
  baseUrl: string;
  token?: string | null;
  pathPassword?: string | null;
  savedAt: string;
  lastUsedAt?: string | null;
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

function normalizeConnection(value: unknown): AlistConnection | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<AlistConnection>;
  if (typeof entry.baseUrl !== "string" || entry.baseUrl.trim().length === 0) return null;
  const baseUrl = entry.baseUrl.trim();
  const savedAt = validIso(entry.savedAt) ?? new Date().toISOString();
  return {
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
    savedAt,
    lastUsedAt: validIso(entry.lastUsedAt),
  };
}

export const useAlistStore = defineStore("alist", () => {
  const connections = ref<AlistConnection[]>([]);

  const recentConnections = computed(() =>
    [...connections.value].sort(
      (left, right) =>
        Date.parse(right.lastUsedAt ?? right.savedAt) -
        Date.parse(left.lastUsedAt ?? left.savedAt),
    ),
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
            .filter((entry): entry is AlistConnection => entry != null)
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
    token?: string | null;
    pathPassword?: string | null;
    rememberToken?: boolean;
  }) {
    const baseUrl = payload.baseUrl.trim();
    if (!baseUrl) throw new Error("Alist URL 不能为空");
    const id = payload.id?.trim() || createId();
    const now = new Date().toISOString();
    const previous = connections.value.find((entry) => entry.id === id);
    const connection: AlistConnection = {
      id,
      name: payload.name?.trim() || displayNameFromUrl(baseUrl),
      baseUrl,
      token: payload.rememberToken ? payload.token ?? null : null,
      pathPassword: payload.rememberToken ? payload.pathPassword ?? null : null,
      savedAt: previous?.savedAt ?? now,
      lastUsedAt: now,
    };
    connections.value = [
      connection,
      ...connections.value.filter((entry) => entry.id !== id),
    ].slice(0, MAX_CONNECTIONS);
    save();
    return connection;
  }

  function touch(id: string) {
    const now = new Date().toISOString();
    connections.value = connections.value.map((entry) =>
      entry.id === id ? { ...entry, lastUsedAt: now } : entry,
    );
    save();
  }

  function remove(id: string) {
    connections.value = connections.value.filter((entry) => entry.id !== id);
    save();
  }

  load();

  return {
    connections,
    recentConnections,
    upsert,
    touch,
    remove,
  };
});
