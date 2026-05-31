import type { MediaItem } from "@/types/models";

const JAV_CODE_PATTERNS = [
  /\bFC2(?:[-_\s]?PPV)?[-_\s]?\d{5,7}\b/i,
  /\bHEYZO[-_\s]?\d{3,6}\b/i,
  /\b[A-Z]{2,6}[-_\s]?\d{3,6}(?:-C)?\b/i,
];

function searchableText(item: MediaItem) {
  return [
    item.Name,
    item.SeriesName,
    item.Overview,
    ...(item.Genres ?? []),
    ...((item.GenreItems ?? []).map((genre) => genre.Name)),
  ]
    .filter(Boolean)
    .join(" ");
}

export function looksLikeJavCode(item: MediaItem) {
  const text = searchableText(item);
  return JAV_CODE_PATTERNS.some((pattern) => pattern.test(text));
}

export function filterJavItems<T extends MediaItem>(items: T[], enabled: boolean): T[] {
  if (!enabled) return items;
  return items.filter((item) => !looksLikeJavCode(item));
}
