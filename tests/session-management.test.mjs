import assert from "node:assert/strict";
import test from "node:test";
import { GenerationRequestGuard } from "../lib/generation-guard.ts";
import {
  getInactivityCountdown,
  getRemainingSeconds,
  parseDuration,
} from "../lib/session.ts";

test("session durations use a positive integer configuration or the fallback", () => {
  assert.equal(parseDuration("180000", 1), 180000);
  assert.equal(parseDuration("0", 500), 500);
  assert.equal(parseDuration("-1", 500), 500);
  assert.equal(parseDuration("1.5", 500), 500);
  assert.equal(parseDuration(undefined, 500), 500);
});

test("inactivity countdown never becomes negative", () => {
  assert.equal(getRemainingSeconds(6100, 1000), 6);
  assert.equal(getRemainingSeconds(1000, 1000), 0);
  assert.equal(getRemainingSeconds(500, 1000), 0);
});

test("active session receives its full warning before reset", () => {
  assert.equal(getInactivityCountdown(179999, 180000, 60000), null);
  assert.equal(getInactivityCountdown(180000, 180000, 60000), 60);
  assert.equal(getInactivityCountdown(239500, 180000, 60000), 1);
  assert.equal(getInactivityCountdown(240000, 180000, 60000), 0);
});

test("completed screen timeout includes a final warning countdown", () => {
  assert.equal(getInactivityCountdown(119999, 180000, 60000, true), null);
  assert.equal(getInactivityCountdown(120000, 180000, 60000, true), 60);
  assert.equal(getInactivityCountdown(180000, 180000, 60000, true), 0);
});

test("generation guard rejects concurrent requests and releases after completion", () => {
  const guard = new GenerationRequestGuard();
  assert.equal(guard.tryStart(), true);
  assert.equal(guard.isActive(), true);
  assert.equal(guard.tryStart(), false);
  guard.finish();
  assert.equal(guard.isActive(), false);
  assert.equal(guard.tryStart(), true);
});
