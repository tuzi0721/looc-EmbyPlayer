/**
 * Unified request executor: combines timeouts, external cancellation,
 * retry, and response parsing into a single entry point.
 */

import { NetworkError, classifyError, isCancelled, ErrorCode } from "./errors.mjs";
import { decideRetry, abortableSleep, parseRetryAfter } from "./retry.mjs";
import { parseJson, readBody, isOk, httpStatusError, bodyPreview } from "./response.mjs";
import { redactUrl, redactOrigin } from "./redaction.mjs";
import { defaultPolicyForMethod } from "./request-policy.mjs";

/**
 * Execute a network request with unified timeout, cancellation, and retry.
 *
 * @param {string} url
 * @param {Object} options
 * @param {string} [options.method="GET"]
 * @param {Object|Array<[string,string]>} [options.headers]
 * @param {string|undefined} [options.body]
 * @param {import("./request-policy.mjs").RequestPolicy} [options.policy]
 * @param {AbortSignal} [options.signal] — external cancellation (e.g. from IPC cancel).
 * @param {() => number} [options.random] — injectable random for deterministic tests.
 * @param {string} [options.context] — short label for error messages.
 * @param {"json"|"text"|"none"} [options.parse="json"] — response parsing mode.
 * @param {number} [options.maxBodyBytes] — override max response body size.
 * @param {(event: object) => void} [options.onEvent] — structured event callback.
 * @returns {Promise<{ data: unknown, response: Response, status: number }>}
 */
export async function networkRequest(url, options = {}) {
  const method = (options.method ?? "GET").toUpperCase();
  const requestPolicy = options.policy ?? defaultPolicyForMethod(method);
  const random = options.random ?? Math.random;
  const context = options.context ?? "network_request";
  const redactedUrl = redactUrl(url);
  const origin = redactOrigin(url);
  const parseMode = options.parse ?? "json";

  const totalDeadline = Date.now() + requestPolicy.totalTimeoutMs;
  let attempt = 0;
  let lastError = null;

  while (attempt < requestPolicy.maxAttempts) {
    attempt += 1;

    // Check total budget.
    if (Date.now() >= totalDeadline) {
      lastError = new NetworkError(ErrorCode.TIMEOUT_TOTAL, "total request budget exhausted", {
        attempt,
        maxAttempts: requestPolicy.maxAttempts,
        endpoint: redactedUrl,
        origin,
        phase: "total",
        cause: lastError,
      });
      break;
    }

    // Check external cancellation.
    if (options.signal?.aborted) {
      lastError = new NetworkError(ErrorCode.CANCELLED, "cancelled before attempt", {
        attempt,
        maxAttempts: requestPolicy.maxAttempts,
        endpoint: redactedUrl,
        origin,
        phase: "external-cancel",
      });
      break;
    }

    // Execute the single attempt.
    try {
      const result = await singleAttempt(url, {
        method,
        headers: options.headers,
        body: options.body,
        policy: requestPolicy,
        signal: options.signal,
        attempt,
        maxAttempts: requestPolicy.maxAttempts,
        context,
        redactedUrl,
        origin,
        parseMode,
        maxBodyBytes: options.maxBodyBytes,
      });

      options.onEvent?.({
        type: "request:success",
        attempt,
        maxAttempts: requestPolicy.maxAttempts,
        endpoint: redactedUrl,
        origin,
        status: result.status,
      });

      return result;
    } catch (error) {
      lastError = classifyError(error, {
        attempt,
        maxAttempts: requestPolicy.maxAttempts,
        endpoint: redactedUrl,
        origin,
        phase: error._hillPhase ?? null,
      });

      // Extract Retry-After from the raw response if available.
      if (error._retryAfterHeader) {
        lastError.retryAfterMs = parseRetryAfter(error._retryAfterHeader);
      }

      options.onEvent?.({
        type: "request:error",
        attempt,
        maxAttempts: requestPolicy.maxAttempts,
        endpoint: redactedUrl,
        origin,
        error: lastError.toJSON(),
      });

      // Cancellation is never retried.
      if (isCancelled(lastError)) break;

      // Decide whether to retry.
      const decision = decideRetry(
        lastError,
        attempt,
        requestPolicy.maxAttempts,
        requestPolicy,
        random,
      );

      if (!decision.shouldRetry) break;

      // Wait before retrying, but also abort if the external signal fires.
      try {
        await abortableSleep(decision.delayMs, options.signal);
      } catch {
        lastError = new NetworkError(ErrorCode.CANCELLED, "cancelled during backoff", {
          attempt,
          maxAttempts: requestPolicy.maxAttempts,
          endpoint: redactedUrl,
          origin,
          phase: "external-cancel",
          cause: lastError,
        });
        break;
      }
    }
  }

  // All attempts exhausted or unrecoverable error.
  options.onEvent?.({
    type: "request:failed",
    attempt,
    maxAttempts: requestPolicy.maxAttempts,
    endpoint: redactedUrl,
    origin,
    error: lastError?.toJSON(),
  });

  throw lastError ?? new NetworkError(ErrorCode.UNKNOWN, "unknown network failure", {
    endpoint: redactedUrl,
    origin,
  });
}

/**
 * Execute a single fetch attempt with staged timeouts.
 */
async function singleAttempt(url, opts) {
  const { method, headers, body, policy, signal, attempt, maxAttempts, context, redactedUrl, origin, parseMode, maxBodyBytes } = opts;

  // Create a local AbortController that we can tag with phase info.
  const localController = new AbortController();

  // Combine local + external signals.
  const combinedSignal = signal
    ? AbortSignal.any([signal, localController.signal])
    : localController.signal;

  // Track whether the external signal (user cancel) triggered the abort.
  let externalAborted = false;
  if (signal) {
    if (signal.aborted) externalAborted = true;
    else signal.addEventListener("abort", () => { externalAborted = true; }, { once: true });
  }

  // Tag the controller so classifyError can distinguish phases.
  localController.signal._hillPhase = "connect";

  // Staged timers: connect → response → total.
  let connectTimer = null;
  let responseTimer = null;

  try {
    // Connect timeout.
    connectTimer = setTimeout(() => {
      localController.signal._hillPhase = "connect";
      localController.abort();
    }, policy.connectTimeoutMs);

    const fetchInit = {
      method,
      headers: normalizeHeaders(headers),
      signal: combinedSignal,
    };
    if (body != null) {
      fetchInit.body = body;
    }

    const response = await fetch(url, fetchInit);

    // Clear connect timer, start response timer.
    clearTimeout(connectTimer);
    connectTimer = null;

    localController.signal._hillPhase = "response";
    responseTimer = setTimeout(() => {
      localController.signal._hillPhase = "response";
      localController.abort();
    }, policy.responseTimeoutMs);

    // Check HTTP status.
    if (!isOk(response.status)) {
      // Read a small preview for the error message.
      let preview = "";
      try {
        const text = await readBody(response, 2048);
        preview = bodyPreview(text, 300);
      } catch {
        preview = "<unreadable>";
      }
      const error = httpStatusError(response.status, preview, redactedUrl);
      // Capture Retry-After for 429/503.
      const retryAfter = response.headers.get("retry-after");
      if (retryAfter) {
        error._retryAfterHeader = retryAfter;
      }
      throw error;
    }

    // Keep response timer running during body parsing to catch hangs.
    // Parse the response body.
    let data = null;
    if (parseMode === "json") {
      data = await parseJson(response, { maxBytes: maxBodyBytes });
    } else if (parseMode === "text") {
      data = await readBody(response, maxBodyBytes);
    }

    // Clear response timer after successful body read.
    clearTimeout(responseTimer);
    responseTimer = null;

    return { data, response, status: response.status };
  } catch (error) {
    // If the fetch/stream was aborted, distinguish external cancel from timeout.
    // Stream reads may throw non-AbortError when the underlying fetch is aborted,
    // so also check the controller state directly and create a clean AbortError.
    if (localController.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      const phase = externalAborted
        ? "external-cancel"
        : (localController.signal._hillPhase ?? "connect");
      const abortError = new Error(
        phase === "external-cancel" ? "request cancelled" : `${phase} timeout`,
      );
      abortError.name = "AbortError";
      abortError._hillPhase = phase;
      abortError.cause = error;
      throw abortError;
    }
    throw error;
  } finally {
    if (connectTimer) clearTimeout(connectTimer);
    if (responseTimer) clearTimeout(responseTimer);
  }
}

/**
 * Normalize headers from object or pairs into a plain object.
 */
function normalizeHeaders(headers) {
  if (!headers) return undefined;
  if (Array.isArray(headers)) {
    const obj = {};
    for (const [name, value] of headers) {
      if (name && value != null) obj[name] = String(value);
    }
    return obj;
  }
  return headers;
}

/**
 * Convenience: JSON GET request.
 */
export async function getJson(url, options = {}) {
  const result = await networkRequest(url, {
    ...options,
    method: "GET",
    parse: "json",
  });
  return result.data;
}

/**
 * Convenience: JSON POST request.
 */
export async function postJson(url, body, options = {}) {
  const result = await networkRequest(url, {
    ...options,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
    parse: "json",
  });
  return result.data;
}

/**
 * Convenience: request with no response parsing (e.g. DELETE, POST with empty body).
 */
export async function sendAndForget(url, options = {}) {
  const result = await networkRequest(url, {
    ...options,
    parse: "none",
  });
  return result.status;
}
