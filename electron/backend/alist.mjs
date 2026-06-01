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

function stringFrom(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function ensureHttpUrl(value, label = "Alist URL") {
  let parsed;
  try {
    parsed = new URL(String(value ?? "").trim());
  } catch {
    throw new Error(`${label} is invalid`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${label} must use http or https`);
  }
  if (!parsed.pathname.endsWith("/")) parsed.pathname = `${parsed.pathname}/`;
  return parsed;
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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

function apiPathFromRelative(value) {
  const relative = normalizeRelativePath(value);
  return relative ? `/${relative}` : "/";
}

function joinRelativePath(parent, name, isDirectory) {
  const base = normalizeRelativePath(parent);
  const leaf = stringFrom(name).replace(/^\/+|\/+$/g, "");
  const joined = [base, leaf].filter(Boolean).join("/");
  return isDirectory && joined ? `${joined}/` : joined;
}

function extensionFromName(name) {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

function modifiedTimeMs(value) {
  const parsed = Date.parse(stringFrom(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function numberFrom(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function alistApiUrl(rootUrl, endpoint) {
  return new URL(`api/fs/${endpoint}`, rootUrl);
}

function alistDownloadUrl(rootUrl, path, sign) {
  const encoded = normalizeRelativePath(path)
    .split("/")
    .filter(Boolean)
    .map(encodePathSegment)
    .join("/");
  const url = new URL(`d/${encoded}`, rootUrl);
  const cleanSign = stringFrom(sign).trim();
  if (cleanSign) url.searchParams.set("sign", cleanSign);
  return url.toString();
}

function alistWebDirectoryUrl(rootUrl, path) {
  const normalized = normalizeRelativePath(path);
  return normalized ? new URL(`${normalized}/`, rootUrl).toString() : rootUrl.toString();
}

function authHeaders(payload = {}) {
  const token = stringFrom(payload.token).trim();
  return token ? { Authorization: token } : {};
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function assertAlistResponse(value, action) {
  if (!value || typeof value !== "object") throw new Error(`Alist ${action} returned invalid JSON`);
  const code = Number(value.code);
  if (Number.isFinite(code) && code !== 200) {
    throw new Error(`Alist ${action} failed: ${value.message ?? `code ${code}`}`);
  }
  return value.data ?? {};
}

function entryFromContent(rootUrl, currentPath, item) {
  const name = stringFrom(item?.name).replace(/\/+$/g, "");
  if (!name) return null;
  const isDirectory = item?.is_dir === true;
  const path = joinRelativePath(currentPath, name, isDirectory);
  const extension = isDirectory ? "" : extensionFromName(name);
  return {
    name,
    path,
    url: isDirectory ? alistWebDirectoryUrl(rootUrl, path) : alistDownloadUrl(rootUrl, path, item?.sign),
    isDirectory,
    extension,
    sizeBytes: numberFrom(item?.size),
    modifiedAtMs: modifiedTimeMs(item?.modified),
    contentType: item?.type == null ? null : String(item.type),
    thumb: stringFrom(item?.thumb) || null,
    sign: stringFrom(item?.sign) || null,
    playable: !isDirectory && videoExtensions.has(extension),
  };
}

export class AlistClient {
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  headersFor(payload = {}) {
    return Object.entries(authHeaders(payload));
  }

  async post(rootUrl, endpoint, payload = {}) {
    const response = await fetchWithTimeout(
      alistApiUrl(rootUrl, endpoint),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...authHeaders(payload),
        },
        body: JSON.stringify(payload.body ?? {}),
      },
      Number(payload.timeoutMs) || this.timeoutMs,
    );
    if (!response.ok) throw new Error(`Alist ${endpoint} failed: HTTP ${response.status}`);
    return assertAlistResponse(await response.json(), endpoint);
  }

  async list(payload = {}) {
    const rootUrl = ensureHttpUrl(payload.baseUrl, "Alist root URL");
    const relativePath = normalizeRelativePath(payload.path);
    const data = await this.post(rootUrl, "list", {
      ...payload,
      body: {
        path: apiPathFromRelative(relativePath),
        password: stringFrom(payload.pathPassword),
        page: Math.max(1, Number(payload.page) || 1),
        per_page: Math.max(0, Number(payload.perPage) || 0),
        refresh: payload.refresh === true,
      },
    });
    const items = (Array.isArray(data.content) ? data.content : [])
      .map((item) => entryFromContent(rootUrl, relativePath, item))
      .filter(Boolean)
      .sort((left, right) => {
        if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1;
        return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
      });

    return {
      rootUrl: rootUrl.toString(),
      path: relativePath,
      directoryUrl: alistWebDirectoryUrl(rootUrl, relativePath),
      total: Number(data.total) || items.length,
      provider: data.provider == null ? null : String(data.provider),
      items,
    };
  }

  async resolveFile(payload = {}) {
    const rootUrl = ensureHttpUrl(payload.baseUrl, "Alist root URL");
    const relativePath = normalizeRelativePath(payload.path);
    if (!relativePath) throw new Error("Alist file path is required");
    const data = await this.post(rootUrl, "get", {
      ...payload,
      body: {
        path: apiPathFromRelative(relativePath),
        password: stringFrom(payload.pathPassword),
      },
    });
    return {
      path: relativePath,
      name: relativePath.split("/").filter(Boolean).pop() ?? relativePath,
      url: stringFrom(data.raw_url) || alistDownloadUrl(rootUrl, relativePath, data.sign),
    };
  }
}
