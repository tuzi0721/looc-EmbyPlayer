# 2026-06-02 14:50 Real Smoke Redaction

## Scope
- Added sensitive-value redaction to `scripts/real-server-visual-smoke.mjs` stage output, CDP call errors, CDP evaluation exceptions, and final JSON output.
- Redaction covers the supplied line URLs, URL origins/hosts, username, and password.
- Confirmed the real smoke script still keeps the delayed playback screenshot behavior: wait for visual readiness, then wait an additional 5 seconds before capture.

## Verification
- `node --check scripts\real-server-visual-smoke.mjs`

## Notes
- A prior interactive retry failed before playback because TTY input was submitted incorrectly; future interactive hidden input must be sent one field at a time with a carriage return.
- No credentials, tokens, complete server URLs, or playback URLs are recorded in this log.
