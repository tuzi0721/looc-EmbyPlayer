import { defineConfig } from "vite";
import type { Plugin, ViteDevServer } from "vite";
import vue from "@vitejs/plugin-vue";
import net from "node:net";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;
const proxyEnvKeys = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"];
const fallbackProxyUrls = ["http://127.0.0.1:7897", "http://127.0.0.1:7890"];
let cachedProxyDispatcher: unknown | null | undefined;

function candidateProxyUrls() {
  const values = proxyEnvKeys
    .map((key) => process.env[key])
    .filter((value): value is string => Boolean(value?.trim()));
  return [...new Set([...values, ...fallbackProxyUrls])];
}

function canConnect(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({
      host: url.hostname,
      port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
    });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(250);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function proxyDispatcher() {
  if (cachedProxyDispatcher !== undefined) return cachedProxyDispatcher;

  for (const value of candidateProxyUrls()) {
    try {
      const proxyUrl = new URL(value);
      if (!(await canConnect(proxyUrl))) continue;
      const { ProxyAgent } = await import("undici");
      cachedProxyDispatcher = new ProxyAgent(proxyUrl.toString());
      return cachedProxyDispatcher;
    } catch {
      // Try the next proxy candidate.
    }
  }

  cachedProxyDispatcher = null;
  return null;
}

async function fetchWithProxyFallback(target: URL, init: RequestInit) {
  try {
    return await fetch(target, init);
  } catch (error) {
    const dispatcher = await proxyDispatcher();
    if (!dispatcher) throw error;
    return fetch(target, { ...init, dispatcher } as RequestInit & { dispatcher: unknown });
  }
}

function proxyStreamPath(target: URL) {
  return `/__hills_web_stream_proxy?url=${encodeURIComponent(target.toString())}`;
}

function rewriteHlsUri(value: string, base: URL) {
  let target: URL;
  try {
    target = new URL(value, base);
  } catch {
    return value;
  }
  if (!["http:", "https:"].includes(target.protocol)) return value;
  const apiKey = base.searchParams.get("api_key");
  const embyToken = base.searchParams.get("X-Emby-Token");
  if (apiKey && !target.searchParams.has("api_key") && !target.searchParams.has("X-Emby-Token")) {
    target.searchParams.set("api_key", apiKey);
  } else if (embyToken && !target.searchParams.has("api_key") && !target.searchParams.has("X-Emby-Token")) {
    target.searchParams.set("X-Emby-Token", embyToken);
  }
  return proxyStreamPath(target);
}

function rewriteHlsPlaylist(body: string, base: URL) {
  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
          return `URI="${rewriteHlsUri(uri, base)}"`;
        });
      }
      return rewriteHlsUri(trimmed, base);
    })
    .join("\n");
}

function streamRequestHeaders(req: { headers?: Record<string, string | string[] | undefined> }) {
  const headers = new Headers();
  const blocked = new Set([
    "connection",
    "content-length",
    "cookie",
    "host",
    "origin",
    "referer",
    "sec-fetch-dest",
    "sec-fetch-mode",
    "sec-fetch-site",
    "sec-fetch-user",
  ]);
  for (const [name, value] of Object.entries(req.headers ?? {})) {
    const key = name.toLowerCase();
    if (blocked.has(key)) continue;
    if (Array.isArray(value)) headers.set(name, value.join(", "));
    else if (value != null) headers.set(name, String(value));
  }
  return headers;
}

function hillsWebProxy(): Plugin {
  return {
    name: "hills-web-preview-proxy",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/__hills_web_proxy", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("method not allowed");
          return;
        }

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req as AsyncIterable<Buffer | string>) {
            chunks.push(Buffer.from(chunk));
          }
          const payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          const target = new URL(String(payload.url ?? ""));
          if (!["http:", "https:"].includes(target.protocol)) {
            throw new Error("unsupported proxy target protocol");
          }

          const response = await fetchWithProxyFallback(target, {
            method: String(payload.method ?? "GET"),
            headers: payload.headers ?? {},
            body: payload.body == null ? undefined : String(payload.body),
          });
          const body = Buffer.from(await response.arrayBuffer());
          res.statusCode = response.status;
          res.statusMessage = response.statusText;
          const contentType = response.headers.get("content-type");
          if (contentType) res.setHeader("content-type", contentType);
          res.setHeader("cache-control", "no-store");
          res.end(body);
        } catch (error) {
          res.statusCode = 502;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });

      server.middlewares.use("/__hills_web_stream_proxy", async (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.statusCode = 405;
          res.end("method not allowed");
          return;
        }

        try {
          const requestUrl = new URL(req.url ?? "", "http://127.0.0.1");
          const target = new URL(String(requestUrl.searchParams.get("url") ?? ""));
          if (!["http:", "https:"].includes(target.protocol)) {
            throw new Error("unsupported proxy target protocol");
          }

          const response = await fetchWithProxyFallback(target, {
            method: req.method,
            headers: streamRequestHeaders(req),
          });
          const body = Buffer.from(await response.arrayBuffer());
          const contentType = response.headers.get("content-type") ?? "";
          const isPlaylist =
            contentType.toLowerCase().includes("mpegurl") ||
            target.pathname.toLowerCase().endsWith(".m3u8") ||
            body.subarray(0, 16).toString("utf8").startsWith("#EXTM3U");

          res.statusCode = response.status;
          res.statusMessage = response.statusText;
          for (const header of ["accept-ranges", "cache-control", "content-range"]) {
            const value = response.headers.get(header);
            if (value) res.setHeader(header, value);
          }
          res.setHeader("cache-control", "no-store");

          if (isPlaylist) {
            const playlist = rewriteHlsPlaylist(body.toString("utf8"), target);
            res.setHeader("content-type", contentType || "application/vnd.apple.mpegurl");
            res.end(playlist);
          } else {
            if (contentType) res.setHeader("content-type", contentType);
            const contentLength = response.headers.get("content-length");
            if (contentLength) res.setHeader("content-length", contentLength);
            res.end(body);
          }
        } catch (error) {
          res.statusCode = 502;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
    },
  };
}

export default defineConfig(async () => ({
  base: "./",
  plugins: [vue(), hillsWebProxy()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
}));
