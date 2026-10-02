import assert from "node:assert/strict";
import test from "node:test";
import {
  getDataUrlBinaryBytes,
  getImageInputKind,
  getUtf8Bytes,
  IMAGE_PAYLOAD_LIMITS,
  needsPayloadOptimization,
  planOptimizationSizes,
} from "../lib/image-payload.ts";

test("data URL binary size is computed from base64 length and padding", () => {
  const bytes = Buffer.from("hello world!!");
  const dataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;
  assert.equal(getDataUrlBinaryBytes(dataUrl), bytes.length);
  assert.equal(getDataUrlBinaryBytes("https://example.com/a.jpg"), 0);
});

test("image inputs are classified without inspecting their contents", () => {
  assert.equal(getImageInputKind("data:image/png;base64,AAAA"), "data-url");
  assert.equal(getImageInputKind("/products/women/saree/SR001.jpg"), "catalogue-path");
  assert.equal(getImageInputKind("https://cdn.fashn.ai/x.jpg"), "remote-url");
  assert.equal(getImageInputKind(42), "other");
});

test("payload limits stay below the Netlify 6 MB buffered request limit", () => {
  assert.ok(
    IMAGE_PAYLOAD_LIMITS.safeRequestBytes <
      IMAGE_PAYLOAD_LIMITS.netlifyBufferedPayloadBytes,
  );
  assert.ok(
    IMAGE_PAYLOAD_LIMITS.targetImageDataUrlBytes * 2 <
      IMAGE_PAYLOAD_LIMITS.safeRequestBytes,
  );
  assert.equal(getUtf8Bytes(JSON.stringify({ a: "é" })), 10);
});

test("only oversized data URLs are optimised", () => {
  const small = `data:image/jpeg;base64,${"A".repeat(1_000_000)}`;
  const large = `data:image/jpeg;base64,${"A".repeat(2_100_000)}`;
  assert.equal(needsPayloadOptimization(small), false);
  assert.equal(needsPayloadOptimization(large), true);
  assert.equal(needsPayloadOptimization("https://cdn.example/large.jpg"), false);
});

test("optimisation never scales below the preferred photo-quality size", () => {
  for (const size of [
    { width: 3024, height: 4032 },
    { width: 4032, height: 3024 },
    { width: 6000, height: 4000 },
    { width: 1920, height: 1080 },
  ]) {
    const plan = planOptimizationSizes(size);
    assert.ok(plan.length >= 1);
    for (const candidate of plan) {
      const longSide = Math.max(candidate.width, candidate.height);
      const shortSide = Math.min(candidate.width, candidate.height);
      assert.ok(
        longSide >= IMAGE_PAYLOAD_LIMITS.preferredLongSide - 1 &&
          shortSide >= IMAGE_PAYLOAD_LIMITS.preferredShortSide - 1,
        `${candidate.width}x${candidate.height} is below the preferred size`,
      );
      assert.ok(candidate.width <= size.width && candidate.height <= size.height);
    }
    const first = plan[0];
    assert.ok(
      Math.max(first.width, first.height) <=
        Math.max(IMAGE_PAYLOAD_LIMITS.maxLongSide, IMAGE_PAYLOAD_LIMITS.preferredLongSide),
    );
  }
});

test("images smaller than the preferred size are never upscaled", () => {
  assert.deepEqual(planOptimizationSizes({ width: 1280, height: 720 }), [
    { width: 1280, height: 720 },
  ]);
});
