/**
 * Retry budget calculator: exponential backoff with jitter and Retry-After.
 *
 * Uses an injectable random source so tests are deterministic.
 */

/**
 * Calculate the backoff delay for a given attempt.
 *
 * @param {number} attempt — 1-based attempt index (1 = first retry).
 * @param {{ baseBackoffMs: number, maxBackoffMs: number, jitterMs: number }} policy
 * @param {() => number} [random] — injectable Math.random replacement.
 * @returns {number} delay in milliseconds (0 means no delay).
 */
export function backoffDelay(attempt, policy, random = Math.random) {
  if (attempt < 1 || policy.maxAttempts <= 1) return 0;
  const exponential = policy.baseBackoffMs * Math.pow(2, attempt - 1);
  const capped = Math.min(exponential, policy.maxBackoffMs);
  const jitter = random() * policy.jitterMs;
  return Math.round(capped + jitter);
}

/**
 * Parse a Retry-After header value into milliseconds.
 * Supports both delta-seconds and HTTP-date formats.
 *
 * @param {string|null} headerValue
 * @returns {number|null}
 */
export function parseRetryAfter(headerValue) {
  if (typeof headerValue !== "string" || !headerValue.trim()) return null;
  const trimmed = headerValue.trim();

  // Delta-seconds.
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 60_000); // cap at 60s
  }

  // HTTP-date.
  const date = Date.parse(trimmed);
  if (Number.isFinite(date)) {
    const delta = date - Date.now();
    return delta > 0 ? Math.min(delta, 60_000) : 0;
  }

  return null;
}

/**
 * Decide whether to retry and compute the delay.
 *
 * @param {{ retryable: boolean, code: string, httpStatus: number|null, retryAfterMs: number|null }} error
 * @param {number} attempt — current attempt (1-based).
 * @param {number} maxAttempts
 * @param {{ baseBackoffMs: number, maxBackoffMs: number, jitterMs: number, respectRetryAfter: boolean }} policy
 * @param {() => number} [random]
 * @returns {{ shouldRetry: boolean, delayMs: number }}
 */
export function decideRetry(error, attempt, maxAttempts, policy, random = Math.random) {
  if (!error.retryable) return { shouldRetry: false, delayMs: 0 };
  if (attempt >= maxAttempts) return { shouldRetry: false, delayMs: 0 };

  let delayMs = backoffDelay(attempt, policy, random);

  // Honor Retry-After if the policy allows it.
  if (policy.respectRetryAfter && error.retryAfterMs != null) {
    delayMs = Math.max(delayMs, error.retryAfterMs);
  }

  return { shouldRetry: true, delayMs };
}

/**
 * Create a sleep promise that is also abortable via an external signal.
 * Resolves after `ms` or rejects if the signal aborts.
 *
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
export function abortableSleep(ms, signal) {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(new Error("aborted"));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    // Cleanup on resolve.
    const originalResolve = resolve;
    resolve = (value) => {
      signal?.removeEventListener("abort", onAbort);
      originalResolve(value);
    };
  });
}
