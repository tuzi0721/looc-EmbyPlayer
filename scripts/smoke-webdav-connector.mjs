import http from "node:http";
import { once } from "node:events";
import { WebDavClient } from "../electron/backend/webdav.mjs";

const expectedAuth = `Basic ${Buffer.from("demo:demo-pass", "utf8").toString("base64")}`;

function multistatus(baseUrl) {
  return `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/dav/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection /></d:resourcetype></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/dav/Movies/</d:href>
    <d:propstat><d:prop>
      <d:displayname>Movies</d:displayname>
      <d:resourcetype><d:collection /></d:resourcetype>
      <d:getlastmodified>Mon, 01 Jun 2026 01:00:00 GMT</d:getlastmodified>
    </d:prop></d:propstat>
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
    <d:href>${baseUrl}Episode%202.mp4</d:href>
    <d:propstat><d:prop>
      <d:displayname>Episode 2.mp4</d:displayname>
      <d:resourcetype />
      <d:getcontentlength>524288000</d:getcontentlength>
      <d:getlastmodified>Mon, 01 Jun 2026 01:06:00 GMT</d:getlastmodified>
      <d:getcontenttype>video/mp4</d:getcontenttype>
    </d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/dav/readme.txt</d:href>
    <d:propstat><d:prop>
      <d:displayname>readme.txt</d:displayname>
      <d:getcontentlength>12</d:getcontentlength>
      <d:getcontenttype>text/plain</d:getcontenttype>
    </d:prop></d:propstat>
  </d:response>
</d:multistatus>`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const server = http.createServer((req, res) => {
  if (req.headers.authorization !== expectedAuth) {
    res.writeHead(401, { "content-type": "text/plain" });
    res.end("unauthorized");
    return;
  }
  if (req.method !== "PROPFIND") {
    res.writeHead(405, { "content-type": "text/plain" });
    res.end("method not allowed");
    return;
  }
  const base = `http://127.0.0.1:${server.address().port}/dav/`;
  res.writeHead(207, { "content-type": "application/xml; charset=utf-8" });
  res.end(multistatus(base));
});

server.listen(0, "127.0.0.1");
await once(server, "listening");

try {
  const baseUrl = `http://127.0.0.1:${server.address().port}/dav/`;
  if (process.argv.includes("--serve")) {
    console.log(`MOCK_WEBDAV_URL=${baseUrl}`);
    await new Promise(() => {});
  }

  const client = new WebDavClient({ timeoutMs: 2_000 });
  const listing = await client.list({
    baseUrl,
    username: "demo",
    password: "demo-pass",
  });

  assert(listing.rootUrl === baseUrl, "root URL should be normalized");
  assert(listing.items.length === 4, `expected 4 entries, got ${listing.items.length}`);
  assert(listing.items[0].isDirectory && listing.items[0].name === "Movies", "directory should sort first");

  const video = listing.items.find((entry) => entry.name === "Episode 1.mkv");
  assert(video, "video entry missing");
  assert(video.playable, "mkv entry should be playable");
  assert(video.sizeBytes === 734003200, "video size should parse");
  assert(video.path === "Episode 1.mkv", `unexpected video path: ${video.path}`);

  const text = listing.items.find((entry) => entry.name === "readme.txt");
  assert(text && !text.playable, "non-video file should not be playable");

  const playableCount = listing.items.filter((entry) => entry.playable).length;
  assert(playableCount === 2, `expected 2 playable videos, got ${playableCount}`);

  console.log("WebDAV connector smoke passed");
} finally {
  server.close();
}
