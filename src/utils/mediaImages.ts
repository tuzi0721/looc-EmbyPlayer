import type { Line, MediaItem, Server } from "@/types/models";

export type MediaImageType = "Primary" | "Backdrop" | "Thumb" | "Logo";

export interface MediaImageOptions {
  accountId?: string | null;
  accessToken?: string | null;
  tag?: string | null;
  maxWidth?: number | string | null;
  width?: number | string | null;
  quality?: number | string | null;
  format?: string | null;
}

interface MediaImageCandidate {
  itemId?: string | null;
  imageType: MediaImageType;
  tag?: string | null;
  allowUntagged?: boolean;
}

function activeLine(server: Server): Line | null {
  return server.lines.find((line) => line.id === server.activeLineId) ?? server.lines[0] ?? null;
}

function appendParam(params: URLSearchParams, key: string, value: unknown) {
  if (value == null || value === "") return;
  params.set(key, String(value));
}

function imageParams(options: MediaImageOptions): URLSearchParams {
  const params = new URLSearchParams();
  appendParam(params, "maxWidth", options.maxWidth);
  appendParam(params, "width", options.width);
  appendParam(params, "quality", options.quality);
  appendParam(params, "format", options.format);
  appendParam(params, "tag", options.tag);
  return params;
}

function hasElectronImageCache(): boolean {
  if (typeof window === "undefined" || !window.hillsLite) return false;
  if (window.__TAURI_INTERNALS__ || window.__TAURI__ || window.__TAURI_IPC__) return false;
  const { hostname, protocol } = window.location;
  return hostname !== "tauri.localhost" && protocol !== "tauri:";
}

export function mediaImageUrl(
  server: Server | null | undefined,
  itemId: string | null | undefined,
  imageType: MediaImageType = "Primary",
  options: MediaImageOptions = {},
): string | null {
  if (!server || !itemId) return null;
  const line = activeLine(server);
  if (!line) return null;

  const params = imageParams(options);
  if (hasElectronImageCache()) {
    const route = [
      encodeURIComponent(server.id),
      encodeURIComponent(line.id),
      ...(options.accountId ? [encodeURIComponent(options.accountId)] : []),
      encodeURIComponent(itemId),
      encodeURIComponent(imageType),
    ].join("/");
    const query = params.toString();
    return `hills-image://media/${route}${query ? `?${query}` : ""}`;
  }

  const sep = line.baseUrl.endsWith("/") ? "" : "/";
  appendParam(params, "api_key", options.accessToken);
  const query = params.toString();
  return `${line.baseUrl}${sep}Items/${encodeURIComponent(itemId)}/Images/${imageType}${query ? `?${query}` : ""}`;
}

export function mediaItemImageUrls(
  server: Server | null | undefined,
  item: MediaItem | null | undefined,
  imageType: MediaImageType = "Backdrop",
  maxWidth = 1600,
  options: Pick<MediaImageOptions, "accountId" | "accessToken"> = {},
): string[] {
  if (!item) return [];
  const allowParent = item.Type === "Episode";
  const parentBackdropId = item.ParentBackdropItemId ?? item.SeriesId;
  const parentBackdropTag = item.ParentBackdropImageTags?.[0] ?? item.BackdropImageTags?.[0];
  const parentThumbId = item.ParentThumbItemId ?? item.SeriesId;
  const parentThumbTag = item.ParentThumbImageTag ?? item.SeriesThumbImageTag ?? item.ImageTags?.Thumb;
  const parentPrimaryId = item.ParentPrimaryImageItemId ?? item.SeriesId;
  const parentPrimaryTag = item.ParentPrimaryImageTag ?? item.SeriesPrimaryImageTag;
  const parentLogoId = item.ParentLogoItemId ?? item.SeriesId;
  const parentLogoTag = item.ParentLogoImageTag;
  const candidates: MediaImageCandidate[] = [];
  const seen = new Set<string>();

  function add(candidate: MediaImageCandidate) {
    if (!candidate.itemId || (!candidate.tag && !candidate.allowUntagged)) return;
    const key = `${candidate.itemId}:${candidate.imageType}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  }

  if (imageType === "Backdrop") {
    add({ itemId: item.Id, imageType: "Backdrop", tag: item.BackdropImageTags?.[0] });
    add({ itemId: parentBackdropId, imageType: "Backdrop", tag: parentBackdropTag });
    add({ itemId: parentThumbId, imageType: "Thumb", tag: parentThumbTag, allowUntagged: allowParent });
    add({ itemId: parentPrimaryId, imageType: "Primary", tag: parentPrimaryTag, allowUntagged: allowParent });
    add({ itemId: item.Id, imageType: "Primary", tag: item.ImageTags?.Primary, allowUntagged: true });
    add({ itemId: parentBackdropId, imageType: "Backdrop", tag: parentBackdropTag, allowUntagged: allowParent });
  } else if (imageType === "Thumb") {
    add({ itemId: item.Id, imageType: "Thumb", tag: item.ImageTags?.Thumb });
    add({ itemId: parentThumbId, imageType: "Thumb", tag: parentThumbTag, allowUntagged: allowParent });
    add({ itemId: parentBackdropId, imageType: "Backdrop", tag: parentBackdropTag });
    add({ itemId: parentPrimaryId, imageType: "Primary", tag: parentPrimaryTag, allowUntagged: allowParent });
    add({ itemId: item.Id, imageType: "Primary", tag: item.ImageTags?.Primary, allowUntagged: true });
    add({ itemId: parentBackdropId, imageType: "Backdrop", tag: parentBackdropTag, allowUntagged: allowParent });
  } else if (imageType === "Logo") {
    add({ itemId: item.Id, imageType: "Logo", tag: item.ImageTags?.Logo });
    add({ itemId: parentLogoId, imageType: "Logo", tag: parentLogoTag, allowUntagged: allowParent });
  } else {
    add({ itemId: item.Id, imageType: "Primary", tag: item.ImageTags?.Primary, allowUntagged: true });
    add({ itemId: parentPrimaryId, imageType: "Primary", tag: parentPrimaryTag, allowUntagged: allowParent });
    add({ itemId: parentThumbId, imageType: "Thumb", tag: parentThumbTag, allowUntagged: allowParent });
    add({ itemId: parentBackdropId, imageType: "Backdrop", tag: parentBackdropTag, allowUntagged: allowParent });
  }

  return candidates
    .map((candidate) =>
      mediaImageUrl(server, candidate.itemId, candidate.imageType, {
        accountId: options.accountId ?? item._source?.accountId,
        accessToken: options.accessToken,
        maxWidth,
        quality: 82,
        format: "webp",
        tag: candidate.tag,
      }),
    )
    .filter((url): url is string => Boolean(url));
}

export function mediaItemImageUrl(
  server: Server | null | undefined,
  item: MediaItem | null | undefined,
  imageType: MediaImageType = "Backdrop",
  maxWidth = 1600,
  options: Pick<MediaImageOptions, "accountId" | "accessToken"> = {},
): string | null {
  return mediaItemImageUrls(server, item, imageType, maxWidth, options)[0] ?? null;
}
