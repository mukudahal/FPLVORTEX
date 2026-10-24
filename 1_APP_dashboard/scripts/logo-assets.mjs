// Derives every brand asset from public/logo.png (the single source of truth).
// Re-run after replacing the logo:  node scripts/logo-assets.mjs
import sharp from "sharp";
import { mkdir, rename, writeFile } from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "public", "logo.png");
const TMP = path.join(ROOT, "public", "logo.tmp.png");
const ICON_DIR = path.join(ROOT, "public", "icons");
const BLACK = { r: 0, g: 0, b: 0, alpha: 1 };

// 1. Normalise: real PNG, trim excess black margins (never recolours the artwork)
await sharp(SRC)
  .trim({ background: "#000000", threshold: 18 })
  .png({ compressionLevel: 9 })
  .toFile(TMP);
await rename(TMP, SRC);

const meta = await sharp(SRC).metadata();
const W = meta.width;
const H = meta.height;

// 2. Read the palette from the pixels (hue buckets on a 480px-wide sample)
const { data, info } = await sharp(SRC)
  .resize({ width: 480 })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

function rgbToHsv(r, g, b) {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

const buckets = {
  gold: { r: 0, g: 0, b: 0, n: 0 },
  green: { r: 0, g: 0, b: 0, n: 0 },
  cyan: { r: 0, g: 0, b: 0, n: 0 },
  background: { r: 0, g: 0, b: 0, n: 0 },
};
let total = 0;
for (let i = 0; i < data.length; i += info.channels) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const { h, s, v } = rgbToHsv(r, g, b);
  total++;
  let key = null;
  if (v < 0.09) key = "background";
  else if (s > 0.45 && v > 0.55 && h >= 32 && h < 62) key = "gold";
  else if (s > 0.45 && v > 0.55 && h >= 62 && h < 160) key = "green";
  else if (s > 0.35 && v > 0.45 && h >= 165 && h < 215) key = "cyan";
  if (!key) continue;
  const bk = buckets[key];
  bk.r += r; bk.g += g; bk.b += b; bk.n++;
}
const hex = (bk, fallback) =>
  bk.n === 0
    ? fallback
    : "#" +
      [bk.r, bk.g, bk.b]
        .map((c) => Math.round(c / bk.n).toString(16).padStart(2, "0"))
        .join("");
const lighten = (h, amt) => {
  const n = parseInt(h.slice(1), 16);
  const ch = (x) => Math.min(255, Math.round(x + (255 - x) * amt));
  return (
    "#" +
    [ch(n >> 16), ch((n >> 8) & 255), ch(n & 255)]
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")
  );
};

const palette = {
  background: buckets.background.n / total > 0.3 ? "#000000" : hex(buckets.background, "#000000"),
  gold: hex(buckets.gold, "#f2c230"),
  green: hex(buckets.green, "#7fff1e"),
  cyan: hex(buckets.cyan, "#24b7d3"),
};
palette.goldLight = lighten(palette.gold, 0.35);
palette.greenLight = lighten(palette.green, 0.45);
const share = Object.fromEntries(
  Object.entries(buckets).map(([k, v]) => [k, Math.round((v.n / total) * 1000) / 10]),
);

// 3. Square lion-crop icon (left ~42% of the artwork, faded on the right edge, black padding)
await mkdir(ICON_DIR, { recursive: true });
const lionW = Math.min(W, Math.round(W * 0.42));
const side = Math.max(H, lionW);
const fadeSvg = Buffer.from(
  `<svg width="${lionW}" height="${H}" xmlns="http://www.w3.org/2000/svg">
     <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="0">
       <stop offset="0.72" stop-color="#000" stop-opacity="0"/>
       <stop offset="1" stop-color="#000" stop-opacity="1"/>
     </linearGradient></defs>
     <rect width="${lionW}" height="${H}" fill="url(#g)"/>
   </svg>`,
);
const lionSquare = await sharp(SRC)
  .extract({ left: 0, top: 0, width: lionW, height: H })
  .composite([{ input: fadeSvg, blend: "over" }])
  .extend({
    left: Math.floor((side - lionW) / 2),
    right: Math.ceil((side - lionW) / 2),
    top: Math.floor((side - H) / 2),
    bottom: Math.ceil((side - H) / 2),
    background: BLACK,
  })
  .png()
  .toBuffer();

const squareOut = async (size, file) =>
  sharp(lionSquare).resize(size, size).png().toFile(file);
await squareOut(512, path.join(ICON_DIR, "icon-512.png"));
await squareOut(192, path.join(ICON_DIR, "icon-192.png"));
await squareOut(180, path.join(ROOT, "public", "apple-touch-icon.png"));
await squareOut(64, path.join(ROOT, "public", "favicon.png"));
await squareOut(32, path.join(ROOT, "public", "favicon-32.png"));

// 4. Maskable icon: full logo contained in the safe zone on black
const maskLogo = await sharp(SRC).resize({ width: 400, fit: "inside" }).png().toBuffer();
const ml = await sharp(maskLogo).metadata();
await sharp({ create: { width: 512, height: 512, channels: 4, background: BLACK } })
  .composite([{ input: maskLogo, left: Math.round((512 - ml.width) / 2), top: Math.round((512 - ml.height) / 2) }])
  .png()
  .toFile(path.join(ICON_DIR, "maskable-512.png"));

// 5. Open Graph image 1200x630 (logo centred on black)
const ogLogo = await sharp(SRC).resize({ width: 1040, height: 540, fit: "inside" }).png().toBuffer();
const ol = await sharp(ogLogo).metadata();
await sharp({ create: { width: 1200, height: 630, channels: 4, background: BLACK } })
  .composite([{ input: ogLogo, left: Math.round((1200 - ol.width) / 2), top: Math.round((630 - ol.height) / 2) }])
  .png()
  .toFile(path.join(ROOT, "public", "og-image.png"));

// 6. Emit metadata used by the Logo component and theme
const ts = `// AUTO-GENERATED by scripts/logo-assets.mjs from public/logo.png — do not edit by hand.
export const LOGO_WIDTH = ${W};
export const LOGO_HEIGHT = ${H};
export const LOGO_PALETTE = ${JSON.stringify(palette, null, 2)} as const;
export const LOGO_COLOR_SHARE_PCT = ${JSON.stringify(share, null, 2)} as const;
`;
await writeFile(path.join(ROOT, "src", "lib", "logoMeta.ts"), ts);

console.log(JSON.stringify({ width: W, height: H, palette, sharePct: share }, null, 2));
