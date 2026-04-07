/**
 * Regenerates app/icon.png, app/apple-icon.png, and app/favicon.ico
 * from public/brand/ashbracket-logo-source.png (contain-fit → square, transparent pad).
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const source = join(root, "public/brand/ashbracket-logo-source.png");

function toSquarePng(size) {
  return sharp(source)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png();
}

async function main() {
  await toSquarePng(512).toFile(join(root, "app/icon.png"));
  await toSquarePng(180).toFile(join(root, "app/apple-icon.png"));

  const buf16 = await toSquarePng(16).toBuffer();
  const buf32 = await toSquarePng(32).toBuffer();
  const buf48 = await toSquarePng(48).toBuffer();
  const ico = await pngToIco([buf16, buf32, buf48]);
  writeFileSync(join(root, "app/favicon.ico"), ico);

  console.log("Wrote app/icon.png, app/apple-icon.png, app/favicon.ico");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
