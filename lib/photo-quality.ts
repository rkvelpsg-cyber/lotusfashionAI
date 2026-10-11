import type { ImageSource, NormalizedLandmark, PoseLandmarker } from "@mediapipe/tasks-vision";

export const PHOTO_QUALITY_CONFIG = {
  minimumLongSide: 640,
  minimumShortSide: 480,
  preferredWidth: 1920,
  preferredHeight: 1080,
  darkMeanLuminance: 25,
  darkPixelLuminance: 35,
  darkPixelRatio: 0.72,
  overexposedMeanLuminance: 248,
  brightPixelLuminance: 245,
  brightPixelRatio: 0.32,
  rejectBlurVariance: 35,
  warnBlurVariance: 80,
  landmarkVisibility: 0.5,
} as const;

export type PhotoQualityState =
  | "ready"
  | "adjustment"
  | "retake"
  | "unavailable";

export type PhotoFinding = {
  state: "adjustment" | "retake";
  message: string;
};

export type PhotoQualityResult = {
  state: PhotoQualityState;
  width: number;
  height: number;
  blurVariance: number;
  meanLuminance: number;
  findings: PhotoFinding[];
  positioningHint?: string;
  poseUnavailable: boolean;
  canUsePhotoChecksOnly: boolean;
};

type ImageStatistics = {
  meanLuminance: number;
  darkPixelRatio: number;
  brightPixelRatio: number;
  laplacianVariance: number;
};

type FramingKind = "full" | "upper" | "lower" | "face" | "bag" | "feet" | "jewellery";

const framingByCategory: Record<string, FramingKind> = {
  chudithar: "full",
  "salwar-suit": "full",
  anarkali: "full",
  lehenga: "full",
  "kurti-set": "full",
  "long-gown": "full",
  saree: "full",
  "formal-shirt": "upper",
  "casual-shirt": "upper",
  tshirt: "upper",
  "formal-trouser": "lower",
  "casual-trouser": "lower",
  jeans: "lower",
  kurta: "upper",
  "kurta-pajama": "full",
  sherwani: "full",
  bag: "bag",
  shoes: "feet",
  jewellery: "jewellery",
  headwear: "face",
  glasses: "face",
};

const framingRequirements: Record<
  FramingKind,
  { landmarks: number[]; label: string; nearRatio: number; farRatio: number }
> = {
  full: {
    landmarks: [0, 11, 12, 23, 24, 25, 26, 27, 28],
    label: "your full body, from head to ankles",
    nearRatio: 0.94,
    farRatio: 0.52,
  },
  upper: {
    landmarks: [0, 11, 12, 23, 24],
    label: "your head, shoulders and waist",
    nearRatio: 0.86,
    farRatio: 0.32,
  },
  lower: {
    landmarks: [11, 12, 23, 24, 25, 26, 27, 28],
    label: "your waist, knees and ankles",
    nearRatio: 0.82,
    farRatio: 0.36,
  },
  face: {
    landmarks: [0, 2, 5, 7, 8],
    label: "your face",
    nearRatio: 0.5,
    farRatio: 0.12,
  },
  bag: {
    landmarks: [11, 12, 13, 14, 15, 16, 23, 24],
    label: "your shoulders, arms and waist",
    nearRatio: 0.86,
    farRatio: 0.3,
  },
  feet: {
    landmarks: [23, 24, 25, 26, 27, 28],
    label: "your legs and ankles",
    nearRatio: 0.82,
    farRatio: 0.34,
  },
  jewellery: {
    landmarks: [0, 2, 5, 7, 8, 11, 12],
    label: "your face, neck and shoulders",
    nearRatio: 0.76,
    farRatio: 0.24,
  },
};

const poseWasmPath =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const poseModelPath =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

let poseLandmarkerPromise: Promise<PoseLandmarker> | undefined;

export function getFramingRequirement(categoryId: string) {
  return framingRequirements[framingByCategory[categoryId] ?? "full"];
}

export function analyzeImageStatistics(
  width: number,
  height: number,
  statistics: ImageStatistics,
): PhotoFinding[] {
  const findings: PhotoFinding[] = [];
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);

  if (
    longSide < PHOTO_QUALITY_CONFIG.preferredWidth ||
    shortSide < PHOTO_QUALITY_CONFIG.preferredHeight
  ) {
    findings.push({
      state: "adjustment",
      message: "A higher-resolution photo may create a clearer result.",
    });
  }

  if (
    statistics.meanLuminance <= PHOTO_QUALITY_CONFIG.darkMeanLuminance
  ) {
    findings.push({
      state: "adjustment",
      message: "For better results, stand in a well-lit area.",
    });
  } else if (
    statistics.meanLuminance < 65 ||
    statistics.darkPixelRatio >= PHOTO_QUALITY_CONFIG.darkPixelRatio
  ) {
    findings.push({
      state: "adjustment",
      message: "Improve the lighting for a clearer photo.",
    });
  }

  if (
    statistics.meanLuminance >= PHOTO_QUALITY_CONFIG.overexposedMeanLuminance
  ) {
    findings.push({
      state: "adjustment",
      message: "Avoid bright glare if possible.",
    });
  } else if (
    statistics.meanLuminance > 215 ||
    statistics.brightPixelRatio >= PHOTO_QUALITY_CONFIG.brightPixelRatio
  ) {
    findings.push({
      state: "adjustment",
      message: "Reduce bright light or glare for a clearer photo.",
    });
  }

  if (statistics.laplacianVariance < PHOTO_QUALITY_CONFIG.rejectBlurVariance) {
    findings.push({
      state: "adjustment",
      message: "Try to keep the camera steady.",
    });
  } else if (statistics.laplacianVariance < PHOTO_QUALITY_CONFIG.warnBlurVariance) {
    findings.push({
      state: "adjustment",
      message: "Hold still for a sharper photo.",
    });
  }

  return findings;
}

export function assessPose(
  categoryId: string,
  landmarks: readonly NormalizedLandmark[] | undefined,
): { findings: PhotoFinding[]; positioningHint?: string } {
  if (!landmarks?.length) {
    return {
      findings: [
        {
          state: "adjustment",
          message: "A full-body photograph is recommended.",
        },
      ],
    };
  }

  const framing = getFramingRequirement(categoryId);
  const visible = (index: number) => {
    const landmark = landmarks[index];
    return (
      landmark &&
      (landmark.visibility === undefined ||
        landmark.visibility >= PHOTO_QUALITY_CONFIG.landmarkVisibility) &&
      landmark.x >= 0 &&
      landmark.x <= 1 &&
      landmark.y >= 0 &&
      landmark.y <= 1
    );
  };
  const findings: PhotoFinding[] = [];

  if (framing.landmarks.some((index) => !visible(index))) {
    findings.push({
      state: "adjustment",
      message: `For best results, include ${framing.label}.`,
    });
  }

  const usableLandmarks = framing.landmarks
    .map((index) => landmarks[index])
    .filter(
      (landmark): landmark is NormalizedLandmark =>
        Boolean(landmark) &&
        (landmark.visibility === undefined ||
          landmark.visibility >= PHOTO_QUALITY_CONFIG.landmarkVisibility),
    );
  if (!usableLandmarks.length) return { findings };

  const minY = Math.min(...usableLandmarks.map((landmark) => landmark.y));
  const maxY = Math.max(...usableLandmarks.map((landmark) => landmark.y));
  const heightRatio = maxY - minY;
  let positioningHint: string | undefined;

  if (heightRatio > framing.nearRatio) {
    positioningHint = "You appear close in the frame. Please move slightly backward.";
  } else if (heightRatio < framing.farRatio) {
    positioningHint = "You appear small in the frame. Please move slightly closer.";
  }

  const centerLandmarkIds =
    framing.landmarks.includes(11) && framing.landmarks.includes(12)
      ? [11, 12]
      : framing.landmarks.includes(27) && framing.landmarks.includes(28)
        ? [27, 28]
        : [0];
  const centerPoints = centerLandmarkIds
    .map((index) => landmarks[index])
    .filter((landmark): landmark is NormalizedLandmark => Boolean(landmark));
  const centerX =
    centerPoints.reduce((total, landmark) => total + landmark.x, 0) /
    centerPoints.length;
  if (Math.abs(centerX - 0.5) > 0.16) {
    positioningHint = "Position yourself in the centre of the frame.";
  }

  if (positioningHint) {
    findings.push({ state: "adjustment", message: positioningHint });
  }
  return { findings, positioningHint };
}

export function createPhotoQualityResult({
  width,
  height,
  blurVariance,
  meanLuminance,
  imageFindings,
  poseFindings,
  positioningHint,
  poseUnavailable = false,
}: {
  width: number;
  height: number;
  blurVariance: number;
  meanLuminance: number;
  imageFindings: PhotoFinding[];
  poseFindings?: PhotoFinding[];
  positioningHint?: string;
  poseUnavailable?: boolean;
}): PhotoQualityResult {
  const findings = [...imageFindings, ...(poseFindings ?? [])].map((finding) => ({
    ...finding,
    state: "adjustment" as const,
  }));
  const hasAdjustmentFinding = findings.some(
    (finding) => finding.state === "adjustment",
  );

  return {
    state: poseUnavailable
        ? "unavailable"
        : hasAdjustmentFinding
          ? "adjustment"
          : "ready",
    width,
    height,
    blurVariance,
    meanLuminance,
    findings,
    positioningHint,
    poseUnavailable,
    canUsePhotoChecksOnly: poseUnavailable,
  };
}

export function canAcceptPhotoQualityResult(
  result: PhotoQualityResult | null,
) {
  return result !== null;
}

export function measureImagePixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ImageStatistics {
  const pixelCount = pixels.length / 4;
  const luminance = new Float32Array(pixelCount);
  let total = 0;
  let darkPixels = 0;
  let brightPixels = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const value =
      0.2126 * pixels[offset] +
      0.7152 * pixels[offset + 1] +
      0.0722 * pixels[offset + 2];
    luminance[pixel] = value;
    total += value;
    if (value < PHOTO_QUALITY_CONFIG.darkPixelLuminance) darkPixels += 1;
    if (value > PHOTO_QUALITY_CONFIG.brightPixelLuminance) brightPixels += 1;
  }

  let laplacianSum = 0;
  let laplacianSquareSum = 0;
  let laplacianCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (index + width + 1 >= pixelCount) continue;
      const laplacian =
        luminance[index - width] +
          luminance[index - 1] -
          4 * luminance[index] +
          luminance[index + 1] +
          luminance[index + width];
      laplacianSum += laplacian;
      laplacianSquareSum += laplacian * laplacian;
      laplacianCount += 1;
    }
  }

  const laplacianMean = laplacianSum / Math.max(1, laplacianCount);
  const laplacianVariance = Math.max(
    0,
    laplacianSquareSum / Math.max(1, laplacianCount) -
      laplacianMean * laplacianMean,
  );

  return {
    meanLuminance: total / Math.max(1, pixelCount),
    darkPixelRatio: darkPixels / Math.max(1, pixelCount),
    brightPixelRatio: brightPixels / Math.max(1, pixelCount),
    laplacianVariance,
  };
}

// MediaPipe's WASM runtime reports informational messages (e.g. "INFO: Created
// TensorFlow Lite XNNPACK delegate for CPU.") through console.error, which the
// Next.js dev overlay shows as a console error. Downgrade only those messages.
const MEDIAPIPE_INFO_LOG =
  /^\s*(?:INFO:|W\d{4} |I\d{4} )|XNNPACK delegate|TensorFlow Lite/;

function isMediaPipeInfoLog(args: unknown[]) {
  return typeof args[0] === "string" && MEDIAPIPE_INFO_LOG.test(args[0]);
}

async function withQuietMediaPipeLogs<T>(task: () => T | Promise<T>) {
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    if (isMediaPipeInfoLog(args)) {
      console.debug(...args);
      return;
    }
    originalError(...args);
  };
  try {
    return await task();
  } finally {
    console.error = originalError;
  }
}

function withQuietMediaPipeLogsSync<T>(task: () => T) {
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    if (isMediaPipeInfoLog(args)) {
      console.debug(...args);
      return;
    }
    originalError(...args);
  };
  try {
    return task();
  } finally {
    console.error = originalError;
  }
}

async function loadPoseLandmarker() {
  if (!poseLandmarkerPromise) {
    poseLandmarkerPromise = withQuietMediaPipeLogs(async () => {
      const { FilesetResolver, PoseLandmarker } = await import(
        "@mediapipe/tasks-vision"
      );
      const vision = await FilesetResolver.forVisionTasks(poseWasmPath);
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: poseModelPath },
        runningMode: "IMAGE",
        numPoses: 1,
        minPoseDetectionConfidence: 0.55,
        minPosePresenceConfidence: 0.55,
        minTrackingConfidence: 0.5,
      });
    }).catch((error: unknown) => {
      poseLandmarkerPromise = undefined;
      throw error;
    });
  }
  return poseLandmarkerPromise;
}

export async function detectPoseLandmarks(image: ImageSource) {
  const detector = await loadPoseLandmarker();
  return withQuietMediaPipeLogsSync(() => detector.detect(image).landmarks[0]);
}

export async function validatePhoto(
  source: string | Blob,
  categoryId: string,
): Promise<PhotoQualityResult> {
  let decodedImage: ImageBitmap | HTMLImageElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    let blob: Blob;
    if (typeof source === "string") {
      const response = await fetch(source);
      if (!response.ok) throw new Error("The photo could not be loaded.");
      blob = await response.blob();
    } else {
      blob = source;
    }
    if (
      !blob.size ||
      !["image/jpeg", "image/png", "image/webp"].includes(blob.type)
    ) {
      throw new Error("Choose a non-empty JPG, PNG or WEBP photo.");
    }
    if (typeof createImageBitmap === "function") {
      try {
        decodedImage = await createImageBitmap(blob);
      } catch {
        decodedImage = undefined;
      }
    }
    if (!decodedImage) {
      const objectUrl = URL.createObjectURL(blob);
      try {
        decodedImage = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error("The photo could not be decoded."));
          image.src = objectUrl;
        });
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
    const width = decodedImage.width;
    const height = decodedImage.height;
    if (!width || !height) throw new Error("The photo has invalid dimensions.");
    const scale = Math.min(1, 512 / Math.max(width, height));
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return createPhotoQualityResult({
        width,
        height,
        blurVariance: 0,
        meanLuminance: 0,
        imageFindings: [
          { state: "adjustment", message: "Photo quality suggestions are unavailable on this device." },
        ],
        poseUnavailable: true,
      });
    }
    context.drawImage(decodedImage, 0, 0, canvas.width, canvas.height);
    let pixels: Uint8ClampedArray;
    try {
      pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    } catch {
      return createPhotoQualityResult({
        width,
        height,
        blurVariance: 0,
        meanLuminance: 0,
        imageFindings: [
          { state: "adjustment", message: "Photo quality suggestions are unavailable on this device." },
        ],
        poseUnavailable: true,
      });
    }
    const statistics = measureImagePixels(pixels, canvas.width, canvas.height);
    const imageFindings = analyzeImageStatistics(width, height, statistics);

    try {
      const pose = assessPose(categoryId, await detectPoseLandmarks(canvas));
      return createPhotoQualityResult({
        width,
        height,
        blurVariance: statistics.laplacianVariance,
        meanLuminance: statistics.meanLuminance,
        imageFindings,
        poseFindings: pose.findings,
        positioningHint: pose.positioningHint,
      });
    } catch {
      return createPhotoQualityResult({
        width,
        height,
        blurVariance: statistics.laplacianVariance,
        meanLuminance: statistics.meanLuminance,
        imageFindings,
        poseUnavailable: true,
      });
    }
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message
        ? error.message
        : "This photo could not be opened. Choose a valid JPG, PNG or WEBP image.",
    );
  } finally {
    if (decodedImage && "close" in decodedImage) decodedImage.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

export async function getLivePositioningHint(
  source: HTMLCanvasElement,
  categoryId: string,
) {
  const landmarks = await detectPoseLandmarks(source);
  const assessment = assessPose(categoryId, landmarks);
  return assessment.positioningHint ?? assessment.findings[0]?.message;
}
