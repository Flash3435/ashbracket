#!/usr/bin/env tsx
/**
 * Send a password recovery email with redirect_to=/reset-password.
 * Do not use Supabase Dashboard recovery — it may land users on the homepage.
 *
 * Dry-run (default):
 *   npm run send-password-reset -- user@example.com
 *
 * Send:
 *   npm run send-password-reset -- --send user@example.com
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the
 * environment or `.env.local` (anon key only — no service role).
 */

import { createClient } from "@supabase/supabase-js";
import { sendPasswordResetEmail } from "../lib/auth/sendPasswordResetEmail";
import { loadEnvLocal } from "./loadEnvLocal";

function usage(): never {
  console.error(`Usage:
  npm run send-password-reset -- [--send] <email>

  --send    Actually send the email (default is dry-run)
`);
  process.exit(1);
}

function parseArgs(): { email: string; send: boolean } {
  const args = process.argv.slice(2);
  let send = false;
  const positional: string[] = [];

  for (const arg of args) {
    if (arg === "--send") {
      send = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      usage();
    }
    positional.push(arg);
  }

  const email = positional[0]?.trim() ?? "";
  if (!email || positional.length > 1) {
    usage();
  }

  return { email, send };
}

function requireAnonEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
    process.exit(1);
  }
  return { url, anonKey };
}

async function main(): Promise<void> {
  loadEnvLocal();
  const { email, send } = parseArgs();
  const { url, anonKey } = requireAnonEnv();

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!send) {
    const { buildPasswordResetRedirectUrl } = await import(
      "../lib/auth/passwordResetRedirect"
    );
    const redirectTo = buildPasswordResetRedirectUrl();
    console.log("Dry-run — no email sent.");
    console.log(`  email: ${email}`);
    console.log(`  redirect_to: ${redirectTo}`);
    console.log("\nRe-run with --send to deliver the recovery email.");
    return;
  }

  const result = await sendPasswordResetEmail(supabase, email);
  if (!result.ok) {
    console.error(`Failed: ${result.error}`);
    process.exit(1);
  }

  console.log("Recovery email requested.");
  console.log(`  email: ${email}`);
  console.log(`  redirect_to: ${result.redirectTo}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
