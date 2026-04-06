import { ASHBRACKET_SCHEDULE_TIMEZONE } from "../datetime/scheduleDisplay";
import { textToHtmlParagraphs } from "../email/sendResendEmail";

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
}): { subject: string; text: string; html: string } {
  const subject = `Payment reminder — ${input.poolName}`;
  const text = [
    `Hi ${input.displayName},`,
    "",
    `This is a friendly reminder about payment for the pool "${input.poolName}".`,
    "",
    "If you have already paid, you can ignore this message.",
    "",
    "— Your pool organizer (via AshBracket)",
  ].join("\n");
  const html = textToHtmlParagraphs(text);
  return { subject, text, html };
}

export function buildDeadlineReminderEmail(input: {
  displayName: string;
  poolName: string;
  lockAtIso: string | null;
}): { subject: string; text: string; html: string } {
  const deadline = formatPoolLockSummary(input.lockAtIso);
  const subject = `Bracket picks deadline — ${input.poolName}`;
  const text = [
    `Hi ${input.displayName},`,
    "",
    `Picks for "${input.poolName}" lock after ${deadline} (Alberta time) unless your organizer changes the schedule.`,
    "",
    "Please sign in and finish your bracket before then.",
    "",
    "— Your pool organizer (via AshBracket)",
  ].join("\n");
  const html = textToHtmlParagraphs(text);
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
