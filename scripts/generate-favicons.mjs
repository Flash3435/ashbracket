/**
 * Regenerates app/icon.png, app/apple-icon.png, and app/favicon.ico
 * from public/brand/ashbracket-logo-source.png.
 *
 * Wide banner sources are trimmed (alpha) before square resize so the mark
 * stays readable at 16×16 tab sizes instead of shrinking to a hairline.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const source = join(root, "public/brand/ashbracket-logo-source.png");

/** Collapse excess transparent margins (e.g. wide canvases) before squaring. */
async function trimmedPngBuffer() {
  return sharp(source)
    .trim({ threshold: 12 })
    .png()
    .toBuffer();
}

function toSquarePng(trimmedBuffer, size) {
  return sharp(trimmedBuffer)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png();
}

async function main() {
  const trimmed = await trimmedPngBuffer();

  await toSquarePng(trimmed, 512).toFile(join(root, "app/icon.png"));
  await toSquarePng(trimmed, 180).toFile(join(root, "app/apple-icon.png"));

  const buf16 = await toSquarePng(trimmed, 16).toBuffer();
  const buf32 = await toSquarePng(trimmed, 32).toBuffer();
  const buf48 = await toSquarePng(trimmed, 48).toBuffer();
  const ico = await pngToIco([buf16, buf32, buf48]);
  writeFileSync(join(root, "app/favicon.ico"), ico);

  console.log("Wrote app/icon.png, app/apple-icon.png, app/favicon.ico (trim → square)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
