/**
 * Latest-wins session coordinator.
 *
 * Ensures that only the most recent playback intent can commit a session,
 * start a player, or report playback state. Previous generations are
 * superseded and their resources cleaned up.
 */

import { RecoveryMachine, State, EventType, ActionType } from "./recovery-machine.mjs";

// ── Session lifecycle ───────────────────────────────────────────────

/**
 * @typedef {Object} PlayIntent
 * @property {number} generation - Monotonically increasing ID.
 * @property {string} itemId
 * @property {string} [mediaSourceId]
 * @property {string} [lineId]
 * @property {string} [serverId]
 */

/**
 * @typedef {Object} SessionState
 * @property {number} generation
 * @property {string|null} playSessionId
 * @property {string|null} itemId
 * @property {boolean} hasStarted - Whether Playing was reported.
 * @property {RecoveryMachine} machine
 */

export class SessionCoordinator {
  constructor() {
    this._generation = 0;
    /** @type {SessionState|null} */
    this._current = null;
    /** @type {Map<number, SessionState>} */
    this._pending = new Map();
    this._onAction = null;
    this._onStatus = null;
  }

  /**
   * Set callbacks for actions and status updates.
   * @param {{ onAction?: Function, onStatus?: Function }} handlers
   */
  setHandlers({ onAction, onStatus } = {}) {
    this._onAction = onAction ?? null;
    this._onStatus = onStatus ?? null;
  }

  /**
   * Create a new playback intent. Returns the generation number.
   * Previous generations are immediately superseded.
   *
   * @param {Omit<PlayIntent, "generation">} intent
   * @returns {number} generation
   */
  createIntent(intent) {
    this._generation += 1;
    const generation = this._generation;

    // Supersede all previous generations.
    for (const [gen, session] of this._pending) {
      if (gen !== generation) {
        this._supersede(session);
      }
    }
    // _current may have been superseded in the loop above — check if it's still pending.
    if (this._current && this._current.generation !== generation && this._pending.has(this._current.generation)) {
      this._supersede(this._current);
    }

    // Create new session state.
    const machine = new RecoveryMachine();
    const session = {
      generation,
      playSessionId: null,
      itemId: intent.itemId ?? null,
      mediaSourceId: intent.mediaSourceId ?? null,
      lineId: intent.lineId ?? null,
      hasStarted: false,
      machine,
    };
    this._pending.set(generation, session);
    this._current = session;

    // Start resolution.
    machine.state = State.RESOLVING;
    this._emitStatus(session);

    return generation;
  }

  /**
   * Check if a generation is still current.
   */
  isCurrent(generation) {
    return this._current?.generation === generation;
  }

  /**
   * Feed an event to the current session's recovery machine.
   * If the generation is not current, the event is ignored.
   *
   * @param {number} generation
   * @param {string} eventType
   * @param {object} [payload]
   */
  handleEvent(generation, eventType, payload = {}) {
    const session = this._pending.get(generation);
    if (!session) return;

    if (!this.isCurrent(generation)) {
      // Old generation events are ignored (it should already be superseded).
      return;
    }

    const result = session.machine.handle(eventType, payload);

    // Track session start.
    if (result.action === ActionType.REPORT_PLAYING) {
      session.hasStarted = true;
    }

    // Commit play session ID when playing starts.
    if (eventType === EventType.RESOLVE_SUCCESS && payload.playSessionId) {
      session.playSessionId = payload.playSessionId;
    }

    // Emit status.
    this._emitStatus(session);

    // Execute action.
    if (result.action !== ActionType.NONE) {
      this._onAction?.({
        generation,
        action: result.action,
        state: result.state,
        metadata: result.metadata,
      });
    }

    // Clean up terminal sessions.
    if (session.machine.isTerminal()) {
      this._pending.delete(generation);
      if (this._current === session) {
        this._current = null;
      }
    }
  }

  /**
   * Supersede a session: send Stopped if it had started, then clean up.
   */
  _supersede(session) {
    if (session.hasStarted) {
      // Send exactly one Stopped for sessions that successfully started.
      this._onAction?.({
        generation: session.generation,
        action: ActionType.REPORT_STOPPED,
        state: State.SUPERSEDED,
        metadata: {
          playSessionId: session.playSessionId,
          positionMs: session.machine.stablePositionMs,
        },
      });
    }
    // Mark as superseded in the machine.
    session.machine.handle(EventType.SUPERSEDE);
    this._pending.delete(session.generation);
  }

  _emitStatus(session) {
    const status = session.machine.userStatus();
    if (status) {
      this._onStatus?.({
        generation: session.generation,
        status,
        state: session.machine.state,
      });
    }
  }

  /**
   * Get current session info (for debugging).
   */
  getCurrent() {
    if (!this._current) return null;
    return {
      generation: this._current.generation,
      playSessionId: this._current.playSessionId,
      hasStarted: this._current.hasStarted,
      state: this._current.machine.state,
      actionsTaken: this._current.machine.actions.total,
    };
  }

  /**
   * Get the number of pending sessions (for leak detection).
   */
  pendingCount() {
    return this._pending.size;
  }
}
