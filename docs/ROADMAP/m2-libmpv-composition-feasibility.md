# M2 P0 architecture validation — libmpv D3D11 render + composition embedding

Status: **feasibility/risk/effort conclusion (go/no-go)** — owner CH-3, task `task_mq4qbaj4_zrr2f0`.
Stack pinned in this repo: **Tauri 2.11.2 / wry 0.55.1 / WebView2 (Chromium) / libmpv2 5.x**.

## 1. Question

Can we replace the current "native mpv child window (`--wid`) sitting over an opaque WebView2"
embedding with HillsLite's model — libmpv rendered as a **GPU texture composited into the UI**,
so HTML controls overlay the video with no reserved dead zone, no swallowed pointer, no
child-window rect/DPI sync, no fullscreen auto-hide, no progress-drag race?

Hard constraint kept throughout: **local-decode only** (no server transcode), same as today.

## 2. Current architecture and why it hurts

Today both backends put mpv in a **native child HWND**:

- `mpv/ipc.rs` launches bundled `mpv.exe` with `--wid=<host>` into a `HostWindow` child window.
- `mpv/embedded.rs` (feature `mpv-embedded`, libmpv2) **also** sets `wid` — it does *not* use the
  libmpv render API; it still hands mpv a child HWND.
- The frontend reports the player rectangle (CSS px) and the backend repositions the child window:
  `commands::player::embed_set_rect` → `MpvManager::embed_rect` → `HostWindow::set_rect`.

That native child window is a sibling/overlay on top of the opaque WebView2, which forces the
known workarounds (all present in the codebase today):

- **Pointer swallowed**: WebView2 cannot receive mouse events over the mpv HWND, so the app polls
  the OS cursor every frame — `commands::player::embed_pointer_probe` (`GetCursorPos` +
  manual hit-testing of a "bottom strip") just to reveal/keep controls.
- **Reserved dead zones / z-order**: controls must avoid the video HWND or use the separate
  `overlay` top-most transparent window (`tauri.conf.json` → window label `overlay`,
  `src/views/PlayerOverlay.vue`).
- **Rect/DPI sync**: `embed_set_rect` round-trips CSS px → physical px on every layout/resize
  (`apply_rect`/`scaled_rect` in `bin/electron_mpv_host.rs`).
- **Fullscreen / mini-window**: every mode change re-syncs the child HWND rect and visibility.

These are all symptoms of **two separate, non-composited surfaces** (HTML vs. video) in the
window. Fixing them one-by-one is the current incremental track; the proposed approach removes
the root cause by compositing both into **one** visual tree.

## 3. Proposed model (what HillsLite / media_kit actually do)

media_kit (Flutter) works because **Flutter composites the entire UI as one GPU scene (Skia)**
and exposes a *texture-injection* API: libmpv renders (via its render API) into a GL/ANGLE
texture, and that texture is handed to Flutter's compositor as a `Texture` widget in the tree.
Video and UI are blended by the *same* compositor, so overlay/hit-testing/DPI/fullscreen are all
"just UI".

Porting that idea to our stack means reproducing two things:

1. **libmpv render API → a GPU texture** (instead of `--wid`).
2. **A compositor that blends that texture under the HTML UI** — i.e. WebView2 must be a
   *transparent layer in a visual tree we control*, with the mpv texture as a sibling visual
   below it.

## 4. Feasibility, layer by layer

### Layer 1 — libmpv render API → D3D11 texture: **feasible, medium effort**

- libmpv's render API (`mpv_render_context_create`) has **no first-party D3D11 backend**; it
  supports **OpenGL** and a software path only (mpv-player/mpv#5979; an unmerged `d3d11_headless`
  fork exists but is not upstream).
- The proven Windows route (what media_kit uses) is **ANGLE**: create an EGL/ANGLE GL context
  whose render target is a **D3D11 shared texture**
  (`EGL_ANGLE_d3d_texture_client_buffer` / `eglCreatePbufferFromClientBuffer` with a DXGI shared
  handle), let mpv render GL into it, then present/compose that D3D11 texture.
- Cost: bring in ANGLE (`libEGL`/`libGLESv2`) + EGL interop glue + a `mpv_render_context` render
  loop driven by `MPV_RENDER_UPDATE` callbacks. `libmpv2` exposes the render API but the EGL/D3D
  interop is hand-written `unsafe`. This is well-trodden but non-trivial (~1–2 weeks to a solid,
  HW-decoded, zero-copy frame on screen). A software-render fallback (mpv SW → upload to D3D11) is
  a faster spike but drops zero-copy/HW-decode efficiency.

Verdict: **not the blocker.** It is real work but a known, bounded problem.

### Layer 2 — compositing video *under* HTML controls: **BLOCKED on the current stack**

This is the decisive finding.

- **wry 0.55.1 creates WebView2 with `CreateCoreWebView2Controller` = windowed hosting.** The
  WebView2 lives in a **cross-process, opaque child HWND**. (Confirmed by the WebView2 team in
  MicrosoftEdge/WebView2Feedback#3200, and by wry source.)
- To put a D3D/DComp video layer **behind** a transparent WebView in the *same window*, WebView2
  must run in **visual / composition hosting** mode via
  **`CreateCoreWebView2CompositionController`**, whose `RootVisualTarget` is attached to a
  DirectComposition (`IDCompositionVisual`) or Windows.UI.Composition visual tree that *we* own.
  Then: bottom visual = mpv D3D11 swapchain, top visual = WebView2 (transparent bg).
- **wry does not expose composition hosting** (as of 0.55.1 / June 2026). `with_transparent` is
  windowed-only transparency (lets the parent/desktop show through, not an arbitrary D3D layer).
  Community confirmation that this specific overlay-over-WebView2 case "cannot be made to work"
  on Tauri's windowed WebView2 without composition hosting.

Consequence: **the proposed single-window composited overlay is not achievable through Tauri/wry
as-is.** It requires either (a) forking/patching wry to support composition hosting, or
(b) bypassing Tauri's webview creation entirely and hand-building the window + DComp tree +
`CreateCoreWebView2CompositionController` ourselves — and then re-implementing everything wry/Tauri
normally gives us in composition mode: **manual input routing** (`SendMouseInput`,
`SendPointerInput`, wheel, cursor, focus), **IME**, **DPI**, **drag/drop** (`DragStarting`),
**accessibility**, HDR, and resize.

## 5. Options matrix

| # | Approach | Solves root cause? | Effort | Risk | Notes |
|---|----------|--------------------|--------|------|-------|
| **B** | libmpv render→D3D11 + **WebView2 composition hosting** in one window (proposed) | Yes | **XL (multi-week)** | **High** | Needs wry fork *or* custom WebView2 composition host + manual input/IME/DPI; ongoing divergence from upstream Tauri. |
| **B′** | Same, but upstream a composition-hosting mode into wry | Yes | XL + upstream lead time | High/med | Cleanest long-term; depends on maintainers; not in our control for M2. |
| **C** | **Two-window overlay**: keep mpv video window; put HTML controls in a transparent, top-most, hit-test-forwarding WebView window above it | Mostly (no DOM dead zone, controls get real input) | **M** | **Low/med** | Already scaffolded: `overlay` window + `PlayerOverlay.vue`. Still HWND-level rect/DPI/z-order/fullscreen sync, but no GPU/wry-fork work. Ships within M2. |
| **D** | mpv native OSC in its own window (no HTML controls) | Sidesteps it | S | Low | `mpv/standalone.rs` (sibling task) already does this; loses custom HTML player UI. |

## 6. Recommendation

1. **Do NOT start the full B implementation blind.** Its entire value hinges on one unproven
   capability on our stack: **WebView2 composition hosting under a Tauri-shaped app**. De-risk
   that *first* with the smallest possible spike (§7) — days, not weeks.
2. **If the spike is green** → proceed to Layer 1 (libmpv render via ANGLE→D3D11) and wire the
   mpv visual below the WebView2 visual. Budget XL and plan to either maintain a wry fork or
   upstream composition hosting (B′).
3. **If the spike is red or too costly to maintain** → adopt **Option C (two-window overlay)** as
   the M2 deliverable. It removes the DOM dead-zone and pointer-swallow pain (the worst offenders)
   without a GPU rewrite, and reuses the already-present `overlay` window + `PlayerOverlay.vue`.
4. Keep **independent-window** and **mini-window** modes (roadmap M2 requirement) regardless —
   `standalone.rs` already covers independent-window.

## 7. Minimal decisive PoC (the smallest reproducible example)

Goal: prove/kill **Layer 2** with **no libmpv and no Emby** in the loop, so the result is
unambiguous and cheap.

**Build** a tiny standalone Win32 example (`examples/compose_spike` or a throwaway bin):

1. Create a top-level HWND + an `IDCompositionDevice`/`IDCompositionTarget` (or
   `Windows.UI.Composition`) visual tree.
2. Bottom visual: a D3D11 swapchain (`IDXGIFactory2::CreateSwapChainForComposition`) that just
   clears to a moving color (stand-in for the future mpv texture).
3. Top visual: WebView2 via **`CreateCoreWebView2CompositionController`**, `put_RootVisualTarget`
   to a visual above the D3D one, background set transparent; load an HTML page with a
   semi-transparent control bar + a button + a draggable slider.
4. Forward input to the composition controller (`SendMouseInput`/`SendPointerInput`, cursor,
   focus); handle resize + DPI.

**Success criteria (== the task's acceptance, minus A/V):**
- The moving color shows through the transparent areas of the HTML page (composition works).
- Clicking the HTML button and dragging the slider work **over** the color layer (no dead zone,
  pointer not swallowed).
- Resizing / DPI change / fullscreen toggle keep both layers aligned **without** child-window rect
  syncing.

Crates/APIs: `webview2-com` + `webview2-com-sys` (already transitive via wry; add as direct dev
dep), `windows` with `Win32_Graphics_Direct3D11`, `Win32_Graphics_Dxgi`,
`Win32_Graphics_DirectComposition` features (extend `Cargo.toml`).

Only **after** this passes do we add libmpv: replace the clear-color swapchain with the
ANGLE→D3D11 shared texture fed by `mpv_render_context` (§4 Layer 1), then load a real Emby
direct-stream proxy URL (reuse `get_playback_source`/`stream_proxy`, local-decode only) to satisfy
the full A/V acceptance.

## 8. Effort & risk summary

- Layer 1 (libmpv render→D3D11 via ANGLE): **M–L**, risk medium (known pattern).
- Layer 2 spike (§7): **S–M**, but **gates everything**.
- Full B (single-window composited, production-grade input/IME/DPI/HDR + wry fork/maintenance):
  **XL**, risk **high** (upstream divergence + many secondary subsystems).
- Option C fallback: **M**, risk low/med, reuses existing overlay assets.

## 9. Honest status of this task

This P0 validation delivers the **feasibility/risk/effort conclusion** and the **minimal
reproducible-example spec** (the go/no-go artifact M2 needs). A *fully runnable* end-to-end A/V
PoC was intentionally **not** forced into the live `ipc.rs`/`PlayerView.vue` here, because:
(a) the decisive blocker is Layer 2 (WebView2 composition hosting), which must be proven in the
isolated spike of §7 before touching the working player; and (b) the A/V half additionally needs a
real Emby stream + GPU visual verification. Next concrete step is to implement the §7 spike and
record its result back to this task.
