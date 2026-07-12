import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import {
  SecureCredentialStore,
  downloadTransportCredentialKey,
  embyAccessTokenCredentialKey,
  serverLineHeadersCredentialKey,
} from "../electron/backend/secure-credentials.mjs";
import { JsonStore } from "../electron/backend/store.mjs";

class FakeEncryptionProvider {
  constructor(available = true) {
    this.available = available;
  }

  isEncryptionAvailable() {
    return this.available;
  }

  encryptString(value) {
    if (!this.available) throw new Error("encryption unavailable");
    return Buffer.from(`fake-dpapi:${Buffer.from(value, "utf8").toString("base64")}`, "utf8");
  }

  decryptString(value) {
    if (!this.available) throw new Error("encryption unavailable");
    const encoded = Buffer.from(value).toString("utf8");
    if (!encoded.startsWith("fake-dpapi:")) throw new Error("invalid ciphertext");
    return Buffer.from(encoded.slice("fake-dpapi:".length), "base64").toString("utf8");
  }
}

function stateFixture() {
  const now = "2026-07-12T00:00:00.000Z";
  return {
    settings: {},
    servers: [
      {
        id: "server-1",
        name: "Fixture",
        kind: "emby",
        activeLineId: "line-1",
        autoFailover: true,
        createdAt: now,
        lines: [
          {
            id: "line-1",
            name: "Primary",
            baseUrl: "https://media.example.test/emby?api_key=url-query-secret",
            headers: [
              ["Authorization", "Bearer header-secret"],
              ["X-Display-Only", "safe-value"],
            ],
            priority: 0,
            enabled: true,
          },
        ],
      },
    ],
    accounts: [
      {
        id: "account-1",
        serverId: "server-1",
        userId: "user-1",
        username: "fixture-user",
        accessToken: "emby-account-secret",
        createdAt: now,
        lastUsedAt: now,
      },
    ],
    activeAccountId: "account-1",
    notifications: [],
    downloads: [
      {
        id: "download-1",
        serverId: "server-1",
        accountId: "account-1",
        itemId: "item-1",
        mediaSourceId: "source-1",
        playSessionId: "session-1",
        title: "Fixture download",
        filePath: "C:\\Temp\\fixture.mkv",
        streamUrl: "https://media.example.test/Videos/item-1/stream?api_key=download-url-secret",
        container: "mkv",
        downloadedBytes: 128,
        status: "paused",
        createdAt: now,
        updatedAt: now,
        headers: [["X-Emby-Token", "download-header-secret"]],
        userAgent: "Fixture/1.0",
      },
    ],
    globalShortcuts: [],
  };
}

async function assertProtectedMigration(root) {
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, "state.json"),
    `${JSON.stringify(stateFixture(), null, 2)}\n`,
    "utf8",
  );

  const credentials = new SecureCredentialStore(root, new FakeEncryptionProvider());
  const store = new JsonStore(root, { credentialStore: credentials });
  await store.load();

  const diskState = await fs.readFile(path.join(root, "state.json"), "utf8");
  for (const secret of [
    "emby-account-secret",
    "header-secret",
    "download-url-secret",
    "download-header-secret",
  ]) {
    assert.equal(diskState.includes(secret), false, `state.json leaked ${secret}`);
  }
  assert.match(diskState, /"headersProtected": true/);
  assert.match(diskState, /"transportProtected": true/);

  const diskCredentials = await fs.readFile(path.join(root, "credentials.v1.json"), "utf8");
  for (const secret of [
    "emby-account-secret",
    "header-secret",
    "download-url-secret",
    "download-header-secret",
  ]) {
    assert.equal(diskCredentials.includes(secret), false, `credential file leaked ${secret}`);
  }

  const [account] = await store.listAccounts();
  assert.equal(account?.accessToken, "emby-account-secret");
  const [server] = await store.listServers();
  assert.deepEqual(server?.lines?.[0]?.headers, [
    ["Authorization", "Bearer header-secret"],
    ["X-Display-Only", "safe-value"],
  ]);
  const [download] = await store.listDownloads();
  assert.equal(download?.streamUrl.includes("download-url-secret"), true);
  assert.deepEqual(download?.headers, [["X-Emby-Token", "download-header-secret"]]);

  const backup = await store.exportBackup();
  const backupText = JSON.stringify(backup);
  assert.equal(backup.version, 2);
  assert.equal(backup.security?.credentials, "omitted");
  assert.equal(Object.prototype.hasOwnProperty.call(backup.data, "accounts"), false);
  for (const secret of [
    "emby-account-secret",
    "header-secret",
    "download-url-secret",
    "download-header-secret",
    "url-query-secret",
  ]) {
    assert.equal(backupText.includes(secret), false, `backup leaked ${secret}`);
  }

  await store.importBackup(backup, { mode: "merge" });
  const [serverAfterSafeImport] = await store.listServers();
  assert.equal(
    serverAfterSafeImport?.lines?.[0]?.baseUrl.includes("url-query-secret"),
    true,
    "safe backup import should preserve an existing sensitive URL query",
  );
  assert.deepEqual(serverAfterSafeImport?.lines?.[0]?.headers, [
    ["Authorization", "Bearer header-secret"],
    ["X-Display-Only", "safe-value"],
  ]);

  await store.removeDownload("download-1");
  await store.removeAccount("account-1");
  await store.removeServer("server-1");
  assert.equal(await credentials.get(downloadTransportCredentialKey("download-1")), null);
  assert.equal(await credentials.get(embyAccessTokenCredentialKey("account-1")), null);
  assert.equal(await credentials.get(serverLineHeadersCredentialKey("server-1", "line-1")), null);
}

async function assertUnavailableFallback(root) {
  await fs.mkdir(root, { recursive: true });
  const fixture = stateFixture();
  fixture.downloads = [];
  fixture.servers[0].lines[0].headers = [];
  await fs.writeFile(
    path.join(root, "state.json"),
    `${JSON.stringify(fixture, null, 2)}\n`,
    "utf8",
  );
  const credentials = new SecureCredentialStore(root, new FakeEncryptionProvider(false), {
    fileName: "credentials-unavailable.json",
  });
  const store = new JsonStore(root, { credentialStore: credentials });
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await store.load();
  } finally {
    console.warn = originalWarn;
  }
  const [account] = await store.listAccounts();
  assert.equal(account?.accessToken, "emby-account-secret");
  const diskState = await fs.readFile(path.join(root, "state.json"), "utf8");
  assert.equal(diskState.includes("emby-account-secret"), true);
}

async function loadRendererSecureSecrets(apiMock) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const source = await fs.readFile(
    path.join(scriptDir, "..", "src", "services", "secureSecrets.ts"),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: "secureSecrets.ts",
  }).outputText;
  const module = { exports: {} };
  const requireMock = (specifier) => {
    if (specifier === "@/api") return { api: apiMock };
    if (specifier === "@/platform") return { hasTauriRuntime: () => false };
    throw new Error(`unexpected renderer check import: ${specifier}`);
  };
  const factory = new Function("require", "module", "exports", compiled);
  factory(requireMock, module, module.exports);
  return module.exports;
}

async function assertRendererSecureTransactions() {
  let statusCalls = 0;
  const secrets = new Map([
    ["transaction:a", "old-a"],
    ["transaction:b", "old-b"],
  ]);
  const apiMock = {
    async getSecureStorageStatus() {
      statusCalls += 1;
      if (statusCalls === 1) throw new Error("temporary status IPC failure");
      return { available: true, backend: "fake" };
    },
    async getSecureSecret(key) {
      if (key === "read:error") throw new Error("temporary read failure");
      return secrets.has(key) ? secrets.get(key) : null;
    },
    async setSecureSecret(key, value) {
      if (key === "transaction:b" && value === "new-b") {
        throw new Error("second write failed");
      }
      secrets.set(key, value);
    },
    async deleteSecureSecret(key) {
      secrets.delete(key);
    },
  };

  const previousWindow = globalThis.window;
  globalThis.window = { hillsLite: {} };
  try {
    const secure = await loadRendererSecureSecrets(apiMock);
    const firstStatus = await secure.getRendererSecureStorageStatus();
    assert.equal(firstStatus.available, false);
    const recoveredStatus = await secure.getRendererSecureStorageStatus();
    assert.equal(recoveredStatus.available, true);
    assert.equal(statusCalls, 2, "unavailable secure-storage status must not be cached");

    assert.deepEqual(await secure.readSecureSecret("read:missing"), { status: "missing" });
    assert.deepEqual(await secure.readSecureSecret("read:error"), {
      status: "read-error",
      error: "temporary read failure",
    });

    const metadataFailure = await secure.commitSecureSecretChanges(
      [{ key: "transaction:a", value: "new-a" }],
      () => {
        throw new Error("localStorage write failed");
      },
    );
    assert.equal(metadataFailure.status, "metadata-error");
    assert.equal(secrets.get("transaction:a"), "old-a");
    assert.deepEqual(metadataFailure.rollbackErrors, []);

    const secondWriteFailure = await secure.commitSecureSecretChanges(
      [
        { key: "transaction:a", value: "new-a" },
        { key: "transaction:b", value: "new-b" },
      ],
      () => {},
    );
    assert.equal(secondWriteFailure.status, "write-error");
    assert.equal(secrets.get("transaction:a"), "old-a");
    assert.equal(secrets.get("transaction:b"), "old-b");
    assert.deepEqual(secondWriteFailure.rollbackErrors, []);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

await assertRendererSecureTransactions();

const tempRoot = await fs.realpath(os.tmpdir());
const workRoot = await fs.mkdtemp(path.join(tempRoot, "hills-secure-check-"));
try {
  await assertProtectedMigration(path.join(workRoot, "protected"));
  await fs.mkdir(path.join(workRoot, "fallback"), { recursive: true });
  await assertUnavailableFallback(path.join(workRoot, "fallback"));
  console.log("Secure credential checks passed: renderer retry/rollback, migration, hydration, redacted backup, cleanup, fallback.");
} finally {
  const resolved = path.resolve(workRoot);
  const allowedPrefix = `${path.resolve(tempRoot)}${path.sep}`;
  if (!resolved.startsWith(allowedPrefix)) {
    throw new Error(`refusing to clean unexpected path: ${resolved}`);
  }
  await fs.rm(resolved, { recursive: true, force: true });
}