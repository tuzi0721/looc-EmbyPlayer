import fs from "node:fs";

function readInput() {
  const envValues = [
    process.env.HILLS_REAL_LINE1,
    process.env.HILLS_REAL_USERNAME,
    process.env.HILLS_REAL_PASSWORD,
    process.env.HILLS_REAL_SERIES_ID,
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
  if (!response.ok) throw new Error(`${url.pathname} HTTP ${response.status}`);
  return response.json();
}

const [baseUrl, username, password, seriesId] = readInput();
if (!baseUrl || !username || !password || !seriesId) {
  throw new Error("Provide line1, username, password, and series id via stdin or HILLS_REAL_* env vars.");
}

const auth = await requestJson(joinUrl(baseUrl, "Users/AuthenticateByName"), {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Emby-Authorization": "MediaBrowser Client=Hills Lite,Device=Codex,DeviceId=series-diag,Version=0.1.0",
  },
  body: JSON.stringify({ Username: username, Pw: password }),
});

const token = auth?.AccessToken;
const userId = auth?.User?.Id;
if (!token || !userId) throw new Error("authentication failed");

const headers = {
  "X-Emby-Token": token,
  Authorization: `MediaBrowser Token="${token}"`,
};

async function get(route, params = {}) {
  const url = joinUrl(baseUrl, route);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return requestJson(url, { headers });
}

async function itemCount(route, params) {
  const value = await get(route, params);
  return {
    count: Array.isArray(value?.Items) ? value.Items.length : 0,
    firstType: value?.Items?.[0]?.Type ?? null,
  };
}

const seasons = await get(`Shows/${seriesId}/Seasons`, { UserId: userId });
const seasonRows = [];
for (const season of seasons.Items ?? []) {
  const showEpisodes = await itemCount(`Shows/${seriesId}/Episodes`, {
    UserId: userId,
    SeasonId: season.Id,
    Fields: "UserData,RunTimeTicks,SeriesInfo",
    Limit: 200,
  });
  const parentEpisodes = await itemCount(`Users/${userId}/Items`, {
    ParentId: season.Id,
    Recursive: "true",
    IncludeItemTypes: "Episode",
    Fields: "UserData,RunTimeTicks,SeriesInfo",
    Limit: 200,
  });
  seasonRows.push({
    seasonIdPresent: Boolean(season.Id),
    seasonType: season.Type ?? null,
    index: season.IndexNumber ?? null,
    showEpisodes: showEpisodes.count,
    parentEpisodes: parentEpisodes.count,
    firstShowType: showEpisodes.firstType,
    firstParentType: parentEpisodes.firstType,
  });
}

const allShowEpisodes = await itemCount(`Shows/${seriesId}/Episodes`, {
  UserId: userId,
  Fields: "UserData,RunTimeTicks,SeriesInfo",
  Limit: 200,
});
const seriesParamEpisodes = await itemCount(`Users/${userId}/Items`, {
  Recursive: "true",
  IncludeItemTypes: "Episode",
  SeriesId: seriesId,
  Fields: "UserData,RunTimeTicks,SeriesInfo",
  Limit: 200,
});
const parentSeriesEpisodes = await itemCount(`Users/${userId}/Items`, {
  ParentId: seriesId,
  Recursive: "true",
  IncludeItemTypes: "Episode",
  Fields: "UserData,RunTimeTicks,SeriesInfo",
  Limit: 200,
});

console.log(JSON.stringify({
  seriesIdPresent: true,
  seasons: Array.isArray(seasons.Items) ? seasons.Items.length : 0,
  seasonRows,
  allShowEpisodes,
  seriesParamEpisodes,
  parentSeriesEpisodes,
}, null, 2));
