import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function forceKillProcessTree(pid) {
  if (!pid || process.platform !== "win32") return Promise.resolve();
  try {
    return new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.once("error", () => resolve());
      killer.once("exit", () => resolve());
    });
  } catch {
    // Best-effort fallback for stale mpv process trees.
    return Promise.resolve();
  }
}

function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode != null || child.signalCode != null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      child.off("exit", done);
      child.off("error", done);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.off("exit", done);
      child.off("error", done);
      resolve(false);
    }, timeoutMs);
    child.once("exit", done);
    child.once("error", done);
  });
}

function writeAndFlush(socket, payload, timeoutMs = 150) {
  if (!socket || socket.destroyed || !socket.writable) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    socket.write(payload, "utf8", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function pathCandidates() {
  return [
    process.resourcesPath ? path.join(process.resourcesPath, "mpv", "mpv.exe") : null,
    path.join(path.dirname(process.execPath), "resources", "mpv", "mpv.exe"),
    path.resolve("src-tauri", "resources", "mpv", "mpv.exe"),
    path.resolve("src-tauri", "target", "release", "resources", "mpv", "mpv.exe"),
    path.resolve("src-tauri", "target", "debug", "resources", "mpv", "mpv.exe"),
  ].filter(Boolean);
}

export function resolveMpv() {
  for (const candidate of pathCandidates()) {
    if (fileExists(candidate)) {
      return {
        found: true,
        path: candidate,
        bundled: true,
      };
    }
  }

  return { found: false, path: pathCandidates()[0] ?? "resources/mpv/mpv.exe", bundled: true };
}

// The bundled mpv progress reporter lives beside mpv.exe in resources/mpv/.
export function resolveReporterScript(mpvExePath) {
  try {
    const candidate = path.join(path.dirname(mpvExePath), "hills_external_reporter.lua");
    return fileExists(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

// User-editable mpv.conf shared with the Tauri runtime
// (%APPDATA%/app.embyplayer/mpv.conf); injected via --include when present.
export function resolveUserMpvConf() {
  try {
    const base = process.env.APPDATA;
    if (!base) return null;
    const candidate = path.join(base, "app.embyplayer", "mpv.conf");
    return fileExists(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function parseTrackKind(value) {
  if (value === "video") return "video";
  if (value === "audio") return "audio";
  if (value === "sub") return "subtitle";
  return null;
}

function useReparentEmbed() {
  return (
    process.env.HILLS_ELECTRON_MPV_WID !== "0" &&
    process.env.HILLS_ELECTRON_MPV_NATIVE_CHILD !== "0" &&
    process.env.HILLS_ELECTRON_MPV_REPARENT !== "0"
  );
}

function numberFrom(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseChapters(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((chapter, index) => ({
      index,
      title: chapter?.title ?? null,
      timeMs: Math.floor(Math.max(0, numberFrom(chapter?.time, 0)) * 1000),
    }))
    .filter((chapter) => Number.isFinite(chapter.timeMs));
}

function defaultSnapshot() {
  return {
    url: null,
    paused: true,
    positionMs: 0,
    durationMs: 0,
    speed: 1,
    volume: 80,
    muted: false,
    eof: false,
    tracks: [],
    chapters: [],
    chapter: null,
    secondarySubId: null,
    subDelayMs: 0,
    subScale: 1,
    networkBps: null,
    bufferedMs: 0,
    buffering: false,
    cacheBufferingState: null,
    videoCodec: null,
    audioCodec: null,
    videoParams: null,
    videoOutParams: null,
    osdDimensions: null,
    audioParams: null,
    hwdecCurrent: null,
    keepaspect: true,
    panscan: 0,
    videoZoom: 0,
    videoScaleX: 1,
    videoScaleY: 1,
    videoAspectOverride: -2,
    containerFps: null,
    estimatedVfFps: null,
    videoBitrate: null,
    audioBitrate: null,
    frameDropCount: null,
    decoderFrameDropCount: null,
    voFrameDropCount: null,
  };
}

export class MpvController {
  constructor(store, options = {}) {
    this.store = store;
    this.logDir = options.logDir ?? null;
    this.child = null;
    this.socket = null;
    this.buffer = "";
    this.pending = new Map();
    this.starting = null;
    this.embedWindowHandle = null;
    this.overlayWindowRect = null;
  }

  isRunning() {
    return Boolean(this.child && !this.child.killed && this.socket && !this.socket.destroyed);
  }

  get processId() {
    return this.child?.pid ?? null;
  }

  async ensureStarted() {
    if (this.isRunning()) return;
    if (!this.starting) {
      this.starting = this.startProcess().finally(() => {
        this.starting = null;
      });
    }
    await this.starting;
  }

  async setEmbedWindowHandle(handle) {
    const next = handle == null ? null : String(handle);
    if (this.embedWindowHandle === next) return;
    this.embedWindowHandle = next;
    if (this.isRunning()) {
      await this.shutdown();
    }
  }

  async clearEmbedWindowHandle() {
    await this.setEmbedWindowHandle(null);
  }

  async setOverlayWindowRect(rect) {
    if (!rect) {
      this.overlayWindowRect = null;
      return;
    }
    this.overlayWindowRect = {
      x: Math.round(Number(rect.x) || 0),
      y: Math.round(Number(rect.y) || 0),
      width: Math.max(1, Math.round(Number(rect.width) || 1)),
      height: Math.max(1, Math.round(Number(rect.height) || 1)),
    };
    if (this.isRunning() && !this.embedWindowHandle) {
      await this.applyOverlayWindowRect();
    }
  }

  async applyOverlayWindowRect() {
    const rect = this.overlayWindowRect;
    if (!rect || this.embedWindowHandle || !this.isRunning()) return;
    const geometry = `${rect.width}x${rect.height}+${rect.x}+${rect.y}`;
    await this.setProperty("border", false, { start: false }).catch(() => {});
    await this.setProperty("ontop", true, { start: false }).catch(() => {});
    await this.setProperty("geometry", geometry, { start: false }).catch(() => {});
  }

  async startProcess() {
    if (this.isRunning()) return;
    await this.shutdown();

    const settings = await this.store.getSettings();
    const detected = resolveMpv();
    if (!detected.found) {
      throw new Error("bundled mpv executable not found");
    }
    const pipePath = `\\\\.\\pipe\\hills-lite-mpv-${randomUUID()}`;
    const args = [
      "--no-config",
      "--idle=yes",
      "--keep-open=yes",
      "--title=Hills Lite",
      "--no-terminal",
      "--msg-level=all=warn",
      "--keepaspect=yes",
      "--panscan=0",
      "--video-zoom=0",
      "--video-scale-x=1",
      "--video-scale-y=1",
      `--input-ipc-server=${pipePath}`,
    ];
    if (this.embedWindowHandle) {
      args.push(`--wid=${this.embedWindowHandle}`);
      args.push("--force-window=yes");
      if (process.env.HILLS_ELECTRON_MPV_NATIVE_CHILD === "1") {
        args.push("--vo=direct3d");
      } else {
        args.push("--vo=gpu-next,gpu,direct3d");
        args.push("--gpu-api=d3d11");
        args.push("--gpu-context=d3d11");
        args.push("--d3d11-output-mode=window");
      }
      args.push("--background=color");
      args.push("--background-color=#FF000000");
      args.push("--d3d11-flip=no");
    } else {
      const reparentEmbed = useReparentEmbed();
      args.push(reparentEmbed ? "--force-window=immediate" : "--force-window=yes");
      args.push("--no-border");
      if (!reparentEmbed) args.push("--ontop=yes");
      if (reparentEmbed) {
        args.push(`--vo=${process.env.HILLS_ELECTRON_MPV_REPARENT_VO?.trim() || "direct3d"}`);
      }
      args.push("--d3d11-flip=no");
      args.push("--no-osc");
      args.push("--cursor-autohide=always");
      args.push("--keepaspect-window=no");
      if (this.overlayWindowRect) {
        const rect = this.overlayWindowRect;
        args.push(`--geometry=${rect.width}x${rect.height}+${rect.x}+${rect.y}`);
      } else if (reparentEmbed) {
        args.push("--geometry=320x180+-32000+-32000");
      }
    }
    if (this.logDir) {
      fs.mkdirSync(this.logDir, { recursive: true });
      args.push(`--log-file=${path.join(this.logDir, "mpv.log")}`);
    }

    const hwdecOverride = process.env.HILLS_ELECTRON_MPV_HWDEC?.trim();
    if (hwdecOverride) args.push(`--hwdec=${hwdecOverride}`);
    else if (settings.hardwareDecoding) args.push("--hwdec=auto-safe");
    if ((settings.mpvCacheMb ?? 0) > 0) {
      args.push("--cache=yes");
      args.push(`--demuxer-max-bytes=${settings.mpvCacheMb}MiB`);
    }
    // Reference parity (HillsLite「最大缓存时长」/「低质量视频解码」). The
    // Electron --vo is fixed by the d3d11 embedding path above, so the
    // videoOutputDriver setting only drives the Tauri/IPC backend.
    if ((settings.mpvCacheSecs ?? 0) > 0) {
      args.push("--cache=yes");
      args.push(`--cache-secs=${settings.mpvCacheSecs}`);
    }
    if (settings.lowQualityDecoding) {
      args.push("--vd-lavc-fast=yes");
      args.push("--vd-lavc-skiploopfilter=all");
    }

    // Parity with the Rust IPC backend: preferred track languages, forced
    // stereo, custom proxy passthrough and the user mpv.conf include.
    const alang = (settings.preferredAudioLanguage ?? "").trim();
    if (alang) args.push(`--alang=${alang}`);
    const slang = (settings.preferredSubtitleLanguage ?? "").trim();
    if (slang) args.push(`--slang=${slang}`);
    if (settings.forceStereoAudio) args.push("--audio-channels=stereo");
    if (settings.networkProxyMode === "custom") {
      const proxy = (settings.httpProxyUrl ?? "").trim();
      if (proxy) args.push(`--http-proxy=${proxy}`);
    }
    const userConf = resolveUserMpvConf();
    if (userConf) args.push(`--include=${userConf}`);
    if (settings.playerLogEnabled && process.env.APPDATA) {
      try {
        const logDir = path.join(process.env.APPDATA, "app.embyplayer", "logs");
        fs.mkdirSync(logDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        args.push(`--log-file=${path.join(logDir, `mpv-${stamp}.log`)}`);
      } catch {
        /* logging is best-effort */
      }
    }

    // Parity with the Rust embedded backend: load the bundled progress reporter
    // on every mpv launch path. This controller drives Emby reporting from
    // snapshot polling and runs mpv with stdio "ignore", so the script's stdout
    // events are discarded here; the injection just keeps the launch path
    // consistent with external mpv.
    const reporterScript = resolveReporterScript(detected.path);
    if (reporterScript) {
      args.push(`--script=${reporterScript}`);
    }

    this.child = spawn(detected.path, args, {
      windowsHide: !useReparentEmbed(),
      stdio: "ignore",
    });
    this.child.once("exit", () => {
      this.socket?.destroy();
      this.socket = null;
      this.child = null;
      for (const item of this.pending.values()) item.reject(new Error("mpv exited"));
      this.pending.clear();
    });

    this.socket = await this.connectPipe(pipePath);
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk) => this.onData(chunk));
    this.socket.on("error", (error) => {
      for (const item of this.pending.values()) item.reject(error);
      this.pending.clear();
    });
  }

  async connectPipe(pipePath) {
    const started = Date.now();
    let lastError = null;
    while (Date.now() - started < 15_000) {
      if (!this.child || this.child.killed || this.child.exitCode != null) {
        throw new Error(`mpv exited before IPC became ready: ${this.child?.exitCode ?? "unknown"}`);
      }
      try {
        return await new Promise((resolve, reject) => {
          const socket = net.createConnection(pipePath, () => resolve(socket));
          socket.once("error", reject);
        });
      } catch (error) {
        lastError = error;
        await sleep(60);
      }
    }
    throw new Error(`mpv IPC connect timeout: ${lastError?.message ?? "unknown"}`);
  }

  onData(chunk) {
    this.buffer += chunk;
    while (true) {
      const index = this.buffer.indexOf("\n");
      if (index < 0) return;
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      const requestId = message.request_id;
      if (requestId && this.pending.has(requestId)) {
        const item = this.pending.get(requestId);
        this.pending.delete(requestId);
        clearTimeout(item.timer);
        if (!message.error || message.error === "success") item.resolve(message);
        else item.reject(new Error(`mpv error: ${message.error}`));
      }
    }
  }

  async command(command, { start = true } = {}) {
    if (start) await this.ensureStarted();
    else if (!this.isRunning()) throw new Error("mpv is not running");

    const requestId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    const payload = `${JSON.stringify({ command, request_id: requestId })}\n`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("mpv IPC timeout"));
      }, 5000);
      this.pending.set(requestId, { resolve, reject, timer });
      this.socket.write(payload, "utf8", (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error);
      });
    });
  }

  async setProperty(name, value, options) {
    return this.command(["set_property", name, value], options);
  }

  async getProperty(name, options) {
    const response = await this.command(["get_property", name], options);
    return response.data;
  }

  async load({ url, headers = [], userAgent = null, startMs = null, autoloadSubtitles = true }) {
    await this.ensureStarted();
    await this.setProperty("sub-auto", autoloadSubtitles ? "fuzzy" : "no");
    if (userAgent) await this.setProperty("user-agent", userAgent);
    await this.applyOverlayWindowRect().catch(() => {});
    const headerFields = (Array.isArray(headers) ? headers : [])
      .filter(([key, value]) => key && value != null && value !== "")
      .map(([key, value]) => `${key}: ${String(value).replace(/[\r\n]+/g, " ")}`);
    await this.setProperty("http-header-fields", headerFields);
    if (startMs != null) {
      await this.setProperty("start", `${Math.max(0, Number(startMs)) / 1000}`);
    }
    const response = await this.command(["loadfile", url, "replace"]);
    return {
      accepted: true,
      requestId: response.request_id ?? null,
      error: response.error ?? null,
    };
  }

  async snapshot() {
    if (!this.isRunning()) return defaultSnapshot();
    const get = (name, fallback) =>
      this.getProperty(name, { start: false }).catch(() => fallback);
    const [
      url,
      paused,
      position,
      duration,
      speed,
      volume,
      muted,
      eof,
      tracks,
      chapters,
      chapter,
      secondarySid,
      subDelay,
      subScale,
      networkBps,
      cacheDuration,
      pausedForCache,
      cacheBufferingState,
      videoCodec,
      audioCodec,
      videoParams,
      videoOutParams,
      osdDimensions,
      audioParams,
      hwdecCurrent,
      keepaspect,
      panscan,
      videoZoom,
      videoScaleX,
      videoScaleY,
      videoAspectOverride,
      containerFps,
      estimatedVfFps,
      videoBitrate,
      audioBitrate,
      frameDropCount,
      decoderFrameDropCount,
      voFrameDropCount,
    ] = await Promise.all([
      get("path", null),
      get("pause", true),
      get("time-pos", 0),
      get("duration", 0),
      get("speed", 1),
      get("volume", 80),
      get("mute", false),
      get("eof-reached", false),
      get("track-list", []),
      get("chapter-list", []),
      get("chapter", null),
      get("secondary-sid", null),
      get("sub-delay", 0),
      get("sub-scale", 1),
      get("cache-speed", null),
      get("demuxer-cache-duration", 0),
      get("paused-for-cache", false),
      get("cache-buffering-state", null),
      get("video-codec", null),
      get("audio-codec", null),
      get("video-params", null),
      get("video-out-params", null),
      get("osd-dimensions", null),
      get("audio-params", null),
      get("hwdec-current", null),
      get("keepaspect", true),
      get("panscan", 0),
      get("video-zoom", 0),
      get("video-scale-x", 1),
      get("video-scale-y", 1),
      get("video-aspect-override", -2),
      get("container-fps", null),
      get("estimated-vf-fps", null),
      get("video-bitrate", null),
      get("audio-bitrate", null),
      get("frame-drop-count", null),
      get("decoder-frame-drop-count", null),
      get("vo-drop-frame-count", null),
    ]);
    const cacheBuffering = cacheBufferingState == null ? null : numberFrom(cacheBufferingState, 100);
    const normalizedTracks = Array.isArray(tracks)
      ? tracks
          .map((track) => ({
            id: numberFrom(track.id),
            kind: parseTrackKind(track.type),
            title: track.title ?? null,
            lang: track.lang ?? null,
            codec: track.codec ?? null,
            external: typeof track.external === "boolean" ? track.external : null,
            defaultTrack: typeof track.default === "boolean" ? track.default : null,
            forced: typeof track.forced === "boolean" ? track.forced : null,
            selected: Boolean(track.selected),
          }))
          .filter((track) => track.kind)
      : [];
    const selectedVideoTrack = normalizedTracks.find((track) => track.kind === "video" && track.selected);
    const selectedAudioTrack = normalizedTracks.find((track) => track.kind === "audio" && track.selected);

    return {
      url,
      paused: Boolean(paused),
      positionMs: Math.floor(numberFrom(position) * 1000),
      durationMs: Math.floor(numberFrom(duration) * 1000),
      speed: numberFrom(speed, 1),
      volume: Math.round(numberFrom(volume, 80)),
      muted: Boolean(muted),
      eof: Boolean(eof),
      tracks: normalizedTracks,
      chapters: parseChapters(chapters),
      chapter: chapter == null || numberFrom(chapter, -1) < 0 ? null : Math.floor(numberFrom(chapter)),
      secondarySubId:
        secondarySid == null || secondarySid === "no" || numberFrom(secondarySid, -1) < 0
          ? null
          : Math.floor(numberFrom(secondarySid)),
      subDelayMs: Math.floor(numberFrom(subDelay) * 1000),
      subScale: numberFrom(subScale, 1),
      networkBps: networkBps == null ? null : numberFrom(networkBps, 0),
      bufferedMs: Math.floor(Math.max(0, numberFrom(cacheDuration, 0)) * 1000),
      buffering:
        Boolean(pausedForCache) ||
        (cacheBuffering != null && cacheBuffering > 0 && cacheBuffering < 100),
      cacheBufferingState: cacheBuffering,
      videoCodec: videoCodec ?? selectedVideoTrack?.codec ?? null,
      audioCodec: audioCodec ?? selectedAudioTrack?.codec ?? null,
      videoParams: videoParams && typeof videoParams === "object" ? videoParams : null,
      videoOutParams: videoOutParams && typeof videoOutParams === "object" ? videoOutParams : null,
      osdDimensions: osdDimensions && typeof osdDimensions === "object" ? osdDimensions : null,
      audioParams: audioParams && typeof audioParams === "object" ? audioParams : null,
      hwdecCurrent: hwdecCurrent ?? null,
      keepaspect: Boolean(keepaspect),
      panscan: numberFrom(panscan, 0),
      videoZoom: numberFrom(videoZoom, 0),
      videoScaleX: numberFrom(videoScaleX, 1),
      videoScaleY: numberFrom(videoScaleY, 1),
      videoAspectOverride: numberFrom(videoAspectOverride, -2),
      containerFps: containerFps == null ? null : numberFrom(containerFps, 0),
      estimatedVfFps: estimatedVfFps == null ? null : numberFrom(estimatedVfFps, 0),
      videoBitrate: videoBitrate == null ? null : numberFrom(videoBitrate, 0),
      audioBitrate: audioBitrate == null ? null : numberFrom(audioBitrate, 0),
      frameDropCount: frameDropCount == null ? null : numberFrom(frameDropCount, 0),
      decoderFrameDropCount:
        decoderFrameDropCount == null ? null : numberFrom(decoderFrameDropCount, 0),
      voFrameDropCount: voFrameDropCount == null ? null : numberFrom(voFrameDropCount, 0),
    };
  }

  async shutdown({ quitTimeoutMs = 500, killTimeoutMs = 900 } = {}) {
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error("mpv shutdown"));
    }
    this.pending.clear();
    const socket = this.socket;
    const child = this.child;
    this.socket = null;
    this.child = null;

    if (socket) {
      const requestId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
      const payload = `${JSON.stringify({ command: ["quit"], request_id: requestId })}\n`;
      await writeAndFlush(socket, payload).catch(() => {});
      socket.destroy();
    }

    if (child && child.exitCode == null) {
      const pid = child.pid;
      const exitedAfterQuit = await waitForChildExit(child, quitTimeoutMs);
      if (!exitedAfterQuit && child.exitCode == null) {
        if (!child.killed) child.kill();
        const exitedAfterKill = await waitForChildExit(child, killTimeoutMs);
        if (!exitedAfterKill && child.exitCode == null) {
          await forceKillProcessTree(pid);
          await waitForChildExit(child, killTimeoutMs);
        }
      }
    }
  }
}
