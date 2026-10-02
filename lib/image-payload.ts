// Netlify Functions accept at most 6 MB buffered request bodies (not configurable).
// Images travel as base64 data URLs inside the JSON body, so the app keeps a
// safety margin below that limit.
export const IMAGE_PAYLOAD_LIMITS = {
  netlifyBufferedPayloadBytes: 6 * 1000 * 1000,
  safeRequestBytes: 4_500_000,
  // Per data-URL image so a customer photo and an uploaded product both fit.
  targetImageDataUrlBytes: 2_000_000,
  // Keep optimised photos at or above the photo-quality "preferred" size.
  preferredLongSide: 1920,
  preferredShortSide: 1080,
  maxLongSide: 2560,
  jpegQualities: [0.92, 0.88, 0.85] as readonly number[],
} as const;

export type ImageInputKind = "data-url" | "catalogue-path" | "remote-url" | "other";

export type ImageDimensions = { width: number; height: number };

export type ImageOptimizationReport = {
  optimized: boolean;
  original: ImageDimensions & { bytes: number };
  final: ImageDimensions & { bytes: number };
  quality: number | null;
};

export class ImagePayloadTooLargeError extends Error {
  constructor(message = "This photo is too large to send. Please retake it or choose a smaller photo.") {
    super(message);
    this.name = "ImagePayloadTooLargeError";
  }
}

export function getImageInputKind(value: unknown): ImageInputKind {
  if (typeof value !== "string") return "other";
  if (value.startsWith("data:")) return "data-url";
  if (value.startsWith("/products/")) return "catalogue-path";
  if (/^https?:\/\//i.test(value)) return "remote-url";
  return "other";
}

/** Decoded binary size of a base64 data URL, without decoding it. */
export function getDataUrlBinaryBytes(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || commaIndex < 0) return 0;
  const base64Length = dataUrl.length - commaIndex - 1;
  const padding = dataUrl.endsWith("==") ? 2 : dataUrl.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64Length * 3) / 4) - padding);
}

/** UTF-8 byte length of a request body string. */
export function getUtf8Bytes(value: string) {
  return new TextEncoder().encode(value).length;
}

export function formatBytes(bytes: number) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

export function needsPayloadOptimization(dataUrl: string) {
  return (
    dataUrl.startsWith("data:") &&
    dataUrl.length > IMAGE_PAYLOAD_LIMITS.targetImageDataUrlBytes
  );
}

/**
 * Candidate output sizes, largest first. Never scales below the preferred
 * photo-quality size (or the original size when the original is smaller).
 */
export function planOptimizationSizes({ width, height }: ImageDimensions) {
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);
  const floorScale = Math.min(
    1,
    Math.max(
      IMAGE_PAYLOAD_LIMITS.preferredLongSide / longSide,
      IMAGE_PAYLOAD_LIMITS.preferredShortSide / shortSide,
    ),
  );
  const startScale = Math.max(
    floorScale,
    Math.min(1, IMAGE_PAYLOAD_LIMITS.maxLongSide / longSide),
  );
  const scales = [startScale];
  for (const step of [0.85, 0.7]) {
    const scale = Math.max(floorScale, startScale * step);
    if (scale < scales[scales.length - 1] - 0.001) scales.push(scale);
  }
  if (floorScale < scales[scales.length - 1] - 0.001) scales.push(floorScale);
  return scales.map((scale) => ({
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }));
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to read image."));
    image.src = dataUrl;
  });
}

/**
 * Re-encodes an oversized data URL as JPEG so the try-on request fits the
 * Netlify payload limit. Images already within budget are returned unchanged.
 */
export async function optimizeImageForUpload(
  dataUrl: string,
): Promise<{ dataUrl: string; report: ImageOptimizationReport }> {
  const image = await loadImage(dataUrl);
  const original = {
    width: image.naturalWidth,
    height: image.naturalHeight,
    bytes: getDataUrlBinaryBytes(dataUrl),
  };
  if (!needsPayloadOptimization(dataUrl)) {
    return {
      dataUrl,
      report: { optimized: false, original, final: original, quality: null },
    };
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new ImagePayloadTooLargeError();

  for (const size of planOptimizationSizes(original)) {
    canvas.width = size.width;
    canvas.height = size.height;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, size.width, size.height);
    for (const quality of IMAGE_PAYLOAD_LIMITS.jpegQualities) {
      const candidate = canvas.toDataURL("image/jpeg", quality);
      if (candidate.length <= IMAGE_PAYLOAD_LIMITS.targetImageDataUrlBytes) {
        canvas.width = 0;
        canvas.height = 0;
        return {
          dataUrl: candidate,
          report: {
            optimized: true,
            original,
            final: { ...size, bytes: getDataUrlBinaryBytes(candidate) },
            quality,
          },
        };
      }
    }
  }
  canvas.width = 0;
  canvas.height = 0;
  throw new ImagePayloadTooLargeError();
}

export function describeOptimization(report: ImageOptimizationReport) {
  if (!report.optimized) return "";
  const { original, final } = report;
  return `Photo optimised for upload: ${original.width} × ${original.height} (${formatBytes(
    original.bytes,
  )}) → ${final.width} × ${final.height} (${formatBytes(final.bytes)}).`;
}
