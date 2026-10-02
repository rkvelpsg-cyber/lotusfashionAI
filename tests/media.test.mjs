import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(path.join(root, "lib", "media-manifest.json"), "utf8"),
);
const publicPath = (url) => path.join(root, "public", ...url.split("/").filter(Boolean));

test("every optimized media entry points to an existing, smaller file", () => {
  for (const [original, optimized] of Object.entries(manifest)) {
    assert.ok(existsSync(publicPath(optimized)), `${optimized} is missing`);
    if (original.endsWith("#poster")) continue;
    assert.ok(existsSync(publicPath(original)), `original ${original} is missing`);
    assert.ok(
      statSync(publicPath(optimized)).size <= statSync(publicPath(original)).size,
      `${optimized} is not smaller than ${original}`,
    );
  }
});

test("all page backgrounds, the promo video and its poster are optimized", () => {
  for (const url of [
    "/products/accessories/homepage.jpg",
    "/products/mainimage.jpg",
    "/products/thirdimage.jpg",
    "/products/rangoli.jpg",
    "/products/flower.jpg",
    "/products/thirdimagere.jpg",
    "/lamb.jpg",
    "/products/promo_pexel.mp4",
    "/products/promo_pexel.mp4#poster",
  ]) {
    assert.match(manifest[url] ?? "", /^\/optimized\//, `${url} has no optimized copy`);
  }
});

test("optimized copies never replace the original product files sent to FASHN", () => {
  const productEntries = Object.keys(manifest).filter((url) =>
    /\/[A-Z]{2}\d{3}\.jpg$/.test(url),
  );
  assert.ok(productEntries.length >= 40, "catalogue images should all have display copies");
  for (const url of productEntries) {
    assert.ok(url.startsWith("/products/"));
    assert.ok(manifest[url].startsWith("/optimized/"));
  }
});
