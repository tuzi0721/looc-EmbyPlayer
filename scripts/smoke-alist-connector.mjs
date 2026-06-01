import http from "node:http";
import { once } from "node:events";
import { AlistClient } from "../electron/backend/alist.mjs";
import { DanmakuClient } from "../electron/backend/danmaku.mjs";

const expectedAuth = "demo-token";

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const server = http.createServer(async (req, res) => {
  if (req.headers.authorization !== expectedAuth) {
    json(res, 401, { code: 401, message: "unauthorized" });
    return;
  }
  if (req.method === "GET" && req.url === "/raw/Episode%201.danmaku.xml") {
    res.writeHead(200, { "content-type": "application/xml; charset=utf-8" });
    res.end('<i><d p="1.5,1,25,16777215,0,0,0,0">hello xml</d></i>');
    return;
  }
  if (req.method !== "POST") {
    json(res, 405, { code: 405, message: "method not allowed" });
    return;
  }

  const body = await readBody(req);
  if (req.url === "/api/fs/list") {
    assert(body.path === "/", `unexpected list path: ${body.path}`);
    json(res, 200, {
      code: 200,
      message: "success",
      data: {
        total: 6,
        provider: "Mock",
        content: [
          { name: "Movies", is_dir: true, size: 0, modified: "2026-06-01T01:00:00Z" },
          { name: "Episode 1.mkv", is_dir: false, size: 734003200, modified: "2026-06-01T01:05:00Z", sign: "signed-1", type: 2 },
          { name: "Episode 2.mp4", is_dir: false, size: 524288000, modified: "2026-06-01T01:06:00Z", sign: "signed-2", type: 2 },
          { name: "Episode 1.zh.srt", is_dir: false, size: 1024, modified: "2026-06-01T01:06:30Z", sign: "signed-sub", type: 4 },
          { name: "Episode 1.danmaku.xml", is_dir: false, size: 2048, modified: "2026-06-01T01:06:40Z", sign: "signed-xml", type: 4 },
          { name: "readme.txt", is_dir: false, size: 12, modified: "2026-06-01T01:07:00Z", type: 4 },
        ],
      },
    });
    return;
  }

  if (req.url === "/api/fs/get") {
    assert(body.path === "/Episode 1.mkv", `unexpected get path: ${body.path}`);
    json(res, 200, {
      code: 200,
      message: "success",
      data: {
        raw_url: `http://127.0.0.1:${server.address().port}/raw/Episode%201.mkv`,
      },
    });
    return;
  }

  json(res, 404, { code: 404, message: "not found" });
});

server.listen(0, "127.0.0.1");
await once(server, "listening");

try {
  const baseUrl = `http://127.0.0.1:${server.address().port}/`;
  const client = new AlistClient({ timeoutMs: 2_000 });
  const listing = await client.list({ baseUrl, token: expectedAuth });

  assert(listing.rootUrl === baseUrl, "root URL should be normalized");
  assert(listing.items.length === 6, `expected 6 entries, got ${listing.items.length}`);
  assert(listing.items[0].isDirectory && listing.items[0].name === "Movies", "directory should sort first");
  assert(listing.items.filter((entry) => entry.playable).length === 2, "should detect two playable videos");

  const video = listing.items.find((entry) => entry.name === "Episode 1.mkv");
  assert(video, "video entry missing");
  assert(video.url.endsWith("/d/Episode%201.mkv?sign=signed-1"), `unexpected download url: ${video.url}`);
  assert(video.sidecarSubtitleCount === 1, "video should detect one sidecar subtitle");
  assert(video.sidecarSubtitles?.[0]?.name === "Episode 1.zh.srt", "sidecar subtitle should be linked");
  assert(video.sidecarDanmaku?.name === "Episode 1.danmaku.xml", "sidecar danmaku should be linked");

  const resolved = await client.resolveFile({ baseUrl, token: expectedAuth, path: "Episode 1.mkv" });
  assert(resolved.url.endsWith("/raw/Episode%201.mkv"), `unexpected raw url: ${resolved.url}`);

  const danmaku = new DanmakuClient({
    getSettings: async () => ({ requestTimeoutMs: 2_000 }),
  });
  const imported = await danmaku.importXml({
    url: `http://127.0.0.1:${server.address().port}/raw/Episode%201.danmaku.xml`,
    token: expectedAuth,
  });
  assert(imported.comments.length === 1, "Alist XML danmaku should load with token auth");

  console.log("Alist connector smoke passed");
} finally {
  server.close();
}
