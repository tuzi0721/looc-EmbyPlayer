import { defineStore } from "pinia";
import { ref } from "vue";

export interface RecentLocalFile {
  filePath: string;
  name: string;
  openedAt: string;
}

export interface RecentLocalFolder {
  folderPath: string;
  name: string;
  openedAt: string;
}

const FILE_STORAGE_KEY = "hills-lite:recent-local-files";
const FOLDER_STORAGE_KEY = "hills-lite:recent-local-folders";
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

function normalizeFolderEntry(value: unknown): RecentLocalFolder | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<RecentLocalFolder>;
  if (typeof entry.folderPath !== "string" || entry.folderPath.trim().length === 0) return null;
  const openedAt =
    typeof entry.openedAt === "string" && !Number.isNaN(Date.parse(entry.openedAt))
      ? entry.openedAt
      : new Date().toISOString();
  return {
    folderPath: entry.folderPath,
    name:
      typeof entry.name === "string" && entry.name.trim().length > 0
        ? entry.name.trim()
        : fileNameFromPath(entry.folderPath),
    openedAt,
  };
}

export const useLocalFilesStore = defineStore("localFiles", () => {
  const items = ref<RecentLocalFile[]>([]);
  const folderItems = ref<RecentLocalFolder[]>([]);

  function saveFiles() {
    window.localStorage.setItem(FILE_STORAGE_KEY, JSON.stringify(items.value));
  }

  function saveFolders() {
    window.localStorage.setItem(FOLDER_STORAGE_KEY, JSON.stringify(folderItems.value));
  }

  function load() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(FILE_STORAGE_KEY) ?? "[]");
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

    try {
      const parsed = JSON.parse(window.localStorage.getItem(FOLDER_STORAGE_KEY) ?? "[]");
      folderItems.value = Array.isArray(parsed)
        ? parsed
            .map(normalizeFolderEntry)
            .filter((entry): entry is RecentLocalFolder => entry != null)
            .sort((left, right) => Date.parse(right.openedAt) - Date.parse(left.openedAt))
            .slice(0, MAX_RECENTS)
        : [];
    } catch {
      folderItems.value = [];
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
    saveFiles();
  }

  function rememberFolder(folderPath: string) {
    const text = folderPath.trim();
    if (!text) return;
    const key = text.toLowerCase();
    folderItems.value = [
      {
        folderPath: text,
        name: fileNameFromPath(text),
        openedAt: new Date().toISOString(),
      },
      ...folderItems.value.filter((item) => item.folderPath.toLowerCase() !== key),
    ].slice(0, MAX_RECENTS);
    saveFolders();
  }

  function clear() {
    items.value = [];
    window.localStorage.removeItem(FILE_STORAGE_KEY);
  }

  function clearFolders() {
    folderItems.value = [];
    window.localStorage.removeItem(FOLDER_STORAGE_KEY);
  }

  load();

  return { items, folderItems, remember, rememberFolder, clear, clearFolders };
});
