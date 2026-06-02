import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fsp from "node:fs/promises";
import { WebSocket } from "undici";

const devServerUrl = process.env.HILLS_SMOKE_DEV_SERVER_URL ?? "http://127.0.0.1:1420";
const remotePort = Number(process.env.HILLS_SMOKE_CDP_PORT ?? 9362);
const tmpDir = path.join(os.tmpdir(), `hills-lite-remote-poster-${Date.now()}`);
const userDataDir = path.join(tmpDir, "user-data");
const expectedAuth = `Basic ${Buffer.from("demo:demo-pass", "utf8").toString("base64")}`;
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureDevServer() {
  try {
    const response = await fetch(devServerUrl);
    if (response.ok) return;
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`Vite dev server is not reachable at ${devServerUrl}: ${error.message}`);
  }
}

function multistatus(baseUrl) {
  return `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/dav/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection /></d:resourcetype></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>${baseUrl}Episode%201.mkv</d:href>
    <d:propstat><d:prop>
      <d:displayname>Episode 1.mkv</d:displayname>
      <d:resourcetype />
      <d:getcontentlength>734003200</d:getcontentlength>
      <d:getlastmodified>Mon, 01 Jun 2026 01:05:00 GMT</d:getlastmodified>
      <d:getcontenttype>video/x-matroska</d:getcontenttype>
    </d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>${baseUrl}Episode%201.png</d:href>
    <d:propstat><d:prop>
      <d:displayname>Episode 1.png</d:displayname>
      <d:resourcetype />
      <d:getcontentlength>${tinyPng.byteLength}</d:getcontentlength>
      <d:getlastmodified>Mon, 01 Jun 2026 01:06:00 GMT</d:getlastmodified>
      <d:getcontenttype>image/png</d:getcontenttype>
    </d:prop></d:propstat>
  </d:response>
</d:multistatus>`;
}

function createMockWebDavServer(stats) {
  return http.createServer((req, res) => {
    if (req.headers.authorization !== expectedAuth) {
      res.writeHead(401, { "content-type": "text/plain" });
      res.end("unauthorized");
      return;
    }

    if (req.method === "PROPFIND") {
      stats.propfind += 1;
      const base = `http://127.0.0.1:${server.address().port}/dav/`;
      res.writeHead(207, { "content-type": "application/xml; charset=utf-8" });
      res.end(multistatus(base));
      return;
    }

    if (req.method === "GET" && req.url === "/dav/Episode%201.png") {
      stats.posterGets += 1;
      stats.posterAuthorization = req.headers.authorization ?? null;
      res.writeHead(200, {
        "content-type": "image/png",
        "content-length": tinyPng.byteLength,
      });
      res.end(tinyPng);
      return;
    }

    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
}

async function getTargets() {
  for (let index = 0; index < 80; index += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${remotePort}/json`);
      if (response.ok) return response.json();
    } catch {
      // Electron is still starting.
    }
    await wait(250);
  }
  throw new Error("CDP target timeout");
}

async function cdpMessageText(event) {
  const data = event.data;
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  if (data && typeof data.text === "function") return data.text();
  return String(data);
}

function ensureCdpDispatch(ws) {
  if (ws.__hillsCdpDispatchReady) return;
  ws.__hillsCdpDispatchReady = true;
  ws.__hillsCdpPending = new Map();
  ws.addEventListener("message", async (event) => {
    let message;
    try {
      message = JSON.parse(await cdpMessageText(event));
    } catch {
      return;
    }
    if (message.id != null && ws.__hillsCdpPending.has(message.id)) {
      const pending = ws.__hillsCdpPending.get(message.id);
      ws.__hillsCdpPending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`${pending.method}: ${JSON.stringify(message.error)}`));
      else pending.resolve(message.result);
    }
  });
}

async function cdpCall(ws, method, params = {}) {
  ensureCdpDispatch(ws);
  const id = cdpCall.nextId;
  cdpCall.nextId += 1;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.__hillsCdpPending.delete(id);
      reject(new Error(`${method} timeout`));
    }, 30_000);
    ws.__hillsCdpPending.set(id, { method, resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
cdpCall.nextId = 1;

async function cdpEval(ws, expression) {
  const result = await cdpCall(ws, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value ?? null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await fsp.mkdir(tmpDir, { recursive: true });
await ensureDevServer();

const stats = { propfind: 0, posterGets: 0, posterAuthorization: null };
const server = createMockWebDavServer(stats);
server.listen(0, "127.0.0.1");
await once(server, "listening");

const baseUrl = `http://127.0.0.1:${server.address().port}/dav/`;
const electron = path.resolve("node_modules/electron/dist/electron.exe");
const child = spawn(electron, [`--remote-debugging-port=${remotePort}`, "electron/main.mjs"], {
  env: {
    ...process.env,
    HILLS_ELECTRON_DEV_SERVER_URL: devServerUrl,
    HILLS_ELECTRON_DISABLE_GPU: "1",
    HILLS_ELECTRON_OPEN_DEVTOOLS: "0",
    HILLS_ELECTRON_USER_DATA_DIR: userDataDir,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

let ws;
try {
  const targets = await getTargets();
  const target =
    targets.find((item) => item.type === "page" && item.url.startsWith(devServerUrl)) ??
    targets.find((item) => item.type === "page");
  if (!target?.webSocketDebuggerUrl) throw new Error("page target not found");

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("websocket error"));
  });
  await cdpCall(ws, "Runtime.enable");
  await cdpCall(ws, "Page.enable");
  await wait(800);

  const result = await cdpEval(ws, `
    (async () => {
      const listing = await window.hillsLite.invoke("list_webdav_folder", {
        payload: {
          baseUrl: ${JSON.stringify(baseUrl)},
          username: "demo",
          password: "demo-pass",
          timeoutMs: 2000,
        },
      });
      const video = listing.items.find((entry) => entry.name === "Episode 1.mkv");
      if (!video) throw new Error("video entry missing");
      const response = await fetch(video.posterUrl);
      const bytes = await response.arrayBuffer();
      return {
        rootUrl: listing.rootUrl,
        itemCount: listing.items.length,
        posterUrl: video.posterUrl,
        posterStatus: response.status,
        posterContentType: response.headers.get("content-type"),
        posterCache: response.headers.get("x-hills-image-cache"),
        posterBytes: bytes.byteLength,
      };
    })()
  `);

  assert(result.rootUrl === baseUrl, "listing should keep WebDAV root URL");
  assert(result.itemCount === 2, `expected 2 entries, got ${result.itemCount}`);
  assert(result.posterUrl?.startsWith("hills-image://file/"), `poster should be proxied: ${result.posterUrl}`);
  assert(result.posterStatus === 200, `poster fetch failed: ${result.posterStatus}`);
  assert(result.posterContentType?.startsWith("image/png"), `unexpected poster type: ${result.posterContentType}`);
  assert(result.posterBytes === tinyPng.byteLength, `unexpected poster byte length: ${result.posterBytes}`);
  assert(stats.propfind === 1, `expected one PROPFIND, got ${stats.propfind}`);
  assert(stats.posterGets === 1, `expected one poster GET, got ${stats.posterGets}`);
  assert(stats.posterAuthorization === expectedAuth, "poster GET should include WebDAV Basic Auth");

  console.log(JSON.stringify({ ok: true, result, stats }, null, 2));
} finally {
  ws?.close();
  child.kill();
  setTimeout(() => child.kill("SIGKILL"), 1000);
  server.close();
  await wait(1000);
  await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
}
