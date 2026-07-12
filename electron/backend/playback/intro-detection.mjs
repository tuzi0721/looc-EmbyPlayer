/**
 * Intro/outro (片头/片尾) detection and skip logic.
 *
 * Provides a pure-logic framework for detecting and storing intro/outro
 * markers for media items. The actual detection algorithm (silence
 * detection, black frame detection, etc.) is pluggable.
 */

// ── Marker types ────────────────────────────────────────────────────

export const MarkerType = Object.freeze({
  INTRO_START: "intro_start",
  INTRO_END: "intro_end",
  OUTRO_START: "outro_start",
  OUTRO_END: "outro_end",
});

// ── Marker ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} SkipMarker
 * @property {string} id
 * @property {string} mediaIdentity — Normalized media key.
 * @property {string} type — One of MarkerType.
 * @property {number} positionMs — Position in milliseconds.
 * @property {number} confidence — 0 to 1.
 * @property {string} source — "auto" | "manual" | "server"
 * @property {string} createdAt
 * @property {string|null} updatedAt
 */

// ── Detection result ────────────────────────────────────────────────

/**
 * @typedef {Object} DetectionResult
 * @property {number|null} introStartMs
 * @property {number|null} introEndMs
 * @property {number|null} outroStartMs
 * @property {number|null} outroEndMs
 * @property {number} confidence
 * @property {string} method — "silence" | "blackframe" | "chapter" | "hash"
 * @property {Object} metadata
 */

// ── Skip range ──────────────────────────────────────────────────────

/**
 * @typedef {Object} SkipRange
 * @property {number} startMs
 * @property {number} endMs
 * @property {string} type — "intro" | "outro"
 * @property {number} confidence
 */

// ── Marker store ────────────────────────────────────────────────────

export class SkipMarkerStore {
  constructor() {
    /** @type {Map<string, SkipMarker[]>} keyed by mediaIdentity */
    this._markers = new Map();
  }

  /**
   * Add or update a marker.
   */
  setMarker(mediaIdentity, type, positionMs, options = {}) {
    if (!this._markers.has(mediaIdentity)) {
      this._markers.set(mediaIdentity, []);
    }
    const markers = this._markers.get(mediaIdentity);

    // Replace existing marker of the same type.
    const existingIdx = markers.findIndex((m) => m.type === type);
    const now = new Date().toISOString();
    const marker = {
      id: existingIdx >= 0 ? markers[existingIdx].id : `${mediaIdentity}-${type}`,
      mediaIdentity,
      type,
      positionMs,
      confidence: options.confidence ?? 1.0,
      source: options.source ?? "manual",
      createdAt: existingIdx >= 0 ? markers[existingIdx].createdAt : now,
      updatedAt: now,
    };

    if (existingIdx >= 0) {
      markers[existingIdx] = marker;
    } else {
      markers.push(marker);
    }

    return marker;
  }

  /**
   * Get all markers for a media item.
   */
  getMarkers(mediaIdentity) {
    return [...(this._markers.get(mediaIdentity) ?? [])];
  }

  /**
   * Get skip ranges (intro/outro) for a media item.
   */
  getSkipRanges(mediaIdentity) {
    const markers = this._markers.get(mediaIdentity) ?? [];
    const map = new Map(markers.map((m) => [m.type, m]));

    const ranges = [];

    const introStart = map.get(MarkerType.INTRO_START);
    const introEnd = map.get(MarkerType.INTRO_END);
    if (introStart && introEnd && introEnd.positionMs > introStart.positionMs) {
      ranges.push({
        startMs: introStart.positionMs,
        endMs: introEnd.positionMs,
        type: "intro",
        confidence: Math.min(introStart.confidence, introEnd.confidence),
      });
    }

    const outroStart = map.get(MarkerType.OUTRO_START);
    const outroEnd = map.get(MarkerType.OUTRO_END);
    if (outroStart && outroEnd && outroEnd.positionMs > outroStart.positionMs) {
      ranges.push({
        startMs: outroStart.positionMs,
        endMs: outroEnd.positionMs,
        type: "outro",
        confidence: Math.min(outroStart.confidence, outroEnd.confidence),
      });
    }

    return ranges;
  }

  /**
   * Check if a position is within a skip range.
   */
  getSkipRangeAt(mediaIdentity, positionMs, toleranceMs = 2000) {
    const ranges = this.getSkipRanges(mediaIdentity);
    for (const range of ranges) {
      if (positionMs >= range.startMs - toleranceMs && positionMs < range.endMs) {
        return range;
      }
    }
    return null;
  }

  /**
   * Delete all markers for a media item.
   */
  clearMarkers(mediaIdentity) {
    this._markers.delete(mediaIdentity);
  }
}

// ── Detection algorithm interface (pluggable) ───────────────────────

/**
 * Apply detection results to the marker store.
 *
 * @param {SkipMarkerStore} store
 * @param {string} mediaIdentity
 * @param {DetectionResult} result
 */
export function applyDetectionResult(store, mediaIdentity, result) {
  const options = { confidence: result.confidence, source: "auto" };

  if (result.introStartMs != null) {
    store.setMarker(mediaIdentity, MarkerType.INTRO_START, result.introStartMs, options);
  }
  if (result.introEndMs != null) {
    store.setMarker(mediaIdentity, MarkerType.INTRO_END, result.introEndMs, options);
  }
  if (result.outroStartMs != null) {
    store.setMarker(mediaIdentity, MarkerType.OUTRO_START, result.outroStartMs, options);
  }
  if (result.outroEndMs != null) {
    store.setMarker(mediaIdentity, MarkerType.OUTRO_END, result.outroEndMs, options);
  }
}

// ── Silence-based detection (pure logic) ────────────────────────────

/**
 * Detect intro/outro from audio silence gaps.
 *
 * @param {Array<{ positionMs: number, volumeDb: number }>} audioLevels
 * @param {{
 *   silenceThresholdDb?: number,
 *   minSilenceMs?: number,
 *   introSearchStartMs?: number,
 *   introSearchEndMs?: number,
 *   outroSearchStartMs?: number,
 *   outroSearchEndMs?: number,
 * }} options
 * @returns {DetectionResult}
 */
export function detectFromSilence(audioLevels, options = {}) {
  const threshold = options.silenceThresholdDb ?? -40;
  const minSilenceMs = options.minSilenceMs ?? 2000;
  const introStart = options.introSearchStartMs ?? 0;
  const introEnd = options.introSearchEndMs ?? 120_000; // First 2 minutes
  const outroStart = options.outroSearchStartMs ?? null;
  const outroEnd = options.outroSearchEndMs ?? null;

  // Find silence gaps.
  const silenceGaps = [];
  let gapStart = null;
  for (let i = 0; i < audioLevels.length; i++) {
    const { positionMs, volumeDb } = audioLevels[i];
    const isSilent = volumeDb <= threshold;
    if (isSilent && gapStart === null) {
      gapStart = positionMs;
    } else if (!isSilent && gapStart !== null) {
      const gapDuration = positionMs - gapStart;
      if (gapDuration >= minSilenceMs) {
        silenceGaps.push({ startMs: gapStart, endMs: positionMs, durationMs: gapDuration });
      }
      gapStart = null;
    }
  }
  // Handle trailing silence.
  if (gapStart !== null && audioLevels.length > 0) {
    const lastPos = audioLevels[audioLevels.length - 1].positionMs;
    const gapDuration = lastPos - gapStart;
    if (gapDuration >= minSilenceMs) {
      silenceGaps.push({ startMs: gapStart, endMs: lastPos, durationMs: gapDuration });
    }
  }

  // Find intro gap (first significant silence in intro search range).
  let introStartMs = null;
  let introEndMs = null;
  for (const gap of silenceGaps) {
    if (gap.startMs >= introStart && gap.endMs <= introEnd) {
      introStartMs = gap.startMs;
      introEndMs = gap.endMs;
      break;
    }
  }

  // Find outro gap (last significant silence in outro search range).
  let outroStartMs = null;
  let outroEndMs = null;
  if (outroStart != null && outroEnd != null) {
    for (let i = silenceGaps.length - 1; i >= 0; i--) {
      const gap = silenceGaps[i];
      if (gap.startMs >= outroStart && gap.endMs <= outroEnd) {
        outroStartMs = gap.startMs;
        outroEndMs = gap.endMs;
        break;
      }
    }
  }

  return {
    introStartMs,
    introEndMs,
    outroStartMs,
    outroEndMs,
    confidence: introStartMs != null ? 0.7 : 0,
    method: "silence",
    metadata: { silenceGaps: silenceGaps.length, threshold },
  };
}
