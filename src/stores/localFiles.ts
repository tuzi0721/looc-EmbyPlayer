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

export interface FavoriteLocalFolder {
  folderPath: string;
  name: string;
  favoritedAt: string;
}

const FILE_STORAGE_KEY = "hills-lite:recent-local-files";
const FOLDER_STORAGE_KEY = "hills-lite:recent-local-folders";
const FAVORITE_FOLDER_STORAGE_KEY = "hills-lite:favorite-local-folders";
const MAX_RECENTS = 8;
const MAX_FAVORITES = 32;

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

function normalizeFavoriteFolderEntry(value: unknown): FavoriteLocalFolder | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<FavoriteLocalFolder>;
  if (typeof entry.folderPath !== "string" || entry.folderPath.trim().length === 0) return null;
  const favoritedAt =
    typeof entry.favoritedAt === "string" && !Number.isNaN(Date.parse(entry.favoritedAt))
      ? entry.favoritedAt
      : new Date().toISOString();
  return {
    folderPath: entry.folderPath,
    name:
      typeof entry.name === "string" && entry.name.trim().length > 0
        ? entry.name.trim()
        : fileNameFromPath(entry.folderPath),
    favoritedAt,
  };
}

export const useLocalFilesStore = defineStore("localFiles", () => {
  const items = ref<RecentLocalFile[]>([]);
  const folderItems = ref<RecentLocalFolder[]>([]);
  const favoriteFolderItems = ref<FavoriteLocalFolder[]>([]);

  function saveFiles() {
    window.localStorage.setItem(FILE_STORAGE_KEY, JSON.stringify(items.value));
  }

  function saveFolders() {
    window.localStorage.setItem(FOLDER_STORAGE_KEY, JSON.stringify(folderItems.value));
  }

  function saveFavoriteFolders() {
    window.localStorage.setItem(
      FAVORITE_FOLDER_STORAGE_KEY,
      JSON.stringify(favoriteFolderItems.value),
    );
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

    try {
      const parsed = JSON.parse(window.localStorage.getItem(FAVORITE_FOLDER_STORAGE_KEY) ?? "[]");
      favoriteFolderItems.value = Array.isArray(parsed)
        ? parsed
            .map(normalizeFavoriteFolderEntry)
            .filter((entry): entry is FavoriteLocalFolder => entry != null)
            .sort((left, right) => Date.parse(right.favoritedAt) - Date.parse(left.favoritedAt))
            .slice(0, MAX_FAVORITES)
        : [];
    } catch {
      favoriteFolderItems.value = [];
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

  function isFavoriteFolder(folderPath: string) {
    const key = folderPath.trim().toLowerCase();
    if (!key) return false;
    return favoriteFolderItems.value.some((item) => item.folderPath.toLowerCase() === key);
  }

  function toggleFavoriteFolder(folderPath: string) {
    const text = folderPath.trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (isFavoriteFolder(text)) {
      favoriteFolderItems.value = favoriteFolderItems.value.filter(
        (item) => item.folderPath.toLowerCase() !== key,
      );
    } else {
      favoriteFolderItems.value = [
        {
          folderPath: text,
          name: fileNameFromPath(text),
          favoritedAt: new Date().toISOString(),
        },
        ...favoriteFolderItems.value.filter((item) => item.folderPath.toLowerCase() !== key),
      ].slice(0, MAX_FAVORITES);
    }
    saveFavoriteFolders();
  }

  function clearFavoriteFolders() {
    favoriteFolderItems.value = [];
    window.localStorage.removeItem(FAVORITE_FOLDER_STORAGE_KEY);
  }

  load();

  return {
    items,
    folderItems,
    favoriteFolderItems,
    remember,
    rememberFolder,
    clear,
    clearFolders,
    isFavoriteFolder,
    toggleFavoriteFolder,
    clearFavoriteFolders,
  };
});
