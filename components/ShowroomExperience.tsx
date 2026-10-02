"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { catalog, Group } from "@/lib/catalog";
import { fileToDataUrl } from "@/lib/image";
import { getProductsForCategory, Product } from "@/data/products";
import {
  getLivePositioningHint,
  PhotoValidationUnavailableError,
  validatePhoto as validateCustomerPhoto,
} from "@/lib/photo-quality";
import type { PhotoQualityResult } from "@/lib/photo-quality";
import { GenerationRequestGuard } from "@/lib/generation-guard";
import {
  describeOptimization,
  formatBytes,
  getUtf8Bytes,
  IMAGE_PAYLOAD_LIMITS,
  ImagePayloadTooLargeError,
  needsPayloadOptimization,
  optimizeImageForUpload,
} from "@/lib/image-payload";
import {
  createAnonymousSessionId,
  getInactivityCountdown,
  parseDuration,
} from "@/lib/session";
import { allDisplayMediaUrls, displayMediaUrl, videoPosterUrl } from "@/lib/media";

type ExperienceStep =
  | "welcome"
  | "gender"
  | "category"
  | "catalogue"
  | "camera"
  | "preview"
  | "generating"
  | "result"
  | "final";

type ProductGender = Extract<Group, "women" | "men">;

const optionalGenderImages: Record<ProductGender, string | undefined> = {
  women: undefined,
  men: undefined,
};

const progressSteps = [
  ["category", "Style"],
  ["catalogue", "Product"],
  ["camera", "Photo"],
  ["generating", "Try-On"],
  ["result", "Result"],
] as const;

const accessoryCategoriesByGender: Record<ProductGender, string[]> = {
  women: ["jewellery", "bag", "shoes", "headwear"],
  men: ["bag", "shoes", "headwear"],
};

const showroomName =
  process.env.NEXT_PUBLIC_SHOWROOM_NAME?.trim() || "Lotus Prime";
const showroomLogoUrl = process.env.NEXT_PUBLIC_SHOWROOM_LOGO_URL?.trim() || "";
const sessionIdleMs = parseDuration(
  process.env.NEXT_PUBLIC_SESSION_IDLE_MS,
  3 * 60 * 1000,
);
const sessionWarningMs = parseDuration(
  process.env.NEXT_PUBLIC_SESSION_WARNING_MS,
  60 * 1000,
);
const completedSessionTimeoutMs = parseDuration(
  process.env.NEXT_PUBLIC_COMPLETED_SESSION_TIMEOUT_MS,
  3 * 60 * 1000,
);
const promoVideoUrl =
  process.env.NEXT_PUBLIC_PROMO_VIDEO_URL?.trim() || "/products/promo_pexel.mp4";
const promoIdleMs = parseDuration(process.env.NEXT_PUBLIC_PROMO_IDLE_MS, 60 * 1000);
const genderBackgroundUrl =
  process.env.NEXT_PUBLIC_GENDER_BACKGROUND_URL?.trim() || "/products/mainimage.jpg";
const categoryBackgroundUrl =
  process.env.NEXT_PUBLIC_CATEGORY_BACKGROUND_URL?.trim() || "/products/thirdimage.jpg";
const catalogueBackgroundUrl =
  process.env.NEXT_PUBLIC_CATALOGUE_BACKGROUND_URL?.trim() || "/products/rangoli.jpg";
const cameraBackgroundUrl =
  process.env.NEXT_PUBLIC_CAMERA_BACKGROUND_URL?.trim() || "/products/flower.jpg";
const previewBackgroundUrl =
  process.env.NEXT_PUBLIC_PREVIEW_BACKGROUND_URL?.trim() || "/products/thirdimagere.jpg";
const resultBackgroundUrl =
  process.env.NEXT_PUBLIC_RESULT_BACKGROUND_URL?.trim() || "/lamb.jpg";

export default function ShowroomExperience() {
  const [step, setStep] = useState<ExperienceStep>("welcome");
  const [gender, setGender] = useState<Group>("women");
  const [stylingGender, setStylingGender] = useState<ProductGender>("women");
  const [categoryId, setCategoryId] = useState("saree");
  const [selectedProduct, setSelectedProduct] = useState<Product | undefined>();
  const [productFile, setProductFile] = useState<File | null>(null);
  const [productPreview, setProductPreview] = useState("");
  const [capturedImage, setCapturedImage] = useState("");
  const [personPreview, setPersonPreview] = useState("");
  const [originalCustomerImage, setOriginalCustomerImage] = useState("");
  const [currentAcceptedImage, setCurrentAcceptedImage] = useState("");
  const [acceptedHistory, setAcceptedHistory] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [cameraRetry, setCameraRetry] = useState(0);
  const [cameraResolution, setCameraResolution] = useState("");
  const [positioningHint, setPositioningHint] = useState(
    "Stand naturally and look at the camera.",
  );
  const [photoQuality, setPhotoQuality] = useState<PhotoQualityResult | null>(
    null,
  );
  const [photoQualityError, setPhotoQualityError] = useState("");
  const [photoOptimizationNotice, setPhotoOptimizationNotice] = useState("");
  const [photoCheckFallbackAvailable, setPhotoCheckFallbackAvailable] =
    useState(false);
  const [photoChecking, setPhotoChecking] = useState(false);
  const [error, setError] = useState("");
  const [sessionWarningSeconds, setSessionWarningSeconds] = useState<number | null>(null);
  const [fullscreenNotice, setFullscreenNotice] = useState("");
  const [promoPlaying, setPromoPlaying] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownActiveRef = useRef(false);
  const photoValidationIdRef = useRef(0);
  const generationGuardRef = useRef(new GenerationRequestGuard());
  const anonymousSessionIdRef = useRef<string | null>(null);
  const startOverRef = useRef<() => void>(() => {});
  const lastActivityAtRef = useRef(Date.now());
  const sessionWarningActiveRef = useRef(false);

  startOverRef.current = startOver;

  const selectedCategory = catalog.find((item) => item.id === categoryId);
  const categories = useMemo(
    () =>
      catalog.filter(
        (item) =>
          item.group === gender &&
          (gender !== "accessories" ||
            accessoryCategoriesByGender[stylingGender].includes(item.id)),
      ),
    [gender, stylingGender],
  );
  const availableProducts = useMemo(
    () => getProductsForCategory(categoryId, gender),
    [categoryId, gender],
  );

  useEffect(() => {
    if (step !== "camera") return;

    let cancelled = false;
    setCameraError("");
    setCameraResolution("");
    setPositioningHint("Stand naturally and look at the camera.");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        window.isSecureContext
          ? "Camera access is not supported by this browser. Please use the latest Chrome or Edge, or upload a photo."
          : "Camera access requires a secure page. Open this site using HTTPS or localhost, or upload a photo.",
      );
      return () => {
        cancelled = true;
        stopCamera();
      };
    }

    async function openCamera() {
      let stream: MediaStream | undefined;
      let lastError: unknown;
      const constraints: MediaStreamConstraints[] = [
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
      ];

      for (const constraint of constraints) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraint);
          break;
        } catch (error: unknown) {
          lastError = error;
          const name = error instanceof Error ? error.name : "";
          if (
            name === "NotAllowedError" ||
            name === "PermissionDeniedError" ||
            name === "SecurityError"
          ) {
            break;
          }
        }
      }

      if (!stream) {
        if (!cancelled) setCameraError(getCameraErrorMessage(lastError));
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      for (const track of stream.getTracks()) {
        track.addEventListener("ended", handleCameraDisconnected);
      }
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          if (!cancelled) {
            setCameraError(
              "The camera connected, but the browser blocked its preview. Check this site's camera permission, then try again.",
            );
            stopCamera();
            return;
          }
        }
      }

      cameraReadyTimerRef.current = setTimeout(() => {
        if (!cancelled && !videoRef.current?.videoWidth) {
          setCameraError(
            "The camera connected but isn't showing a picture. Close other camera apps, then try again or upload a photo.",
          );
          stopCamera();
        }
      }, 12000);
    }

    void openCamera().catch(() => {
      if (!cancelled) {
        setCameraError(
          "The camera could not be started. Check browser and system camera permissions, then try again or upload a photo.",
        );
      }
    });

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [cameraRetry, step]);

  function getCameraErrorMessage(error: unknown) {
    const name = error instanceof Error ? error.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "Camera permission is blocked. In Chrome, click the camera icon beside the address bar and allow access for this site. Also check Windows Settings → Privacy & security → Camera, then try again.";
    }
    if (name === "SecurityError") {
      return "The browser blocked camera access for this page. Open the showroom on HTTPS or localhost and allow camera permission.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "No camera is available to this browser. Check that the camera is connected and enabled, or upload a photo.";
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return "The camera is detected but could not start. Close other apps or browser tabs using the camera, check Windows camera privacy settings, and try again.";
    }
    if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
      return "The camera could not start with a supported video mode. Reconnect it or try another camera.";
    }
    if (name === "AbortError") {
      return "The camera start was interrupted. Please try again.";
    }
    return "The camera could not be started. Check browser and system camera permissions, then try again or upload a photo.";
  }

  const hasCustomerData =
    Boolean(capturedImage || result || currentAcceptedImage) ||
    acceptedHistory.length > 0;

  // Warm the browser cache with every page background and catalogue image
  // once the welcome screen has loaded, so later screens appear instantly.
  // Backgrounds load first; images are fetched a few at a time to avoid
  // competing with the promo video.
  useEffect(() => {
    let cancelled = false;
    const isProduct = (url: string) => /\/[A-Z]{2}\d{3}\.[^/]+$/i.test(url);
    const queue = allDisplayMediaUrls()
      .filter((url) => url.endsWith(".webp"))
      .sort((a, b) => Number(isProduct(a)) - Number(isProduct(b)));
    const loadNext = () => {
      const url = queue.shift();
      if (cancelled || !url) return;
      const image = new Image();
      image.decoding = "async";
      image.onload = image.onerror = loadNext;
      image.src = url;
    };
    const start = () => {
      for (let i = 0; i < 3; i += 1) loadNext();
    };
    const timer = window.setTimeout(start, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  // Kiosk attract loop: after promoIdleMs without interaction on any screen the
  // promo video plays full-screen and loops until the screen is touched. The
  // camera and generation steps are excluded so a posing or waiting customer
  // is never interrupted.
  useEffect(() => {
    if (!promoVideoUrl || step === "camera" || step === "generating" || loading) {
      return;
    }
    let idleTimer: number | undefined;
    const scheduleResume = () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => setPromoPlaying(true), promoIdleMs);
    };
    scheduleResume();
    const events = ["pointerdown", "keydown", "touchstart", "wheel", "mousemove"] as const;
    events.forEach((name) =>
      window.addEventListener(name, scheduleResume, { passive: true }),
    );
    return () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      events.forEach((name) => window.removeEventListener(name, scheduleResume));
    };
  }, [step, loading]);

  function stopPromo() {
    setPromoPlaying(false);
    // Touching the attract loop on the welcome screen goes straight to the
    // second screen, matching the promo's "touch to start" hint.
    if (step === "welcome") setStep("gender");
  }

  useEffect(() => {
    // While the promo loops with no customer data there is nothing to clear,
    // so the session countdown is not needed. With customer data the countdown
    // keeps running underneath the promo so the session is still cleared.
    const promoAttractMode = promoPlaying && !hasCustomerData;
    if (step === "welcome" || step === "generating" || loading || promoAttractMode) {
      sessionWarningActiveRef.current = false;
      setSessionWarningSeconds(null);
      return;
    }

    const isCompletedScreen = step === "final";
    const timeoutMs = isCompletedScreen
      ? completedSessionTimeoutMs
      : sessionIdleMs;
    if (!promoPlaying) {
      lastActivityAtRef.current = Date.now();
      sessionWarningActiveRef.current = false;
    }

    const recordActivity = () => {
      if (!sessionWarningActiveRef.current) {
        lastActivityAtRef.current = Date.now();
      }
    };

    const timer = window.setInterval(() => {
      const remaining = getInactivityCountdown(
        Date.now() - lastActivityAtRef.current,
        timeoutMs,
        sessionWarningMs,
        isCompletedScreen,
      );
      if (remaining === null) return;
      sessionWarningActiveRef.current = true;
      setSessionWarningSeconds(remaining);
      if (remaining === 0) startOverRef.current();
    }, 1000);

    window.addEventListener("pointerdown", recordActivity, { passive: true });
    window.addEventListener("mousemove", recordActivity, { passive: true });
    window.addEventListener("keydown", recordActivity);
    window.addEventListener("touchstart", recordActivity, { passive: true });
    window.addEventListener("wheel", recordActivity, { passive: true });
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", recordActivity);
      window.removeEventListener("mousemove", recordActivity);
      window.removeEventListener("keydown", recordActivity);
      window.removeEventListener("touchstart", recordActivity);
      window.removeEventListener("wheel", recordActivity);
    };
  }, [loading, step, promoPlaying, hasCustomerData]);

  useEffect(() => {
    if (step !== "camera" || cameraError) return;
    let cancelled = false;
    let checkingPosition = false;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!video || !context) return;

    const updatePosition = async () => {
      if (cancelled || checkingPosition || !video.videoWidth) return;
      checkingPosition = true;
      const scale = Math.min(1, 256 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        const hint = await getLivePositioningHint(canvas, categoryId);
        if (!cancelled) {
          setPositioningHint(
            hint ?? "Your position looks good. Stand naturally and look at the camera.",
          );
        }
      } catch {
        if (!cancelled) {
          setPositioningHint(
            "Live framing guidance is unavailable. Your photo will still receive a quality check.",
          );
        }
        window.clearInterval(positioningTimer);
      } finally {
        checkingPosition = false;
      }
    };

    const positioningTimer = window.setInterval(() => {
      void updatePosition();
    }, 3000);
    void updatePosition();

    return () => {
      cancelled = true;
      window.clearInterval(positioningTimer);
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [cameraError, categoryId, step]);

  function stopCamera() {
    if (cameraReadyTimerRef.current) {
      clearTimeout(cameraReadyTimerRef.current);
      cameraReadyTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    countdownActiveRef.current = false;
    setCountdown(null);
    streamRef.current?.getTracks().forEach((track) => {
      track.removeEventListener("ended", handleCameraDisconnected);
      track.stop();
    });
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function begin() {
    setFullscreenNotice("");
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {
        setFullscreenNotice(
          "Fullscreen could not be enabled. Use your browser or operating-system kiosk mode for a locked-down display.",
        );
      });
    }
    setStep("gender");
    if (promoVideoUrl) setPromoPlaying(true);
  }

  function handleCameraDisconnected() {
    if (step !== "camera") return;
    setCameraError("The camera was disconnected. Reconnect it or upload a photo.");
    stopCamera();
  }

  function chooseGender(nextGender: ProductGender) {
    setStylingGender(nextGender);
    chooseGroup(nextGender);
  }

  function chooseGroup(nextGender: Group) {
    setGender(nextGender);
    const firstCategory = catalog.find(
      (item) =>
        item.group === nextGender &&
        (nextGender !== "accessories" ||
          accessoryCategoriesByGender[stylingGender].includes(item.id)),
    );
    if (firstCategory) setCategoryId(firstCategory.id);
    setSelectedProduct(undefined);
    setProductFile(null);
    setProductPreview("");
    setStep("category");
  }

  function chooseCategory(nextCategoryId: string) {
    setCategoryId(nextCategoryId);
    setSelectedProduct(undefined);
    setProductFile(null);
    setProductPreview("");
    setError("");
    setStep("catalogue");
  }

  function chooseProduct(product: Product) {
    setSelectedProduct(product);
    setError("");
    if (acceptedHistory.length > 1 && currentAcceptedImage) {
      setCapturedImage(currentAcceptedImage);
      setStep("preview");
    } else {
      setStep("camera");
    }
  }

  async function handleProductUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Please choose a JPG, PNG or WEBP product image.");
      return;
    }
    try {
      const { dataUrl: preview } = await optimizeImageForUpload(
        await fileToDataUrl(file),
      );
      setProductFile(file);
      setProductPreview(preview);
      setSelectedProduct({
        id: `UPLOAD-${categoryId}`,
        code: "",
        name: `${selectedCategory?.name ?? "Selected"} • Your Selected Style`,
        productCode: "",
        category: categoryId,
        gender,
        image: "",
        description: "Staff or demo product image",
        active: true,
        tone: "champagne",
      });
      setError("");
      if (acceptedHistory.length > 1 && currentAcceptedImage) {
        setCapturedImage(currentAcceptedImage);
        setStep("preview");
      } else {
        setStep("camera");
      }
    } catch (uploadError) {
      setError(
        uploadError instanceof ImagePayloadTooLargeError
          ? "This product image is too large to send. Please choose a smaller image."
          : "We could not read that product image. Please try again.",
      );
    }
  }

  async function handleCustomerUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.currentTarget.value = "";
    if (file.size > 30 * 1024 * 1024) {
      setCameraError("This photo is too large. Please choose an image under 30 MB.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setCameraError("Please choose a JPG, PNG or WEBP photo.");
      return;
    }
    try {
      const { dataUrl, report } = await optimizeImageForUpload(
        await fileToDataUrl(file),
      );
      setCameraError("");
      setPhotoOptimizationNotice(describeOptimization(report));
      showPhotoPreview(dataUrl);
    } catch (uploadError) {
      setCameraError(
        uploadError instanceof ImagePayloadTooLargeError
          ? uploadError.message
          : "We could not read that photo. Please try again.",
      );
    }
  }

  function startCountdown() {
    if (countdownActiveRef.current || !videoRef.current?.videoWidth) return;
    countdownActiveRef.current = true;
    setCountdown(3);
    countdownTimerRef.current = setTimeout(() => {
      setCountdown(2);
      countdownTimerRef.current = setTimeout(() => {
        setCountdown(1);
        countdownTimerRef.current = setTimeout(() => {
          setCountdown(null);
          countdownActiveRef.current = false;
          captureFrame();
        }, 1000);
      }, 1000);
    }, 1000);
  }

  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = canvas.toDataURL("image/jpeg", 0.92);
    if (!needsPayloadOptimization(frame)) {
      setPhotoOptimizationNotice("");
      showPhotoPreview(frame);
      return;
    }
    void optimizeImageForUpload(frame)
      .then(({ dataUrl, report }) => {
        setPhotoOptimizationNotice(describeOptimization(report));
        showPhotoPreview(dataUrl);
      })
      .catch((captureError: unknown) => {
        setCameraError(
          captureError instanceof ImagePayloadTooLargeError
            ? captureError.message
            : "We could not process that photo. Please try again.",
        );
      });
  }

  function showPhotoPreview(image: string) {
    const validationId = ++photoValidationIdRef.current;
    setCapturedImage(image);
    setPhotoQuality(null);
    setPhotoQualityError("");
    setPhotoCheckFallbackAvailable(false);
    setPhotoChecking(true);
    setStep("preview");
    void validateCustomerPhoto(image, categoryId)
      .then((result) => {
        if (validationId !== photoValidationIdRef.current) return;
        setPhotoQuality(result);
        setPositioningHint(
          result.positioningHint ?? "Stand naturally and look at the camera.",
        );
      })
      .catch((validationError: unknown) => {
        if (validationId !== photoValidationIdRef.current) return;
        setPhotoQualityError(
          validationError instanceof Error
            ? validationError.message
            : "Photo checks are unavailable. Please retake or upload another photo.",
        );
        setPhotoCheckFallbackAvailable(
          validationError instanceof PhotoValidationUnavailableError,
        );
      })
      .finally(() => {
        if (validationId === photoValidationIdRef.current) {
          setPhotoChecking(false);
        }
      });
  }

  function usePhoto(allowPhotoChecksOnly = false) {
    if (!capturedImage) return;
    if (acceptedHistory.length > 1 && capturedImage === currentAcceptedImage) {
      setError("");
      void generate(currentAcceptedImage);
      return;
    }
    const explicitFallback =
      allowPhotoChecksOnly &&
      (photoCheckFallbackAvailable ||
        (photoQuality?.state === "unavailable" &&
          photoQuality.canUsePhotoChecksOnly));
    if (
      !explicitFallback &&
      (!photoQuality ||
        photoQuality.state === "retake" ||
        photoQuality.state === "unavailable")
    ) {
      return;
    }
    setOriginalCustomerImage(capturedImage);
    setCurrentAcceptedImage(capturedImage);
    setAcceptedHistory([capturedImage]);
    setPersonPreview(capturedImage);
    setError("");
    setPhotoQualityError("");
    setPhotoCheckFallbackAvailable(false);
    void generate(capturedImage);
  }

  async function generate(modelImage = currentAcceptedImage) {
    if (generationGuardRef.current.isActive()) return;
    const productImage = productPreview || selectedProduct?.image || "";
    if (!modelImage || !productImage || !selectedCategory) {
      setError("Choose a product image before creating your look.");
      setStep("catalogue");
      return;
    }

    if (!generationGuardRef.current.tryStart()) return;
    const controller = new AbortController();
    let timeout: number | undefined;
    try {
      setLoading(true);
      setError("");
      setResult("");
      setStep("generating");
      anonymousSessionIdRef.current ??= createAnonymousSessionId();
      timeout = window.setTimeout(() => controller.abort(), 65_000);
      const requestBody = JSON.stringify({
        modelImage,
        productImage,
        categoryId: selectedCategory.id,
        productCode: selectedProduct?.code ?? "",
        sessionId: anonymousSessionIdRef.current,
      });
      const requestBytes = getUtf8Bytes(requestBody);
      if (requestBytes > IMAGE_PAYLOAD_LIMITS.safeRequestBytes) {
        throw new Error(
          `These images are too large to send (${formatBytes(
            requestBytes,
          )}). Please retake the photo or choose a smaller image. No try-on was started.`,
        );
      }
      const response = await fetch("/api/tryon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as {
        image?: unknown;
        error?: unknown;
      };
      if (!response.ok || typeof data.image !== "string") {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : response.status === 413
              ? "These images are too large to send. Please retake the photo or choose a smaller image."
              : response.status === 502 || response.status === 504
                ? "The try-on service did not respond in time and its status may be uncertain. No automatic retry was made. Please wait before trying again."
                : "We couldn't create this look. Please review your selection and try again.",
        );
      }
      setResult(data.image);
      setStep("result");
    } catch (error) {
      setError(
        error instanceof DOMException && error.name === "AbortError"
          ? "This request took too long and its status may be uncertain. No automatic retry was made. Please wait before starting another generation."
          : error instanceof Error
            ? error.message
            : "We couldn't confirm the generation result. Check your connection before trying again.",
      );
      setStep("preview");
    } finally {
      if (timeout !== undefined) window.clearTimeout(timeout);
      generationGuardRef.current.finish();
      setLoading(false);
    }
  }

  function clearProductSelection() {
    setProductFile(null);
    setProductPreview("");
  }

  function keepLookAndAddAnother() {
    if (!result) return;
    const acceptedResult = result;
    setCurrentAcceptedImage(acceptedResult);
    setAcceptedHistory((history) => [...history, acceptedResult]);
    setSelectedProducts((products) =>
      selectedProduct ? [...products, selectedProduct] : products,
    );
    setPersonPreview(result);
    setResult("");
    clearProductSelection();
    setSelectedProduct(undefined);
    const firstAccessory = catalog.find(
      (item) =>
        item.group === "accessories" &&
        accessoryCategoriesByGender[stylingGender].includes(item.id),
    );
    if (firstAccessory) {
      setGender("accessories");
      setCategoryId(firstAccessory.id);
    }
    setStep("category");
  }

  function undoLastLook() {
    if (acceptedHistory.length <= 1 || loading) return;
    const previousHistory = acceptedHistory.slice(0, -1);
    const previousImage = previousHistory[previousHistory.length - 1];
    setAcceptedHistory(previousHistory);
    setSelectedProducts((products) => products.slice(0, -1));
    setCurrentAcceptedImage(previousImage);
    setPersonPreview(previousImage);
    setResult("");
    clearProductSelection();
    setError("");
    setStep("final");
  }

  function startOver() {
    if (generationGuardRef.current.isActive()) return;
    sessionWarningActiveRef.current = false;
    photoValidationIdRef.current += 1;
    stopCamera();
    anonymousSessionIdRef.current = null;
    setSessionWarningSeconds(null);
    setStep("welcome");
    setGender("women");
    setStylingGender("women");
    setCategoryId("saree");
    setSelectedProduct(undefined);
    setProductFile(null);
    setProductPreview("");
    setCapturedImage("");
    setPersonPreview("");
    setOriginalCustomerImage("");
    setCurrentAcceptedImage("");
    setAcceptedHistory([]);
    setSelectedProducts([]);
    setResult("");
    setError("");
    setCameraError("");
    setPhotoQuality(null);
    setPhotoQualityError("");
    setPhotoOptimizationNotice("");
    setPhotoCheckFallbackAvailable(false);
    setPhotoChecking(false);
  }

  function continueSession() {
    sessionWarningActiveRef.current = false;
    lastActivityAtRef.current = Date.now();
    setSessionWarningSeconds(null);
  }

  function finishSession() {
    if (loading) return;
    const finalImage = result || currentAcceptedImage;
    if (!finalImage) return;
    if (result && result !== currentAcceptedImage) {
      setCurrentAcceptedImage(finalImage);
      setAcceptedHistory((history) => [...history, finalImage]);
      setSelectedProducts((products) =>
        selectedProduct ? [...products, selectedProduct] : products,
      );
    }
    setResult("");
    setStep("final");
  }

  function backTo(previousStep: ExperienceStep) {
    setError("");
    setStep(previousStep);
  }

  const currentProgressIndex = progressSteps.findIndex(
    ([value]) => value === step,
  );

  return (
    <main className="showroom">
      {step !== "welcome" && (
        <ShowroomHeader
          onHome={startOver}
          progressIndex={currentProgressIndex}
          step={step}
          showroomName={showroomName}
          logoUrl={showroomLogoUrl}
          homeDisabled={loading}
        />
      )}

      {fullscreenNotice && (
        <p className="fullscreenNotice" role="status">
          {fullscreenNotice}
        </p>
      )}
      {step === "welcome" && (
        <WelcomeScreen
          onStart={begin}
          showroomName={showroomName}
          logoUrl={showroomLogoUrl}
        />
      )}
      {step === "gender" && (
        <GenderScreen
          onBack={() => backTo("welcome")}
          onChoose={chooseGender}
        />
      )}
      {step === "category" && (
        <CategoryScreen
          gender={gender}
          categories={categories}
          categoryId={categoryId}
          onBack={() => backTo("gender")}
          onChoose={chooseCategory}
          onChooseAccessories={() => chooseGroup("accessories")}
        />
      )}
      {step === "catalogue" && (
        <CatalogueScreen
          gender={gender}
          category={selectedCategory}
          products={availableProducts}
          selectedProduct={selectedProduct}
          productPreview={productPreview}
          onBack={() => backTo("category")}
          onChoose={chooseProduct}
          onUpload={handleProductUpload}
        />
      )}
      {step === "camera" && (
        <CameraScreen
          videoRef={videoRef}
          canvasRef={canvasRef}
          cameraError={cameraError}
          cameraResolution={cameraResolution}
          positioningHint={positioningHint}
          countdown={countdown}
          selectedProduct={selectedProduct}
          onBack={() => backTo("catalogue")}
          onCapture={startCountdown}
          onUpload={handleCustomerUpload}
          onRetryCamera={() => {
            setCameraError("");
            setCameraRetry((attempt) => attempt + 1);
          }}
          onCameraMetadata={() => {
            const video = videoRef.current;
            if (video?.videoWidth && video.videoHeight) {
              if (cameraReadyTimerRef.current) {
                clearTimeout(cameraReadyTimerRef.current);
                cameraReadyTimerRef.current = null;
              }
              setCameraResolution(`${video.videoWidth} × ${video.videoHeight}`);
            }
          }}
        />
      )}
      {step === "preview" && (
        <PreviewScreen
          image={capturedImage}
          error={error}
          photoQuality={photoQuality}
          photoQualityError={photoQualityError}
          optimizationNotice={photoOptimizationNotice}
          photoCheckFallbackAvailable={photoCheckFallbackAvailable}
          photoChecking={photoChecking}
          isAcceptedLook={
            acceptedHistory.length > 1 &&
            capturedImage === currentAcceptedImage
          }
          selectedProduct={selectedProduct}
          onBack={() => {
            photoValidationIdRef.current += 1;
            setPhotoChecking(false);
            backTo("camera");
          }}
          onRetake={() => {
            photoValidationIdRef.current += 1;
            setCapturedImage("");
            setPhotoQuality(null);
            setPhotoQualityError("");
            setPhotoCheckFallbackAvailable(false);
            setPhotoChecking(false);
            setStep("camera");
          }}
          onUse={usePhoto}
          onUsePhotoChecksOnly={() => usePhoto(true)}
        />
      )}
      {step === "generating" && <GeneratingScreen />}
      {step === "result" && (
        <ResultScreen
          image={result}
          product={selectedProduct}
          error={error}
          canUndo={acceptedHistory.length > 1}
          onKeepAndAddAnother={keepLookAndAddAnother}
          onTryAnother={() => {
            setResult("");
            clearProductSelection();
            setStep("catalogue");
          }}
          onUndo={undoLastLook}
          onStartOver={startOver}
          onFinish={finishSession}
        />
      )}
      {step === "final" && (
        <FinalScreen
          image={currentAcceptedImage}
          canUndo={acceptedHistory.length > 1}
          showroomName={showroomName}
          onTryAnother={() => setStep("category")}
          onUndo={undoLastLook}
          onStartOver={startOver}
        />
      )}
      {sessionWarningSeconds !== null && step !== "welcome" && (
        <div className="sessionWarningBackdrop" role="presentation">
          <section
            className="sessionWarning"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="session-warning-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                continueSession();
              } else if (event.key === "Tab") {
                event.preventDefault();
                event.currentTarget.querySelector("button")?.focus();
              }
            }}
          >
            <p className="eyebrow">SESSION ENDING</p>
            <h2 id="session-warning-title">Would you like to continue?</h2>
            <p>
              This experience will reset in {sessionWarningSeconds} seconds.
            </p>
            <button
              className="goldButton"
              autoFocus
              onClick={continueSession}
            >
              CONTINUE SESSION
            </button>
          </section>
        </div>
      )}
      {promoVideoUrl && (
        <PromoOverlay
          videoUrl={promoVideoUrl}
          playing={promoPlaying}
          onStop={stopPromo}
        />
      )}
    </main>
  );
}

function PromoOverlay({
  videoUrl,
  playing,
  onStop,
}: {
  videoUrl: string;
  playing: boolean;
  onStop: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      video.currentTime = 0;
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [playing]);

  if (failed) return null;

  return (
    <div
      className={`promoOverlay${playing ? " promoVisible" : ""}`}
      role="button"
      tabIndex={playing ? 0 : -1}
      aria-hidden={!playing}
      aria-label="Touch to start your virtual try-on"
      onClick={onStop}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onStop();
      }}
    >
      <video
        ref={videoRef}
        className="promoVideo"
        src={displayMediaUrl(videoUrl)}
        poster={videoPosterUrl(videoUrl)}
        loop
        muted
        playsInline
        preload="auto"
        onError={() => setFailed(true)}
      />
      <span className="promoHint">TOUCH ANYWHERE TO START YOUR VIRTUAL TRY-ON</span>
    </div>
  );
}

function ShowroomHeader({
  onHome,
  progressIndex,
  step,
  showroomName,
  logoUrl,
  homeDisabled,
}: {
  onHome: () => void;
  progressIndex: number;
  step: ExperienceStep;
  showroomName: string;
  logoUrl: string;
  homeDisabled: boolean;
}) {
  return (
    <header className="showroomHeader">
      <button
        className="wordmark"
        onClick={onHome}
        disabled={homeDisabled}
        aria-label="Return to welcome"
      >
        {logoUrl && <img src={logoUrl} alt="" className="headerLogo" />}
        <span>{showroomName.toUpperCase()}</span>
        <strong>FASHION AI</strong>
      </button>
      <ProgressIndicator activeIndex={progressIndex} step={step} />
      <span className="headerMark">{showroomName.toUpperCase()}</span>
    </header>
  );
}

function ProgressIndicator({
  activeIndex,
  step,
}: {
  activeIndex: number;
  step: ExperienceStep;
}) {
  if (step === "final") return <div className="progressFinal">FINAL LOOK</div>;
  return (
    <div className="progressIndicator" aria-label="Experience progress">
      {progressSteps.map(([value, label], index) => (
        <span
          className={index <= activeIndex ? "progressActive" : ""}
          key={value}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function WelcomeScreen({
  onStart,
  showroomName,
  logoUrl,
}: {
  onStart: () => void;
  showroomName: string;
  logoUrl: string;
}) {
  const welcomeVideoRef = useRef<HTMLVideoElement>(null);
  const welcomeAudioRef = useRef<HTMLAudioElement>(null);
  const [audioError, setAudioError] = useState("");
  const [videoError, setVideoError] = useState(false);

  async function enableSound() {
    setAudioError("");
    try {
      const voiceUrl = process.env.NEXT_PUBLIC_WELCOME_AUDIO_URL?.trim();
      if (voiceUrl && welcomeAudioRef.current) {
        await welcomeAudioRef.current.play();
      } else if (welcomeVideoRef.current) {
        welcomeVideoRef.current.muted = false;
      }
    } catch {
      setAudioError("Welcome audio could not be played on this device.");
    }
  }

  return (
    <section className="welcomeScreen">
      <img
        className="welcomeBackground"
        src={displayMediaUrl(
          process.env.NEXT_PUBLIC_WELCOME_IMAGE_URL?.trim() ||
            "/products/accessories/homepage.jpg",
        )}
        decoding="async"
        alt=""
        aria-hidden="true"
        fetchPriority="high"
      />
      <div className="welcomeScrim" aria-hidden="true" />
      {process.env.NEXT_PUBLIC_WELCOME_VIDEO_URL && !videoError && (
        <video
          ref={welcomeVideoRef}
          className="welcomeVideo"
          src={process.env.NEXT_PUBLIC_WELCOME_VIDEO_URL}
          autoPlay
          loop
          muted
          playsInline
          onError={() => setVideoError(true)}
          aria-hidden="true"
        />
      )}
      <div className="welcomeOrnament ornamentLeft" />
      <div className="welcomeOrnament ornamentRight" />
      <div className="welcomeContent">
        {logoUrl && <img className="welcomeLogo" src={logoUrl} alt={`${showroomName} logo`} />}
        <p className="eyebrow">{showroomName.toUpperCase()}</p>
        {videoError && (
          <p className="welcomeAudioError" role="status">
            The welcome video could not be loaded. The showroom welcome screen
            is still available.
          </p>
        )}
        <p className="welcomeKicker">FASHION AI</p>
        <h1>Virtual Try-On</h1>
        <p className="welcomeStatement">Discover Your Next Look</p>
        <p className="welcomeSubline">See it. Style it. Love it.</p>
        <button className="goldButton welcomeButton" onClick={onStart}>
          START YOUR VIRTUAL TRY-ON
        </button>
        {(process.env.NEXT_PUBLIC_WELCOME_AUDIO_URL ||
          process.env.NEXT_PUBLIC_WELCOME_VIDEO_URL) && (
          <button className="textButton welcomeSoundButton" onClick={enableSound}>
            {process.env.NEXT_PUBLIC_WELCOME_AUDIO_URL
              ? "PLAY WELCOME AUDIO"
              : "ENABLE VIDEO SOUND"}
          </button>
        )}
        {audioError && <p className="welcomeAudioError" role="status">{audioError}</p>}
        <p className="touchHint">Touch or click to begin</p>
        {process.env.NEXT_PUBLIC_WELCOME_AUDIO_URL && (
          <audio
            ref={welcomeAudioRef}
            src={process.env.NEXT_PUBLIC_WELCOME_AUDIO_URL}
            preload="none"
          />
        )}
      </div>
      <div className="welcomeFooter">A NEW WAY TO EXPERIENCE YOUR STYLE</div>
    </section>
  );
}

function GenderScreen({
  onBack,
  onChoose,
}: {
  onBack: () => void;
  onChoose: (gender: ProductGender) => void;
}) {
  return (
    <>
    {genderBackgroundUrl && <ScreenBackdrop src={genderBackgroundUrl} position="50% 32%" />}
    <ScreenFrame
      eyebrow="THE FIRST STEP"
      title="Who are we styling today?"
      onBack={onBack}
    >
      <div className="genderGrid">
        <button
          className="genderCard genderWomen"
          style={
            optionalGenderImages.women
              ? { backgroundImage: `url(${optionalGenderImages.women})` }
              : undefined
          }
          onClick={() => onChoose("women")}
        >
          <span className="cardOverline">THE EDIT</span>
          <strong>WOMEN</strong>
          <span>Indian occasionwear &amp; considered details</span>
          <i>Explore the collection</i>
        </button>
        <button
          className="genderCard genderMen"
          style={
            optionalGenderImages.men
              ? { backgroundImage: `url(${optionalGenderImages.men})` }
              : undefined
          }
          onClick={() => onChoose("men")}
        >
          <span className="cardOverline">THE EDIT</span>
          <strong>MEN</strong>
          <span>Tailored silhouettes &amp; modern classics</span>
          <i>Explore the collection</i>
        </button>
      </div>
    </ScreenFrame>
    </>
  );
}

function CategoryScreen({
  gender,
  categories,
  categoryId,
  onBack,
  onChoose,
  onChooseAccessories,
}: {
  gender: Group;
  categories: typeof catalog;
  categoryId: string;
  onBack: () => void;
  onChoose: (categoryId: string) => void;
  onChooseAccessories: () => void;
}) {
  return (
    <>
    {categoryBackgroundUrl && <ScreenBackdrop src={categoryBackgroundUrl} position="50% 45%" />}
    <ScreenFrame
      eyebrow={`${gender.toUpperCase()} / THE COLLECTION`}
      title="Choose your style"
      onBack={onBack}
    >
      <div className="categoryShowcase">
        {categories.map((category, index) => (
          <button
            className={`styleCard ${category.id === categoryId ? "styleSelected" : ""}`}
            style={
              category.thumbnail
                ? { backgroundImage: `url(${category.thumbnail})` }
                : undefined
            }
            key={category.id}
            onClick={() => onChoose(category.id)}
          >
            <span className={`styleNumber number${(index % 4) + 1}`}>
              0{index + 1}
            </span>
            <strong>{category.name}</strong>
            <span>{category.description}</span>
            <i>View pieces</i>
          </button>
        ))}
      </div>
      {gender !== "accessories" && (
        <button className="accessoryLink" onClick={onChooseAccessories}>
          ADD AN ACCESSORY
          <span>Jewellery, bags and finishing details</span>
        </button>
      )}
    </ScreenFrame>
    </>
  );
}

function CatalogueScreen({
  gender,
  category,
  products,
  selectedProduct,
  productPreview,
  onBack,
  onChoose,
  onUpload,
}: {
  gender: Group;
  category: (typeof catalog)[number] | undefined;
  products: Product[];
  selectedProduct: Product | undefined;
  productPreview: string;
  onBack: () => void;
  onChoose: (product: Product) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <>
    {catalogueBackgroundUrl && (
      <ScreenBackdrop src={catalogueBackgroundUrl} position="50% 40%" dim />
    )}
    <ScreenFrame
      eyebrow={`${gender.toUpperCase()} / ${category?.name ?? "STYLE"}`}
      title="Choose a piece to try"
      onBack={onBack}
    >
      <div className="catalogueGrid">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            selected={selectedProduct?.id === product.id}
            onChoose={() => onChoose(product)}
          />
        ))}
      </div>
      {process.env.NODE_ENV !== "production" && (
        <div className="developmentFallback">
          <div>
            <span className="cardOverline">DEVELOPMENT MODE</span>
            <strong>Use a shop product photograph</strong>
            <p>Placeholder pieces are ready for your inventory images.</p>
          </div>
          <label className="outlineButton">
            UPLOAD PRODUCT
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onUpload}
              hidden
            />
          </label>
        </div>
      )}
      {productPreview && (
        <p className="uploadReady">Product photo ready for this try-on.</p>
      )}
    </ScreenFrame>
    </>
  );
}

function ProductCard({
  product,
  selected,
  onChoose,
}: {
  product: Product;
  selected: boolean;
  onChoose: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <button
      className={`productCard ${selected ? "productSelected" : ""}`}
      onClick={onChoose}
    >
      <div className={`productVisual tone-${product.tone}`}>
        {product.image && !imageFailed ? (
          <img
            src={displayMediaUrl(product.image)}
            alt=""
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="productPlaceholder">
            <span>Product Image Coming Soon</span>
          </div>
        )}
      </div>
      <div className="productInfo">
        <span className="productSku">{product.code}</span>
        <strong>{product.name}</strong>
        <span>{product.description}</span>
      </div>
      <span className="productArrow">→</span>
    </button>
  );
}

function CameraScreen({
  videoRef,
  canvasRef,
  cameraError,
  cameraResolution,
  positioningHint,
  countdown,
  selectedProduct,
  onBack,
  onCapture,
  onUpload,
  onRetryCamera,
  onCameraMetadata,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  cameraError: string;
  cameraResolution: string;
  positioningHint: string;
  countdown: number | null;
  selectedProduct: Product | undefined;
  onBack: () => void;
  onCapture: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onRetryCamera: () => void;
  onCameraMetadata: () => void;
}) {
  return (
    <>
    {cameraBackgroundUrl && <ScreenBackdrop src={cameraBackgroundUrl} position="55% 45%" />}
    <ScreenFrame
      eyebrow="YOUR PHOTO"
      title="Step Into Your Look"
      onBack={onBack}
    >
      <div className="cameraLayout">
        <div className="cameraStage">
          {cameraError ? (
            <div className="cameraMessage">
              <span className="messageIcon">!</span>
              <strong>{cameraError}</strong>
              <button className="outlineButton" onClick={onRetryCamera}>
                TRY CAMERA AGAIN
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="cameraVideo"
                onLoadedMetadata={onCameraMetadata}
              />
              {!cameraResolution && (
                <div className="cameraPreparing" role="status">
                  Preparing the camera… You can upload a photo instead.
                </div>
              )}
            </>
          )}
          {countdown !== null && (
            <div className="countdownOverlay">{countdown}</div>
          )}
          <canvas ref={canvasRef} hidden />
        </div>
        <div className="cameraCopy">
          <SelectedProductSummary product={selectedProduct} />
          <p className="privacyNotice">
            Photo notice: this app does not save the original photo to a
            server-side archive. It is sent to FASHN, the configured AI
            provider, to create this virtual try-on; FASHN&apos;s processing
            and retention are governed by its policies.
          </p>
          <p className="positioningHint" aria-live="polite">
            {positioningHint}
          </p>
          {cameraResolution && (
            <span className="cameraResolution">
              Camera photo: {cameraResolution}
            </span>
          )}
          <button
            className="goldButton"
            onClick={onCapture}
            disabled={
              countdown !== null ||
              Boolean(cameraError) ||
              !cameraResolution
            }
          >
            CAPTURE PHOTO
          </button>
          <label className="textButton">
            UPLOAD PHOTO
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onUpload}
              hidden
            />
          </label>
        </div>
      </div>
    </ScreenFrame>
    </>
  );
}

function PreviewScreen({
  image,
  error,
  photoQuality,
  photoQualityError,
  optimizationNotice,
  photoCheckFallbackAvailable,
  photoChecking,
  isAcceptedLook,
  selectedProduct,
  onBack,
  onRetake,
  onUse,
  onUsePhotoChecksOnly,
}: {
  image: string;
  error: string;
  photoQuality: PhotoQualityResult | null;
  photoQualityError: string;
  optimizationNotice: string;
  photoCheckFallbackAvailable: boolean;
  photoChecking: boolean;
  isAcceptedLook: boolean;
  selectedProduct: Product | undefined;
  onBack: () => void;
  onRetake: () => void;
  onUse: () => void;
  onUsePhotoChecksOnly: () => void;
}) {
  const canUsePhoto =
    isAcceptedLook ||
    (photoQuality !== null &&
      (photoQuality.state === "ready" ||
        photoQuality.state === "adjustment"));

  return (
    <>
    {previewBackgroundUrl && <ScreenBackdrop src={previewBackgroundUrl} position="52% 30%" />}
    <ScreenFrame eyebrow="YOUR PHOTO" title="Looking good?" onBack={onBack}>
      <div className="previewLayout">
        <div className="previewImageFrame">
          <img src={image} alt="Your captured preview" />
        </div>
        <div className="previewActions">
          <SelectedProductSummary product={selectedProduct} />
          <p>
            This photo is sent to FASHN to create your look. The provider&apos;s
            handling and retention are governed by its policies.
          </p>
          {isAcceptedLook ? (
            <div className="photoQualityStatus qualityAccepted">
              <strong>Accepted look</strong>
              <span>
                This existing look will continue without another photo check.
              </span>
            </div>
          ) : photoChecking ? (
            <div className="photoQualityStatus" role="status" aria-live="polite">
              <strong>Checking your photo…</strong>
              <span>Checking lighting, clarity and how you are framed.</span>
            </div>
          ) : photoQualityError ? (
            <div
              className="photoQualityStatus qualityRetake"
              role="alert"
              aria-live="assertive"
            >
              <strong>Photo check unavailable</strong>
              <span>{photoQualityError}</span>
              {photoCheckFallbackAvailable && (
                <span>
                  You may retake the photo or explicitly continue without photo
                  quality checks.
                </span>
              )}
            </div>
          ) : photoQuality ? (
            <div
              className={`photoQualityStatus ${
                photoQuality.state === "ready"
                  ? "qualityReady"
                  : photoQuality.state === "retake"
                    ? "qualityRetake"
                    : "qualityAdjustment"
              }`}
              role="status"
              aria-live="polite"
            >
              <strong>
                {photoQuality.state === "ready"
                  ? "Ready for AI"
                  : photoQuality.state === "retake"
                    ? "Retake required"
                    : "Adjustment recommended"}
              </strong>
              <span>
                Photo dimensions: {photoQuality.width} × {photoQuality.height}
              </span>
              {photoQuality.findings.map((finding, index) => (
                <span key={`${finding.message}-${index}`}>{finding.message}</span>
              ))}
              {!isAcceptedLook && optimizationNotice && (
                <span>{optimizationNotice}</span>
              )}
              {photoQuality.poseUnavailable && (
                <span>
                  Body visibility could not be checked. You can retake this
                  photo or continue with photo checks only.
                </span>
              )}
            </div>
          ) : null}
          {error && <p className="customerError">{error}</p>}
          {(photoQuality?.canUsePhotoChecksOnly ||
            (photoQualityError && photoCheckFallbackAvailable)) &&
          !isAcceptedLook ? (
            <button
              className="goldButton"
              onClick={onUsePhotoChecksOnly}
              disabled={
                photoChecking ||
                (Boolean(photoQualityError) && !photoCheckFallbackAvailable)
              }
            >
              {photoQualityError
                ? "CONTINUE WITHOUT PHOTO CHECKS"
                : "CONTINUE WITH PHOTO CHECKS ONLY"}
            </button>
          ) : (
            <button
              className="goldButton"
              onClick={onUse}
              disabled={
                photoChecking ||
                Boolean(photoQualityError) ||
                !canUsePhoto
              }
            >
              USE THIS PHOTO
            </button>
          )}
          <button className="outlineButton" onClick={onRetake}>
            RETAKE
          </button>
        </div>
      </div>
    </ScreenFrame>
    </>
  );
}

function SelectedProductSummary({ product }: { product: Product | undefined }) {
  if (!product) return null;
  return (
    <div className="selectedProductSummary">
      <ProductThumbnail product={product} />
      <span className="cardOverline">YOUR SELECTION</span>
      <strong>{product.name}</strong>
      {product.code && <span>{product.code}</span>}
    </div>
  );
}

function ProductThumbnail({ product }: { product: Product }) {
  const [imageFailed, setImageFailed] = useState(false);
  if (!product.image || imageFailed) {
    return <span className="selectionThumbnailPlaceholder">IMAGE SOON</span>;
  }
  return (
    <img
      className="selectionThumbnail"
      src={displayMediaUrl(product.image)}
      decoding="async"
      alt=""
      onError={() => setImageFailed(true)}
    />
  );
}

function GeneratingScreen() {
  return (
    <section className="experienceScreen generatingScreen">
      <div className="generatingRing">
        <span />
      </div>
      <p className="eyebrow">YOUR LOOK IS IN THE MAKING</p>
      <h1>Creating your new look...</h1>
      <p className="generatingSubline">
        Preparing your virtual outfit<span className="loadingDots">...</span>
      </p>
      <div className="generatingMessages">
        <span>Applying your selected style</span>
        <span>Keeping your photo in its original proportions</span>
        <span>This can take a little while. Please keep this screen open.</span>
      </div>
    </section>
  );
}

function ResultScreen({
  image,
  product,
  error,
  canUndo,
  onKeepAndAddAnother,
  onTryAnother,
  onUndo,
  onStartOver,
  onFinish,
}: {
  image: string;
  product: Product | undefined;
  error: string;
  canUndo: boolean;
  onKeepAndAddAnother: () => void;
  onTryAnother: () => void;
  onUndo: () => void;
  onStartOver: () => void;
  onFinish: () => void;
}) {
  return (
    <>
    {resultBackgroundUrl && (
      <ScreenBackdrop src={resultBackgroundUrl} position="50% 45%" dim />
    )}
    <section className="experienceScreen resultScreen">
      <div className="resultHeading">
        <p className="eyebrow">THE MOMENT</p>
        <h1>Your New Look</h1>
        {product && (
          <p>
            {product.name}
            {product.code && <span> · {product.code}</span>}
          </p>
        )}
      </div>
      {error && <p className="customerError">{error}</p>}
      <div className="resultImageFrame">
        <img src={image} alt="Your new look" />
      </div>
      <div className="resultActions">
        <button
          className="goldButton keepAddButton"
          onClick={onKeepAndAddAnother}
        >
          KEEP THIS LOOK
          <span>&amp; ADD ANOTHER ITEM</span>
        </button>
        <button className="textButton" onClick={onTryAnother}>
          TRY ANOTHER STYLE
        </button>
        {canUndo && (
          <button className="textButton" onClick={onUndo}>
            ← Undo Last Item
          </button>
        )}
        <button className="outlineButton" onClick={onFinish}>
          FINISH &amp; DOWNLOAD
        </button>
        <button className="textButton mutedButton" onClick={onStartOver}>
          START OVER
        </button>
      </div>
    </section>
    </>
  );
}

function FinalScreen({
  image,
  canUndo,
  showroomName,
  onTryAnother,
  onUndo,
  onStartOver,
}: {
  image: string;
  canUndo: boolean;
  showroomName: string;
  onTryAnother: () => void;
  onUndo: () => void;
  onStartOver: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  async function downloadImage() {
    setDownloading(true);
    setDownloadError("");
    try {
      const response = await fetch(image);
      if (!response.ok) {
        throw new Error("The generated image is no longer available.");
      }
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) {
        throw new Error("The generated image could not be downloaded.");
      }
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "lotus-fashion-look.jpg";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      setDownloadError(
        "Your browser could not download this image directly. Open the image below and use your browser's Save image option.",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
    {resultBackgroundUrl && (
      <ScreenBackdrop src={resultBackgroundUrl} position="50% 45%" dim />
    )}
    <section className="experienceScreen finalScreen">
      <div className="finalCopy">
        <p className="eyebrow">THANK YOU</p>
        <h1>Thank you for trying {showroomName} Fashion AI!</h1>
      </div>
      <div className="finalImageFrame">
        <img src={image} alt="Your final look" />
      </div>
      <div className="downloadUnavailable" role="status">
        <strong>Phone QR downloads are not configured on this kiosk.</strong>
        <span>
          Use Download Image to save this look on this device. Ask showroom
          staff for help if the browser cannot download it.
        </span>
      </div>
      <div className="finalDownloadActions">
        <button
          className="goldButton"
          onClick={() => void downloadImage()}
          disabled={downloading}
        >
          {downloading ? "PREPARING IMAGE..." : "DOWNLOAD IMAGE"}
        </button>
        <button
          className="outlineButton"
          disabled
          title="Requires secure temporary image storage and expiring QR access."
        >
          QR DOWNLOAD UNAVAILABLE
        </button>
      </div>
      {downloadError && (
        <p className="downloadError" role="alert">
          {downloadError}{" "}
          <a href={image} target="_blank" rel="noreferrer">
            Open generated image
          </a>
        </p>
      )}
      <div className="finalActions">
        <button className="outlineButton" onClick={onTryAnother}>
          TRY ANOTHER ITEM
        </button>
        {canUndo && (
          <button className="textButton" onClick={onUndo}>
            ← Undo Last Item
          </button>
        )}
        <button className="textButton mutedButton" onClick={onStartOver}>
          START NEW SESSION
        </button>
      </div>
      <p className="poweredBy">Powered by {showroomName}</p>
    </section>
    </>
  );
}

function ScreenBackdrop({
  src,
  position,
  dim = false,
}: {
  src: string;
  position: string;
  dim?: boolean;
}) {
  return (
    <div className="screenBackdrop" aria-hidden="true">
      <img
        className="screenBackdropImage"
        src={displayMediaUrl(src)}
        alt=""
        decoding="async"
        style={{ objectPosition: position }}
      />
      <div className={`screenBackdropScrim${dim ? " screenBackdropDim" : ""}`} />
    </div>
  );
}

function ScreenFrame({
  eyebrow,
  title,
  onBack,
  children,
}: {
  eyebrow: string;
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="experienceScreen framedScreen">
      <div className="screenHeading">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {children}
      <button className="backButton" onClick={onBack}>
        ← Back
      </button>
    </section>
  );
}
