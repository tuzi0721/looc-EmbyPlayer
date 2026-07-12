/**
 * Playback recovery state machine (pure logic, no I/O).
 *
 * The state machine receives events and emits actions. It does NOT
 * execute actions — the integrator (session-coordinator) is responsible
 * for carrying them out and reporting results back as new events.
 */

// ── States ──────────────────────────────────────────────────────────

export const State = Object.freeze({
  IDLE: "idle",
  RESOLVING: "resolving",
  STARTING: "starting",
  PLAYING: "playing",
  RECOVERING_RE_RESOLVE: "recovering_re_resolve",
  RECOVERING_RELOAD: "recovering_reload",
  RECOVERING_SWITCH_SOURCE: "recovering_switch_source",
  RECOVERING_SOFTWARE_DECODE: "recovering_software_decode",
  RECOVERING_RECREATE: "recovering_recreate",
  SUPERSEDED: "superseded",
  CANCELLED: "cancelled",
  FAILED: "failed",
  STOPPED: "stopped",
});

const TERMINAL_STATES = new Set([
  State.SUPERSEDED,
  State.CANCELLED,
  State.FAILED,
  State.STOPPED,
]);

const RECOVERY_STATES = new Set([
  State.RECOVERING_RE_RESOLVE,
  State.RECOVERING_RELOAD,
  State.RECOVERING_SWITCH_SOURCE,
  State.RECOVERING_SOFTWARE_DECODE,
  State.RECOVERING_RECREATE,
]);

// ── Events ──────────────────────────────────────────────────────────

export const EventType = Object.freeze({
  RESOLVE_SUCCESS: "resolve_success",
  RESOLVE_FAILURE: "resolve_failure",
  LOAD_SUCCESS: "load_success",
  LOAD_FAILURE: "load_failure",
  PLAYER_EXIT: "player_exit",
  HTTP_ERROR: "http_error",
  DECODE_ERROR: "decode_error",
  STALL: "stall",
  USER_STOP: "user_stop",
  EXTERNAL_CANCEL: "external_cancel",
  SUPERSEDE: "supersede",
  RECOVERY_SUCCESS: "recovery_success",
  RECOVERY_FAILURE: "recovery_failure",
});

// ── Actions emitted by the state machine ────────────────────────────

export const ActionType = Object.freeze({
  RESOLVE: "resolve",
  LOAD: "load",
  RE_RESOLVE: "re_resolve",
  RELOAD: "reload",
  SWITCH_SOURCE: "switch_source",
  SOFTWARE_DECODE: "software_decode",
  RECREATE: "recreate",
  REPORT_PLAYING: "report_playing",
  REPORT_STOPPED: "report_stopped",
  REPORT_FAILED: "report_failed",
  CLEANUP: "cleanup",
  NONE: "none",
});

// ── Error categories that map to recovery actions ───────────────────

export const RecoveryTrigger = Object.freeze({
  URL_EXPIRED: "url_expired",
  HTTP_AUTH: "http_auth",
  HTTP_NOT_FOUND: "http_not_found",
  NETWORK: "network",
  DECODE: "decode",
  PLAYER_CRASH: "player_crash",
  STALL: "stall",
  UNKNOWN: "unknown",
});

// ── Recovery policy (budget) ────────────────────────────────────────

export const DEFAULT_RECOVERY_BUDGET = Object.freeze({
  maxReResolves: 2,
  maxReloads: 2,
  maxSourceSwitches: 1,
  maxSoftwareDecodeFallbacks: 1,
  maxRecreates: 1,
  maxTotalActions: 4,
  cooldownMs: 10_000,
});

// ── State machine ───────────────────────────────────────────────────

export class RecoveryMachine {
  constructor(budget = DEFAULT_RECOVERY_BUDGET) {
    this.state = State.IDLE;
    this.budget = { ...budget };
    this.actions = {
      reResolves: 0,
      reloads: 0,
      sourceSwitches: 0,
      softwareDecodeFallbacks: 0,
      recreates: 0,
      total: 0,
    };
    this.lastError = null;
    this.history = [];
    this.stablePositionMs = null;
    this.stablePaused = null;
    this.stableAudioTrack = null;
    this.stableSubtitleTrack = null;
    this.currentLine = null;
    this.currentSource = null;
  }

  isTerminal() {
    return TERMINAL_STATES.has(this.state);
  }

  isRecovering() {
    return RECOVERY_STATES.has(this.state);
  }

  /**
   * Process an event and return the action to take.
   *
   * @param {string} eventType - One of EventType
   * @param {object} [payload]
   * @returns {{ action: string, state: string, metadata?: object }}
   */
  handle(eventType, payload = {}) {
    const entry = { eventType, state: this.state, timestamp: Date.now() };
    this.history.push(entry);

    // Terminal states only respond to supersede (already terminal) — no-op.
    if (this.isTerminal()) {
      return { action: ActionType.NONE, state: this.state };
    }

    // Global events.
    if (eventType === EventType.SUPERSEDE) {
      this.state = State.SUPERSEDED;
      this.lastError = null;
      return { action: ActionType.CLEANUP, state: this.state };
    }
    if (eventType === EventType.EXTERNAL_CANCEL) {
      this.state = State.CANCELLED;
      this.lastError = null;
      return { action: ActionType.CLEANUP, state: this.state };
    }
    if (eventType === EventType.USER_STOP) {
      this.state = State.STOPPED;
      this.lastError = null;
      return {
        action: ActionType.REPORT_STOPPED,
        state: this.state,
        metadata: { positionMs: this.stablePositionMs },
      };
    }

    // State-specific handling.
    switch (this.state) {
      case State.IDLE:
        return this._handleIdle(eventType, payload);
      case State.RESOLVING:
        return this._handleResolving(eventType, payload);
      case State.STARTING:
        return this._handleStarting(eventType, payload);
      case State.PLAYING:
        return this._handlePlaying(eventType, payload);
      default:
        return this._handleRecovery(eventType, payload);
    }
  }

  _handleIdle(eventType, payload) {
    if (eventType === EventType.RESOLVE_SUCCESS) {
      this.state = State.STARTING;
      this.currentSource = payload.source ?? null;
      this.currentLine = payload.line ?? null;
      return { action: ActionType.LOAD, state: this.state, metadata: { source: this.currentSource } };
    }
    if (eventType === EventType.RESOLVE_FAILURE) {
      this.state = State.FAILED;
      this.lastError = payload.error ?? "resolve failed";
      return {
        action: ActionType.REPORT_FAILED,
        state: this.state,
        metadata: { error: this.lastError },
      };
    }
    return { action: ActionType.NONE, state: this.state };
  }

  _handleResolving(eventType, payload) {
    if (eventType === EventType.RESOLVE_SUCCESS) {
      this.state = State.STARTING;
      this.currentSource = payload.source ?? this.currentSource;
      this.currentLine = payload.line ?? this.currentLine;
      return { action: ActionType.LOAD, state: this.state };
    }
    if (eventType === EventType.RESOLVE_FAILURE) {
      return this._enterFailure(payload.error ?? "resolve failed");
    }
    return { action: ActionType.NONE, state: this.state };
  }

  _handleStarting(eventType, payload) {
    if (eventType === EventType.LOAD_SUCCESS) {
      this.state = State.PLAYING;
      if (payload.positionMs != null) this.stablePositionMs = payload.positionMs;
      if (payload.paused != null) this.stablePaused = payload.paused;
      if (payload.audioTrack != null) this.stableAudioTrack = payload.audioTrack;
      if (payload.subtitleTrack != null) this.stableSubtitleTrack = payload.subtitleTrack;
      return { action: ActionType.REPORT_PLAYING, state: this.state };
    }
    if (eventType === EventType.LOAD_FAILURE) {
      return this._enterRecovery(payload);
    }
    if (eventType === EventType.PLAYER_EXIT) {
      return this._enterRecovery({ trigger: RecoveryTrigger.PLAYER_CRASH, ...payload });
    }
    return { action: ActionType.NONE, state: this.state };
  }

  _handlePlaying(eventType, payload) {
    // Update stable state.
    if (payload.positionMs != null && eventType !== EventType.STALL) {
      this.stablePositionMs = payload.positionMs;
    }
    if (payload.paused != null) this.stablePaused = payload.paused;
    if (payload.audioTrack != null) this.stableAudioTrack = payload.audioTrack;
    if (payload.subtitleTrack != null) this.stableSubtitleTrack = payload.subtitleTrack;

    if (eventType === EventType.HTTP_ERROR || eventType === EventType.PLAYER_EXIT ||
        eventType === EventType.DECODE_ERROR || eventType === EventType.STALL) {
      return this._enterRecovery(payload);
    }
    return { action: ActionType.NONE, state: this.state };
  }

  _handleRecovery(eventType, payload) {
    if (eventType === EventType.RECOVERY_SUCCESS) {
      this.state = State.PLAYING;
      if (payload.positionMs != null) this.stablePositionMs = payload.positionMs;
      return { action: ActionType.REPORT_PLAYING, state: this.state };
    }
    if (eventType === EventType.RECOVERY_FAILURE) {
      // Try next recovery action if budget allows.
      return this._enterRecovery(payload);
    }
    return { action: ActionType.NONE, state: this.state };
  }

  _enterRecovery(payload = {}) {
    const trigger = payload.trigger ?? this._classifyError(payload);
    this.lastError = payload.error ?? trigger;

    if (this.actions.total >= this.budget.maxTotalActions) {
      return this._enterFailure(`recovery budget exhausted: ${this.lastError}`);
    }

    // Select recovery action based on trigger and remaining budget.
    const action = this._selectRecoveryAction(trigger);
    if (!action) {
      return this._enterFailure(`no recovery action available for: ${trigger}`);
    }

    // Increment counters.
    this.actions.total += 1;
    switch (action) {
      case ActionType.RE_RESOLVE:
        this.actions.reResolves += 1;
        this.state = State.RECOVERING_RE_RESOLVE;
        break;
      case ActionType.RELOAD:
        this.actions.reloads += 1;
        this.state = State.RECOVERING_RELOAD;
        break;
      case ActionType.SWITCH_SOURCE:
        this.actions.sourceSwitches += 1;
        this.state = State.RECOVERING_SWITCH_SOURCE;
        break;
      case ActionType.SOFTWARE_DECODE:
        this.actions.softwareDecodeFallbacks += 1;
        this.state = State.RECOVERING_SOFTWARE_DECODE;
        break;
      case ActionType.RECREATE:
        this.actions.recreates += 1;
        this.state = State.RECOVERING_RECREATE;
        break;
      default:
        return this._enterFailure(`unknown recovery action: ${action}`);
    }

    return {
      action,
      state: this.state,
      metadata: {
        trigger,
        positionMs: this.stablePositionMs,
        paused: this.stablePaused,
        audioTrack: this.stableAudioTrack,
        subtitleTrack: this.stableSubtitleTrack,
        attempt: this.actions.total,
      },
    };
  }

  _selectRecoveryAction(trigger) {
    switch (trigger) {
      case RecoveryTrigger.URL_EXPIRED:
      case RecoveryTrigger.HTTP_AUTH:
        if (this.actions.reResolves < this.budget.maxReResolves) return ActionType.RE_RESOLVE;
        if (this.actions.reloads < this.budget.maxReloads) return ActionType.RELOAD;
        break;
      case RecoveryTrigger.HTTP_NOT_FOUND:
      case RecoveryTrigger.NETWORK:
        if (this.actions.reResolves < this.budget.maxReResolves) return ActionType.RE_RESOLVE;
        if (this.actions.sourceSwitches < this.budget.maxSourceSwitches) return ActionType.SWITCH_SOURCE;
        if (this.actions.reloads < this.budget.maxReloads) return ActionType.RELOAD;
        break;
      case RecoveryTrigger.DECODE:
        if (this.actions.softwareDecodeFallbacks < this.budget.maxSoftwareDecodeFallbacks) return ActionType.SOFTWARE_DECODE;
        if (this.actions.recreates < this.budget.maxRecreates) return ActionType.RECREATE;
        break;
      case RecoveryTrigger.PLAYER_CRASH:
        if (this.actions.recreates < this.budget.maxRecreates) return ActionType.RECREATE;
        if (this.actions.reloads < this.budget.maxReloads) return ActionType.RELOAD;
        break;
      case RecoveryTrigger.STALL:
        if (this.actions.reloads < this.budget.maxReloads) return ActionType.RELOAD;
        if (this.actions.reResolves < this.budget.maxReResolves) return ActionType.RE_RESOLVE;
        break;
      default:
        if (this.actions.reloads < this.budget.maxReloads) return ActionType.RELOAD;
        break;
    }
    return null;
  }

  _classifyError(payload) {
    const code = payload.errorCode ?? payload.code;
    if (code === "http_auth" || code === "http_not_found") return RecoveryTrigger.HTTP_AUTH;
    if (code === "network_unreachable" || code === "connection_reset" ||
        code === "timeout_connect" || code === "timeout_response") return RecoveryTrigger.NETWORK;
    if (code === "decode" || payload.decodeError) return RecoveryTrigger.DECODE;
    if (payload.playerExit) return RecoveryTrigger.PLAYER_CRASH;
    if (payload.stall) return RecoveryTrigger.STALL;
    return RecoveryTrigger.UNKNOWN;
  }

  _enterFailure(error) {
    this.state = State.FAILED;
    this.lastError = error;
    return {
      action: ActionType.REPORT_FAILED,
      state: this.state,
      metadata: {
        error,
        attempts: this.actions.total,
        history: this.history.slice(-10),
      },
    };
  }

  /**
   * Get a user-visible status string.
   */
  userStatus() {
    switch (this.state) {
      case State.RESOLVING:
      case State.STARTING:
        return "正在加载";
      case State.PLAYING:
        return null; // no status needed
      case State.RECOVERING_RE_RESOLVE:
        return "正在刷新播放地址";
      case State.RECOVERING_RELOAD:
        return "正在恢复播放";
      case State.RECOVERING_SWITCH_SOURCE:
        return "正在切换线路";
      case State.RECOVERING_SOFTWARE_DECODE:
        return "正在回退软件解码";
      case State.RECOVERING_RECREATE:
        return "正在重建播放器";
      case State.FAILED:
        return "恢复失败";
      default:
        return null;
    }
  }
}
