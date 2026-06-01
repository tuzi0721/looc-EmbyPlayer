import fs from "node:fs";

const timeoutMs = Number(process.env.HILLS_REAL_TIMEOUT_MS ?? "15000");

function readInput() {
  const envValues = [
    process.env.HILLS_REAL_LINE1,
    process.env.HILLS_REAL_LINE2,
    process.env.HILLS_REAL_USERNAME,
    process.env.HILLS_REAL_PASSWORD,
  ];
  if (envValues.every((value) => typeof value === "string" && value.length > 0)) {
    return envValues;
  }

  const values = fs.readFileSync(0, "utf8").split(/\r?\n/).map((line) => line.trim());
  return [values[0], values[1], values[2], values[3]];
}

function joinUrl(baseUrl, path) {
  return new URL(path.replace(/^\/+/, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function timeoutSignal() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

function responseSummary(response) {
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
  };
}

async function fetchJson(url, options = {}) {
  const timeout = timeoutSignal();
  try {
    const response = await fetch(url, { ...options, signal: timeout.signal });
    const summary = responseSummary(response);
    if (!response.ok) return { response, summary, value: null };
    return { response, summary, value: await response.json() };
  } finally {
    timeout.done();
  }
}

function detectKind(info) {
  return String(info?.ProductName ?? "").toLowerCase().includes("jellyfin") ? "jellyfin" : "emby";
}

async function checkLine(label, baseUrl, username, password) {
  const report = {
    label,
    public: null,
    auth: null,
    views: null,
    kind: null,
    versionPresent: false,
    serverNamePresent: false,
    viewCount: null,
    error: null,
  };

  try {
    const publicResult = await fetchJson(joinUrl(baseUrl, "System/Info/Public"), {
      headers: {
        Accept: "application/json",
        "User-Agent": "Hills Lite Real Check",
      },
    });
    report.public = publicResult.summary;
    if (!publicResult.response.ok) return report;

    report.kind = detectKind(publicResult.value);
    report.versionPresent = Boolean(publicResult.value?.Version);
    report.serverNamePresent = Boolean(publicResult.value?.ServerName);

    const authHeader =
      'MediaBrowser Client="Hills Lite Real Check", Device="Codex Smoke", DeviceId="hills-lite-real-check", Version="0.1.0"';
    const authResult = await fetchJson(joinUrl(baseUrl, "Users/AuthenticateByName"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Hills Lite Real Check",
        "X-Emby-Authorization": authHeader,
      },
      body: JSON.stringify({ Username: username, Pw: password }),
    });
    report.auth = authResult.summary;
    if (!authResult.response.ok) return report;

    const userId = authResult.value?.User?.Id;
    const token = authResult.value?.AccessToken;
    if (!userId || !token) {
      report.error = "auth missing user/token";
      return report;
    }

    const viewsResult = await fetchJson(joinUrl(baseUrl, `Users/${userId}/Views`), {
      headers: {
        Accept: "application/json",
        "User-Agent": "Hills Lite Real Check",
        "X-Emby-Token": token,
      },
    });
    report.views = viewsResult.summary;
    if (viewsResult.response.ok) {
      report.viewCount = Array.isArray(viewsResult.value?.Items) ? viewsResult.value.Items.length : null;
    }
    return report;
  } catch (error) {
    report.error = error?.name === "AbortError" ? "timeout" : String(error?.message ?? error);
    return report;
  }
}

const [line1, line2, username, password] = readInput();
if (!line1 || !line2 || !username || !password) {
  throw new Error("Provide line1, line2, username, password via stdin or HILLS_REAL_* env vars.");
}

const reports = [];
reports.push(await checkLine("line1", line1, username, password));
reports.push(await checkLine("line2", line2, username, password));
console.log(JSON.stringify(reports, null, 2));
