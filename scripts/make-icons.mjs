// Renders the AlphaDog paw icon to the PNG sizes phones need.
//   npm run icons
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const BRAND = "#065f46";

/** Paw on a brand background. `scale` shrinks the paw for maskable icons. */
function pawSvg({ rounded, scale = 1 }) {
  const r = rounded ? 112 : 0;
  const t = (1 - scale) * 256;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${r}" fill="${BRAND}"/>
  <g fill="#ffffff" transform="translate(${t} ${t}) scale(${scale})">
    <path d="M256 236c-52 0-118 70-118 128 0 40 30 58 62 58 24 0 38-12 56-12s32 12 56 12c32 0 62-18 62-58 0-58-66-128-118-128z"/>
    <ellipse cx="146" cy="232" rx="40" ry="52" transform="rotate(-24 146 232)"/>
    <ellipse cx="214" cy="146" rx="40" ry="56" transform="rotate(-8 214 146)"/>
    <ellipse cx="298" cy="146" rx="40" ry="56" transform="rotate(8 298 146)"/>
    <ellipse cx="366" cy="232" rx="40" ry="52" transform="rotate(24 366 232)"/>
  </g>
</svg>`;
}

const png = (svg, size, out) => sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);

writeFileSync("src/app/icon.svg", pawSvg({ rounded: true }));
await png(pawSvg({ rounded: false }), 180, "src/app/apple-icon.png");
await png(pawSvg({ rounded: true }), 192, "public/icons/icon-192.png");
await png(pawSvg({ rounded: true }), 512, "public/icons/icon-512.png");
await png(pawSvg({ rounded: false, scale: 0.7 }), 512, "public/icons/icon-maskable-512.png");
console.log("Icons written");
