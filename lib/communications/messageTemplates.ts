import { ASHBRACKET_SCHEDULE_TIMEZONE } from "../datetime/scheduleDisplay";
import { escapeHtml } from "../email/escapeHtml";
import { textToHtmlParagraphs } from "../email/sendResendEmail";

function normalizeOptionalSiteBase(siteUrl: string | undefined): string | undefined {
  const t = siteUrl?.trim();
  return t ? t.replace(/\/$/, "") : undefined;
}

/** Appends a sign-in link when `siteUrl` is set (server sends canonical domain; client preview may omit). */
function withOptionalSignInFooter(
  bodyText: string,
  siteUrl: string | undefined,
): { text: string; html: string } {
  const base = normalizeOptionalSiteBase(siteUrl);
  if (!base) {
    return { text: bodyText, html: textToHtmlParagraphs(bodyText) };
  }
  const loginUrl = `${base}/login`;
  const text = `${bodyText}\n\nSign in: ${loginUrl}`;
  const baseHtml = textToHtmlParagraphs(bodyText);
  const html = `${baseHtml}\n<p><a href="${escapeHtml(loginUrl)}">Sign in to AshBracket</a></p>`;
  return { text, html };
}

export function formatPoolLockSummary(lockAtIso: string | null): string {
  if (!lockAtIso || !lockAtIso.trim()) {
    return "the deadline your organizer set for this pool";
  }
  const t = new Date(lockAtIso).getTime();
  if (Number.isNaN(t)) {
    return "the deadline your organizer set for this pool";
  }
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: ASHBRACKET_SCHEDULE_TIMEZONE,
  }).format(new Date(lockAtIso));
}

export function applyPlaceholders(
  template: string,
  vars: { name: string; pool: string; deadline: string },
): string {
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, vars.name)
    .replace(/\{\{\s*pool\s*\}\}/gi, vars.pool)
    .replace(/\{\{\s*deadline\s*\}\}/gi, vars.deadline);
}

export function buildPaymentReminderEmail(input: {
  displayName: string;
  poolName: string;
  /** Canonical site base for outbound links (e.g. `getSiteUrl()` on the server). */
  siteUrl?: string;
}): { subject: string; text: string; html: string } {
  const subject = `Payment reminder — ${input.poolName}`;
  const body = [
    `Hi ${input.displayName},`,
    "",
    `This is a friendly reminder about payment for the pool "${input.poolName}".`,
    "",
    "If you have already paid, you can ignore this message.",
    "",
    "— Your pool organizer (via AshBracket)",
  ].join("\n");
  const { text, html } = withOptionalSignInFooter(body, input.siteUrl);
  return { subject, text, html };
}

export function buildDeadlineReminderEmail(input: {
  displayName: string;
  poolName: string;
  lockAtIso: string | null;
  siteUrl?: string;
}): { subject: string; text: string; html: string } {
  const deadline = formatPoolLockSummary(input.lockAtIso);
  const subject = `Bracket picks deadline — ${input.poolName}`;
  const body = [
    `Hi ${input.displayName},`,
    "",
    `Picks for "${input.poolName}" lock after ${deadline} (Alberta time) unless your organizer changes the schedule.`,
    "",
    "Please sign in and finish your bracket before then.",
    "",
    "— Your pool organizer (via AshBracket)",
  ].join("\n");
  const { text, html } = withOptionalSignInFooter(body, input.siteUrl);
  return { subject, text, html };
}

export function buildCustomPoolEmail(input: {
  displayName: string;
  poolName: string;
  lockAtIso: string | null;
  subjectTemplate: string;
  bodyTemplate: string;
}): { subject: string; text: string; html: string } {
  const deadline = formatPoolLockSummary(input.lockAtIso);
  const vars = {
    name: input.displayName,
    pool: input.poolName,
    deadline,
  };
  const subject = applyPlaceholders(input.subjectTemplate.trim(), vars);
  const text = applyPlaceholders(input.bodyTemplate, vars);
  const html = textToHtmlParagraphs(text);
  return { subject, text, html };
}
