import { api } from "@/api";
import type { ItemsResponse, MediaItem } from "@/types/models";

export type PersonalMediaTypes = "Movie,Episode" | "Movie" | "Episode";

export interface PersonalHistoryResponse extends ItemsResponse {
  playedLoaded: number;
  playedTotal: number;
  resumeLoaded: number;
}

const PERSONAL_FIELDS =
  "PrimaryImageAspectRatio,ProductionYear,Overview,UserData,SeriesInfo,RunTimeTicks";

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
      const previous = merged.get(item.Id);
      merged.set(
        item.Id,
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

export function fetchFavoriteItems(limit = 400) {
  return api.listItems({
    params: [
      ["Filters", "IsFavorite"],
      ["Recursive", "true"],
      ["IncludeItemTypes", "Movie,Series,Episode"],
      ["Fields", PERSONAL_FIELDS],
      ["SortBy", "SortName"],
      ["SortOrder", "Ascending"],
      ["Limit", String(limit)],
    ],
  });
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
  const played = await api.playbackHistory({ includeTypes, startIndex, limit });

  if (!includeResume) {
    return {
      ...played,
      playedLoaded: played.Items.length,
      playedTotal: played.TotalRecordCount,
      resumeLoaded: 0,
    };
  }

  const resume = await api.resumeItems();
  const resumeItems = resume.Items.filter((item) => hasType(item, includeTypes));
  const mergedItems = sortHistoryItems(mergeMediaItems([resumeItems, played.Items]));
  const playedIds = new Set(played.Items.map((item) => item.Id));
  const resumeOnlyCount = resumeItems.filter((item) => !playedIds.has(item.Id)).length;

  return {
    Items: mergedItems,
    TotalRecordCount: played.TotalRecordCount + resumeOnlyCount,
    playedLoaded: played.Items.length,
    playedTotal: played.TotalRecordCount,
    resumeLoaded: resumeItems.length,
  };
}
