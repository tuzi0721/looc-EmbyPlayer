/**
 * Phase 4: Intro/outro detection, update manager, and release pipeline tests.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  SkipMarkerStore,
  MarkerType,
  applyDetectionResult,
  detectFromSilence,
} from "../electron/backend/playback/intro-detection.mjs";
import {
  UpdateManager,
  UpdateState,
  isNewerVersion,
  verifyChecksum,
} from "../electron/backend/updates/update-manager.mjs";
import {
  ReleasePipeline,
  ReleaseStage,
  MigrationRegistry,
} from "../electron/backend/updates/release-pipeline.mjs";

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

// ── Intro/outro detection tests ─────────────────────────────────────

async function testSkipMarkerStore() {
  const store = new SkipMarkerStore();
  const mediaId = "movie-test-2024";

  // Set intro markers.
  store.setMarker(mediaId, MarkerType.INTRO_START, 5000);
  store.setMarker(mediaId, MarkerType.INTRO_END, 65000, { confidence: 0.8 });

  const ranges = store.getSkipRanges(mediaId);
  assertEqual(ranges.length, 1, "one skip range");
  assertEqual(ranges[0].type, "intro", "intro range");
  assertEqual(ranges[0].startMs, 5000, "intro start");
  assertEqual(ranges[0].endMs, 65000, "intro end");
  assertEqual(ranges[0].confidence, 0.8, "intro confidence");
}

async function testSkipRangeAtPosition() {
  const store = new SkipMarkerStore();
  const mediaId = "show-ep1";

  store.setMarker(mediaId, MarkerType.INTRO_START, 10000);
  store.setMarker(mediaId, MarkerType.INTRO_END, 80000);

  // Inside intro.
  const r1 = store.getSkipRangeAt(mediaId, 30000);
  assertEqual(r1?.type, "intro", "inside intro");

  // Just before intro (within tolerance).
  const r2 = store.getSkipRangeAt(mediaId, 9000, 2000);
  assertEqual(r2?.type, "intro", "within tolerance before intro");

  // Outside intro.
  const r3 = store.getSkipRangeAt(mediaId, 90000);
  assertEqual(r3, null, "outside intro");
}

async function testOutroMarkers() {
  const store = new SkipMarkerStore();
  const mediaId = "show-ep2";

  store.setMarker(mediaId, MarkerType.OUTRO_START, 1_320_000);
  store.setMarker(mediaId, MarkerType.OUTRO_END, 1_380_000);

  const ranges = store.getSkipRanges(mediaId);
  assertEqual(ranges.length, 1, "one outro range");
  assertEqual(ranges[0].type, "outro", "outro range");
}

async function testApplyDetectionResult() {
  const store = new SkipMarkerStore();
  const mediaId = "auto-detected";

  applyDetectionResult(store, mediaId, {
    introStartMs: 3000,
    introEndMs: 55000,
    outroStartMs: null,
    outroEndMs: null,
    confidence: 0.7,
    method: "silence",
    metadata: {},
  });

  const ranges = store.getSkipRanges(mediaId);
  assertEqual(ranges.length, 1, "auto-detected intro");
  assertEqual(ranges[0].confidence, 0.7, "auto confidence");
}

async function testSilenceDetection() {
  // Simulate audio levels: loud → silence (intro) → loud → silence (outro) → loud.
  const audioLevels = [
    { positionMs: 0, volumeDb: -10 },
    { positionMs: 3000, volumeDb: -10 },
    { positionMs: 4000, volumeDb: -45 }, // silence starts
    { positionMs: 5000, volumeDb: -50 },
    { positionMs: 60000, volumeDb: -45 }, // silence continues
    { positionMs: 65000, volumeDb: -10 }, // intro ends
    { positionMs: 100000, volumeDb: -10 },
    { positionMs: 1320000, volumeDb: -10 },
    { positionMs: 1325000, volumeDb: -45 }, // outro silence
    { positionMs: 1330000, volumeDb: -50 },
    { positionMs: 1375000, volumeDb: -10 }, // outro ends
    { positionMs: 1400000, volumeDb: -10 },
  ];

  const result = detectFromSilence(audioLevels, {
    outroSearchStartMs: 1_300_000,
    outroSearchEndMs: 1_400_000,
  });

  assertEqual(result.method, "silence", "detection method");
  assertEqual(result.introStartMs, 4000, "intro start");
  assertEqual(result.introEndMs, 65000, "intro end");
  assertEqual(result.outroStartMs, 1325000, "outro start");
  assertEqual(result.outroEndMs, 1375000, "outro end");
  assert.ok(result.confidence > 0, "has confidence");
}

async function testSilenceDetectionNoIntro() {
  // No silence gaps.
  const audioLevels = [
    { positionMs: 0, volumeDb: -10 },
    { positionMs: 10000, volumeDb: -10 },
    { positionMs: 20000, volumeDb: -10 },
  ];

  const result = detectFromSilence(audioLevels);
  assertEqual(result.introStartMs, null, "no intro detected");
  assertEqual(result.confidence, 0, "zero confidence");
}

// ── Update manager tests ────────────────────────────────────────────

async function testVersionComparison() {
  assertEqual(isNewerVersion("1.0.0", "0.9.0"), true, "1.0.0 > 0.9.0");
  assertEqual(isNewerVersion("1.0.1", "1.0.0"), true, "1.0.1 > 1.0.0");
  assertEqual(isNewerVersion("1.0.0", "1.0.0"), false, "equal not newer");
  assertEqual(isNewerVersion("0.9.0", "1.0.0"), false, "0.9.0 < 1.0.0");
  assertEqual(isNewerVersion("2.0.0", "1.9.9"), true, "2.0.0 > 1.9.9");
  assertEqual(isNewerVersion("1.0.0-beta", "1.0.0"), false, "prerelease not newer");
  assertEqual(isNewerVersion("1.0.0", "1.0.0-beta"), true, "release newer than prerelease");
}

async function testChecksumVerification() {
  const data = Buffer.from("test data");
  const hash = createHash("sha256").update(data).digest("hex");
  assertEqual(verifyChecksum(data, hash, "sha256"), true, "valid checksum");
  assertEqual(verifyChecksum(data, "wrong", "sha256"), false, "invalid checksum");
}

async function testUpdateManagerCheck() {
  const manager = new UpdateManager({
    currentVersion: "1.0.0",
    checkUpdate: async (current) => ({
      version: "1.1.0",
      downloadUrl: "https://example.com/update.exe",
      checksum: "abc123",
      checksumAlgorithm: "sha256",
      sizeBytes: 1000,
      releaseNotes: "Bug fixes",
      mandatory: false,
      publishedAt: "2026-07-13T00:00:00Z",
    }),
  });

  const info = await manager.check();
  assertEqual(info.version, "1.1.0", "update available");
  assertEqual(manager.state, UpdateState.AVAILABLE, "state available");
}

async function testUpdateManagerUpToDate() {
  const manager = new UpdateManager({
    currentVersion: "1.1.0",
    checkUpdate: async () => ({
      version: "1.1.0",
      downloadUrl: "",
      checksum: "",
      sizeBytes: 0,
      releaseNotes: "",
      mandatory: false,
      publishedAt: "",
    }),
  });

  const info = await manager.check();
  assertEqual(info, null, "no update");
  assertEqual(manager.state, UpdateState.UP_TO_DATE, "up to date");
}

async function testUpdateManagerDownloadAndVerify() {
  const data = Buffer.from("update package data");
  const checksum = createHash("sha256").update(data).digest("hex");

  const manager = new UpdateManager({
    currentVersion: "1.0.0",
    checkUpdate: async () => ({
      version: "1.1.0",
      downloadUrl: "https://example.com/update",
      checksum,
      checksumAlgorithm: "sha256",
      sizeBytes: data.length,
      releaseNotes: "",
      mandatory: false,
      publishedAt: "",
    }),
    download: async (url, onProgress) => {
      onProgress(data.length / 2);
      onProgress(data.length);
      return data;
    },
  });

  await manager.check();
  const result = await manager.downloadAndVerify();
  assertEqual(result.verified, true, "verified");
  assertEqual(manager.state, UpdateState.READY, "ready state");
  assertEqual(manager.getStagedPath() != null, true, "has staged path");
}

async function testUpdateManagerChecksumFailure() {
  const data = Buffer.from("corrupt data");
  const correctChecksum = createHash("sha256").update(Buffer.from("correct data")).digest("hex");

  const manager = new UpdateManager({
    currentVersion: "1.0.0",
    checkUpdate: async () => ({
      version: "1.1.0",
      downloadUrl: "",
      checksum: correctChecksum,
      checksumAlgorithm: "sha256",
      sizeBytes: data.length,
      releaseNotes: "",
      mandatory: false,
      publishedAt: "",
    }),
    download: async () => data,
  });

  await manager.check();
  let threw = false;
  try {
    await manager.downloadAndVerify();
  } catch (error) {
    threw = true;
  }
  assertEqual(threw, true, "checksum failure throws");
  assertEqual(manager.state, UpdateState.FAILED, "failed state");
}

// ── Release pipeline tests ──────────────────────────────────────────

async function testReleasePipeline() {
  const pipeline = new ReleasePipeline();

  // Create release.
  pipeline.createRelease("1.0.0", { changelog: ["initial release"] });
  assertEqual(pipeline.getCurrentVersion(), null, "not released yet");

  // Stage and release.
  pipeline.markTested("1.0.0");
  pipeline.stageRelease("1.0.0");
  pipeline.release("1.0.0");
  assertEqual(pipeline.getCurrentVersion(), "1.0.0", "1.0.0 released");

  // New release.
  pipeline.createRelease("1.1.0", { changelog: ["bug fix"] });
  pipeline.markTested("1.1.0");
  pipeline.stageRelease("1.1.0");
  pipeline.release("1.1.0");
  assertEqual(pipeline.getCurrentVersion(), "1.1.0", "1.1.0 released");

  // Rollback.
  const rollback = pipeline.rollback("critical bug");
  assertEqual(rollback.rolledBackFrom, "1.1.0", "rollback from");
  assertEqual(rollback.rolledBackTo, "1.0.0", "rollback to");
  assertEqual(pipeline.getCurrentVersion(), "1.0.0", "back to 1.0.0");

  // Check history.
  const history = pipeline.getHistory();
  assertEqual(history.length, 2, "two releases in history");
  const rolledBackRelease = history.find((h) => h.version === "1.1.0");
  assertEqual(rolledBackRelease.rolledBackAt != null, true, "1.1.0 was rolled back");
}

async function testReleasePipelineStages() {
  const pipeline = new ReleasePipeline();
  pipeline.createRelease("2.0.0");

  // Cannot skip stages.
  let threw = false;
  try {
    pipeline.release("2.0.0");
  } catch {
    threw = true;
  }
  assertEqual(threw, true, "cannot skip stages");

  pipeline.markTested("2.0.0");
  threw = false;
  try {
    pipeline.release("2.0.0");
  } catch {
    threw = true;
  }
  assertEqual(threw, true, "must stage before release");

  pipeline.stageRelease("2.0.0");
  pipeline.release("2.0.0");
  assertEqual(pipeline.getCurrentVersion(), "2.0.0", "released after all stages");
}

async function testMigrationRegistry() {
  const registry = new MigrationRegistry();

  registry.register("1.0.0", "1.1.0", async (data) => ({ ...data, schema: 2 }));
  registry.register("1.1.0", "1.2.0", async (data) => ({ ...data, schema: 3 }));

  const result = await registry.migrate("1.0.0", "1.2.0", { schema: 1, settings: {} });
  assertEqual(result.schema, 3, "migrated to schema 3");
  assertEqual(result.settings != null, true, "preserved settings");
}

async function testMigrationNoPath() {
  const registry = new MigrationRegistry();
  registry.register("1.0.0", "1.1.0", async (d) => d);

  let threw = false;
  try {
    await registry.migrate("1.0.0", "2.0.0", {});
  } catch {
    threw = true;
  }
  assertEqual(threw, true, "no migration path throws");
}

// ── Run all tests ───────────────────────────────────────────────────

console.log("Phase 4 checks (intro/outro, updates, release pipeline):");
console.log();

await test("skip marker store", testSkipMarkerStore);
await test("skip range at position", testSkipRangeAtPosition);
await test("outro markers", testOutroMarkers);
await test("apply detection result", testApplyDetectionResult);
await test("silence detection", testSilenceDetection);
await test("silence detection no intro", testSilenceDetectionNoIntro);
await test("version comparison", testVersionComparison);
await test("checksum verification", testChecksumVerification);
await test("update manager check", testUpdateManagerCheck);
await test("update manager up to date", testUpdateManagerUpToDate);
await test("update manager download and verify", testUpdateManagerDownloadAndVerify);
await test("update manager checksum failure", testUpdateManagerChecksumFailure);
await test("release pipeline", testReleasePipeline);
await test("release pipeline stages", testReleasePipelineStages);
await test("migration registry", testMigrationRegistry);
await test("migration no path", testMigrationNoPath);

console.log();
console.log(`Phase 4 checks: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
