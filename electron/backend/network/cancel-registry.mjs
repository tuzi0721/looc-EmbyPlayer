/**
 * IPC cancellation registry.
 *
 * Maintains a registry of in-flight cancellable requests, keyed by
 * requestId. Each entry tracks the sender (webContents), frame,
 * command, AbortController, and creation time.
 *
 * Security:
 * - One window cannot cancel another window's requests.
 * - Sender identity is verified from the IPC event, not from renderer.
 * - Registry has size and TTL limits to prevent leaks.
 */

import { randomUUID } from "node:crypto";

const MAX_REGISTRY_SIZE = 500;
const DEFAULT_TTL_MS = 120_000; // 2 minutes

/**
 * Registry for cancellable IPC requests.
 */
export class CancelRegistry {
  constructor() {
    /** @type {Map<string, RegistryEntry>} */
    this._entries = new Map();
    this._ttlMs = DEFAULT_TTL_MS;
    this._cleanupTimer = null;
  }

  /**
   * Register a new cancellable request.
   *
   * @param {{
   *   senderId: number,
   *   frameId?: number,
   *   command: string,
   *   ttlMs?: number,
   * }} params
   * @returns {{ requestId: string, signal: AbortSignal, controller: AbortController }}
   */
  register({ senderId, frameId, command, ttlMs }) {
    // Enforce size limit.
    if (this._entries.size >= MAX_REGISTRY_SIZE) {
      this._evictOldest();
    }

    const requestId = randomUUID();
    const controller = new AbortController();
    const ttl = ttlMs ?? this._ttlMs;

    const entry = {
      requestId,
      senderId,
      frameId: frameId ?? null,
      command,
      controller,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl,
    };

    this._entries.set(requestId, entry);
    this._ensureCleanupTimer();

    return { requestId, signal: controller.signal, controller };
  }

  /**
   * Cancel a request by ID. Only the owning sender can cancel.
   *
   * @param {string} requestId
   * @param {number} senderId - Verified from IPC event.
   * @returns {boolean} Whether the cancellation was applied.
   */
  cancel(requestId, senderId) {
    const entry = this._entries.get(requestId);
    if (!entry) return false;

    // Verify ownership — one window cannot cancel another's requests.
    if (entry.senderId !== senderId) return false;

    entry.controller.abort();
    this._entries.delete(requestId);
    return true;
  }

  /**
   * Cancel all requests from a specific sender (e.g. when window is destroyed).
   *
   * @param {number} senderId
   * @returns {number} Number of cancelled requests.
   */
  cancelAllForSender(senderId) {
    let count = 0;
    for (const [requestId, entry] of this._entries) {
      if (entry.senderId === senderId) {
        entry.controller.abort();
        this._entries.delete(requestId);
        count += 1;
      }
    }
    return count;
  }

  /**
   * Complete a request and remove it from the registry.
   *
   * @param {string} requestId
   */
  complete(requestId) {
    this._entries.delete(requestId);
  }

  /**
   * Get the current size of the registry.
   */
  size() {
    return this._entries.size;
  }

  /**
   * Check if a request is still in flight.
   */
  has(requestId) {
    return this._entries.has(requestId);
  }

  /**
   * Evict expired entries (TTL-based).
   */
  _evictExpired() {
    const now = Date.now();
    for (const [requestId, entry] of this._entries) {
      if (entry.expiresAt <= now) {
        entry.controller.abort();
        this._entries.delete(requestId);
      }
    }
    if (this._entries.size === 0) {
      this._stopCleanupTimer();
    }
  }

  /**
   * Evict the oldest entry when size limit is reached.
   */
  _evictOldest() {
    let oldest = null;
    let oldestKey = null;
    for (const [key, entry] of this._entries) {
      if (!oldest || entry.createdAt < oldest.createdAt) {
        oldest = entry;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      oldest.controller.abort();
      this._entries.delete(oldestKey);
    }
  }

  _ensureCleanupTimer() {
    if (this._cleanupTimer) return;
    this._cleanupTimer = setInterval(() => this._evictExpired(), 30_000);
    this._cleanupTimer.unref?.();
  }

  _stopCleanupTimer() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }

  /**
   * Destroy the registry and cancel all in-flight requests.
   */
  destroy() {
    for (const entry of this._entries.values()) {
      entry.controller.abort();
    }
    this._entries.clear();
    this._stopCleanupTimer();
  }
}
