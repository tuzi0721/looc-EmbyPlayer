import { api, type SecureStorageStatus } from "@/api";
import { hasTauriRuntime } from "@/platform";

export const CLOUD_TOKEN_SECRET_KEY = "renderer:cloud:token";

export function webDavPasswordSecretKey(id: string): string {
  return `renderer:webdav:${encodeURIComponent(id)}:password`;
}

export function alistTokenSecretKey(id: string): string {
  return `renderer:alist:${encodeURIComponent(id)}:token`;
}

export function alistPathPasswordSecretKey(id: string): string {
  return `renderer:alist:${encodeURIComponent(id)}:path-password`;
}

export type SecureSecretSnapshot =
  | { status: "value"; value: string }
  | { status: "missing" };

export type SecureSecretReadResult =
  | SecureSecretSnapshot
  | { status: "local-only" }
  | { status: "unavailable"; reason: string | null }
  | { status: "read-error"; error: string };

export interface SecureSecretChange {
  key: string;
  value: string | null;
}

export type SecureSecretTransactionResult =
  | { status: "committed" }
  | { status: "local-only" }
  | { status: "unavailable"; reason: string | null }
  | { status: "read-error"; key: string; error: string }
  | {
      status: "write-error";
      key: string;
      error: string;
      rollbackErrors: string[];
    }
  | {
      status: "metadata-error";
      error: string;
      rollbackErrors: string[];
    };

let cachedAvailableStatus: SecureStorageStatus | null = null;
let statusPromise: Promise<SecureStorageStatus | null> | null = null;

function isElectronRenderer(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.hillsLite) &&
    !hasTauriRuntime()
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Clears only the successful availability cache. Failed/unavailable probes are
 * never retained, so a later operation can recover after a transient IPC or
 * secure-storage failure.
 */
export function invalidateRendererSecureStorageStatus(): void {
  cachedAvailableStatus = null;
}

export function getRendererSecureStorageStatus(): Promise<SecureStorageStatus | null> {
  if (!isElectronRenderer()) return Promise.resolve(null);
  if (cachedAvailableStatus) return Promise.resolve(cachedAvailableStatus);
  if (statusPromise) return statusPromise;

  const pending = api
    .getSecureStorageStatus()
    .then((status) => {
      if (status.available) cachedAvailableStatus = status;
      return status;
    })
    .catch(
      (error): SecureStorageStatus => ({
        available: false,
        backend: "unavailable",
        reason: errorMessage(error),
      }),
    )
    .finally(() => {
      if (statusPromise === pending) statusPromise = null;
    });
  statusPromise = pending;
  return pending;
}

export async function secureSecretsAvailable(): Promise<boolean> {
  return (await getRendererSecureStorageStatus())?.available === true;
}

/**
 * Reads never collapse failures into an empty value:
 * - `missing` means the secure backend was reached and the key does not exist.
 * - `read-error` means the backend was available but this read failed.
 * - `unavailable` means Electron secure storage could not currently be used.
 * - `local-only` means this runtime has no renderer secure-storage backend.
 */
export async function readSecureSecret(
  key: string,
): Promise<SecureSecretReadResult> {
  const status = await getRendererSecureStorageStatus();
  if (status === null) return { status: "local-only" };
  if (!status.available) {
    return { status: "unavailable", reason: status.reason ?? null };
  }

  try {
    const value = await api.getSecureSecret(key);
    return value === null ? { status: "missing" } : { status: "value", value };
  } catch (error) {
    invalidateRendererSecureStorageStatus();
    return { status: "read-error", error: errorMessage(error) };
  }
}

async function applySecureSecretValue(
  key: string,
  value: string | null,
): Promise<string | null> {
  try {
    if (value === null) {
      await api.deleteSecureSecret(key);
    } else {
      await api.setSecureSecret(key, value);
    }
    return null;
  } catch (error) {
    invalidateRendererSecureStorageStatus();
    return errorMessage(error);
  }
}

function snapshotValue(snapshot: SecureSecretSnapshot): string | null {
  return snapshot.status === "value" ? snapshot.value : null;
}

function changeMatchesSnapshot(
  change: SecureSecretChange,
  snapshot: SecureSecretSnapshot,
): boolean {
  return change.value === snapshotValue(snapshot);
}

async function restoreSnapshots(
  snapshots: Array<{ key: string; snapshot: SecureSecretSnapshot }>,
): Promise<string[]> {
  const rollbackErrors: string[] = [];
  for (const entry of [...snapshots].reverse()) {
    const rollbackError = await applySecureSecretValue(
      entry.key,
      snapshotValue(entry.snapshot),
    );
    if (rollbackError) {
      rollbackErrors.push(`${entry.key}: ${rollbackError}`);
    }
  }
  return rollbackErrors;
}

/**
 * Commits one or more secure-secret changes before synchronously/asynchronously
 * committing their localStorage metadata. Every secure key is snapshotted first.
 * Any write or metadata failure restores all keys in reverse order.
 */
export async function commitSecureSecretChanges(
  changes: readonly SecureSecretChange[],
  commitMetadata: () => void | Promise<void>,
): Promise<SecureSecretTransactionResult> {
  const seenKeys = new Set<string>();
  for (const change of changes) {
    if (seenKeys.has(change.key)) {
      throw new Error(`duplicate secure-secret transaction key: ${change.key}`);
    }
    seenKeys.add(change.key);
  }

  const snapshots: Array<{ key: string; snapshot: SecureSecretSnapshot }> = [];
  for (const change of changes) {
    const result = await readSecureSecret(change.key);
    if (result.status === "value" || result.status === "missing") {
      snapshots.push({ key: change.key, snapshot: result });
      continue;
    }
    if (result.status === "read-error") {
      return {
        status: "read-error",
        key: change.key,
        error: result.error,
      };
    }
    return result;
  }

  const changedSnapshots: Array<{
    key: string;
    snapshot: SecureSecretSnapshot;
  }> = [];
  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index]!;
    const snapshot = snapshots[index]!;
    if (changeMatchesSnapshot(change, snapshot.snapshot)) continue;

    const writeError = await applySecureSecretValue(change.key, change.value);
    changedSnapshots.push(snapshot);
    if (writeError) {
      return {
        status: "write-error",
        key: change.key,
        error: writeError,
        rollbackErrors: await restoreSnapshots(changedSnapshots),
      };
    }
  }

  try {
    await commitMetadata();
  } catch (error) {
    return {
      status: "metadata-error",
      error: errorMessage(error),
      rollbackErrors: await restoreSnapshots(changedSnapshots),
    };
  }
  return { status: "committed" };
}

export function secureSecretTransactionError(
  operation: string,
  result: Exclude<SecureSecretTransactionResult, { status: "committed" }>,
): Error {
  let detail: string;
  switch (result.status) {
    case "local-only":
      detail = "当前运行时不支持安全凭据存储";
      break;
    case "unavailable":
      detail = result.reason
        ? `安全凭据存储暂不可用：${result.reason}`
        : "安全凭据存储暂不可用";
      break;
    case "read-error":
      detail = `读取 ${result.key} 失败：${result.error}`;
      break;
    case "write-error":
      detail = `写入 ${result.key} 失败：${result.error}`;
      break;
    case "metadata-error":
      detail = `更新本地元数据失败：${result.error}`;
      break;
  }

  const rollbackErrors =
    "rollbackErrors" in result ? result.rollbackErrors : [];
  if (rollbackErrors.length > 0) {
    detail += `；补偿回滚失败：${rollbackErrors.join("；")}`;
  }
  return new Error(`${operation}未完成。${detail}`);
}