import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "undici";

const devServerUrl = process.env.HILLS_SMOKE_DEV_SERVER_URL ?? "http://localhost:1420";
const remotePort = process.env.HILLS_SMOKE_CDP_PORT
  ? Number(process.env.HILLS_SMOKE_CDP_PORT)
  : 9300 + Math.floor(Math.random() * 500);
const tmpDir = path.join(os.tmpdir(), `hills-lite-home-hero-${Date.now()}`);
const userDataDir = path.join(tmpDir, "user-data");
const screenshotPath = path.join(tmpDir, "home-hero.png");
const compactScreenshotPath = path.join(tmpDir, "home-compact.png");
const detailScreenshotPath = path.join(tmpDir, "detail-hero.png");

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAkCAYAAAA5DDySAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAD1SURBVGhD7dKxDcMwDETRjJg642SwDJHauzhwYYAQviCRZiwKYvEaFuTpoMfzve0rywJouJIsgIYryQJo6OX7+rih/R7cC6Dw3uiulUsBFPIulEfjUgEUaBTK18NcAIUYjXK2qAugw9FQ7hpVAXQsKspPugugI9HRO0pZAA1LtHwW9B4pC6BhiRbPgt4jNQugpTOhN0n5A2hYosWzoPdIWQANCS2Pjt5RygJoWENHoqL8RFXAgY5FQ7lr1AWc6PBolLPFXMCBQoxC+XpcKuBEge5CeTRcCpAopDe6a+VegEThrWi/h78WMIMsgIYryQJouI5t/wGkpvo5amdmyAAAAABJRU5ErkJggg==",
  "base64",
);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout || result.status}`);
  }
  return result;
}

async function ensureDevServer() {
  try {
    const response = await fetch(devServerUrl);
    if (response.ok) return;
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`Vite dev server is not reachable at ${devServerUrl}: ${error.message}`);
  }
}

function json(res, value, status = 200) {
  const body = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.byteLength,
  });
  res.end(body);
}

function image(res) {
  res.writeHead(200, {
    "Content-Type": "image/png",
    "Content-Length": png.byteLength,
    "Cache-Control": "no-store",
  });
  res.end(png);
}

const heroMovie = {
  Id: "hero-movie",
  Name: "Giant Screen Smoke",
  Type: "Movie",
  Overview:
    "A real media-library candidate with backdrop, poster and overview copy used to verify the home hero consumes runtime library data.",
  ProductionYear: 2026,
  CommunityRating: 8.7,
  OfficialRating: "PG-13",
  RunTimeTicks: 7_200_000_000,
  ImageTags: { Primary: "primary-tag", Logo: "logo-tag" },
  BackdropImageTags: ["backdrop-tag"],
  MediaSources: [
    {
      Id: "source-main",
      Name: "WEB-DL Main",
      Container: "mkv",
      Size: 1_900_000_000,
      Bitrate: 2_400_000,
      SupportsDirectPlay: true,
      SupportsDirectStream: true,
      SupportsTranscoding: false,
      MediaStreams: [
        { Index: 0, Type: "Video", Codec: "h264", Width: 1920, Height: 1080, BitRate: 2_000_000 },
        { Index: 1, Type: "Audio", Codec: "aac", Language: "jpn", Channels: 2, IsDefault: true },
        { Index: 2, Type: "Subtitle", Codec: "subrip", Language: "chi", DisplayTitle: "Chinese Simplified" },
      ],
    },
    {
      Id: "source-alt",
      Name: "BluRay Alt",
      Container: "mp4",
      Size: 2_400_000_000,
      Bitrate: 3_100_000,
      SupportsDirectPlay: true,
      SupportsDirectStream: false,
      SupportsTranscoding: false,
      MediaStreams: [
        { Index: 0, Type: "Video", Codec: "hevc", Width: 1920, Height: 1080, BitRate: 2_700_000 },
        { Index: 1, Type: "Audio", Codec: "aac", Language: "jpn", Channels: 2, IsDefault: true },
      ],
    },
  ],
  UserData: {
    PlaybackPositionTicks: 0,
    PlayCount: 1,
    IsFavorite: true,
    Played: true,
    LastPlayedDate: "2026-06-01T11:30:00.000Z",
    PlayedPercentage: 100,
  },
};

const resumeItem = {
  ...heroMovie,
  Id: "resume-episode",
  Name: "Resume Smoke",
  Type: "Episode",
  SeriesName: "Smoke Series",
  SeriesId: "smoke-series",
  ImageTags: {},
  BackdropImageTags: [],
  ParentThumbItemId: "smoke-series",
  ParentThumbImageTag: "series-thumb-tag",
  IndexNumber: 2,
};

const seriesItem = {
  Id: "smoke-series",
  Name: "Smoke Series",
  Type: "Series",
  Overview: "Series detail playback smoke target.",
  ProductionYear: 2026,
  CommunityRating: 8.2,
  ImageTags: { Primary: "series-primary-tag", Logo: "series-logo-tag" },
  BackdropImageTags: ["series-backdrop-tag"],
  UserData: {
    PlaybackPositionTicks: 0,
    IsFavorite: false,
    Played: false,
    PlayedPercentage: 0,
  },
};

const seasonItem = {
  Id: "smoke-season-1",
  Name: "第 1 季",
  Type: "Season",
  SeriesId: "smoke-series",
  IndexNumber: 1,
  ImageTags: { Primary: "season-primary-tag" },
};

const duplicateMovie = {
  ...heroMovie,
  ProductionYear: 2025,
  BackdropImageTags: [],
  UserData: {
    ...heroMovie.UserData,
    LastPlayedDate: "2026-06-01T10:30:00.000Z",
  },
};

function createFakeEmbyServer({
  serverName = "Home Hero Smoke",
  userId = "home-user",
  username = "Home Smoke",
  token = "home-token",
  item = heroMovie,
  resumeItems = [resumeItem],
  series = seriesItem,
  seasons = [seasonItem],
  episodes = [resumeItem],
  episodeDelayMs = 0,
} = {}) {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);
    const allItems = [item, ...resumeItems, series, ...seasons, ...episodes].filter(Boolean);

    if (req.method === "GET" && pathname === "/System/Info/Public") {
      json(res, { ProductName: "Emby Server", ServerName: serverName, Version: "4.8.0" });
      return;
    }

    if (req.method === "POST" && pathname === "/Users/AuthenticateByName") {
      req.resume();
      json(res, {
        User: { Id: userId, Name: username },
        AccessToken: token,
      });
      return;
    }

    if (req.method === "GET" && pathname === `/Users/${userId}/Views`) {
      json(res, {
        Items: [
          {
            Id: "movies",
            Name: "Movies",
            Type: "CollectionFolder",
            CollectionType: "movies",
            ImageTags: { Primary: "view-tag" },
          },
        ],
        TotalRecordCount: 1,
      });
      return;
    }

    if (req.method === "GET" && pathname === `/Users/${userId}/Items/Resume`) {
      json(res, { Items: resumeItems, TotalRecordCount: resumeItems.length });
      return;
    }

    if (req.method === "GET" && pathname === `/Shows/${series?.Id}/Seasons`) {
      json(res, { Items: seasons, TotalRecordCount: seasons.length });
      return;
    }

    if (req.method === "GET" && pathname === `/Shows/${series?.Id}/Episodes`) {
      const seasonId = url.searchParams.get("SeasonId");
      const filtered = seasonId ? episodes.filter((episode) => episode.SeasonId === seasonId || !episode.SeasonId) : episodes;
      setTimeout(() => {
        json(res, { Items: filtered, TotalRecordCount: filtered.length });
      }, episodeDelayMs);
      return;
    }

    const detailMatch = pathname.match(new RegExp(`^/Users/${userId}/Items/([^/]+)$`));
    if (req.method === "GET" && detailMatch) {
      const targetId = detailMatch[1];
      const mediaItem = allItems.find((candidate) => candidate.Id === targetId) ?? item;
      json(res, mediaItem);
      return;
    }

    if (req.method === "GET" && pathname === `/Users/${userId}/Items`) {
      json(res, { Items: [item], TotalRecordCount: 1 });
      return;
    }

    const imageMatch = pathname.match(/^\/Items\/([^/]+)\/Images\/(Primary|Backdrop|Thumb|Logo)$/);
    if (req.method === "GET" && imageMatch) {
      const [, itemId, imageType] = imageMatch;
      const mediaItem = allItems.find((candidate) => candidate.Id === itemId);
      const parentItem = resumeItems.find(
        (candidate) =>
          candidate.SeriesId === itemId ||
          candidate.ParentBackdropItemId === itemId ||
          candidate.ParentThumbItemId === itemId,
      );
      if (imageType === "Backdrop" && parentItem?.ParentBackdropImageTags?.length) {
        image(res);
        return;
      }
      if (imageType === "Thumb" && parentItem?.ParentThumbImageTag) {
        image(res);
        return;
      }
      if (imageType === "Primary" && parentItem?.SeriesPrimaryImageTag) {
        image(res);
        return;
      }
      if (imageType === "Logo" && parentItem?.ParentLogoImageTag) {
        image(res);
        return;
      }
      if (imageType === "Backdrop" && !mediaItem?.BackdropImageTags?.length) {
        json(res, { error: "backdrop not found", path: pathname }, 404);
        return;
      }
      if (imageType === "Primary" && !mediaItem?.ImageTags?.Primary) {
        json(res, { error: "primary not found", path: pathname }, 404);
        return;
      }
      if (imageType === "Thumb" && !mediaItem?.ImageTags?.Thumb) {
        json(res, { error: "thumb not found", path: pathname }, 404);
        return;
      }
      if (imageType === "Logo" && !mediaItem?.ImageTags?.Logo) {
        json(res, { error: "logo not found", path: pathname }, 404);
        return;
      }
      image(res);
      return;
    }

    json(res, { error: "not found", path: pathname }, 404);
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fake server did not bind");
  return `http://127.0.0.1:${address.port}`;
}

async function getTargets() {
  for (let index = 0; index < 80; index += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${remotePort}/json`);
      if (response.ok) return response.json();
    } catch {
      // Electron is still starting.
    }
    await wait(250);
  }
  throw new Error("CDP target timeout");
}

async function cdpMessageText(event) {
  const data = event.data;
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  if (data && typeof data.text === "function") return data.text();
  return String(data);
}

function ensureCdpDispatch(ws) {
  if (ws.__hillsCdpDispatchReady) return;
  ws.__hillsCdpDispatchReady = true;
  ws.__hillsCdpPending = new Map();
  ws.__hillsCdpHandlers = [];
  ws.addEventListener("message", async (event) => {
    let message;
    try {
      message = JSON.parse(await cdpMessageText(event));
    } catch {
      ws.__hillsCdpLastParseError = Object.prototype.toString.call(event.data);
      return;
    }
    if (message.id != null && ws.__hillsCdpPending.has(message.id)) {
      const pending = ws.__hillsCdpPending.get(message.id);
      ws.__hillsCdpPending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`${pending.method}: ${JSON.stringify(message.error)}`));
      else pending.resolve(message.result);
      return;
    }
    for (const handler of ws.__hillsCdpHandlers) handler(message);
  });
}

async function cdpCall(ws, method, params = {}) {
  ensureCdpDispatch(ws);
  const id = cdpCall.nextId;
  cdpCall.nextId += 1;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.__hillsCdpPending.delete(id);
      const parseNote = ws.__hillsCdpLastParseError ? `; last parse data ${ws.__hillsCdpLastParseError}` : "";
      reject(new Error(`${method} timeout${parseNote}`));
    }, 45_000);
    ws.__hillsCdpPending.set(id, { method, resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
cdpCall.nextId = 1;

async function cdpEval(ws, expression) {
  const result = await cdpCall(ws, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value ?? null;
}

async function cdpClick(ws, point) {
  await cdpCall(ws, "Page.bringToFront");
  await cdpCall(ws, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 0,
  });
  await cdpCall(ws, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await cdpCall(ws, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
}

function centerOf(rect) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

async function clickSourceCardByMouse(ws, route, sourceLabel) {
  const prepared = await cdpEval(ws, `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const { useAuthStore } = await import("/src/stores/auth.ts");
      const { useServerStore } = await import("/src/stores/server.ts");
      const auth = useAuthStore();
      const serverStore = useServerStore();
      const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      const activeSnapshot = () => {
        const account = auth.activeAccount;
        const server = account ? serverStore.byId(account.serverId) : null;
        return {
          accountId: auth.activeId,
          serverId: server?.id ?? null,
          serverName: server?.name ?? null,
        };
      };
      const accountsSnapshot = () => auth.accounts.map((account) => ({
        id: account.id,
        serverId: account.serverId,
        serverName: serverStore.byId(account.serverId)?.name ?? null,
      }));
      const sourceCards = () =>
        Array.from(document.querySelectorAll(".poster")).map((card) => ({
          card,
          label: card.querySelector(".poster__source")?.textContent?.trim() ?? "",
          title: card.querySelector("h4")?.textContent?.trim() ?? "",
        }));
      await appRouter.push(${JSON.stringify(route)});
      for (let i = 0; i < 30; i += 1) {
        await wait(120);
        if (sourceCards().some((entry) => entry.label === ${JSON.stringify(sourceLabel)})) break;
      }
      const entry = sourceCards().find((item) => item.label === ${JSON.stringify(sourceLabel)});
      entry?.card.scrollIntoView({ block: "center", inline: "center" });
      await wait(120);
      const rect = entry?.card.getBoundingClientRect();
      const hit = rect
        ? document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        : null;
      const hitPoster = hit?.closest?.(".poster");
      return {
        sourceLabel: ${JSON.stringify(sourceLabel)},
        found: Boolean(entry),
        before: activeSnapshot(),
        accounts: accountsSnapshot(),
        card: rect
          ? {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              title: entry.title,
              label: entry.label,
            }
          : null,
        hit: hit
          ? {
              tag: hit.tagName,
              className: String(hit.className ?? ""),
              text: hit.textContent?.replace(/\\s+/g, " ").trim().slice(0, 80) ?? "",
              posterLabel: hitPoster?.querySelector(".poster__source")?.textContent?.trim() ?? "",
          }
          : null,
      };
    })()
  `);

  if (prepared?.card) {
    await cdpClick(ws, centerOf(prepared.card));
  }

  const result = await cdpEval(ws, `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const { useAuthStore } = await import("/src/stores/auth.ts");
      const { useServerStore } = await import("/src/stores/server.ts");
      const auth = useAuthStore();
      const serverStore = useServerStore();
      const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      const activeSnapshot = () => {
        const account = auth.activeAccount;
        const server = account ? serverStore.byId(account.serverId) : null;
        return {
          accountId: auth.activeId,
          serverId: server?.id ?? null,
          serverName: server?.name ?? null,
        };
      };
      let after = activeSnapshot();
      let detailRoute = appRouter.currentRoute.value.fullPath;
      for (let i = 0; i < 50; i += 1) {
        await wait(120);
        after = activeSnapshot();
        detailRoute = appRouter.currentRoute.value.fullPath;
        if (detailRoute.startsWith("/item/")) break;
      }
      return {
        after,
        detailRoute,
        query: { ...appRouter.currentRoute.value.query },
      };
    })()
  `);

  return { ...prepared, ...result };
}

await ensureDevServer();
await fsp.mkdir(userDataDir, { recursive: true });

const fakeServer = createFakeEmbyServer({ episodeDelayMs: 700 });
const fakeBaseUrl = await listen(fakeServer);
const duplicateServer = createFakeEmbyServer({
  serverName: "Duplicate Smoke",
  userId: "duplicate-user",
  username: "Duplicate Smoke",
  token: "duplicate-token",
  item: duplicateMovie,
  resumeItems: [],
});
const duplicateBaseUrl = await listen(duplicateServer);
const electron = path.resolve("node_modules/electron/dist/electron.exe");
const child = spawn(electron, [`--remote-debugging-port=${remotePort}`, "electron/main.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HILLS_ELECTRON_DEV_SERVER_URL: devServerUrl,
    HILLS_ELECTRON_DISABLE_GPU: "1",
    HILLS_ELECTRON_OPEN_DEVTOOLS: "0",
    HILLS_ELECTRON_USER_DATA_DIR: userDataDir,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
const childStdout = [];
const childStderr = [];
child.stdout?.on("data", (chunk) => {
  childStdout.push(String(chunk));
  if (childStdout.join("").length > 8000) childStdout.shift();
});
child.stderr?.on("data", (chunk) => {
  childStderr.push(String(chunk));
  if (childStderr.join("").length > 8000) childStderr.shift();
});

let ws;
let selectedTarget = null;
let targetSummary = [];
let wsCloseInfo = null;
let wsErrorInfo = null;
try {
  const targets = await getTargets();
  targetSummary = targets.map((item) => ({
    id: item.id,
    type: item.type,
    url: item.url,
    title: item.title,
  }));
  const target =
    targets.find((item) => item.type === "page" && item.url.startsWith(devServerUrl)) ??
    targets.find((item) => item.type === "page");
  if (!target?.webSocketDebuggerUrl) throw new Error("page target not found");
  selectedTarget = {
    id: target.id,
    type: target.type,
    url: target.url,
    title: target.title,
  };

  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.addEventListener("close", (event) => {
    wsCloseInfo = {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
    };
  });
  ws.addEventListener("error", (event) => {
    wsErrorInfo = {
      type: event.type,
      message: event.message ?? null,
    };
  });
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("websocket error"));
  });
  await cdpCall(ws, "Runtime.enable");
  await cdpCall(ws, "Page.enable");
  await wait(500);

  const result = await cdpEval(ws, `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      await wait(1000);
      const { useAuthStore } = await import("/src/stores/auth.ts");
      const { useLibraryStore } = await import("/src/stores/library.ts");
      const { useServerStore } = await import("/src/stores/server.ts");
      const { useSettingsStore } = await import("/src/stores/settings.ts");
      const auth = useAuthStore();
      const lib = useLibraryStore();
      const serverStore = useServerStore();
      const settings = useSettingsStore();
      const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      if (!appRouter) throw new Error("mounted Vue router not found");
      await settings.update({ theme: "light" });
      await wait(120);
      const rgb = (value) => {
        const match = String(value).match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
        return match ? match.slice(1, 4).map(Number) : [];
      };
      const avg = (value) => {
        const parsed = rgb(value);
        return parsed.length === 3 ? parsed.reduce((sum, item) => sum + item, 0) / 3 : null;
      };
      const lightTheme = {
        rootTheme: document.documentElement.getAttribute("data-theme"),
        sidebarBg: getComputedStyle(document.querySelector(".app-sidebar")).backgroundColor,
        topbarBg: getComputedStyle(document.querySelector(".topbar")).backgroundColor,
        fgPrimary: getComputedStyle(document.documentElement).getPropertyValue("--fg-primary").trim(),
      };
      lightTheme.sidebarAvg = avg(lightTheme.sidebarBg);
      lightTheme.topbarAvg = avg(lightTheme.topbarBg);
      lightTheme.fgAvg = avg(lightTheme.fgPrimary);
      await appRouter.push({ name: "settings", query: { c: "servers" } });
      await wait(800);
      const addButton = Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === "添加",
      );
      addButton?.click();
      await wait(300);
      const dialog = document.querySelector(".modal");
      const dialogText = dialog?.innerText ?? "";
      const inputs = Array.from(dialog?.querySelectorAll("input, textarea, select") ?? []);
      const placeholders = inputs.map((input) => input.getAttribute("placeholder") ?? "").filter(Boolean);
      const uaInputs = Array.from(dialog?.querySelectorAll('input[placeholder*="User-Agent"]') ?? []);
      const addServerDialogUi = {
        visible: Boolean(dialog),
        usernameField: placeholders.includes("用户名"),
        passwordField: placeholders.includes("密码"),
        portField: placeholders.some((placeholder) => placeholder.includes("端口") && placeholder.includes("任意")),
        lineNameOptional: placeholders.some((placeholder) => placeholder.includes("线路名") && placeholder.includes("可选")),
        uaInputsInAdvanced: uaInputs.length > 0 && uaInputs.every((input) => input.closest(".line-advanced")),
        hasKindSelect: Boolean(dialog?.querySelector("select")) || dialogText.includes("类型"),
        hasServerNameInput: placeholders.some((placeholder) => /服务器.*名|名称/.test(placeholder) && !placeholder.includes("线路")),
      };
      dialog?.querySelector(".modal__head .iconbtn, .iconbtn")?.click();
      for (let i = 0; i < 10 && document.querySelector(".modal-mask, .modal"); i += 1) {
        await wait(80);
      }
      const existingServer = await serverStore.addServer({
        name: "Existing Smoke Server",
        kind: "emby",
        activeLineId: "existing-line",
        defaultUserAgent: null,
        lines: [{
          id: "existing-line",
          name: "Existing",
          baseUrl: ${JSON.stringify(duplicateBaseUrl)},
          userAgent: null,
          headers: [],
          priority: 0,
          enabled: true,
        }],
      });
      await auth.login({ serverId: existingServer.id, username: "duplicate", password: "duplicate" });
      const beforeServerCount = serverStore.servers.length;
      const detected = await serverStore.detectServer({
        defaultUserAgent: null,
        lines: [{
          id: "home-line",
          name: "Local",
          baseUrl: ${JSON.stringify(fakeBaseUrl)},
          userAgent: null,
          headers: [],
          priority: 0,
          enabled: true,
        }],
      });
      const server = await serverStore.addServer({
        name: detected.serverName || "Home Hero Smoke",
        kind: detected.kind,
        activeLineId: detected.winningLineId,
        defaultUserAgent: null,
        lines: [{
          id: "home-line",
          name: "Local",
          baseUrl: ${JSON.stringify(fakeBaseUrl)},
          userAgent: null,
          headers: [],
          priority: 0,
          enabled: true,
        }],
      });
      const afterServerCount = serverStore.servers.length;
      lib.reset();
      await auth.login({ serverId: server.id, username: "home", password: "home" });
      await appRouter.push("/home");
      await wait(800);
      lib.reset();
      await lib.refreshHome();
      await wait(1500);
      const hero = document.querySelector(".hero.hero--cinema");
      const firstRun = document.querySelector(".first-run");
      const title = document.querySelector(".hero__title");
      const desc = document.querySelector(".hero__desc");
      const poster = document.querySelector(".hero__poster");
      const logo = document.querySelector(".hero__logo");
      const heroImage = document.querySelector(".hero__bg img");
      const nextSection = document.querySelector(".row-section");
      const heroRect = hero?.getBoundingClientRect();
      const posterRect = poster?.getBoundingClientRect();
      const logoRect = logo?.getBoundingClientRect();
      const nextRect = nextSection?.getBoundingClientRect();
      return {
        route: appRouter.currentRoute.value.fullPath,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        hero: heroRect ? { x: heroRect.x, y: heroRect.y, width: heroRect.width, height: heroRect.height, bottom: heroRect.bottom } : null,
        heroAspect: heroRect ? heroRect.width / heroRect.height : null,
        poster: posterRect ? { width: posterRect.width, height: posterRect.height } : null,
        nextSectionTop: nextRect?.top ?? null,
        nextSectionVisible: nextRect ? Math.max(0, Math.min(nextRect.bottom, window.innerHeight) - Math.max(nextRect.top, 0)) : 0,
        title: title?.textContent ?? "",
        logo: logoRect
          ? {
              width: logoRect.width,
              height: logoRect.height,
              loaded: logo.classList.contains("loaded"),
              naturalWidth: logo.naturalWidth,
            }
          : null,
        heroImage: heroImage
          ? {
              src: heroImage.currentSrc || heroImage.src || "",
              complete: heroImage.complete,
              naturalWidth: heroImage.naturalWidth,
              naturalHeight: heroImage.naturalHeight,
            }
          : null,
        desc: desc?.textContent ?? "",
        heroItems: lib.heroItems.length,
        resumeItems: lib.resume.length,
        views: lib.views.length,
        detected: {
          kind: detected.kind,
          serverName: detected.serverName,
          winningLineId: detected.winningLineId,
        },
        serverCounts: { before: beforeServerCount, after: afterServerCount },
        savedServer: {
          name: server.name,
          kind: server.kind,
          activeLineId: server.activeLineId,
          baseUrl: server.lines[0]?.baseUrl ?? null,
        },
        firstRunVisible: Boolean(firstRun),
        posterExists: Boolean(poster),
        lightTheme,
        addServerDialogUi,
        errors: Array.from(document.querySelectorAll(".error, .alert, .toast--error")).map((node) => node.textContent),
      };
    })()
  `);

  const screenshot = await cdpCall(ws, "Page.captureScreenshot", { format: "png" });
  await fsp.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

  const sidebarCollapse = await cdpEval(ws, `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const sidebar = document.querySelector(".sb");
      const menu = document.querySelector(".brand-menu");
      if (!sidebar || !menu) return null;
      const before = sidebar.getBoundingClientRect();
      menu.click();
      await wait(260);
      const collapsed = sidebar.getBoundingClientRect();
      const collapsedClass = sidebar.classList.contains("is-collapsed");
      menu.click();
      await wait(260);
      const expanded = sidebar.getBoundingClientRect();
      return {
        beforeWidth: before.width,
        collapsedWidth: collapsed.width,
        expandedWidth: expanded.width,
        collapsedClass,
        titleVisibleWhenCollapsed: Boolean(document.querySelector(".sb.is-collapsed .brand-btn__name")),
      };
    })()
  `);

  const personalRoutes = await cdpEval(ws, `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      const routes = [];
      for (const path of ["/favorites", "/history", "/aggregate"]) {
        await appRouter.push(path);
        await wait(1800);
        routes.push({
          path,
          body: document.body.innerText,
          posterCount: document.querySelectorAll(".poster").length,
          loadedImageCount: document.querySelectorAll(".poster__art img.loaded").length,
          sourceLabels: Array.from(document.querySelectorAll(".poster__source")).map((node) => node.textContent?.trim()).filter(Boolean),
          historyCardCount: document.querySelectorAll(".history-card").length,
          errorTexts: Array.from(document.querySelectorAll(".empty--error, .toast--error")).map((node) => node.textContent?.trim()),
        });
      }
      return routes;
    })()
  `);

  const multiServerOpenProbe = {
    duplicate: await clickSourceCardByMouse(ws, "/favorites", "Existing Smoke Server"),
    home: await clickSourceCardByMouse(ws, "/history", "Home Hero Smoke"),
  };

  const detailProbe = await cdpEval(ws, `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      await appRouter.push("/home");
      await wait(900);
      document.querySelector(".hero")?.click();
      await wait(1200);
      const hero = document.querySelector(".detail .hero");
      const panel = document.querySelector(".hero__playback-panel");
      const bgImage = document.querySelector(".detail .hero__bg img");
      const overview = document.querySelector(".overview-block");
      const mediaInfo = document.querySelector(".media-info");
      const mediaSelect = document.querySelector("#hero-media-source");
      const audioSelect = document.querySelector("#hero-audio-source");
      const subtitleSelect = document.querySelector("#hero-subtitle-source");
      const heroRect = hero?.getBoundingClientRect();
      const panelRect = panel?.getBoundingClientRect();
      const overviewRect = overview?.getBoundingClientRect();
      const mediaInfoRect = mediaInfo?.getBoundingClientRect();
      const detailRoute = appRouter.currentRoute.value.fullPath;
      if (mediaSelect && mediaSelect.options.length > 1) {
        mediaSelect.value = mediaSelect.options[1].value;
        mediaSelect.dispatchEvent(new Event("change", { bubbles: true }));
        await wait(100);
      }
      document.querySelector(".hero__play")?.click();
      await wait(200);
      const playerRoute = appRouter.currentRoute.value.fullPath;
      await appRouter.push("/item/hero-movie");
      await wait(300);
      return {
        route: detailRoute,
        playerRoute,
        hero: heroRect
          ? { x: heroRect.x, y: heroRect.y, width: heroRect.width, height: heroRect.height, bottom: heroRect.bottom }
          : null,
        panel: panelRect
          ? { width: panelRect.width, height: panelRect.height, bottom: panelRect.bottom }
          : null,
        bgImage: bgImage
          ? {
              src: bgImage.currentSrc || bgImage.src || "",
              complete: bgImage.complete,
              naturalWidth: bgImage.naturalWidth,
              naturalHeight: bgImage.naturalHeight,
            }
          : null,
        overviewTop: overviewRect?.top ?? null,
        mediaInfoTop: mediaInfoRect?.top ?? null,
        belowHeroVisible:
          overviewRect || mediaInfoRect
            ? Math.max(
                0,
                Math.min(overviewRect?.bottom ?? mediaInfoRect?.bottom ?? 0, window.innerHeight) -
                  Math.max(overviewRect?.top ?? mediaInfoRect?.top ?? 0, 0),
              )
            : 0,
        title: document.querySelector(".hero__title")?.textContent ?? "",
        appSidebarVisible: Boolean(document.querySelector(".app-sidebar")),
        topbarVisible: Boolean(document.querySelector(".topbar")),
        mediaSelectOptions: mediaSelect?.options.length ?? 0,
        audioSelectOptions: audioSelect?.options.length ?? 0,
        subtitleSelectOptions: subtitleSelect?.options.length ?? 0,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    })()
  `);

  const detailScreenshot = await cdpCall(ws, "Page.captureScreenshot", { format: "png" });
  await fsp.writeFile(detailScreenshotPath, Buffer.from(detailScreenshot.data, "base64"));

  const seriesPlayProbe = await cdpEval(ws, `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      await appRouter.push("/item/smoke-series");
      let button = null;
      for (let i = 0; i < 30; i += 1) {
        const title = document.querySelector(".hero__title")?.textContent ?? "";
        button = document.querySelector(".hero__play");
        if (button && title.includes("Smoke Series")) break;
        await wait(100);
      }
      const beforeClickRoute = appRouter.currentRoute.value.fullPath;
      const buttonDisabled = button ? Boolean(button.disabled) : null;
      button?.click();
      let playerRoute = appRouter.currentRoute.value.fullPath;
      for (let i = 0; i < 60; i += 1) {
        playerRoute = appRouter.currentRoute.value.fullPath;
        if (playerRoute.startsWith("/player/")) break;
        await wait(100);
      }
      return {
        beforeClickRoute,
        hasButton: Boolean(button),
        buttonDisabled,
        playerRoute,
        actionError: document.querySelector(".hero__action-error")?.textContent?.trim() ?? null,
      };
    })()
  `);

  const multiServerSearch = await cdpEval(ws, `
    (async () => {
      const { useLibraryStore } = await import("/src/stores/library.ts");
      const lib = useLibraryStore();
      await lib.search("Giant Screen Smoke");
      return {
        count: lib.searchResults.length,
        sourceLabels: lib.searchResults.map((item) => item._source?.serverName ?? "").filter(Boolean),
        keys: lib.searchResults.map((item) => \`\${item._source?.serverId ?? ""}:\${item._source?.accountId ?? ""}:\${item.Id}\`),
      };
    })()
  `);

  const compactHome = await cdpEval(ws, `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      const { useLibraryStore } = await import("/src/stores/library.ts");
      const lib = useLibraryStore();
      const rect = (node) => {
        const r = node?.getBoundingClientRect();
        return r ? { top: r.top, bottom: r.bottom, width: r.width, height: r.height } : null;
      };
      const visible = (r) => (r ? Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0)) : 0);
      const sectionByTitle = (text) =>
        Array.from(document.querySelectorAll(".row-section")).find((section) =>
          section.querySelector("h2")?.textContent?.trim().includes(text),
        );
      lib.searchResults = [];
      await appRouter.push("/home");
      window.moveTo(80, 80);
      window.resizeTo(960, 600);
      for (let i = 0; i < 10 && !document.querySelector(".hero.hero--cinema"); i += 1) {
        if (lib.heroItems.length === 0) await lib.refreshHome();
        await wait(200);
      }
      await wait(800);
      const hero = document.querySelector(".hero.hero--cinema");
      const resumeSection = sectionByTitle("继续观看");
      const librarySection = sectionByTitle("媒体库");
      const resumeCard = resumeSection?.querySelector(".resume-card");
      const libraryCard = librarySection?.querySelector(".lib-thumb");
      const title = document.querySelector(".hero__title");
      const heroRect = rect(hero);
      const resumeRect = rect(resumeSection);
      const libraryRect = rect(librarySection);
      const resumeCardRect = rect(resumeCard);
      const libraryCardRect = rect(libraryCard);
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        hero: heroRect,
        heroAspect: heroRect ? heroRect.width / heroRect.height : null,
        resumeSection: resumeRect,
        librarySection: libraryRect,
        resumeCard: resumeCardRect,
        libraryCard: libraryCardRect,
        resumeVisible: visible(resumeRect),
        libraryVisible: visible(libraryRect),
        resumeCardVisible: visible(resumeCardRect),
        libraryCardVisible: visible(libraryCardRect),
        titleFontSize: title ? Number.parseFloat(getComputedStyle(title).fontSize) : null,
        hasHorizontalOverflow:
          document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    })()
  `);

  const compactScreenshot = await cdpCall(ws, "Page.captureScreenshot", { format: "png" });
  await fsp.writeFile(compactScreenshotPath, Buffer.from(compactScreenshot.data, "base64"));

  const compactHomeChecks = [
    { ...compactHome, label: "compact-960", minHeroAspect: 2.52, maxHeroAspect: 2.82, minResumeCardVisible: 84, minLibraryCardVisible: 78, maxHeroViewport: 0.6 },
    ...(await cdpEval(ws, `
      (async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const samples = [];
        const sizes = [
          { label: "desktop-low", width: 1366, height: 768, minHeroAspect: 2.52, maxHeroAspect: 2.82, minResumeCardVisible: 92, minLibraryCardVisible: 95, maxHeroViewport: 0.6 },
          { label: "compact-tall", width: 820, height: 620, minHeroAspect: 2.52, maxHeroAspect: 2.82, minResumeCardVisible: 84, minLibraryCardVisible: 78, maxHeroViewport: 0.6 },
          { label: "narrow-short", width: 760, height: 430, minHeroAspect: 2.52, maxHeroAspect: 2.82, minResumeCardVisible: 64, minLibraryCardVisible: 0, minLibraryVisible: 8, maxHeroViewport: 0.68 },
        ];
        const rect = (node) => {
          const r = node?.getBoundingClientRect();
          return r ? { top: r.top, bottom: r.bottom, width: r.width, height: r.height } : null;
        };
        const visible = (r) => (r ? Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0)) : 0);
        for (const size of sizes) {
          window.resizeTo(size.width, size.height);
          await wait(700);
          const hero = document.querySelector(".hero.hero--cinema");
          const sections = Array.from(document.querySelectorAll(".row-section"));
          const resumeSection = sections[0];
          const librarySection = sections[1];
          const resumeCard = resumeSection?.querySelector(".resume-card");
          const libraryCard = librarySection?.querySelector(".lib-thumb");
          const title = document.querySelector(".hero__title");
          const heroRect = rect(hero);
          const resumeRect = rect(resumeSection);
          const libraryRect = rect(librarySection);
          const resumeCardRect = rect(resumeCard);
          const libraryCardRect = rect(libraryCard);
          samples.push({
            ...size,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            hero: heroRect,
            heroAspect: heroRect ? heroRect.width / heroRect.height : null,
            resumeSection: resumeRect,
            librarySection: libraryRect,
            resumeCard: resumeCardRect,
            libraryCard: libraryCardRect,
            resumeVisible: visible(resumeRect),
            libraryVisible: visible(libraryRect),
            resumeCardVisible: visible(resumeCardRect),
            libraryCardVisible: visible(libraryCardRect),
            titleFontSize: title ? Number.parseFloat(getComputedStyle(title).fontSize) : null,
            hasHorizontalOverflow:
              document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          });
        }
        return samples;
      })()
    `)),
  ];

  const failures = [];
  if (result.route !== "/home") failures.push(`route ${result.route}`);
  if (!result.hero) failures.push("hero missing");
  if (result.firstRunVisible) failures.push("first-run guide blocks the home hero");
  if (!result.title.includes(heroMovie.Name)) failures.push("hero title missing media item");
  if (!result.logo?.loaded || result.logo.naturalWidth < 1) {
    failures.push(`hero logo image did not load: ${JSON.stringify(result.logo)}`);
  }
  if (!result.desc.includes("real media-library candidate")) failures.push("hero overview missing");
  if (result.heroItems < 1) failures.push("hero items missing");
  if (result.views < 1) failures.push("library views missing");
  if (result.detected?.kind !== "emby") failures.push(`server kind detection failed: ${result.detected?.kind}`);
  if (result.detected?.serverName !== "Home Hero Smoke") {
    failures.push(`server name detection failed: ${result.detected?.serverName}`);
  }
  if (result.detected?.winningLineId !== "home-line") {
    failures.push(`winning line detection failed: ${result.detected?.winningLineId}`);
  }
  if (result.serverCounts?.after !== result.serverCounts?.before + 1) {
    failures.push(`server add did not append: ${JSON.stringify(result.serverCounts)}`);
  }
  if (result.savedServer?.baseUrl !== fakeBaseUrl) {
    failures.push(`arbitrary port URL was not preserved: ${result.savedServer?.baseUrl}`);
  }
  if (result.lightTheme?.rootTheme !== "light") failures.push("light theme did not apply");
  if ((result.lightTheme?.sidebarAvg ?? 0) < 180) {
    failures.push(`light theme sidebar stayed dark: ${JSON.stringify(result.lightTheme)}`);
  }
  if ((result.lightTheme?.topbarAvg ?? 0) < 180) {
    failures.push(`light theme topbar stayed dark: ${JSON.stringify(result.lightTheme)}`);
  }
  if ((result.lightTheme?.fgAvg ?? 255) > 80) {
    failures.push(`light theme foreground stayed light: ${JSON.stringify(result.lightTheme)}`);
  }
  if (!result.addServerDialogUi?.visible) failures.push("add-server dialog did not open from settings");
  if (!result.addServerDialogUi?.usernameField || !result.addServerDialogUi?.passwordField) {
    failures.push(`add-server dialog missing account fields: ${JSON.stringify(result.addServerDialogUi)}`);
  }
  if (!result.addServerDialogUi?.portField) {
    failures.push(`add-server dialog missing arbitrary port field: ${JSON.stringify(result.addServerDialogUi)}`);
  }
  if (!result.addServerDialogUi?.lineNameOptional || !result.addServerDialogUi?.uaInputsInAdvanced) {
    failures.push(`add-server advanced line fields are wrong: ${JSON.stringify(result.addServerDialogUi)}`);
  }
  if (result.addServerDialogUi?.hasKindSelect || result.addServerDialogUi?.hasServerNameInput) {
    failures.push(`add-server dialog still asks for server kind/name: ${JSON.stringify(result.addServerDialogUi)}`);
  }
  if (!result.heroImage?.src?.includes("hills-image://media")) {
    failures.push(`hero backdrop does not use media image URL: ${JSON.stringify(result.heroImage)}`);
  }
  if (!result.heroImage?.complete || result.heroImage.naturalWidth < 1) {
    failures.push(`hero backdrop image did not load: ${JSON.stringify(result.heroImage)}`);
  }
  if (!sidebarCollapse) failures.push("sidebar collapse controls missing");
  else {
    if (sidebarCollapse.beforeWidth < 180) failures.push(`sidebar expanded width too small: ${sidebarCollapse.beforeWidth}`);
    if (!sidebarCollapse.collapsedClass || sidebarCollapse.collapsedWidth > 90) {
      failures.push(`sidebar did not collapse: ${JSON.stringify(sidebarCollapse)}`);
    }
    if (sidebarCollapse.expandedWidth < 180) failures.push(`sidebar did not expand: ${JSON.stringify(sidebarCollapse)}`);
  }
  if (result.heroAspect != null && (result.heroAspect < 2.35 || result.heroAspect > 2.85)) {
    failures.push(`home hero aspect drifted: ${JSON.stringify(result.hero)}`);
  }
  if (result.hero && result.hero.height > result.viewport.height * 0.72) failures.push("hero consumes too much first viewport");
  if (result.nextSectionTop == null || result.nextSectionTop > result.viewport.height + 2) {
    failures.push("next section is not hinted in first viewport");
  }
  if ((result.nextSectionVisible ?? 0) < 36) {
    failures.push(`next section is not visibly exposed in first viewport: ${JSON.stringify(result)}`);
  }
  if (result.posterExists) failures.push("cinema hero still renders the removed side poster");
  if (!detailProbe.route.startsWith("/item/hero-movie")) failures.push(`hero click did not open item detail: ${detailProbe.route}`);
  if (!detailProbe.hero || detailProbe.hero.height < detailProbe.viewport.height * 0.68) {
    failures.push(`detail hero is too short for immersive detail: ${JSON.stringify(detailProbe)}`);
  }
  if (detailProbe.hero && detailProbe.hero.height > detailProbe.viewport.height * 0.82) {
    failures.push(`detail hero hides too much below-page content: ${JSON.stringify(detailProbe)}`);
  }
  if (detailProbe.viewport.height >= 760 && (detailProbe.belowHeroVisible ?? 0) < 32) {
    failures.push(`detail below-hero content is not exposed: ${JSON.stringify(detailProbe)}`);
  }
  if (!detailProbe.bgImage?.src?.includes("hills-image://media") || !detailProbe.bgImage?.complete || detailProbe.bgImage.naturalWidth < 1) {
    failures.push(`detail backdrop image did not load from media URL: ${JSON.stringify(detailProbe)}`);
  }
  if (detailProbe.appSidebarVisible || detailProbe.topbarVisible) {
    failures.push(`detail route did not enter fullscreen shell: ${JSON.stringify(detailProbe)}`);
  }
  if (detailProbe.hero && (Math.abs(detailProbe.hero.x) > 2 || Math.abs(detailProbe.hero.y) > 2)) {
    failures.push(`detail hero does not fill from window origin: ${JSON.stringify(detailProbe)}`);
  }
  if (!detailProbe.panel || detailProbe.panel.width < 280) {
    failures.push(`detail playback panel missing or too small: ${JSON.stringify(detailProbe)}`);
  }
  if (detailProbe.mediaSelectOptions < 2 || detailProbe.audioSelectOptions < 1 || detailProbe.subtitleSelectOptions < 1) {
    failures.push(`detail playback selects missing: ${JSON.stringify(detailProbe)}`);
  }
  if (!detailProbe.playerRoute.includes("mediaSourceId=source-alt")) {
    failures.push(`detail play did not preserve selected media source: ${detailProbe.playerRoute}`);
  }
  if (!seriesPlayProbe.beforeClickRoute.startsWith("/item/smoke-series")) {
    failures.push(`series probe did not open series detail: ${seriesPlayProbe.beforeClickRoute}`);
  }
  if (!seriesPlayProbe.hasButton || seriesPlayProbe.buttonDisabled) {
    failures.push(`series detail play button unavailable: ${JSON.stringify(seriesPlayProbe)}`);
  }
  if (!seriesPlayProbe.playerRoute.startsWith("/player/resume-episode")) {
    failures.push(`series detail play did not open an episode player: ${JSON.stringify(seriesPlayProbe)}`);
  }
  if (seriesPlayProbe.actionError) {
    failures.push(`series detail play surfaced an action error: ${seriesPlayProbe.actionError}`);
  }
  if (result.errors.length > 0) failures.push(`page errors: ${result.errors.join(" | ")}`);
  for (const route of personalRoutes) {
    if (route.errorTexts.length > 0) failures.push(`${route.path} errors: ${route.errorTexts.join(" | ")}`);
    if (route.path === "/favorites" && (!route.body.includes(heroMovie.Name) || route.posterCount < 1)) {
      failures.push("/favorites did not render favorite media");
    }
    if (route.path === "/favorites" && route.posterCount < 2) {
      failures.push("/favorites did not preserve duplicate cross-server favorites");
    }
    if (route.path === "/favorites" && route.loadedImageCount < 2) {
      failures.push("/favorites did not decode fallback card images");
    }
    if (route.path === "/history" && (!route.body.includes(heroMovie.Name) || route.historyCardCount < 1)) {
      failures.push("/history did not render played media");
    }
    if (route.path === "/history" && route.historyCardCount < 2) {
      failures.push("/history did not preserve duplicate cross-server history");
    }
    if (route.path === "/history" && route.loadedImageCount < 2) {
      failures.push("/history did not decode fallback card images");
    }
    if (route.path === "/aggregate" && (!route.body.includes(heroMovie.Name) || route.posterCount < 1)) {
      failures.push("/aggregate did not render aggregate media");
    }
    if (route.path === "/aggregate" && !route.sourceLabels.includes("Existing Smoke Server")) {
      failures.push("/aggregate did not show cross-server source labels");
    }
  }
  if (!multiServerOpenProbe.duplicate?.found) {
    failures.push("favorite cross-server duplicate card was not found");
  }
  if (multiServerOpenProbe.duplicate?.after?.serverName !== "Existing Smoke Server") {
    failures.push(`favorite click did not switch to duplicate server: ${JSON.stringify(multiServerOpenProbe.duplicate)}`);
  }
  if (!multiServerOpenProbe.duplicate?.detailRoute?.startsWith("/item/hero-movie")) {
    failures.push(`favorite click did not open duplicate detail: ${JSON.stringify(multiServerOpenProbe.duplicate)}`);
  }
  if (!multiServerOpenProbe.duplicate?.query?.server || !multiServerOpenProbe.duplicate?.query?.account) {
    failures.push(`favorite detail route lost source query: ${JSON.stringify(multiServerOpenProbe.duplicate)}`);
  }
  if (!multiServerOpenProbe.home?.found) {
    failures.push("history cross-server home card was not found");
  }
  if (multiServerOpenProbe.home?.after?.serverName !== "Home Hero Smoke") {
    failures.push(`history click did not switch back to home server: ${JSON.stringify(multiServerOpenProbe.home)}`);
  }
  if (!multiServerOpenProbe.home?.detailRoute?.startsWith("/item/hero-movie")) {
    failures.push(`history click did not open home detail: ${JSON.stringify(multiServerOpenProbe.home)}`);
  }
  if (!multiServerOpenProbe.home?.query?.server || !multiServerOpenProbe.home?.query?.account) {
    failures.push(`history detail route lost source query: ${JSON.stringify(multiServerOpenProbe.home)}`);
  }
  if (multiServerSearch.count < 2) failures.push("search did not query all logged-in servers");
  if (!multiServerSearch.sourceLabels.includes("Home Hero Smoke") || !multiServerSearch.sourceLabels.includes("Existing Smoke Server")) {
    failures.push(`search source labels missing: ${multiServerSearch.sourceLabels.join(", ")}`);
  }
  if (new Set(multiServerSearch.keys).size !== multiServerSearch.keys.length) {
    failures.push("search collapsed duplicate cross-server records");
  }
  for (const sample of compactHomeChecks) {
    if (!sample.hero) failures.push(`compact home hero missing at ${sample.label}`);
    if (sample.label !== "desktop-low" && sample.viewport.width > sample.width + 40) {
      failures.push(`compact home window width was clamped at ${sample.label}: ${JSON.stringify(sample)}`);
    }
    if (sample.label !== "desktop-low" && sample.viewport.height > sample.height + 80) {
      failures.push(`compact home window height was clamped at ${sample.label}: ${JSON.stringify(sample)}`);
    }
    if (sample.heroAspect != null && (sample.heroAspect < sample.minHeroAspect || sample.heroAspect > sample.maxHeroAspect)) {
      failures.push(`compact home hero aspect drifted at ${sample.label}: ${JSON.stringify(sample)}`);
    }
    if (sample.hero && sample.hero.height > sample.viewport.height * sample.maxHeroViewport) {
      failures.push(`compact home hero consumes too much viewport at ${sample.label}: ${JSON.stringify(sample)}`);
    }
    if (sample.resumeCardVisible < sample.minResumeCardVisible) {
      failures.push(`compact home resume row is not visibly exposed at ${sample.label}: ${JSON.stringify(sample)}`);
    }
    if (sample.libraryCardVisible < sample.minLibraryCardVisible) {
      failures.push(`compact home library row is not visibly exposed at ${sample.label}: ${JSON.stringify(sample)}`);
    }
    if ((sample.libraryVisible ?? 0) < (sample.minLibraryVisible ?? 0)) {
      failures.push(`compact home library section is not hinted at ${sample.label}: ${JSON.stringify(sample)}`);
    }
    if (sample.hasHorizontalOverflow) failures.push(`compact home has horizontal overflow at ${sample.label}`);
    if ((sample.titleFontSize ?? 999) > 56) {
      failures.push(`compact home title too large at ${sample.label}: ${JSON.stringify(sample)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `home hero smoke failed: ${failures.join("; ")}\n${JSON.stringify({ result, sidebarCollapse, detailProbe, personalRoutes, multiServerSearch, compactHomeChecks }, null, 2)}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        screenshotPath,
        compactScreenshotPath,
        detailScreenshotPath,
        ...result,
        sidebarCollapse,
        detailProbe,
        personalRoutes,
        multiServerOpenProbe,
        multiServerSearch,
        compactHome,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const diagnostic = {
    remotePort,
    selectedTarget,
    targetSummary,
    wsReadyState: ws?.readyState ?? null,
    wsCloseInfo,
    wsErrorInfo,
    child: {
      pid: child.pid,
      exitCode: child.exitCode,
      signalCode: child.signalCode,
      killed: child.killed,
    },
    stdout: childStdout.join("").slice(-4000),
    stderr: childStderr.join("").slice(-4000),
  };
  console.error(`home hero smoke diagnostic:\n${JSON.stringify(diagnostic, null, 2)}`);
  throw error;
} finally {
  if (ws) ws.close();
  child.kill();
  fakeServer.close();
  duplicateServer.close();
  await wait(500);
  try {
    run("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    // Already exited.
  }
}
