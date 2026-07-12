/**
 * Request policy: per-request configuration for timeouts, idempotency,
 * and retry budget.  Policies are plain value objects — no mutable state.
 */

/**
 * @typedef {Object} RequestPolicy
 * @property {number} connectTimeoutMs  — max time to establish connection.
 * @property {number} responseTimeoutMs — max time to receive first byte / headers.
 * @property {number} totalTimeoutMs    — max total wall-clock time including retries.
 * @property {number} maxAttempts       — total attempts (1 = no retry).
 * @property {boolean} idempotent       — whether automatic retry is allowed.
 * @property {number} baseBackoffMs     — initial exponential backoff base.
 * @property {number} maxBackoffMs      — backoff cap.
 * @property {number} jitterMs          — full jitter range.
 * @property {boolean} respectRetryAfter— honor Retry-After header (default true).
 */

// ── Preset policies ─────────────────────────────────────────────────

/** Fast read for UI-critical GETs (search, library, detail). */
export const FAST_READ = Object.freeze({
  connectTimeoutMs: 5_000,
  responseTimeoutMs: 10_000,
  totalTimeoutMs: 30_000,
  maxAttempts: 3,
  idempotent: true,
  baseBackoffMs: 300,
  maxBackoffMs: 5_000,
  jitterMs: 200,
  respectRetryAfter: true,
});

/** Standard read for non-UI-critical GETs. */
export const STANDARD_READ = Object.freeze({
  connectTimeoutMs: 8_000,
  responseTimeoutMs: 15_000,
  totalTimeoutMs: 45_000,
  maxAttempts: 3,
  idempotent: true,
  baseBackoffMs: 500,
  maxBackoffMs: 8_000,
  jitterMs: 300,
  respectRetryAfter: true,
});

/** Write operations (POST/PUT/DELETE) — no automatic retry by default. */
export const WRITE = Object.freeze({
  connectTimeoutMs: 8_000,
  responseTimeoutMs: 15_000,
  totalTimeoutMs: 30_000,
  maxAttempts: 1,
  idempotent: false,
  baseBackoffMs: 0,
  maxBackoffMs: 0,
  jitterMs: 0,
  respectRetryAfter: false,
});

/** Playback session reporting — non-idempotent, no retry. */
export const SESSION_REPORT = Object.freeze({
  connectTimeoutMs: 5_000,
  responseTimeoutMs: 8_000,
  totalTimeoutMs: 15_000,
  maxAttempts: 1,
  idempotent: false,
  baseBackoffMs: 0,
  maxBackoffMs: 0,
  jitterMs: 0,
  respectRetryAfter: false,
});

/** Line health probe — fast, idempotent, limited retry. */
export const LINE_PROBE = Object.freeze({
  connectTimeoutMs: 3_000,
  responseTimeoutMs: 5_000,
  totalTimeoutMs: 12_000,
  maxAttempts: 2,
  idempotent: true,
  baseBackoffMs: 200,
  maxBackoffMs: 2_000,
  jitterMs: 100,
  respectRetryAfter: false,
});

/**
 * Create a custom policy by overriding a preset.
 *
 * @param {RequestPolicy} base
 * @param {Partial<RequestPolicy>} overrides
 * @returns {RequestPolicy}
 */
export function policy(base, overrides = {}) {
  return Object.freeze({ ...base, ...overrides });
}

/**
 * Determine the default policy for an HTTP method.
 *
 * @param {string} method
 * @returns {RequestPolicy}
 */
export function defaultPolicyForMethod(method) {
  const upper = method.toUpperCase();
  if (upper === "GET" || upper === "HEAD") return FAST_READ;
  return WRITE;
}
