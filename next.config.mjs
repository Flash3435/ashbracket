import nextEnv from "@next/env";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { loadEnvConfig } = nextEnv;

function parseDotEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split("\n")) {
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

function pick(dotLocal, key) {
  const v = process.env[key] ?? dotLocal[key] ?? "";
  return typeof v === "string" ? v.trim() : "";
}

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
loadEnvConfig(packageRoot);
loadEnvConfig(process.cwd());

const dotLocal = parseDotEnvFile(path.join(packageRoot, ".env.local"));

const supabaseUrl = pick(dotLocal, "NEXT_PUBLIC_SUPABASE_URL");
const publishable = pick(dotLocal, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const anonJwt = pick(dotLocal, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
const supabasePublicKey = anonJwt || publishable;

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: packageRoot,
  },
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon.png" }];
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabasePublicKey,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable || anonJwt,
  },
};

if (
  process.env.NODE_ENV === "development" &&
  (!supabaseUrl || !supabasePublicKey)
) {
  console.warn(
    "[ashbracket] Missing Supabase URL or anon/publishable key. Expected ashbracket/.env.local with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  );
}

export default nextConfig;
