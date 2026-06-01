import { randomUUID } from "node:crypto";

const DEVICE_ID = "hills-lite-electron-001";
const CLIENT_NAME = "Hills Lite";
const CLIENT_VERSION = "0.1.0";

function joinUrl(baseUrl, route) {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(route.replace(/^\/+/, ""), normalized);
}

function bodyPreview(body) {
  const preview = [...body].slice(0, 1200).join("");
  return `${preview}${body.length > preview.length ? "..." : ""}`
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

function stringFrom(value) {
  if (value == null) return null;
  if (typeof value === "string") return value || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return null;
  if (typeof value === "object") {
    for (const key of ["Name", "Title", "Value", "DisplayName", "Id"]) {
      const text = stringFrom(value[key]);
      if (text) return text;
    }
  }
  return null;
}

function stringArrayFrom(value) {
  if (Array.isArray(value)) return value.map(stringFrom).filter(Boolean);
  const text = stringFrom(value);
  return text ? [text] : [];
}

function numberFrom(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  return null;
}

function boolFrom(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(text)) return true;
    if (["false", "0", "no", "n", "off"].includes(text)) return false;
  }
  return null;
}

function normalizeUserData(value) {
  const userData = value && typeof value === "object" ? value : {};
  return {
    PlayedPercentage: numberFrom(userData.PlayedPercentage) ?? null,
    PlaybackPositionTicks: numberFrom(userData.PlaybackPositionTicks) ?? null,
    LastPlayedDate: stringFrom(userData.LastPlayedDate),
    Played: boolFrom(userData.Played) ?? false,
    IsFavorite: boolFrom(userData.IsFavorite) ?? false,
    PlayCount: numberFrom(userData.PlayCount) ?? 0,
  };
}

function normalizeNameIdPair(value) {
  const item = value && typeof value === "object" ? value : {};
  return {
    Name: stringFrom(item.Name) ?? "",
    Id: stringFrom(item.Id),
  };
}

function normalizePerson(value) {
  const person = value && typeof value === "object" ? value : {};
  return {
    Name: stringFrom(person.Name) ?? "",
    Id: stringFrom(person.Id),
    Role: stringFrom(person.Role),
    Type: stringFrom(person.Type),
    PrimaryImageTag: stringFrom(person.PrimaryImageTag),
  };
}

function normalizeMediaStreamInfo(value) {
  const stream = value && typeof value === "object" ? value : {};
  return {
    Index: numberFrom(stream.Index),
    Type: stringFrom(stream.Type),
    Codec: stringFrom(stream.Codec),
    Language: stringFrom(stream.Language),
    DisplayTitle: stringFrom(stream.DisplayTitle),
    Title: stringFrom(stream.Title),
    Width: numberFrom(stream.Width),
    Height: numberFrom(stream.Height),
    BitRate: numberFrom(stream.BitRate),
    Channels: numberFrom(stream.Channels),
    IsDefault: Boolean(stream.IsDefault),
    IsExternal: Boolean(stream.IsExternal),
    IsForced: Boolean(stream.IsForced),
  };
}

function normalizeMediaSourceInfo(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    Id: stringFrom(source.Id),
    Name: stringFrom(source.Name),
    Container: stringFrom(source.Container),
    Size: numberFrom(source.Size),
    Bitrate: numberFrom(source.Bitrate),
    SupportsDirectPlay: source.SupportsDirectPlay == null ? null : Boolean(source.SupportsDirectPlay),
    SupportsDirectStream: source.SupportsDirectStream == null ? null : Boolean(source.SupportsDirectStream),
    SupportsTranscoding: source.SupportsTranscoding == null ? null : Boolean(source.SupportsTranscoding),
    MediaStreams: Array.isArray(source.MediaStreams) ? source.MediaStreams.map(normalizeMediaStreamInfo) : [],
  };
}

export function normalizeItem(value) {
  const item = value && typeof value === "object" ? value : {};
  return {
    ...item,
    Id: stringFrom(item.Id) ?? "",
    Name: stringFrom(item.Name) ?? "",
    Type: stringFrom(item.Type),
    Overview: stringFrom(item.Overview),
    ProductionYear: numberFrom(item.ProductionYear),
    CommunityRating: numberFrom(item.CommunityRating),
    OfficialRating: stringFrom(item.OfficialRating),
    PrimaryImageAspectRatio: numberFrom(item.PrimaryImageAspectRatio),
    Genres: stringArrayFrom(item.Genres),
    GenreItems: Array.isArray(item.GenreItems) ? item.GenreItems.map(normalizeNameIdPair) : [],
    Studios: Array.isArray(item.Studios) ? item.Studios.map(normalizeNameIdPair) : [],
    RunTimeTicks: numberFrom(item.RunTimeTicks),
    SeriesName: stringFrom(item.SeriesName),
    SeriesId: stringFrom(item.SeriesId),
    SeasonId: stringFrom(item.SeasonId),
    SeriesPrimaryImageTag: stringFrom(item.SeriesPrimaryImageTag),
    SeriesThumbImageTag: stringFrom(item.SeriesThumbImageTag),
    ParentBackdropItemId: stringFrom(item.ParentBackdropItemId),
    ParentBackdropImageTags: stringArrayFrom(item.ParentBackdropImageTags),
    ParentThumbItemId: stringFrom(item.ParentThumbItemId),
    ParentThumbImageTag: stringFrom(item.ParentThumbImageTag),
    ParentPrimaryImageItemId: stringFrom(item.ParentPrimaryImageItemId),
    ParentPrimaryImageTag: stringFrom(item.ParentPrimaryImageTag),
    ParentLogoItemId: stringFrom(item.ParentLogoItemId),
    ParentLogoImageTag: stringFrom(item.ParentLogoImageTag),
    IndexNumber: numberFrom(item.IndexNumber),
    ParentIndexNumber: numberFrom(item.ParentIndexNumber),
    ImageTags: item.ImageTags && typeof item.ImageTags === "object" ? item.ImageTags : null,
    BackdropImageTags: stringArrayFrom(item.BackdropImageTags),
    UserData: normalizeUserData(item.UserData),
    People: Array.isArray(item.People) ? item.People.map(normalizePerson) : [],
    ProviderIds:
      item.ProviderIds && typeof item.ProviderIds === "object"
        ? Object.fromEntries(
            Object.entries(item.ProviderIds)
              .map(([key, id]) => [key, stringFrom(id)])
              .filter(([, id]) => Boolean(id)),
          )
        : null,
    MediaSources: Array.isArray(item.MediaSources) ? item.MediaSources.map(normalizeMediaSourceInfo) : [],
  };
}

function normalizeItemsResponse(value) {
  const rawItems = Array.isArray(value) ? value : value?.Items;
  const items = Array.isArray(rawItems) ? rawItems.map(normalizeItem) : [];
  return {
    Items: items,
    TotalRecordCount: numberFrom(value?.TotalRecordCount) ?? items.length,
  };
}

function normalizeTrack(value) {
  const stream = value && typeof value === "object" ? value : {};
  const type = stringFrom(stream.Type)?.toLowerCase();
  const kind = type === "audio" ? "audio" : type === "subtitle" ? "subtitle" : "video";
  return {
    id: numberFrom(stream.Index) ?? numberFrom(stream.Id) ?? 0,
    kind,
    title: stringFrom(stream.DisplayTitle) ?? stringFrom(stream.Title),
    lang: stringFrom(stream.Language),
    selected: boolFrom(stream.IsDefault) ?? false,
  };
}

function normalizeRemotePlayState(value) {
  const state = value && typeof value === "object" ? value : {};
  return {
    positionTicks: numberFrom(state.PositionTicks),
    isPaused: boolFrom(state.IsPaused) ?? false,
    isMuted: boolFrom(state.IsMuted) ?? false,
    volumeLevel: numberFrom(state.VolumeLevel),
    playMethod: stringFrom(state.PlayMethod),
  };
}

function normalizeRemoteSession(value) {
  const session = value && typeof value === "object" ? value : {};
  return {
    id: stringFrom(session.Id) ?? "",
    userId: stringFrom(session.UserId),
    userName: stringFrom(session.UserName),
    deviceId: stringFrom(session.DeviceId),
    deviceName: stringFrom(session.DeviceName),
    client: stringFrom(session.Client),
    applicationVersion: stringFrom(session.ApplicationVersion),
    supportsMediaControl: boolFrom(session.SupportsMediaControl) ?? false,
    supportsRemoteControl: boolFrom(session.SupportsRemoteControl) ?? false,
    nowPlayingItem: session.NowPlayingItem ? normalizeItem(session.NowPlayingItem) : null,
    playState: session.PlayState ? normalizeRemotePlayState(session.PlayState) : null,
  };
}

function lineDiagnostics(line) {
  return {
    id: stringFrom(line.id) ?? "",
    name: stringFrom(line.name) ?? "",
    baseUrl: stringFrom(line.baseUrl) ?? "",
  };
}

function mediaSourceDiagnostics(mediaSource) {
  const streams = Array.isArray(mediaSource.MediaStreams) ? mediaSource.MediaStreams : [];
  const streamCounts = streams.reduce(
    (counts, stream) => {
      const type = stringFrom(stream?.Type)?.toLowerCase();
      if (type === "video") counts.video += 1;
      else if (type === "audio") counts.audio += 1;
      else if (type === "subtitle") counts.subtitle += 1;
      else counts.other += 1;
      return counts;
    },
    { video: 0, audio: 0, subtitle: 0, other: 0 },
  );

  return {
    id: stringFrom(mediaSource.Id) ?? "",
    name: stringFrom(mediaSource.Name),
    path: stringFrom(mediaSource.Path),
    container: stringFrom(mediaSource.Container),
    protocol: stringFrom(mediaSource.Protocol),
    bitrate: numberFrom(mediaSource.Bitrate),
    size: numberFrom(mediaSource.Size),
    supportsDirectPlay: boolFrom(mediaSource.SupportsDirectPlay),
    supportsDirectStream: boolFrom(mediaSource.SupportsDirectStream),
    supportsTranscoding: boolFrom(mediaSource.SupportsTranscoding),
    isRemote: boolFrom(mediaSource.IsRemote),
    defaultAudioStreamIndex: numberFrom(mediaSource.DefaultAudioStreamIndex),
    defaultSubtitleStreamIndex: numberFrom(mediaSource.DefaultSubtitleStreamIndex),
    streamCounts,
  };
}

function firstMediaStream(mediaSource, type) {
  const streams = Array.isArray(mediaSource.MediaStreams) ? mediaSource.MediaStreams : [];
  return (
    streams.find((stream) => stringFrom(stream?.Type)?.toLowerCase() === type) ??
    null
  );
}

function playbackSourceLabel(mediaSource, index) {
  const name = stringFrom(mediaSource.Name);
  if (name) return name;
  const path = stringFrom(mediaSource.Path);
  if (path) {
    const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts.at(-1) ?? path;
  }
  const id = stringFrom(mediaSource.Id);
  return id ? `媒体源 ${id}` : `媒体源 ${index + 1}`;
}

function normalizePlaybackMediaSource(mediaSource, index, selectedId) {
  const video = firstMediaStream(mediaSource, "video");
  const audio = firstMediaStream(mediaSource, "audio");
  const id = stringFrom(mediaSource.Id) ?? `source-${index}`;
  return {
    id,
    name: stringFrom(mediaSource.Name),
    displayName: playbackSourceLabel(mediaSource, index),
    container: stringFrom(mediaSource.Container),
    protocol: stringFrom(mediaSource.Protocol),
    path: stringFrom(mediaSource.Path),
    bitrate: numberFrom(mediaSource.Bitrate),
    size: numberFrom(mediaSource.Size),
    width: numberFrom(video?.Width),
    height: numberFrom(video?.Height),
    videoCodec: stringFrom(video?.Codec),
    audioCodec: stringFrom(audio?.Codec),
    audioLanguage: stringFrom(audio?.Language),
    supportsDirectPlay: boolFrom(mediaSource.SupportsDirectPlay),
    supportsDirectStream: boolFrom(mediaSource.SupportsDirectStream),
    playMethod: isLocalDecodeSource(mediaSource) ? localDecodePlayMethod(mediaSource) : undefined,
    supportsTranscoding: boolFrom(mediaSource.SupportsTranscoding),
    isRemote: boolFrom(mediaSource.IsRemote),
    selected: id === selectedId,
  };
}

function playbackLineOptions(server, selectedLine) {
  return (Array.isArray(server.lines) ? server.lines : []).map((line) => ({
    id: stringFrom(line.id) ?? "",
    name: stringFrom(line.name) ?? stringFrom(line.baseUrl) ?? "线路",
    baseUrl: stringFrom(line.baseUrl) ?? "",
    enabled: line.enabled !== false,
    status: stringFrom(line.lastStatus),
    latencyMs: numberFrom(line.lastLatencyMs),
    selected: line.id === selectedLine?.id,
  }));
}

function appendToken(url, token, enabled) {
  if (!enabled) {
    return url;
  }
  if (!url.searchParams.has("api_key") && !url.searchParams.has("X-Emby-Token")) {
    url.searchParams.set("api_key", token);
  }
  return url;
}

function absoluteMediaUrl(baseUrl, value) {
  if (/^https?:\/\//i.test(value)) return new URL(value);
  return joinUrl(baseUrl, value);
}

function pickSubtitleFormat(codec) {
  switch (stringFrom(codec)?.toLowerCase()) {
    case "ass":
    case "ssa":
      return "ass";
    case "subrip":
    case "srt":
      return "srt";
    case "webvtt":
    case "vtt":
      return "vtt";
    case "pgs":
    case "pgssub":
    case "dvdsub":
    case "dvbsub":
      return "sup";
    default:
      return "srt";
  }
}

const DIRECT_VIDEO_CONTAINERS = [
  "mp4",
  "m4v",
  "mov",
  "mkv",
  "webm",
  "avi",
  "wmv",
  "flv",
  "ts",
  "m2ts",
  "mpeg",
  "mpg",
  "3gp",
  "ogv",
  "rmvb",
];
const DIRECT_AUDIO_CONTAINERS = ["mp3", "aac", "flac", "ogg", "opus", "wav", "m4a", "ape", "alac"];
const IMAGE_FALLBACK_FIELDS =
  "ParentBackdropItemId,ParentBackdropImageTags,ParentThumbItemId,ParentThumbImageTag,ParentPrimaryImageItemId,ParentPrimaryImageTag,ParentLogoItemId,ParentLogoImageTag,SeriesPrimaryImageTag,SeriesThumbImageTag";
const PERSONAL_ITEM_FIELDS =
  `PrimaryImageAspectRatio,ProductionYear,Overview,UserData,SeriesInfo,RunTimeTicks,${IMAGE_FALLBACK_FIELDS}`;

function directPlaybackOptions() {
  return {
    EnableDirectPlay: true,
    EnableDirectStream: true,
    EnableTranscoding: false,
    EnableVideoStreamCopy: true,
    EnableAudioStreamCopy: true,
  };
}

function directOnlyDeviceProfile(name = "Hills Lite Direct") {
  return {
    Name: name,
    MaxStreamingBitrate: 140000000,
    DirectPlayProfiles: [
      { Type: "Video", Container: DIRECT_VIDEO_CONTAINERS.join(",") },
      { Type: "Audio", Container: DIRECT_AUDIO_CONTAINERS.join(",") },
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

function isLocalDecodeSource(mediaSource) {
  const supportsDirectPlay = boolFrom(mediaSource?.SupportsDirectPlay);
  const supportsDirectStream = boolFrom(mediaSource?.SupportsDirectStream);
  return supportsDirectPlay === true || supportsDirectStream === true;
}

function localDecodePlayMethod(mediaSource) {
  return boolFrom(mediaSource?.SupportsDirectPlay) === true ? "DirectPlay" : "DirectStream";
}

function localDecodeMode(mediaSource) {
  return localDecodePlayMethod(mediaSource) === "DirectPlay" ? "direct-play" : "direct-stream";
}

function sanitizePlaybackMethod(value) {
  const method = stringFrom(value);
  return method === "DirectStream" ? "DirectStream" : "DirectPlay";
}

function pickLocalDecodeMediaSource(mediaSources, requestedMediaSourceId) {
  if (requestedMediaSourceId) {
    const selected = mediaSources.find((source) => stringFrom(source?.Id) === requestedMediaSourceId);
    if (!selected) {
      throw new Error(`get_playback_source: media source not found: ${requestedMediaSourceId}`);
    }
    if (!isLocalDecodeSource(selected)) {
      throw new Error(
        "已阻止播放：所选媒体源不支持本机直连或本机直流。Hills Lite 不允许服务端解码/转码，请换一个可本机解码的版本或线路。",
      );
    }
    return selected;
  }

  const selected = mediaSources.find(isLocalDecodeSource);
  if (!selected) {
    throw new Error(
      "已阻止播放：服务端没有返回可本机直连或本机直流的媒体源。Hills Lite 不允许服务端解码/转码，以避免压垮 NAS、路由器或 VPS。",
    );
  }
  return selected;
}

function defaultUserAgent(settings, server, line) {
  return line.userAgent ?? server.defaultUserAgent ?? settings.defaultUserAgent;
}

function detectServerKind(info) {
  const product = stringFrom(info?.ProductName)?.toLowerCase() ?? "";
  const text = JSON.stringify(info ?? {}).toLowerCase();
  return product.includes("jellyfin") || text.includes("jellyfin") ? "jellyfin" : "emby";
}

function normalizeSystemInfo(info) {
  return {
    serverName: stringFrom(info?.ServerName),
    version: stringFrom(info?.Version),
    productName: stringFrom(info?.ProductName),
  };
}

function buildHeaders(settings, server, line, token = null) {
  const headers = {
    "Accept-Encoding": "identity",
    "Content-Type": "application/json",
    "User-Agent": defaultUserAgent(settings, server, line),
    "X-Emby-Authorization": `MediaBrowser Client="${CLIENT_NAME}", Device="Desktop", DeviceId="${DEVICE_ID}", Version="${CLIENT_VERSION}"`,
  };

  if (token) {
    headers["X-Emby-Token"] = token;
    headers.Authorization = `MediaBrowser Token="${token}"`;
  }

  for (const [name, value] of line.headers ?? []) {
    if (name && value != null) headers[name] = String(value);
  }

  return headers;
}

async function requestJson(url, init, context, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${context}: HTTP ${response.status} from ${url}; body preview: ${bodyPreview(body)}`);
  }
  if (!body.trim()) return null;
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`${context}: failed to parse JSON from ${url}: ${error}; body preview: ${bodyPreview(body)}`);
  }
}

export class EmbyClient {
  constructor(store) {
    this.store = store;
  }

  async settings() {
    return this.store.getSettings();
  }

  pickLine(server, lineId = null) {
    if (lineId) {
      const requested = server.lines.find((item) => item.id === lineId);
      if (!requested) throw new Error(`line not found: ${lineId}`);
      if (requested.enabled === false) throw new Error(`line disabled: ${lineId}`);
      return requested;
    }
    const line =
      server.lines.find((item) => item.id === server.activeLineId && item.enabled) ??
      server.lines.find((item) => item.enabled) ??
      server.lines[0];
    if (!line) throw new Error(`no available line for server ${server.id}`);
    return line;
  }

  async authedJson(method, route, server, account, { query, body, context }) {
    const settings = await this.settings();
    const line = this.pickLine(server);
    const url = joinUrl(line.baseUrl, route);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value != null && value !== "") url.searchParams.set(key, String(value));
    }
    return requestJson(
      url,
      {
        method,
        headers: buildHeaders(settings, server, line, account.accessToken),
        body: body == null ? undefined : JSON.stringify(body),
      },
      context ?? route,
      settings.requestTimeoutMs,
    );
  }

  async authenticate(server, username, password) {
    const settings = await this.settings();
    const enabledLines = server.lines.filter((line) => line.enabled);
    if (enabledLines.length === 0) throw new Error("no available line");

    const errors = [];
    for (const line of enabledLines.sort((a, b) => a.priority - b.priority)) {
      const url = joinUrl(line.baseUrl, "Users/AuthenticateByName");
      try {
        const auth = await requestJson(
          url,
          {
            method: "POST",
            headers: buildHeaders(settings, server, line),
            body: JSON.stringify({ Username: username, Pw: password }),
          },
          "authenticate",
          settings.requestTimeoutMs,
        );
        return { auth, line };
      } catch (error) {
        errors.push(`${line.name}: ${error.message}`);
      }
    }

    throw new Error(errors.join("; ") || "authentication failed");
  }

  async systemInfoPublic(server, line) {
    const settings = await this.settings();
    const url = joinUrl(line.baseUrl, "System/Info/Public");
    return requestJson(
      url,
      { method: "GET", headers: buildHeaders(settings, server, line) },
      "system_info_public",
      settings.requestTimeoutMs,
    );
  }

  async detectServer(server) {
    const enabledLines = (Array.isArray(server.lines) ? server.lines : [])
      .filter((line) => line.enabled !== false)
      .sort((a, b) => (numberFrom(a.priority) ?? 0) - (numberFrom(b.priority) ?? 0));
    if (enabledLines.length === 0) throw new Error("no available line");

    const reports = [];
    for (const line of enabledLines) {
      const started = performance.now();
      try {
        const info = await this.systemInfoPublic({ ...server, kind: "emby" }, line);
        const kind = detectServerKind(info);
        const normalized = normalizeSystemInfo(info);
        reports.push({
          lineId: line.id,
          lineName: line.name,
          status: "healthy",
          kind,
          ...normalized,
          latencyMs: Math.round(performance.now() - started),
          error: null,
        });
        return {
          kind,
          winningLineId: line.id,
          ...normalized,
          reports,
        };
      } catch (error) {
        reports.push({
          lineId: line.id,
          lineName: line.name,
          status: "down",
          kind: null,
          serverName: null,
          version: null,
          productName: null,
          latencyMs: null,
          error: error?.message ?? String(error),
        });
      }
    }

    throw new Error(reports.map((report) => `${report.lineName}: ${report.error}`).join("; "));
  }

  async login(server, username, password) {
    const { auth, line } = await this.authenticate(server, username, password);
    const now = new Date().toISOString();
    const account = {
      id: randomUUID(),
      serverId: server.id,
      userId: stringFrom(auth?.User?.Id) ?? "",
      username: stringFrom(auth?.User?.Name) ?? username,
      accessToken: stringFrom(auth?.AccessToken) ?? "",
      avatarTag: stringFrom(auth?.User?.PrimaryImageTag),
      createdAt: now,
      lastUsedAt: now,
    };
    if (!account.userId || !account.accessToken) {
      throw new Error("authentication failed: missing user id or token");
    }

    const updatedServer = { ...server, activeLineId: line.id };
    await this.store.upsertServer(updatedServer);
    const savedAccount = await this.store.upsertAccount(account, true);
    return { account: savedAccount, winningLineId: line.id };
  }

  async listViews(server, account) {
    const value = await this.authedJson("GET", `Users/${account.userId}/Views`, server, account, {
      context: "list_views",
    });
    return normalizeItemsResponse(value);
  }

  async listItems(server, account, parentId, params = []) {
    const query = Object.fromEntries(params);
    if (parentId) query.ParentId = parentId;
    const value = await this.authedJson("GET", `Users/${account.userId}/Items`, server, account, {
      query,
      context: "list_items",
    });
    return normalizeItemsResponse(value);
  }

  async getItem(server, account, itemId) {
    const value = await this.authedJson("GET", `Users/${account.userId}/Items/${itemId}`, server, account, {
      query: {
        Fields:
          `Overview,Genres,GenreItems,Studios,People,ProviderIds,CommunityRating,OfficialRating,PrimaryImageAspectRatio,UserData,RunTimeTicks,SeriesInfo,ProductionYear,MediaSources,${IMAGE_FALLBACK_FIELDS}`,
      },
      context: "get_item",
    });
    return normalizeItem(value);
  }

  async search(server, account, term) {
    return this.listItems(server, account, null, [
      ["SearchTerm", term],
      ["Recursive", "true"],
      ["Fields", `PrimaryImageAspectRatio,Overview,ProductionYear,UserData,${IMAGE_FALLBACK_FIELDS}`],
      ["Limit", "50"],
    ]);
  }

  async resumeItems(server, account) {
    const value = await this.authedJson("GET", `Users/${account.userId}/Items/Resume`, server, account, {
      query: {
        Recursive: "true",
        MediaTypes: "Video",
        Fields: PERSONAL_ITEM_FIELDS,
        EnableUserData: "true",
        EnableImages: "true",
        ImageTypeLimit: "3",
        EnableImageTypes: "Primary,Backdrop,Thumb",
        Limit: "120",
      },
      context: "resume_items",
    });
    return normalizeItemsResponse(value);
  }

  async listSeasons(server, account, seriesId) {
    const value = await this.authedJson("GET", `Shows/${seriesId}/Seasons`, server, account, {
      query: { UserId: account.userId },
      context: "list_seasons",
    });
    return normalizeItemsResponse(value);
  }

  async listEpisodes(server, account, seriesId, seasonId) {
    const value = await this.authedJson("GET", `Shows/${seriesId}/Episodes`, server, account, {
      query: {
        UserId: account.userId,
        SeasonId: seasonId,
        Fields: `Overview,PrimaryImageAspectRatio,UserData,RunTimeTicks,SeriesInfo,${IMAGE_FALLBACK_FIELDS}`,
      },
      context: "list_episodes",
    });
    return normalizeItemsResponse(value);
  }

  async similarItems(server, account, itemId, limit = 18) {
    const value = await this.authedJson("GET", `Items/${itemId}/Similar`, server, account, {
      query: {
        UserId: account.userId,
        Limit: numberFrom(limit) ?? 18,
        Fields: `PrimaryImageAspectRatio,Overview,ProductionYear,UserData,SeriesInfo,${IMAGE_FALLBACK_FIELDS}`,
      },
      context: "similar_items",
    });
    return normalizeItemsResponse(value);
  }

  async specialFeatures(server, account, itemId, limit = 18) {
    const max = Math.max(1, numberFrom(limit) ?? 18);
    const value = await this.authedJson(
      "GET",
      `Users/${account.userId}/Items/${itemId}/SpecialFeatures`,
      server,
      account,
      {
        query: {
          Limit: max,
          Fields: `PrimaryImageAspectRatio,Overview,ProductionYear,UserData,SeriesInfo,RunTimeTicks,${IMAGE_FALLBACK_FIELDS}`,
        },
        context: "special_features",
      },
    );
    const response = normalizeItemsResponse(value);
    return {
      ...response,
      Items: response.Items.filter((candidate) => candidate.Id !== itemId).slice(0, max),
    };
  }

  async playbackInfo(server, account, itemId, startMs = null, lineId = null) {
    const settings = await this.settings();
    const line = this.pickLine(server, lineId);
    const startTicks =
      startMs == null ? null : Math.max(0, Math.floor((numberFrom(startMs) ?? 0) * 10_000));
    const url = joinUrl(line.baseUrl, `Items/${itemId}/PlaybackInfo`);
    for (const [key, value] of Object.entries({
      UserId: account.userId,
      StartTimeTicks: startTicks,
      MaxStreamingBitrate: "140000000",
      ...directPlaybackOptions(),
    })) {
      url.searchParams.set(key, String(value));
    }

    const body = {
      UserId: account.userId,
      MaxStreamingBitrate: 140000000,
      StartTimeTicks: startTicks,
      ...directPlaybackOptions(),
      DeviceProfile: directOnlyDeviceProfile("Hills Lite Local Decode"),
    };
    return requestJson(
      url,
      {
        method: "POST",
        headers: buildHeaders(settings, server, line, account.accessToken),
        body: JSON.stringify(body),
      },
      "playback_info",
      settings.requestTimeoutMs,
    );
  }

  async listSubtitles(server, account, session) {
    const settings = await this.settings();
    const line = this.pickLine(server, session.lineId ?? null);
    const info = await this.playbackInfo(server, account, session.itemId, null, line.id);
    const sources = Array.isArray(info?.MediaSources) ? info.MediaSources : [];
    const source =
      sources.find((item) => stringFrom(item.Id) === session.mediaSourceId) ?? sources[0] ?? null;
    if (!source) {
      return {
        itemId: session.itemId,
        mediaSourceId: session.mediaSourceId,
        tracks: [],
      };
    }

    const mediaSourceId = stringFrom(source.Id) ?? session.mediaSourceId;
    const streams = Array.isArray(source.MediaStreams) ? source.MediaStreams : [];
    const tracks = [];
    for (const stream of streams) {
      if (stringFrom(stream?.Type)?.toLowerCase() !== "subtitle") continue;
      const index = numberFrom(stream.Index);
      if (index == null) continue;
      const deliveryUrl = stringFrom(stream.DeliveryUrl);
      const fallbackRoute = `Videos/${session.itemId}/${mediaSourceId}/Subtitles/${index}/Stream.${pickSubtitleFormat(
        stream.Codec,
      )}`;
      const url = deliveryUrl
        ? absoluteMediaUrl(line.baseUrl, deliveryUrl)
        : joinUrl(line.baseUrl, fallbackRoute);
      appendToken(url, account.accessToken, settings.appendAuthQuery === true);
      tracks.push({
        index,
        language: stringFrom(stream.Language),
        displayTitle: stringFrom(stream.DisplayTitle) ?? stringFrom(stream.Title),
        codec: stringFrom(stream.Codec),
        isDefault: boolFrom(stream.IsDefault) ?? false,
        isForced: boolFrom(stream.IsForced) ?? false,
        isExternal: boolFrom(stream.IsExternal) ?? false,
        url: url.toString(),
      });
    }

    return {
      itemId: session.itemId,
      mediaSourceId,
      tracks,
    };
  }

  async listSessions(server, account) {
    const value = await this.authedJson("GET", "Sessions", server, account, {
      context: "list_sessions",
    });
    const sessions = Array.isArray(value) ? value.map(normalizeRemoteSession) : [];
    return sessions.filter((session) => session.id && session.deviceId !== DEVICE_ID);
  }

  async sendPlaystate(server, account, sessionId, command, seekPositionTicks = null) {
    const query = {};
    if (seekPositionTicks != null) query.SeekPositionTicks = seekPositionTicks;
    await this.authedJson("POST", `Sessions/${sessionId}/Playing/${command}`, server, account, {
      query,
      context: "remote_playstate",
    });
  }

  async sendPlay(server, account, sessionId, itemIds, startPositionTicks = null) {
    const query = {
      PlayCommand: "PlayNow",
      ItemIds: Array.isArray(itemIds) ? itemIds.join(",") : "",
    };
    if (startPositionTicks != null) query.StartPositionTicks = startPositionTicks;
    await this.authedJson("POST", `Sessions/${sessionId}/Playing`, server, account, {
      query,
      context: "remote_play",
    });
  }

  async sendGeneralCommand(server, account, sessionId, command, args = {}) {
    await this.authedJson("POST", `Sessions/${sessionId}/Command`, server, account, {
      body: {
        Name: command,
        Arguments: args,
      },
      context: "remote_general_command",
    });
  }

  async playbackSource(server, account, itemId, startMs = 0, options = {}) {
    const settings = await this.settings();
    const line = this.pickLine(server, options?.lineId ?? null);
    const appendAuthQuery = settings.appendAuthQuery === true;
    const startTicks = Math.max(0, Math.floor((numberFrom(startMs) ?? 0) * 10_000));
    const url = joinUrl(line.baseUrl, `Items/${itemId}/PlaybackInfo`);
    for (const [key, value] of Object.entries({
      UserId: account.userId,
      StartTimeTicks: startTicks,
      IsPlayback: "true",
      AutoOpenLiveStream: "true",
      MaxStreamingBitrate: "140000000",
      ...directPlaybackOptions(),
    })) {
      url.searchParams.set(key, String(value));
    }

    const body = {
      UserId: account.userId,
      MaxStreamingBitrate: 140000000,
      StartTimeTicks: startTicks,
      IsPlayback: true,
      AutoOpenLiveStream: true,
      ...directPlaybackOptions(),
      DeviceProfile: directOnlyDeviceProfile("Hills Lite Local Decode"),
    };

    const info = await requestJson(
      url,
      {
        method: "POST",
        headers: buildHeaders(settings, server, line, account.accessToken),
        body: JSON.stringify(body),
      },
      "get_playback_source",
      settings.requestTimeoutMs,
    );
    const mediaSources = Array.isArray(info?.MediaSources) ? info.MediaSources : [];
    const requestedMediaSourceId = stringFrom(options?.mediaSourceId);
    const mediaSource = pickLocalDecodeMediaSource(mediaSources, requestedMediaSourceId);

    const mediaSourceId = stringFrom(mediaSource.Id) ?? "";
    const playMethod = localDecodePlayMethod(mediaSource);
    const playSessionId =
      stringFrom(info?.PlaySessionId) ?? stringFrom(mediaSource.PlaySessionId) ?? randomUUID();
    const streamUrl = joinUrl(line.baseUrl, `Videos/${itemId}/stream`);
    streamUrl.searchParams.set("MediaSourceId", mediaSourceId);
    streamUrl.searchParams.set("PlaySessionId", playSessionId);
    streamUrl.searchParams.set("Static", "true");
    appendToken(streamUrl, account.accessToken, appendAuthQuery);

    const tracks = Array.isArray(mediaSource.MediaStreams)
      ? mediaSource.MediaStreams.map(normalizeTrack)
      : [];
    const diagnostics = {
      sourceKind: localDecodeMode(mediaSource),
      streamKind: "direct-static",
      mediaSourceCount: mediaSources.length,
      selectedMediaSource: mediaSourceDiagnostics(mediaSource),
      authQuery: appendAuthQuery,
      serverTranscodingAllowed: false,
      line: lineDiagnostics(line),
    };

    return {
      itemId,
      playSessionId,
      mediaSourceId,
      playMethod,
      lineId: line.id,
      lineName: line.name,
      streamUrl: streamUrl.toString(),
      headers: [
        ["X-Emby-Token", account.accessToken],
        ["Authorization", `MediaBrowser Token="${account.accessToken}"`],
      ],
      userAgent: defaultUserAgent(settings, server, line),
      durationMs: Math.floor((numberFrom(mediaSource.RunTimeTicks) ?? 0) / 10_000),
      tracks,
      mediaSources: mediaSources.map((source, index) =>
        normalizePlaybackMediaSource(source, index, mediaSourceId),
      ),
      lines: playbackLineOptions(server, line),
      diagnostics,
    };
  }

  async mpvPlaybackSource(
    server,
    account,
    itemId,
    startMs = 0,
    preferDirect = true,
    options = {},
  ) {
    const browserSource = await this.playbackSource(server, account, itemId, startMs, options);
    if (!preferDirect) {
      return {
        ...browserSource,
        diagnostics: {
          ...browserSource.diagnostics,
          streamKind: "direct-static",
          preferDirect: false,
          serverTranscodingAllowed: false,
        },
      };
    }

    const settings = await this.settings();
    const line = this.pickLine(server, browserSource.lineId ?? options?.lineId ?? null);
    const streamUrl = joinUrl(line.baseUrl, `Videos/${itemId}/stream`);
    streamUrl.searchParams.set("MediaSourceId", browserSource.mediaSourceId);
    streamUrl.searchParams.set("PlaySessionId", browserSource.playSessionId);
    streamUrl.searchParams.set("Static", "true");
    appendToken(streamUrl, account.accessToken, settings.appendAuthQuery === true);

    return {
      ...browserSource,
      streamUrl: streamUrl.toString(),
      headers: [
        ["X-Emby-Token", account.accessToken],
        ["Authorization", `MediaBrowser Token="${account.accessToken}"`],
      ],
      userAgent: defaultUserAgent(settings, server, line),
      diagnostics: {
        ...browserSource.diagnostics,
        sourceKind: browserSource.playMethod === "DirectPlay" ? "direct-play" : "direct-stream",
        streamKind: "mpv-direct-static",
        preferDirect: true,
        serverTranscodingAllowed: false,
        directStream: {
          static: true,
          hasApiKey: streamUrl.searchParams.has("api_key"),
        },
        line: lineDiagnostics(line),
      },
    };
  }

  async reportProgress(server, account, progress) {
    await this.authedJson("POST", "Sessions/Playing/Progress", server, account, {
      body: {
        ItemId: progress.itemId,
        PlaySessionId: progress.playSessionId,
        PositionTicks: numberFrom(progress.positionTicks) ?? 0,
        IsPaused: boolFrom(progress.isPaused) ?? false,
        PlayMethod: sanitizePlaybackMethod(progress.playMethod),
        VolumeLevel: numberFrom(progress.volumeLevel) ?? 80,
      },
      context: "report_playback_progress",
    });
  }

  async reportStopped(server, account, payload) {
    await this.authedJson("POST", "Sessions/Playing/Stopped", server, account, {
      body: {
        ItemId: payload.itemId,
        PlaySessionId: payload.playSessionId,
        PositionTicks: numberFrom(payload.positionTicks) ?? 0,
      },
      context: "report_playback_stopped",
    });
  }

  async testLine(server, line) {
    const started = performance.now();
    try {
      await this.systemInfoPublic(server, line);
      const latency = Math.round(performance.now() - started);
      return {
        lineId: line.id,
        status: latency > 1500 ? "slow" : "healthy",
        latencyMs: latency,
        httpStatus: 200,
        error: null,
      };
    } catch (error) {
      return {
        lineId: line.id,
        status: "down",
        latencyMs: null,
        httpStatus: null,
        error: error.message,
      };
    }
  }

  async setFavorite(server, account, itemId, value) {
    await this.authedJson(value ? "POST" : "DELETE", `Users/${account.userId}/FavoriteItems/${itemId}`, server, account, {
      context: "set_favorite",
    });
    return (await this.getItem(server, account, itemId)).UserData;
  }

  async setPlayed(server, account, itemId, value) {
    await this.authedJson(value ? "POST" : "DELETE", `Users/${account.userId}/PlayedItems/${itemId}`, server, account, {
      context: "set_played",
    });
    return (await this.getItem(server, account, itemId)).UserData;
  }
}
