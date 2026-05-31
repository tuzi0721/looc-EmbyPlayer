import type { Line, MediaItem, Server } from "@/types/models";

export type MediaImageType = "Primary" | "Backdrop";

export interface MediaImageOptions {
  tag?: string | null;
  maxWidth?: number | string | null;
  width?: number | string | null;
  quality?: number | string | null;
  format?: string | null;
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
  return typeof window !== "undefined" && Boolean(window.hillsLite);
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
      encodeURIComponent(itemId),
      encodeURIComponent(imageType),
    ].join("/");
    const query = params.toString();
    return `hills-image://media/${route}${query ? `?${query}` : ""}`;
  }

  const sep = line.baseUrl.endsWith("/") ? "" : "/";
  const query = params.toString();
  return `${line.baseUrl}${sep}Items/${encodeURIComponent(itemId)}/Images/${imageType}${query ? `?${query}` : ""}`;
}

export function mediaItemImageUrl(
  server: Server | null | undefined,
  item: MediaItem | null | undefined,
  imageType: MediaImageType = "Backdrop",
  maxWidth = 1600,
): string | null {
  if (!item) return null;
  const tag =
    imageType === "Backdrop"
      ? item.BackdropImageTags?.[0] ?? item.ImageTags?.Primary
      : item.ImageTags?.Primary;
  return mediaImageUrl(server, item.Id, imageType, {
    maxWidth,
    quality: 82,
    format: "webp",
    tag,
  });
}
