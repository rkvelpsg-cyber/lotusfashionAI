import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import Fashn from "fashn";
import { getItem } from "@/lib/catalog";
import {
  getDataUrlBinaryBytes,
  getImageInputKind,
  IMAGE_PAYLOAD_LIMITS,
} from "@/lib/image-payload";

export const runtime = "nodejs";
export const maxDuration = 60;

const PRODUCTS_ROOT = path.resolve(process.cwd(), "public", "products");
const IMAGE_MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
} as const;

function getProductCode(value: unknown) {
  if (typeof value !== "string") return "unavailable";
  try {
    const pathname = new URL(value).pathname;
    const code = pathname.split("/").pop()?.split(".")[0] || "";
    return /^[A-Za-z0-9_-]{1,40}$/.test(code) ? code : "unavailable";
  } catch {
    return "unavailable";
  }
}

function isValidImageInput(value: string) {
  if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return true;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeCustomerImage(value: string) {
  if (isValidImageInput(value)) return value;
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return `data:image/jpeg;base64,${value}`;
  }
  return value;
}

async function resolveGarmentImage(value: string) {
  if (!value.startsWith("/products/")) return value;

  const encodedRelativePath = value.slice("/products/".length).split(/[?#]/)[0];
  const relativePath = decodeURIComponent(encodedRelativePath);
  if (relativePath.includes("\\") || relativePath.split("/").includes("..")) {
    throw new Error("Garment image path is not allowed.");
  }

  const filePath = path.resolve(PRODUCTS_ROOT, ...relativePath.split("/"));
  const productsRootWithSeparator = `${PRODUCTS_ROOT}${path.sep}`;
  if (!filePath.startsWith(productsRootWithSeparator)) {
    throw new Error("Garment image path is not allowed.");
  }

  const extension = path
    .extname(filePath)
    .toLowerCase() as keyof typeof IMAGE_MIME_TYPES;
  const mimeType = IMAGE_MIME_TYPES[extension];
  if (!mimeType) {
    throw new Error("Unsupported garment image format.");
  }

  const image = await readFile(filePath);
  return `data:${mimeType};base64,${image.toString("base64")}`;
}

function diagnosticFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, init);
}

function getSafeFailureReason(error: unknown, apiKey: string | undefined) {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "Unexpected error";
  const sanitized = message
    .replace(/data:[^\s,]+;base64,[A-Za-z0-9+/=]+/gi, "[image data removed]")
    .replace(/[A-Za-z0-9+/]{128,}={0,2}/g, "[payload removed]")
    .replace(/https?:\/\/\S+/gi, "[provider URL removed]")
    .replace(/[\r\n\t]+/g, " ");
  return (apiKey ? sanitized.replaceAll(apiKey, "[credential removed]") : sanitized).slice(
    0,
    240,
  );
}

export async function POST(request: NextRequest) {
  let stage = "request parsing";
  const startedAt = Date.now();
  let sessionId: string = randomUUID();
  let productCode = "unavailable";
  let category = "unknown";
  let predictionId: string | null = null;
  let requestStatus = "failed";
  let failureReason = "Request did not complete.";
  const apiKey = process.env.FASHN_API_KEY;
  const contentLength = Number(request.headers.get("content-length"));
  // Sizes and input kinds only; image contents are never logged.
  const payload = {
    requestBytes: Number.isFinite(contentLength) ? contentLength : null,
    modelImageKind: "other",
    modelImageBytes: null as number | null,
    productImageKind: "other",
    productImageBytes: null as number | null,
  };

  try {
    if (
      payload.requestBytes !== null &&
      payload.requestBytes > IMAGE_PAYLOAD_LIMITS.netlifyBufferedPayloadBytes
    ) {
      failureReason = "Request body exceeds the hosting payload limit.";
      return NextResponse.json(
        {
          error:
            "These images are too large to send. Please retake the photo or choose a smaller image.",
        },
        { status: 413 },
      );
    }

    const body = await request.json();
    const {
      modelImage,
      productImage,
      categoryId,
      sessionId: requestedSessionId,
      productCode: requestedProductCode,
    } = body ?? {};
    payload.modelImageKind = getImageInputKind(modelImage);
    payload.productImageKind = getImageInputKind(productImage);
    if (payload.modelImageKind === "data-url") {
      payload.modelImageBytes = getDataUrlBinaryBytes(modelImage as string);
    }
    if (payload.productImageKind === "data-url") {
      payload.productImageBytes = getDataUrlBinaryBytes(productImage as string);
    }
    if (
      typeof requestedSessionId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        requestedSessionId,
      )
    ) {
      sessionId = requestedSessionId;
    }
    const item =
      typeof categoryId === "string" ? getItem(categoryId) : undefined;
    category = item?.id ?? "unknown";
    productCode =
      typeof requestedProductCode === "string" &&
      /^[A-Za-z0-9_-]{1,40}$/.test(requestedProductCode)
        ? requestedProductCode
        : getProductCode(productImage);

    if (!apiKey) {
      failureReason = "Generation service is not configured.";
      return NextResponse.json(
        { error: "The try-on service is unavailable. Please contact showroom staff." },
        { status: 503 },
      );
    }

    if (
      typeof modelImage !== "string" ||
      typeof productImage !== "string" ||
      typeof categoryId !== "string"
    ) {
      failureReason = "Required image or category input is missing.";
      return NextResponse.json(
        { error: "Customer image, product image and category are required." },
        { status: 400 },
      );
    }

    if (!item) {
      failureReason = "Unsupported product category.";
      return NextResponse.json(
        { error: "Unsupported category." },
        { status: 400 },
      );
    }

    stage = "image normalization";
    const normalizedModelImage = normalizeCustomerImage(modelImage);
    const normalizedProductImage = await resolveGarmentImage(productImage);
    const customerImageValid = isValidImageInput(normalizedModelImage);
    const garmentImageValid = isValidImageInput(normalizedProductImage);
    if (!customerImageValid || !garmentImageValid) {
      throw new Error("Invalid customer or garment image input.");
    }

    stage = "FASHN submission";
    const client = new Fashn({ apiKey, fetch: diagnosticFetch });

    const response = await client.predictions.subscribe({
      model_name: "tryon-max",
      inputs: {
        model_image: normalizedModelImage,
        product_image: normalizedProductImage,
        prompt: item.prompt,
        resolution: "1k",
        generation_mode: "balanced",
        num_images: 1,
        output_format: "jpeg",
      },
      onEnqueued: (id) => {
        predictionId = id;
      },
      onQueueUpdate: () => {
        stage = "FASHN polling";
      },
    });

    if (response.status !== "completed") {
      failureReason = response.error?.message || `Generation status: ${response.status}`;
      return NextResponse.json(
        {
          error: "The try-on could not be completed. Please try again later.",
        },
        { status: 502 },
      );
    }

    const image = response.output?.[0];
    if (!image) {
      failureReason = "FASHN completed without an output image.";
      return NextResponse.json(
        { error: "The try-on completed without an image. Please try again." },
        { status: 502 },
      );
    }

    requestStatus = "succeeded";
    failureReason = "";

    return NextResponse.json({
      success: true,
      image,
      creditsUsed: response.creditsUsed ?? null,
      category: item.name,
    });
  } catch (error) {
    failureReason = `${stage}: ${getSafeFailureReason(error, apiKey)}`;
    if (error instanceof Fashn.APIError) {
      return NextResponse.json(
        { error: "The try-on service rejected this request. Please check your photo and try again." },
        { status: error.status >= 400 && error.status < 500 ? error.status : 502 },
      );
    }
    return NextResponse.json(
      {
        error: "We could not complete this try-on. Check your connection and try again.",
      },
      { status: 502 },
    );
  } finally {
    console.info(
      "[TRYON-MONITOR]",
      JSON.stringify({
        timestamp: new Date().toISOString(),
        sessionId,
        productCode,
        category,
        status: requestStatus,
        predictionId,
        durationMs: Date.now() - startedAt,
        ...payload,
        failureReason:
          requestStatus === "succeeded"
            ? null
            : getSafeFailureReason(failureReason, apiKey),
      }),
    );
  }
}
