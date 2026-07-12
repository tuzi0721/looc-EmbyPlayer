import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { ELECTRON_CSP, injectElectronCsp } from "../electron/before-build.mjs";
import { routeFromProtocolUrl } from "../electron/backend/protocol-routing.mjs";
import { sameHttpOrigin } from "../electron/backend/url-security.mjs";

assert.equal(sameHttpOrigin("https://media.example/a", "https://media.example/b"), true);
assert.equal(sameHttpOrigin("https://media.example/a", "https://media.example:443/b"), true);
assert.equal(sameHttpOrigin("http://media.example/a", "https://media.example/a"), false);
assert.equal(sameHttpOrigin("https://cdn.example/a", "https://media.example/a"), false);
assert.equal(sameHttpOrigin("file:///C:/secret", "file:///C:/secret"), false);
assert.equal(sameHttpOrigin("not a url", "https://media.example"), false);

assert.equal(routeFromProtocolUrl("rodelplayer://play/12345"), "/player/12345");
assert.equal(routeFromProtocolUrl("rodelplayer://item/abc-123_DEF"), "/item/abc-123_DEF");
assert.equal(routeFromProtocolUrl("rodelplayer:play/episode.01"), "/player/episode.01");
assert.equal(routeFromProtocolUrl("rodelplayer://settings"), "/settings");
assert.equal(routeFromProtocolUrl("rodelplayer://play/123%3Ffile%3DC%3A%5Csecret.mkv"), null);
assert.equal(routeFromProtocolUrl("rodelplayer://play/%ZZ"), null);
assert.equal(routeFromProtocolUrl("rodelplayer://player/../../settings"), null);
assert.equal(routeFromProtocolUrl("rodelplayer:play/../../settings"), null);
assert.equal(routeFromProtocolUrl("rodelplayer://play/abc/def"), null);
assert.equal(routeFromProtocolUrl("rodelplayer://play/."), null);
assert.equal(routeFromProtocolUrl("rodelplayer://play/.."), null);
assert.equal(routeFromProtocolUrl("rodelplayer://play/%2e%2e"), null);
assert.equal(routeFromProtocolUrl("rodelplayer://play/abc?id=def"), null);
assert.equal(routeFromProtocolUrl("rodelplayer://arbitrary/player/123"), null);

for (const directive of [
  "default-src 'self'",
  "script-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
]) {
  assert.equal(ELECTRON_CSP.includes(directive), true, `CSP missing ${directive}`);
}

const expectedCspMeta = `<meta http-equiv="Content-Security-Policy" content="${ELECTRON_CSP}">`;
for (const source of [
  "<html><head></head><body></body></html>",
  '<html><head><meta http-equiv="Content-Security-Policy" content=""></head></html>',
  "<html><head><meta content=\"default-src *\" http-equiv='Content-Security-Policy'></head></html>",
  '<html><head><!-- http-equiv="Content-Security-Policy" --></head></html>',
]) {
  const secured = injectElectronCsp(source);
  assert.equal(secured.split(expectedCspMeta).length - 1, 1);
  assert.equal(secured.includes("default-src *"), false);
}

const main = await fs.readFile(new URL("../electron/main.mjs", import.meta.url), "utf8");
for (const required of [
  'preload: path.join(__dirname, "preload.cjs")',
  "sandbox: true",
  "webSecurity: true",
  "allowRunningInsecureContent: false",
  'win.webContents.on("will-redirect", guardTopLevelNavigation)',
  "sender !== window.webContents",
  "frame !== sender.mainFrame",
  'if (app.isPackaged) return null',
  'command === "get_secure_storage_status"',
  'command === "get_secure_secret"',
  'command === "set_secure_secret"',
  'command === "delete_secure_secret"',
]) {
  assert.equal(main.includes(required), true, `main security guard missing: ${required}`);
}
assert.equal(main.includes('preload: path.join(__dirname, "preload.mjs")'), false);
assert.equal(main.includes("webSecurity: false"), false);
assert.equal(main.includes("allowRunningInsecureContent: true"), false);

const preload = await fs.readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
assert.equal(preload.includes('require("electron")'), true);
assert.equal(/^\s*import\s/m.test(preload), false);

console.log("Electron security checks passed: sandbox, IPC/navigation guards, CSP, origins, deep links.");
