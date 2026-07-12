/**
 * Local watch history with offline compensation (outbox pattern).
 *
 * Records start/progress/stop/complete events locally, and maintains
 * an outbox of unsent remote progress reports that are replayed when
 * the server becomes available.
 */

import { randomUUID } from "node:crypto";

// ── Event types ─────────────────────────────────────────────────────

export const HistoryEventType = Object.freeze({
  START: "start",
  PROGRESS: "progress",
  STOP: "stop",
  COMPLETE: "complete",
});

// ── Watch history entry ─────────────────────────────────────────────

/**
 * @typedef {Object} HistoryEntry
 * @property {string} id
 * @property {string} mediaIdentity — Normalized title key.
 * @property {string} sourceId
 * @property {string} itemId
 * @property {string} type — One of HistoryEventType.
 * @property {number} positionMs
 * @property {number|null} durationMs
 * @property {boolean} isPaused
 * @property {string} timestamp — ISO 8601.
 * @property {Object|null} metadata
 */

/**
 * @typedef {Object} OutboxEntry
 * @property {string} id
 * @property {string} mediaIdentity
 * @property {string} sourceId
 * @property {string} itemId
 * @property {string} type
 * @property {Object} payload — The data to send to the server.
 * @property {number} attempts
 * @property {string} createdAt
 * @property {string} lastAttemptAt
 * @property {string|null} error
 */

// ── WatchHistoryStore ───────────────────────────────────────────────

export class WatchHistoryStore {
  constructor() {
    /** @type {Map<string, HistoryEntry[]>} keyed by mediaIdentity */
    this._entries = new Map();
    /** @type {OutboxEntry[]} */
    this._outbox = [];
    /** @type {Map<string, { positionMs: number, durationMs: number|null, completed: boolean }>} */
    this._progress = new Map();
  }

  /**
   * Record a watch event.
   */
  record(event) {
    const entry = {
      id: randomUUID(),
      mediaIdentity: event.mediaIdentity,
      sourceId: event.sourceId,
      itemId: event.itemId,
      type: event.type,
      positionMs: event.positionMs ?? 0,
      durationMs: event.durationMs ?? null,
      isPaused: event.isPaused ?? false,
      timestamp: event.timestamp ?? new Date().toISOString(),
      metadata: event.metadata ?? null,
    };

    if (!this._entries.has(entry.mediaIdentity)) {
      this._entries.set(entry.mediaIdentity, []);
    }
    this._entries.get(entry.mediaIdentity).push(entry);

    // Update latest progress.
    if (entry.type === HistoryEventType.PROGRESS || entry.type === HistoryEventType.START) {
      this._progress.set(entry.mediaIdentity, {
        positionMs: entry.positionMs,
        durationMs: entry.durationMs,
        completed: false,
      });
    } else if (entry.type === HistoryEventType.COMPLETE) {
      this._progress.set(entry.mediaIdentity, {
        positionMs: entry.durationMs ?? entry.positionMs,
        durationMs: entry.durationMs,
        completed: true,
      });
    }

    // Queue to outbox if it needs remote sync.
    if (entry.type !== HistoryEventType.PROGRESS || this._shouldQueueProgress(entry)) {
      this._addToOutbox(entry);
    }

    return entry;
  }

  /**
   * Get the latest watch progress for a media item.
   */
  getProgress(mediaIdentity) {
    return this._progress.get(mediaIdentity) ?? null;
  }

  /**
   * Get all watch history for a media item.
   */
  getHistory(mediaIdentity) {
    return this._entries.get(mediaIdentity) ?? [];
  }

  /**
   * Get all media items with progress (for "continue watching").
   */
  getInProgress() {
    const result = [];
    for (const [mediaIdentity, progress] of this._progress) {
      if (!progress.completed && progress.positionMs > 0) {
        result.push({ mediaIdentity, ...progress });
      }
    }
    return result.sort((a, b) => {
      // Sort by most recent activity.
      const aLast = this._entries.get(a.mediaIdentity)?.slice(-1)[0]?.timestamp ?? "";
      const bLast = this._entries.get(b.mediaIdentity)?.slice(-1)[0]?.timestamp ?? "";
      return bLast.localeCompare(aLast);
    });
  }

  /**
   * Get the outbox of unsent remote reports.
   */
  getOutbox() {
    return [...this._outbox];
  }

  /**
   * Mark an outbox entry as sent successfully.
   */
  markOutboxSent(id) {
    const idx = this._outbox.findIndex((e) => e.id === id);
    if (idx >= 0) {
      this._outbox.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Mark an outbox entry as failed (will be retried).
   */
  markOutboxFailed(id, error) {
    const entry = this._outbox.find((e) => e.id === id);
    if (entry) {
      entry.attempts += 1;
      entry.lastAttemptAt = new Date().toISOString();
      entry.error = String(error);
      return true;
    }
    return false;
  }

  /**
   * Get outbox entries ready to retry (exponential backoff).
   */
  getRetryableOutbox(maxAttempts = 5) {
    const now = Date.now();
    return this._outbox.filter((entry) => {
      if (entry.attempts >= maxAttempts) return false;
      const backoffMs = Math.min(1000 * Math.pow(2, entry.attempts), 60_000);
      const lastAttempt = Date.parse(entry.lastAttemptAt);
      return now - lastAttempt >= backoffMs;
    });
  }

  /**
   * Clear completed items from history older than maxAge days.
   */
  pruneOlderThan(maxAgeDays = 90) {
    const cutoff = Date.now() - maxAgeDays * 86_400_000;
    for (const [mediaIdentity, entries] of this._entries) {
      const recent = entries.filter((e) => Date.parse(e.timestamp) >= cutoff);
      if (recent.length === 0) {
        this._entries.delete(mediaIdentity);
        this._progress.delete(mediaIdentity);
      } else {
        this._entries.set(mediaIdentity, recent);
      }
    }
  }

  _shouldQueueProgress(entry) {
    // Only queue every 10 seconds of progress to avoid spamming the outbox.
    const entries = this._entries.get(entry.mediaIdentity) ?? [];
    const lastProgress = [...entries]
      .reverse()
      .find((e) => e.type === HistoryEventType.PROGRESS);
    if (!lastProgress) return true;
    return Math.abs(entry.positionMs - lastProgress.positionMs) >= 10_000;
  }

  _addToOutbox(entry) {
    this._outbox.push({
      id: randomUUID(),
      mediaIdentity: entry.mediaIdentity,
      sourceId: entry.sourceId,
      itemId: entry.itemId,
      type: entry.type,
      payload: {
        positionMs: entry.positionMs,
        durationMs: entry.durationMs,
        isPaused: entry.isPaused,
      },
      attempts: 0,
      createdAt: entry.timestamp,
      lastAttemptAt: entry.timestamp,
      error: null,
    });
  }
}
