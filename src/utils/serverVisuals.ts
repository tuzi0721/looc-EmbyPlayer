import type { Line, Server, ServerKind } from "@/types/models";

export function serverKindIcon(kind: ServerKind): string {
  return kind === "jellyfin" ? "simple-icons:jellyfin" : "lucide:server";
}

export function serverKindLabel(kind: ServerKind): string {
  return kind === "jellyfin" ? "Jellyfin" : "Emby";
}

export function serverActiveLine(server: Pick<Server, "activeLineId" | "lines">): Line | null {
  return server.lines.find((line) => line.id === server.activeLineId) ?? server.lines[0] ?? null;
}
