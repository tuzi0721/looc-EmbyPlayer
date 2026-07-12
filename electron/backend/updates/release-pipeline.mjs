/**
 * Release, upgrade, and rollback pipeline.
 *
 * Manages the release lifecycle: version bumping, changelog generation,
 * upgrade migration, and rollback to previous known-good state.
 */

// ── Release stage ───────────────────────────────────────────────────

export const ReleaseStage = Object.freeze({
  DEVELOPMENT: "development",
  BUILT: "built",
  TESTED: "tested",
  STAGED: "staged",
  RELEASED: "released",
  ROLLED_BACK: "rolled_back",
});

// ── Release record ──────────────────────────────────────────────────

/**
 * @typedef {Object} ReleaseRecord
 * @property {string} version
 * @property {string} stage — One of ReleaseStage.
 * @property {string} createdAt
 * @property {string|null} releasedAt
 * @property {string|null} rolledBackAt
 * @property {string|null} rollbackReason
 * @property {string[]} changelog
 * @property {Object} metadata — Build info, checksums, etc.
 * @property {string|null} previousVersion — For rollback.
 */

// ── Release pipeline ────────────────────────────────────────────────

export class ReleasePipeline {
  constructor() {
    /** @type {Map<string, ReleaseRecord>} keyed by version */
    this._releases = new Map();
    /** @type {string|null} */
    this._currentVersion = null;
  }

  /**
   * Register a new release (built but not yet tested).
   */
  createRelease(version, options = {}) {
    if (this._releases.has(version)) {
      throw new Error(`release ${version} already exists`);
    }
    const record = {
      version,
      stage: ReleaseStage.BUILT,
      createdAt: new Date().toISOString(),
      releasedAt: null,
      rolledBackAt: null,
      rollbackReason: null,
      changelog: options.changelog ?? [],
      metadata: options.metadata ?? {},
      previousVersion: this._currentVersion,
    };
    this._releases.set(version, record);
    return record;
  }

  /**
   * Mark a release as tested and ready for staging.
   */
  markTested(version) {
    const record = this._releases.get(version);
    if (!record) throw new Error(`release ${version} not found`);
    if (record.stage !== ReleaseStage.BUILT) {
      throw new Error(`release ${version} is in stage ${record.stage}, expected ${ReleaseStage.BUILT}`);
    }
    record.stage = ReleaseStage.TESTED;
    return record;
  }

  /**
   * Stage a release for deployment.
   */
  stageRelease(version) {
    const record = this._releases.get(version);
    if (!record) throw new Error(`release ${version} not found`);
    if (record.stage !== ReleaseStage.TESTED) {
      throw new Error(`release ${version} is in stage ${record.stage}, expected ${ReleaseStage.TESTED}`);
    }
    record.stage = ReleaseStage.STAGED;
    return record;
  }

  /**
   * Release a version (make it the current version).
   */
  release(version) {
    const record = this._releases.get(version);
    if (!record) throw new Error(`release ${version} not found`);
    if (record.stage !== ReleaseStage.STAGED) {
      throw new Error(`release ${version} is in stage ${record.stage}, expected ${ReleaseStage.STAGED}`);
    }
    record.stage = ReleaseStage.RELEASED;
    record.releasedAt = new Date().toISOString();
    this._currentVersion = version;
    return record;
  }

  /**
   * Rollback to the previous version.
   */
  rollback(reason) {
    if (!this._currentVersion) throw new Error("no current release to rollback from");
    const current = this._releases.get(this._currentVersion);
    if (!current) throw new Error(`current release ${this._currentVersion} not found`);
    if (!current.previousVersion) throw new Error("no previous version to rollback to");

    current.stage = ReleaseStage.ROLLED_BACK;
    current.rolledBackAt = new Date().toISOString();
    current.rollbackReason = reason ?? "unknown";

    const previous = this._releases.get(current.previousVersion);
    if (previous) {
      previous.stage = ReleaseStage.RELEASED;
    }

    this._currentVersion = current.previousVersion;
    return { rolledBackFrom: current.version, rolledBackTo: current.previousVersion };
  }

  /**
   * Get the current release version.
   */
  getCurrentVersion() {
    return this._currentVersion;
  }

  /**
   * Get a release record.
   */
  getRelease(version) {
    return this._releases.get(version) ?? null;
  }

  /**
   * List all releases.
   */
  listReleases() {
    return [...this._releases.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Get the release history (for audit).
   */
  getHistory() {
    return this.listReleases().map((r) => ({
      version: r.version,
      stage: r.stage,
      createdAt: r.createdAt,
      releasedAt: r.releasedAt,
      rolledBackAt: r.rolledBackAt,
      rollbackReason: r.rollbackReason,
      previousVersion: r.previousVersion,
    }));
  }
}

// ── Upgrade migration registry ──────────────────────────────────────

export class MigrationRegistry {
  constructor() {
    /** @type {Map<string, Function>} keyed by "fromVersion→toVersion" */
    this._migrations = new Map();
  }

  /**
   * Register a migration from one version to another.
   */
  register(fromVersion, toVersion, migrationFn) {
    const key = `${fromVersion}→${toVersion}`;
    this._migrations.set(key, migrationFn);
  }

  /**
   * Run migrations from one version to another (inclusive of target).
   */
  async migrate(fromVersion, toVersion, data = {}) {
    // Build migration path.
    const path = this._findPath(fromVersion, toVersion);
    if (!path) {
      throw new Error(`no migration path from ${fromVersion} to ${toVersion}`);
    }

    let current = data;
    for (const { from, to } of path) {
      const key = `${from}→${to}`;
      const migration = this._migrations.get(key);
      if (migration) {
        current = await migration(current);
      }
    }
    return current;
  }

  _findPath(from, to) {
    if (from === to) return [];
    const visited = new Set([from]);
    const queue = [{ version: from, path: [] }];

    while (queue.length > 0) {
      const { version, path } = queue.shift();
      for (const [key] of this._migrations) {
        const [fromV, toV] = key.split("→");
        if (fromV === version && !visited.has(toV)) {
          const newPath = [...path, { from: fromV, to: toV }];
          if (toV === to) return newPath;
          visited.add(toV);
          queue.push({ version: toV, path: newPath });
        }
      }
    }
    return null;
  }
}
