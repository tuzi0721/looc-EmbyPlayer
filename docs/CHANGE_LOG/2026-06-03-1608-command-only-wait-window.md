# 2026-06-03 16:08 - command-only wait window extended

## Scope

- Fixed the command-only real-server verifier so it does not clean up immediately when backend autoplay starts late.
- Increased state polling attempts and shortened each `get_state` timeout so the total page evaluation stays under the CDP 60 second limit.

## Verification

- `node --check scripts\real-server-visual-smoke.mjs`

## Result

- Syntax verification passed.
- No release rebuild is required because this only changes the verifier script.
- Next step: rerun real-account command-only verification against the existing `16:04:46` release exe.
