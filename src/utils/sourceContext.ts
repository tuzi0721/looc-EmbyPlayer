import type { Router } from "vue-router";

import type { useAuthStore } from "@/stores/auth";
import type { MediaItem } from "@/types/models";

type AuthStore = ReturnType<typeof useAuthStore>;

export function mediaItemKey(item: MediaItem) {
  const source = item._source;
  if (!source?.serverId && !source?.accountId) return item.Id;
  return `${source.serverId || "server"}:${source.accountId || "account"}:${item.Id}`;
}

export function mediaItemSourceLabel(item: MediaItem) {
  const source = item._source;
  if (!source) return "";
  return source.serverName || source.username || "";
}

export async function openMediaItemFromSource(router: Router, auth: AuthStore, item: MediaItem) {
  const accountId = item._source?.accountId;
  if (accountId && auth.activeId !== accountId) {
    await auth.switchTo(accountId);
  }
  await router.push({
    path: `/item/${encodeURIComponent(item.Id)}`,
    query: item._source
      ? {
          server: item._source.serverId,
          account: item._source.accountId,
        }
      : undefined,
  });
}
