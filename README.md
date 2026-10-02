# Lotus Fashion AI Virtual Try-On

A separate Next.js test project for FASHN Try-On Max. It does NOT modify the existing saree project.

## V1 categories

Women: Chudithar, Salwar Suit, Anarkali, Lehenga, Kurti/Kurti Set, Long Gown.
Men: Formal Shirt, Casual Shirt, T-Shirt, Formal Trouser, Casual Trouser/Chino, Jeans, Kurta, Kurta Pajama, Sherwani.
Accessories: Bag, Shoes, Jewellery, Headwear, Glasses (experimental until validated).

## Run in VS Code

1. Extract this ZIP.
2. Open the extracted folder in VS Code.
3. Run: `npm install`
4. Copy `.env.example` to `.env.local`.
5. Put your real FASHN key in `.env.local`.
6. Run: `npm run dev`
7. Open http://localhost:3000

## Important

- The FASHN API key is server-side only.
- Default generation: Try-On Max, 1K, Balanced, 1 image.
- Product images and customer photos are converted to data URIs for this validation build.
- - This is an AI virtual try-on with showroom welcome screen, kiosk camera countdown, product catalogue, and sequential accessory styling. Secure phone QR downloads are not enabled.
- Original customer photos are checked locally for actual image dimensions, exposure, sharpness and category-specific body visibility before the first generation. The camera requests an ideal 1920 × 1080 stream; the actual captured dimensions are checked, and images below 640 × 480 (orientation-independent) are rejected.
- Pose checks lazily load MediaPipe Pose Landmarker and its lightweight model in the browser. If the model is unavailable, customers see an explicit warning and may either retake the photo or continue with image checks only. Generated images in the sequential styling flow are not revalidated.
- Initial configurable image thresholds in `lib/photo-quality.ts`: analyze a maximum 512-pixel image sample; reject Laplacian variance below 35 and recommend adjustment below 80; reject mean luminance at or below 25 or at or above 248; flag darker-than-65 or brighter-than-215 images for lighting adjustment. Extreme dark/bright pixel ratios warn but do not alone reject an image, reducing false positives from backgrounds. These are conservative starting values and should be tuned against representative kiosk photographs before deployment. Landmark visibility below 0.5 fails required-region checks; horizontal centering guidance begins at a 0.16 normalized offset.
- Run the local synthetic raster/landmark checks with `npm run test:photo-quality`.

## Kiosk configuration and privacy

The welcome screen accepts the following optional public environment variables. Restart the app after changing them:

- `NEXT_PUBLIC_SHOWROOM_NAME`: showroom name, default `Lotus Prime`.
- `NEXT_PUBLIC_SHOWROOM_LOGO_URL`: logo URL relative to the app or an HTTPS URL.
- `NEXT_PUBLIC_WELCOME_IMAGE_URL`: welcome-screen background image. Defaults to `/products/accessories/homepage.jpg` (not part of the product catalogue).
- `NEXT_PUBLIC_GENDER_BACKGROUND_URL`: background image for the "Who are we styling today?" screen. Defaults to `/products/mainimage.jpg`.
- `NEXT_PUBLIC_CATEGORY_BACKGROUND_URL`: background image for the "Choose your style" screen. Defaults to `/products/thirdimage.jpg`.
- `NEXT_PUBLIC_CATALOGUE_BACKGROUND_URL`: background image for the "Choose a piece to try" screen. Defaults to `/products/rangoli.jpg`.
- `NEXT_PUBLIC_CAMERA_BACKGROUND_URL`: background image for the "Step Into Your Look" camera screen. Defaults to `/products/flower.jpg`. It is page decoration only and is never part of the captured photo.
- `NEXT_PUBLIC_PREVIEW_BACKGROUND_URL`: background image for the "Looking good?" photo-review screen. Defaults to `/products/thirdimagere.jpg`.
- `NEXT_PUBLIC_RESULT_BACKGROUND_URL`: darkened background image for the "Your New Look" result and final thank-you/download screens. Defaults to `/lamb.jpg`.
- `NEXT_PUBLIC_PROMO_VIDEO_URL`: muted full-screen looping promo video. Defaults to `/products/promo_pexel.mp4`. It plays on entering the "Who are we styling today?" screen, and any touch or click hides and pauses it.
- `NEXT_PUBLIC_PROMO_IDLE_MS`: kiosk idle time before the promo video starts again on any screen (default `60000`). The camera and generation steps are excluded. A touch on the welcome screen's promo goes to the "Who are we styling today?" screen; elsewhere it returns to the current screen. Session timeouts are paused while the promo plays and no customer data is held; otherwise they keep running underneath so customer data is still cleared.
- `NEXT_PUBLIC_WELCOME_VIDEO_URL`: looping welcome video URL, shown over the background image. Playback starts muted; the customer can enable sound after interacting.
- `NEXT_PUBLIC_WELCOME_AUDIO_URL`: optional Indian English welcome voice recording, played only after the customer presses its control.
- `NEXT_PUBLIC_SESSION_IDLE_MS`: active-session idle period before the warning, default `180000` (3 minutes).
- `NEXT_PUBLIC_SESSION_WARNING_MS`: warning countdown before an active session resets, default `60000` (1 minute).
- `NEXT_PUBLIC_COMPLETED_SESSION_TIMEOUT_MS`: time shown on the completed thank-you screen before its final warning/reset, default `180000` (3 minutes).

The browser fullscreen API is requested when the customer starts, where supported. It cannot enforce operating-system restrictions. For a locked-down standee, deploy the site over HTTPS and launch a dedicated kiosk browser/account in the operating system's kiosk mode; configure OS-level exit restrictions and device management separately.

On Windows, use **Settings → Accounts → Other users → Set up a kiosk** to create a dedicated Assigned Access account, select Microsoft Edge as the kiosk app, choose full-screen digital signage/interactive mode, and configure the deployed HTTPS showroom URL. Use Edge/Windows policy to grant camera access only to that origin, disable browser exit/navigation as required by store policy, and test sign-in, restart recovery, camera permissions, audio, and touch input on the actual device. Assigned Access availability and controls vary by Windows edition; consult the device administrator before rollout. A normal browser full-screen request is not a substitute for these OS restrictions.

Customer photos are sent to FASHN for generation and remain in browser memory for the active session. The final screen attempts a browser-local download of the generated image and offers the provider image in a new tab if browser CORS rules prevent the download. No copy is placed in app-managed permanent storage. This app does not have configured private temporary storage, so phone QR downloads are disabled. The storage and grant-store ports for a future server integration are defined in `lib/temporary-downloads.ts`; they have no provider implementation and public downloads must remain disabled. Before enabling QR downloads, configure a private object bucket with server-only credentials and no public ACL, an expiring server-side grant store with atomic expiry checks, scheduled deletion of expired grant records and objects, a public HTTPS application origin, and verified access/retention controls. Provider retention is governed by FASHN's policy; this app does not claim provider-side deletion.

Generation monitoring emits structured server logs with an anonymous session ID, product/category, status, prediction ID when available, processing duration, and a sanitized failure reason. Logs never include API credentials or image data. Configure access and retention on the hosting platform before production use; logs are diagnostic records, not a durable billing ledger.

Run all local automated checks with `npm test`. Tests use synthetic image data and do not submit paid FASHN requests.

## Media loading

`npm run dev` and `npm run build` first run [scripts/optimize-media.mjs](./scripts/optimize-media.mjs), which writes lightweight display copies to `public/optimized/` and their mapping to [lib/media-manifest.json](./lib/media-manifest.json):

- Page backgrounds become WebP, at most 2560 px on the long edge.
- Catalogue photos become WebP, at most 900 px on the long edge.
- The promo video is re-encoded to H.264 with fast start, and a poster frame is extracted.

The browser only loads these copies; once the welcome screen has loaded, it pre-caches every background and catalogue image. The original files in `public/products/` are left untouched, because the try-on API reads the original product photo for FASHN.

When an image is added or replaced, its copy is regenerated automatically (copy file names contain a content hash, so they are served with long-lived immutable caching). Re-encoding a replaced video needs `ffmpeg` on `PATH` or in `FFMPEG_PATH`. Without it, the original video is served instead. Commit `public/optimized/` and `lib/media-manifest.json` with the media.

## Netlify deployment

Netlify's OpenNext adapter supports this Next.js App Router and `app/api/tryon` Route Handler. [netlify.toml](./netlify.toml) only pins the build command (`npm run build`) and Node.js 22; no publish directory or plugin needs to be configured. Set `FASHN_API_KEY` in Netlify's server-side environment variables (scopes: Functions; context: Production, plus Deploy Previews only if previews should generate). Do not prefix it with `NEXT_PUBLIC_`. The showroom branding and timeout values above are optional public variables. Leave `ENABLE_DEV_VALIDATION_PAGE` unset so the `/dev` validation page returns 404 in production.

### Image payload size

The try-on request sends the customer photo (and a staff-uploaded product image, if used) as base64 data URLs inside JSON to a synchronous Route Handler. Catalogue products are sent as short `/products/...` paths, and sequential try-ons send the previous FASHN result URL, so only the first customer photo is large. Netlify's buffered function request payload limit is 6 MB (not configurable), and binary/base64 bodies effectively allow about 4.5 MB.

`lib/image-payload.ts` enforces this:

- Typical camera frames (1920 × 1080 JPEG, roughly 0.2–1.2 MB) are sent unchanged.
- An uploaded or captured image whose data URL exceeds 2 MB is re-encoded as JPEG (quality 0.92 → 0.85, long side capped at 2560 px) and never scaled below 1920 × 1080, the photo-quality "preferred" size. The customer sees a visible "Photo optimised for upload: original → final" notice; quality is never reduced silently.
- If an image still cannot fit, the customer is asked to retake it. The browser also refuses to send any request body above 4.5 MB, so no FASHN credit is spent on a request Netlify would reject.
- The API route returns 413 for bodies above 6 MB, and the client shows friendly messages for 413/502/504 and non-JSON platform error pages.
- `[TRYON-MONITOR]` logs include only `requestBytes`, image input kinds (`data-url`, `catalogue-path`, `remote-url`) and decoded byte sizes, never image contents.

Netlify's synchronous execution limit is 60 seconds (not configurable). FASHN `tryon-max` usually completes within this limit, but a slow generation can be cut off by Netlify after FASHN has already accepted it, which may still consume a credit. The client shows an "uncertain status" message and never retries automatically.

The pose checker downloads MediaPipe WASM from `cdn.jsdelivr.net` and the pose model from `storage.googleapis.com` at runtime. Showroom networks must allow both; if blocked, the app offers the existing "continue with photo checks only" fallback.

No live Netlify deployment or paid generation request was performed during validation.

Future Supabase work, if approved, would need private object storage, short-lived download tokens, server-side authorization/expiry checks, retention cleanup, and QR rendering. No Supabase package, database, or storage integration is included.
