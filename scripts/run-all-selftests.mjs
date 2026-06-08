#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const tsxBin = join(root, "node_modules", ".bin", "tsx");

function collectSelftests(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      collectSelftests(path, out);
    } else if (name.endsWith(".selftest.ts")) {
      out.push(path);
    }
  }
  return out;
}

const files = collectSelftests(root).sort();

if (files.length === 0) {
  console.error("No *.selftest.ts files found.");
  process.exit(1);
}

for (const file of files) {
  const rel = file.startsWith(root) ? file.slice(root.length + 1) : file;
  process.stdout.write(`\n▶ ${rel}\n`);
  execSync(`${JSON.stringify(tsxBin)} ${JSON.stringify(file)}`, {
    stdio: "inherit",
    cwd: root,
  });
}

console.log(`\nAll ${files.length} selftests passed.`);
