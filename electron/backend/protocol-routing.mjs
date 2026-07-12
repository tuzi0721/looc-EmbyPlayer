export const PROTOCOL_SCHEME = "rodelplayer";

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function safeItemId(value) {
  if (typeof value !== "string") return null;
  const decoded = safeDecode(value);
  if (
    !decoded ||
    decoded === "." ||
    decoded === ".." ||
    !/^[A-Za-z0-9._~-]{1,256}$/.test(decoded)
  ) {
    return null;
  }
  return decoded;
}

function hasRawDotSegment(value) {
  const afterScheme = value.slice(value.indexOf(":") + 1).split(/[?#]/, 1)[0];
  if (afterScheme.includes("\\")) return true;
  const rawParts = afterScheme.split("/");
  for (const rawPart of rawParts) {
    if (!rawPart) continue;
    const decoded = safeDecode(rawPart);
    if (decoded == null || decoded === "." || decoded === ".." || decoded.includes("\\")) return true;
  }
  return false;
}

export function routeFromProtocolUrl(value) {
  if (typeof value !== "string" || value.length > 2048 || hasRawDotSegment(value)) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== `${PROTOCOL_SCHEME}:`) return null;
  if (url.username || url.password || url.port || url.hash) return null;

  const allowedQueryNames = new Set(["action", "itemId", "id"]);
  for (const name of url.searchParams.keys()) {
    if (!allowedQueryNames.has(name) || url.searchParams.getAll(name).length !== 1) return null;
  }

  const hasAuthority = value.slice(PROTOCOL_SCHEME.length + 1).startsWith("//");
  const host = safeDecode(url.hostname || "");
  if (host == null) return null;
  const parts = [];
  for (const rawPart of url.pathname.split("/").filter(Boolean)) {
    const part = safeDecode(rawPart);
    if (part == null || part === "." || part === "..") return null;
    parts.push(part);
  }

  let pathAction = "";
  let payload = null;
  if (hasAuthority) {
    pathAction = host.toLowerCase();
    if (parts.length > 1) return null;
    payload = parts[0] ?? null;
  } else {
    if (host || parts.length > 2) return null;
    pathAction = (parts[0] ?? "").toLowerCase();
    payload = parts[1] ?? null;
  }

  const queryAction = url.searchParams.get("action");
  const action = (queryAction || pathAction).toLowerCase();
  if (queryAction && pathAction && queryAction.toLowerCase() !== pathAction) return null;

  const itemValues = [url.searchParams.get("itemId"), url.searchParams.get("id")].filter(Boolean);
  if (itemValues.length > 1 && itemValues[0] !== itemValues[1]) return null;
  const queryItemId = itemValues[0] ?? null;
  if (queryItemId && payload && safeItemId(queryItemId) !== safeItemId(payload)) return null;
  const itemId = safeItemId(queryItemId || payload);

  if (action === "play" || action === "player") {
    return itemId ? `/player/${encodeURIComponent(itemId)}` : null;
  }
  if (action === "item" || action === "detail") {
    return itemId ? `/item/${encodeURIComponent(itemId)}` : null;
  }
  if (payload || queryItemId) return null;
  if (action === "downloads" || action === "download") return "/downloads";
  if (action === "remote") return "/remote";
  if (action === "settings") return "/settings";
  return null;
}

export function extractProtocolUrls(argv = []) {
  return argv.filter((value) => {
    return typeof value === "string" && value.toLowerCase().startsWith(`${PROTOCOL_SCHEME}:`);
  });
}
