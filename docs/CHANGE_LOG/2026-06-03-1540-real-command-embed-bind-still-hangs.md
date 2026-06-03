# 2026-06-03 15:40 - real command-only embed bind still hangs

## Scope

- Reran the real-account command-only verifier against the `15:38:04` Tauri release exe.
- Kept screenshots disabled.
- Confirmed the temporary input file was deleted after the verifier read it.

## Evidence

- Real server setup succeeded:
  - bridge/router ready at `http://tauri.localhost/home`
  - server detection succeeded as Emby
  - login succeeded
  - views/resume/hero/media/series loaded from the real account
  - PlaybackInfo reported 2 media sources and `DirectPlay`
- Playback still failed during command-only player entry.
- App diagnostic log stopped at:
  - `player embed_attach:start`
  - `player embed_attach:parent-ready`
  - `player embed_attach:bind-start`
- The verifier failed with `Runtime.evaluate timeout`.
- Process check after the failure found no residual `emby-player.exe`, `mpv.exe`, or smoke runner process.

## Result

- The 8 second wrapper around `embed_attach` did not surface a timeout/error to the page.
- Next step is to move the blocking native/libmpv initialization work out of the manager write-lock path and add finer diagnostics inside native mpv creation, host creation, and `wid` binding.
