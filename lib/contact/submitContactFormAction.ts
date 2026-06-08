"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { sendResendEmail } from "@/lib/email/sendResendEmail";
import {
  CONTACT_INBOX_EMAIL,
  CONTACT_RATE_LIMIT_PER_HOUR,
  contactTopicLabel,
} from "./contactFormConstants";
import { buildContactEmailBodies, buildContactEmailSubject } from "./buildContactEmailBody";
import { validateContactFormInput } from "./validateContactFormInput";

export type SubmitContactFormResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

async function countRecentSubmissionsForEmail(email: string): Promise<number | null> {
  try {
    const supabase = createServiceRoleClient();
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from("contact_submissions")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", since);
    if (error) {
      console.error("[submitContactFormAction] rate limit check failed", error.message);
      return null;
    }
    return count ?? 0;
  } catch (e) {
    console.error("[submitContactFormAction] rate limit check error", e);
    return null;
  }
}

async function insertContactSubmission(args: {
  name: string;
  email: string;
  topic: string;
  message: string;
  role: string | null;
  poolContext: string | null;
  sourcePage: string;
  userId: string | null;
}): Promise<string | null> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("contact_submissions")
      .insert({
        name: args.name,
        email: args.email,
        topic: args.topic,
        message: args.message,
        role: args.role,
        pool_context: args.poolContext,
        source_page: args.sourcePage,
        user_id: args.userId,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[submitContactFormAction] insert failed", error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (e) {
    console.error("[submitContactFormAction] insert error", e);
    return null;
  }
}

/**
 * Public contact form — honeypot, optional DB persistence, Resend to CONTACT_INBOX_EMAIL.
 */
export async function submitContactFormAction(input: {
  name: string;
  email: string;
  topic: string;
  message: string;
  role: string;
  poolContext: string;
  sourcePage: string;
  /** Honeypot — leave empty. Bots that fill this get a silent success. */
  company: string;
}): Promise<SubmitContactFormResult> {
  const validated = validateContactFormInput(input);
  if (!validated.ok) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: validated.fieldErrors };
  }

  const { data } = validated;

  if (data.company.length > 0) {
    return { ok: true };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  const recentCount = await countRecentSubmissionsForEmail(data.email);
  if (
    recentCount !== null &&
    recentCount >= CONTACT_RATE_LIMIT_PER_HOUR
  ) {
    return {
      ok: false,
      error:
        "You have sent several messages recently. Please wait a while before trying again.",
    };
  }

  const submissionId = await insertContactSubmission({
    name: data.name,
    email: data.email,
    topic: data.topic,
    message: data.message,
    role: data.role,
    poolContext: data.poolContext,
    sourcePage: data.sourcePage,
    userId,
  });

  const { text, html } = buildContactEmailBodies({
    name: data.name,
    email: data.email,
    topic: data.topic,
    message: data.message,
    role: data.role,
    poolContext: data.poolContext,
    sourcePage: data.sourcePage,
    userId,
    submissionId,
  });

  const subject = buildContactEmailSubject(data.topic);
  const sendResult = await sendResendEmail({
    to: CONTACT_INBOX_EMAIL,
    subject,
    text,
    html,
  });

  if (!sendResult.ok) {
    if (sendResult.skipped) {
      console.error(
        "[submitContactFormAction] email not configured; submission saved:",
        submissionId ?? "(db save also failed)",
        contactTopicLabel(data.topic),
        data.email,
      );
      return {
        ok: false,
        error:
          "We could not send your message right now because email is not configured on this server. Please try again later or email us directly.",
      };
    }
    console.error("[submitContactFormAction] send failed", sendResult.error);
    return {
      ok: false,
      error:
        "We could not send your message. Please try again in a few minutes.",
    };
  }

  return { ok: true };
}
