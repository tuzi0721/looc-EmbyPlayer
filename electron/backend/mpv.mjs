import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function forceKillProcessTree(pid) {
  if (!pid || process.platform !== "win32") return Promise.resolve();
  try {
    return new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.once("error", () => resolve());
      killer.once("exit", () => resolve());
    });
  } catch {
    // Best-effort fallback for stale mpv process trees.
    return Promise.resolve();
  }
}

function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode != null || child.signalCode != null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      child.off("exit", done);
      child.off("error", done);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.off("exit", done);
      child.off("error", done);
      resolve(false);
    }, timeoutMs);
    child.once("exit", done);
    child.once("error", done);
  });
}

function writeAndFlush(socket, payload, timeoutMs = 150) {
  if (!socket || socket.destroyed || !socket.writable) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    socket.write(payload, "utf8", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function pathCandidates() {
  return [
    process.resourcesPath ? path.join(process.resourcesPath, "mpv", "mpv.exe") : null,
    path.join(path.dirname(process.execPath), "resources", "mpv", "mpv.exe"),
    path.resolve("src-tauri", "resources", "mpv", "mpv.exe"),
    // No target/debug fallback: it can shadow the canonical resources/mpv with a stale copy.
    path.resolve("src-tauri", "target", "release", "resources", "mpv", "mpv.exe"),
  ].filter(Boolean);
}

export function resolveMpv() {
  for (const candidate of pathCandidates()) {
    if (fileExists(candidate)) {
      return {
        found: true,
        path: candidate,
        bundled: true,
      };
    }
  }

  return { found: false, path: pathCandidates()[0] ?? "resources/mpv/mpv.exe", bundled: true };
}

// The bundled mpv progress reporter lives beside mpv.exe in resources/mpv/.
export function resolveReporterScript(mpvExePath) {
  try {
    const candidate = path.join(path.dirname(mpvExePath), "hills_external_reporter.lua");
    return fileExists(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

// User-editable mpv.conf shared with the Tauri runtime
// (%APPDATA%/app.embyplayer/mpv.conf); injected via --include when present.
export function resolveUserMpvConf() {
  try {
    const base = process.env.APPDATA;
    if (!base) return null;
    const candidate = path.join(base, "app.embyplayer", "mpv.conf");
    return fileExists(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function parseTrackKind(value) {
  if (value === "video") return "video";
  if (value === "audio") return "audio";
  if (value === "sub") return "subtitle";
  return null;
}

function useReparentEmbed() {
  return (
    process.env.HILLS_ELECTRON_MPV_WID !== "0" &&
    process.env.HILLS_ELECTRON_MPV_NATIVE_CHILD !== "0" &&
    process.env.HILLS_ELECTRON_MPV_REPARENT !== "0"
  );
}

function numberFrom(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseChapters(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((chapter, index) => ({
      index,
      title: chapter?.title ?? null,
      timeMs: Math.floor(Math.max(0, numberFrom(chapter?.time, 0)) * 1000),
    }))
    .filter((chapter) => Number.isFinite(chapter.timeMs));
}

function defaultSnapshot() {
  return {
    url: null,
    paused: true,
    positionMs: 0,
    durationMs: 0,
    speed: 1,
    volume: 80,
    muted: false,
    eof: false,
    tracks: [],
    chapters: [],
    chapter: null,
    secondarySubId: null,
    subDelayMs: 0,
    subScale: 1,
    networkBps: null,
    bufferedMs: 0,
    buffering: false,
    cacheBufferingState: null,
    videoCodec: null,
    audioCodec: null,
    videoParams: null,
    videoOutParams: null,
    osdDimensions: null,
    audioParams: null,
    hwdecCurrent: null,
    keepaspect: true,
    panscan: 0,
    videoZoom: 0,
    videoScaleX: 1,
    videoScaleY: 1,
    videoAspectOverride: -2,
    containerFps: null,
    estimatedVfFps: null,
    videoBitrate: null,
    audioBitrate: null,
    frameDropCount: null,
    decoderFrameDropCount: null,
    voFrameDropCount: null,
  };
}

const PLAYBACK_PROXY_HOST = "127.0.0.1";
const PLAYBACK_PROXY_ROUTE = "/v1/";
const MAX_PLAYLIST_BYTES = 8 * 1024 * 1024;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const FORWARDED_REQUEST_HEADERS = new Set([
  "accept",
  "accept-language",
  "cache-control",
  "if-modified-since",
  "if-none-match",
  "if-range",
  "pragma",
  "range",
]);
const BLOCKED_RESPONSE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "set-cookie",
  "set-cookie2",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const BLOCKED_CREDENTIAL_HEADERS = new Set([
  "connection",
  "content-length",
  "cookie",
  "host",
  "proxy-authorization",
  "range",
  "transfer-encoding",
]);

function ensureHttpUrl(value, label = "playback URL") {
  let parsed;
  try {
    parsed = value instanceof URL ? new URL(value.toString()) : new URL(String(value ?? "").trim());
  } catch {
    throw new Error(`${label} is invalid`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${label} must use http or https`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not contain URL credentials`);
  }
  parsed.hash = "";
  return parsed;
}

function normalizeCredentialHeaders(value) {
  if (!Array.isArray(value)) return [];
  const normalized = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const name = String(entry[0] ?? "").trim();
    const headerValue = String(entry[1] ?? "");
    const lower = name.toLowerCase();
    if (!name || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
      throw new Error("connector credential header name is invalid");
    }
    if (BLOCKED_CREDENTIAL_HEADERS.has(lower)) {
      throw new Error(`connector credential header is not allowed: ${name}`);
    }
    if (/[\r\n]/.test(headerValue)) {
      throw new Error(`connector credential header contains a newline: ${name}`);
    }
    if (headerValue.length === 0) continue;
    normalized.push([name, headerValue]);
  }
  return normalized;
}

function filteredResponseHeaders(headers, { playlist = false } = {}) {
  const result = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    const lower = name.toLowerCase();
    if (value == null || BLOCKED_RESPONSE_HEADERS.has(lower)) continue;
    if (playlist && ["accept-ranges", "content-length", "content-range"].includes(lower)) continue;
    result[name] = value;
  }
  return result;
}

function playlistKind(targetUrl, headers) {
  const contentType = String(headers?.["content-type"] ?? "").toLowerCase();
  const pathname = targetUrl.pathname.toLowerCase();
  if (
    pathname.endsWith(".m3u8") ||
    contentType.includes("application/vnd.apple.mpegurl") ||
    contentType.includes("application/x-mpegurl") ||
    contentType.includes("audio/mpegurl")
  ) {
    return "hls";
  }
  if (pathname.endsWith(".mpd") || contentType.includes("application/dash+xml")) {
    return "dash";
  }
  return null;
}

function maskUrlTemplates(value) {
  const source = String(value ?? "");
  const placeholders = [];
  let prefix = "__HILLS_PROXY_TEMPLATE_";
  while (source.includes(prefix)) prefix = `_${prefix}`;
  const masked = source.replace(/\{\$[A-Za-z0-9_-]+\}|\$[^$\r\n]+\$/g, (match) => {
    const marker = `${prefix}${placeholders.length}__`;
    placeholders.push([marker, match]);
    return marker;
  });
  return {
    masked,
    restore(text) {
      let restored = String(text);
      for (const [marker, original] of placeholders) {
        restored = restored.split(marker).join(original);
      }
      return restored;
    },
  };
}

function decodeXmlUrl(value) {
  return String(value ?? "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function encodeXmlUrl(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function rewriteHlsPlaylist(text, baseUrl, rewriteReference) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => {
      if (!line) return line;
      if (!line.startsWith("#")) return rewriteReference(line, baseUrl);
      return line.replace(/\bURI=(["'])(.*?)\1/gi, (_match, quote, reference) => (
        `URI=${quote}${rewriteReference(reference, baseUrl)}${quote}`
      ));
    })
    .join(String(text).includes("\r\n") ? "\r\n" : "\n");
}

function rewriteDashPlaylist(text, baseUrl, rewriteReference) {
  const rewriteXmlReference = (value) => encodeXmlUrl(
    rewriteReference(decodeXmlUrl(value), baseUrl),
  );
  return String(text)
    .replace(
      /<BaseURL(\s[^>]*)?>([\s\S]*?)<\/BaseURL>/gi,
      (_match, attributes = "", value) => {
        const leading = value.match(/^\s*/)?.[0] ?? "";
        const trailing = value.match(/\s*$/)?.[0] ?? "";
        const reference = value.slice(leading.length, value.length - trailing.length);
        return `<BaseURL${attributes}>${leading}${rewriteXmlReference(reference)}${trailing}</BaseURL>`;
      },
    )
    .replace(
      /\b(media|initialization|sourceURL|index|href|url)=(["'])(.*?)\2/gi,
      (_match, name, quote, value) => (
        `${name}=${quote}${rewriteXmlReference(value)}${quote}`
      ),
    );
}

async function readLimitedBody(stream, limit = MAX_PLAYLIST_BYTES) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > limit) throw new Error(`playlist exceeds ${limit} bytes`);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
}

function sendProxyError(response, status, message) {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  const body = Buffer.from(String(message ?? "playback proxy error"), "utf8");
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": String(body.length),
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(body);
}

/**
 * Loopback-only credential boundary for connector playback.
 *
 * mpv receives only an opaque local URL and no connector Authorization header.
 * Every upstream request (including redirects and playlist children) is mapped
 * back through this server, which attaches credentials only when the target
 * origin exactly matches credentialBaseUrl.
 */
export class ScopedPlaybackProxy {
  constructor(options = {}) {
    this.host = options.host ?? PLAYBACK_PROXY_HOST;
    this.requestTimeoutMs = Math.max(1000, Number(options.requestTimeoutMs ?? 30_000));
    this.server = null;
    this.origin = null;
    this.activeSession = null;
    this.activeRequests = new Set();
    this.starting = null;
  }

  get hasActiveSession() {
    return Boolean(this.activeSession);
  }

  async ensureStarted() {
    if (this.server?.listening && this.origin) return;
    if (!this.starting) {
      this.starting = new Promise((resolve, reject) => {
        const server = http.createServer((request, response) => {
          void this.handleRequest(request, response);
        });
        server.on("clientError", (_error, socket) => {
          socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
        });
        server.once("error", reject);
        server.listen(0, this.host, () => {
          server.off("error", reject);
          const address = server.address();
          if (!address || typeof address === "string") {
            server.close();
            reject(new Error("playback proxy failed to bind a loopback port"));
            return;
          }
          this.server = server;
          this.origin = `http://${this.host}:${address.port}`;
          resolve();
        });
      }).finally(() => {
        this.starting = null;
      });
    }
    await this.starting;
  }

  async openSession({ url, credentialBaseUrl, headers, userAgent = null }) {
    const target = ensureHttpUrl(url);
    const credentialHeaders = normalizeCredentialHeaders(headers);
    if (credentialHeaders.length === 0) {
      throw new Error("credential proxy requires at least one connector credential header");
    }
    const credentialBase = ensureHttpUrl(credentialBaseUrl, "credentialBaseUrl");
    await this.ensureStarted();
    this.clearSession();
    const token = randomBytes(32).toString("base64url");
    const normalizedUserAgent =
      typeof userAgent === "string" && userAgent.trim() && !/[\r\n]/.test(userAgent)
        ? userAgent.trim()
        : null;
    this.activeSession = {
      token,
      credentialOrigin: credentialBase.origin,
      credentialHeaders,
      userAgent: normalizedUserAgent,
    };
    return this.urlFor(target);
  }

  clearSession() {
    this.activeSession = null;
    for (const active of this.activeRequests) {
      active.upstream.destroy(new Error("playback credential session was replaced"));
      if (!active.response.writableEnded) active.response.destroy();
    }
    this.activeRequests.clear();
  }

  async shutdown() {
    this.clearSession();
    const server = this.server;
    this.server = null;
    this.origin = null;
    if (!server) return;
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    await new Promise((resolve) => server.close(() => resolve()));
  }

  urlFor(value) {
    const session = this.activeSession;
    if (!session || !this.origin) {
      throw new Error("playback credential session is not active");
    }
    const target = ensureHttpUrl(value);
    const scheme = target.protocol.slice(0, -1);
    const authority = Buffer.from(target.host, "utf8").toString("base64url");
    return `${this.origin}${PLAYBACK_PROXY_ROUTE}${session.token}/${scheme}/${authority}${target.pathname}${target.search}`;
  }

  rewriteReference(reference, baseUrl) {
    const original = String(reference ?? "");
    const leading = original.match(/^\s*/)?.[0] ?? "";
    const trailing = original.match(/\s*$/)?.[0] ?? "";
    const value = original.slice(leading.length, original.length - trailing.length);
    if (!value || /^(?:data|blob|urn|skd):/i.test(value)) return original;
    try {
      const template = maskUrlTemplates(value);
      const resolved = ensureHttpUrl(new URL(template.masked, baseUrl));
      return `${leading}${template.restore(this.urlFor(resolved))}${trailing}`;
    } catch {
      if (/^(?:https?:)?\/\//i.test(value) || value.startsWith("/")) {
        throw new Error("playlist contains an invalid HTTP resource URL");
      }
      return original;
    }
  }

  parseTarget(requestUrl) {
    if (!this.origin) throw new Error("playback proxy is not listening");
    const local = new URL(requestUrl, this.origin);
    const match = /^\/v1\/([^/]+)\/(http|https)\/([^/]+)(\/.*)?$/.exec(local.pathname);
    if (!match) throw new Error("playback proxy route is invalid");
    const [, token, scheme, encodedAuthority, suffix = "/"] = match;
    const session = this.activeSession;
    if (!session || token !== session.token) {
      const error = new Error("playback credential session expired");
      error.statusCode = 410;
      throw error;
    }
    let authority;
    try {
      authority = Buffer.from(encodedAuthority, "base64url").toString("utf8");
    } catch {
      throw new Error("playback proxy authority is invalid");
    }
    if (!authority || /[\s/@]/.test(authority)) {
      throw new Error("playback proxy authority is invalid");
    }
    return ensureHttpUrl(`${scheme}://${authority}${suffix}${local.search}`);
  }

  requestHeaders(request, target, session) {
    const headers = {};
    for (const [name, value] of Object.entries(request.headers ?? {})) {
      const lower = name.toLowerCase();
      if (!FORWARDED_REQUEST_HEADERS.has(lower) || value == null) continue;
      headers[name] = value;
    }
    headers["Accept-Encoding"] = "identity";
    const incomingUserAgent = request.headers?.["user-agent"];
    const userAgent = session.userAgent || (
      typeof incomingUserAgent === "string" && !/[\r\n]/.test(incomingUserAgent)
        ? incomingUserAgent
        : null
    );
    if (userAgent) headers["User-Agent"] = userAgent;
    if (target.origin === session.credentialOrigin) {
      for (const [name, value] of session.credentialHeaders) headers[name] = value;
    }
    return headers;
  }

  async handleRequest(request, response) {
    try {
      const remoteAddress = request.socket?.remoteAddress;
      if (remoteAddress !== this.host && remoteAddress !== `::ffff:${this.host}`) {
        sendProxyError(response, 403, "playback proxy accepts loopback clients only");
        return;
      }
      const expectedHost = this.origin ? new URL(this.origin).host : "";
      if (request.headers.host !== expectedHost) {
        sendProxyError(response, 403, "playback proxy Host header is invalid");
        return;
      }
      if (!["GET", "HEAD"].includes(request.method ?? "")) {
        response.setHeader("Allow", "GET, HEAD");
        sendProxyError(response, 405, "playback proxy method is not allowed");
        return;
      }
      const target = this.parseTarget(request.url ?? "/");
      const session = this.activeSession;
      if (!session) {
        sendProxyError(response, 410, "playback credential session expired");
        return;
      }
      await this.forwardRequest(request, response, target, session);
    } catch (error) {
      sendProxyError(
        response,
        Number(error?.statusCode) || 400,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  forwardRequest(request, response, target, session) {
    return new Promise((resolve) => {
      const transport = target.protocol === "https:" ? https : http;
      const upstream = transport.request(
        target,
        {
          method: request.method,
          headers: this.requestHeaders(request, target, session),
        },
        (upstreamResponse) => {
          void this.handleUpstreamResponse(
            request,
            response,
            target,
            upstream,
            upstreamResponse,
          ).finally(resolve);
        },
      );
      const active = { upstream, response };
      this.activeRequests.add(active);
      const cleanup = () => this.activeRequests.delete(active);
      upstream.once("close", cleanup);
      upstream.once("error", (error) => {
        cleanup();
        sendProxyError(response, 502, `upstream playback request failed: ${error.message}`);
        resolve();
      });
      upstream.setTimeout(this.requestTimeoutMs, () => {
        upstream.destroy(new Error("upstream playback request timed out"));
      });
      request.once("aborted", () => upstream.destroy());
      response.once("close", () => {
        if (!response.writableEnded) upstream.destroy();
      });
      upstream.end();
    });
  }

  async handleUpstreamResponse(request, response, target, upstream, upstreamResponse) {
    const status = upstreamResponse.statusCode ?? 502;
    const location = upstreamResponse.headers.location;
    if (REDIRECT_STATUS_CODES.has(status) && location) {
      let redirectTarget;
      try {
        redirectTarget = ensureHttpUrl(new URL(location, target), "redirect URL");
      } catch (error) {
        upstreamResponse.resume();
        sendProxyError(response, 502, error instanceof Error ? error.message : String(error));
        return;
      }
      const headers = filteredResponseHeaders(upstreamResponse.headers);
      headers.location = this.urlFor(redirectTarget);
      response.writeHead(status, headers);
      if (request.method === "HEAD") {
        upstreamResponse.resume();
        response.end();
      } else {
        upstreamResponse.pipe(response);
      }
      return;
    }

    const kind = playlistKind(target, upstreamResponse.headers);
    if (kind) {
      if (request.method === "HEAD") {
        upstreamResponse.resume();
        response.writeHead(status, filteredResponseHeaders(upstreamResponse.headers, { playlist: true }));
        response.end();
        return;
      }
      if (status === 206 || upstreamResponse.headers["content-range"]) {
        upstreamResponse.resume();
        sendProxyError(response, 502, "partial playlist responses are not supported");
        return;
      }
      const contentEncoding = String(upstreamResponse.headers["content-encoding"] ?? "identity").toLowerCase();
      if (contentEncoding !== "identity") {
        upstreamResponse.resume();
        sendProxyError(response, 502, "compressed playlists are not supported by the credential proxy");
        return;
      }
      try {
        const body = await readLimitedBody(upstreamResponse);
        const source = body.toString("utf8");
        const rewrite = (reference, base) => this.rewriteReference(reference, base);
        const rewritten = kind === "hls"
          ? rewriteHlsPlaylist(source, target, rewrite)
          : rewriteDashPlaylist(source, target, rewrite);
        const output = Buffer.from(rewritten, "utf8");
        const headers = filteredResponseHeaders(upstreamResponse.headers, { playlist: true });
        headers["content-length"] = String(output.length);
        response.writeHead(status, headers);
        response.end(output);
      } catch (error) {
        upstream.destroy();
        sendProxyError(response, 502, error instanceof Error ? error.message : String(error));
      }
      return;
    }

    response.writeHead(status, filteredResponseHeaders(upstreamResponse.headers));
    if (request.method === "HEAD") {
      upstreamResponse.resume();
      response.end();
      return;
    }
    upstreamResponse.pipe(response);
  }
}

export class MpvController {
  constructor(store, options = {}) {
    this.store = store;
    this.logDir = options.logDir ?? null;
    this.playbackProxy = options.playbackProxy ?? new ScopedPlaybackProxy(options.playbackProxyOptions);
    this.child = null;
    this.socket = null;
    this.buffer = "";
    this.pending = new Map();
    this.starting = null;
    this.embedWindowHandle = null;
    this.overlayWindowRect = null;
  }

  isRunning() {
    return Boolean(this.child && !this.child.killed && this.socket && !this.socket.destroyed);
  }

  get processId() {
    return this.child?.pid ?? null;
  }

  async ensureStarted() {
    if (this.isRunning()) return;
    if (!this.starting) {
      this.starting = this.startProcess().finally(() => {
        this.starting = null;
      });
    }
    await this.starting;
  }

  async setEmbedWindowHandle(handle) {
    const next = handle == null ? null : String(handle);
    if (this.embedWindowHandle === next) return;
    this.embedWindowHandle = next;
    if (this.isRunning()) {
      await this.shutdown();
    }
  }

  async clearEmbedWindowHandle() {
    await this.setEmbedWindowHandle(null);
  }

  async setOverlayWindowRect(rect) {
    if (!rect) {
      this.overlayWindowRect = null;
      return;
    }
    this.overlayWindowRect = {
      x: Math.round(Number(rect.x) || 0),
      y: Math.round(Number(rect.y) || 0),
      width: Math.max(1, Math.round(Number(rect.width) || 1)),
      height: Math.max(1, Math.round(Number(rect.height) || 1)),
    };
    if (this.isRunning() && !this.embedWindowHandle) {
      await this.applyOverlayWindowRect();
    }
  }

  async applyOverlayWindowRect() {
    const rect = this.overlayWindowRect;
    if (!rect || this.embedWindowHandle || !this.isRunning()) return;
    const geometry = `${rect.width}x${rect.height}+${rect.x}+${rect.y}`;
    await this.setProperty("border", false, { start: false }).catch(() => {});
    await this.setProperty("ontop", true, { start: false }).catch(() => {});
    await this.setProperty("geometry", geometry, { start: false }).catch(() => {});
  }

  async startProcess() {
    if (this.isRunning()) return;
    await this.shutdown();

    const settings = await this.store.getSettings();
    const detected = resolveMpv();
    if (!detected.found) {
      throw new Error("bundled mpv executable not found");
    }
    const pipePath = `\\\\.\\pipe\\hills-lite-mpv-${randomUUID()}`;
    const args = [
      "--no-config",
      "--idle=yes",
      "--keep-open=yes",
      "--title=Hills Lite",
      "--no-terminal",
      "--msg-level=all=warn",
      "--keepaspect=yes",
      "--panscan=0",
      "--video-zoom=0",
      "--video-scale-x=1",
      "--video-scale-y=1",
      `--input-ipc-server=${pipePath}`,
    ];
    if (this.embedWindowHandle) {
      args.push(`--wid=${this.embedWindowHandle}`);
      args.push("--force-window=yes");
      if (process.env.HILLS_ELECTRON_MPV_NATIVE_CHILD === "1") {
        args.push("--vo=direct3d");
      } else {
        args.push("--vo=gpu-next,gpu,direct3d");
        args.push("--gpu-api=d3d11");
        args.push("--gpu-context=d3d11");
        args.push("--d3d11-output-mode=window");
      }
      args.push("--background=color");
      args.push("--background-color=#FF000000");
      args.push("--d3d11-flip=no");
    } else {
      const reparentEmbed = useReparentEmbed();
      args.push(reparentEmbed ? "--force-window=immediate" : "--force-window=yes");
      args.push("--no-border");
      if (!reparentEmbed) args.push("--ontop=yes");
      if (reparentEmbed) {
        args.push(`--vo=${process.env.HILLS_ELECTRON_MPV_REPARENT_VO?.trim() || "direct3d"}`);
      }
      args.push("--d3d11-flip=no");
      args.push("--no-osc");
      args.push("--cursor-autohide=always");
      args.push("--keepaspect-window=no");
      if (this.overlayWindowRect) {
        const rect = this.overlayWindowRect;
        args.push(`--geometry=${rect.width}x${rect.height}+${rect.x}+${rect.y}`);
      } else if (reparentEmbed) {
        args.push("--geometry=320x180+-32000+-32000");
      }
    }
    if (this.logDir) {
      fs.mkdirSync(this.logDir, { recursive: true });
      args.push(`--log-file=${path.join(this.logDir, "mpv.log")}`);
    }

    const hwdecOverride = process.env.HILLS_ELECTRON_MPV_HWDEC?.trim();
    if (hwdecOverride) args.push(`--hwdec=${hwdecOverride}`);
    else if (settings.hardwareDecoding) {
      const hwdecModeMap = {
        auto: "auto-safe",
        d3d11va: "d3d11va",
        vulkan: "vulkan",
        copy: "auto-copy",
      };
      args.push(`--hwdec=${hwdecModeMap[settings.hwdecMode] ?? "auto-safe"}`);
    }
    if ((settings.mpvCacheMb ?? 0) > 0) {
      args.push("--cache=yes");
      args.push(`--demuxer-max-bytes=${settings.mpvCacheMb}MiB`);
    }
    // Some servers stall the HTTP stream mid-read (observed: connection went
    // silent after ~6 MiB and ffmpeg waited out its default 60 s timeout while
    // the UI spun on "加载中"). Fail stalled reads fast and let ffmpeg resume
    // with a ranged reconnect instead of hanging the open.
    args.push("--network-timeout=12");
    args.push("--stream-lavf-o=reconnect=1,reconnect_streamed=1,reconnect_on_network_error=1,reconnect_delay_max=4");
    // Reference parity (HillsLite「最大缓存时长」/「低质量视频解码」). The
    // Electron --vo is fixed by the d3d11 embedding path above, so the
    // videoOutputDriver setting only drives the Tauri/IPC backend.
    if ((settings.mpvCacheSecs ?? 0) > 0) {
      args.push("--cache=yes");
      args.push(`--cache-secs=${settings.mpvCacheSecs}`);
    }
    if (settings.lowQualityDecoding) {
      args.push("--vd-lavc-fast=yes");
      args.push("--vd-lavc-skiploopfilter=all");
    }

    // Parity with the Rust IPC backend: preferred track languages, forced
    // stereo, custom proxy passthrough and the user mpv.conf include.
    const alang = (settings.preferredAudioLanguage ?? "").trim();
    if (alang) args.push(`--alang=${alang}`);
    const slang = (settings.preferredSubtitleLanguage ?? "").trim();
    if (slang) args.push(`--slang=${slang}`);
    if (settings.forceStereoAudio) args.push("--audio-channels=stereo");
    if (settings.networkProxyMode === "custom") {
      const proxy = (settings.httpProxyUrl ?? "").trim();
      if (proxy) args.push(`--http-proxy=${proxy}`);
    }
    const userConf = resolveUserMpvConf();
    if (userConf) args.push(`--include=${userConf}`);
    if (settings.playerLogEnabled && process.env.APPDATA) {
      try {
        const logDir = path.join(process.env.APPDATA, "app.embyplayer", "logs");
        fs.mkdirSync(logDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        args.push(`--log-file=${path.join(logDir, `mpv-${stamp}.log`)}`);
      } catch {
        /* logging is best-effort */
      }
    }

    // Parity with the Rust embedded backend: load the bundled progress reporter
    // on every mpv launch path. This controller drives Emby reporting from
    // snapshot polling and runs mpv with stdio "ignore", so the script's stdout
    // events are discarded here; the injection just keeps the launch path
    // consistent with external mpv.
    const reporterScript = resolveReporterScript(detected.path);
    if (reporterScript) {
      args.push(`--script=${reporterScript}`);
    }

    this.child = spawn(detected.path, args, {
      windowsHide: !useReparentEmbed(),
      stdio: "ignore",
    });
    this.child.once("exit", () => {
      this.socket?.destroy();
      this.socket = null;
      this.child = null;
      for (const item of this.pending.values()) item.reject(new Error("mpv exited"));
      this.pending.clear();
    });

    this.socket = await this.connectPipe(pipePath);
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk) => this.onData(chunk));
    this.socket.on("error", (error) => {
      for (const item of this.pending.values()) item.reject(error);
      this.pending.clear();
    });
  }

  async connectPipe(pipePath) {
    const started = Date.now();
    let lastError = null;
    while (Date.now() - started < 15_000) {
      if (!this.child || this.child.killed || this.child.exitCode != null) {
        throw new Error(`mpv exited before IPC became ready: ${this.child?.exitCode ?? "unknown"}`);
      }
      try {
        return await new Promise((resolve, reject) => {
          const socket = net.createConnection(pipePath, () => resolve(socket));
          socket.once("error", reject);
        });
      } catch (error) {
        lastError = error;
        await sleep(60);
      }
    }
    throw new Error(`mpv IPC connect timeout: ${lastError?.message ?? "unknown"}`);
  }

  onData(chunk) {
    this.buffer += chunk;
    while (true) {
      const index = this.buffer.indexOf("\n");
      if (index < 0) return;
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      const requestId = message.request_id;
      if (requestId && this.pending.has(requestId)) {
        const item = this.pending.get(requestId);
        this.pending.delete(requestId);
        clearTimeout(item.timer);
        if (!message.error || message.error === "success") item.resolve(message);
        else item.reject(new Error(`mpv error: ${message.error}`));
      }
    }
  }

  async command(command, { start = true } = {}) {
    if (start) await this.ensureStarted();
    else if (!this.isRunning()) throw new Error("mpv is not running");

    const requestId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    const payload = `${JSON.stringify({ command, request_id: requestId })}\n`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("mpv IPC timeout"));
      }, 5000);
      this.pending.set(requestId, { resolve, reject, timer });
      this.socket.write(payload, "utf8", (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error);
      });
    });
  }

  async setProperty(name, value, options) {
    return this.command(["set_property", name, value], options);
  }

  async getProperty(name, options) {
    const response = await this.command(["get_property", name], options);
    return response.data;
  }

  async clearNetworkAccess({ resetMpvHeaders = true } = {}) {
    this.playbackProxy.clearSession();
    if (resetMpvHeaders && this.isRunning()) {
      await this.setProperty("http-header-fields", [], { start: false });
    }
  }

  networkUrlFor(url) {
    return this.playbackProxy.hasActiveSession ? this.playbackProxy.urlFor(url) : url;
  }

  async load({
    url,
    headers = [],
    userAgent = null,
    startMs = null,
    autoloadSubtitles = true,
    credentialScope = null,
  }) {
    await this.ensureStarted();
    await this.clearNetworkAccess();
    await this.setProperty("sub-auto", autoloadSubtitles ? "fuzzy" : "no");
    if (userAgent) await this.setProperty("user-agent", userAgent);
    await this.applyOverlayWindowRect().catch(() => {});
    let loadUrl = url;
    let mpvHeaders = headers;
    if (credentialScope) {
      loadUrl = await this.playbackProxy.openSession({
        url,
        credentialBaseUrl: credentialScope.baseUrl,
        headers,
        userAgent,
      });
      mpvHeaders = [];
    }
    const headerFields = (Array.isArray(mpvHeaders) ? mpvHeaders : [])
      .filter(([key, value]) => key && value != null && value !== "")
      .map(([key, value]) => `${key}: ${String(value).replace(/[\r\n]+/g, " ")}`);
    await this.setProperty("http-header-fields", headerFields);
    if (startMs != null) {
      await this.setProperty("start", `${Math.max(0, Number(startMs)) / 1000}`);
    }
    try {
      const response = await this.command(["loadfile", loadUrl, "replace"]);
      return {
        accepted: true,
        requestId: response.request_id ?? null,
        error: response.error ?? null,
      };
    } catch (error) {
      await this.clearNetworkAccess().catch(() => {});
      throw error;
    }
  }

  async snapshot() {
    if (!this.isRunning()) return defaultSnapshot();
    const get = (name, fallback) =>
      this.getProperty(name, { start: false }).catch(() => fallback);
    const [
      url,
      paused,
      position,
      duration,
      speed,
      volume,
      muted,
      eof,
      tracks,
      chapters,
      chapter,
      secondarySid,
      subDelay,
      subScale,
      networkBps,
      cacheDuration,
      pausedForCache,
      cacheBufferingState,
      videoCodec,
      audioCodec,
      videoParams,
      videoOutParams,
      osdDimensions,
      audioParams,
      hwdecCurrent,
      keepaspect,
      panscan,
      videoZoom,
      videoScaleX,
      videoScaleY,
      videoAspectOverride,
      containerFps,
      estimatedVfFps,
      videoBitrate,
      audioBitrate,
      frameDropCount,
      decoderFrameDropCount,
      voFrameDropCount,
    ] = await Promise.all([
      get("path", null),
      get("pause", true),
      get("time-pos", 0),
      get("duration", 0),
      get("speed", 1),
      get("volume", 80),
      get("mute", false),
      get("eof-reached", false),
      get("track-list", []),
      get("chapter-list", []),
      get("chapter", null),
      get("secondary-sid", null),
      get("sub-delay", 0),
      get("sub-scale", 1),
      get("cache-speed", null),
      get("demuxer-cache-duration", 0),
      get("paused-for-cache", false),
      get("cache-buffering-state", null),
      get("video-codec", null),
      get("audio-codec", null),
      get("video-params", null),
      get("video-out-params", null),
      get("osd-dimensions", null),
      get("audio-params", null),
      get("hwdec-current", null),
      get("keepaspect", true),
      get("panscan", 0),
      get("video-zoom", 0),
      get("video-scale-x", 1),
      get("video-scale-y", 1),
      get("video-aspect-override", -2),
      get("container-fps", null),
      get("estimated-vf-fps", null),
      get("video-bitrate", null),
      get("audio-bitrate", null),
      get("frame-drop-count", null),
      get("decoder-frame-drop-count", null),
      get("vo-drop-frame-count", null),
    ]);
    const cacheBuffering = cacheBufferingState == null ? null : numberFrom(cacheBufferingState, 100);
    const normalizedTracks = Array.isArray(tracks)
      ? tracks
          .map((track) => ({
            id: numberFrom(track.id),
            kind: parseTrackKind(track.type),
            title: track.title ?? null,
            lang: track.lang ?? null,
            codec: track.codec ?? null,
            external: typeof track.external === "boolean" ? track.external : null,
            defaultTrack: typeof track.default === "boolean" ? track.default : null,
            forced: typeof track.forced === "boolean" ? track.forced : null,
            selected: Boolean(track.selected),
          }))
          .filter((track) => track.kind)
      : [];
    const selectedVideoTrack = normalizedTracks.find((track) => track.kind === "video" && track.selected);
    const selectedAudioTrack = normalizedTracks.find((track) => track.kind === "audio" && track.selected);

    return {
      url,
      paused: Boolean(paused),
      positionMs: Math.floor(numberFrom(position) * 1000),
      durationMs: Math.floor(numberFrom(duration) * 1000),
      speed: numberFrom(speed, 1),
      volume: Math.round(numberFrom(volume, 80)),
      muted: Boolean(muted),
      eof: Boolean(eof),
      tracks: normalizedTracks,
      chapters: parseChapters(chapters),
      chapter: chapter == null || numberFrom(chapter, -1) < 0 ? null : Math.floor(numberFrom(chapter)),
      secondarySubId:
        secondarySid == null || secondarySid === "no" || numberFrom(secondarySid, -1) < 0
          ? null
          : Math.floor(numberFrom(secondarySid)),
      subDelayMs: Math.floor(numberFrom(subDelay) * 1000),
      subScale: numberFrom(subScale, 1),
      networkBps: networkBps == null ? null : numberFrom(networkBps, 0),
      bufferedMs: Math.floor(Math.max(0, numberFrom(cacheDuration, 0)) * 1000),
      buffering:
        Boolean(pausedForCache) ||
        (cacheBuffering != null && cacheBuffering > 0 && cacheBuffering < 100),
      cacheBufferingState: cacheBuffering,
      videoCodec: videoCodec ?? selectedVideoTrack?.codec ?? null,
      audioCodec: audioCodec ?? selectedAudioTrack?.codec ?? null,
      videoParams: videoParams && typeof videoParams === "object" ? videoParams : null,
      videoOutParams: videoOutParams && typeof videoOutParams === "object" ? videoOutParams : null,
      osdDimensions: osdDimensions && typeof osdDimensions === "object" ? osdDimensions : null,
      audioParams: audioParams && typeof audioParams === "object" ? audioParams : null,
      hwdecCurrent: hwdecCurrent ?? null,
      keepaspect: Boolean(keepaspect),
      panscan: numberFrom(panscan, 0),
      videoZoom: numberFrom(videoZoom, 0),
      videoScaleX: numberFrom(videoScaleX, 1),
      videoScaleY: numberFrom(videoScaleY, 1),
      videoAspectOverride: numberFrom(videoAspectOverride, -2),
      containerFps: containerFps == null ? null : numberFrom(containerFps, 0),
      estimatedVfFps: estimatedVfFps == null ? null : numberFrom(estimatedVfFps, 0),
      videoBitrate: videoBitrate == null ? null : numberFrom(videoBitrate, 0),
      audioBitrate: audioBitrate == null ? null : numberFrom(audioBitrate, 0),
      frameDropCount: frameDropCount == null ? null : numberFrom(frameDropCount, 0),
      decoderFrameDropCount:
        decoderFrameDropCount == null ? null : numberFrom(decoderFrameDropCount, 0),
      voFrameDropCount: voFrameDropCount == null ? null : numberFrom(voFrameDropCount, 0),
    };
  }

  async shutdown({ quitTimeoutMs = 500, killTimeoutMs = 900 } = {}) {
    await this.playbackProxy.shutdown().catch(() => {});
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error("mpv shutdown"));
    }
    this.pending.clear();
    const socket = this.socket;
    const child = this.child;
    this.socket = null;
    this.child = null;

    if (socket) {
      const requestId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
      const payload = `${JSON.stringify({ command: ["quit"], request_id: requestId })}\n`;
      await writeAndFlush(socket, payload).catch(() => {});
      socket.destroy();
    }

    if (child && child.exitCode == null) {
      const pid = child.pid;
      const exitedAfterQuit = await waitForChildExit(child, quitTimeoutMs);
      if (!exitedAfterQuit && child.exitCode == null) {
        if (!child.killed) child.kill();
        const exitedAfterKill = await waitForChildExit(child, killTimeoutMs);
        if (!exitedAfterKill && child.exitCode == null) {
          await forceKillProcessTree(pid);
          await waitForChildExit(child, killTimeoutMs);
        }
      }
    }
  }
}
