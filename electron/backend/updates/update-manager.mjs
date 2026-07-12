/**
 * Update flow with integrity verification.
 *
 * Handles checking for updates, downloading update packages,
 * verifying checksums, and staging for next-launch installation.
 */

import { createHash } from "node:crypto";

// ── Update states ───────────────────────────────────────────────────

export const UpdateState = Object.freeze({
  IDLE: "idle",
  CHECKING: "checking",
  AVAILABLE: "available",
  DOWNLOADING: "downloading",
  VERIFYING: "verifying",
  READY: "ready",
  FAILED: "failed",
  UP_TO_DATE: "up_to_date",
});

// ── Update info ─────────────────────────────────────────────────────

/**
 * @typedef {Object} UpdateInfo
 * @property {string} version
 * @property {string} downloadUrl
 * @property {string} checksum — SHA-256 hex.
 * @property {string} checksumAlgorithm — "sha256"
 * @property {number} sizeBytes
 * @property {string} releaseNotes
 * @property {boolean} mandatory
 * @property {string} publishedAt
 */

/**
 * @typedef {Object} UpdateProgress
 * @property {number} downloadedBytes
 * @property {number} totalBytes
 * @property {number} percent
 * @property {string} state — One of UpdateState.
 */

// ── Update manager (pure logic, injectable I/O) ────────────────────

export class UpdateManager {
  constructor(options = {}) {
    this.currentVersion = options.currentVersion ?? "0.0.0";
    this.checkUpdateFn = options.checkUpdate ?? (async () => null);
    this.downloadFn = options.download ?? (async () => Buffer.alloc(0));
    this.stagingPathFn = options.stagingPath ?? (() => "/tmp/update-staged");
    this.onProgress = options.onProgress ?? (() => {});

    this.state = UpdateState.IDLE;
    this.updateInfo = null;
    this.downloadedBuffer = null;
    this.error = null;
  }

  /**
   * Check for updates.
   * @returns {Promise<UpdateInfo|null>}
   */
  async check() {
    this.state = UpdateState.CHECKING;
    this.error = null;
    this.onProgress({ state: this.state, downloadedBytes: 0, totalBytes: 0, percent: 0 });

    try {
      const info = await this.checkUpdateFn(this.currentVersion);
      if (!info || !isNewerVersion(info.version, this.currentVersion)) {
        this.state = UpdateState.UP_TO_DATE;
        this.updateInfo = null;
        this.onProgress({ state: this.state, downloadedBytes: 0, totalBytes: 0, percent: 0 });
        return null;
      }
      this.state = UpdateState.AVAILABLE;
      this.updateInfo = info;
      this.onProgress({ state: this.state, downloadedBytes: 0, totalBytes: info.sizeBytes, percent: 0 });
      return info;
    } catch (error) {
      this.state = UpdateState.FAILED;
      this.error = String(error?.message ?? error);
      this.onProgress({ state: this.state, downloadedBytes: 0, totalBytes: 0, percent: 0, error: this.error });
      throw error;
    }
  }

  /**
   * Download and verify the update.
   * @returns {Promise<{ staged: boolean, verified: boolean }>}
   */
  async downloadAndVerify() {
    if (!this.updateInfo) {
      throw new Error("no update available — call check() first");
    }

    this.state = UpdateState.DOWNLOADING;
    this.onProgress({
      state: this.state,
      downloadedBytes: 0,
      totalBytes: this.updateInfo.sizeBytes,
      percent: 0,
    });

    try {
      const buffer = await this.downloadFn(this.updateInfo.downloadUrl, (downloadedBytes) => {
        this.onProgress({
          state: this.state,
          downloadedBytes,
          totalBytes: this.updateInfo.sizeBytes,
          percent: Math.round((downloadedBytes / this.updateInfo.sizeBytes) * 100),
        });
      });
      this.downloadedBuffer = buffer;

      // Verify checksum.
      this.state = UpdateState.VERIFYING;
      this.onProgress({
        state: this.state,
        downloadedBytes: buffer.length,
        totalBytes: this.updateInfo.sizeBytes,
        percent: 100,
      });

      const verified = verifyChecksum(buffer, this.updateInfo.checksum, this.updateInfo.checksumAlgorithm ?? "sha256");
      if (!verified) {
        throw new Error("checksum verification failed");
      }

      this.state = UpdateState.READY;
      this.onProgress({
        state: this.state,
        downloadedBytes: buffer.length,
        totalBytes: this.updateInfo.sizeBytes,
        percent: 100,
        verified: true,
      });

      return { staged: true, verified: true };
    } catch (error) {
      this.state = UpdateState.FAILED;
      this.error = String(error?.message ?? error);
      this.onProgress({
        state: this.state,
        downloadedBytes: 0,
        totalBytes: 0,
        percent: 0,
        error: this.error,
      });
      throw error;
    }
  }

  /**
   * Get the staged update path (for the installer to apply on next launch).
   */
  getStagedPath() {
    if (this.state !== UpdateState.READY) return null;
    return this.stagingPathFn();
  }

  /**
   * Clear staged update.
   */
  reset() {
    this.state = UpdateState.IDLE;
    this.updateInfo = null;
    this.downloadedBuffer = null;
    this.error = null;
  }
}

// ── Version comparison ──────────────────────────────────────────────

/**
 * Compare semantic versions.
 * @returns {true} if `remote` is newer than `current`.
 */
export function isNewerVersion(remote, current) {
  const r = parseVersion(remote);
  const c = parseVersion(current);
  if (r.major !== c.major) return r.major > c.major;
  if (r.minor !== c.minor) return r.minor > c.minor;
  if (r.patch !== c.patch) return r.patch > c.patch;
  // Pre-release versions are lower than release.
  if (r.prerelease && !c.prerelease) return false;
  if (!r.prerelease && c.prerelease) return true;
  return false;
}

function parseVersion(v) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(v);
  if (!match) return { major: 0, minor: 0, patch: 0, prerelease: null };
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] ?? null,
  };
}

// ── Checksum verification ───────────────────────────────────────────

export function verifyChecksum(buffer, expected, algorithm = "sha256") {
  const hash = createHash(algorithm).update(buffer).digest("hex");
  return hash.toLowerCase() === expected.toLowerCase();
}
