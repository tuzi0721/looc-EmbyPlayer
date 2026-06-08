# Anime4K v4 shaders

`hills-player` loads the **official Anime4K v4** GLSL shaders at runtime from this
directory (installed next to the executable as `bin/shaders/anime4k/`). The
shader files themselves are **not vendored here** — drop the official `.glsl`
files from the upstream Anime4K release into this folder.

Source: Anime4K GitHub releases → `Anime4K_v4.0.zip` → `GLSL/` (MIT licensed).

`src/anime4k.cpp` maps preset names to ordered shader chains. Expected file
names (subset used by the built-in presets):

```
Anime4K_Clamp_Highlights.glsl
Anime4K_Restore_CNN_VL.glsl
Anime4K_Restore_CNN_M.glsl
Anime4K_Restore_CNN_Soft_VL.glsl
Anime4K_Restore_CNN_Soft_M.glsl
Anime4K_Upscale_CNN_x2_VL.glsl
Anime4K_Upscale_CNN_x2_M.glsl
Anime4K_Upscale_CNN_x2_S.glsl
Anime4K_Upscale_Denoise_CNN_x2_VL.glsl
Anime4K_AutoDownscalePre_x2.glsl
Anime4K_AutoDownscalePre_x4.glsl
```

Built-in presets: `Off`, `Fast`, `A`, `B`, `C`, `A+A`, `B+B`, `C+A`
(see `Anime4K::chains()`). Missing files are skipped with a warning, so a
partial drop degrades gracefully. The T9b UI (CH-6) selects presets via
`MpvObject.anime4k` / `setAnime4kPreset()`.
