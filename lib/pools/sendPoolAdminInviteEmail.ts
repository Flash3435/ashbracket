import { escapeHtml } from "@/lib/email/escapeHtml";
import { sendResendEmail, type ResendSendResult } from "@/lib/email/sendResendEmail";
import { getSiteUrl } from "@/lib/site-url";

/**
 * Pool-scoped invite notice: sign in with this email to receive access (no magic grant link).
 */
export async function sendPoolAdminInviteEmail(input: {
  toEmail: string;
  poolName: string;
  role: "owner" | "admin";
}): Promise<ResendSendResult> {
  const site = getSiteUrl();
  const loginUrl = `${site}/login`;
  const signupUrl = `${site}/signup`;
  const roleLabel = input.role === "owner" ? "owner" : "administrator";
  const pool = escapeHtml(input.poolName.trim() || "a pool");
  const subj = `You’re invited as ${roleLabel} — ${input.poolName.trim() || "AshBracket pool"}`;
  const text = [
    `You’ve been invited to help run "${input.poolName.trim() || "a pool"}" on AshBracket as a pool ${roleLabel}.`,
    "",
    `Create an account or sign in using this exact email address (${input.toEmail.trim()}). After you authenticate, your access will activate automatically.`,
    "",
    `Sign in: ${loginUrl}`,
    `Sign up: ${signupUrl}`,
  ].join("\n");

  const html = `
<p>You’ve been invited to help run <strong>${pool}</strong> on AshBracket as a pool ${escapeHtml(roleLabel)}.</p>
<p>Create an account or sign in using <strong>${escapeHtml(input.toEmail.trim())}</strong>. After you authenticate, your access will activate automatically.</p>
<p><a href="${escapeHtml(loginUrl)}">Sign in</a> · <a href="${escapeHtml(signupUrl)}">Sign up</a></p>
`.trim();

  return sendResendEmail({
    to: input.toEmail,
    subject: subj,
    text,
    html,
  });
}
