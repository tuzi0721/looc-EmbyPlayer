export function normalizeConnectorPath(path?: string | null): string {
  if (typeof path !== "string") return "";
  return path.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function connectorPathLabel(path?: string | null): string {
  const normalized = normalizeConnectorPath(path);
  return normalized ? `/${normalized}` : "/";
}

export function hasConnectorPath(path?: string | null): boolean {
  return normalizeConnectorPath(path).length > 0;
}

export function connectorTitle(baseUrl: string, path?: string | null): string {
  return hasConnectorPath(path) ? `${baseUrl} - ${connectorPathLabel(path)}` : baseUrl;
}
