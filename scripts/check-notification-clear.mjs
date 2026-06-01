import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { JsonStore } from "../electron/backend/store.mjs";

const rootDir = path.join(os.tmpdir(), `hills-lite-notifications-${Date.now()}`);
process.env.APPDATA = path.join(rootDir, "appdata");

const dir = path.join(rootDir, "user-data");
const store = new JsonStore(dir);

const original = await store.pushNotification({
  kind: "success",
  category: "download",
  title: "Smoke download complete",
  sourceId: "download-1",
});
assert.ok(original);
assert.equal((await store.listNotifications()).length, 1);

await store.clearNotifications();
assert.equal((await store.listNotifications()).length, 0);

const duplicate = await store.pushNotification({
  kind: "success",
  category: "download",
  title: "Smoke download complete",
  sourceId: "download-1",
});
assert.equal(duplicate, null);
assert.equal((await store.listNotifications()).length, 0);

const reloaded = new JsonStore(dir);
const replayed = await reloaded.pushNotification({
  kind: "success",
  category: "download",
  title: "Smoke download complete",
  sourceId: "download-1",
});
assert.equal(replayed, null);

const fresh = await reloaded.pushNotification({
  kind: "success",
  category: "download",
  title: "Smoke download complete",
  sourceId: "download-2",
});
assert.ok(fresh);
assert.equal((await reloaded.listNotifications()).length, 1);

await fs.rm(rootDir, { recursive: true, force: true });
console.log(JSON.stringify({ ok: true }));
