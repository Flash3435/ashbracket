#!/usr/bin/env node
/**
 * Lightweight smoke check against a deployed AshBracket URL.
 * Usage: ASHBRACKET_URL=https://your-app.vercel.app npm run verify:prod
 *
 * Expects HTTP 200 (or 3xx that ends OK). Fails on 4xx/5xx.
 */

const baseRaw =
  process.env.ASHBRACKET_URL?.replace(/\/$/, "") ||
  process.env.VERCEL_PRODUCTION_URL?.replace(/\/$/, "");

if (!baseRaw) {
  console.error(
    "Set ASHBRACKET_URL to your production origin (e.g. https://ashbracket.vercel.app).\n" +
      "Example: ASHBRACKET_URL=https://… npm run verify:prod",
  );
  process.exit(1);
}

const paths = [
  { path: "/", note: "Homepage / standings" },
  { path: "/rules", note: "Pool rules" },
  { path: "/tournament", note: "Tournament" },
  { path: "/account/picks", note: "Picks (may redirect when logged out)" },
];

async function checkOne(rel) {
  const url = `${baseRaw}${rel}`;
  const res = await fetch(url, {
    redirect: "manual",
    headers: { "user-agent": "ashbracket-verify-prod/1" },
  });
  // 200 = page; 301–308 = redirect (e.g. login) — both mean the route is wired.
  const ok =
    res.status === 200 ||
    (res.status >= 301 && res.status <= 308);
  return { url, status: res.status, ok };
}

async function main() {
  console.log(`Checking ${baseRaw} …\n`);
  let failed = false;
  for (const { path, note } of paths) {
    try {
      const { status, ok } = await checkOne(path);
      const mark = ok ? "✓" : "✗";
      console.log(`${mark} ${path} (${note}) — HTTP ${status}`);
      if (!ok) failed = true;
    } catch (e) {
      console.log(`✗ ${path} (${note}) — ${e instanceof Error ? e.message : e}`);
      failed = true;
    }
  }
  console.log("");
  if (failed) {
    console.error("One or more checks failed.");
    process.exit(1);
  }
  console.log("All checks passed.");
}

main();
