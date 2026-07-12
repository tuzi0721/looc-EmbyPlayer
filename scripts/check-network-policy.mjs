/**
 * Phase 2 N1: Network kernel unit tests.
 *
 * Tests error classification, retry policy, backoff calculation,
 * redaction, and response parsing — all with deterministic mocks,
 * no real network.
 */

import assert from "node:assert/strict";
import http from "node:http";

import {
  NetworkError,
  ErrorCode,
  ErrorCategory,
  classifyError,
  isCancelled,
} from "../electron/backend/network/errors.mjs";

import {
  FAST_READ,
  WRITE,
  LINE_PROBE,
  policy,
  defaultPolicyForMethod,
} from "../electron/backend/network/request-policy.mjs";

import {
  backoffDelay,
  parseRetryAfter,
  decideRetry,
  abortableSleep,
} from "../electron/backend/network/retry.mjs";

import {
  redactUrl,
  redactOrigin,
  redactHeaders,
  redactHeaderPairs,
  redactEvent,
} from "../electron/backend/network/redaction.mjs";

import {
  parseJson,
  isOk,
  httpStatusError,
  bodyPreview,
} from "../electron/backend/network/response.mjs";

import {
  networkRequest,
  getJson,
} from "../electron/backend/network/request.mjs";

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

// ── Error classification tests ──────────────────────────────────────

async function testErrorClassification() {
  // AbortError with connect phase
  const abortConnect = new Error("aborted");
  abortConnect.name = "AbortError";
  abortConnect._hillPhase = "connect";
  const classified = classifyError(abortConnect, { attempt: 1, maxAttempts: 3 });
  assertEqual(classified.code, ErrorCode.TIMEOUT_CONNECT, "abort-connect code");
  assertEqual(classified.retryable, true, "abort-connect retryable");

  // AbortError with external-cancel phase
  const abortCancel = new Error("cancelled");
  abortCancel.name = "AbortError";
  abortCancel._hillPhase = "external-cancel";
  const cancelClassified = classifyError(abortCancel);
  assertEqual(cancelClassified.code, ErrorCode.CANCELLED, "abort-cancel code");
  assertEqual(cancelClassified.retryable, false, "abort-cancel retryable");
  assertEqual(isCancelled(cancelClassified), true, "isCancelled true");

  // TypeError → network unreachable
  const typeError = new TypeError("fetch failed: ENOTFOUND");
  const netError = classifyError(typeError);
  assertEqual(netError.code, ErrorCode.NETWORK_UNREACHABLE, "typeerror code");
  assertEqual(netError.retryable, true, "typeerror retryable");

  // TypeError with certificate → TLS
  const tlsError = new TypeError("certificate has expired");
  const tlsClassified = classifyError(tlsError);
  assertEqual(tlsClassified.code, ErrorCode.TLS, "tls code");
  assertEqual(tlsClassified.retryable, false, "tls retryable");

  // HTTP status errors
  const http401 = httpStatusError(401, "Unauthorized", "https://example.com/api");
  const authError = classifyError(http401);
  assertEqual(authError.code, ErrorCode.HTTP_AUTH, "401 code");
  assertEqual(authError.retryable, false, "401 retryable");
  assertEqual(authError.httpStatus, 401, "401 status");

  const http429 = httpStatusError(429, "Too Many Requests", "https://example.com/api");
  const rateError = classifyError(http429);
  assertEqual(rateError.code, ErrorCode.HTTP_RATE_LIMIT, "429 code");
  assertEqual(rateError.retryable, true, "429 retryable");

  const http503 = httpStatusError(503, "Service Unavailable", "https://example.com/api");
  const transientError = classifyError(http503);
  assertEqual(transientError.code, ErrorCode.HTTP_TRANSIENT, "503 code");
  assertEqual(transientError.retryable, true, "503 retryable");

  const http404 = httpStatusError(404, "Not Found", "https://example.com/api");
  const notFoundError = classifyError(http404);
  assertEqual(notFoundError.code, ErrorCode.HTTP_NOT_FOUND, "404 code");
  assertEqual(notFoundError.retryable, false, "404 retryable");

  // SyntaxError → parse error
  const parseErr = new SyntaxError("Unexpected token <");
  const parseClassified = classifyError(parseErr);
  assertEqual(parseClassified.code, ErrorCode.PARSE, "parse code");

  // NetworkError passthrough
  const existing = new NetworkError(ErrorCode.HTTP_AUTH, "existing");
  const passthrough = classifyError(existing, { attempt: 2, maxAttempts: 3 });
  assertEqual(passthrough.code, ErrorCode.HTTP_AUTH, "passthrough code");
  assertEqual(passthrough.attempt, 2, "passthrough attempt");
}

// ── Retry policy tests ──────────────────────────────────────────────

async function testRetryPolicy() {
  // GET → FAST_READ
  assertEqual(defaultPolicyForMethod("GET").maxAttempts, FAST_READ.maxAttempts, "GET policy");
  assertEqual(defaultPolicyForMethod("HEAD").maxAttempts, FAST_READ.maxAttempts, "HEAD policy");

  // POST → WRITE (no retry)
  assertEqual(defaultPolicyForMethod("POST").maxAttempts, 1, "POST policy maxAttempts");
  assertEqual(defaultPolicyForMethod("POST").idempotent, false, "POST policy idempotent");

  // Custom policy override
  const custom = policy(FAST_READ, { maxAttempts: 5 });
  assertEqual(custom.maxAttempts, 5, "custom maxAttempts");
  assertEqual(custom.connectTimeoutMs, FAST_READ.connectTimeoutMs, "custom inherits connect");

  // Non-idempotent error → no retry
  const nonIdem = { retryable: false, code: "http_auth", httpStatus: 401, retryAfterMs: null };
  const r1 = decideRetry(nonIdem, 1, 3, FAST_READ);
  assertEqual(r1.shouldRetry, false, "non-retryable shouldRetry");

  // Retryable error, attempt < max → retry
  const retryable = { retryable: true, code: "http_transient", httpStatus: 503, retryAfterMs: null };
  const r2 = decideRetry(retryable, 1, 3, FAST_READ, () => 0.5);
  assertEqual(r2.shouldRetry, true, "retryable shouldRetry");
  assert.ok(r2.delayMs > 0, "retryable delayMs > 0");

  // Retryable error, attempt >= max → no retry
  const r3 = decideRetry(retryable, 3, 3, FAST_READ);
  assertEqual(r3.shouldRetry, false, "max attempts shouldRetry");

  // Retry-After respected
  const withRetryAfter = { retryable: true, code: "http_rate_limit", httpStatus: 429, retryAfterMs: 5000 };
  const r4 = decideRetry(withRetryAfter, 1, 3, FAST_READ, () => 0);
  assertEqual(r4.shouldRetry, true, "retry-after shouldRetry");
  assert.ok(r4.delayMs >= 5000, "retry-after delayMs >= 5000");
}

// ── Backoff tests ───────────────────────────────────────────────────

async function testBackoff() {
  // Deterministic random = 0 → no jitter
  const d1 = backoffDelay(1, FAST_READ, () => 0);
  assertEqual(d1, FAST_READ.baseBackoffMs, "backoff attempt 1");

  const d2 = backoffDelay(2, FAST_READ, () => 0);
  assertEqual(d2, FAST_READ.baseBackoffMs * 2, "backoff attempt 2");

  const d3 = backoffDelay(3, FAST_READ, () => 0);
  assertEqual(d3, FAST_READ.baseBackoffMs * 4, "backoff attempt 3");

  // Cap at maxBackoffMs
  const d10 = backoffDelay(10, FAST_READ, () => 0);
  assertEqual(d10, FAST_READ.maxBackoffMs, "backoff capped");

  // No retry → 0
  const d0 = backoffDelay(1, WRITE, () => 0);
  assertEqual(d0, 0, "WRITE no backoff");
}

// ── Retry-After parsing tests ───────────────────────────────────────

async function testRetryAfterParsing() {
  // Delta seconds
  assertEqual(parseRetryAfter("5"), 5000, "retry-after 5s");
  assertEqual(parseRetryAfter("0"), 0, "retry-after 0s");

  // HTTP date (future) — just verify it returns a positive number
  const future = new Date(Date.now() + 10_000).toUTCString();
  const futureMs = parseRetryAfter(future);
  assert.ok(futureMs != null && futureMs > 0, "retry-after future date > 0");

  // Invalid
  assertEqual(parseRetryAfter(null), null, "retry-after null");
  assertEqual(parseRetryAfter("invalid"), null, "retry-after invalid");
  assertEqual(parseRetryAfter(""), null, "retry-after empty");
}

// ── Redaction tests ─────────────────────────────────────────────────

async function testRedaction() {
  // URL with userinfo and sensitive query
  const redacted = redactUrl("https://user:pass@example.com/api?token=secret&data=ok");
  assert.ok(!redacted.includes("user:pass"), "redacted userinfo");
  assert.ok(!redacted.includes("secret"), "redacted token value");
  assert.ok(redacted.includes("<redacted>"), "redacted contains placeholder");
  assert.ok(redacted.includes("data=ok"), "redacted preserves non-sensitive");

  // Origin extraction
  assertEqual(redactOrigin("https://example.com/path?q=1"), "https://example.com", "origin extraction");

  // Headers object
  const redactedH = redactHeaders({
    "Content-Type": "application/json",
    "Authorization": "Bearer token123",
    "X-Emby-Token": "abc123",
    "Accept": "*/*",
  });
  assertEqual(redactedH["Content-Type"], "application/json", "header content-type preserved");
  assertEqual(redactedH["Authorization"], "<redacted>", "header authorization redacted");
  assertEqual(redactedH["X-Emby-Token"], "<redacted>", "header emby-token redacted");

  // Header pairs
  const pairs = redactHeaderPairs([["Authorization", "Bearer xyz"], ["Accept", "*/*"]]);
  assertEqual(pairs[0][1], "<redacted>", "pair authorization redacted");
  assertEqual(pairs[1][1], "*/*", "pair accept preserved");

  // Event redaction
  const event = redactEvent({
    url: "https://user:secret@host/path?token=val",
    headers: { Authorization: "Bearer x" },
    nested: { endpoint: "https://user:pw@host2/path" },
  });
  assert.ok(!JSON.stringify(event).includes("secret"), "event no secret");
  assert.ok(!JSON.stringify(event).includes("Bearer x"), "event no bearer");
}

// ── Response parsing tests ──────────────────────────────────────────

async function testResponseParsing() {
  // isOk
  assertEqual(isOk(200), true, "isOk 200");
  assertEqual(isOk(299), true, "isOk 299");
  assertEqual(isOk(300), false, "isOk 300");
  assertEqual(isOk(404), false, "isOk 404");

  // bodyPreview
  assertEqual(bodyPreview("", 100), "<empty>", "preview empty");
  const long = "x".repeat(200);
  const preview = bodyPreview(long, 50);
  assert.ok(preview.length < 200, "preview truncated");
  assert.ok(preview.endsWith("..."), "preview ends with ...");

  // httpStatusError
  const err = httpStatusError(500, "Internal Server Error", "https://example.com");
  assertEqual(err._httpStatus, 500, "httpStatusError tagged");
}

// ── Integration test with local mock server ─────────────────────────

async function testMockServerIntegration() {
  // Start a mock server that returns 503 twice then 200.
  let requestCount = 0;
  const server = http.createServer((req, res) => {
    requestCount += 1;
    if (requestCount <= 2) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Service Unavailable" }));
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, count: requestCount }));
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/api`;

  try {
    // Use a policy with fast backoff for testing.
    const testPolicy = policy(FAST_READ, {
      baseBackoffMs: 10,
      maxBackoffMs: 50,
      jitterMs: 0,
      maxAttempts: 4,
    });

    const data = await getJson(url, { policy: testPolicy });
    assertEqual(data.ok, true, "mock server success");
    assertEqual(data.count, 3, "mock server third attempt");
    assert.ok(requestCount === 3, `mock server request count: ${requestCount}`);
  } finally {
    server.close();
  }
}

// ── Cancellation test ───────────────────────────────────────────────

async function testCancellation() {
  const server = http.createServer((req, res) => {
    // Never respond — hang forever.
    res.writeHead(200, { "Content-Type": "application/json" });
    // Don't end the response.
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/api`;

  try {
    const controller = new AbortController();
    // Cancel after 100ms.
    setTimeout(() => controller.abort(), 100);

    const testPolicy = policy(FAST_READ, {
      connectTimeoutMs: 10_000,
      responseTimeoutMs: 10_000,
      maxAttempts: 1,
    });

    let caught = null;
    try {
      await getJson(url, { policy: testPolicy, signal: controller.signal });
    } catch (error) {
      caught = error;
    }

    assert.ok(caught instanceof NetworkError, "cancellation throws NetworkError");
    assertEqual(caught.code, ErrorCode.CANCELLED, "cancellation code");
    assertEqual(caught.retryable, false, "cancellation not retryable");
  } finally {
    server.close();
  }
}

// ── Timeout test ────────────────────────────────────────────────────

async function testTimeout() {
  // Server sends headers immediately but never sends body — response timer should fire.
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.flushHeaders();
    // Don't call res.end() — body never arrives.
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/api`;

  try {
    const testPolicy = policy(FAST_READ, {
      connectTimeoutMs: 10_000,
      responseTimeoutMs: 200,
      totalTimeoutMs: 5_000,
      maxAttempts: 1,
    });

    let caught = null;
    try {
      await getJson(url, { policy: testPolicy });
    } catch (error) {
      caught = error;
    }

    assert.ok(caught instanceof NetworkError, "timeout throws NetworkError");
    assertEqual(caught.code, ErrorCode.TIMEOUT_RESPONSE, "timeout response code");
  } finally {
    server.close();
  }
}

// ── abortableSleep test ─────────────────────────────────────────────

async function testAbortableSleep() {
  // Normal sleep
  await abortableSleep(10);
  assert.ok(true, "normal sleep completes");

  // Aborted sleep
  const controller = new AbortController();
  const promise = abortableSleep(10_000, controller.signal);
  controller.abort();
  let threw = false;
  try {
    await promise;
  } catch {
    threw = true;
  }
  assert.ok(threw, "aborted sleep throws");
}

// ── Run all tests ───────────────────────────────────────────────────

console.log("Network kernel checks:");
console.log();

await test("error classification", testErrorClassification);
await test("retry policy", testRetryPolicy);
await test("backoff calculation", testBackoff);
await test("Retry-After parsing", testRetryAfterParsing);
await test("redaction", testRedaction);
await test("response parsing", testResponseParsing);
await test("mock server integration (503→503→200)", testMockServerIntegration);
await test("external cancellation", testCancellation);
await test("response timeout", testTimeout);
await test("abortable sleep", testAbortableSleep);

console.log();
console.log(`Network kernel checks: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
