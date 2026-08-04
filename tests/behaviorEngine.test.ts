import assert from "node:assert/strict";
import test from "node:test";
import { BehaviorEngine } from "../src/domain/behavior/behaviorEngine";

test("resolves the idle visual from available animation names", () => {
  const engine = new BehaviorEngine();
  engine.setAvailableActions(["Walk", "Idle", "Attack"]);
  assert.equal(engine.resolveVisualAction(), "Idle");
});

test("uses a safe visual fallback when Eat is absent", () => {
  const engine = new BehaviorEngine();
  engine.setAvailableActions(["Idle", "Walk"]);
  engine.interactFeed();
  assert.equal(engine.getState().currentAction, "eat");
  assert.equal(engine.resolveVisualAction(), "Idle");
});

test("prefers Bite as the visual feeding action when available", () => {
  const engine = new BehaviorEngine();
  engine.setAvailableActions(["Idle", "Bite"]);
  engine.interactFeed();
  assert.equal(engine.resolveVisualAction(), "Bite");
});

test("forces only animations that actually exist", () => {
  const engine = new BehaviorEngine();
  engine.setAvailableActions(["Idle", "Dance"]);
  engine.forceState("Dance");
  assert.equal(engine.getState().currentAction, "Dance");
  assert.equal(engine.resolveVisualAction(), "Dance");

  engine.forceState("MissingAction");
  assert.equal(engine.getState().currentAction, "Dance");
});

test("caps large delta times from backgrounded browser tabs", () => {
  const engine = new BehaviorEngine();
  engine.setAvailableActions(["Idle"]);
  const before = engine.getState();
  const after = engine.tick(60);
  assert.ok(before.energy - after.energy < 0.02);
  assert.ok(after.hunger - before.hunger < 0.02);
});
