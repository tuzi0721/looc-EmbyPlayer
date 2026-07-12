/**
 * Network kernel public surface.
 * Re-exports the modules that form the unified network layer.
 */

export {
  NetworkError,
  ErrorCode,
  ErrorCategory,
  classifyError,
  isCancelled,
} from "./errors.mjs";

export {
  FAST_READ,
  STANDARD_READ,
  WRITE,
  SESSION_REPORT,
  LINE_PROBE,
  policy,
  defaultPolicyForMethod,
} from "./request-policy.mjs";

export {
  backoffDelay,
  parseRetryAfter,
  decideRetry,
  abortableSleep,
} from "./retry.mjs";

export {
  parseJson,
  readBody,
  isOk,
  httpStatusError,
  bodyPreview as formatBodyPreview,
} from "./response.mjs";

export {
  redactUrl,
  redactOrigin,
  redactHeaders,
  redactHeaderPairs,
  redactEvent,
} from "./redaction.mjs";

export {
  networkRequest,
  getJson,
  postJson,
  sendAndForget,
} from "./request.mjs";
