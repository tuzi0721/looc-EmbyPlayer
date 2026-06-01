import { defineStore } from "pinia";
import { ref } from "vue";

import { api } from "@/api";
import { useSettingsStore } from "@/stores/settings";
import type { MediaItem, UserData } from "@/types/models";
import { filterJavItems } from "@/utils/javFilter";

export const useLibraryStore = defineStore("library", () => {
  const settings = useSettingsStore();
  const views = ref<MediaItem[]>([]);
  const resume = ref<MediaItem[]>([]);
  const heroItems = ref<MediaItem[]>([]);
  const itemsByParent = ref<Record<string, MediaItem[]>>({});
  const itemCache = ref<Record<string, MediaItem>>({});
  const loading = ref(false);
  const searching = ref(false);
  const searchResults = ref<MediaItem[]>([]);

  const heroFields = "PrimaryImageAspectRatio,Overview,ProductionYear,UserData,SeriesInfo,RunTimeTicks,CommunityRating,OfficialRating";
  const heroImageParams: [string, string][] = [
    ["EnableUserData", "true"],
    ["EnableImages", "true"],
    ["ImageTypeLimit", "2"],
    ["EnableImageTypes", "Primary,Backdrop"],
  ];

  async function loadHeroCandidates(includeTypes: string, limit = "36") {
    return api.listItems({
      params: [
        ["Recursive", "true"],
        ["IncludeItemTypes", includeTypes],
        ["Fields", heroFields],
        ["SortBy", "DateCreated"],
        ["SortOrder", "Descending"],
        ["Limit", limit],
        ...heroImageParams,
      ],
    });
  }

  function preferVisualHeroItems(items: MediaItem[]) {
    const visual = items.filter(
      (item) =>
        item.BackdropImageTags?.length ||
        item.ImageTags?.Primary ||
        item.Overview?.trim(),
    );
    return visual.length > 0 ? visual : items;
  }

  async function refreshHome() {
    loading.value = true;
    try {
      const [viewsResp, resumeResp, heroResp] = await Promise.all([
        api.listViews(),
        api.resumeItems(),
        loadHeroCandidates("Movie,Series"),
      ]);
      const heroFallbackResp =
        heroResp.Items.length > 0
          ? heroResp
          : await loadHeroCandidates("Movie,Series,Episode", "18");
      views.value = viewsResp.Items;
      resume.value = filterJavItems(resumeResp.Items, settings.settings.hideJavCodes);
      const filteredHeroItems = preferVisualHeroItems(
        filterJavItems(heroFallbackResp.Items, settings.settings.hideJavCodes),
      );
      heroItems.value = filteredHeroItems.length > 0 ? filteredHeroItems : resume.value;
    } finally {
      loading.value = false;
    }
  }

  const totalByParent = ref<Record<string, number>>({});
  const loadedRangeByParent = ref<Record<string, { start: number; end: number }>>({});

  async function loadParent(parentId: string, params: [string, string][] = []) {
    const r = await api.listItems({ parentId, params });
    const filterEnabled = settings.settings.hideJavCodes;
    const filteredItems = filterJavItems(r.Items, settings.settings.hideJavCodes);
    itemsByParent.value = { ...itemsByParent.value, [parentId]: filteredItems };
    const rawTotal = r.TotalRecordCount ?? r.Items.length;
    totalByParent.value = {
      ...totalByParent.value,
      [parentId]: filterEnabled ? filteredItems.length + (r.Items.length < rawTotal ? 1 : 0) : rawTotal,
    };
    loadedRangeByParent.value = {
      ...loadedRangeByParent.value,
      [parentId]: { start: 0, end: r.Items.length },
    };
    return filteredItems;
  }

  async function loadMore(parentId: string, params: [string, string][] = []) {
    const existing = itemsByParent.value[parentId] ?? [];
    const startIndex = loadedRangeByParent.value[parentId]?.end ?? existing.length;
    const total = totalByParent.value[parentId];
    if (!settings.settings.hideJavCodes && total != null && startIndex >= total) return [];
    const merged: [string, string][] = [...params, ["StartIndex", String(startIndex)]];
    if (!merged.some(([k]) => k === "Limit")) merged.push(["Limit", "200"]);
    const r = await api.listItems({ parentId, params: merged });
    const filterEnabled = settings.settings.hideJavCodes;
    const filteredItems = filterJavItems(r.Items, settings.settings.hideJavCodes);
    const nextItems = [...existing, ...filteredItems];
    const rawEnd = startIndex + r.Items.length;
    const rawTotal = r.TotalRecordCount ?? rawEnd;
    itemsByParent.value = {
      ...itemsByParent.value,
      [parentId]: nextItems,
    };
    totalByParent.value = {
      ...totalByParent.value,
      [parentId]: filterEnabled ? nextItems.length + (rawEnd < rawTotal ? 1 : 0) : rawTotal,
    };
    loadedRangeByParent.value = {
      ...loadedRangeByParent.value,
      [parentId]: { start: 0, end: rawEnd },
    };
    return filteredItems;
  }

  async function loadItem(itemId: string) {
    const m = await api.getItemDetail(itemId);
    itemCache.value = { ...itemCache.value, [itemId]: m };
    return m;
  }

  function updateItemUserData(itemId: string, userData: UserData) {
    const apply = (item: MediaItem): MediaItem =>
      item.Id === itemId ? { ...item, UserData: userData } : item;

    if (itemCache.value[itemId]) {
      itemCache.value = {
        ...itemCache.value,
        [itemId]: apply(itemCache.value[itemId]!),
      };
    }

    resume.value = resume.value.map(apply);
    heroItems.value = heroItems.value.map(apply);
    searchResults.value = searchResults.value.map(apply);
    itemsByParent.value = Object.fromEntries(
      Object.entries(itemsByParent.value).map(([parentId, items]) => [
        parentId,
        items.map(apply),
      ]),
    );
  }

  async function search(term: string) {
    searching.value = true;
    try {
      const r = await api.search(term);
      const filteredItems = filterJavItems(r.Items, settings.settings.hideJavCodes);
      searchResults.value = filteredItems;
      return filteredItems;
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
    heroItems.value = [];
    itemsByParent.value = {};
    itemCache.value = {};
    searchResults.value = [];
    totalByParent.value = {};
    loadedRangeByParent.value = {};
  }

  return {
    views,
    resume,
    heroItems,
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
    updateItemUserData,
    search,
    clearSearch,
    reset,
  };
});
