import { defineStore } from "pinia";
import { ref } from "vue";

import { api } from "@/api";
import { useAuthStore } from "@/stores/auth";
import { useSettingsStore } from "@/stores/settings";
import type { MediaItem, UserData } from "@/types/models";
import { filterJavItems } from "@/utils/javFilter";

export const useLibraryStore = defineStore("library", () => {
  const auth = useAuthStore();
  const settings = useSettingsStore();
  const views = ref<MediaItem[]>([]);
  const resume = ref<MediaItem[]>([]);
  const heroItems = ref<MediaItem[]>([]);
  const itemsByParent = ref<Record<string, MediaItem[]>>({});
  const itemCache = ref<Record<string, MediaItem>>({});
  const loading = ref(false);
  const searching = ref(false);
  const searchResults = ref<MediaItem[]>([]);

  const heroFields = "PrimaryImageAspectRatio,Overview,ProductionYear,UserData,SeriesInfo,RunTimeTicks,CommunityRating,OfficialRating,ParentBackdropItemId,ParentBackdropImageTags,ParentThumbItemId,ParentThumbImageTag,ParentPrimaryImageItemId,ParentPrimaryImageTag,ParentLogoItemId,ParentLogoImageTag,SeriesPrimaryImageTag,SeriesThumbImageTag";
  const heroImageParams: [string, string][] = [
    ["EnableUserData", "true"],
    ["EnableImages", "true"],
    ["ImageTypeLimit", "4"],
    ["EnableImageTypes", "Primary,Backdrop,Thumb,Logo"],
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

  const HERO_COUNT = 5;
  const VIDEO_COLLECTION_TYPES = new Set(["movies", "tvshows", "mixed", "boxsets"]);

  function pickRandomVideoLibrary(libraryViews: MediaItem[]): MediaItem | null {
    const candidates = libraryViews.filter((v) => {
      const ct = (v.CollectionType ?? "").toLowerCase();
      return VIDEO_COLLECTION_TYPES.has(ct);
    });
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
  }

  // Pull a fresh random batch from one random video library. Over-fetch a few so
  // that after dropping image-less items we still have a full HERO_COUNT to show.
  async function loadRandomLibraryHero(library: MediaItem): Promise<MediaItem[]> {
    const r = await api.listItems({
      parentId: library.Id,
      params: [
        ["Recursive", "true"],
        ["IncludeItemTypes", "Movie,Series"],
        ["Fields", heroFields],
        ["SortBy", "Random"],
        ["Limit", String(HERO_COUNT + 3)],
        ...heroImageParams,
      ],
    });
    return r.Items;
  }

  async function refreshHome() {
    loading.value = true;
    try {
      const [viewsResp, resumeResp] = await Promise.all([
        api.listViews(),
        api.resumeItems(),
      ]);
      views.value = viewsResp.Items;
      resume.value = filterJavItems(resumeResp.Items, settings.settings.hideJavCodes);

      let heroRaw: MediaItem[] = [];
      const randomLibrary = pickRandomVideoLibrary(viewsResp.Items);
      if (randomLibrary) {
        try {
          heroRaw = await loadRandomLibraryHero(randomLibrary);
        } catch {
          heroRaw = [];
        }
      }
      if (heroRaw.length === 0) {
        // Fallback: newest Movie/Series globally (older behavior) when no video
        // library is available or the random query failed.
        const heroResp = await loadHeroCandidates("Movie,Series");
        heroRaw =
          heroResp.Items.length > 0
            ? heroResp.Items
            : (await loadHeroCandidates("Movie,Series,Episode", "18")).Items;
      }

      const filteredHeroItems = preferVisualHeroItems(
        filterJavItems(heroRaw, settings.settings.hideJavCodes),
      );
      const finalItems = filteredHeroItems.length > 0 ? filteredHeroItems : resume.value;
      heroItems.value = finalItems.slice(0, HERO_COUNT);
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

  function itemCacheKey(itemId: string, accountId = auth.activeId) {
    return accountId ? `${accountId}:${itemId}` : itemId;
  }

  function cachedItem(itemId: string | null | undefined, accountId = auth.activeId) {
    if (!itemId) return null;
    return itemCache.value[itemCacheKey(itemId, accountId)] ?? (!accountId ? itemCache.value[itemId] ?? null : null);
  }

  async function loadItem(itemId: string, accountId = auth.activeId) {
    const m = await api.getItemDetail(itemId);
    itemCache.value = { ...itemCache.value, [itemCacheKey(itemId, accountId)]: m };
    return m;
  }

  function updateItemUserData(itemId: string, userData: UserData, accountId = auth.activeId) {
    const targetCacheKey = itemCacheKey(itemId, accountId);
    const appliesToItem = (item: MediaItem): boolean => {
      if (item.Id !== itemId) return false;
      const sourceAccountId = item._source?.accountId;
      return !accountId || !sourceAccountId || sourceAccountId === accountId;
    };
    const apply = (item: MediaItem): MediaItem =>
      appliesToItem(item) ? { ...item, UserData: userData } : item;

    itemCache.value = Object.fromEntries(
      Object.entries(itemCache.value).map(([key, item]) => [
        key,
        key === targetCacheKey || (!accountId && key === itemId) ? { ...item, UserData: userData } : apply(item),
      ]),
    );

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

  // Search only the CURRENT server/account (not every saved account). The old
  // searchAllAccounts mixed results from all servers, which is not what the in-server
  // search box should do.
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
    itemCacheKey,
    cachedItem,
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
