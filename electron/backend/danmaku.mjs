import fs from "node:fs/promises";
import path from "node:path";

import { sameHttpOrigin } from "./url-security.mjs";

const DANMAKU_USER_AGENT = "Hills Lite/0.1.0 (danmaku)";

const PROVIDERS = [
  {
    id: "dandanplay",
    displayName: "DanDanPlay",
  },
];

function normalizeDanmakuBase(base) {
  if (typeof base !== "string" || !base.trim()) return null;
  const url = base.trim().replace(/\/+$/, "");
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
  return url;
}

function bodyPreview(body) {
  const preview = [...body].slice(0, 1200).join("");
  return `${preview}${body.length > preview.length ? "..." : ""}`
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

function numberFrom(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function fetchJson(url, init, context, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs ?? 15000));
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`${context}: http ${response.status} from ${response.url}; body preview: ${bodyPreview(body)}`);
    }
    if (!body.trim()) return null;
    try {
      return JSON.parse(body);
    } catch (error) {
      throw new Error(`${context}: failed to parse JSON from ${response.url} (status ${response.status}): ${error}; body preview: ${bodyPreview(body)}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function buildFileName(item) {
  if (item?.Type === "Episode") {
    const series = item.SeriesName || item.Name || "";
    const season = numberFrom(item.ParentIndexNumber) ?? 1;
    const episode = numberFrom(item.IndexNumber) ?? 1;
    return `${series} S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
  }
  return item?.Name || "";
}

function parseMode(value) {
  switch (Number.parseInt(value, 10)) {
    case 4:
      return "bottom";
    case 5:
      return "top";
    case 6:
      return "reverse";
    case 1:
    default:
      return "scroll";
  }
}

function parseColor(value) {
  const color = Number.parseInt(value, 10);
  if (!Number.isFinite(color)) return "#ffffff";
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function basicAuthorization(username, password) {
  const user = typeof username === "string" ? username : "";
  const pass = typeof password === "string" ? password : "";
  if (!user && !pass) return null;
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
}

function tokenAuthorization(token) {
  const value = typeof token === "string" ? token.trim() : "";
  return value || null;
}

function credentialBaseOrigin(value, credentialsPresent) {
  if (!credentialsPresent) return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("credentialBaseUrl is required when connector credentials are present");
  }
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("credentialBaseUrl is invalid");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("credentialBaseUrl must use http or https");
  }
  return parsed;
}

async function fetchScopedXml(url, payload, timeoutMs) {
  const authorization = basicAuthorization(payload.username, payload.password);
  const token = tokenAuthorization(payload.token);
  const credentialBase = credentialBaseOrigin(payload.credentialBaseUrl, Boolean(authorization || token));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs ?? 15000));
  let target = url;
  try {
    for (let redirectCount = 0; redirectCount <= 8; redirectCount += 1) {
      const headers = { Accept: "application/xml,text/xml,*/*" };
      if (credentialBase && sameHttpOrigin(target, credentialBase)) {
        if (authorization) headers.Authorization = authorization;
        else if (token) headers.Authorization = token;
      }
      const response = await fetch(target, {
        method: "GET",
        headers,
        redirect: "manual",
        signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) return response;
        await response.body?.cancel().catch(() => {});
        target = new URL(location, target);
        if (!["http:", "https:"].includes(target.protocol)) {
          throw new Error("danmaku XML redirect must use http or https");
        }
        continue;
      }
      return response;
    }
    throw new Error("danmaku XML redirect limit exceeded");
  } finally {
    clearTimeout(timeout);
  }
}

function parseComment(raw) {
  const parts = String(raw?.p ?? "").split(",");
  if (parts.length < 3) return null;
  const time = numberFrom(parts[0]);
  const text = typeof raw?.m === "string" ? raw.m : "";
  if (time == null || !text) return null;
  return {
    time,
    mode: parseMode(parts[1]),
    color: parseColor(parts[2]),
    text,
    source: "dandanplay",
  };
}

function decodeXmlEntities(value) {
  return String(value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseXmlComment(p, text) {
  const parts = String(p ?? "").split(",");
  if (parts.length < 3) return null;
  const time = numberFrom(parts[0]);
  const textValue = decodeXmlEntities(text).trim();
  if (time == null || !textValue) return null;
  return {
    time,
    mode: parseMode(parts[1]),
    color: parseColor(parts[3] ?? parts[2]),
    text: textValue,
    source: "xml",
  };
}

export function parseDanmakuXml(text, episodeId = "local-xml") {
  const comments = [];
  const pattern = /<d\b([^>]*)\bp=(["'])(.*?)\2[^>]*>([\s\S]*?)<\/d>/gi;
  let match;
  while ((match = pattern.exec(String(text ?? "")))) {
    const comment = parseXmlComment(match[3], match[4]);
    if (comment) comments.push(comment);
  }
  return {
    provider: "xml",
    episodeId,
    comments,
  };
}

export class DanmakuClient {
  constructor(store, emby) {
    this.store = store;
    this.emby = emby;
  }

  listProviders() {
    return PROVIDERS.map((provider) => ({ ...provider }));
  }

  providerById(providerId) {
    const id = providerId || "dandanplay";
    const provider = PROVIDERS.find((item) => item.id === id);
    if (!provider) throw new Error(`danmaku provider not found: ${id}`);
    return provider;
  }

  async fetch(itemId, providerId = null) {
    if (typeof itemId !== "string" || itemId.trim().length === 0) {
      throw new Error("fetch_danmaku requires an item id");
    }

    const provider = this.providerById(providerId);
    const { server, account } = await this.store.activePair();
    const item = await this.emby.getItem(server, account, itemId);
    const settings = await this.store.getSettings();

    if (provider.id === "dandanplay") {
      // The danmaku server is user-configured. With no base set, danmaku is
      // disabled — return null (not an error) so the UI can show a hint. We
      // never fall back to a hardcoded server.
      const apiBase = normalizeDanmakuBase(settings.danmakuApiBase);
      if (!apiBase) return null;
      return this.fetchDanDanPlay(item, settings.requestTimeoutMs, apiBase);
    }
    return null;
  }

  async importXml(payload) {
    if (payload && typeof payload === "object" && typeof payload.url === "string") {
      return this.importXmlUrl(payload);
    }
    const filePath = typeof payload === "string" ? payload : payload?.filePath;
    if (typeof filePath !== "string" || filePath.trim().length === 0) {
      throw new Error("import_danmaku_xml requires a file path");
    }
    const text = await fs.readFile(filePath, "utf8");
    const episodeId = path.basename(filePath);
    return parseDanmakuXml(text, episodeId);
  }

  async importXmlUrl(payload = {}) {
    const source = typeof payload.url === "string" ? payload.url.trim() : "";
    if (!source) throw new Error("import_danmaku_xml requires a URL");
    const url = new URL(source);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("danmaku XML URL must use http or https");
    }
    const settings = await this.store.getSettings();
    const response = await fetchScopedXml(url, payload, settings.requestTimeoutMs);
    if (!response.ok) {
      throw new Error(`danmaku XML fetch failed: HTTP ${response.status}`);
    }
    return parseDanmakuXml(await response.text(), path.basename(url.pathname) || "webdav-xml");
  }

  async fetchDanDanPlay(item, timeoutMs, apiBase) {
    const episodeId = await this.matchDanDanPlay(item, timeoutMs, apiBase);
    if (!episodeId) return null;

    const url = `${apiBase}/api/v2/comment/${encodeURIComponent(episodeId)}?withRelated=true&chConvert=0`;
    const parsed = await fetchJson(
      url,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": DANMAKU_USER_AGENT,
        },
      },
      "dandanplay comment",
      timeoutMs,
    );
    const comments = Array.isArray(parsed?.comments)
      ? parsed.comments.map(parseComment).filter(Boolean)
      : [];
    return {
      provider: "dandanplay",
      episodeId,
      comments,
    };
  }

  async matchDanDanPlay(item, timeoutMs, apiBase) {
    const fileName = buildFileName(item);
    if (!fileName) return null;

    const parsed = await fetchJson(
      `${apiBase}/api/v2/match`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": DANMAKU_USER_AGENT,
        },
        body: JSON.stringify({
          fileName,
          matchMode: "hashAndFileName",
        }),
      },
      "dandanplay match",
      timeoutMs,
    );

    if (!parsed?.isMatched) return null;
    const first = Array.isArray(parsed.matches) ? parsed.matches[0] : null;
    const episodeId = numberFrom(first?.episodeId);
    return episodeId == null ? null : String(episodeId);
  }
}
