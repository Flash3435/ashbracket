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
  inviterLabel: string;
}): Promise<SendInviteEmailResult> {
  const pool = args.poolName.trim() || "a pool";
  const inviter = args.inviterLabel.trim() || "Your pool organizer";
  const invitee = args.displayName.trim() || "there";
  const emailForAccount = args.to.trim();

  const subject = `You're invited to join ${pool} on AshBracket`;
  const text = [
    `Hi ${invitee},`,
    "",
    `${inviter} invited you to join the pool "${pool}" on AshBracket.`,
    "",
    "This is a World Cup bracket pool where you can make your picks and follow the standings.",
    "",
    `Open the link below, then sign in or create an account using this same email address (${emailForAccount}). You'll be connected to the pool automatically.`,
    "",
    args.inviteUrl,
    "",
    "If you did not expect this message, you can ignore it.",
  ].join("\n");

  const html = `
    <p>Hi ${escapeHtml(invitee)},</p>
    <p>${escapeHtml(inviter)} invited you to join the pool <strong>${escapeHtml(pool)}</strong> on AshBracket.</p>
    <p>This is a World Cup bracket pool where you can make your picks and follow the standings.</p>
    <p>Open the link below, then sign in or create an account using <strong>${escapeHtml(emailForAccount)}</strong>. You'll be connected to the pool automatically.</p>
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
