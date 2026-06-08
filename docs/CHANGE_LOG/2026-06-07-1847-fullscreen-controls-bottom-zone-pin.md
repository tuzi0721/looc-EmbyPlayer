# 2026-06-07 18:47 - Fullscreen controls: bottom-zone pin + faster probe + no hide while scrubbing (#1)

## Problem

After the previous round (`embed_pointer_moved`, 250ms poll), revealing the controls over the native video was
still unreliable: the cursor had to *move* every poll tick to keep controls up, the 250ms cadence felt laggy,
and once the cursor settled on the progress bar the auto-hide timer could fire and yank the bar away mid-reach
("似乎不能很好的自适应 … 有概率能操作 … 无法正确呼出进度条").

## Changed

- `src-tauri/src/commands/player.rs`: replaced `embed_pointer_moved -> bool` with `embed_pointer_probe ->
  PointerProbe { moved, inside, near_bottom }`. Besides movement, it now reports whether the cursor is inside
  the window and whether it sits in the bottom strip (~22% of window height, min 120px) where the control bar
  lives.
- `src-tauri/src/lib.rs`: registered `embed_pointer_probe` (was `embed_pointer_moved`).
- `src/api/index.ts`: `embedPointerProbe()` returns `{ moved, inside, nearBottom }`.
- `src/views/PlayerView.vue`:
  - Poll cadence 250ms → 120ms; calls `bumpControls()` when `(moved && inside)` OR `nearBottom`. The
    `nearBottom` branch keeps controls pinned even when the cursor is momentarily still over the bar, so the
    user can settle on and drag the progress bar.
  - `bumpControls()`: no longer auto-hides while `isScrubbing` (progress-bar drag in progress), and only
    triggers a full layout re-sync on the hidden→shown transition (avoids redundant `embedSetRect` churn now
    that the poll calls it up to 8×/s).

## Effect

- Moving the mouse over the video reveals controls more responsively (120ms); hovering the bottom strip keeps
  them up so the progress bar is reachable and stays put while dragging — windowed and fullscreen.

## Verification

- `npm run build` (vue-tsc + vite) passed.

### Build mistake + correction (important)

- I first ran bare `cargo build --release --features mpv-embedded` to produce the exe quickly. **That was
  wrong** and is explicitly warned against by `src-tauri/build.rs` and project memory: a bare
  `cargo build --release` does NOT embed the frontend `dist`; the produced exe bakes in the dev URL
  `localhost:1420`, so on launch it shows "本地网络无法连接" (WebView can't reach the dev server).
  - Proof: `Select-String` on the broken exe found `localhost:1420` present and `/assets/index-` absent;
    size was 7.97 MB (no embedded assets).
- The earlier `npm run tauri:build` did NOT actually hang on a bug — it was doing the first-time **from-scratch
  release compile of all deps** (tauri + windows crates, ~tens of minutes on Windows) and was interrupted.
- Correct fix: `npx tauri build --features mpv-embedded` (the Tauri CLI sets the prod context that embeds
  `dist`). With deps now cached it finished incrementally in **3m 38s**: frontend built (3.79s) → cargo release
  → "Built application at …\target\release\emby-player.exe".
  - Proof: new exe is 8.33 MB, contains `/assets/index-` and this build's `HomeView-DcXZ1ixI` hash, launches to
    the embedded UI (no localhost error). `bundle.active` is false so no installer is produced — the exe is the
    deliverable.

## Next

- User to verify #1 fullscreen controls + the new home hero (random library batch of 5, all backdrops
  preloaded). Remaining backlog item: none open besides confirmation.
