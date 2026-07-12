/**
 * Phase 3: Source Registry, Watch History, and Segmented Downloader tests.
 */

import assert from "node:assert/strict";
import {
  SourceRegistry,
  SourceKind,
  createMediaIdentity,
  isSameMedia,
} from "../electron/backend/sources/registry.mjs";
import {
  WatchHistoryStore,
  HistoryEventType,
} from "../electron/backend/history/watch-history.mjs";
import {
  buildManifest,
  manifestProgress,
  selectNextSegment,
  validateManifest,
  SegmentedDownloadExecutor,
  SegmentState,
  TaskState,
} from "../electron/backend/downloads/segmented-downloader.mjs";

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { passed += 1; console.log(`  ✓ ${name}`); })
    .catch((error) => {
      failed += 1;
      console.error(`  ✗ ${name}`);
      console.error(`    ${error?.stack ?? error}`);
    });
}

function assertEqual(actual, expected, label) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── Source Registry tests ───────────────────────────────────────────

async function testSourceRegistry() {
  const registry = new SourceRegistry();

  // Register a mock backend.
  const mockBackend = {
    id: "emby-1",
    kind: SourceKind.EMBY,
    displayName: "My Emby",
    online: true,
    async browse(parentId, cursor, options) {
      return {
        items: [
          { id: "item-1", sourceId: "emby-1", sourceKind: "emby", title: "Movie A", type: "movie", isDirectory: false, isPlayable: true },
        ],
        nextCursor: null,
      };
    },
    async search(query, options) {
      return [
        { id: "item-1", sourceId: "emby-1", sourceKind: "emby", title: query, type: "movie", isDirectory: false, isPlayable: true },
      ];
    },
    async resolve(itemId) {
      return { streamUrl: `https://example.com/${itemId}`, headers: [], userAgent: null, durationMs: 60000, diagnostics: {} };
    },
    async getItem(itemId) {
      return { id: itemId, sourceId: "emby-1", sourceKind: "emby", title: "Test", type: "movie", isDirectory: false, isPlayable: true };
    },
  };

  registry.register(mockBackend);

  assertEqual(registry.list().length, 1, "one source registered");
  assertEqual(registry.get("emby-1")?.displayName, "My Emby", "get by id");

  // Browse.
  const browseResult = await registry.browse("emby-1");
  assertEqual(browseResult.items.length, 1, "browse items");
  assertEqual(browseResult.items[0].title, "Movie A", "browse item title");

  // Search.
  const searchResults = await registry.search("emby-1", "Movie");
  assertEqual(searchResults.length, 1, "search results");

  // Search all.
  const allResults = await registry.searchAll("Movie");
  assertEqual(allResults.length, 1, "searchAll results");

  // Resolve.
  const resolved = await registry.resolve("emby-1", "item-1");
  assertEqual(resolved.streamUrl, "https://example.com/item-1", "resolve url");

  // Unregister.
  registry.unregister("emby-1");
  assertEqual(registry.list().length, 0, "unregistered");
}

async function testMediaIdentity() {
  const item1 = {
    id: "123",
    sourceId: "emby-1",
    title: "My Movie (2024)",
    type: "movie",
    durationMs: 7200000,
    metadata: { year: 2024 },
  };
  const item2 = {
    id: "456",
    sourceId: "webdav-1",
    title: "my movie 2024",
    type: "movie",
    durationMs: 7200000,
    metadata: { year: 2024 },
  };

  const id1 = createMediaIdentity(item1);
  const id2 = createMediaIdentity(item2);

  // Same normalized title and year → same media.
  assertEqual(isSameMedia(id1, id2), true, "same media across sources");

  // Different title → not same.
  const id3 = createMediaIdentity({ id: "789", sourceId: "x", title: "Other Movie", type: "movie" });
  assertEqual(isSameMedia(id1, id3), false, "different media");

  // Same title, different year → not same.
  const id4 = createMediaIdentity({ id: "999", sourceId: "x", title: "My Movie (2024)", type: "movie", metadata: { year: 2023 } });
  assertEqual(isSameMedia(id1, id4), false, "different year");
}

// ── Watch History tests ─────────────────────────────────────────────

async function testWatchHistoryBasic() {
  const store = new WatchHistoryStore();
  const mediaId = "movie-my-movie-2024";

  // Start.
  store.record({
    mediaIdentity: mediaId,
    sourceId: "emby-1",
    itemId: "item-1",
    type: HistoryEventType.START,
    positionMs: 0,
    durationMs: 7200000,
  });

  // Progress.
  store.record({
    mediaIdentity: mediaId,
    sourceId: "emby-1",
    itemId: "item-1",
    type: HistoryEventType.PROGRESS,
    positionMs: 30000,
    durationMs: 7200000,
  });

  const progress = store.getProgress(mediaId);
  assertEqual(progress.positionMs, 30000, "progress position");
  assertEqual(progress.completed, false, "not completed");

  const history = store.getHistory(mediaId);
  assertEqual(history.length, 2, "history entries");
}

async function testWatchHistoryComplete() {
  const store = new WatchHistoryStore();
  const mediaId = "movie-test";

  store.record({
    mediaIdentity: mediaId,
    sourceId: "emby-1",
    itemId: "item-1",
    type: HistoryEventType.COMPLETE,
    positionMs: 7200000,
    durationMs: 7200000,
  });

  const progress = store.getProgress(mediaId);
  assertEqual(progress.completed, true, "completed");
}

async function testWatchHistoryInProgress() {
  const store = new WatchHistoryStore();

  // Two items in progress, one completed.
  store.record({ mediaIdentity: "movie-a", sourceId: "s", itemId: "a", type: HistoryEventType.PROGRESS, positionMs: 1000, durationMs: 60000 });
  store.record({ mediaIdentity: "movie-b", sourceId: "s", itemId: "b", type: HistoryEventType.PROGRESS, positionMs: 2000, durationMs: 60000 });
  store.record({ mediaIdentity: "movie-c", sourceId: "s", itemId: "c", type: HistoryEventType.COMPLETE, positionMs: 60000, durationMs: 60000 });

  const inProgress = store.getInProgress();
  assertEqual(inProgress.length, 2, "two in progress");
  assertEqual(inProgress.some((p) => p.mediaIdentity === "movie-a"), true, "a in progress");
  assertEqual(inProgress.some((p) => p.mediaIdentity === "movie-b"), true, "b in progress");
  assertEqual(inProgress.some((p) => p.mediaIdentity === "movie-c"), false, "c not in progress");
}

async function testWatchHistoryOutbox() {
  const store = new WatchHistoryStore();

  store.record({
    mediaIdentity: "movie-x",
    sourceId: "emby-1",
    itemId: "item-1",
    type: HistoryEventType.START,
    positionMs: 0,
    durationMs: 60000,
  });

  const outbox = store.getOutbox();
  assertEqual(outbox.length, 1, "one outbox entry");

  // Mark as sent.
  store.markOutboxSent(outbox[0].id);
  assertEqual(store.getOutbox().length, 0, "outbox empty after sent");
}

async function testWatchHistoryOutboxRetry() {
  const store = new WatchHistoryStore();

  store.record({
    mediaIdentity: "movie-y",
    sourceId: "emby-1",
    itemId: "item-1",
    type: HistoryEventType.STOP,
    positionMs: 30000,
    durationMs: 60000,
  });

  const outbox = store.getOutbox();
  assertEqual(outbox.length, 1, "outbox has entry");

  // Mark as failed.
  store.markOutboxFailed(outbox[0].id, "network error");
  const retryable = store.getRetryableOutbox();
  // Should not be immediately retryable (backoff).
  assertEqual(retryable.length, 0, "not immediately retryable");

  // Simulate time passing by modifying lastAttemptAt.
  const entry = store.getOutbox()[0];
  entry.lastAttemptAt = new Date(Date.now() - 10_000).toISOString();
  const retryable2 = store.getRetryableOutbox();
  assertEqual(retryable2.length, 1, "retryable after backoff");
}

// ── Segmented Downloader tests ──────────────────────────────────────

async function testManifestBuilder() {
  const manifest = buildManifest({
    taskId: "task-1",
    url: "https://example.com/movie.mkv",
    finalPath: "/tmp/movie.mkv",
    totalBytes: 20 * 1024 * 1024, // 20 MB
    segmentSize: 8 * 1024 * 1024, // 8 MB
    rangeSupported: true,
  });

  assertEqual(manifest.segments.length, 3, "3 segments for 20MB/8MB");
  assertEqual(manifest.segments[0].startByte, 0, "seg 0 start");
  assertEqual(manifest.segments[0].endByte, 8 * 1024 * 1024 - 1, "seg 0 end");
  assertEqual(manifest.segments[1].startByte, 8 * 1024 * 1024, "seg 1 start");
  assertEqual(manifest.segments[2].endByte, 20 * 1024 * 1024 - 1, "seg 2 end");
  assertEqual(manifest.state, TaskState.PENDING, "initial state");
}

async function testManifestSingleSegment() {
  const manifest = buildManifest({
    taskId: "task-2",
    url: "https://example.com/movie.mkv",
    finalPath: "/tmp/movie.mkv",
    totalBytes: 0,
    rangeSupported: false,
  });

  assertEqual(manifest.segments.length, 1, "single segment for non-range");
  assertEqual(manifest.rangeSupported, false, "non-range");
}

async function testManifestProgress() {
  const manifest = buildManifest({
    taskId: "task-3",
    url: "https://example.com/movie.mkv",
    finalPath: "/tmp/movie.mkv",
    totalBytes: 1000,
    segmentSize: 500,
    rangeSupported: true,
  });

  // Simulate downloading first segment.
  manifest.segments[0].downloadedBytes = 500;
  manifest.segments[0].state = SegmentState.COMPLETED;

  const progress = manifestProgress(manifest);
  assertEqual(progress.downloadedBytes, 500, "downloaded 500");
  assertEqual(progress.percent, 50, "50%");
  assertEqual(progress.completedSegments, 1, "1 completed");
  assertEqual(progress.isComplete, false, "not complete");
}

async function testSelectNextSegment() {
  const manifest = buildManifest({
    taskId: "task-4",
    url: "https://example.com/movie.mkv",
    finalPath: "/tmp/movie.mkv",
    totalBytes: 1000,
    segmentSize: 500,
    rangeSupported: true,
  });

  // First call → segment 0.
  const seg0 = selectNextSegment(manifest);
  assertEqual(seg0.index, 0, "first segment");

  // Mark segment 0 as completed.
  seg0.state = SegmentState.COMPLETED;

  // Next call → segment 1.
  const seg1 = selectNextSegment(manifest);
  assertEqual(seg1.index, 1, "second segment");

  // Mark segment 1 as completed.
  seg1.state = SegmentState.COMPLETED;

  // No more segments.
  const seg2 = selectNextSegment(manifest);
  assertEqual(seg2, null, "no more segments");
}

async function testValidateManifest() {
  const manifest = buildManifest({
    taskId: "task-5",
    url: "https://example.com/movie.mkv",
    finalPath: "/tmp/movie.mkv",
    totalBytes: 1000,
    segmentSize: 500,
    rangeSupported: true,
  });

  // Not all segments completed → invalid.
  let validation = validateManifest(manifest);
  assertEqual(validation.valid, false, "incomplete manifest invalid");

  // Complete all segments.
  for (const seg of manifest.segments) {
    seg.state = SegmentState.COMPLETED;
    seg.downloadedBytes = seg.endByte - seg.startByte + 1;
  }

  validation = validateManifest(manifest);
  assertEqual(validation.valid, true, "complete manifest valid");
}

async function testSegmentedDownloadExecutor() {
  const manifest = buildManifest({
    taskId: "task-6",
    url: "https://example.com/movie.mkv",
    finalPath: "/tmp/movie.mkv",
    totalBytes: 100,
    segmentSize: 50,
    rangeSupported: true,
  });

  let mergedCalled = false;
  let cleanedUp = false;

  const executor = new SegmentedDownloadExecutor(manifest, {
    async fetchSegment(url, start, end, signal) {
      const size = end - start + 1;
      return { data: Buffer.alloc(size), bytesReceived: size };
    },
    async writeSegment(tempPath, data) {
      // Mock write.
    },
    async mergeSegments(manifest) {
      mergedCalled = true;
    },
    async cleanupSegments(manifest) {
      cleanedUp = true;
    },
    maxParallel: 2,
  });

  await executor.run();

  assertEqual(manifest.state, TaskState.COMPLETED, "task completed");
  assertEqual(mergedCalled, true, "merge called");
  assertEqual(cleanedUp, true, "cleanup called");

  const progress = manifestProgress(manifest);
  assertEqual(progress.isComplete, true, "all segments complete");
}

async function testSegmentedDownloadCancel() {
  const manifest = buildManifest({
    taskId: "task-7",
    url: "https://example.com/movie.mkv",
    finalPath: "/tmp/movie.mkv",
    totalBytes: 100,
    segmentSize: 50,
    rangeSupported: true,
  });

  let cleanedUp = false;

  const executor = new SegmentedDownloadExecutor(manifest, {
    async fetchSegment(url, start, end, signal) {
      // Cancel during first segment.
      executor.cancel();
      throw new Error("cancelled");
    },
    async writeSegment() {},
    async mergeSegments() {},
    async cleanupSegments() { cleanedUp = true; },
  });

  await executor.run();

  assertEqual(manifest.state, TaskState.CANCELLED, "task cancelled");
  assertEqual(cleanedUp, true, "cleanup after cancel");
}

async function testSegmentedDownloadRetry() {
  const manifest = buildManifest({
    taskId: "task-8",
    url: "https://example.com/movie.mkv",
    finalPath: "/tmp/movie.mkv",
    totalBytes: 50,
    segmentSize: 50,
    rangeSupported: true,
  });

  let fetchAttempts = 0;

  const executor = new SegmentedDownloadExecutor(manifest, {
    async fetchSegment(url, start, end, signal) {
      fetchAttempts += 1;
      if (fetchAttempts < 2) {
        throw new Error("transient error");
      }
      const size = end - start + 1;
      return { data: Buffer.alloc(size), bytesReceived: size };
    },
    async writeSegment() {},
    async mergeSegments() {},
    async cleanupSegments() {},
    maxFailedAttempts: 3,
  });

  await executor.run();

  // First attempt fails, second succeeds (retry of the same segment).
  assertEqual(fetchAttempts, 2, "two fetch attempts");
  assertEqual(manifest.state, TaskState.COMPLETED, "completed after retry");
}

// ── Run all tests ───────────────────────────────────────────────────

console.log("Phase 3 checks (source registry, watch history, segmented downloader):");
console.log();

await test("source registry", testSourceRegistry);
await test("media identity", testMediaIdentity);
await test("watch history basic", testWatchHistoryBasic);
await test("watch history complete", testWatchHistoryComplete);
await test("watch history in-progress list", testWatchHistoryInProgress);
await test("watch history outbox", testWatchHistoryOutbox);
await test("watch history outbox retry", testWatchHistoryOutboxRetry);
await test("manifest builder", testManifestBuilder);
await test("manifest single segment", testManifestSingleSegment);
await test("manifest progress", testManifestProgress);
await test("select next segment", testSelectNextSegment);
await test("validate manifest", testValidateManifest);
await test("segmented download executor", testSegmentedDownloadExecutor);
await test("segmented download cancel", testSegmentedDownloadCancel);
await test("segmented download retry", testSegmentedDownloadRetry);

console.log();
console.log(`Phase 3 checks: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
