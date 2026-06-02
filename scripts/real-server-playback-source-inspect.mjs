import fs from "node:fs";

function readInput() {
  const envValues = [
    process.env.HILLS_REAL_LINE1,
    process.env.HILLS_REAL_USERNAME,
    process.env.HILLS_REAL_PASSWORD,
    process.env.HILLS_REAL_ITEM_ID,
  ];
  if (envValues.slice(0, 3).every((value) => typeof value === "string" && value.length > 0)) {
    return [envValues[0], envValues[1], envValues[2], envValues[3] || null];
  }
  const values = fs.readFileSync(0, "utf8").split(/\r?\n/).map((line) => line.trim());
  return [values[0], values[1], values[2], values[3] || null];
}

function joinUrl(baseUrl, route) {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(route.replace(/^\/+/, ""), normalized);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function stringFrom(value) {
  if (value == null) return null;
  if (typeof value === "string") return value || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function numberFrom(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstStream(mediaSource, type) {
  const streams = Array.isArray(mediaSource?.MediaStreams) ? mediaSource.MediaStreams : [];
  return streams.find((stream) => stringFrom(stream?.Type)?.toLowerCase() === type) ?? {};
}

function directPlaybackOptions() {
  return {
    EnableDirectPlay: true,
    EnableDirectStream: true,
    EnableTranscoding: false,
    EnableVideoStreamCopy: true,
    EnableAudioStreamCopy: true,
  };
}

function directOnlyDeviceProfile() {
  return {
    Name: "Hills Lite Inspect",
    MaxStreamingBitrate: 140000000,
    DirectPlayProfiles: [
      {
        Type: "Video",
        Container: "mp4,m4v,mov,mkv,webm,avi,wmv,flv,ts,m2ts,mpeg,mpg,3gp,ogv,rmvb",
      },
      { Type: "Audio", Container: "mp3,aac,flac,ogg,opus,wav,m4a,ape,alac" },
    ],
    TranscodingProfiles: [],
    SubtitleProfiles: [
      { Format: "vtt", Method: "External" },
      { Format: "srt", Method: "External" },
      { Format: "ass", Method: "External" },
      { Format: "ssa", Method: "External" },
    ],
  };
}

const [baseUrl, username, password, providedItemId] = readInput();
if (!baseUrl || !username || !password) {
  throw new Error("Provide line1, username, password, and optional item id via stdin or HILLS_REAL_* env vars.");
}

const auth = await requestJson(joinUrl(baseUrl, "Users/AuthenticateByName"), {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Emby-Authorization": "MediaBrowser Client=Hills Lite,Device=Codex,DeviceId=inspect,Version=0.1.0",
  },
  body: JSON.stringify({ Username: username, Pw: password }),
});

const token = stringFrom(auth?.AccessToken);
const userId = stringFrom(auth?.User?.Id);
if (!token || !userId) throw new Error("authentication failed");

let itemId = providedItemId;
if (!itemId) {
  const listUrl = joinUrl(baseUrl, `Users/${userId}/Items`);
  listUrl.searchParams.set("Recursive", "true");
  listUrl.searchParams.set("IncludeItemTypes", "Movie,Episode");
  listUrl.searchParams.set("SortBy", "DateCreated");
  listUrl.searchParams.set("SortOrder", "Descending");
  listUrl.searchParams.set("Limit", "1");
  const list = await requestJson(listUrl, {
    headers: {
      "X-Emby-Token": token,
      Authorization: `MediaBrowser Token="${token}"`,
    },
  });
  itemId = stringFrom(list?.Items?.[0]?.Id);
}
if (!itemId) throw new Error("no playable item id");

const playbackInfoUrl = joinUrl(baseUrl, `Items/${itemId}/PlaybackInfo`);
for (const [key, value] of Object.entries({
  UserId: userId,
  AutoOpenLiveStream: true,
  IsPlayback: true,
  MaxStreamingBitrate: 140000000,
  ...directPlaybackOptions(),
})) {
  playbackInfoUrl.searchParams.set(key, String(value));
}

const playbackInfo = await requestJson(playbackInfoUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Emby-Token": token,
    Authorization: `MediaBrowser Token="${token}"`,
  },
  body: JSON.stringify({
    UserId: userId,
    AutoOpenLiveStream: true,
    IsPlayback: true,
    MaxStreamingBitrate: 140000000,
    ...directPlaybackOptions(),
    DeviceProfile: directOnlyDeviceProfile(),
  }),
});

const sources = (Array.isArray(playbackInfo?.MediaSources) ? playbackInfo.MediaSources : []).map((source, index) => {
  const video = firstStream(source, "video");
  const audio = firstStream(source, "audio");
  return {
    index,
    namePresent: Boolean(source?.Name),
    container: stringFrom(source?.Container),
    protocol: stringFrom(source?.Protocol),
    supportsDirectPlay: source?.SupportsDirectPlay === true,
    supportsDirectStream: source?.SupportsDirectStream === true,
    supportsTranscoding: source?.SupportsTranscoding === true,
    width: numberFrom(video?.Width),
    height: numberFrom(video?.Height),
    videoCodec: stringFrom(video?.Codec),
    audioCodec: stringFrom(audio?.Codec),
    bitrate: numberFrom(source?.Bitrate),
    size: numberFrom(source?.Size),
  };
});

console.log(JSON.stringify({
  itemIdPresent: Boolean(itemId),
  sourceCount: sources.length,
  sources,
}, null, 2));
