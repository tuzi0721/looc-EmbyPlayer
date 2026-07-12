/**
 * Redaction utilities for URLs, headers, and log fields.
 *
 * Ensures that tokens, passwords, cookies, authorization headers, and
 * URL userinfo / sensitive query parameters never appear in logs, error
 * messages, or structured events.
 */

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "x-emby-token",
  "cookie",
  "set-cookie",
  "proxy-authorization",
  "x-api-key",
  "api-key",
  "password",
  "secret",
  "token",
]);

const SENSITIVE_QUERY_PATTERN =
  /(?:^|[-_.])(?:api[-_]?key|key|token|auth(?:orization)?|session|password|passwd|secret|signature|sig|credential|jwt|hmac|ticket|code|sso|access[-_]?token|refresh[-_]?token)(?:$|[-_.])/i;

/**
 * Redact a URL string: remove userinfo, redact sensitive query parameters.
 *
 * @param {string} urlStr
 * @returns {string}
 */
export function redactUrl(urlStr) {
  if (typeof urlStr !== "string" || !urlStr) return "<none>";
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    const truncated = urlStr.length > 200 ? urlStr.slice(0, 200) + "..." : urlStr;
    return truncated.replace(/[^\s]+@[^\s]+/g, "<redacted-userinfo>");
  }
  // Remove userinfo.
  parsed.username = "";
  parsed.password = "";
  // Build redacted query string manually (avoid URL-encoding the placeholder).
  const params = [];
  for (const [name, value] of parsed.searchParams) {
    if (SENSITIVE_QUERY_PATTERN.test(name)) {
      params.push(`${encodeURIComponent(name)}=<redacted>`);
    } else {
      params.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
    }
  }
  const search = params.length > 0 ? `?${params.join("&")}` : "";
  return `${parsed.origin}${parsed.pathname}${search}${parsed.hash}`;
}

/**
 * Extract just the origin from a URL, safely.
 */
export function redactOrigin(urlStr) {
  if (typeof urlStr !== "string" || !urlStr) return null;
  try {
    return new URL(urlStr).origin;
  } catch {
    return null;
  }
}

/**
 * Redact sensitive headers, returning a shallow copy.
 * Sensitive header values are replaced with "<redacted>".
 */
export function redactHeaders(headers) {
  if (!headers || typeof headers !== "object") return {};
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    result[name] = SENSITIVE_HEADER_NAMES.has(lower) ? "<redacted>" : value;
  }
  return result;
}

/**
 * Redact an array of [name, value] header pairs (as used by Emby line headers).
 */
export function redactHeaderPairs(pairs) {
  if (!Array.isArray(pairs)) return [];
  return pairs.map(([name, value]) => {
    const lower = typeof name === "string" ? name.toLowerCase() : "";
    return SENSITIVE_HEADER_NAMES.has(lower) ? [name, "<redacted>"] : [name, value];
  });
}

/**
 * Sanitize a structured event object for logging.
 * Recursively redacts known sensitive keys.
 */
export function redactEvent(obj) {
  if (obj == null) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redactEvent);
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_HEADER_NAMES.has(lower) || lower === "url" || lower === "endpoint") {
      result[key] = typeof value === "string" ? redactUrl(value) : value;
    } else if (lower === "headers") {
      result[key] = Array.isArray(value)
        ? redactHeaderPairs(value)
        : redactHeaders(value);
    } else if (typeof value === "object") {
      result[key] = redactEvent(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
