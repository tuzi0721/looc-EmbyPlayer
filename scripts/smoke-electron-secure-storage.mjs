import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RESULT_MARKER = "HILLS_ELECTRON_SECURE_STORAGE_RESULT=";
const PHASE_TIMEOUT_MS = Number(process.env.HILLS_SECURE_STORAGE_SMOKE_TIMEOUT_MS ?? 30_000);
const MAX_CAPTURED_OUTPUT = 1024 * 1024;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const secureModulePath = path.join(projectRoot, "electron", "backend", "secure-credentials.mjs");
const require = createRequire(import.meta.url);
const activeChildren = new Set();

async function electronRunnerMain() {
  const marker = "HILLS_ELECTRON_SECURE_STORAGE_RESULT=";

  function ensure(condition, message) {
    if (!condition) throw new Error(message);
  }

  function isPathInside(parentPath, childPath) {
    const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  }

  function errorDetails(error) {
    return {
      name: error instanceof Error ? error.name : "Error",
      code:
        error && typeof error === "object" && "code" in error && error.code != null
          ? String(error.code)
          : null,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  async function writeResult(value) {
    await new Promise((resolve, reject) => {
      process.stdout.write(`${marker}${JSON.stringify(value)}\n`, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async function readCredentialDocument(filePath, secret, options = {}) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      ensure(!raw.includes(secret), "credential file contains plaintext fixture");
      return { raw, document: JSON.parse(raw), missing: false };
    } catch (error) {
      if (options.allowMissing && error?.code === "ENOENT") {
        return { raw: null, document: null, missing: true };
      }
      throw error;
    }
  }

  function createStore(SecureCredentialStore, config, userDataDir, fileName) {
    ensure(
      typeof SecureCredentialStore === "function",
      "secure-credentials.mjs does not export SecureCredentialStore",
    );
    return new SecureCredentialStore(userDataDir, safeStorage, { fileName });
  }

  async function assertStoreAvailable(store) {
    ensure(typeof store.status === "function", "SecureCredentialStore.status is unavailable");
    const status = store.status();
    ensure(status?.available === true, `SecureCredentialStore unavailable: ${status?.reason ?? "unknown"}`);
    ensure(
      status.backend === "electron.safeStorage",
      `unexpected secure credential backend: ${status?.backend ?? "unknown"}`,
    );
    return status;
  }

  async function runSetPhase(SecureCredentialStore, config) {
    ensure(safeStorage.isEncryptionAvailable() === true, "safeStorage encryption is unavailable");
    const secretBytes = Buffer.from(config.secret, "utf8");
    const directCiphertext = safeStorage.encryptString(config.secret);
    ensure(Buffer.isBuffer(directCiphertext), "safeStorage.encryptString did not return a Buffer");
    ensure(directCiphertext.length > 0, "safeStorage.encryptString returned empty ciphertext");
    ensure(
      !directCiphertext.includes(secretBytes),
      "safeStorage ciphertext contains plaintext fixture bytes",
    );
    const directPlaintext = safeStorage.decryptString(directCiphertext);
    ensure(directPlaintext === config.secret, "safeStorage direct round-trip mismatch");

    const store = createStore(
      SecureCredentialStore,
      config,
      config.userDataDir,
      config.credentialFileName,
    );
    const status = await assertStoreAvailable(store);
    ensure(typeof store.set === "function", "SecureCredentialStore.set is unavailable");
    ensure(typeof store.get === "function", "SecureCredentialStore.get is unavailable");
    await store.set(config.credentialKey, config.secret);
    const immediateValue = await store.get(config.credentialKey);
    ensure(immediateValue === config.secret, "SecureCredentialStore immediate get mismatch");

    const credentialPath = path.join(config.userDataDir, config.credentialFileName);
    const persisted = await readCredentialDocument(credentialPath, config.secret);
    const entry = persisted.document?.entries?.[config.credentialKey];
    ensure(entry && typeof entry === "object", "persisted credential entry is missing");
    ensure(
      typeof entry.ciphertext === "string" && entry.ciphertext.length > 0,
      "persisted credential ciphertext is missing",
    );
    const persistedCiphertext = Buffer.from(entry.ciphertext, "base64");
    ensure(persistedCiphertext.length > 0, "persisted credential ciphertext is empty");
    ensure(
      !persistedCiphertext.includes(secretBytes),
      "persisted credential ciphertext contains plaintext fixture bytes",
    );
    ensure(
      safeStorage.decryptString(persistedCiphertext) === config.secret,
      "persisted ciphertext direct decrypt mismatch",
    );

    return {
      safeStorage: {
        available: true,
        directRoundTrip: true,
        ciphertextByteLength: directCiphertext.length,
        plaintextBytesAbsent: true,
      },
      secureCredentialStore: {
        backend: status.backend,
        set: true,
        immediateGet: true,
        diskPlaintextAbsent: true,
        persistedCiphertextDecrypts: true,
      },
      documentMetadata: {
        schema:
          typeof persisted.document?.schema === "string" ? persisted.document.schema : null,
        version: persisted.document?.version ?? null,
      },
    };
  }

  async function runGetPhase(SecureCredentialStore, config) {
    ensure(safeStorage.isEncryptionAvailable() === true, "safeStorage encryption is unavailable");
    const store = createStore(
      SecureCredentialStore,
      config,
      config.userDataDir,
      config.credentialFileName,
    );
    await assertStoreAvailable(store);
    ensure(typeof store.get === "function", "SecureCredentialStore.get is unavailable");
    const value = await store.get(config.credentialKey);
    ensure(value === config.secret, "credential did not survive Electron process restart");
    const persisted = await readCredentialDocument(
      path.join(config.userDataDir, config.credentialFileName),
      config.secret,
    );
    ensure(
      persisted.document?.entries?.[config.credentialKey],
      "credential entry disappeared after restart",
    );
    return {
      restartGet: true,
      diskPlaintextAbsent: true,
    };
  }

  async function runDeletePhase(SecureCredentialStore, config) {
    ensure(safeStorage.isEncryptionAvailable() === true, "safeStorage encryption is unavailable");
    const store = createStore(
      SecureCredentialStore,
      config,
      config.userDataDir,
      config.credentialFileName,
    );
    await assertStoreAvailable(store);
    ensure(typeof store.get === "function", "SecureCredentialStore.get is unavailable");
    ensure(typeof store.delete === "function", "SecureCredentialStore.delete is unavailable");
    const beforeDelete = await store.get(config.credentialKey);
    ensure(beforeDelete === config.secret, "credential was missing before delete");
    await store.delete(config.credentialKey);
    ensure((await store.get(config.credentialKey)) === null, "credential get was not null after delete");
    const persisted = await readCredentialDocument(
      path.join(config.userDataDir, config.credentialFileName),
      config.secret,
      { allowMissing: true },
    );
    ensure(
      persisted.missing ||
        !Object.prototype.hasOwnProperty.call(
          persisted.document?.entries ?? {},
          config.credentialKey,
        ),
      "credential entry remains on disk after delete",
    );
    return {
      delete: true,
      immediateDeleteVerified: true,
      diskEntryAbsent: true,
      diskPlaintextAbsent: true,
    };
  }

  async function runVerifyDeletedPhase(SecureCredentialStore, config) {
    ensure(safeStorage.isEncryptionAvailable() === true, "safeStorage encryption is unavailable");
    const store = createStore(
      SecureCredentialStore,
      config,
      config.userDataDir,
      config.credentialFileName,
    );
    await assertStoreAvailable(store);
    ensure(
      (await store.get(config.credentialKey)) === null,
      "deleted credential reappeared after Electron process restart",
    );
    return {
      restartDeleteVerified: true,
    };
  }

  async function runSchemaProbePhase(SecureCredentialStore, config) {
    ensure(safeStorage.isEncryptionAvailable() === true, "safeStorage encryption is unavailable");
    await fs.mkdir(config.schemaUserDataDir, { recursive: true });
    const validFileName = "schema-probe-valid.json";
    const validStore = createStore(
      SecureCredentialStore,
      config,
      config.schemaUserDataDir,
      validFileName,
    );
    await assertStoreAvailable(validStore);
    await validStore.set(config.schemaCredentialKey, config.secret);
    ensure(
      (await validStore.get(config.schemaCredentialKey)) === config.secret,
      "valid schema probe credential round-trip mismatch",
    );
    const validPath = path.join(config.schemaUserDataDir, validFileName);
    const valid = await readCredentialDocument(validPath, config.secret);
    const hasSchema = Object.prototype.hasOwnProperty.call(valid.document ?? {}, "schema");
    const hasVersion = Object.prototype.hasOwnProperty.call(valid.document ?? {}, "version");

    async function probeUnknownMetadata(kind, supportedByDocument) {
      if (!supportedByDocument) {
        return {
          status: "SKIP",
          rejected: false,
          reason: `persisted document has no ${kind} metadata`,
        };
      }
      const mutated = JSON.parse(JSON.stringify(valid.document));
      if (kind === "schema") {
        mutated.schema = `${String(valid.document.schema)}.unknown.${config.runId}`;
      } else {
        mutated.version =
          typeof valid.document.version === "number"
            ? valid.document.version + 1_000_000
            : `${String(valid.document.version)}.unknown.${config.runId}`;
      }
      const fileName = `schema-probe-unknown-${kind}.json`;
      const filePath = path.join(config.schemaUserDataDir, fileName);
      const raw = `${JSON.stringify(mutated, null, 2)}\n`;
      ensure(!raw.includes(config.secret), `unknown ${kind} fixture contains plaintext`);
      await fs.writeFile(filePath, raw, "utf8");
      const probeStore = createStore(
        SecureCredentialStore,
        config,
        config.schemaUserDataDir,
        fileName,
      );
      let value;
      try {
        if (typeof probeStore.load === "function") await probeStore.load();
        value = await probeStore.get(config.schemaCredentialKey);
      } catch (error) {
        return {
          status: "PASS",
          rejected: true,
          error: errorDetails(error),
        };
      }
      ensure(value === config.secret, `accepted unknown ${kind} returned an invalid value`);
      return {
        status: "SKIP",
        rejected: false,
        reason: `SecureCredentialStore currently accepts unknown ${kind}`,
      };
    }

    return {
      validDocumentRoundTrip: true,
      diskPlaintextAbsent: true,
      schema: await probeUnknownMetadata("schema", hasSchema),
      version: await probeUnknownMetadata("version", hasVersion),
    };
  }

  async function runPhase(SecureCredentialStore, config) {
    switch (config.phase) {
      case "set":
        return runSetPhase(SecureCredentialStore, config);
      case "get":
        return runGetPhase(SecureCredentialStore, config);
      case "delete":
        return runDeletePhase(SecureCredentialStore, config);
      case "verify-deleted":
        return runVerifyDeletedPhase(SecureCredentialStore, config);
      case "schema-probe":
        return runSchemaProbePhase(SecureCredentialStore, config);
      default:
        throw new Error(`unknown smoke phase: ${config.phase}`);
    }
  }

  let exitCode = 1;
  let phase = "bootstrap";
  try {
    const config = JSON.parse(process.env.HILLS_SECURE_STORAGE_SMOKE_CONFIG ?? "");
    phase = config.phase;
    ensure(process.platform === "win32", "this smoke requires Windows");
    ensure(config.secret && config.credentialKey, "smoke fixture is incomplete");
    for (const candidate of [
      config.appDataDir,
      config.userDataDir,
      config.sessionDataDir,
      config.crashDumpsDir,
      config.logsDir,
      config.schemaUserDataDir,
    ]) {
      ensure(isPathInside(config.workRoot, candidate), "runner path escaped the isolated temp root");
      mkdirSync(candidate, { recursive: true });
    }

    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch("disable-gpu");
    app.commandLine.appendSwitch("disable-software-rasterizer");
    app.setName(`HillsSecureStorageSmoke-${config.runId}`);
    app.setPath("appData", config.appDataDir);
    app.setPath("userData", config.userDataDir);
    app.setPath("sessionData", config.sessionDataDir);
    app.setPath("crashDumps", config.crashDumpsDir);
    app.setAppLogsPath(config.logsDir);

    await app.whenReady();
    ensure(
      path.resolve(app.getPath("userData")) === path.resolve(config.userDataDir),
      "Electron userData path is not isolated",
    );
    ensure(
      isPathInside(config.workRoot, app.getPath("userData")),
      "Electron userData path escaped the isolated temp root",
    );

    const secureModule = await import(config.secureModuleUrl);
    const result = await runPhase(secureModule.SecureCredentialStore, config);
    await writeResult({
      status: "PASS",
      phase,
      runtime: {
        platform: process.platform,
        arch: process.arch,
        windowsRelease: os.release(),
        electronVersion: process.versions.electron ?? null,
        chromeVersion: process.versions.chrome ?? null,
        nodeVersion: process.versions.node ?? null,
        pid: process.pid,
      },
      isolation: {
        userDataRedirected: true,
        userDataInsideTempRoot: true,
        browserWindowCreated: false,
      },
      result,
    });
    exitCode = 0;
  } catch (error) {
    await writeResult({
      status: "FAIL",
      phase,
      error: errorDetails(error),
    }).catch(() => {});
  } finally {
    app.exit(exitCode);
  }
}

function hashSource(source) {
  return createHash("sha256").update(source).digest("hex");
}

function isPathInside(parentPath, childPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function appendCaptured(current, chunk) {
  if (current.length >= MAX_CAPTURED_OUTPUT) return current;
  return `${current}${String(chunk)}`.slice(0, MAX_CAPTURED_OUTPUT);
}

function sanitizeText(value, secrets = []) {
  let text = String(value ?? "");
  for (const secret of secrets) {
    if (secret) text = text.split(secret).join("[REDACTED]");
  }
  return text;
}

function serializeError(error, secrets = []) {
  return {
    name: error instanceof Error ? error.name : "Error",
    code:
      error && typeof error === "object" && "code" in error && error.code != null
        ? String(error.code)
        : null,
    message: sanitizeText(error instanceof Error ? error.message : String(error), secrets),
  };
}

async function waitForExit(child, timeoutMs = 5_000) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("close", onClose);
      resolve(value);
    };
    const onClose = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("close", onClose);
  });
}

async function terminateChildTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32" && Number.isInteger(child.pid)) {
    const killer = spawn(
      "taskkill.exe",
      ["/PID", String(child.pid), "/T", "/F"],
      {
        stdio: "ignore",
        windowsHide: true,
        shell: false,
      },
    );
    activeChildren.add(killer);
    await waitForExit(killer, 5_000);
    activeChildren.delete(killer);
  } else {
    child.kill("SIGTERM");
  }
  if (!(await waitForExit(child, 5_000))) {
    child.kill("SIGKILL");
    await waitForExit(child, 2_000);
  }
}

function parseRunnerResult(stdout, phase) {
  const records = stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith(RESULT_MARKER))
    .map((line) => JSON.parse(line.slice(RESULT_MARKER.length)));
  if (records.length === 0) {
    throw new Error(`Electron phase ${phase} produced no machine-readable result`);
  }
  return records.at(-1);
}

async function runElectronPhase({
  electronExecutable,
  runnerPath,
  config,
  expectedSourceHash,
  secret,
}) {
  const currentSource = await fs.readFile(secureModulePath, "utf8");
  if (hashSource(currentSource) !== expectedSourceHash) {
    throw new Error("secure-credentials.mjs changed during smoke execution; rerun against a stable API");
  }

  const env = {
    ...process.env,
    HILLS_SECURE_STORAGE_SMOKE_CONFIG: JSON.stringify(config),
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(
    electronExecutable,
    ["--disable-gpu", "--disable-software-rasterizer", runnerPath],
    {
      cwd: config.workRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
    },
  );
  activeChildren.add(child);

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => {
    stdout = appendCaptured(stdout, chunk);
  });
  child.stderr?.on("data", (chunk) => {
    stderr = appendCaptured(stderr, chunk);
  });

  const exitPromise = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  let timeout;
  try {
    const exit = await Promise.race([
      exitPromise,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Electron phase ${config.phase} timed out`)),
          PHASE_TIMEOUT_MS,
        );
      }),
    ]);
    const record = parseRunnerResult(stdout, config.phase);
    if (exit.code !== 0 || record.status !== "PASS") {
      const diagnostics = {
        exit,
        record,
        stderr: sanitizeText(stderr.trim().slice(-4_000), [secret]),
      };
      throw new Error(
        `Electron phase ${config.phase} failed: ${sanitizeText(JSON.stringify(diagnostics), [
          secret,
        ])}`,
      );
    }
    if (record.phase !== config.phase) {
      throw new Error(`Electron phase mismatch: expected ${config.phase}, got ${record.phase}`);
    }
    return record;
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null && child.signalCode === null) {
      await terminateChildTree(child);
    }
    activeChildren.delete(child);
  }
}

async function removeTempRoot(tempRoot, workRoot) {
  const resolvedTempRoot = path.resolve(tempRoot);
  const resolvedWorkRoot = path.resolve(workRoot);
  if (!isPathInside(resolvedTempRoot, resolvedWorkRoot)) {
    throw new Error(`refusing to clean unexpected path: ${resolvedWorkRoot}`);
  }
  await fs.rm(resolvedWorkRoot, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 250,
  });
  try {
    await fs.access(resolvedWorkRoot);
    throw new Error("temporary smoke directory still exists after cleanup");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function main() {
  if (process.platform !== "win32") {
    throw new Error(`real Electron safeStorage smoke requires Windows, got ${process.platform}`);
  }
  if (!Number.isFinite(PHASE_TIMEOUT_MS) || PHASE_TIMEOUT_MS < 1_000) {
    throw new Error("HILLS_SECURE_STORAGE_SMOKE_TIMEOUT_MS must be at least 1000");
  }

  const secureSource = await fs.readFile(secureModulePath, "utf8");
  const secureSourceHash = hashSource(secureSource);
  if (!/\bexport\s+class\s+SecureCredentialStore\b/.test(secureSource)) {
    throw new Error("secure-credentials.mjs public API no longer exports SecureCredentialStore");
  }

  const electronExecutable = path.resolve(require("electron"));
  const expectedElectronRoot = path.join(projectRoot, "node_modules", "electron");
  if (!isPathInside(expectedElectronRoot, electronExecutable)) {
    throw new Error("resolved Electron executable is not the project-installed Electron");
  }
  await fs.access(electronExecutable);
  const electronPackage = JSON.parse(
    await fs.readFile(path.join(expectedElectronRoot, "package.json"), "utf8"),
  );

  const tempRoot = await fs.realpath(os.tmpdir());
  tempRootForCleanup = tempRoot;
  const workRoot = await fs.mkdtemp(path.join(tempRoot, "hills-electron-safe-storage-"));
  workRootForCleanup = workRoot;
  const runnerPath = path.join(workRoot, "runner.mjs");
  const userDataDir = path.join(workRoot, "user-data");
  const runId = randomUUID();
  const secret = `fixture-${randomBytes(32).toString("base64url")}`;
  fixtureSecret = secret;
  const commonConfig = {
    runId,
    workRoot,
    appDataDir: path.join(workRoot, "app-data"),
    userDataDir,
    sessionDataDir: path.join(workRoot, "session-data"),
    crashDumpsDir: path.join(workRoot, "crash-dumps"),
    logsDir: path.join(workRoot, "logs"),
    schemaUserDataDir: path.join(workRoot, "schema-user-data"),
    credentialFileName: "credentials.safe-storage-smoke.json",
    credentialKey: `smoke:${randomUUID()}`,
    schemaCredentialKey: `schema-smoke:${randomUUID()}`,
    secret,
    secureModuleUrl: pathToFileURL(secureModulePath).href,
  };
  const runnerSource = [
    'import { mkdirSync } from "node:fs";',
    'import fs from "node:fs/promises";',
    'import os from "node:os";',
    'import path from "node:path";',
    'import { app, safeStorage } from "electron";',
    "",
    `(${electronRunnerMain.toString()})();`,
    "",
  ].join("\n");
  if (runnerSource.includes("BrowserWindow")) {
    throw new Error("generated runner unexpectedly references BrowserWindow");
  }

  const phases = {};
  await fs.writeFile(runnerPath, runnerSource, { encoding: "utf8", mode: 0o600 });
  for (const phase of ["set", "get", "delete", "verify-deleted", "schema-probe"]) {
    phases[phase] = await runElectronPhase({
      electronExecutable,
      runnerPath,
      config: { ...commonConfig, phase },
      expectedSourceHash: secureSourceHash,
      secret,
    });
  }
  const finalSource = await fs.readFile(secureModulePath, "utf8");
  if (hashSource(finalSource) !== secureSourceHash) {
    throw new Error("secure-credentials.mjs changed before smoke completion; rerun required");
  }

  const runtimes = Object.values(phases).map((record) => record.runtime);
  if (runtimes.some((runtime) => runtime.platform !== "win32")) {
    throw new Error("one or more Electron phases did not run on Windows");
  }
  if (runtimes.some((runtime) => runtime.electronVersion !== electronPackage.version)) {
    throw new Error("Electron runtime version did not match the project-installed package");
  }

  return {
    status: "PASS",
    platform: "win32",
    windows: {
      release: phases.set.runtime.windowsRelease,
      arch: phases.set.runtime.arch,
    },
    electron: {
      version: phases.set.runtime.electronVersion,
      projectInstalled: true,
      processCount: runtimes.length,
      windowsHidden: true,
      browserWindowCreated: false,
    },
    fixture: {
      random: true,
      desensitized: true,
      realTokenUsed: false,
    },
    safeStorage: phases.set.result.safeStorage,
    secureCredentialStore: {
      set: phases.set.result.secureCredentialStore.set,
      immediateGet: phases.set.result.secureCredentialStore.immediateGet,
      restartGet: phases.get.result.restartGet,
      delete: phases.delete.result.delete,
      restartDeleteVerified: phases["verify-deleted"].result.restartDeleteVerified,
      diskPlaintextAbsent:
        phases.set.result.secureCredentialStore.diskPlaintextAbsent &&
        phases.get.result.diskPlaintextAbsent &&
        phases.delete.result.diskPlaintextAbsent &&
        phases["schema-probe"].result.diskPlaintextAbsent,
    },
    schemaValidation: {
      schema: phases["schema-probe"].result.schema,
      version: phases["schema-probe"].result.version,
    },
    isolation: {
      runnerCreatedInSystemTemp: isPathInside(tempRoot, runnerPath),
      userDataCreatedInSystemTemp: isPathInside(tempRoot, userDataDir),
      projectUserDataUsed: false,
      sourceHash: secureSourceHash,
    },
  };
}

let result;
let cleanupStatus = "PASS";
let workRootForCleanup = null;
let tempRootForCleanup = null;
let fixtureSecret = null;

try {
  result = await main();
} catch (error) {
  result = {
    status: "FAIL",
    platform: process.platform,
    error: serializeError(error, fixtureSecret ? [fixtureSecret] : []),
  };
} finally {
  for (const child of [...activeChildren]) {
    await terminateChildTree(child).catch(() => {});
    activeChildren.delete(child);
  }
  if (workRootForCleanup && tempRootForCleanup) {
    try {
      await removeTempRoot(tempRootForCleanup, workRootForCleanup);
    } catch (error) {
      cleanupStatus = "FAIL";
      result = {
        ...result,
        status: "FAIL",
        cleanupError: serializeError(error, fixtureSecret ? [fixtureSecret] : []),
      };
    }
  }
}

result.cleanup = cleanupStatus;
process.stdout.write(`${JSON.stringify(result)}\n`);
if (result.status !== "PASS") process.exitCode = 1;
