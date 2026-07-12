/**
 * Phase 2 P1/P3: Playback recovery state machine and latest-wins tests.
 *
 * Tests the pure logic of the recovery state machine and the
 * session coordinator without any real I/O.
 */

import assert from "node:assert/strict";
import {
  RecoveryMachine,
  State,
  EventType,
  ActionType,
  RecoveryTrigger,
  DEFAULT_RECOVERY_BUDGET,
} from "../electron/backend/playback/recovery-machine.mjs";
import { SessionCoordinator } from "../electron/backend/playback/session-coordinator.mjs";
import { CancelRegistry } from "../electron/backend/network/cancel-registry.mjs";

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { passed += 1; console.log(`  ✓ ${name}`); })
    .catch((error) => {
      failed += 1;
      console.error(`  ✗ ${name}`);
      console.error(`    ${error?.stack ?? error}`);
    });
}

function assertEqual(actual, expected, label) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── Recovery state machine tests ────────────────────────────────────

async function testIdleToPlaying() {
  const m = new RecoveryMachine();

  // IDLE → RESOLVE_SUCCESS → STARTING → LOAD_SUCCESS → PLAYING
  assertEqual(m.state, State.IDLE, "initial state");

  const r1 = m.handle(EventType.RESOLVE_SUCCESS, { source: "test" });
  assertEqual(m.state, State.STARTING, "after resolve");
  assertEqual(r1.action, ActionType.LOAD, "action after resolve");

  const r2 = m.handle(EventType.LOAD_SUCCESS, { positionMs: 5000, paused: false });
  assertEqual(m.state, State.PLAYING, "after load");
  assertEqual(r2.action, ActionType.REPORT_PLAYING, "action after load");
  assertEqual(m.stablePositionMs, 5000, "stable position");
}

async function testUserStop() {
  const m = new RecoveryMachine();
  m.handle(EventType.RESOLVE_SUCCESS);
  m.handle(EventType.LOAD_SUCCESS, { positionMs: 3000 });

  const r = m.handle(EventType.USER_STOP);
  assertEqual(m.state, State.STOPPED, "stopped state");
  assertEqual(r.action, ActionType.REPORT_STOPPED, "stopped action");
  assertEqual(m.isTerminal(), true, "stopped is terminal");
}

async function testSupersede() {
  const m = new RecoveryMachine();
  m.handle(EventType.RESOLVE_SUCCESS);
  m.handle(EventType.LOAD_SUCCESS);

  const r = m.handle(EventType.SUPERSEDE);
  assertEqual(m.state, State.SUPERSEDED, "superseded state");
  assertEqual(r.action, ActionType.CLEANUP, "superseded action");
  assertEqual(m.isTerminal(), true, "superseded is terminal");
}

async function testExternalCancel() {
  const m = new RecoveryMachine();
  m.handle(EventType.RESOLVE_SUCCESS);

  const r = m.handle(EventType.EXTERNAL_CANCEL);
  assertEqual(m.state, State.CANCELLED, "cancelled state");
  assertEqual(r.action, ActionType.CLEANUP, "cancelled action");
  assertEqual(m.isTerminal(), true, "cancelled is terminal");
}

async function testHttpErrorTriggersReResolve() {
  const m = new RecoveryMachine();
  m.handle(EventType.RESOLVE_SUCCESS);
  m.handle(EventType.LOAD_SUCCESS, { positionMs: 10000 });

  // HTTP error (URL expired) should trigger re-resolve.
  const r = m.handle(EventType.HTTP_ERROR, {
    errorCode: "http_auth",
    error: "401 Unauthorized",
  });
  assertEqual(m.state, State.RECOVERING_RE_RESOLVE, "re-resolve state");
  assertEqual(r.action, ActionType.RE_RESOLVE, "re-resolve action");
  assertEqual(m.isRecovering(), true, "is recovering");
  assertEqual(r.metadata.trigger, RecoveryTrigger.HTTP_AUTH, "trigger");
  assertEqual(r.metadata.positionMs, 10000, "recovery position");
}

async function testDecodeErrorTriggersSoftwareDecode() {
  const m = new RecoveryMachine();
  m.handle(EventType.RESOLVE_SUCCESS);
  m.handle(EventType.LOAD_SUCCESS);

  // Decode error should trigger software decode fallback.
  const r = m.handle(EventType.DECODE_ERROR, { decodeError: true });
  assertEqual(m.state, State.RECOVERING_SOFTWARE_DECODE, "software decode state");
  assertEqual(r.action, ActionType.SOFTWARE_DECODE, "software decode action");
}

async function testPlayerCrashTriggersRecreate() {
  const m = new RecoveryMachine();
  m.handle(EventType.RESOLVE_SUCCESS);
  m.handle(EventType.LOAD_SUCCESS);

  // Player crash should trigger recreate.
  const r = m.handle(EventType.PLAYER_EXIT, { playerExit: true });
  assertEqual(m.state, State.RECOVERING_RECREATE, "recreate state");
  assertEqual(r.action, ActionType.RECREATE, "recreate action");
}

async function testRecoverySuccessReturnsToPlaying() {
  const m = new RecoveryMachine();
  m.handle(EventType.RESOLVE_SUCCESS);
  m.handle(EventType.LOAD_SUCCESS, { positionMs: 8000 });
  m.handle(EventType.HTTP_ERROR, { errorCode: "http_auth" });

  const r = m.handle(EventType.RECOVERY_SUCCESS, { positionMs: 7900 });
  assertEqual(m.state, State.PLAYING, "back to playing");
  assertEqual(r.action, ActionType.REPORT_PLAYING, "report playing");
  assertEqual(m.stablePositionMs, 7900, "position after recovery");
}

async function testBudgetExhaustion() {
  const m = new RecoveryMachine({
    ...DEFAULT_RECOVERY_BUDGET,
    maxTotalActions: 2,
  });
  m.handle(EventType.RESOLVE_SUCCESS);
  m.handle(EventType.LOAD_SUCCESS);

  // First recovery.
  m.handle(EventType.HTTP_ERROR, { errorCode: "http_auth" });
  assertEqual(m.isRecovering(), true, "first recovery");

  // Recovery fails → second recovery.
  m.handle(EventType.RECOVERY_FAILURE, { errorCode: "http_auth" });
  assertEqual(m.isRecovering(), true, "second recovery");

  // Recovery fails again → budget exhausted → FAILED.
  const r = m.handle(EventType.RECOVERY_FAILURE, { errorCode: "http_auth" });
  assertEqual(m.state, State.FAILED, "budget exhausted");
  assertEqual(r.action, ActionType.REPORT_FAILED, "report failed");
  assertEqual(m.isTerminal(), true, "failed is terminal");
}

async function testStallTriggersReload() {
  const m = new RecoveryMachine();
  m.handle(EventType.RESOLVE_SUCCESS);
  m.handle(EventType.LOAD_SUCCESS, { positionMs: 15000 });

  const r = m.handle(EventType.STALL, { stall: true });
  assertEqual(m.state, State.RECOVERING_RELOAD, "reload state");
  assertEqual(r.action, ActionType.RELOAD, "reload action");
}

async function testTerminalStateIgnoresEvents() {
  const m = new RecoveryMachine();
  m.handle(EventType.RESOLVE_SUCCESS);
  m.handle(EventType.LOAD_SUCCESS);
  m.handle(EventType.USER_STOP);

  // Events after terminal should be no-ops.
  const r = m.handle(EventType.HTTP_ERROR);
  assertEqual(r.action, ActionType.NONE, "terminal ignores events");
  assertEqual(m.state, State.STOPPED, "still stopped");
}

// ── Latest-wins session coordinator tests ───────────────────────────

async function testLatestWinsBasic() {
  const actions = [];
  const coordinator = new SessionCoordinator();
  coordinator.setHandlers({
    onAction: (a) => actions.push(a),
    onStatus: () => {},
  });

  const gen1 = coordinator.createIntent({ itemId: "item-1" });
  const gen2 = coordinator.createIntent({ itemId: "item-2" });

  assertEqual(gen2, gen1 + 1, "generation increments");
  assertEqual(coordinator.isCurrent(gen1), false, "gen1 not current");
  assertEqual(coordinator.isCurrent(gen2), true, "gen2 is current");

  // gen1 events should be ignored.
  coordinator.handleEvent(gen1, EventType.RESOLVE_SUCCESS, { playSessionId: "session-1" });
  assertEqual(coordinator.getCurrent()?.generation, gen2, "gen2 still current after gen1 event");

  // gen2 events should be processed.
  coordinator.handleEvent(gen2, EventType.RESOLVE_SUCCESS, { playSessionId: "session-2" });
  assertEqual(coordinator.getCurrent()?.playSessionId, "session-2", "gen2 session ID");

  // Find the REPORT_STOPPED action for gen1 (superseded).
  const stoppedActions = actions.filter((a) => a.action === ActionType.REPORT_STOPPED);
  // gen1 never started, so no Stopped should be sent.
  assertEqual(stoppedActions.length, 0, "gen1 never started, no Stopped");
}

async function testLatestWinsTenIntents() {
  const actions = [];
  const coordinator = new SessionCoordinator();
  coordinator.setHandlers({
    onAction: (a) => actions.push(a),
    onStatus: () => {},
  });

  let lastGen = 0;
  for (let i = 0; i < 10; i++) {
    lastGen = coordinator.createIntent({ itemId: `item-${i}` });
  }

  // Only the last generation should be current.
  assertEqual(coordinator.isCurrent(lastGen), true, "last gen is current");

  // Complete the last intent successfully.
  coordinator.handleEvent(lastGen, EventType.RESOLVE_SUCCESS, { playSessionId: "final" });
  coordinator.handleEvent(lastGen, EventType.LOAD_SUCCESS);
  coordinator.handleEvent(lastGen, EventType.USER_STOP);

  // Count REPORT_PLAYING actions — only the last gen should have one.
  const playingActions = actions.filter((a) => a.action === ActionType.REPORT_PLAYING);
  assertEqual(playingActions.length, 1, "only one Playing");
  assertEqual(playingActions[0].generation, lastGen, "Playing from last gen");

  // Count REPORT_STOPPED — only the last gen (which started) should have one.
  const stoppedActions = actions.filter((a) => a.action === ActionType.REPORT_STOPPED);
  assertEqual(stoppedActions.length, 1, "only one Stopped");
  assertEqual(stoppedActions[0].generation, lastGen, "Stopped from last gen");
}

async function testSupersededSessionSendsOneStopped() {
  const actions = [];
  const coordinator = new SessionCoordinator();
  coordinator.setHandlers({
    onAction: (a) => actions.push(a),
    onStatus: () => {},
  });

  const gen1 = coordinator.createIntent({ itemId: "item-1" });
  // gen1 starts successfully.
  coordinator.handleEvent(gen1, EventType.RESOLVE_SUCCESS, { playSessionId: "session-1" });
  coordinator.handleEvent(gen1, EventType.LOAD_SUCCESS);

  // gen2 supersedes gen1.
  const gen2 = coordinator.createIntent({ itemId: "item-2" });

  // gen1 had started, so exactly one Stopped should be sent.
  const stoppedActions = actions.filter((a) => a.action === ActionType.REPORT_STOPPED);
  assertEqual(stoppedActions.length, 1, "one Stopped for gen1");
  assertEqual(stoppedActions[0].generation, gen1, "Stopped from gen1");
  assertEqual(stoppedActions[0].metadata.playSessionId, "session-1", "Stopped session ID");
}

async function testNeverStartedSendsNoStopped() {
  const actions = [];
  const coordinator = new SessionCoordinator();
  coordinator.setHandlers({
    onAction: (a) => actions.push(a),
    onStatus: () => {},
  });

  const gen1 = coordinator.createIntent({ itemId: "item-1" });
  // gen1 is in RESOLVING — never started.
  // gen2 supersedes gen1 before it starts.
  coordinator.createIntent({ itemId: "item-2" });

  const stoppedActions = actions.filter((a) => a.action === ActionType.REPORT_STOPPED);
  assertEqual(stoppedActions.length, 0, "no Stopped for never-started session");
}

async function testPendingCountDoesNotLeak() {
  const coordinator = new SessionCoordinator();

  for (let i = 0; i < 5; i++) {
    coordinator.createIntent({ itemId: `item-${i}` });
  }

  // After 5 intents, only the last one should be pending (others superseded).
  assertEqual(coordinator.pendingCount(), 1, "only last pending");
}

// ── Cancel registry tests ───────────────────────────────────────────

async function testCancelRegistryBasic() {
  const registry = new CancelRegistry();

  const { requestId, signal, controller } = registry.register({
    senderId: 1,
    frameId: 0,
    command: "search",
  });

  assert.ok(requestId, "requestId generated");
  assert.ok(!signal.aborted, "not initially aborted");
  assertEqual(registry.size(), 1, "registry size 1");

  // Cancel by wrong sender — should fail.
  const wrongCancel = registry.cancel(requestId, 999);
  assertEqual(wrongCancel, false, "wrong sender can't cancel");
  assertEqual(registry.size(), 1, "still size 1");

  // Cancel by correct sender.
  const correctCancel = registry.cancel(requestId, 1);
  assertEqual(correctCancel, true, "correct sender cancels");
  assert.ok(signal.aborted, "signal aborted after cancel");
  assertEqual(registry.size(), 0, "registry empty after cancel");
}

async function testCancelRegistryComplete() {
  const registry = new CancelRegistry();

  const { requestId } = registry.register({
    senderId: 1,
    command: "get_item",
  });

  assertEqual(registry.size(), 1, "size after register");

  registry.complete(requestId);
  assertEqual(registry.size(), 0, "size after complete");
  assertEqual(registry.has(requestId), false, "not in registry after complete");
}

async function testCancelAllForSender() {
  const registry = new CancelRegistry();

  // Register 3 requests: 2 from sender 1, 1 from sender 2.
  const r1 = registry.register({ senderId: 1, command: "search" });
  const r2 = registry.register({ senderId: 1, command: "get_item" });
  const r3 = registry.register({ senderId: 2, command: "search" });

  assertEqual(registry.size(), 3, "size 3");

  // Cancel all for sender 1 (e.g. window destroyed).
  const cancelled = registry.cancelAllForSender(1);
  assertEqual(cancelled, 2, "cancelled 2");
  assert.ok(r1.signal.aborted, "r1 aborted");
  assert.ok(r2.signal.aborted, "r2 aborted");
  assert.ok(!r3.signal.aborted, "r3 not aborted");
  assertEqual(registry.size(), 1, "size 1 after cancelAll");
}

async function testCancelRegistryIsolation() {
  const registry = new CancelRegistry();

  // Two senders register requests.
  const r1 = registry.register({ senderId: 1, command: "search" });
  const r2 = registry.register({ senderId: 2, command: "search" });

  // Sender 1 tries to cancel sender 2's request — should fail.
  const result = registry.cancel(r2.requestId, 1);
  assertEqual(result, false, "cross-window cancel denied");
  assert.ok(!r2.signal.aborted, "r2 not aborted by wrong sender");
}

// ── Run all tests ───────────────────────────────────────────────────

console.log("Playback recovery & latest-wins checks:");
console.log();

await test("idle → playing", testIdleToPlaying);
await test("user stop", testUserStop);
await test("supersede", testSupersede);
await test("external cancel", testExternalCancel);
await test("HTTP error triggers re-resolve", testHttpErrorTriggersReResolve);
await test("decode error triggers software decode", testDecodeErrorTriggersSoftwareDecode);
await test("player crash triggers recreate", testPlayerCrashTriggersRecreate);
await test("recovery success returns to playing", testRecoverySuccessReturnsToPlaying);
await test("budget exhaustion → failed", testBudgetExhaustion);
await test("stall triggers reload", testStallTriggersReload);
await test("terminal state ignores events", testTerminalStateIgnoresEvents);
await test("latest-wins basic supersede", testLatestWinsBasic);
await test("10 rapid intents → only last wins", testLatestWinsTenIntents);
await test("superseded started session sends one Stopped", testSupersededSessionSendsOneStopped);
await test("never-started session sends no Stopped", testNeverStartedSendsNoStopped);
await test("pending count does not leak", testPendingCountDoesNotLeak);
await test("cancel registry basic", testCancelRegistryBasic);
await test("cancel registry complete", testCancelRegistryComplete);
await test("cancel all for sender", testCancelAllForSender);
await test("cancel registry isolation", testCancelRegistryIsolation);

console.log();
console.log(`Playback recovery & latest-wins checks: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
