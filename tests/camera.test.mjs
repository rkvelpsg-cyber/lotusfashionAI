import assert from "node:assert/strict";
import test from "node:test";
import {
  getCameraConstraints,
  getCameraFacing,
  isMobileOrTablet,
  openCameraStream,
} from "../lib/camera.ts";

function makeStream(deviceId, facingMode, onStop = () => {}) {
  const track = {
    getSettings: () => ({ deviceId, facingMode }),
    stop: onStop,
  };
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  };
}

function device(deviceId, label, kind = "videoinput") {
  return { deviceId, label, kind };
}

function namedError(name) {
  return Object.assign(new Error(name), { name });
}

test("mobile and tablet detection includes iPads using desktop-class user agents", () => {
  assert.equal(isMobileOrTablet("Mozilla/5.0 (Linux; Android 15)", "Linux", 1), true);
  assert.equal(isMobileOrTablet("Mozilla/5.0 (iPhone)", "iPhone", 5), true);
  assert.equal(isMobileOrTablet("Mozilla/5.0 (Macintosh)", "MacIntel", 5), true);
  assert.equal(isMobileOrTablet("Mozilla/5.0 (Windows NT 10.0)", "Win32", 10), false);
});

test("mobile camera constraints prefer environment without forcing a resolution", () => {
  assert.deepEqual(getCameraConstraints(true)[0], {
    video: { facingMode: { ideal: "environment" } },
    audio: false,
  });
  assert.deepEqual(getCameraConstraints(true, "user")[0], {
    video: { facingMode: { ideal: "user" } },
    audio: false,
  });
});

test("camera preview facing follows track settings and camera labels", () => {
  assert.equal(
    getCameraFacing(makeStream("rear-id", "environment"), [], "user"),
    "environment",
  );
  assert.equal(
    getCameraFacing(makeStream("front-id", undefined), [
      device("front-id", "Front Camera"),
    ], "environment"),
    "user",
  );
});

test("desktop camera selection preserves its existing resolution priorities", () => {
  assert.deepEqual(getCameraConstraints(false), [
    {
      video: {
        facingMode: { ideal: "user" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    },
    {
      video: {
        facingMode: { ideal: "user" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    },
    { video: true, audio: false },
  ]);
});

test("desktop camera initialization keeps the original ordered fallbacks", async () => {
  const calls = [];
  const desktopStream = makeStream("standee-camera", "user");
  const mediaDevices = {
    async getUserMedia(constraints) {
      calls.push(constraints);
      if (calls.length < 3) throw namedError("OverconstrainedError");
      return desktopStream;
    },
    async enumerateDevices() {
      throw new Error("Desktop selection does not enumerate devices.");
    },
  };

  const result = await openCameraStream(
    mediaDevices,
    false,
    "environment",
  );

  assert.deepEqual(calls, getCameraConstraints(false));
  assert.equal(result.stream, desktopStream);
  assert.equal(result.facingMode, "user");
});

test("mobile camera opens the rear camera identified after permission", async () => {
  const calls = [];
  const fallbackStream = makeStream("front-id", "user");
  const rearStream = makeStream("rear-id", "environment");
  const mediaDevices = {
    async getUserMedia(constraints) {
      calls.push(constraints);
      if (constraints.video?.facingMode) {
        throw namedError("NotFoundError");
      }
      if (constraints.video?.deviceId?.exact === "rear-id") return rearStream;
      return fallbackStream;
    },
    async enumerateDevices() {
      return [
        device("front-id", "Front Camera"),
        device("rear-id", "Back Camera"),
      ];
    },
  };

  const result = await openCameraStream(
    mediaDevices,
    true,
    "environment",
  );

  assert.equal(result.stream, rearStream);
  assert.equal(result.facingMode, "environment");
  assert.deepEqual(calls[1], { video: true, audio: false });
  assert.deepEqual(calls[2], {
    video: { deviceId: { exact: "rear-id" } },
    audio: false,
  });
});

test("camera enumeration is deferred until a stream grants camera permission", async () => {
  const events = [];
  const stream = makeStream("rear-id", "environment");
  const mediaDevices = {
    async getUserMedia(constraints) {
      events.push("getUserMedia");
      if (constraints.video?.facingMode) throw namedError("NotFoundError");
      return stream;
    },
    async enumerateDevices() {
      events.push("enumerateDevices");
      return [device("rear-id", "Rear Camera")];
    },
  };

  await openCameraStream(mediaDevices, true, "environment");
  assert.deepEqual(events, ["getUserMedia", "getUserMedia", "enumerateDevices"]);
});

test("mobile rear-camera initialization falls back to a usable camera", async () => {
  const calls = [];
  const fallbackStream = makeStream("front-id", "user");
  const mediaDevices = {
    async getUserMedia(constraints) {
      calls.push(constraints);
      if (constraints.video?.facingMode) {
        throw namedError("NotFoundError");
      }
      return fallbackStream;
    },
    async enumerateDevices() {
      return [device("front-id", "Front Camera")];
    },
  };

  const result = await openCameraStream(
    mediaDevices,
    true,
    "environment",
  );

  assert.equal(result.stream, fallbackStream);
  assert.equal(result.facingMode, "user");
  assert.match(result.notice, /rear camera is unavailable/i);
});

test("mobile switches stop the current stream before opening a labeled rear camera", async () => {
  const calls = [];
  let previousTrackStopped = false;
  const previousStream = makeStream("front-id", "user", () => {
    previousTrackStopped = true;
  });
  const rearStream = makeStream("rear-id", "environment");
  const mediaDevices = {
    async getUserMedia(constraints) {
      calls.push(constraints);
      if (constraints.video?.facingMode) return previousStream;
      assert.equal(previousTrackStopped, true);
      return rearStream;
    },
    async enumerateDevices() {
      return [device("front-id", "Front Camera"), device("rear-id", "Rear Camera")];
    },
  };

  const result = await openCameraStream(
    mediaDevices,
    true,
    "environment",
  );

  assert.equal(previousTrackStopped, true);
  assert.equal(result.stream, rearStream);
  assert.equal(result.facingMode, "environment");
});
