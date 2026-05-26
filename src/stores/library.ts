import { defineStore } from "pinia";
import { ref } from "vue";

import { api } from "@/api";
import type { MediaItem } from "@/types/models";

export const useLibraryStore = defineStore("library", () => {
  const views = ref<MediaItem[]>([]);
  const resume = ref<MediaItem[]>([]);
  const itemsByParent = ref<Record<string, MediaItem[]>>({});
  const itemCache = ref<Record<string, MediaItem>>({});
  const loading = ref(false);
  const searching = ref(false);
  const searchResults = ref<MediaItem[]>([]);

  async function refreshHome() {
    loading.value = true;
    try {
      const [viewsResp, resumeResp] = await Promise.all([
        api.listViews(),
        api.resumeItems(),
      ]);
      views.value = viewsResp.Items;
      resume.value = resumeResp.Items;
    } finally {
      loading.value = false;
    }
  }

  const totalByParent = ref<Record<string, number>>({});
  const loadedRangeByParent = ref<Record<string, { start: number; end: number }>>({});

  async function loadParent(parentId: string, params: [string, string][] = []) {
    const r = await api.listItems({ parentId, params });
    itemsByParent.value = { ...itemsByParent.value, [parentId]: r.Items };
    totalByParent.value = {
      ...totalByParent.value,
      [parentId]: r.TotalRecordCount ?? r.Items.length,
    };
    loadedRangeByParent.value = {
      ...loadedRangeByParent.value,
      [parentId]: { start: 0, end: r.Items.length },
    };
    return r.Items;
  }

  async function loadMore(parentId: string, params: [string, string][] = []) {
    const existing = itemsByParent.value[parentId] ?? [];
    const startIndex = existing.length;
    const total = totalByParent.value[parentId];
    if (total != null && startIndex >= total) return [];
    const merged: [string, string][] = [...params, ["StartIndex", String(startIndex)]];
    if (!merged.some(([k]) => k === "Limit")) merged.push(["Limit", "200"]);
    const r = await api.listItems({ parentId, params: merged });
    itemsByParent.value = {
      ...itemsByParent.value,
      [parentId]: [...existing, ...r.Items],
    };
    totalByParent.value = {
      ...totalByParent.value,
      [parentId]: r.TotalRecordCount ?? existing.length + r.Items.length,
    };
    loadedRangeByParent.value = {
      ...loadedRangeByParent.value,
      [parentId]: { start: 0, end: existing.length + r.Items.length },
    };
    return r.Items;
  }

  async function loadItem(itemId: string) {
    const m = await api.getItemDetail(itemId);
    itemCache.value = { ...itemCache.value, [itemId]: m };
    return m;
  }

  async function search(term: string) {
    searching.value = true;
    try {
      const r = await api.search(term);
      searchResults.value = r.Items;
      return r.Items;
    } finally {
      searching.value = false;
    }
  }

  function clearSearch() {
    searchResults.value = [];
    searching.value = false;
  }

  function reset() {
    views.value = [];
    resume.value = [];
    itemsByParent.value = {};
    itemCache.value = {};
    searchResults.value = [];
    totalByParent.value = {};
    loadedRangeByParent.value = {};
  }

  return {
    views,
    resume,
    itemsByParent,
    itemCache,
    loading,
    searching,
    searchResults,
    totalByParent,
    loadedRangeByParent,
    refreshHome,
    loadParent,
    loadMore,
    loadItem,
    search,
    clearSearch,
    reset,
  };
});
