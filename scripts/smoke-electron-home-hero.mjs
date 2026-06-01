import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const devServerUrl = process.env.HILLS_SMOKE_DEV_SERVER_URL ?? "http://localhost:1420";
const remotePort = process.env.HILLS_SMOKE_CDP_PORT
  ? Number(process.env.HILLS_SMOKE_CDP_PORT)
  : 9300 + Math.floor(Math.random() * 500);
const tmpDir = path.join(os.tmpdir(), `hills-lite-home-hero-${Date.now()}`);
const userDataDir = path.join(tmpDir, "user-data");
const screenshotPath = path.join(tmpDir, "home-hero.png");

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
  ImageTags: { Primary: "primary-tag" },
  BackdropImageTags: ["backdrop-tag"],
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
  IndexNumber: 2,
};

const duplicateMovie = {
  ...heroMovie,
  ProductionYear: 2025,
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
} = {}) {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);

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

    if (req.method === "GET" && pathname === `/Users/${userId}/Items`) {
      json(res, { Items: [item], TotalRecordCount: 1 });
      return;
    }

    if (req.method === "GET" && /^\/Items\/[^/]+\/Images\/(?:Primary|Backdrop)$/.test(pathname)) {
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

async function cdpCall(ws, method, params = {}) {
  const id = cdpCall.nextId;
  cdpCall.nextId += 1;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} timeout`)), 45_000);
    const listener = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      clearTimeout(timer);
      ws.removeEventListener("message", listener);
      if (message.error) reject(new Error(`${method}: ${JSON.stringify(message.error)}`));
      else resolve(message.result);
    };
    ws.addEventListener("message", listener);
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

await ensureDevServer();
await fsp.mkdir(userDataDir, { recursive: true });

const fakeServer = createFakeEmbyServer();
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
    HILLS_ELECTRON_OPEN_DEVTOOLS: "0",
    HILLS_ELECTRON_USER_DATA_DIR: userDataDir,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

let ws;
try {
  const targets = await getTargets();
  const target =
    targets.find((item) => item.type === "page" && item.url.startsWith(devServerUrl)) ??
    targets.find((item) => item.type === "page");
  if (!target?.webSocketDebuggerUrl) throw new Error("page target not found");

  ws = new WebSocket(target.webSocketDebuggerUrl);
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
      const auth = useAuthStore();
      const lib = useLibraryStore();
      const serverStore = useServerStore();
      const appRouter = document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;
      if (!appRouter) throw new Error("mounted Vue router not found");
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
      const posterImg = document.querySelector(".hero__poster img");
      const nextSection = document.querySelector(".row-section");
      const heroRect = hero?.getBoundingClientRect();
      const posterRect = poster?.getBoundingClientRect();
      const nextRect = nextSection?.getBoundingClientRect();
      return {
        route: appRouter.currentRoute.value.fullPath,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        hero: heroRect ? { x: heroRect.x, y: heroRect.y, width: heroRect.width, height: heroRect.height, bottom: heroRect.bottom } : null,
        poster: posterRect ? { width: posterRect.width, height: posterRect.height } : null,
        nextSectionTop: nextRect?.top ?? null,
        title: title?.textContent ?? "",
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
        posterNatural: posterImg ? { width: posterImg.naturalWidth, height: posterImg.naturalHeight, complete: posterImg.complete } : null,
        heroBg: getComputedStyle(document.querySelector(".hero__bg")).backgroundImage,
        errors: Array.from(document.querySelectorAll(".error, .alert, .toast--error")).map((node) => node.textContent),
      };
    })()
  `);

  const screenshot = await cdpCall(ws, "Page.captureScreenshot", { format: "png" });
  await fsp.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

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
          sourceLabels: Array.from(document.querySelectorAll(".poster__source")).map((node) => node.textContent?.trim()).filter(Boolean),
          historyCardCount: document.querySelectorAll(".history-card").length,
          errorTexts: Array.from(document.querySelectorAll(".empty--error, .toast--error")).map((node) => node.textContent?.trim()),
        });
      }
      return routes;
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

  const failures = [];
  if (result.route !== "/home") failures.push(`route ${result.route}`);
  if (!result.hero) failures.push("hero missing");
  if (result.firstRunVisible) failures.push("first-run guide blocks the home hero");
  if (!result.title.includes(heroMovie.Name)) failures.push("hero title missing media item");
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
  if (!result.heroBg.includes("hills-image://media")) failures.push("hero backdrop does not use media image URL");
  if (result.hero && result.hero.height < result.viewport.height * 0.72) failures.push("hero too short");
  if (result.hero && result.hero.height > result.viewport.height + 4) failures.push("hero taller than viewport");
  if (result.nextSectionTop == null || result.nextSectionTop > result.viewport.height + 2) {
    failures.push("next section is not hinted in first viewport");
  }
  if (!result.poster || result.poster.width < 200) failures.push("cinema poster too small or missing");
  if (!result.posterNatural?.complete || result.posterNatural.width < 1 || result.posterNatural.height < 1) {
    failures.push("cinema poster image did not decode");
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
    if (route.path === "/history" && (!route.body.includes(heroMovie.Name) || route.historyCardCount < 1)) {
      failures.push("/history did not render played media");
    }
    if (route.path === "/history" && route.historyCardCount < 2) {
      failures.push("/history did not preserve duplicate cross-server history");
    }
    if (route.path === "/aggregate" && (!route.body.includes(heroMovie.Name) || route.posterCount < 1)) {
      failures.push("/aggregate did not render aggregate media");
    }
    if (route.path === "/aggregate" && !route.sourceLabels.includes("Existing Smoke Server")) {
      failures.push("/aggregate did not show cross-server source labels");
    }
  }
  if (multiServerSearch.count < 2) failures.push("search did not query all logged-in servers");
  if (!multiServerSearch.sourceLabels.includes("Home Hero Smoke") || !multiServerSearch.sourceLabels.includes("Existing Smoke Server")) {
    failures.push(`search source labels missing: ${multiServerSearch.sourceLabels.join(", ")}`);
  }
  if (new Set(multiServerSearch.keys).size !== multiServerSearch.keys.length) {
    failures.push("search collapsed duplicate cross-server records");
  }

  if (failures.length > 0) {
    throw new Error(
      `home hero smoke failed: ${failures.join("; ")}\n${JSON.stringify({ result, personalRoutes, multiServerSearch }, null, 2)}`,
    );
  }

  console.log(JSON.stringify({ ok: true, screenshotPath, ...result, personalRoutes, multiServerSearch }, null, 2));
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
