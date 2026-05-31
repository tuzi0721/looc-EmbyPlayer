import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const TERMINAL_STATUS = new Set(["completed", "failed", "cancelled"]);

function sanitizeFilename(name) {
  const safe = String(name || "download")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (safe || "download").slice(0, 80);
}

function extensionFrom(container, url) {
  const value = String(container || "").split(",")[0].trim().toLowerCase();
  if (/^[a-z0-9]{1,8}$/.test(value)) return value;
  try {
    const ext = path.extname(new URL(url).pathname).replace(/^\./, "").toLowerCase();
    if (/^[a-z0-9]{1,8}$/.test(ext)) return ext;
  } catch {
    /* ignore */
  }
  return "mkv";
}

function parseTotalBytes(headers, downloadedBytes) {
  const range = headers.get("content-range");
  if (range) {
    const match = /\/(\d+)\s*$/.exec(range);
    if (match) return Number(match[1]);
  }
  const length = Number(headers.get("content-length"));
  return Number.isFinite(length) && length > 0 ? downloadedBytes + length : null;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function uniqueFilePath(dir, title, extension) {
  await fs.mkdir(dir, { recursive: true });
  const base = sanitizeFilename(title);
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? randomUUID().slice(0, 8) : `${randomUUID().slice(0, 8)}-${index}`;
    const candidate = path.join(dir, `${base}-${suffix}.${extension}`);
    if (!(await pathExists(candidate))) return candidate;
  }
  return path.join(dir, `${base}-${randomUUID()}.${extension}`);
}

function headersForTask(task, startBytes) {
  const headers = {};
  for (const [name, value] of task.headers ?? []) {
    if (name && value != null) headers[name] = String(value).replace(/[\r\n]+/g, " ");
  }
  if (task.userAgent) headers["User-Agent"] = task.userAgent;
  if (startBytes > 0) headers.Range = `bytes=${startBytes}-`;
  return headers;
}

export class DownloadManager {
  constructor(store, emby, mpv, options = {}) {
    this.store = store;
    this.emby = emby;
    this.mpv = mpv;
    this.downloadDir = path.join(options.userDataDir, "downloads");
    this.emit = options.emit ?? (() => {});
    this.notify = options.notify ?? (() => {});
    this.active = new Map();
  }

  async list() {
    return this.store.listDownloads();
  }

  async start(payload = {}) {
    const { server, account } = await this.store.activePair();
    const item = await this.emby.getItem(server, account, payload.itemId);
    const source = await this.emby.mpvPlaybackSource(
      server,
      account,
      payload.itemId,
      0,
      payload.preferDirect ?? true,
    );
    const mediaSource = source.diagnostics?.selectedMediaSource ?? {};
    const extension = extensionFrom(mediaSource.container, source.streamUrl);
    const filePath = await uniqueFilePath(this.downloadDir, item.Name || source.itemId, extension);
    const now = new Date().toISOString();
    const task = await this.store.upsertDownload({
      id: randomUUID(),
      serverId: server.id,
      accountId: account.id,
      itemId: source.itemId,
      mediaSourceId: source.mediaSourceId,
      playSessionId: source.playSessionId,
      title: item.Name || source.itemId,
      filePath,
      streamUrl: source.streamUrl,
      container: mediaSource.container ?? extension,
      totalBytes: mediaSource.size ?? null,
      downloadedBytes: 0,
      status: "pending",
      stealth: payload.stealth === true,
      error: null,
      createdAt: now,
      updatedAt: now,
      headers: source.headers ?? [],
      userAgent: source.userAgent ?? null,
    });
    this.emitState(task);
    void this.run(task.id);
    return task;
  }

  async pause(id) {
    const active = this.active.get(id);
    if (active) {
      active.nextStatus = "paused";
      active.controller.abort();
      return;
    }
    const task = await this.store.getDownload(id);
    if (task && task.status === "running") await this.updateTask(task, { status: "paused" });
  }

  async resume(id) {
    if (this.active.has(id)) return;
    const task = await this.store.getDownload(id);
    if (!task || task.status === "completed") return;
    await this.updateTask(task, { status: "pending", error: null });
    void this.run(id);
  }

  async cancel(id) {
    const active = this.active.get(id);
    if (active) {
      active.nextStatus = "cancelled";
      active.controller.abort();
      return;
    }
    const task = await this.store.getDownload(id);
    if (task && !TERMINAL_STATUS.has(task.status)) {
      await this.updateTask(task, { status: "cancelled" });
    }
  }

  async remove(id, deleteFile = false) {
    const active = this.active.get(id);
    if (active) {
      active.removed = true;
      active.nextStatus = "cancelled";
      active.controller.abort();
    }
    const task = await this.store.getDownload(id);
    await this.store.removeDownload(id);
    this.emit("download:state", { id, status: "cancelled" });
    if (deleteFile && task?.filePath) {
      await fs.unlink(task.filePath).catch(() => {});
    }
  }

  async playLocal(id, startMs = null) {
    const task = await this.store.getDownload(id);
    if (!task) throw new Error(`download not found: ${id}`);
    if (!(await pathExists(task.filePath))) throw new Error(`local file missing: ${task.filePath}`);
    await this.mpv.load({
      url: pathToFileURL(task.filePath).toString(),
      headers: [],
      userAgent: null,
      startMs,
    });
  }

  async resumePersisted() {
    const tasks = await this.store.listDownloads();
    for (const task of tasks) {
      if (task.status === "running") void this.run(task.id);
    }
  }

  async run(id) {
    if (this.active.has(id)) return;
    let task = await this.store.getDownload(id);
    if (!task) return;

    const controller = new AbortController();
    const active = { controller, nextStatus: "paused", removed: false };
    this.active.set(id, active);

    try {
      await fs.mkdir(path.dirname(task.filePath), { recursive: true });
      let startBytes = 0;
      if (await pathExists(task.filePath)) {
        startBytes = (await fs.stat(task.filePath)).size;
      }
      task = await this.updateTask(task, {
        status: "running",
        error: null,
        downloadedBytes: startBytes,
      });

      const response = await fetch(task.streamUrl, {
        headers: headersForTask(task, startBytes),
        signal: controller.signal,
      });

      if (response.status === 416) {
        await this.updateTask(task, { status: "completed", error: null });
        return;
      }
      if (!response.ok && response.status !== 206) {
        throw new Error(`HTTP ${response.status}`);
      }
      if (startBytes > 0 && response.status === 200) {
        startBytes = 0;
        task.downloadedBytes = 0;
      }

      const totalBytes = parseTotalBytes(response.headers, startBytes) ?? task.totalBytes;
      if (totalBytes != null && totalBytes !== task.totalBytes) {
        task = await this.updateTask(task, { totalBytes });
      }

      await this.writeResponse(task, response, startBytes, active);
      if (active.removed) return;
      await this.updateTask(task, { status: "completed", error: null });
    } catch (error) {
      if (active.removed) return;
      const status = active.nextStatus;
      if (controller.signal.aborted && (status === "paused" || status === "cancelled")) {
        const latest = await this.store.getDownload(id);
        if (latest) await this.updateTask(latest, { status, error: null });
      } else {
        const latest = await this.store.getDownload(id);
        if (latest) {
          await this.updateTask(latest, {
            status: "failed",
            error: error?.message ?? String(error),
          });
        }
      }
    } finally {
      this.active.delete(id);
    }
  }

  async writeResponse(task, response, startBytes, active) {
    if (!response.body) throw new Error("empty download response body");
    let downloadedBytes = startBytes;
    let lastEmit = 0;
    const stream = fsSync.createWriteStream(task.filePath, {
      flags: startBytes > 0 && response.status === 206 ? "a" : "w",
    });
    try {
      for await (const chunk of response.body) {
        if (active.controller.signal.aborted) break;
        const buffer = Buffer.from(chunk);
        downloadedBytes += buffer.length;
        if (!stream.write(buffer)) await once(stream, "drain");
        const now = Date.now();
        if (now - lastEmit > 750 || downloadedBytes === task.totalBytes) {
          task.downloadedBytes = downloadedBytes;
          await this.store.upsertDownload(task);
          this.emitProgress(task);
          lastEmit = now;
        }
      }
    } finally {
      stream.end();
      await once(stream, "finish").catch(() => {});
    }
    task.downloadedBytes = downloadedBytes;
    if (!active.removed) {
      await this.store.upsertDownload(task);
      this.emitProgress(task);
    }
    if (active.controller.signal.aborted) throw new Error("download aborted");
  }

  async updateTask(task, patch) {
    const previousStatus = task.status;
    const next = {
      ...task,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    const saved = await this.store.upsertDownload(next);
    this.emitState(saved);
    if (previousStatus !== saved.status) {
      await this.notifyStatus(saved);
    }
    return saved;
  }

  async notifyStatus(task) {
    try {
      switch (task.status) {
        case "completed":
          await this.notify({
            kind: "success",
            category: "download",
            title: `${task.title} 下载完成`,
            body: null,
            action: {
              kind: "open-task",
              label: "本地播放",
              payload: { taskId: task.id },
            },
            sourceId: task.id,
          });
          break;
        case "failed":
          await this.notify({
            kind: "error",
            category: "download",
            title: `${task.title} 下载失败`,
            body: task.error || "未知错误",
            sticky: true,
            sourceId: task.id,
          });
          break;
        case "cancelled":
          await this.notify({
            kind: "info",
            category: "download",
            title: `${task.title} 已取消`,
            body: null,
            sourceId: task.id,
          });
          break;
        default:
          break;
      }
    } catch (error) {
      console.warn("failed to push download notification", error);
    }
  }

  emitProgress(task) {
    this.emit("download:progress", {
      id: task.id,
      downloadedBytes: task.downloadedBytes,
      totalBytes: task.totalBytes ?? null,
    });
  }

  emitState(task) {
    this.emit("download:state", task);
  }
}
