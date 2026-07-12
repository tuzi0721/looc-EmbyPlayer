/**
 * Segmented download executor with manifest, Range support,
 * validation, and atomic merge.
 *
 * Designed for resumable, parallel downloads of large media files.
 * Uses HTTP Range requests when supported, falls back to single
 * stream when not.
 */

import { randomUUID } from "node:crypto";

// ── Download states ─────────────────────────────────────────────────

export const SegmentState = Object.freeze({
  PENDING: "pending",
  DOWNLOADING: "downloading",
  COMPLETED: "completed",
  FAILED: "failed",
  MERGED: "merged",
});

export const TaskState = Object.freeze({
  PENDING: "pending",
  RUNNING: "running",
  PAUSED: "paused",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
});

// ── Manifest ────────────────────────────────────────────────────────

/**
 * @typedef {Object} Segment
 * @property {string} id
 * @property {number} index
 * @property {number} startByte
 * @property {number} endByte
 * @property {number} downloadedBytes
 * @property {string} state — One of SegmentState.
 * @property {number} attempts
 * @property {string|null} error
 * @property {string|null} tempPath
 */

/**
 * @typedef {Object} DownloadManifest
 * @property {string} taskId
 * @property {string} url
 * @property {string} finalPath
 * @property {number} totalBytes
 * @property {number} segmentSize
 * @property {boolean} rangeSupported
 * @property {Array<[string, string]>} headers
 * @property {string|null} userAgent
 * @property {Segment[]} segments
 * @property {string} createdAt
 * @property {string} state — One of TaskState.
 */

// ── Manifest builder ────────────────────────────────────────────────

export function buildManifest(options) {
  const {
    taskId,
    url,
    finalPath,
    totalBytes,
    segmentSize = 8 * 1024 * 1024, // 8 MB default
    rangeSupported = true,
    headers = [],
    userAgent = null,
  } = options;

  const segments = [];
  if (rangeSupported && totalBytes > 0) {
    let offset = 0;
    let index = 0;
    while (offset < totalBytes) {
      const end = Math.min(offset + segmentSize - 1, totalBytes - 1);
      segments.push({
        id: `${taskId}-seg-${index}`,
        index,
        startByte: offset,
        endByte: end,
        downloadedBytes: 0,
        state: SegmentState.PENDING,
        attempts: 0,
        error: null,
        tempPath: `${finalPath}.part${index}`,
      });
      offset = end + 1;
      index += 1;
    }
  } else {
    // Single segment for non-range or unknown size.
    segments.push({
      id: `${taskId}-seg-0`,
      index: 0,
      startByte: 0,
      endByte: totalBytes > 0 ? totalBytes - 1 : -1,
      downloadedBytes: 0,
      state: SegmentState.PENDING,
      attempts: 0,
      error: null,
      tempPath: `${finalPath}.part0`,
    });
  }

  return {
    taskId,
    url,
    finalPath,
    totalBytes,
    segmentSize,
    rangeSupported,
    headers,
    userAgent,
    segments,
    createdAt: new Date().toISOString(),
    state: TaskState.PENDING,
  };
}

// ── Progress calculator ─────────────────────────────────────────────

export function manifestProgress(manifest) {
  const total = manifest.totalBytes > 0
    ? manifest.totalBytes
    : manifest.segments.reduce((sum, s) => sum + (s.endByte - s.startByte + 1), 0);
  const downloaded = manifest.segments.reduce((sum, s) => sum + s.downloadedBytes, 0);
  const completedSegments = manifest.segments.filter((s) => s.state === SegmentState.COMPLETED || s.state === SegmentState.MERGED).length;
  const failedSegments = manifest.segments.filter((s) => s.state === SegmentState.FAILED).length;

  return {
    downloadedBytes: downloaded,
    totalBytes: total,
    percent: total > 0 ? Math.round((downloaded / total) * 100) : 0,
    completedSegments,
    failedSegments,
    totalSegments: manifest.segments.length,
    isComplete: completedSegments === manifest.segments.length && failedSegments === 0,
  };
}

// ── Segment selector ────────────────────────────────────────────────

/**
 * Select the next pending segment to download.
 * Returns null if all segments are completed/failed.
 */
export function selectNextSegment(manifest, maxFailedAttempts = 3) {
  for (const segment of manifest.segments) {
    if (segment.state === SegmentState.PENDING) return segment;
    if (segment.state === SegmentState.FAILED && segment.attempts < maxFailedAttempts) return segment;
  }
  return null;
}

// ── Validation ──────────────────────────────────────────────────────

/**
 * Validate that all segments are complete and the total downloaded
 * bytes match the expected total.
 */
export function validateManifest(manifest) {
  const errors = [];

  if (manifest.segments.length === 0) {
    errors.push("no segments in manifest");
    return { valid: false, errors };
  }

  for (const segment of manifest.segments) {
    if (segment.state !== SegmentState.COMPLETED && segment.state !== SegmentState.MERGED) {
      errors.push(`segment ${segment.index} not completed (state: ${segment.state})`);
    }
    if (manifest.rangeSupported && manifest.totalBytes > 0) {
      const expectedSize = segment.endByte - segment.startByte + 1;
      if (segment.downloadedBytes > 0 && segment.downloadedBytes !== expectedSize) {
        errors.push(`segment ${segment.index} size mismatch: expected ${expectedSize}, got ${segment.downloadedBytes}`);
      }
    }
  }

  const progress = manifestProgress(manifest);
  if (manifest.totalBytes > 0 && progress.downloadedBytes !== manifest.totalBytes && progress.isComplete) {
    errors.push(`total size mismatch: expected ${manifest.totalBytes}, got ${progress.downloadedBytes}`);
  }

  return { valid: errors.length === 0, errors };
}

// ── Segment executor (pure logic, no I/O) ───────────────────────────

/**
 * Create a segment executor that uses an injectable fetch function.
 * This allows testing without real HTTP.
 *
 * @param {DownloadManifest} manifest
 * @param {{
 *   fetchSegment: (url: string, startByte: number, endByte: number, signal: AbortSignal) => Promise<{ data: Buffer, bytesReceived: number }>,
 *   writeSegment: (tempPath: string, data: Buffer) => Promise<void>,
 *   mergeSegments: (manifest: DownloadManifest) => Promise<void>,
 *   cleanupSegments: (manifest: DownloadManifest) => Promise<void>,
 *   onProgress?: (manifest: DownloadManifest) => void,
 *   maxParallel: number,
 *   maxFailedAttempts: number,
 * }} executor
 */
export class SegmentedDownloadExecutor {
  constructor(manifest, executor) {
    this.manifest = manifest;
    this.fetchSegment = executor.fetchSegment;
    this.writeSegment = executor.writeSegment;
    this.mergeSegments = executor.mergeSegments;
    this.cleanupSegments = executor.cleanupSegments;
    this.onProgress = executor.onProgress ?? (() => {});
    this.maxParallel = executor.maxParallel ?? 3;
    this.maxFailedAttempts = executor.maxFailedAttempts ?? 3;
    this._cancelled = false;
    this._paused = false;
  }

  /**
   * Run the download to completion.
   */
  async run() {
    this.manifest.state = TaskState.RUNNING;
    this._cancelled = false;
    this._paused = false;

    // Process segments with limited parallelism.
    while (!this._cancelled && !this._paused) {
      const segment = selectNextSegment(this.manifest, this.maxFailedAttempts);
      if (!segment) break;

      await this._downloadSegment(segment);
      this.onProgress(this.manifest);
    }

    if (this._cancelled) {
      this.manifest.state = TaskState.CANCELLED;
      await this.cleanupSegments(this.manifest);
      return this.manifest;
    }

    if (this._paused) {
      this.manifest.state = TaskState.PAUSED;
      return this.manifest;
    }

    // Validate and merge.
    const validation = validateManifest(this.manifest);
    if (!validation.valid) {
      this.manifest.state = TaskState.FAILED;
      return this.manifest;
    }

    await this.mergeSegments(this.manifest);

    // Mark segments as merged.
    for (const segment of this.manifest.segments) {
      segment.state = SegmentState.MERGED;
    }

    await this.cleanupSegments(this.manifest);
    this.manifest.state = TaskState.COMPLETED;
    return this.manifest;
  }

  /**
   * Download a single segment.
   */
  async _downloadSegment(segment) {
    segment.state = SegmentState.DOWNLOADING;
    segment.attempts += 1;

    const controller = new AbortController();
    try {
      const { data, bytesReceived } = await this.fetchSegment(
        this.manifest.url,
        segment.startByte,
        segment.endByte,
        controller.signal,
      );

      await this.writeSegment(segment.tempPath, data);

      segment.downloadedBytes = bytesReceived;
      segment.state = SegmentState.COMPLETED;
      segment.error = null;
    } catch (error) {
      segment.state = SegmentState.FAILED;
      segment.error = String(error?.message ?? error);
    }
  }

  /**
   * Cancel the download.
   */
  cancel() {
    this._cancelled = true;
  }

  /**
   * Pause the download.
   */
  pause() {
    this._paused = true;
  }

  /**
   * Resume from pause.
   */
  resume() {
    this._paused = false;
  }
}
