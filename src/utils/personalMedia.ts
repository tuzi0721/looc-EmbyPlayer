import { api } from "@/api";
import type { ItemsResponse, MediaItem } from "@/types/models";
import { mediaItemKey } from "@/utils/sourceContext";

export type PersonalMediaTypes = "Movie,Episode" | "Movie" | "Episode";

export interface PersonalHistoryResponse extends ItemsResponse {
  playedLoaded: number;
  playedTotal: number;
  resumeLoaded: number;
}

const PERSONAL_FIELDS =
  "PrimaryImageAspectRatio,ProductionYear,Overview,UserData,SeriesInfo,RunTimeTicks,ParentBackdropItemId,ParentBackdropImageTags,ParentThumbItemId,ParentThumbImageTag,ParentPrimaryImageItemId,ParentPrimaryImageTag,SeriesPrimaryImageTag,SeriesThumbImageTag";
const PERSONAL_IMAGE_PARAMS: [string, string][] = [
  ["EnableUserData", "true"],
  ["EnableImages", "true"],
  ["ImageTypeLimit", "3"],
  ["EnableImageTypes", "Primary,Backdrop,Thumb"],
];

function hasType(item: MediaItem, includeTypes: PersonalMediaTypes) {
  return includeTypes.split(",").includes(item.Type ?? "");
}

function mergeUserData(left: MediaItem["UserData"], right: MediaItem["UserData"]) {
  if (!left) return right ?? null;
  if (!right) return left;
  return { ...left, ...right };
}

export function mergeMediaItems(groups: MediaItem[][]) {
  const merged = new Map<string, MediaItem>();
  for (const group of groups) {
    for (const item of group) {
      const key = mediaItemKey(item);
      const previous = merged.get(key);
      merged.set(
        key,
        previous
          ? {
              ...previous,
              ...item,
              UserData: mergeUserData(previous.UserData, item.UserData),
            }
          : item,
      );
    }
  }
  return [...merged.values()];
}

function historyScore(item: MediaItem) {
  const raw = item.UserData?.LastPlayedDate;
  if (raw) {
    const time = Date.parse(raw);
    if (!Number.isNaN(time)) return time;
  }
  const progress = item.UserData?.PlayedPercentage ?? 0;
  const position = item.UserData?.PlaybackPositionTicks ?? 0;
  if (position > 0 || (progress > 0 && progress < 100)) return Number.MAX_SAFE_INTEGER - 1;
  return 0;
}

export function sortHistoryItems(items: MediaItem[]) {
  return [...items].sort((left, right) => {
    const score = historyScore(right) - historyScore(left);
    if (score !== 0) return score;
    return (left.Name ?? "").localeCompare(right.Name ?? "", "zh-Hans-CN");
  });
}

function listItems(params: [string, string][]) {
  return api.listItemsAllAccounts({
    params,
  });
}

function favoriteParams(includeTypes: string, limit: number, mode: "flag" | "filter"): [string, string][] {
  return [
    mode === "flag" ? ["IsFavorite", "true"] : ["Filters", "IsFavorite"],
    ["Recursive", "true"],
    ["IncludeItemTypes", includeTypes],
    ["Fields", PERSONAL_FIELDS],
    ["SortBy", "SortName"],
    ["SortOrder", "Ascending"],
    ["Limit", String(limit)],
    ...PERSONAL_IMAGE_PARAMS,
  ];
}

function playedParams(
  includeTypes: PersonalMediaTypes,
  startIndex: number,
  limit: number,
  mode: "flag" | "filter",
): [string, string][] {
  return [
    mode === "flag" ? ["IsPlayed", "true"] : ["Filters", "IsPlayed"],
    ["Recursive", "true"],
    ["IncludeItemTypes", includeTypes],
    ["Fields", PERSONAL_FIELDS],
    ["SortBy", "DatePlayed"],
    ["SortOrder", "Descending"],
    ["StartIndex", String(startIndex)],
    ["Limit", String(limit)],
    ...PERSONAL_IMAGE_PARAMS,
  ];
}

async function fallbackList(
  queries: [string, string][][],
  emptyResponse: ItemsResponse,
): Promise<ItemsResponse> {
  let firstError: unknown = null;
  let firstEmpty: ItemsResponse | null = null;

  for (const query of queries) {
    try {
      const response = await listItems(query);
      if (response.Items.length > 0) return response;
      firstEmpty ??= response;
    } catch (error) {
      firstError ??= error;
    }
  }

  if (firstEmpty) return firstEmpty;
  if (firstError) throw firstError;
  return emptyResponse;
}

function mergeResponses(groups: ItemsResponse[]): ItemsResponse {
  const items = mergeMediaItems(groups.map((group) => group.Items));
  const total = groups.reduce((sum, group) => sum + (group.TotalRecordCount ?? group.Items.length), 0);
  return {
    Items: items,
    TotalRecordCount: Math.max(total, items.length),
  };
}

export async function fetchFavoriteItems(limit = 400): Promise<ItemsResponse> {
  const cappedLimit = Math.max(1, limit);
  const mixed = await fallbackList(
    [
      favoriteParams("Movie,Series,Episode", cappedLimit, "flag"),
      favoriteParams("Movie,Series,Episode", cappedLimit, "filter"),
    ],
    { Items: [], TotalRecordCount: 0 },
  );
  if (mixed.Items.length > 0) return mixed;

  const perType = await Promise.allSettled(
    ["Movie", "Series", "Episode"].map((type) =>
      fallbackList(
        [favoriteParams(type, cappedLimit, "flag"), favoriteParams(type, cappedLimit, "filter")],
        { Items: [], TotalRecordCount: 0 },
      ),
    ),
  );
  const fulfilled = perType
    .filter((result): result is PromiseFulfilledResult<ItemsResponse> => result.status === "fulfilled")
    .map((result) => result.value);
  if (fulfilled.length > 0) return mergeResponses(fulfilled);

  const firstRejected = perType.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (firstRejected) throw firstRejected.reason;
  return mixed;
}

async function fetchPlayedItems(
  includeTypes: PersonalMediaTypes,
  startIndex: number,
  limit: number,
): Promise<ItemsResponse> {
  return fallbackList(
    [
      playedParams(includeTypes, startIndex, limit, "flag"),
      playedParams(includeTypes, startIndex, limit, "filter"),
    ],
    { Items: [], TotalRecordCount: 0 },
  );
}

function settle<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  return promise.then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason) => ({ status: "rejected" as const, reason }),
  );
}

export async function fetchPersonalHistory(payload: {
  includeTypes?: PersonalMediaTypes;
  startIndex?: number;
  limit?: number;
  includeResume?: boolean;
} = {}): Promise<PersonalHistoryResponse> {
  const includeTypes = payload.includeTypes ?? "Movie,Episode";
  const startIndex = Math.max(0, payload.startIndex ?? 0);
  const limit = Math.max(1, payload.limit ?? 120);
  const includeResume = payload.includeResume ?? startIndex === 0;
  const [playedResult, resumeResult] = await Promise.all([
    settle(fetchPlayedItems(includeTypes, startIndex, limit)),
    includeResume ? settle(api.resumeItemsAllAccounts()) : Promise.resolve(null),
  ]);

  if (playedResult.status === "rejected" && (!includeResume || resumeResult?.status === "rejected")) {
    throw playedResult.reason;
  }

  const played = playedResult.status === "fulfilled"
    ? playedResult.value
    : { Items: [], TotalRecordCount: 0 };

  if (!includeResume) {
    return {
      ...played,
      playedLoaded: played.Items.length,
      playedTotal: played.TotalRecordCount,
      resumeLoaded: 0,
    };
  }

  const resume = resumeResult?.status === "fulfilled"
    ? resumeResult.value
    : { Items: [], TotalRecordCount: 0 };
  const resumeItems = resume.Items.filter((item) => hasType(item, includeTypes));
  const mergedItems = sortHistoryItems(mergeMediaItems([resumeItems, played.Items]));
  const playedIds = new Set(played.Items.map(mediaItemKey));
  const resumeOnlyCount = resumeItems.filter((item) => !playedIds.has(mediaItemKey(item))).length;

  return {
    Items: mergedItems,
    TotalRecordCount: played.TotalRecordCount + resumeOnlyCount,
    playedLoaded: played.Items.length,
    playedTotal: played.TotalRecordCount,
    resumeLoaded: resumeItems.length,
  };
}
