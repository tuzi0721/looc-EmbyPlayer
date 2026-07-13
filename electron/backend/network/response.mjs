/**
 * Safe response parsing: JSON, text, and empty-body handling.
 * Enforces size limits and content-type checks.
 */

const MAX_JSON_BODY = 16 * 1024 * 1024; // 16 MB
const MAX_TEXT_BODY = 8 * 1024 * 1024;   // 8 MB

/**
 * Read and parse the response body as JSON.
 * Throws a tagged error if the body is too large, not valid JSON,
 * or the content-type is unexpected.
 *
 * @param {Response} response
 * @param {{ maxBytes?: number, acceptContentType?: string|null }} [options]
 * @returns {Promise<unknown>}
 */
export async function parseJson(response, options = {}) {
  const maxBytes = options.maxBytes ?? MAX_JSON_BODY;
  const text = await readBody(response, maxBytes);

  if (!text.trim()) return null;

  // Content-type check is opt-in: only validate when a specific type is requested.
  if (options.acceptContentType != null) {
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("json") && !contentType.includes("javascript")) {
      const error = new Error(
        `unexpected content-type: ${contentType || "<none>"}`,
      );
      error._invalidResponse = true;
      throw error;
    }
  }

  try {
    return JSON.parse(text);
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      const error = new SyntaxError(`invalid JSON response (length=${text.length})`);
      error._invalidResponse = true;
      throw error;
    }
    throw cause;
  }
}

/**
 * Read the response body as text with a size limit.
 *
 * @param {Response} response
 * @param {number} [maxBytes]
 * @returns {Promise<string>}
 */
export async function readBody(response, maxBytes = MAX_TEXT_BODY) {
  // If the server provided Content-Length, check it upfront.
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      const error = new Error(`response body too large: ${declared} bytes`);
      error._invalidResponse = true;
      throw error;
    }
  }

  const reader = response.body?.getReader();
  if (!reader) {
    // No streaming body — fall back to .text().
    return response.text();
  }

  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => {});
        const error = new Error(`response body exceeded ${maxBytes} bytes`);
        error._invalidResponse = true;
        throw error;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock?.();
  }
}

/**
 * Check if a response status indicates success.
 */
export function isOk(status) {
  return status >= 200 && status < 300;
}

/**
 * Create an HTTP error with the status code tagged.
 * Used by the request layer to let classifyError() pick the right ErrorCode.
 */
export function httpStatusError(status, bodyPreview, url) {
  const error = new Error(`HTTP ${status} from ${url ?? "<unknown>"}; body: ${bodyPreview}`);
  error._httpStatus = status;
  return error;
}

/**
 * Get a short body preview for error messages.
 */
export function bodyPreview(body, maxLen = 500) {
  if (!body) return "<empty>";
  const preview = body.length > maxLen ? body.slice(0, maxLen) + "..." : body;
  return preview.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}
