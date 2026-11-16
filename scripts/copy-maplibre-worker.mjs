// MapLibre 6 finds its worker file relative to its own module URL, which
// breaks once Next bundles it. Copy the worker into /public so the app can
// point at it with setWorkerUrl(). Runs before dev and build.
import { copyFileSync, mkdirSync } from "node:fs";

const src = new URL("../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url);
const outDir = new URL("../public/vendor/", import.meta.url);
mkdirSync(outDir, { recursive: true });
copyFileSync(src, new URL("maplibre-gl-worker.js", outDir));
console.log("Copied MapLibre worker to public/vendor/");
