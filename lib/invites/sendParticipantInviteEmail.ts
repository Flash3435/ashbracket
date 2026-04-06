/**
 * Optional Resend integration. If RESEND_API_KEY is unset, returns skipped so
 * the UI can show a copyable link instead.
 *
 * Env: RESEND_API_KEY, INVITE_FROM_EMAIL (e.g. "AshBracket <onboarding@yourdomain.com>").
 */

import { escapeHtml } from "../email/escapeHtml";
import { sendResendEmail } from "../email/sendResendEmail";

export type SendInviteEmailResult =
  | { ok: true }
  | { ok: false; error: string; skipped?: boolean };

export async function sendParticipantInviteEmail(args: {
  to: string;
  poolName: string;
  displayName: string;
  inviteUrl: string;
}): Promise<SendInviteEmailResult> {
  const subject = `You're invited to ${args.poolName}`;
  const text = [
    `Hi ${args.displayName},`,
    "",
    `You've been invited to join the pool "${args.poolName}" on AshBracket.`,
    "Open the link below, sign in with this same email address, and you'll be connected to your bracket automatically.",
    "",
    args.inviteUrl,
    "",
    "If you did not expect this message, you can ignore it.",
  ].join("\n");

  const html = `
    <p>Hi ${escapeHtml(args.displayName)},</p>
    <p>You've been invited to join the pool <strong>${escapeHtml(args.poolName)}</strong> on AshBracket.</p>
    <p>Open the link below, sign in with <strong>this same email address</strong>, and you'll be connected to your bracket automatically.</p>
    <p><a href="${escapeHtml(args.inviteUrl)}">Join your pool</a></p>
    <p style="color:#666;font-size:12px;">If you did not expect this message, you can ignore it.</p>
  `.trim();

  return sendResendEmail({
    to: args.to,
    subject,
    text,
    html,
  });
}
