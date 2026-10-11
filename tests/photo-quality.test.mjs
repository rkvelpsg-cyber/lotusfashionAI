import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeImageStatistics,
  assessPose,
  canAcceptPhotoQualityResult,
  createPhotoQualityResult,
  getFramingRequirement,
  measureImagePixels,
  validatePhoto,
} from "../lib/photo-quality.ts";

const size = 256;

function makeRaster(colorAt) {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const color = colorAt(x, y);
      pixels[index] = color;
      pixels[index + 1] = color;
      pixels[index + 2] = color;
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

function clearPhotoPixels() {
  return makeRaster((x, y) => ((x + y) % 2 === 0 ? 110 : 160));
}

function poseLandmarks() {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 0.95,
  }));
  landmarks[0] = { x: 0.5, y: 0.08, visibility: 0.95 };
  landmarks[2] = { x: 0.47, y: 0.08, visibility: 0.95 };
  landmarks[5] = { x: 0.53, y: 0.08, visibility: 0.95 };
  landmarks[7] = { x: 0.44, y: 0.1, visibility: 0.95 };
  landmarks[8] = { x: 0.56, y: 0.1, visibility: 0.95 };
  landmarks[11] = { x: 0.4, y: 0.25, visibility: 0.95 };
  landmarks[12] = { x: 0.6, y: 0.25, visibility: 0.95 };
  landmarks[13] = { x: 0.35, y: 0.4, visibility: 0.95 };
  landmarks[14] = { x: 0.65, y: 0.4, visibility: 0.95 };
  landmarks[15] = { x: 0.3, y: 0.55, visibility: 0.95 };
  landmarks[16] = { x: 0.7, y: 0.55, visibility: 0.95 };
  landmarks[23] = { x: 0.43, y: 0.55, visibility: 0.95 };
  landmarks[24] = { x: 0.57, y: 0.55, visibility: 0.95 };
  landmarks[25] = { x: 0.43, y: 0.72, visibility: 0.95 };
  landmarks[26] = { x: 0.57, y: 0.72, visibility: 0.95 };
  landmarks[27] = { x: 0.43, y: 0.92, visibility: 0.95 };
  landmarks[28] = { x: 0.57, y: 0.92, visibility: 0.95 };
  return landmarks;
}

test("clear, well-framed full-body photo is ready", () => {
  const statistics = measureImagePixels(clearPhotoPixels(), size, size);
  const imageFindings = analyzeImageStatistics(1920, 1080, statistics);
  const pose = assessPose("saree", poseLandmarks());
  const result = createPhotoQualityResult({
    width: 1920,
    height: 1080,
    blurVariance: statistics.laplacianVariance,
    meanLuminance: statistics.meanLuminance,
    imageFindings,
    poseFindings: pose.findings,
    positioningHint: pose.positioningHint,
  });

  assert.equal(result.state, "ready");
  assert.equal(result.findings.length, 0);
});

test("dark photo asks for improved lighting", () => {
  const statistics = measureImagePixels(makeRaster(() => 20), size, size);
  const findings = analyzeImageStatistics(1920, 1080, statistics);
  assert.ok(findings.some((finding) => finding.message.includes("well-lit")));
  assert.ok(findings.every((finding) => finding.state === "adjustment"));
});

test("heavily overexposed photo receives an optional warning", () => {
  const statistics = measureImagePixels(makeRaster(() => 250), size, size);
  const findings = analyzeImageStatistics(1920, 1080, statistics);
  assert.ok(findings.some((finding) => finding.message.includes("glare")));
  assert.ok(findings.every((finding) => finding.state === "adjustment"));
});

test("low resolution and uneven exposure only recommend adjustments", () => {
  const findings = analyzeImageStatistics(1920, 1080, {
    meanLuminance: 130,
    darkPixelRatio: 0.8,
    brightPixelRatio: 0.1,
    laplacianVariance: 100,
  });
  assert.ok(findings.some((finding) => finding.state === "adjustment"));
  assert.equal(
    analyzeImageStatistics(320, 240, {
      meanLuminance: 130,
      darkPixelRatio: 0,
      brightPixelRatio: 0,
      laplacianVariance: 100,
    }).some((finding) => finding.state === "retake"),
    false,
  );
});

test("blurry photo receives an optional steady-camera warning", () => {
  const statistics = measureImagePixels(makeRaster(() => 128), size, size);
  const findings = analyzeImageStatistics(1920, 1080, statistics);
  assert.ok(findings.some((finding) => finding.message.includes("steady")));
  assert.ok(findings.every((finding) => finding.state === "adjustment"));
});

test("cropped full-body photo recommends better framing without rejection", () => {
  const landmarks = poseLandmarks();
  landmarks[27] = { x: 0.43, y: 1.05, visibility: 0.2 };
  landmarks[28] = { x: 0.57, y: 1.05, visibility: 0.2 };
  const result = assessPose("saree", landmarks);
  assert.equal(result.findings[0].state, "adjustment");
  assert.ok(result.findings[0].message.includes("full body"));
});

test("upper-body category does not require knees or ankles", () => {
  const landmarks = poseLandmarks();
  for (const index of [25, 26, 27, 28]) landmarks[index].visibility = 0;
  const result = assessPose("formal-shirt", landmarks);
  assert.equal(result.findings.some((finding) => finding.state === "retake"), false);
  assert.deepEqual(getFramingRequirement("formal-shirt").landmarks, [
    0, 11, 12, 23, 24,
  ]);
});

test("accessory checks focus on the relevant visible region", () => {
  const landmarks = poseLandmarks();
  for (const index of [11, 12, 23, 24, 25, 26, 27, 28]) {
    landmarks[index].visibility = 0;
  }
  assert.equal(
    assessPose("headwear", landmarks).findings.some(
      (finding) => finding.state === "retake",
    ),
    false,
  );
  assert.equal(
    assessPose("shoes", landmarks).findings.some(
    (finding) => finding.state === "adjustment",
    ),
    true,
  );
});

test("uploaded photo raster uses the same local analysis without alteration", () => {
  const uploadedPhotoPixels = clearPhotoPixels();
  const originalPixels = uploadedPhotoPixels.slice();
  const statistics = measureImagePixels(uploadedPhotoPixels, size, size);
  const findings = analyzeImageStatistics(1280, 720, statistics);
  assert.deepEqual(uploadedPhotoPixels, originalPixels);
  assert.equal(findings.some((finding) => finding.state === "retake"), false);
});

test("unavailable pose checks remain advisory and photo acceptance is not blocked", () => {
  const result = createPhotoQualityResult({
    width: 1920,
    height: 1080,
    blurVariance: 100,
    meanLuminance: 120,
    imageFindings: [],
    poseUnavailable: true,
  });
  assert.equal(result.state, "unavailable");
  assert.equal(result.canUsePhotoChecksOnly, true);
  assert.equal(canAcceptPhotoQualityResult(result), true);

  const failedImageResult = createPhotoQualityResult({
    width: 1920,
    height: 1080,
    blurVariance: 10,
    meanLuminance: 120,
    imageFindings: [{ state: "retake", message: "Blurry" }],
    poseUnavailable: true,
  });
  assert.equal(failedImageResult.canUsePhotoChecksOnly, true);
  assert.equal(canAcceptPhotoQualityResult(failedImageResult), true);
  assert.equal(canAcceptPhotoQualityResult(null), false);
});

test("retake findings are downgraded to optional warnings in the final result", () => {
  const result = createPhotoQualityResult({
    width: 320,
    height: 240,
    blurVariance: 1,
    meanLuminance: 20,
    imageFindings: [{ state: "retake", message: "For better results, stand in a well-lit area." }],
    poseFindings: [{ state: "retake", message: "A full-body photograph is recommended." }],
  });
  assert.equal(result.state, "adjustment");
  assert.ok(result.findings.every((finding) => finding.state === "adjustment"));
  assert.equal(canAcceptPhotoQualityResult(result), true);
  assert.equal(canAcceptPhotoQualityResult({ ...result, state: "retake" }), true);
});

test("empty and unsupported images remain technical validation errors", async () => {
  await assert.rejects(
    validatePhoto(new Blob([], { type: "image/jpeg" }), "saree"),
    /non-empty JPG, PNG or WEBP/i,
  );
  await assert.rejects(
    validatePhoto(new Blob(["not an image"], { type: "image/gif" }), "saree"),
    /non-empty JPG, PNG or WEBP/i,
  );
});
