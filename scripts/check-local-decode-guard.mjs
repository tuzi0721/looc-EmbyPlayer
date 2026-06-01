import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const self = path.relative(root, fileURLToPath(import.meta.url)).replaceAll(path.sep, "/");

const scanEntries = [
  "electron",
  "src",
  "src-tauri/src",
  "scripts",
  "package.json",
  "vite.config.ts",
  "src-tauri/tauri.conf.json",
];

const sourceExtensions = new Set([
  ".cjs",
  ".js",
  ".json",
  ".mjs",
  ".rs",
  ".ts",
  ".tsx",
  ".vue",
]);

const ignoredDirectories = new Set([
  ".git",
  ".electron-builder-cache",
  ".electron-user-data",
  "dist",
  "node_modules",
  "release-electron",
  "target",
]);

const forbidden = [
  {
    label: "TranscodingUrl playback fallback",
    pattern: /\bTranscodingUrl\b/,
  },
  {
    label: "server HLS transcode playlist",
    pattern: /master\.m3u8/i,
  },
  {
    label: "EnableTranscoding enabled",
    pattern: /\bEnableTranscoding\b\s*[:=]\s*["']?true["']?/i,
  },
  {
    label: "EnableTranscoding set true",
    pattern: /\bEnableTranscoding\b[^\n;]{0,80}["']true["']/i,
  },
  {
    label: "video stream copy disabled",
    pattern: /\bEnableVideoStreamCopy\b\s*[:=]\s*["']?false["']?/i,
  },
  {
    label: "audio stream copy disabled",
    pattern: /\bEnableAudioStreamCopy\b\s*[:=]\s*["']?false["']?/i,
  },
  {
    label: "Rust enable_transcoding enabled",
    pattern: /\benable_transcoding\b\s*:\s*true\b/i,
  },
  {
    label: "Rust video stream copy disabled",
    pattern: /\benable_video_stream_copy\b\s*:\s*false\b/i,
  },
  {
    label: "Rust audio stream copy disabled",
    pattern: /\benable_audio_stream_copy\b\s*:\s*false\b/i,
  },
  {
    label: "transcode play method",
    pattern: /\bPlayMethod\b[\s\S]{0,80}\bTranscode\b/i,
  },
  {
    label: "non-empty transcoding profile",
    pattern: /\bTranscodingProfiles\b\s*:\s*\[(?!\s*\])/i,
  },
];

const requiredAnchors = [
  {
    file: "electron/backend/emby.mjs",
    snippets: [
      "EnableTranscoding: false",
      "EnableVideoStreamCopy: true",
      "EnableAudioStreamCopy: true",
      "TranscodingProfiles: []",
      "pickLocalDecodeMediaSource",
      "localDecodePlayMethod",
      "supportsDirectPlay === true || supportsDirectStream === true",
      'streamUrl.searchParams.set("Static", "true")',
      "serverTranscodingAllowed: false",
      "sanitizePlaybackMethod",
    ],
  },
  {
    file: "src/platform/index.ts",
    snippets: [
      "EnableTranscoding: false",
      "EnableVideoStreamCopy: true",
      "EnableAudioStreamCopy: true",
      "TranscodingProfiles: []",
      "pickLocalDecodeMediaSource",
      "localDecodePlayMethod",
      "supportsDirectPlay === true || supportsDirectStream === true",
      'streamUrl.searchParams.set("Static", "true")',
      "serverTranscodingAllowed: false",
      "sanitizePlaybackMethod",
    ],
  },
  {
    file: "src-tauri/src/emby/client.rs",
    snippets: [
      "enable_transcoding: false",
      "enable_video_stream_copy: true",
      "enable_audio_stream_copy: true",
      "PlaybackDeviceProfile::direct_only",
      'q.append_pair("Static", "true")',
    ],
  },
  {
    file: "src-tauri/src/emby/models.rs",
    snippets: [
      "pub device_profile: Option<PlaybackDeviceProfile>",
      "pub enable_video_stream_copy: bool",
      "pub enable_audio_stream_copy: bool",
      "pub transcoding_profiles: Vec<Value>",
      "pub fn direct_only",
      "pub fn supports_local_decode",
      "pub fn local_decode_play_method",
      "supports_direct_play == Some(true) || self.supports_direct_stream == Some(true)",
    ],
  },
  {
    file: "src-tauri/src/commands/player.rs",
    snippets: ["supports_local_decode()"],
  },
  {
    file: "src-tauri/src/commands/download.rs",
    snippets: ["supports_local_decode()"],
  },
  {
    file: "src-tauri/src/emby/session_controller.rs",
    snippets: ["supports_local_decode()"],
  },
];

const requiredBlocks = [
  {
    file: "electron/backend/emby.mjs",
    start: "function directPlaybackOptions()",
    end: "function directOnlyDeviceProfile",
    snippets: [
      "EnableDirectPlay: true",
      "EnableDirectStream: true",
      "EnableTranscoding: false",
      "EnableVideoStreamCopy: true",
      "EnableAudioStreamCopy: true",
    ],
  },
  {
    file: "electron/backend/emby.mjs",
    start: "async playbackInfo(",
    end: "async listSubtitles(",
    snippets: [
      "...directPlaybackOptions()",
      'DeviceProfile: directOnlyDeviceProfile("Hills Lite Local Decode")',
    ],
  },
  {
    file: "electron/backend/emby.mjs",
    start: "async playbackSource(",
    end: "async mpvPlaybackSource(",
    snippets: [
      "...directPlaybackOptions()",
      'DeviceProfile: directOnlyDeviceProfile("Hills Lite Local Decode")',
      'streamUrl.searchParams.set("Static", "true")',
      "serverTranscodingAllowed: false",
    ],
  },
  {
    file: "src/platform/index.ts",
    start: "function directPlaybackOptions()",
    end: "function directOnlyDeviceProfile",
    snippets: [
      "EnableDirectPlay: true",
      "EnableDirectStream: true",
      "EnableTranscoding: false",
      "EnableVideoStreamCopy: true",
      "EnableAudioStreamCopy: true",
    ],
  },
  {
    file: "src/platform/index.ts",
    start: "async function webPlaybackSource(",
    end: "function webSnapshotFromSource(",
    snippets: [
      "...directPlaybackOptions()",
      'DeviceProfile: directOnlyDeviceProfile("Hills Lite Web Preview Local Decode")',
      'streamUrl.searchParams.set("Static", "true")',
      "serverTranscodingAllowed: false",
    ],
  },
  {
    file: "src-tauri/src/emby/client.rs",
    start: "let body = PlaybackInfoRequest {",
    end: "let resp = self",
    snippets: [
      "enable_direct_play: true",
      "enable_direct_stream: true",
      "enable_transcoding: false",
      "enable_video_stream_copy: true",
      "enable_audio_stream_copy: true",
      "PlaybackDeviceProfile::direct_only",
    ],
  },
];

function toRelative(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

async function collectFiles(entry) {
  const full = path.join(root, entry);
  const stat = await fs.stat(full);
  if (stat.isFile()) return [full];
  if (!stat.isDirectory()) return [];

  const files = [];
  const children = await fs.readdir(full, { withFileTypes: true });
  for (const child of children) {
    if (child.isDirectory() && ignoredDirectories.has(child.name)) continue;
    const childPath = path.join(full, child.name);
    if (child.isDirectory()) {
      files.push(...(await collectFiles(path.relative(root, childPath))));
      continue;
    }
    if (!child.isFile()) continue;
    const ext = path.extname(child.name).toLowerCase();
    if (sourceExtensions.has(ext)) files.push(childPath);
  }
  return files;
}

function lineColumn(text, index) {
  const before = text.slice(0, index);
  const lines = before.split(/\r?\n/);
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

function findForbidden(file, text) {
  const matches = [];
  for (const rule of forbidden) {
    const match = rule.pattern.exec(text);
    if (!match) continue;
    const where = lineColumn(text, match.index);
    matches.push({
      file,
      label: rule.label,
      line: where.line,
      column: where.column,
      value: match[0].replace(/\s+/g, " ").slice(0, 120),
    });
  }
  return matches;
}

const files = [
  ...new Set(
    (await Promise.all(scanEntries.map(collectFiles)))
      .flat()
      .map(toRelative)
      .filter((file) => file !== self),
  ),
].sort();

const failures = [];
for (const file of files) {
  const text = await fs.readFile(path.join(root, file), "utf8");
  failures.push(...findForbidden(file, text));
}

for (const anchor of requiredAnchors) {
  const text = await fs.readFile(path.join(root, anchor.file), "utf8");
  for (const snippet of anchor.snippets) {
    if (!text.includes(snippet)) {
      failures.push({
        file: anchor.file,
        label: "missing local-decode guard anchor",
        line: 1,
        column: 1,
        value: snippet,
      });
    }
  }
}

for (const block of requiredBlocks) {
  const text = await fs.readFile(path.join(root, block.file), "utf8");
  const startIndex = text.indexOf(block.start);
  const endIndex = startIndex >= 0 ? text.indexOf(block.end, startIndex + block.start.length) : -1;
  const body = startIndex >= 0 && endIndex > startIndex ? text.slice(startIndex, endIndex) : "";
  if (!body) {
    failures.push({
      file: block.file,
      label: "missing local-decode guarded block",
      line: 1,
      column: 1,
      value: `${block.start} -> ${block.end}`,
    });
    continue;
  }
  for (const snippet of block.snippets) {
    if (!body.includes(snippet)) {
      failures.push({
        file: block.file,
        label: "missing local-decode guard inside block",
        line: lineColumn(text, startIndex).line,
        column: 1,
        value: `${block.start}: ${snippet}`,
      });
    }
  }
}

if (failures.length > 0) {
  console.error("Local decode guard failed. Server-side transcoding must stay disabled.");
  for (const failure of failures) {
    console.error(
      `- ${failure.file}:${failure.line}:${failure.column} ${failure.label}: ${failure.value}`,
    );
  }
  process.exit(1);
}

console.log(`Local decode guard ok: ${files.length} source files scanned.`);
