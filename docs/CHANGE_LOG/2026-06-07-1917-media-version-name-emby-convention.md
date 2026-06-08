# 2026-06-07 19:17 - Detail page version names follow Emby/Jellyfin convention (no more "版本N")

## Problem

The detail page version dropdown showed generic "版本1 / 版本2" for some items ("要让用户猜他是哪个版本吗？").
Two causes:

1. **Backend dropped the name.** The Tauri `MediaSource` struct (`src-tauri/src/emby/models.rs`) had no `name`
   field, so under the typed Tauri path the Emby `MediaSources[].Name` (e.g. "WEB-DL.Baha", "绿茶字幕组.简日双语")
   was discarded on deserialization → the frontend only ever saw an empty name → fell back to "版本N". (The
   Electron/web path returns raw Emby JSON, so names showed there — hence the inconsistency.)
2. **Frontend rejected path-like names.** `safeMediaSourceName` returned "版本N" whenever the name contained a
   slash, instead of deriving a label from the filename the way Emby/Jellyfin do.

## Research (how the official clients do it)

- Emby multi-version: files share a movie folder, each named `Folder - <label>.ext`; the server trims the common
  prefix and the part after " - " becomes the version label; sources are returned ordered by video width
  (highest first). (Emby Movie-Naming docs; MediaBrowser/Emby#3769 `TrimCommonNames` + `OrderByDescending(width)`.)
- Jellyfin web: shows `MediaSource.Name` in a Version dropdown; derives the label from the filename minus the
  parent folder; sorts resolutions high→low (jellyfin-web PR #1237).
- Takeaway: trust the server `Name`; when it's a path, use the filename (no dir/extension) — don't invent.

## Changed

- `src-tauri/src/emby/models.rs`: `MediaSource` now has `name: Option<String>` (serde PascalCase → `Name`), so
  the Emby-provided version name flows through under Tauri. (`get_item` already requests the `MediaSources`
  field.)
- `src/types/models.ts`: `MediaSourceInfo` gained `Path?: string | null` (Name already existed).
- `src/views/DetailView.vue` `safeMediaSourceName`:
  1. clean server `Name` (no slash/URL) → use as-is;
  2. `Name` is a path → filename without dir/extension (`fileLabelFromPath`);
  3. else `Path` → same filename derivation;
  4. else a spec descriptor (resolution + codec) so versions stay distinguishable;
  5. last resort `版本 N`.
  The dropdown still shows the container · size · bitrate detail line underneath.

## Effect

- Under Tauri, the version selector now shows the real release/version names (matching the Electron path and the
  official clients) instead of "版本1/2"; path-style names degrade to the filename rather than a meaningless
  number.

## Verification

- `npx tauri build --features mpv-embedded` (correct path — embeds dist): frontend type-check + vite ok, cargo
  release 3m40s, fresh 8.33 MB exe with embedded dist; relaunched.
- User to confirm the version dropdown labels on items that previously showed "版本N".

## Next

- Pending user verification this round: #1 fullscreen controls (bottom-zone pin), home hero (random library
  batch + preload), and these version names. Separately noted: a `ciallo.party` player network error seen in a
  screenshot (another server failing to connect) — investigate if the user wants.
