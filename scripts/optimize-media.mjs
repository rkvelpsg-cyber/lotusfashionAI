// Generates lightweight display copies of the showroom images and promo video
// in public/optimized and writes lib/media-manifest.json, which maps each
// original public URL to its optimized, content-hashed URL.
//
// Originals are never modified: the try-on API reads the original product
// files from public/products for FASHN, so only the browser uses these copies.
//
// Runs automatically before `npm run dev` and `npm run build`. Work is skipped
// when an up-to-date copy already exists, and missing tools never fail the
// build (the app falls back to the original files). Video re-encoding needs
// ffmpeg on PATH or FFMPEG_PATH; existing video copies are reused without it.
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const OUTPUT_DIR = path.join(PUBLIC_DIR, "optimized");
const MANIFEST_PATH = path.join(ROOT, "lib", "media-manifest.json");

// Bump when encoder settings change so every copy is regenerated.
const SETTINGS_VERSION = "v1";
// Catalogue product photos (e.g. SR001.jpg) are shown as cards and thumbnails.
const PRODUCT_CODE = /^[A-Z]{2}\d{3}\.(jpe?g|png|webp)$/i;
const PRODUCT_MAX_EDGE = 900;
// Full-screen backgrounds must still cover a 1080x1920 portrait or 1920x1080
// landscape kiosk after object-fit: cover cropping.
const BACKGROUND_MAX_EDGE = 2560;
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const VIDEO_EXT = /\.mp4$/i;

async function listFiles(dir, { skipOutput = false } = {}) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipOutput && full === OUTPUT_DIR) continue;
      files.push(...(await listFiles(full, { skipOutput })));
    } else {
      files.push(full);
    }
  }
  return files;
}

const toPublicUrl = (file) =>
  `/${path.relative(PUBLIC_DIR, file).split(path.sep).join("/")}`;

async function hashFile(file, salt) {
  const hash = createHash("sha1");
  hash.update(salt);
  hash.update(await readFile(file));
  return hash.digest("hex").slice(0, 10);
}

async function findFfmpeg() {
  for (const candidate of [process.env.FFMPEG_PATH, "ffmpeg"].filter(Boolean)) {
    try {
      await execFileAsync(candidate, ["-version"]);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

async function main() {
  let sharp = null;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.warn("[optimize-media] sharp is unavailable; missing image copies use the originals.");
  }

  const sources = (await listFiles(PUBLIC_DIR, { skipOutput: true }))
    .filter((file) => IMAGE_EXT.test(file) || VIDEO_EXT.test(file))
    .sort();
  const manifest = {};
  const keep = new Set();
  let ffmpeg;
  let created = 0;

  for (const source of sources) {
    const url = toPublicUrl(source);
    const isVideo = VIDEO_EXT.test(source);
    const base = path.join(
      OUTPUT_DIR,
      path.relative(PUBLIC_DIR, source).replace(/\.[^.]+$/, ""),
    );
    const hash = await hashFile(source, `${SETTINGS_VERSION}:${isVideo ? "video" : "image"}`);

    if (isVideo) {
      const videoOut = `${base}.${hash}.mp4`;
      const posterOut = `${base}.${hash}.poster.webp`;
      if (!existsSync(videoOut) || !existsSync(posterOut)) {
        if (ffmpeg === undefined) ffmpeg = await findFfmpeg();
        if (!ffmpeg) {
          console.warn(`[optimize-media] ffmpeg not found; ${url} uses the original file.`);
          continue;
        }
        await mkdir(path.dirname(videoOut), { recursive: true });
        // H.264 for universal playback, no audio (the promo is muted), and
        // +faststart so playback begins before the whole file downloads.
        await execFileAsync(ffmpeg, [
          "-y", "-loglevel", "error", "-i", source,
          "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "26",
          "-pix_fmt", "yuv420p", "-movflags", "+faststart", videoOut,
        ]);
        await execFileAsync(ffmpeg, [
          "-y", "-loglevel", "error", "-i", source, "-frames:v", "1",
          "-c:v", "libwebp", "-quality", "75", posterOut,
        ]);
        created += 1;
      }
      const [original, optimized] = await Promise.all([stat(source), stat(videoOut)]);
      // Only use the re-encode when it is actually smaller.
      manifest[url] = optimized.size < original.size ? toPublicUrl(videoOut) : url;
      manifest[`${url}#poster`] = toPublicUrl(posterOut);
      keep.add(videoOut);
      keep.add(posterOut);
      continue;
    }

    const imageOut = `${base}.${hash}.webp`;
    if (!existsSync(imageOut)) {
      if (!sharp) continue;
      const maxEdge = PRODUCT_CODE.test(path.basename(source))
        ? PRODUCT_MAX_EDGE
        : BACKGROUND_MAX_EDGE;
      await mkdir(path.dirname(imageOut), { recursive: true });
      await sharp(source)
        .rotate()
        .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80, effort: 5 })
        .toFile(imageOut);
      created += 1;
    }
    manifest[url] = toPublicUrl(imageOut);
    keep.add(imageOut);
  }

  // Remove copies whose source changed or was deleted.
  if (existsSync(OUTPUT_DIR)) {
    for (const file of await listFiles(OUTPUT_DIR)) {
      if (!keep.has(file)) await rm(file);
    }
  }

  const next = `${JSON.stringify(manifest, null, 2)}\n`;
  const current = existsSync(MANIFEST_PATH) ? await readFile(MANIFEST_PATH, "utf8") : "";
  if (next !== current) await writeFile(MANIFEST_PATH, next);
  console.log(`[optimize-media] ${Object.keys(manifest).length} media entries, ${created} regenerated.`);
}

main().catch((error) => {
  // Never block dev or build: the app falls back to the original media.
  console.warn(`[optimize-media] skipped: ${error instanceof Error ? error.message : error}`);
});
