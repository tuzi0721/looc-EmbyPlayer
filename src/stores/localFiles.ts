import { defineStore } from "pinia";
import { ref } from "vue";

export interface RecentLocalFile {
  filePath: string;
  name: string;
  openedAt: string;
}

const STORAGE_KEY = "hills-lite:recent-local-files";
const MAX_RECENTS = 8;

function fileNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
}

function normalizeEntry(value: unknown): RecentLocalFile | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<RecentLocalFile>;
  if (typeof entry.filePath !== "string" || entry.filePath.trim().length === 0) return null;
  const openedAt =
    typeof entry.openedAt === "string" && !Number.isNaN(Date.parse(entry.openedAt))
      ? entry.openedAt
      : new Date().toISOString();
  return {
    filePath: entry.filePath,
    name:
      typeof entry.name === "string" && entry.name.trim().length > 0
        ? entry.name.trim()
        : fileNameFromPath(entry.filePath),
    openedAt,
  };
}

export const useLocalFilesStore = defineStore("localFiles", () => {
  const items = ref<RecentLocalFile[]>([]);

  function save() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.value));
  }

  function load() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
      items.value = Array.isArray(parsed)
        ? parsed
            .map(normalizeEntry)
            .filter((entry): entry is RecentLocalFile => entry != null)
            .sort((left, right) => Date.parse(right.openedAt) - Date.parse(left.openedAt))
            .slice(0, MAX_RECENTS)
        : [];
    } catch {
      items.value = [];
    }
  }

  function remember(filePath: string) {
    const text = filePath.trim();
    if (!text) return;
    const key = text.toLowerCase();
    items.value = [
      {
        filePath: text,
        name: fileNameFromPath(text),
        openedAt: new Date().toISOString(),
      },
      ...items.value.filter((item) => item.filePath.toLowerCase() !== key),
    ].slice(0, MAX_RECENTS);
    save();
  }

  function clear() {
    items.value = [];
    window.localStorage.removeItem(STORAGE_KEY);
  }

  load();

  return { items, remember, clear };
});
