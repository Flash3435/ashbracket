import fs from "node:fs";
import path from "node:path";

/**
 * Loads `ashbracket/.env.local` into `process.env` for CLI scripts.
 * Does not override variables already set in the environment.
 */
export function loadEnvLocal(cwd = process.cwd()): void {
  const file = path.join(cwd, ".env.local");
  if (!fs.existsSync(file)) return;

  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    let keyPart = trimmed;
    if (trimmed.startsWith("export ")) {
      keyPart = trimmed.slice(7).trim();
    }

    const eq = keyPart.indexOf("=");
    if (eq < 1) continue;

    const key = keyPart.slice(0, eq).trim();
    let val = keyPart.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}
