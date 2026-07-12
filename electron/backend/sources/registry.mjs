/**
 * Unified Source Backend/Registry.
 *
 * Provides a single interface for browsing, searching, and resolving
 * media across Emby, WebDAV, Alist, and local sources. Each source
 * registers a backend adapter that implements the SourceBackend interface.
 */

// ── Source kinds ────────────────────────────────────────────────────

export const SourceKind = Object.freeze({
  EMBY: "emby",
  WEBDAV: "webdav",
  ALIST: "alist",
  LOCAL: "local",
});

// ── Media item (unified) ────────────────────────────────────────────

/**
 * @typedef {Object} MediaItem
 * @property {string} id — Unique within the source.
 * @property {string} sourceId — Which source this belongs to.
 * @property {string} sourceKind — One of SourceKind.
 * @property {string} title
 * @property {string|null} type — "movie" | "series" | "episode" | "music" | "photo" | "file"
 * @property {number|null} durationMs
 * @property {string|null} thumbnailUrl
 * @property {string|null} backdropUrl
 * @property {Object|null} metadata — Source-specific extra data.
 * @property {boolean} isDirectory
 * @property {boolean} isPlayable
 */

/**
 * @typedef {Object} BrowseResult
 * @property {MediaItem[]} items
 * @property {string|null} nextCursor — Pagination cursor (null = no more).
 */

/**
 * @typedef {Object} ResolveResult
 * @property {string} streamUrl
 * @property {Array<[string, string]>} headers
 * @property {string|null} userAgent
 * @property {number|null} durationMs
 * @property {Object} diagnostics
 */

// ── SourceBackend interface (documented, not enforced) ─────────────

/**
 * @interface SourceBackend
 * @property {string} id
 * @property {string} kind — One of SourceKind.
 * @property {string} displayName
 * @property {boolean} online
 * @property {boolean} ready
 * @method browse(parentId, cursor, options) → Promise<BrowseResult>
 * @method search(query, options) → Promise<MediaItem[]>
 * @method resolve(itemId) → Promise<ResolveResult>
 * @method getItem(itemId) → Promise<MediaItem|null>
 */

// ── SourceRegistry ──────────────────────────────────────────────────

export class SourceRegistry {
  constructor() {
    /** @type {Map<string, SourceBackend>} */
    this._backends = new Map();
    /** @type {Map<string, { id: string, kind: string, displayName: string, online: boolean }>} */
    this._metadata = new Map();
  }

  /**
   * Register a source backend.
   * @param {SourceBackend} backend
   */
  register(backend) {
    if (!backend.id) throw new Error("backend must have an id");
    this._backends.set(backend.id, backend);
    this._metadata.set(backend.id, {
      id: backend.id,
      kind: backend.kind,
      displayName: backend.displayName,
      online: backend.online ?? false,
    });
  }

  /**
   * Unregister a source backend.
   */
  unregister(sourceId) {
    this._backends.delete(sourceId);
    this._metadata.delete(sourceId);
  }

  /**
   * Get a backend by ID.
   */
  get(sourceId) {
    return this._backends.get(sourceId) ?? null;
  }

  /**
   * List all registered sources.
   */
  list() {
    return [...this._metadata.values()];
  }

  /**
   * List sources by kind.
   */
  listByKind(kind) {
    return this.list().filter((s) => s.kind === kind);
  }

  /**
   * Browse items from a specific source.
   */
  async browse(sourceId, parentId = null, cursor = null, options = {}) {
    const backend = this._backends.get(sourceId);
    if (!backend) throw new Error(`source not found: ${sourceId}`);
    return backend.browse(parentId, cursor, options);
  }

  /**
   * Search across all online sources.
   */
  async searchAll(query, options = {}) {
    const results = [];
    const searches = [];
    for (const [id, backend] of this._backends) {
      if (backend.online && backend.search) {
        searches.push(
          backend.search(query, options)
            .then((items) => results.push(...items))
            .catch(() => {}),
        );
      }
    }
    await Promise.allSettled(searches);
    return results;
  }

  /**
   * Search a specific source.
   */
  async search(sourceId, query, options = {}) {
    const backend = this._backends.get(sourceId);
    if (!backend) throw new Error(`source not found: ${sourceId}`);
    if (!backend.search) return [];
    return backend.search(query, options);
  }

  /**
   * Resolve a media item to a playable stream URL.
   */
  async resolve(sourceId, itemId) {
    const backend = this._backends.get(sourceId);
    if (!backend) throw new Error(`source not found: ${sourceId}`);
    return backend.resolve(itemId);
  }

  /**
   * Get a media item by ID from a specific source.
   */
  async getItem(sourceId, itemId) {
    const backend = this._backends.get(sourceId);
    if (!backend) throw new Error(`source not found: ${sourceId}`);
    return backend.getItem(itemId);
  }
}

// ── Media identity (cross-source) ───────────────────────────────────

/**
 * Create a cross-source media identity.
 * This allows tracking watch progress across different sources for
 * the same logical media item.
 */
export function createMediaIdentity(item) {
  return {
    // Normalized title for fuzzy matching.
    title: normalizeTitle(item.title),
    // Year if available (for movie/series disambiguation).
    year: item.metadata?.year ?? null,
    // Type for category matching.
    type: item.type ?? "file",
    // Duration for verification.
    durationMs: item.durationMs ?? null,
    // Source-specific reference.
    sourceRef: {
      sourceId: item.sourceId,
      itemId: item.id,
    },
  };
}

function normalizeTitle(title) {
  if (typeof title !== "string") return "";
  return title
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s\u4e00-\u9fff\-]/g, "")
    .trim();
}

/**
 * Check if two media identities refer to the same logical media.
 */
export function isSameMedia(a, b) {
  if (!a || !b) return false;
  if (a.sourceRef?.sourceId === b.sourceRef?.sourceId &&
      a.sourceRef?.itemId === b.sourceRef?.itemId) return true;
  if (normalizeTitle(a.title) !== normalizeTitle(b.title)) return false;
  if (a.year && b.year && a.year !== b.year) return false;
  return true;
}
