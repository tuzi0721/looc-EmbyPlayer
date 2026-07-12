/**
 * Unified network error types and classification.
 *
 * Every network failure is normalized into a NetworkError with a stable `code`,
 * a user-visible `category`, retryability, HTTP status (if applicable), and the
 * original `cause`.  This allows callers, retry logic, and the UI to make
 * decisions based on structured information rather than string-matching error
 * messages.
 */

// ── Stable error codes ──────────────────────────────────────────────

export const ErrorCode = Object.freeze({
  CANCELLED: "cancelled",
  TIMEOUT_CONNECT: "timeout_connect",
  TIMEOUT_RESPONSE: "timeout_response",
  TIMEOUT_TOTAL: "timeout_total",
  NETWORK_UNREACHABLE: "network_unreachable",
  CONNECTION_RESET: "connection_reset",
  TLS: "tls",
  HTTP_AUTH: "http_auth",
  HTTP_NOT_FOUND: "http_not_found",
  HTTP_RATE_LIMIT: "http_rate_limit",
  HTTP_TRANSIENT: "http_transient",
  HTTP_CLIENT: "http_client",
  INVALID_RESPONSE: "invalid_response",
  PARSE: "parse",
  UNKNOWN: "unknown",
});

// ── User-visible categories ─────────────────────────────────────────

export const ErrorCategory = Object.freeze({
  CANCELLED: "cancelled",
  TIMEOUT: "timeout",
  NETWORK: "network",
  AUTH: "auth",
  NOT_FOUND: "not_found",
  RATE_LIMITED: "rate_limited",
  SERVER: "server",
  CLIENT: "client",
  RESPONSE: "response",
  UNKNOWN: "unknown",
});

// ── Code → metadata mapping ─────────────────────────────────────────

const CODE_META = Object.freeze({
  [ErrorCode.CANCELLED]:           { category: ErrorCategory.CANCELLED,   retryable: false },
  [ErrorCode.TIMEOUT_CONNECT]:     { category: ErrorCategory.TIMEOUT,     retryable: true  },
  [ErrorCode.TIMEOUT_RESPONSE]:    { category: ErrorCategory.TIMEOUT,     retryable: true  },
  [ErrorCode.TIMEOUT_TOTAL]:       { category: ErrorCategory.TIMEOUT,     retryable: false },
  [ErrorCode.NETWORK_UNREACHABLE]: { category: ErrorCategory.NETWORK,     retryable: true  },
  [ErrorCode.CONNECTION_RESET]:    { category: ErrorCategory.NETWORK,     retryable: true  },
  [ErrorCode.TLS]:                 { category: ErrorCategory.NETWORK,     retryable: false },
  [ErrorCode.HTTP_AUTH]:           { category: ErrorCategory.AUTH,        retryable: false },
  [ErrorCode.HTTP_NOT_FOUND]:      { category: ErrorCategory.NOT_FOUND,   retryable: false },
  [ErrorCode.HTTP_RATE_LIMIT]:     { category: ErrorCategory.RATE_LIMITED,retryable: true  },
  [ErrorCode.HTTP_TRANSIENT]:      { category: ErrorCategory.SERVER,      retryable: true  },
  [ErrorCode.HTTP_CLIENT]:         { category: ErrorCategory.CLIENT,      retryable: false },
  [ErrorCode.INVALID_RESPONSE]:    { category: ErrorCategory.RESPONSE,    retryable: false },
  [ErrorCode.PARSE]:               { category: ErrorCategory.RESPONSE,    retryable: false },
  [ErrorCode.UNKNOWN]:             { category: ErrorCategory.UNKNOWN,     retryable: false },
});

// ── NetworkError class ──────────────────────────────────────────────

export class NetworkError extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "NetworkError";
    this.code = code;
    this.category = CODE_META[code]?.category ?? ErrorCategory.UNKNOWN;
    this.retryable = options.overrideRetryable ?? CODE_META[code]?.retryable ?? false;
    this.httpStatus = options.httpStatus ?? null;
    this.attempt = options.attempt ?? 1;
    this.maxAttempts = options.maxAttempts ?? 1;
    this.endpoint = options.endpoint ?? null;      // already redacted
    this.origin = options.origin ?? null;           // already redacted
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.phase = options.phase ?? null;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      retryable: this.retryable,
      httpStatus: this.httpStatus,
      attempt: this.attempt,
      maxAttempts: this.maxAttempts,
      endpoint: this.endpoint,
      origin: this.origin,
      retryAfterMs: this.retryAfterMs,
      phase: this.phase,
    };
  }
}

// ── Classification helpers ──────────────────────────────────────────

const TRANSIENT_HTTP_STATUSES = new Set([502, 503, 504]);

/**
 * Classify a fetch/abort error into a stable NetworkError.
 *
 * @param {unknown} error - The raw error from fetch or our own code.
 * @param {{ attempt?: number, maxAttempts?: number, endpoint?: string|null, origin?: string|null, phase?: string|null }} ctx
 * @returns {NetworkError}
 */
export function classifyError(error, ctx = {}) {
  const attempt = ctx.attempt ?? 1;
  const maxAttempts = ctx.maxAttempts ?? 1;
  const extra = {
    attempt,
    maxAttempts,
    endpoint: ctx.endpoint ?? null,
    origin: ctx.origin ?? null,
    phase: ctx.phase ?? null,
    cause: error,
  };

  // Already a NetworkError — just update attempt info if needed.
  if (error instanceof NetworkError) {
    error.attempt = attempt;
    error.maxAttempts = maxAttempts;
    if (ctx.phase && !error.phase) error.phase = ctx.phase;
    return error;
  }

  const msg = error instanceof Error ? error.message : String(error);

  // AbortError — could be our timeout or external cancel.
  if (error instanceof Error && error.name === "AbortError") {
    // If the caller tagged the controller we can distinguish; otherwise assume
    // it came from our own timeout.  The `request.mjs` layer sets `_hillPhase`
    // on the controller to disambiguate.
    const phase = error._hillPhase ?? ctx.phase;
    if (phase === "external-cancel") {
      return new NetworkError(ErrorCode.CANCELLED, "request cancelled", extra);
    }
    if (phase === "connect") {
      return new NetworkError(ErrorCode.TIMEOUT_CONNECT, "connection timeout", extra);
    }
    if (phase === "response") {
      return new NetworkError(ErrorCode.TIMEOUT_RESPONSE, "response timeout", extra);
    }
    if (phase === "total") {
      return new NetworkError(ErrorCode.TIMEOUT_TOTAL, "total request timeout", extra);
    }
    // Default abort → treat as cancel (safer than retrying).
    return new NetworkError(ErrorCode.CANCELLED, "request aborted", extra);
  }

  // TypeError from fetch usually means DNS failure, unreachable, or CORS.
  if (error instanceof TypeError) {
    const lower = msg.toLowerCase();
    if (lower.includes("certificate") || lower.includes("tls") || lower.includes("ssl")) {
      return new NetworkError(ErrorCode.TLS, msg, extra);
    }
    if (lower.includes("reset") || lower.includes("aborted")) {
      return new NetworkError(ErrorCode.CONNECTION_RESET, msg, extra);
    }
    return new NetworkError(ErrorCode.NETWORK_UNREACHABLE, msg, extra);
  }

  // HTTP status errors thrown by our response handler carry `_httpStatus`.
  if (typeof error._httpStatus === "number") {
    const status = error._httpStatus;
    extra.httpStatus = status;
    if (status === 401 || status === 403) {
      return new NetworkError(ErrorCode.HTTP_AUTH, `HTTP ${status}`, extra);
    }
    if (status === 404) {
      return new NetworkError(ErrorCode.HTTP_NOT_FOUND, `HTTP 404`, extra);
    }
    if (status === 429) {
      return new NetworkError(ErrorCode.HTTP_RATE_LIMIT, `HTTP 429`, extra);
    }
    if (TRANSIENT_HTTP_STATUSES.has(status)) {
      return new NetworkError(ErrorCode.HTTP_TRANSIENT, `HTTP ${status}`, extra);
    }
    if (status >= 400 && status < 500) {
      return new NetworkError(ErrorCode.HTTP_CLIENT, `HTTP ${status}`, extra);
    }
    // 5xx other than 502/503/504 — treat as transient but mark differently.
    if (status >= 500) {
      return new NetworkError(ErrorCode.HTTP_TRANSIENT, `HTTP ${status}`, extra);
    }
  }

  // JSON parse errors.
  if (error instanceof SyntaxError) {
    return new NetworkError(ErrorCode.PARSE, `invalid JSON: ${msg}`, extra);
  }

  // Response validation errors tagged by response.mjs.
  if (error._invalidResponse) {
    return new NetworkError(ErrorCode.INVALID_RESPONSE, msg, extra);
  }

  return new NetworkError(ErrorCode.UNKNOWN, msg, extra);
}

/**
 * Check if an error is a cancellation (user or generation supersede).
 */
export function isCancelled(error) {
  if (!(error instanceof NetworkError)) return false;
  return error.code === ErrorCode.CANCELLED;
}
