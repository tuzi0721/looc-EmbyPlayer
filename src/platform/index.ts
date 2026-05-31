import type {
  Account,
  AppSettings,
  ItemsResponse,
  Line,
  LineHealthReport,
  MediaItem,
  Server,
  ServerKind,
} from "@/types/models";

export type UnlistenFn = () => void;

export interface PlatformEvent<T> {
  event: string;
  payload: T;
}

export interface FileDialogFilter {
  name: string;
  extensions: string[];
}

export interface OpenFileDialogOptions {
  multiple?: boolean;
  directory?: boolean;
  filters?: FileDialogFilter[];
  title?: string;
}

interface HillsLiteBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(
    event: string,
    handler: (event: PlatformEvent<T>) => void,
  ): UnlistenFn | Promise<UnlistenFn>;
  openFileDialog(options?: OpenFileDialogOptions): Promise<string | string[] | null>;
  platformType(): Promise<string>;
}

declare global {
  interface Window {
    hillsLite?: HillsLiteBridge;
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  }
}

const WEB_DEFAULT_SETTINGS: AppSettings = {
  heartbeatIntervalSecs: 180,
  healthCheckIntervalSecs: 60,
  raceTimeoutMs: 3500,
  requestTimeoutMs: 15000,
  defaultUserAgent: "Emby-Player/0.1 (Web Preview)",
  firstRunCompleted: false,
  theme: "dark",
  blurStrength: 24,
  enableWindowVibrancy: true,
  mpvBackend: "ipc",
  externalPlayerPath: null,
  externalPlayerArgs: "",
  hardwareDecoding: true,
  mpvCacheMb: 256,
  hiddenServerIds: [],
  hideJavCodes: false,
  showNetworkSpeed: false,
  statsOverlayMode: "winui",
  blackoutOtherDisplays: false,
  preserveTrackSwitchCache: true,
  skipIntroOutroEnabled: false,
  skipIntroSeconds: 90,
  skipOutroSeconds: 90,
  screenshotIncludeSubtitles: true,
  appendAuthQuery: false,
  homeHeroStyle: "classic",
  closeToTray: true,
  traktSyncEnabled: false,
  traktUsername: null,
  traktSyncWatched: true,
  traktSyncRatings: true,
  traktSyncFavorites: false,
  danmakuOpacity: 0.85,
  danmakuSpeed: 1,
  danmakuFontSize: 22,
  danmakuAvoidSubtitles: true,
  danmakuBottomReservePct: 18,
  subtitleScale: 1,
  subtitleTextColor: "#FFFFFF",
  subtitleOutlineColor: "#000000",
  subtitleOutlineSize: 1.65,
  subtitleShadowOffset: 0,
  subtitlePositionPct: 100,
  subtitleForceStyle: false,
};

const WEB_STATE_KEY = "hills-lite:web-preview-state:v1";
let webSettings: AppSettings = { ...WEB_DEFAULT_SETTINGS };
let webServers: Server[] = [];
let webAccounts: Account[] = [];
let webActiveAccountId: string | null = null;
loadWebPreviewState();

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

function getWebSettings(): AppSettings {
  return {
    ...webSettings,
    hiddenServerIds: [...webSettings.hiddenServerIds],
  };
}

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeWebLine(value: any, index: number, existing?: Line): Line {
  return {
    id: value?.id ?? existing?.id ?? createId("line"),
    name: String(value?.name ?? existing?.name ?? `线路 ${index + 1}`),
    baseUrl: String(value?.baseUrl ?? existing?.baseUrl ?? ""),
    userAgent: value?.userAgent ?? existing?.userAgent ?? null,
    headers: Array.isArray(value?.headers) ? value.headers : existing?.headers ?? [],
    priority: Number.isFinite(Number(value?.priority)) ? Number(value.priority) : index,
    enabled: value?.enabled ?? existing?.enabled ?? true,
    lastLatencyMs: existing?.lastLatencyMs ?? null,
    lastStatus: existing?.lastStatus ?? null,
    lastCheckedAt: existing?.lastCheckedAt ?? null,
  };
}

function createWebServer(payload: any): Server {
  const lines = Array.isArray(payload?.lines)
    ? payload.lines.map((line: any, index: number) => normalizeWebLine(line, index))
    : [];
  const now = new Date().toISOString();
  return {
    id: payload?.id ?? createId("server"),
    name: String(payload?.name ?? "Web Preview"),
    kind: (payload?.kind ?? "emby") as ServerKind,
    lines,
    activeLineId: payload?.activeLineId ?? lines[0]?.id ?? null,
    defaultUserAgent: payload?.defaultUserAgent ?? null,
    autoFailover: payload?.autoFailover ?? true,
    createdAt: payload?.createdAt ?? now,
  };
}

function normalizeWebAccount(value: any): Account | null {
  const account: Account = {
    id: stringFrom(value?.id) ?? createId("account"),
    serverId: stringFrom(value?.serverId) ?? "",
    userId: stringFrom(value?.userId) ?? "",
    username: stringFrom(value?.username) ?? "",
    accessToken: stringFrom(value?.accessToken) ?? "",
    avatarTag: stringFrom(value?.avatarTag),
    createdAt: stringFrom(value?.createdAt) ?? new Date().toISOString(),
    lastUsedAt: stringFrom(value?.lastUsedAt) ?? new Date().toISOString(),
  };
  if (!account.serverId || !account.userId || !account.username || !account.accessToken) {
    return null;
  }
  return account;
}

function loadWebPreviewState() {
  if (typeof localStorage === "undefined") return;
  try {
    const parsed = JSON.parse(localStorage.getItem(WEB_STATE_KEY) ?? "{}");
    webSettings = {
      ...WEB_DEFAULT_SETTINGS,
      ...(parsed.settings ?? {}),
      hiddenServerIds: Array.isArray(parsed.settings?.hiddenServerIds)
        ? parsed.settings.hiddenServerIds
        : [],
    };
    webServers = Array.isArray(parsed.servers)
      ? parsed.servers.map(createWebServer)
      : [];
    webAccounts = Array.isArray(parsed.accounts)
      ? parsed.accounts.map(normalizeWebAccount).filter((account: Account | null): account is Account => Boolean(account))
      : [];
    webActiveAccountId =
      typeof parsed.activeAccountId === "string" &&
      webAccounts.some((account) => account.id === parsed.activeAccountId)
        ? parsed.activeAccountId
        : webAccounts[0]?.id ?? null;
  } catch {
    webSettings = { ...WEB_DEFAULT_SETTINGS };
    webServers = [];
    webAccounts = [];
    webActiveAccountId = null;
  }
}

function saveWebPreviewState() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      WEB_STATE_KEY,
      JSON.stringify({
        settings: webSettings,
        servers: webServers,
        accounts: webAccounts,
        activeAccountId: webActiveAccountId,
      }),
    );
  } catch {
    // Local storage may be disabled in some preview hosts.
  }
}

function webConfigBackup() {
  return {
    schema: "hills-lite-config",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      settings: getWebSettings(),
      servers: clone(webServers),
      accounts: clone(webAccounts),
      activeAccountId: webActiveAccountId,
      globalShortcuts: [],
    },
  };
}

function downloadWebBackup(backup: ReturnType<typeof webConfigBackup>): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `hills-lite-config-${stamp}.json`;
  const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return fileName;
}

function pickWebBackupFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", onFocus);
      input.remove();
      resolve(file);
    };
    const onFocus = () => {
      window.setTimeout(() => {
        if (!input.files || input.files.length === 0) finish(null);
      }, 300);
    };

    input.type = "file";
    input.accept = "application/json,.json";
    input.style.display = "none";
    input.addEventListener("change", () => finish(input.files?.[0] ?? null), { once: true });
    window.addEventListener("focus", onFocus, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

function mergeWebById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of existing) {
    if (item.id) map.set(item.id, item);
  }
  for (const item of incoming) {
    if (item.id) map.set(item.id, item);
  }
  return [...map.values()];
}

function importedWebSettingsPatch(value: unknown): Partial<AppSettings> {
  if (!value || typeof value !== "object") return {};
  const patch = value as Partial<AppSettings>;
  return {
    ...patch,
    hiddenServerIds: Array.isArray(patch.hiddenServerIds) ? patch.hiddenServerIds : [],
  };
}

function importWebBackupData(parsed: any, mode: "merge" | "replace", filePath: string) {
  const data = parsed?.data && typeof parsed.data === "object" ? parsed.data : parsed;
  if (!data || typeof data !== "object") throw new Error("invalid backup file");

  const importedServers = Array.isArray(data.servers)
    ? data.servers.map(createWebServer)
    : [];
  const importedAccounts = Array.isArray(data.accounts)
    ? data.accounts.map(normalizeWebAccount).filter((account: Account | null): account is Account => Boolean(account))
    : [];
  const settingsPatch = importedWebSettingsPatch(data.settings);
  const normalizedMode = mode === "replace" ? "replace" : "merge";

  if (normalizedMode === "replace") {
    webSettings = {
      ...WEB_DEFAULT_SETTINGS,
      ...settingsPatch,
      hiddenServerIds: Array.isArray(settingsPatch.hiddenServerIds)
        ? settingsPatch.hiddenServerIds
        : [],
    };
    webServers = importedServers;
    webAccounts = importedAccounts;
  } else {
    webSettings = {
      ...WEB_DEFAULT_SETTINGS,
      ...webSettings,
      ...settingsPatch,
      hiddenServerIds: Array.isArray(settingsPatch.hiddenServerIds)
        ? settingsPatch.hiddenServerIds
        : webSettings.hiddenServerIds,
    };
    webServers = mergeWebById(webServers, importedServers);
    webAccounts = mergeWebById(webAccounts, importedAccounts);
  }

  const activeAccountId = stringFrom(data.activeAccountId) ?? stringFrom(data.active_account_id);
  if (activeAccountId && webAccounts.some((account) => account.id === activeAccountId)) {
    webActiveAccountId = activeAccountId;
  } else if (!webAccounts.some((account) => account.id === webActiveAccountId)) {
    webActiveAccountId = webAccounts[0]?.id ?? null;
  }

  saveWebPreviewState();
  return {
    filePath,
    mode: normalizedMode,
    servers: importedServers.length,
    accounts: importedAccounts.length,
    shortcuts: 0,
  };
}

async function importWebBackup(mode: "merge" | "replace" = "merge") {
  const file = await pickWebBackupFile();
  if (!file) return null;
  const parsed = JSON.parse(await file.text());
  return importWebBackupData(parsed, mode, file.name);
}

function detectWebKind(payload: any): ServerKind {
  const lines = Array.isArray(payload?.lines) ? payload.lines : [];
  const haystack = [
    payload?.name,
    ...lines.flatMap((line: any) => [line?.name, line?.baseUrl]),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes("jellyfin") ? "jellyfin" : "emby";
}

function mergeWebServer(existing: Server, payload: any): Server {
  const next: Server = {
    ...existing,
    name: payload?.name ?? existing.name,
    kind: payload?.kind ?? existing.kind,
    defaultUserAgent:
      Object.prototype.hasOwnProperty.call(payload ?? {}, "defaultUserAgent")
        ? payload.defaultUserAgent ?? null
        : existing.defaultUserAgent,
    autoFailover: payload?.autoFailover ?? existing.autoFailover,
  };

  if (Array.isArray(payload?.lines)) {
    next.lines = payload.lines.map((line: any, index: number) => {
      const existingLine =
        existing.lines.find((item) => item.id === line?.id) ??
        existing.lines.find((item) => item.baseUrl === line?.baseUrl);
      return normalizeWebLine(line, index, existingLine);
    });
    next.activeLineId =
      payload.activeLineId ??
      next.lines.find((line) => line.id === existing.activeLineId)?.id ??
      next.lines[0]?.id ??
      null;
  }

  return next;
}

function emptyItemsResponse() {
  return { Items: [], TotalRecordCount: 0 };
}

function stringFrom(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function numberFrom(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolFrom(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return null;
}

function joinWebUrl(baseUrl: string, route: string): URL {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(route.replace(/^\/+/, ""), base);
}

function pickWebLine(server: Server, lineId?: string | null): Line {
  if (lineId) {
    const requested = server.lines.find((line) => line.id === lineId);
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

function webHeaders(server: Server, line: Line, token?: string | null, hasBody = false) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Emby-Authorization":
      'MediaBrowser Client="Hills Lite", Device="Web Preview", DeviceId="hills-lite-web-preview", Version="0.1.0"',
  };
  if (hasBody) headers["Content-Type"] = "application/json";
  if (token) {
    headers["X-Emby-Token"] = token;
    headers.Authorization = `MediaBrowser Token="${token}"`;
  }
  for (const [name, value] of line.headers ?? []) {
    if (name && value != null) headers[name] = String(value);
  }
  const userAgent = line.userAgent ?? server.defaultUserAgent ?? webSettings.defaultUserAgent;
  if (userAgent) headers["User-Agent"] = userAgent;
  return headers;
}

async function fetchViaWebPreviewProxy(
  url: URL,
  init: { method?: string; headers?: Record<string, string>; body?: string },
) {
  return fetch("/__hills_web_proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: url.toString(),
      method: init.method ?? "GET",
      headers: init.headers ?? {},
      body: init.body ?? null,
    }),
  });
}

function browserSafeHeaders(headers: Record<string, string>) {
  const next = { ...headers };
  delete next["User-Agent"];
  return next;
}

async function webJson(
  url: URL,
  init: { method?: string; headers?: Record<string, string>; body?: string },
  context: string,
) {
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: init.method ?? "GET",
      headers: browserSafeHeaders(init.headers ?? {}),
      body: init.body,
    });
  } catch {
    response = await fetchViaWebPreviewProxy(url, init);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${context}: HTTP ${response.status}${text ? ` - ${text.slice(0, 500)}` : ""}`);
  }

  const text = await response.text();
  if (!text.trim()) return null;
  return JSON.parse(text);
}

function detectKindFromSystemInfo(info: any): ServerKind {
  const text = [
    info?.ProductName,
    info?.Product,
    info?.ServerName,
    info?.OperatingSystemDisplayName,
  ]
    .join(" ")
    .toLowerCase();
  return text.includes("jellyfin") ? "jellyfin" : "emby";
}

async function detectWebServerReal(payload: any) {
  const server = createWebServer({
    ...payload,
    kind: "emby",
  });
  const lines = server.lines
    .filter((line) => line.enabled !== false)
    .sort((left, right) => left.priority - right.priority);
  if (lines.length === 0) throw new Error("no available line");

  const reports = [];
  for (const line of lines) {
    const started = performance.now();
    try {
      const info = await webJson(
        joinWebUrl(line.baseUrl, "System/Info/Public"),
        { method: "GET", headers: webHeaders(server, line) },
        "system_info_public",
      );
      const kind = detectKindFromSystemInfo(info);
      const normalized = {
        serverName: stringFrom(info?.ServerName) ?? stringFrom(info?.LocalAddress) ?? server.name,
        version: stringFrom(info?.Version),
        productName: stringFrom(info?.ProductName) ?? (kind === "jellyfin" ? "Jellyfin" : "Emby"),
      };
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
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new Error(reports.map((report) => `${report.lineName}: ${report.error}`).join("; "));
}

function normalizeUserData(value: any) {
  return {
    PlayedPercentage: numberFrom(value?.PlayedPercentage),
    PlaybackPositionTicks: numberFrom(value?.PlaybackPositionTicks),
    LastPlayedDate: stringFrom(value?.LastPlayedDate),
    Played: boolFrom(value?.Played) ?? false,
    IsFavorite: boolFrom(value?.IsFavorite) ?? false,
    PlayCount: numberFrom(value?.PlayCount) ?? 0,
  };
}

function normalizeMediaItem(value: any): MediaItem {
  return {
    Id: stringFrom(value?.Id) ?? "",
    Name: stringFrom(value?.Name) ?? "",
    Type: stringFrom(value?.Type),
    Overview: stringFrom(value?.Overview),
    ProductionYear: numberFrom(value?.ProductionYear),
    CommunityRating: numberFrom(value?.CommunityRating),
    OfficialRating: stringFrom(value?.OfficialRating),
    PrimaryImageAspectRatio: numberFrom(value?.PrimaryImageAspectRatio),
    Genres: Array.isArray(value?.Genres) ? value.Genres.map(stringFrom).filter(Boolean) : null,
    GenreItems: Array.isArray(value?.GenreItems) ? value.GenreItems : null,
    Studios: Array.isArray(value?.Studios) ? value.Studios : null,
    RunTimeTicks: numberFrom(value?.RunTimeTicks),
    SeriesName: stringFrom(value?.SeriesName),
    SeriesId: stringFrom(value?.SeriesId),
    SeasonId: stringFrom(value?.SeasonId),
    IndexNumber: numberFrom(value?.IndexNumber),
    ParentIndexNumber: numberFrom(value?.ParentIndexNumber),
    ImageTags: value?.ImageTags && typeof value.ImageTags === "object" ? value.ImageTags : null,
    BackdropImageTags: Array.isArray(value?.BackdropImageTags) ? value.BackdropImageTags : null,
    UserData: normalizeUserData(value?.UserData),
    People: Array.isArray(value?.People) ? value.People : null,
    ProviderIds: value?.ProviderIds && typeof value.ProviderIds === "object" ? value.ProviderIds : null,
  };
}

function normalizeItemsResponse(value: any): ItemsResponse {
  const rawItems = Array.isArray(value?.Items) ? value.Items : Array.isArray(value) ? value : [];
  const items = rawItems.map(normalizeMediaItem).filter((item: MediaItem) => item.Id && item.Name);
  return {
    Items: items,
    TotalRecordCount: numberFrom(value?.TotalRecordCount) ?? items.length,
  };
}

function webActivePair() {
  const account =
    webAccounts.find((item) => item.id === webActiveAccountId) ?? webAccounts[0] ?? null;
  if (!account) throw new Error("not logged in");
  const server = webServers.find((item) => item.id === account.serverId);
  if (!server) throw new Error(`server not found: ${account.serverId}`);
  return { server, account };
}

async function webAuthedJson(method: string, route: string, query?: Record<string, unknown>) {
  const { server, account } = webActivePair();
  const line = pickWebLine(server);
  const url = joinWebUrl(line.baseUrl, route);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }
  return webJson(
    url,
    { method, headers: webHeaders(server, line, account.accessToken) },
    route,
  );
}

function invokeWebFallback<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  switch (command) {
    case "get_settings":
      return Promise.resolve(getWebSettings() as T);
    case "update_settings":
      webSettings = { ...webSettings, ...((args?.patch as Partial<AppSettings>) ?? {}) };
      saveWebPreviewState();
      return Promise.resolve(getWebSettings() as T);
    case "list_servers":
      return Promise.resolve(clone(webServers) as T);
    case "detect_server": {
      const payload = args?.payload as any;
      return detectWebServerReal(payload) as Promise<T>;
    }
    case "add_server": {
      const server = createWebServer(args?.payload);
      webServers = [...webServers, server];
      saveWebPreviewState();
      return Promise.resolve(clone(server) as T);
    }
    case "update_server": {
      const payload = args?.payload as any;
      const index = webServers.findIndex((server) => server.id === payload?.id);
      if (index < 0) return Promise.reject(new Error(`server not found: ${payload?.id}`));
      const server = mergeWebServer(webServers[index]!, payload);
      webServers = webServers.map((item, itemIndex) => (itemIndex === index ? server : item));
      saveWebPreviewState();
      return Promise.resolve(clone(server) as T);
    }
    case "remove_server":
      webServers = webServers.filter((server) => server.id !== args?.id);
      webAccounts = webAccounts.filter((account) => account.serverId !== args?.id);
      if (!webAccounts.some((account) => account.id === webActiveAccountId)) {
        webActiveAccountId = webAccounts[0]?.id ?? null;
      }
      saveWebPreviewState();
      return Promise.resolve(undefined as T);
    case "set_active_line": {
      const payload = args?.payload as any;
      const server = webServers.find((item) => item.id === payload?.serverId);
      if (!server) return Promise.reject(new Error(`server not found: ${payload?.serverId}`));
      if (!server.lines.some((line) => line.id === payload?.lineId)) {
        return Promise.reject(new Error(`line not found: ${payload?.lineId}`));
      }
      server.activeLineId = payload.lineId;
      saveWebPreviewState();
      return Promise.resolve(clone(server) as T);
    }
    case "test_lines": {
      const server = webServers.find((item) => item.id === args?.serverId);
      if (!server) return Promise.reject(new Error(`server not found: ${args?.serverId}`));
      const checkedAt = new Date().toISOString();
      return (async () => {
        const reports: LineHealthReport[] = [];
        for (const line of server.lines) {
          if (!line.enabled) {
            reports.push({
              lineId: line.id,
              status: "unknown",
              latencyMs: null,
              httpStatus: null,
              error: "line disabled",
            });
            continue;
          }

          const started = performance.now();
          try {
            await webJson(
              joinWebUrl(line.baseUrl, "System/Info/Public"),
              { method: "GET", headers: webHeaders(server, line) },
              "test_lines",
            );
            const latencyMs = Math.round(performance.now() - started);
            reports.push({
              lineId: line.id,
              status: latencyMs > 1500 ? "slow" : "healthy",
              latencyMs,
              httpStatus: 200,
              error: null,
            });
          } catch (error) {
            reports.push({
              lineId: line.id,
              status: "down",
              latencyMs: null,
              httpStatus: null,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        server.lines = server.lines.map((line) => {
          const report = reports.find((item) => item.lineId === line.id);
          return {
            ...line,
            lastLatencyMs: report?.latencyMs ?? null,
            lastStatus: report?.status ?? "unknown",
            lastCheckedAt: checkedAt,
          };
        });
        webServers = webServers.map((item) => (item.id === server.id ? { ...server } : item));
        saveWebPreviewState();
        return { serverId: server.id, reports } as T;
      })();
    }
    case "login": {
      const payload = args?.payload as any;
      const server = webServers.find((item) => item.id === payload?.serverId);
      if (!server) return Promise.reject(new Error(`server not found: ${payload?.serverId}`));
      const username = String(payload?.username ?? "").trim();
      if (!username || !payload?.password) {
        return Promise.reject(new Error("请输入账号和密码"));
      }
      return (async () => {
        const enabledLines = server.lines
          .filter((line) => line.enabled !== false)
          .sort((left, right) => left.priority - right.priority);
        if (enabledLines.length === 0) throw new Error("no available line");

        const errors: string[] = [];
        for (const line of enabledLines) {
          try {
            const auth = await webJson(
              joinWebUrl(line.baseUrl, "Users/AuthenticateByName"),
              {
                method: "POST",
                headers: webHeaders(server, line, null, true),
                body: JSON.stringify({ Username: username, Pw: payload.password }),
              },
              "authenticate",
            );
            const now = new Date().toISOString();
            const account: Account = {
              id: createId("account"),
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
            server.activeLineId = line.id;
            webServers = webServers.map((item) => (item.id === server.id ? { ...server } : item));
            webAccounts = [
              account,
              ...webAccounts.filter(
                (item) => item.serverId !== server.id || item.username !== account.username,
              ),
            ];
            webActiveAccountId = account.id;
            saveWebPreviewState();
            return { account, winningLineId: line.id } as T;
          } catch (error) {
            errors.push(`${line.name}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        throw new Error(errors.join("; ") || "authentication failed");
      })();
    }
    case "list_accounts":
      return Promise.resolve(
        clone(
          [...webAccounts].sort((left, right) => {
            if (left.id === webActiveAccountId) return -1;
            if (right.id === webActiveAccountId) return 1;
            return Date.parse(right.lastUsedAt) - Date.parse(left.lastUsedAt);
          }),
        ) as T,
      );
    case "switch_account": {
      const account = webAccounts.find((item) => item.id === args?.accountId);
      if (!account) return Promise.reject(new Error(`account not found: ${args?.accountId}`));
      account.lastUsedAt = new Date().toISOString();
      webActiveAccountId = account.id;
      saveWebPreviewState();
      return Promise.resolve(clone(account) as T);
    }
    case "logout":
      webAccounts = webAccounts.filter((account) => account.id !== args?.accountId);
      if (webActiveAccountId === args?.accountId) {
        webActiveAccountId = webAccounts[0]?.id ?? null;
      }
      saveWebPreviewState();
      return Promise.resolve(undefined as T);
    case "list_downloads":
    case "list_notifications":
    case "list_danmaku_providers":
    case "list_remote_sessions":
    case "list_global_shortcuts":
      return Promise.resolve([] as T);
    case "unread_count":
      return Promise.resolve(0 as T);
    case "list_views":
      return webAuthedJson("GET", `Users/${webActivePair().account.userId}/Views`)
        .then(normalizeItemsResponse) as Promise<T>;
    case "resume_items":
      return webAuthedJson("GET", `Users/${webActivePair().account.userId}/Items/Resume`)
        .then(normalizeItemsResponse) as Promise<T>;
    case "list_items": {
      const payload = args?.payload as any;
      const query = Object.fromEntries((payload?.params as [string, string][] | undefined) ?? []);
      if (payload?.parentId) query.ParentId = payload.parentId;
      return webAuthedJson("GET", `Users/${webActivePair().account.userId}/Items`, query)
        .then(normalizeItemsResponse) as Promise<T>;
    }
    case "get_item_detail": {
      const pair = webActivePair();
      return webAuthedJson("GET", `Users/${pair.account.userId}/Items/${args?.itemId}`, {
        Fields:
          "Overview,Genres,GenreItems,Studios,People,ProviderIds,CommunityRating,OfficialRating,PrimaryImageAspectRatio,UserData,RunTimeTicks,SeriesInfo,ProductionYear",
      }).then(normalizeMediaItem) as Promise<T>;
    }
    case "search":
      return webAuthedJson("GET", `Users/${webActivePair().account.userId}/Items`, {
        SearchTerm: args?.term ?? "",
        Recursive: "true",
        Fields: "PrimaryImageAspectRatio,Overview,ProductionYear,UserData",
        Limit: "50",
      }).then(normalizeItemsResponse) as Promise<T>;
    case "list_seasons":
      return webAuthedJson("GET", `Shows/${args?.seriesId}/Seasons`, {
        UserId: webActivePair().account.userId,
      }).then(normalizeItemsResponse) as Promise<T>;
    case "list_episodes": {
      const payload = args?.payload as any;
      return webAuthedJson("GET", `Shows/${payload?.seriesId}/Episodes`, {
        UserId: webActivePair().account.userId,
        SeasonId: payload?.seasonId ?? null,
        Fields: "Overview,PrimaryImageAspectRatio,UserData,RunTimeTicks,SeriesInfo",
      }).then(normalizeItemsResponse) as Promise<T>;
    }
    case "similar_items":
      return webAuthedJson("GET", `Items/${args?.itemId}/Similar`, {
        UserId: webActivePair().account.userId,
        Limit: args?.limit ?? 18,
        Fields: "PrimaryImageAspectRatio,Overview,ProductionYear,UserData,SeriesInfo",
      }).then(normalizeItemsResponse) as Promise<T>;
    case "special_features":
      return webAuthedJson("GET", `Users/${webActivePair().account.userId}/Items/${args?.itemId}/SpecialFeatures`, {
        Limit: args?.limit ?? 18,
        Fields: "PrimaryImageAspectRatio,Overview,ProductionYear,UserData,SeriesInfo,RunTimeTicks",
      }).then(normalizeItemsResponse) as Promise<T>;
    case "list_subtitles":
      return Promise.resolve(null as T);
    case "search_online_subtitles":
      return Promise.resolve({ provider: "assrt", results: [] } as T);
    case "resolve_online_subtitle":
      return Promise.reject(new Error("Web preview does not support online subtitle loading"));
    case "play_file":
      return Promise.reject(
        new Error("Web Preview 不支持直接播放本地文件，请使用桌面版"),
      );
    case "list_local_folder":
      return Promise.resolve({
        directory: String((args?.payload as any)?.directory ?? ""),
        recursive: Boolean((args?.payload as any)?.recursive),
        truncated: false,
        items: [],
      } as T);
    case "import_danmaku_xml":
      return Promise.resolve({
        provider: "xml",
        episodeId: String((args?.payload as any)?.filePath ?? "web-preview"),
        comments: [],
      } as T);
    case "export_config": {
      const backup = webConfigBackup();
      const filePath = downloadWebBackup(backup);
      return Promise.resolve({
        filePath,
        servers: backup.data.servers.length,
        accounts: backup.data.accounts.length,
        shortcuts: backup.data.globalShortcuts.length,
      } as T);
    }
    case "import_config":
      return importWebBackup(((args?.payload as any)?.mode ?? "merge") as "merge" | "replace") as Promise<T>;
    case "open_external":
    case "open_path":
    case "show_mpv_stats_osd":
    case "set_secondary_subtitle_track":
      return Promise.resolve(undefined as T);
    default:
      return Promise.reject(new Error(`Web preview does not implement command: ${command}`));
  }
}

export async function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (window.hillsLite) {
    return window.hillsLite.invoke<T>(command, args);
  }

  if (!hasTauriRuntime()) {
    return invokeWebFallback<T>(command, args);
  }

  const tauri = await import("@tauri-apps/api/core");
  return tauri.invoke<T>(command, args);
}

export async function listen<T>(
  event: string,
  handler: (event: PlatformEvent<T>) => void,
): Promise<UnlistenFn> {
  if (window.hillsLite) {
    return window.hillsLite.listen(event, handler);
  }

  if (!hasTauriRuntime()) {
    return () => {};
  }

  const tauri = await import("@tauri-apps/api/event");
  return tauri.listen<T>(event, handler);
}

export async function openFileDialog(
  options?: OpenFileDialogOptions,
): Promise<string | string[] | null> {
  if (window.hillsLite) {
    return window.hillsLite.openFileDialog(options);
  }

  if (!hasTauriRuntime()) {
    return null;
  }

  const dialog = await import("@tauri-apps/plugin-dialog");
  return dialog.open(options);
}

export async function platformType(): Promise<string> {
  if (window.hillsLite) {
    return window.hillsLite.platformType();
  }

  if (!hasTauriRuntime()) {
    return "web";
  }

  const os = await import("@tauri-apps/plugin-os");
  return os.type();
}
