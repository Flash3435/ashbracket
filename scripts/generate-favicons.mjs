/**
 * Regenerates app/icon.png and app/apple-icon.png from
 * public/brand/ashbracket-logo-source.png.
 *
 * - Trims transparent margins so wide art stays readable at 16×16.
 * - Outputs PNG only (alpha preserved). We do not emit favicon.ico: ICO encoders
 *   often mishandle transparency (opaque black tile in tabs). next.config.ts
 *   rewrites /favicon.ico → /icon.png so legacy clients still get the PNG.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const source = join(root, "public/brand/ashbracket-logo-source.png");

async function trimmedPngBuffer() {
  return sharp(source)
    .ensureAlpha()
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

  console.log("Wrote app/icon.png, app/apple-icon.png (transparent PNG; /favicon.ico → /icon.png via rewrite)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
