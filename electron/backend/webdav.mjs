import { networkRequest, policy, FAST_READ } from "./network/index.mjs";

const videoExtensions = new Set([
  "mp4",
  "mkv",
  "mov",
  "avi",
  "wmv",
  "flv",
  "webm",
  "m4v",
  "ts",
  "m2ts",
  "mpeg",
  "mpg",
  "3gp",
  "ogv",
  "rmvb",
]);
const subtitleExtensions = new Map([
  ["srt", 0],
  ["ass", 1],
  ["ssa", 2],
  ["vtt", 3],
]);
const posterExtensions = new Map([
  ["jpg", 0],
  ["jpeg", 1],
  ["png", 2],
  ["webp", 3],
  ["avif", 4],
  ["bmp", 5],
]);
const folderPosterStems = new Set(["poster", "cover", "folder"]);

const propfindBody = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname />
    <d:resourcetype />
    <d:getcontentlength />
    <d:getlastmodified />
    <d:getcontenttype />
  </d:prop>
</d:propfind>`;

function stringFrom(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function ensureHttpUrl(value, label = "WebDAV URL") {
  let parsed;
  try {
    parsed = new URL(String(value ?? "").trim());
  } catch {
    throw new Error(`${label} is invalid`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${label} must use http or https`);
  }
  return parsed;
}

function normalizeRootUrl(value) {
  const url = ensureHttpUrl(value, "WebDAV root URL");
  if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
  return url;
}

function encodePathSegment(segment) {
  return encodeURIComponent(segment).replace(/%2F/gi, "/");
}

function normalizeRelativePath(value) {
  const text = stringFrom(value).trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!text) return "";
  return text
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponentSafe(segment))
    .join("/");
}

function joinWebDavUrl(rootUrl, relativePath) {
  const path = normalizeRelativePath(relativePath);
  if (!path) return new URL(rootUrl.toString());
  const suffix = path
    .split("/")
    .filter(Boolean)
    .map(encodePathSegment)
    .join("/");
  return new URL(suffix.endsWith("/") ? suffix : `${suffix}/`, rootUrl);
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeXml(value) {
  return stringFrom(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function stripCdata(value) {
  return stringFrom(value).replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function tagPattern(tagName) {
  return String.raw`(?:[A-Za-z_][\w.-]*:)?${tagName}`;
}

function extractBlocks(xml, tagName) {
  const tag = tagPattern(tagName);
  const pattern = new RegExp(String.raw`<${tag}\b[^>]*>[\s\S]*?<\/${tag}>`, "gi");
  return stringFrom(xml).match(pattern) ?? [];
}

function extractTagText(block, tagName) {
  const tag = tagPattern(tagName);
  const pattern = new RegExp(String.raw`<${tag}\b[^>]*>([\s\S]*?)<\/${tag}>`, "i");
  const match = stringFrom(block).match(pattern);
  return match ? decodeXml(stripCdata(match[1])) : null;
}

function hasTag(block, tagName) {
  const tag = tagPattern(tagName);
  return new RegExp(String.raw`<${tag}\b`, "i").test(stringFrom(block));
}

function fileNameFromUrl(url) {
  const pathName = decodeURIComponentSafe(url.pathname).replace(/\/+$/, "");
  return pathName.split("/").filter(Boolean).pop() ?? url.hostname;
}

function extensionFromName(name) {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

function stemFromName(name) {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(0, index) : name;
}

function sidecarSubtitleRank(videoStem, subtitleStem) {
  const video = videoStem.toLowerCase();
  const subtitle = subtitleStem.toLowerCase();
  if (subtitle === video) return 0;
  for (const separator of [".", " ", "_", "-"]) {
    if (subtitle.startsWith(`${video}${separator}`)) return 1;
  }
  return null;
}

function normalizeComparableUrl(value) {
  const url = new URL(value.toString());
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function relativePathFromUrl(rootUrl, itemUrl, isDirectory) {
  const rootPath = decodeURIComponentSafe(rootUrl.pathname).replace(/\/+$/, "");
  const itemPath = decodeURIComponentSafe(itemUrl.pathname).replace(/\/+$/, "");
  let relative = itemPath;
  if (rootPath && itemPath.toLowerCase().startsWith(`${rootPath.toLowerCase()}/`)) {
    relative = itemPath.slice(rootPath.length + 1);
  } else {
    relative = itemPath.replace(/^\/+/, "");
  }
  if (isDirectory && relative && !relative.endsWith("/")) return `${relative}/`;
  return relative;
}

function numberFrom(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function modifiedTimeMs(value) {
  const text = stringFrom(value).trim();
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function sidecarSubtitlesFor(videoEntry, entries) {
  if (!videoEntry.playable) return [];
  const videoStem = stemFromName(videoEntry.name);
  return entries
    .filter((entry) => !entry.isDirectory && subtitleExtensions.has(entry.extension))
    .map((entry) => {
      const rank = sidecarSubtitleRank(videoStem, stemFromName(entry.name));
      if (rank == null) return null;
      return {
        name: entry.name,
        url: entry.url,
        extension: entry.extension,
        rank,
        extRank: subtitleExtensions.get(entry.extension) ?? 99,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.rank - right.rank || left.extRank - right.extRank || left.name.localeCompare(right.name))
    .slice(0, 8)
    .map(({ name, url, extension }) => ({ name, url, extension }));
}

function sidecarDanmakuFor(videoEntry, entries) {
  if (!videoEntry.playable) return null;
  const videoStem = stemFromName(videoEntry.name).toLowerCase();
  const candidates = new Set([
    `${videoStem}.xml`,
    `${videoStem}.danmaku.xml`,
    `${videoStem}.comments.xml`,
  ]);
  const match = entries.find(
    (entry) => !entry.isDirectory && entry.extension === "xml" && candidates.has(entry.name.toLowerCase()),
  );
  return match ? { name: match.name, url: match.url } : null;
}

function betterPoster(left, right) {
  if (!left) return right;
  const leftRank = posterExtensions.get(left.extension) ?? 99;
  const rightRank = posterExtensions.get(right.extension) ?? 99;
  return rightRank < leftRank ? right : left;
}

function sidecarPosterFor(videoEntry, entries) {
  if (!videoEntry.playable) return null;
  const videoStem = stemFromName(videoEntry.name).toLowerCase();
  let exact = null;
  let folderPoster = null;
  for (const entry of entries) {
    if (entry.isDirectory || !posterExtensions.has(entry.extension)) continue;
    const stem = stemFromName(entry.name).toLowerCase();
    if (stem === videoStem) exact = betterPoster(exact, entry);
    if (folderPosterStems.has(stem)) folderPoster = betterPoster(folderPoster, entry);
  }
  return exact ?? folderPoster;
}

function annotateSidecars(entries) {
  return entries.map((entry) => {
    if (!entry.playable) return entry;
    const sidecarSubtitles = sidecarSubtitlesFor(entry, entries);
    const sidecarDanmaku = sidecarDanmakuFor(entry, entries);
    const poster = sidecarPosterFor(entry, entries);
    return {
      ...entry,
      posterUrl: poster?.url ?? null,
      sidecarSubtitleCount: sidecarSubtitles.length,
      sidecarSubtitles,
      sidecarDanmaku,
    };
  });
}

function basicAuthorization(username, password) {
  const user = stringFrom(username);
  const pass = stringFrom(password);
  if (!user && !pass) return null;
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
}

function authHeaders(payload = {}) {
  const authorization = basicAuthorization(payload.username, payload.password);
  return authorization ? { Authorization: authorization } : {};
}

function playHeaders(payload = {}) {
  return Object.entries(authHeaders(payload));
}

function parseMultistatus(xml, rootUrl, requestUrl) {
  const current = normalizeComparableUrl(requestUrl);
  const entries = extractBlocks(xml, "response")
    .map((block) => {
      const href = extractTagText(block, "href");
      if (!href) return null;
      let itemUrl;
      try {
        itemUrl = new URL(href, requestUrl);
      } catch {
        return null;
      }
      if (normalizeComparableUrl(itemUrl) === current) return null;

      const isDirectory = hasTag(extractTagText(block, "resourcetype") ?? "", "collection");
      const displayName = extractTagText(block, "displayname") || fileNameFromUrl(itemUrl);
      const name = isDirectory ? displayName.replace(/\/+$/, "") : displayName;
      const extension = isDirectory ? "" : extensionFromName(name || fileNameFromUrl(itemUrl));

      return {
        name: name || fileNameFromUrl(itemUrl),
        url: itemUrl.toString(),
        path: relativePathFromUrl(rootUrl, itemUrl, isDirectory),
        isDirectory,
        extension,
        sizeBytes: numberFrom(extractTagText(block, "getcontentlength")) ?? 0,
        modifiedAtMs: modifiedTimeMs(extractTagText(block, "getlastmodified")),
        contentType: extractTagText(block, "getcontenttype"),
        playable: !isDirectory && videoExtensions.has(extension),
      };
    })
    .filter(Boolean);
  return annotateSidecars(entries)
    .sort((left, right) => {
      if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1;
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
    });
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const requestPolicy = policy(FAST_READ, {
    connectTimeoutMs: Math.min(timeoutMs ?? 15_000, 10_000),
    responseTimeoutMs: timeoutMs ?? 15_000,
    totalTimeoutMs: (timeoutMs ?? 15_000) * 3,
    maxAttempts: 3,
  });
  try {
    const result = await networkRequest(url.toString(), {
      ...init,
      policy: requestPolicy,
      parse: "text",
      context: "webdav_request",
    });
    return new Response(result.data, {
      status: result.status,
      headers: result.response.headers,
    });
  } catch (error) {
    throw error;
  }
}

export class WebDavClient {
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  headersFor(payload = {}) {
    return playHeaders(payload);
  }

  async list(payload = {}) {
    const rootUrl = normalizeRootUrl(payload.baseUrl);
    const relativePath = normalizeRelativePath(payload.path);
    const requestUrl = joinWebDavUrl(rootUrl, relativePath);
    const response = await fetchWithTimeout(
      requestUrl,
      {
        method: "PROPFIND",
        headers: {
          Accept: "application/xml,text/xml,*/*",
          "Content-Type": "application/xml; charset=utf-8",
          Depth: "1",
          ...authHeaders(payload),
        },
        body: propfindBody,
      },
      Number(payload.timeoutMs) || this.timeoutMs,
    );

    if (!response.ok) {
      throw new Error(`WebDAV PROPFIND failed: HTTP ${response.status}`);
    }

    const xml = await response.text();
    return {
      rootUrl: rootUrl.toString(),
      path: relativePath,
      directoryUrl: requestUrl.toString(),
      items: parseMultistatus(xml, rootUrl, requestUrl),
    };
  }
}
