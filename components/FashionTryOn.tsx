"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import { catalog, Group } from "@/lib/catalog";
import { fileToDataUrl } from "@/lib/image";
import {
  canAcceptPhotoQualityResult,
  validatePhoto as validateCustomerPhoto,
} from "@/lib/photo-quality";
import type { PhotoQualityResult } from "@/lib/photo-quality";
import { GenerationRequestGuard } from "@/lib/generation-guard";
import { createAnonymousSessionId } from "@/lib/session";

export default function FashionTryOn() {
  const [group, setGroup] = useState<Group>("women");
  const visible = useMemo(
    () => catalog.filter((x) => x.group === group),
    [group],
  );
  const [categoryId, setCategoryId] = useState("chudithar");
  const [personFile, setPersonFile] = useState<File | null>(null);
  const [productFile, setProductFile] = useState<File | null>(null);
  const [personPreview, setPersonPreview] = useState("");
  const [pendingCustomerPhoto, setPendingCustomerPhoto] = useState("");
  const [photoQuality, setPhotoQuality] = useState<PhotoQualityResult | null>(
    null,
  );
  const [photoQualityError, setPhotoQualityError] = useState("");
  const [photoChecking, setPhotoChecking] = useState(false);
  const [photoQualityCategoryId, setPhotoQualityCategoryId] = useState("");
  const [productPreview, setProductPreview] = useState("");
  const [result, setResult] = useState("");
  const [originalCustomerImage, setOriginalCustomerImage] = useState("");
  const [currentAcceptedImage, setCurrentAcceptedImage] = useState("");
  const [acceptedHistory, setAcceptedHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [credits, setCredits] = useState<number | null>(null);
  const photoValidationIdRef = useRef(0);
  const categoryIdRef = useRef(categoryId);
  const generationGuardRef = useRef(new GenerationRequestGuard());
  const anonymousSessionIdRef = useRef<string | null>(null);
  categoryIdRef.current = categoryId;

  const selected = catalog.find((x) => x.id === categoryId) ?? visible[0];

  function changeGroup(next: Group) {
    setGroup(next);
    const first = catalog.find((x) => x.group === next);
    if (first) {
      setCategoryId(first.id);
      if (pendingCustomerPhoto) {
        void checkPendingCustomerPhoto(pendingCustomerPhoto, first.id);
      }
    }
    setProductFile(null);
    setProductPreview("");
    setResult("");
    setError("");
  }

  async function checkPendingCustomerPhoto(
    image: string | Blob,
    nextCategoryId: string,
  ) {
    const validationId = ++photoValidationIdRef.current;
    setPhotoQuality(null);
    setPhotoQualityError("");
    setPhotoChecking(true);
    setPhotoQualityCategoryId(nextCategoryId);
    try {
      const quality = await validateCustomerPhoto(image, nextCategoryId);
      if (validationId === photoValidationIdRef.current) setPhotoQuality(quality);
    } catch (validationError) {
      if (validationId === photoValidationIdRef.current) {
        setPhotoQualityError(
          validationError instanceof Error
            ? validationError.message
            : "Photo checks are unavailable. Please choose another photo.",
        );
      }
    } finally {
      if (validationId === photoValidationIdRef.current) setPhotoChecking(false);
    }
  }

  async function setFile(
    kind: "person" | "product",
    e: ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Please use JPG, PNG or WEBP.");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setError("Image is larger than the FASHN 30 MiB input limit.");
      return;
    }
    if (kind === "person") {
      photoValidationIdRef.current += 1;
      setPendingCustomerPhoto("");
      setPhotoQuality(null);
      setPhotoQualityError("");
      setPhotoChecking(true);
      setResult("");
    }
    try {
      const preview = await fileToDataUrl(file);
      if (kind === "person") {
        setPersonFile(file);
        setPendingCustomerPhoto(preview);
        await checkPendingCustomerPhoto(file, categoryIdRef.current);
      } else {
        setProductFile(file);
        setProductPreview(preview);
      }
      setResult("");
      setError("");
    } catch (e) {
      if (kind === "person") {
        setPhotoChecking(false);
        setPhotoQuality(null);
        setPhotoQualityError(
          e instanceof Error ? e.message : "Unable to read image.",
        );
      }
      setError(e instanceof Error ? e.message : "Unable to read image.");
    }
  }

  async function generate() {
    if (generationGuardRef.current.isActive()) return;
    if (pendingCustomerPhoto) {
      setError("Review and accept the customer photo before generating a look.");
      return;
    }
    if (!currentAcceptedImage || !productFile || !selected) {
      setError("Add a customer photo and a product photo first.");
      return;
    }
    if (!generationGuardRef.current.tryStart()) return;
    const controller = new AbortController();
    let timeout: number | undefined;
    try {
      setLoading(true);
      setError("");
      setResult("");
      setCredits(null);

      const modelImage = currentAcceptedImage;
      const productImage = await fileToDataUrl(productFile);
      anonymousSessionIdRef.current ??= createAnonymousSessionId();
      timeout = window.setTimeout(() => controller.abort(), 65_000);

      const res = await fetch("/api/tryon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelImage,
          productImage,
          categoryId: selected.id,
          productCode: "CUSTOM-UPLOAD",
          sessionId: anonymousSessionIdRef.current,
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed.");
      setResult(data.image);
      setCredits(
        typeof data.creditsUsed === "number" ? data.creditsUsed : null,
      );
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "AbortError"
          ? "This request took too long and its status may be uncertain. No automatic retry was made; please wait before trying again."
          : e instanceof TypeError
            ? "The connection was interrupted. No automatic retry was made; check your internet before trying again."
            : e instanceof Error
              ? e.message
              : "Generation failed.",
      );
    } finally {
      if (timeout !== undefined) window.clearTimeout(timeout);
      generationGuardRef.current.finish();
      setLoading(false);
    }
  }

  function keepLook() {
    if (!result) return;
    setCurrentAcceptedImage(result);
    setAcceptedHistory((history) => [...history, result]);
    setPersonPreview(result);
    setPersonFile(null);
    setResult("");
    setProductFile(null);
    setProductPreview("");
    setCredits(null);
  }

  function acceptCustomerPhoto() {
    if (
      !pendingCustomerPhoto ||
      photoQualityError ||
      photoQualityCategoryId !== selected?.id ||
      !canAcceptPhotoQualityResult(photoQuality)
    ) return;
    setOriginalCustomerImage(pendingCustomerPhoto);
    setCurrentAcceptedImage(pendingCustomerPhoto);
    setAcceptedHistory([pendingCustomerPhoto]);
    setPersonPreview(pendingCustomerPhoto);
    setPendingCustomerPhoto("");
    setPhotoQuality(null);
    setPhotoQualityError("");
    setError("");
  }

  function undoLastLook() {
    if (acceptedHistory.length <= 1 || loading) return;
    const previousHistory = acceptedHistory.slice(0, -1);
    const previousImage = previousHistory[previousHistory.length - 1];
    setAcceptedHistory(previousHistory);
    setCurrentAcceptedImage(previousImage);
    setPersonPreview(previousImage);
    setPersonFile(null);
    setResult("");
    setProductFile(null);
    setProductPreview("");
    setError("");
    setCredits(null);
  }

  function restoreOriginalPhoto() {
    if (!originalCustomerImage || loading) return;
    setCurrentAcceptedImage(originalCustomerImage);
    setAcceptedHistory([originalCustomerImage]);
    setPersonPreview(originalCustomerImage);
    setPersonFile(null);
    setResult("");
    setProductFile(null);
    setProductPreview("");
    setError("");
    setCredits(null);
  }

  function reset() {
    if (generationGuardRef.current.isActive()) return;
    photoValidationIdRef.current += 1;
    anonymousSessionIdRef.current = null;
    setPersonFile(null);
    setProductFile(null);
    setPersonPreview("");
    setPendingCustomerPhoto("");
    setPhotoQuality(null);
    setPhotoQualityError("");
    setPhotoChecking(false);
    setPhotoQualityCategoryId("");
    setProductPreview("");
    setResult("");
    setOriginalCustomerImage("");
    setCurrentAcceptedImage("");
    setAcceptedHistory([]);
    setError("");
    setCredits(null);
    setGroup("women");
    setCategoryId("chudithar");
  }

  return (
    <>
      <header className="header">
        <div className="headerInner">
          <div>
            <div className="brandSmall">Lotus Prime Digital Solutions</div>
            <div className="brandTitle">Fashion AI Virtual Try-On</div>
          </div>
          <div className="badge">FASHN Try-On Max · 1K Balanced</div>
        </div>
      </header>

      <main className="shell">
        <section className="hero">
          <h1>Try Your Next Look</h1>
          <p>
            Separate validation project for popular Indian clothing, men&apos;s
            shirts and trousers, and optional wearable accessories. Saree is
            intentionally not included.
          </p>
        </section>

        <div className="tabs">
          <button
            className={`tab ${group === "women" ? "active" : ""}`}
            onClick={() => changeGroup("women")}
          >
            Women
          </button>
          <button
            className={`tab ${group === "men" ? "active" : ""}`}
            onClick={() => changeGroup("men")}
          >
            Men
          </button>
          <button
            className={`tab ${group === "accessories" ? "active" : ""}`}
            onClick={() => changeGroup("accessories")}
          >
            Accessories
          </button>
        </div>

        <div className="categoryGrid">
          {visible.map((item) => (
            <button
              key={item.id}
              className={`category ${categoryId === item.id ? "active" : ""}`}
              onClick={() => {
                if (pendingCustomerPhoto) {
                  void checkPendingCustomerPhoto(pendingCustomerPhoto, item.id);
                }
                setCategoryId(item.id);
                setProductFile(null);
                setProductPreview("");
                setResult("");
                setError("");
              }}
            >
              <strong>
                {item.name}
                {item.experimental ? " 🧪" : ""}
              </strong>
              <span>{item.description}</span>
            </button>
          ))}
        </div>

        <section className="workspace">
          <UploadCard
            title={
              pendingCustomerPhoto
                ? "New Customer Photo"
                : acceptedHistory.length > 1
                ? "Current Accepted Look"
                : "Customer Photo"
            }
            description={
              pendingCustomerPhoto
                ? "Optional quality suggestions are shown below; they never prevent using a valid photo."
                : acceptedHistory.length > 1
                ? "This accepted AI result will be used for the next item."
                : "Use a clear front-facing or full-body customer photo."
            }
            preview={pendingCustomerPhoto || personPreview}
            onChange={(e) => setFile("person", e)}
          />
          <UploadCard
            title={selected ? `${selected.name} Product` : "Product"}
            description={
              selected?.experimental
                ? "Experimental category: validate carefully before production."
                : "Upload the actual product the customer wants to try."
            }
            preview={productPreview}
            onChange={(e) => setFile("product", e)}
          />
          <div className="card resultCard">
            <h3>AI Result</h3>
            <p>Review identity and exact product fidelity before accepting.</p>
            <div className="resultBox">
              {loading ? (
                <div className="placeholder">
                  <div className="spinner" />
                  <div style={{ marginTop: 16 }}>Creating try-on…</div>
                  <div style={{ fontSize: 12, marginTop: 7 }}>
                    1K Balanced configuration.
                  </div>
                </div>
              ) : result ? (
                <img src={result} alt="Generated virtual try-on" />
              ) : (
                <div className="placeholder">
                  Generated result will appear here.
                </div>
              )}
            </div>
          </div>
        </section>

        {pendingCustomerPhoto && (
          <section
            className="photoQualityStatus qualityAdjustment"
            aria-live="polite"
          >
            {photoChecking ? (
              <>
                <strong>Checking your photo…</strong>
                <span>
                  Checking lighting, clarity and category-specific framing.
                </span>
              </>
            ) : photoQualityError ? (
              <>
                <strong>This photo can&apos;t be used</strong>
                <span>{photoQualityError}</span>
              </>
            ) : photoQuality && photoQualityCategoryId === selected?.id ? (
              <>
                <strong>
                  {photoQuality.state === "ready"
                    ? "Ready for AI"
                    : "Optional suggestions"}
                </strong>
                <span>
                  Photo dimensions: {photoQuality.width} × {photoQuality.height}
                </span>
                {photoQuality.findings.map((finding, index) => (
                  <span key={`${finding.message}-${index}`}>
                    {finding.message}
                  </span>
                ))}
                <span>You can continue with this photo or choose another.</span>
              </>
            ) : null}
            <button
              className="primary"
              onClick={acceptCustomerPhoto}
              disabled={
                photoChecking ||
                Boolean(photoQualityError) ||
                photoQualityCategoryId !== selected?.id ||
                !canAcceptPhotoQualityResult(photoQuality)
              }
            >
              Use this photo
            </button>
          </section>
        )}

        {error && <div className="error">{error}</div>}

        <div className="controls">
          <button
            className="primary"
            onClick={generate}
            disabled={
              loading ||
              !currentAcceptedImage ||
              !productFile ||
              Boolean(pendingCustomerPhoto)
            }
          >
            {loading ? "Generating…" : `Try ${selected?.name ?? "Product"}`}
          </button>
          {result && (
            <button className="secondary" onClick={keepLook}>
              ✓ Keep This Look + Add Another
            </button>
          )}
          {acceptedHistory.length > 1 && (
            <button
              className="secondary"
              onClick={undoLastLook}
              disabled={loading}
            >
              ← Undo Last Look
            </button>
          )}
          <button
            className="secondary"
            onClick={restoreOriginalPhoto}
            disabled={!originalCustomerImage || loading}
          >
            ↺ Original Photo
          </button>
          <button className="secondary" onClick={reset} disabled={loading}>
            Start Again
          </button>
        </div>

        {credits !== null && (
          <div className="meta">
            Credits used for last successful generation: {credits}
          </div>
        )}

        <div className="notice">
          <strong>Validation rule:</strong> for shirts and trousers, verify that
          only the intended garment changes and the non-selected garment stays
          intact. For multi-piece Indian outfits and accessories, verify product
          design, color, face/identity and body consistency. Glasses are
          included as an experimental option until your own tests confirm
          reliability.
        </div>
      </main>
    </>
  );
}

function UploadCard({
  title,
  description,
  preview,
  onChange,
}: {
  title: string;
  description: string;
  preview: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <p>{description}</p>
      <label className="drop">
        {preview ? (
          <img src={preview} alt={title} />
        ) : (
          <div className="placeholder">
            <div className="plus">+</div>
            <div>Add Image</div>
            <div style={{ fontSize: 12, marginTop: 7 }}>JPG · PNG · WEBP</div>
          </div>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onChange}
          hidden
        />
      </label>
    </div>
  );
}
