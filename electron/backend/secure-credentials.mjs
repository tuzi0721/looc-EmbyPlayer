import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const SCHEMA = "hills-lite-secure-credentials";
const VERSION = 1;
const MAX_KEY_LENGTH = 512;
const MAX_SECRET_LENGTH = 1024 * 1024;
const MAX_CIPHERTEXT_LENGTH = MAX_SECRET_LENGTH * 2 + 8192;

function codedError(message, code, cause = undefined) {
  const error = new Error(message);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeKey(value) {
  if (typeof value !== "string") throw new TypeError("credential key must be a string");
  const key = value.trim();
  if (!key || key.length > MAX_KEY_LENGTH || /[\0\r\n]/.test(key)) {
    throw new Error("invalid credential key");
  }
  return key;
}

function normalizeSecret(value) {
  if (typeof value !== "string") throw new TypeError("credential value must be a string");
  if (value.length > MAX_SECRET_LENGTH) throw new Error("credential value is too large");
  return value;
}

function normalizeCiphertext(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_CIPHERTEXT_LENGTH ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw codedError(
      "credential document contains invalid ciphertext",
      "SECURE_STORAGE_INVALID_DOCUMENT",
    );
  }
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.length === 0 ||
    decoded.toString("base64").replace(/=+$/u, "") !== value.replace(/=+$/u, "")
  ) {
    throw codedError(
      "credential document contains invalid ciphertext",
      "SECURE_STORAGE_INVALID_DOCUMENT",
    );
  }
  return value;
}

function normalizeUpdatedAt(value, fieldName = "updatedAt") {
  if (value == null) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw codedError(
      `credential document contains invalid ${fieldName}`,
      "SECURE_STORAGE_INVALID_DOCUMENT",
    );
  }
  return value;
}

function normalizeDocument(value) {
  if (!isRecord(value)) {
    throw codedError("invalid credential document", "SECURE_STORAGE_INVALID_DOCUMENT");
  }
  if (value.schema !== SCHEMA) {
    throw codedError(
      "unsupported credential document schema",
      "SECURE_STORAGE_INVALID_SCHEMA",
    );
  }
  if (!Number.isInteger(value.version)) {
    throw codedError(
      "credential document version is missing or invalid",
      "SECURE_STORAGE_INVALID_DOCUMENT",
    );
  }
  if (value.version !== VERSION) {
    throw codedError(
      `unsupported credential document version: ${value.version}`,
      "SECURE_STORAGE_UNSUPPORTED_VERSION",
    );
  }
  if (!isRecord(value.entries)) {
    throw codedError(
      "credential document entries must be an object",
      "SECURE_STORAGE_INVALID_DOCUMENT",
    );
  }
  normalizeUpdatedAt(value.updatedAt, "updatedAt");

  const entries = {};
  for (const [rawKey, entry] of Object.entries(value.entries)) {
    const key = normalizeKey(rawKey);
    if (key !== rawKey || !isRecord(entry)) {
      throw codedError(
        "credential document contains an invalid entry",
        "SECURE_STORAGE_INVALID_DOCUMENT",
      );
    }
    entries[key] = {
      ciphertext: normalizeCiphertext(entry.ciphertext),
      updatedAt: normalizeUpdatedAt(entry.updatedAt, `entries.${key}.updatedAt`),
    };
  }
  return { entries };
}

function cloneEntries(entries) {
  return Object.fromEntries(
    Object.entries(entries).map(([key, entry]) => [key, { ...entry }]),
  );
}

function normalizeSetEntries(values) {
  if (values == null) return [];
  const rawEntries =
    values instanceof Map
      ? [...values.entries()]
      : Array.isArray(values)
        ? values
        : isRecord(values)
          ? Object.entries(values)
          : null;
  if (!rawEntries) throw new TypeError("credential set entries must be an object, Map, or array");

  const entries = [];
  for (const item of rawEntries) {
    if (!Array.isArray(item) || item.length < 2) {
      throw new TypeError("credential set entry must be a [key, value] pair");
    }
    const key = normalizeKey(item[0]);
    const value = normalizeSecret(item[1]);
    entries.push([key, value]);
  }
  return entries;
}

function normalizeDeleteKeys(values) {
  if (values == null) return [];
  if (!Array.isArray(values) && !(values instanceof Set)) {
    throw new TypeError("credential delete keys must be an array or Set");
  }
  return [...values].map(normalizeKey);
}

export function embyAccessTokenCredentialKey(accountId) {
  const id = normalizeKey(String(accountId ?? ""));
  return `emby:account:${encodeURIComponent(id)}:access-token`;
}

export function downloadTransportCredentialKey(downloadId) {
  const id = normalizeKey(String(downloadId ?? ""));
  return `download:${encodeURIComponent(id)}:transport`;
}

export function serverLineHeadersCredentialKey(serverId, lineId) {
  const server = normalizeKey(String(serverId ?? ""));
  const line = normalizeKey(String(lineId ?? ""));
  return `server:${encodeURIComponent(server)}:line:${encodeURIComponent(line)}:headers`;
}

export class SecureCredentialStore {
  constructor(userDataDir, encryptionProvider, options = {}) {
    this.filePath = path.join(userDataDir, options.fileName ?? "credentials.v1.json");
    this.encryptionProvider = encryptionProvider ?? null;
    this.entries = {};
    this.loaded = false;
    this.loadPromise = null;
    this.operationChain = Promise.resolve();
  }

  status() {
    if (!this.encryptionProvider) {
      return {
        available: false,
        backend: "unavailable",
        degraded: true,
        reason: "encryption provider missing",
      };
    }
    try {
      const available = this.encryptionProvider.isEncryptionAvailable() === true;
      return {
        available,
        backend: available ? "electron.safeStorage" : "unavailable",
        degraded: !available,
        reason: available ? null : "OS encryption is not available",
      };
    } catch (error) {
      return {
        available: false,
        backend: "unavailable",
        degraded: true,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  requireAvailable() {
    const status = this.status();
    if (!status.available) {
      throw codedError(
        status.reason || "secure credential storage is unavailable",
        "SECURE_STORAGE_UNAVAILABLE",
      );
    }
  }

  _enqueue(operation) {
    const result = this.operationChain.then(operation, operation);
    this.operationChain = result.catch(() => {});
    return result;
  }

  async load() {
    if (this.loaded) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      try {
        const raw = await fs.readFile(this.filePath, "utf8");
        const parsed = JSON.parse(raw);
        this.entries = normalizeDocument(parsed).entries;
      } catch (error) {
        if (error?.code !== "ENOENT") {
          if (error instanceof SyntaxError) {
            throw codedError(
              "credential document is not valid JSON",
              "SECURE_STORAGE_INVALID_DOCUMENT",
              error,
            );
          }
          throw error;
        }
        this.entries = {};
      }
      this.loaded = true;
    })();
    try {
      await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }

  _decryptEntry(key, entry) {
    this.requireAvailable();
    try {
      const encrypted = Buffer.from(entry.ciphertext, "base64");
      return this.encryptionProvider.decryptString(encrypted);
    } catch (error) {
      throw codedError(
        `failed to decrypt credential: ${key}`,
        "SECURE_STORAGE_DECRYPT_FAILED",
        error,
      );
    }
  }

  async get(rawKey) {
    const key = normalizeKey(rawKey);
    return this._enqueue(async () => {
      await this.load();
      const entry = this.entries[key];
      return entry ? this._decryptEntry(key, entry) : null;
    });
  }

  async getMany(rawKeys) {
    const keys = [...rawKeys].map(normalizeKey);
    return this._enqueue(async () => {
      await this.load();
      const values = new Map();
      for (const key of keys) {
        const entry = this.entries[key];
        values.set(key, entry ? this._decryptEntry(key, entry) : null);
      }
      return values;
    });
  }

  _encryptEntry(key, value) {
    this.requireAvailable();
    try {
      const encrypted = Buffer.from(this.encryptionProvider.encryptString(value));
      if (encrypted.length === 0) throw new Error("encryption provider returned empty ciphertext");
      const verified = this.encryptionProvider.decryptString(encrypted);
      if (verified !== value) throw new Error("credential verification mismatch");
      return {
        ciphertext: encrypted.toString("base64"),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error?.code === "SECURE_STORAGE_UNAVAILABLE") throw error;
      throw codedError(
        `failed to encrypt credential: ${key}`,
        "SECURE_STORAGE_ENCRYPT_FAILED",
        error,
      );
    }
  }

  async _persistEntries(entries) {
    const body = `${JSON.stringify(
      {
        schema: SCHEMA,
        version: VERSION,
        updatedAt: new Date().toISOString(),
        entries,
      },
      null,
      2,
    )}\n`;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tempPath, body, { encoding: "utf8", mode: 0o600 });
      await fs.rename(tempPath, this.filePath);
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => {});
      throw error;
    }
  }

  async transact(changes = {}, commit = async () => undefined) {
    const setEntries = normalizeSetEntries(changes.set);
    const deleteKeys = normalizeDeleteKeys(changes.delete);
    if (typeof commit !== "function") {
      throw new TypeError("credential transaction commit must be a function");
    }

    return this._enqueue(async () => {
      await this.load();
      const previousEntries = cloneEntries(this.entries);
      const nextEntries = cloneEntries(this.entries);
      let changed = false;

      for (const key of deleteKeys) {
        if (Object.prototype.hasOwnProperty.call(nextEntries, key)) {
          delete nextEntries[key];
          changed = true;
        }
      }
      for (const [key, value] of setEntries) {
        if (value === "") {
          if (Object.prototype.hasOwnProperty.call(nextEntries, key)) {
            delete nextEntries[key];
            changed = true;
          }
          continue;
        }
        nextEntries[key] = this._encryptEntry(key, value);
        changed = true;
      }

      if (changed) {
        try {
          await this._persistEntries(nextEntries);
        } catch (error) {
          throw codedError(
            "failed to persist secure credentials",
            "SECURE_STORAGE_WRITE_FAILED",
            error,
          );
        }
        this.entries = nextEntries;
      }

      try {
        return await commit();
      } catch (error) {
        if (changed) {
          try {
            await this._persistEntries(previousEntries);
            this.entries = previousEntries;
          } catch (rollbackError) {
            const wrapped = codedError(
              "secure credential transaction rollback failed",
              "SECURE_STORAGE_ROLLBACK_FAILED",
              error,
            );
            wrapped.rollbackError = rollbackError;
            throw wrapped;
          }
        }
        throw error;
      }
    });
  }

  async set(rawKey, value) {
    const key = normalizeKey(rawKey);
    if (value == null || value === "") return this.delete(key);
    return this.transact({ set: [[key, value]] });
  }

  async setMany(values) {
    return this.transact({ set: values });
  }

  async delete(rawKey) {
    const key = normalizeKey(rawKey);
    return this.transact({ delete: [key] });
  }

  async deleteMany(keys) {
    return this.transact({ delete: [...keys] });
  }

  async save() {
    return this._enqueue(async () => {
      await this.load();
      await this._persistEntries(cloneEntries(this.entries));
    });
  }
}