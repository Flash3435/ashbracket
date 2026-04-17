#!/usr/bin/env node
/**
 * Regenerates `lib/bracket/wc2026ThirdPlaceCombinations.ts` from Wikipedia’s
 * `Template:2026 FIFA World Cup third-place_table` wikitext.
 *
 * Usage (from `ashbracket/`):
 *   node scripts/build-wc2026-third-combinations.mjs
 *
 * Requires network on first run to download the template.
 */
import fs from "fs";
import https from "https";

const OUT = new URL("../lib/bracket/wc2026ThirdPlaceCombinations.ts", import.meta.url);
const RAW =
  process.argv[2] ||
  new URL("./_wc2026_third_raw.wiki", import.meta.url).pathname;

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(d));
      })
      .on("error", reject);
  });
}

async function main() {
  let raw;
  if (fs.existsSync(RAW)) {
    raw = fs.readFileSync(RAW, "utf8");
  } else {
    const url =
      "https://en.wikipedia.org/wiki/Template:2026_FIFA_World_Cup_third-place_table?action=raw";
    raw = await download(url);
    fs.mkdirSync(new URL("./", import.meta.url).pathname, { recursive: true });
    fs.writeFileSync(RAW, raw, "utf8");
  }

  const chunks = raw.split(/\n\|-\n/g);
  const rows = [];
  const GROUP_ORDER = "ABCDEFGHIJKL".split("");
  for (const ch of chunks) {
    const m = ch.match(/! scope="row" \| (\d+)/);
    if (!m) continue;
    const lines = ch.split("\n").filter((l) => l.startsWith("|") && !l.includes('scope="row"'));
    const cellLines = lines.filter((l) => !l.includes("rowspan"));
    const adv = new Set();
    const lineFor12 = cellLines[0] || "";
    const p12 = lineFor12.split("||").map((s) => s.replace(/^\|/, "").trim());
    for (const p of p12) {
      const bold = p.match(/^'''([A-L])'''$/);
      if (bold) adv.add(bold[1]);
    }
    const advancing = GROUP_ORDER.filter((g) => adv.has(g));
    const thirdOrder = [];
    for (const line of cellLines) {
      const pp = line.split("||").map((s) => s.replace(/^\|/, "").trim());
      for (const p of pp) {
        const t = p.match(/^3([A-L])$/);
        if (t) thirdOrder.push(t[1]);
      }
    }
    if (advancing.length !== 8 || thirdOrder.length !== 8) {
      throw new Error(`Bad row near combination ${m[1]}`);
    }
    const key = [...advancing].sort().join("");
    rows.push({ key, thirdOrder });
  }
  rows.sort((a, b) => a.key.localeCompare(b.key));

  const lines = [];
  lines.push("/**");
  lines.push(" * FIFA 2026 World Cup Annex C combination rows (495 total), parsed from");
  lines.push(" * Wikipedia template `Template:2026 FIFA World Cup third-place table`.");
  lines.push(" * Each row: sorted key of the eight advancing third-place groups →");
  lines.push(" * which third-place group is routed to each winner slot (order A,B,D,E,G,I,K,L).");
  lines.push(" * Regenerate: `node scripts/build-wc2026-third-combinations.mjs`");
  lines.push(" */");
  lines.push("");
  lines.push("export const WC2026_THIRD_COMBO_KEYS: readonly string[] = [");
  for (const r of rows) lines.push(`  "${r.key}",`);
  lines.push("];");
  lines.push("");
  lines.push("export const WC2026_THIRD_COMBO_PLACEMENTS: readonly (readonly string[])[] = [");
  for (const r of rows) {
    lines.push(`  ["${r.thirdOrder.join('","')}"],`);
  }
  lines.push("];");
  lines.push("");
  lines.push("export function wc2026ThirdComboPlacementByKey(key: string): readonly string[] | null {");
  lines.push('  const k = key.toUpperCase().split("").filter(Boolean).sort().join("");');
  lines.push("  const idx = (WC2026_THIRD_COMBO_KEYS as readonly string[]).indexOf(k);");
  lines.push("  if (idx < 0) return null;");
  lines.push("  return WC2026_THIRD_COMBO_PLACEMENTS[idx] ?? null;");
  lines.push("}");
  lines.push("");

  fs.writeFileSync(OUT, lines.join("\n"), "utf8");
  console.log("wrote", rows.length, "rows ->", OUT.pathname);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
