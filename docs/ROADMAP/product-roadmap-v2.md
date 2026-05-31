# Hills Lite product roadmap v2

## Direction

Hills Lite should become a desktop media hub with the existing Hills Lite visual language, an mpv/libmpv-first player, and connector-based media sources. The near-term goal is not to reskin the app or replace mpv with browser playback; it is to stabilize the current UI and move unstable desktop/backend pieces into a simpler Electron + TypeScript architecture.

## Architecture

- **Shell/UI**: Electron + Vue 3 + TypeScript + Pinia. Keep the current Hills Lite sidebar, dark glass style, detail layout, and player controls unless a redesign is explicitly planned.
- **Playback core**: mpv IPC now; libmpv D3D11/composition later. HTML5/HLS remains fallback only.
- **Connectors**: define one connector contract for Emby, Jellyfin, Plex, local files, WebDAV, SMB, Alist/OpenList, and cloud drives.
- **Normalization**: parse remote responses permissively at connector boundaries, then expose stable internal models to the UI.
- **Performance**: cache images/icons, use CanvasImageSource for heavy image paths where useful, throttle composition resize, centralize shortcuts, and keep hot danmaku/render paths allocation-light.

## Execution order

The roadmap is deliberately ordered around dependency risk. Playback and data normalization come first because every later feature depends on them.

1. **M0 reliability gate**: no blank packaged UI, no mpv process storm, one serialized play path, usable poster/loading state, playable Emby/Jellyfin direct stream.
2. **M1 connector gate**: one connector model for online and file sources, startup reachability probes, image/icon cache, line failover, history/favorites/search aggregation.
3. **M2 player gate**: mpv IPC matures into a stable command/session model, then moves toward libmpv D3D11/composition embedding without losing independent-window and mini-window modes.
4. **M3 media experience gate**: PDP, metadata enrichment, collections, studio/person navigation, Douban/Trakt, and responsive desktop layouts.
5. **M4 text/danmaku gate**: danmaku tracks, subtitle search/style/avoidance, Whisper and AI translation pipelines.
6. **M5 enhancement/system gate**: HDR/VSR/FSR/shaders/RIFE, shortcuts, tray, protocol links, lock prevention, localization, onboarding, backup/import/export.

## Feature lanes

### Online media

- Emby, Jellyfin, Plex.
- Home hero carousel, libraries, favorites, history, aggregate search/favorites/history, cross-source search/history, backup lines, and private services.
- Media list sorting including bitrate sorting.

### File services

- Local files, WebDAV, SMB, Alist/OpenList, and 115 cloud drive.
- Browsing, favorites, history, and automatic associated subtitle/danmaku loading.

### PDP

- Seasons/episodes, media info, cast, collections, artwork, external links, similar items, extras, Douban rating, Trakt sync, studio detail navigation, and single-line studio overflow popover.

### Player

- mpv IPC now; libmpv D3D11/composition, independent window, and mini-window later.
- Gestures, long-press speed, chapters, intro/outro skip, playlist, stats pages, screenshot, topmost, secondary-screen blackout, session-level playback line switching, auto-crop, cache-preserving audio/subtitle switches, width-based control visibility, and minimum window constraints.
- External mpv and CapyPlayer configuration interoperability stay as explicit external-player support.

### Danmaku

- Track-based DanDanPlay, misaka, server danmaku, Bilibili login, and external XML.
- Season auto-match from PDP, heatmap, duplicate merge with `xN`, speed sync, subtitle avoidance, provider User-Agent injection, and independent count display in the danmaku menu.

### Subtitles and AI

- Online subtitle search through assrt.
- ASS appearance controls, subtitle stacking order, subtitle auto-avoidance, screenshot-time avoidance reset.
- Whisper CUDA/Vulkan/local/API modes, cloud/local AI translation APIs, multi-worker async pipeline, cost protection throttling, DTW token timestamps, and bounded pre-read windows.

### Video enhancement and HDR

- NVIDIA RTX VSR, NVIDIA TrueHDR, AMD FSR, GLSL shaders, RIFE interpolation, built-in Auto HDR, eight picture modes, HDR three-state switching, target peak override, system HDR automation, and display-change tracking.
- NVIDIA toggles expose default-enable settings but auto-disable with a clear hint when the GPU or D3D11 hardware path is unavailable.

### Desktop ecosystem

- Config import/export, `rodelplayer://` protocol links, third-party app interop, tray, lock prevention during playback, Visor wheel acceleration, Traditional Chinese/English localization, custom shortcuts, shortcut unbinding, and first-run guide.

## Milestones

### M0 - Stabilize playback and migration

- Fix packaged Electron startup, blank UI, and mpv process storms.
- Keep one reliable playback command path: detail page -> player store -> Electron main -> mpv.
- Preserve poster/background loading states in the player page.
- Add smoke tests for idle `get_state`, play command serialization, and packaged asset loading.

### M1 - Connector foundation

- Emby/Jellyfin first-class support: home hero, libraries, favorites, history, search, seasons/episodes, playback lines, and tolerant response decoding.
- Add connector icon/avatar fallback and startup reachability probing.
- Prepare the same contract for Plex and private services.

### M2 - Player foundation

- Move from external mpv window IPC toward libmpv D3D11/composition embedding.
- Keep independent window and small-window modes as explicit player modes.
- Add playlist, chapters, intro/outro skip, stats, screenshots, topmost, secondary-screen blackout, and width-aware control visibility.

### M3 - PDP and metadata

- Series seasons/episodes, media info, cast, collections, art, external links, similar items, extras, studio navigation, Douban rating, and Trakt sync.
- Keep dense desktop layouts responsive across compact windows, ultrawide, 2K, 4K, and future high-DPI displays.

### M4 - Danmaku and subtitles

- Track-based danmaku system for DanDanPlay, misaka, server danmaku, Bilibili, and external XML.
- Danmaku heatmap, duplicate merge, speed sync, subtitle avoidance, and provider User-Agent handling.
- Online subtitle search, ASS styling controls, subtitle stacking, and screenshot-safe subtitle reset.

### M5 - AI subtitles and enhancement

- Whisper local/API subtitles, CUDA/Vulkan support, async translation workers, cost throttling, DTW timestamp mode, and bounded pre-read windows.
- NVIDIA RTX VSR/TrueHDR, AMD FSR, GLSL shaders, RIFE, Auto HDR, HDR display tracking, and video picture modes.

### M6 - Desktop ecosystem

- Config import/export, `rodelplayer://` protocol, external mpv/CapyPlayer interoperability, tray, lock prevention during playback, localization, first-run guide, custom shortcuts, and key unbinding.
