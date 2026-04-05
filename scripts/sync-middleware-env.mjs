#!/usr/bin/env node
/**
 * Writes lib/supabase/middleware-keys.json from .env.local and/or process.env.
 * Edge middleware + Turbopack often do not receive process.env in dev; importing
 * this JSON bundles real values into the middleware chunk.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ashRoot = path.resolve(__dirname, "..");

function parseDotEnvFile(filePath) {
  /** @type {Record<string, string>} */
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

const envLocalPaths = [
  path.join(ashRoot, ".env.local"),
  path.join(process.cwd(), ".env.local"),
  path.join(process.cwd(), "ashbracket", ".env.local"),
];

/** @type {Record<string, string>} */
let merged = {};
for (const p of envLocalPaths) {
  merged = { ...merged, ...parseDotEnvFile(p) };
}

const supabaseUrl = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  merged.NEXT_PUBLIC_SUPABASE_URL ||
  ""
).trim();
const anonJwt = (
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  merged.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ""
).trim();
const publishable = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  merged.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  ""
).trim();
const supabaseAnonKey = anonJwt || publishable;

const out = {
  supabaseUrl,
  supabaseAnonKey,
};

const outPath = path.join(ashRoot, "lib", "supabase", "middleware-keys.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[sync-middleware-env] Still missing URL or key. Checked .env.local at:",
    envLocalPaths.filter((p) => fs.existsSync(p)),
  );
} else {
  console.log("[sync-middleware-env] Wrote", outPath);
}
