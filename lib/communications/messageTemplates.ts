import { ASHBRACKET_SCHEDULE_TIMEZONE } from "../datetime/scheduleDisplay";
import { textToHtmlParagraphs } from "../email/sendResendEmail";

function normalizeOptionalSiteBase(siteUrl: string | undefined): string | undefined {
  const t = siteUrl?.trim();
  return t ? t.replace(/\/$/, "") : undefined;
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

/** First word of display name for {{firstName}}. */
export function firstNameFromDisplay(displayName: string): string {
  const t = displayName.trim();
  if (!t) return "there";
  return t.split(/\s+/)[0] ?? t;
}

export type EmailPlaceholderVars = {
  firstName: string;
  displayName: string;
  poolName: string;
  deadline: string;
  signInUrl: string;
};

export function buildEmailPlaceholderVars(input: {
  displayName: string;
  poolName: string;
  lockAtIso: string | null;
  siteUrl?: string;
}): EmailPlaceholderVars {
  const base = normalizeOptionalSiteBase(input.siteUrl);
  return {
    firstName: firstNameFromDisplay(input.displayName),
    displayName: input.displayName.trim() || "Participant",
    poolName: input.poolName.trim() || "Your pool",
    deadline: formatPoolLockSummary(input.lockAtIso),
    signInUrl: base ? `${base}/login` : "",
  };
}

/**
 * Replaces {{firstName}}, {{displayName}}, {{poolName}}, {{deadline}}, {{signInUrl}},
 * and legacy {{name}}, {{pool}}, {{deadline}} (same deadline key).
 */
export function applyEmailPlaceholders(template: string, vars: EmailPlaceholderVars): string {
  return template
    .replace(/\{\{\s*firstName\s*\}\}/gi, vars.firstName)
    .replace(/\{\{\s*displayName\s*\}\}/gi, vars.displayName)
    .replace(/\{\{\s*poolName\s*\}\}/gi, vars.poolName)
    .replace(/\{\{\s*deadline\s*\}\}/gi, vars.deadline)
    .replace(/\{\{\s*signInUrl\s*\}\}/gi, vars.signInUrl)
    .replace(/\{\{\s*name\s*\}\}/gi, vars.displayName)
    .replace(/\{\{\s*pool\s*\}\}/gi, vars.poolName);
}

function stripEmptySignInLine(text: string): string {
  return text
    .replace(/\n*Sign in:\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export type PoolEmailTemplateKind = "payment_reminder" | "deadline_reminder" | "custom";

/**
 * Default subject/body for template kinds (placeholders). Custom starts empty on the client.
 */
export function getEmailTemplateDefaults(
  kind: PoolEmailTemplateKind,
): { subject: string; body: string } {
  if (kind === "payment_reminder") {
    return {
      subject: "Payment reminder — {{poolName}}",
      body: [
        "Hi {{displayName}},",
        "",
        'This is a friendly reminder about payment for the pool "{{poolName}}".',
        "",
        "If you have already paid, you can ignore this message.",
        "",
        "— Your pool organizer (via AshBracket)",
        "",
        "Sign in: {{signInUrl}}",
      ].join("\n"),
    };
  }
  if (kind === "deadline_reminder") {
    return {
      subject: "Bracket picks deadline — {{poolName}}",
      body: [
        "Hi {{displayName}},",
        "",
        'Picks for "{{poolName}}" lock after {{deadline}} (Alberta time) unless your organizer changes the schedule.',
        "",
        "Please sign in and finish your bracket before then.",
        "",
        "— Your pool organizer (via AshBracket)",
        "",
        "Sign in: {{signInUrl}}",
      ].join("\n"),
    };
  }
  return { subject: "", body: "" };
}

export function renderTemplatedPoolEmail(input: {
  subjectTemplate: string;
  bodyTemplate: string;
  displayName: string;
  poolName: string;
  lockAtIso: string | null;
  siteUrl?: string;
}): { subject: string; text: string; html: string } {
  const vars = buildEmailPlaceholderVars({
    displayName: input.displayName,
    poolName: input.poolName,
    lockAtIso: input.lockAtIso,
    siteUrl: input.siteUrl,
  });
  let subject = applyEmailPlaceholders(input.subjectTemplate.trim(), vars);
  let text = applyEmailPlaceholders(input.bodyTemplate, vars);
  if (!vars.signInUrl) {
    text = stripEmptySignInLine(text);
  }
  const html = textToHtmlParagraphs(text);
  return { subject, text, html };
}

/** @deprecated Use renderTemplatedPoolEmail with getEmailTemplateDefaults + placeholders */
export function buildPaymentReminderEmail(input: {
  displayName: string;
  poolName: string;
  siteUrl?: string;
}): { subject: string; text: string; html: string } {
  const d = getEmailTemplateDefaults("payment_reminder");
  return renderTemplatedPoolEmail({
    subjectTemplate: d.subject,
    bodyTemplate: d.body,
    displayName: input.displayName,
    poolName: input.poolName,
    lockAtIso: null,
    siteUrl: input.siteUrl,
  });
}

/** @deprecated Use renderTemplatedPoolEmail with getEmailTemplateDefaults + placeholders */
export function buildDeadlineReminderEmail(input: {
  displayName: string;
  poolName: string;
  lockAtIso: string | null;
  siteUrl?: string;
}): { subject: string; text: string; html: string } {
  const d = getEmailTemplateDefaults("deadline_reminder");
  return renderTemplatedPoolEmail({
    subjectTemplate: d.subject,
    bodyTemplate: d.body,
    displayName: input.displayName,
    poolName: input.poolName,
    lockAtIso: input.lockAtIso,
    siteUrl: input.siteUrl,
  });
}

export function buildCustomPoolEmail(input: {
  displayName: string;
  poolName: string;
  lockAtIso: string | null;
  subjectTemplate: string;
  bodyTemplate: string;
  siteUrl?: string;
}): { subject: string; text: string; html: string } {
  return renderTemplatedPoolEmail({
    subjectTemplate: input.subjectTemplate,
    bodyTemplate: input.bodyTemplate,
    displayName: input.displayName,
    poolName: input.poolName,
    lockAtIso: input.lockAtIso,
    siteUrl: input.siteUrl,
  });
}

/** @deprecated Use applyEmailPlaceholders */
export function applyPlaceholders(
  template: string,
  vars: { name: string; pool: string; deadline: string },
): string {
  return applyEmailPlaceholders(template, {
    firstName: firstNameFromDisplay(vars.name),
    displayName: vars.name,
    poolName: vars.pool,
    deadline: vars.deadline,
    signInUrl: "",
  });
}
