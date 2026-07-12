import assert from "node:assert/strict";
import http from "node:http";

import { DanmakuClient } from "../electron/backend/danmaku.mjs";
import { ScopedPlaybackProxy } from "../electron/backend/mpv.mjs";

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

const expectedAuth = `Basic ${Buffer.from("alice:secret", "utf8").toString("base64")}`;
const originRequests = [];
const crossRequests = [];
let crossBaseUrl = "";

const cross = await listen((request, response) => {
  crossRequests.push({ url: request.url, authorization: request.headers.authorization });
  if (request.url === "/cross.bin") {
    response.writeHead(200, { "Content-Type": "application/octet-stream" });
    response.end("cross-ok");
    return;
  }
  if (request.url === "/cross-segment.ts") {
    response.writeHead(200, { "Content-Type": "video/mp2t" });
    response.end("cross-segment");
    return;
  }
  if (request.url === "/sidecar.srt") {
    response.writeHead(200, { "Content-Type": "application/x-subrip" });
    response.end("1\n00:00:00,000 --> 00:00:01,000\nhello\n");
    return;
  }
  if (request.url === "/danmaku.xml") {
    response.writeHead(200, { "Content-Type": "application/xml" });
    response.end('<i><d p="1.5,1,25,16777215">hello</d></i>');
    return;
  }
  response.writeHead(404);
  response.end();
});
crossBaseUrl = cross.baseUrl;

const origin = await listen((request, response) => {
  originRequests.push({
    url: request.url,
    authorization: request.headers.authorization,
    range: request.headers.range,
  });
  if (request.url === "/range.bin") {
    if (request.headers.range === "bytes=2-5") {
      response.writeHead(206, {
        "Accept-Ranges": "bytes",
        "Content-Length": "4",
        "Content-Range": "bytes 2-5/10",
        "Content-Type": "application/octet-stream",
      });
      response.end("2345");
      return;
    }
    response.writeHead(200, { "Content-Length": "10" });
    response.end("0123456789");
    return;
  }
  if (request.url === "/stream.bin") {
    response.writeHead(200, { "Content-Type": "application/octet-stream" });
    response.write("stream-");
    setTimeout(() => response.end("ok"), 15);
    return;
  }
  if (request.url === "/redirect") {
    response.writeHead(302, { Location: `${crossBaseUrl}/cross.bin` });
    response.end();
    return;
  }
  if (request.url === "/danmaku-redirect") {
    response.writeHead(302, { Location: `${crossBaseUrl}/danmaku.xml` });
    response.end();
    return;
  }
  if (request.url === "/auth-playlist") {
    response.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl" });
    response.end([
      "#EXTM3U",
      '#EXT-X-KEY:METHOD=AES-128,URI="/key.bin"',
      "#EXTINF:4,",
      "segment.ts",
      "#EXTINF:4,",
      `${crossBaseUrl}/cross-segment.ts`,
      "#EXT-X-ENDLIST",
      "",
    ].join("\n"));
    return;
  }
  if (request.url === "/key.bin") {
    response.writeHead(200, { "Content-Type": "application/octet-stream" });
    response.end("key");
    return;
  }
  if (request.url === "/segment.ts") {
    response.writeHead(200, { "Content-Type": "video/mp2t" });
    response.end("same-segment");
    return;
  }
  response.writeHead(404);
  response.end();
});

const proxy = new ScopedPlaybackProxy({ requestTimeoutMs: 2000 });
try {
  await assert.rejects(
    proxy.openSession({
      url: `${origin.baseUrl}/range.bin`,
      credentialBaseUrl: null,
      headers: [["Authorization", expectedAuth]],
    }),
    /credentialBaseUrl/,
    "credentialed proxy sessions must fail closed without baseUrl",
  );

  await proxy.openSession({
    url: `${origin.baseUrl}/range.bin`,
    credentialBaseUrl: origin.baseUrl,
    headers: [["Authorization", expectedAuth]],
    userAgent: "Hills auth smoke",
  });

  const rangeResponse = await fetch(proxy.urlFor(`${origin.baseUrl}/range.bin`), {
    headers: { Range: "bytes=2-5" },
  });
  assert.equal(rangeResponse.status, 206);
  assert.equal(rangeResponse.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(await rangeResponse.text(), "2345");
  assert.equal(originRequests.at(-1).authorization, expectedAuth);
  assert.equal(originRequests.at(-1).range, "bytes=2-5");

  const streamResponse = await fetch(proxy.urlFor(`${origin.baseUrl}/stream.bin`));
  assert.equal(streamResponse.status, 200);
  assert.equal(await streamResponse.text(), "stream-ok");
  assert.equal(originRequests.at(-1).authorization, expectedAuth);

  const redirectResponse = await fetch(proxy.urlFor(`${origin.baseUrl}/redirect`), {
    redirect: "manual",
  });
  assert.equal(redirectResponse.status, 302);
  const rewrittenLocation = redirectResponse.headers.get("location");
  assert.ok(rewrittenLocation?.startsWith(`${proxy.origin}/v1/`));
  assert.equal(originRequests.at(-1).authorization, expectedAuth);
  const redirected = await fetch(rewrittenLocation);
  assert.equal(redirected.status, 200);
  assert.equal(await redirected.text(), "cross-ok");
  assert.equal(crossRequests.at(-1).authorization, undefined, "302 cross-origin target received credentials");

  const playlistResponse = await fetch(proxy.urlFor(`${origin.baseUrl}/auth-playlist`));
  assert.equal(playlistResponse.status, 200);
  const playlist = await playlistResponse.text();
  const keyUrl = playlist.match(/URI="([^"]+)"/)?.[1];
  const mediaUrls = playlist.split(/\r?\n/).filter((line) => line.startsWith("http://127.0.0.1:"));
  assert.ok(keyUrl?.startsWith(`${proxy.origin}/v1/`), "HLS key URL was not retained inside proxy");
  assert.equal(mediaUrls.length, 2, "HLS media references were not rewritten through proxy");
  assert.equal(await (await fetch(keyUrl)).text(), "key");
  assert.equal(originRequests.at(-1).authorization, expectedAuth);
  assert.equal(await (await fetch(mediaUrls[0])).text(), "same-segment");
  assert.equal(originRequests.at(-1).authorization, expectedAuth);
  assert.equal(await (await fetch(mediaUrls[1])).text(), "cross-segment");
  assert.equal(crossRequests.at(-1).authorization, undefined, "cross-origin HLS child received credentials");

  const sidecar = await fetch(proxy.urlFor(`${crossBaseUrl}/sidecar.srt`));
  assert.equal(sidecar.status, 200);
  assert.match(await sidecar.text(), /hello/);
  assert.equal(crossRequests.at(-1).authorization, undefined, "cross-origin sidecar received credentials");

  const expiredUrl = proxy.urlFor(`${origin.baseUrl}/range.bin`);
  await proxy.openSession({
    url: `${origin.baseUrl}/stream.bin`,
    credentialBaseUrl: origin.baseUrl,
    headers: [["Authorization", expectedAuth]],
  });
  const expired = await fetch(expiredUrl);
  assert.equal(expired.status, 410, "switching media did not invalidate the old credential session");

  const danmaku = new DanmakuClient(
    { getSettings: async () => ({ requestTimeoutMs: 2000 }) },
    null,
  );
  await assert.rejects(
    danmaku.importXml({ url: `${crossBaseUrl}/danmaku.xml`, token: "alist-token" }),
    /credentialBaseUrl/,
    "danmaku credentials must fail closed without credentialBaseUrl",
  );
  const directDanmaku = await danmaku.importXml({
    url: `${crossBaseUrl}/danmaku.xml`,
    token: "alist-token",
    credentialBaseUrl: origin.baseUrl,
  });
  assert.equal(directDanmaku.comments.length, 1);
  assert.equal(crossRequests.at(-1).authorization, undefined, "signed cross-origin danmaku received Alist token");

  const redirectedDanmaku = await danmaku.importXml({
    url: `${origin.baseUrl}/danmaku-redirect`,
    token: "alist-token",
    credentialBaseUrl: origin.baseUrl,
  });
  assert.equal(redirectedDanmaku.comments.length, 1);
  const redirectOriginRequest = originRequests.findLast((entry) => entry.url === "/danmaku-redirect");
  assert.equal(redirectOriginRequest.authorization, "alist-token");
  assert.equal(crossRequests.at(-1).authorization, undefined, "danmaku 302 cross-origin target received token");

  console.log("playback auth boundary smoke passed");
} finally {
  await proxy.shutdown();
  await Promise.all([close(origin.server), close(cross.server)]);
}

