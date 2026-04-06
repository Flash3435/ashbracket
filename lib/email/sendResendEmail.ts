import { escapeHtml } from "./escapeHtml";

export type ResendSendResult =
  | { ok: true }
  | { ok: false; error: string; skipped?: boolean };

export function getResendMailerConfig(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.INVITE_FROM_EMAIL?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

/**
 * Single outbound message via Resend. Same env as pool invites:
 * RESEND_API_KEY, INVITE_FROM_EMAIL (verified sender).
 */
export async function sendResendEmail(args: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<ResendSendResult> {
  const cfg = getResendMailerConfig();
  if (!cfg) {
    return {
      ok: false,
      skipped: true,
      error:
        "Email is not configured (set RESEND_API_KEY and INVITE_FROM_EMAIL).",
    };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: cfg.from,
        to: [args.to.trim()],
        subject: args.subject,
        text: args.text,
        html: args.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        error: body || `Resend returned ${res.status}`,
      };
    }

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to send email.",
    };
  }
}

/** Plain text with newlines → simple HTML (content already escaped per line). */
export function textToHtmlParagraphs(text: string): string {
  const blocks = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (blocks.length === 0) return `<p>${escapeHtml(text)}</p>`;
  return blocks
    .map((block) => {
      const lines = block.split("\n").map((line) => escapeHtml(line));
      return `<p>${lines.join("<br/>")}</p>`;
    })
    .join("\n");
}
