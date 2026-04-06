"use server";

import { createClient } from "@/lib/supabase/server";
import { isAppAdmin } from "../../../lib/auth/isAppAdmin";
import { SAMPLE_POOL_ID } from "../../../lib/config/sample-pool";
import {
  buildCustomPoolEmail,
  buildDeadlineReminderEmail,
  buildPaymentReminderEmail,
} from "../../../lib/communications/messageTemplates";
import { loadParticipantIdsWithIncompletePicks } from "../../../lib/communications/picksCompleteness";
import {
  type PoolCommunicationParticipant,
  type RecipientPreset,
  resolvePoolEmailTargets,
} from "../../../lib/communications/recipientResolve";
import {
  getResendMailerConfig,
  sendResendEmail,
} from "../../../lib/email/sendResendEmail";

export type MessageKind =
  | "payment_reminder"
  | "deadline_reminder"
  | "custom";

export type SendPoolCommunicationsResult =
  | {
      ok: true;
      /** Resend + from-address env is present. */
      deliveryConfigured: boolean;
      recipientCount: number;
      /** Successfully handed to Resend (0 if not configured or no recipients). */
      emailsAccepted: number;
      failures: { email: string; error: string }[];
    }
  | { ok: false; error: string };

function messageForRecipient(
  kind: MessageKind,
  displayName: string,
  poolName: string,
  lockAt: string | null,
  customSubject: string,
  customBody: string,
): { subject: string; text: string; html: string } {
  if (kind === "payment_reminder") {
    return buildPaymentReminderEmail({ displayName, poolName });
  }
  if (kind === "deadline_reminder") {
    return buildDeadlineReminderEmail({
      displayName,
      poolName,
      lockAtIso: lockAt,
    });
  }
  return buildCustomPoolEmail({
    displayName,
    poolName,
    lockAtIso: lockAt,
    subjectTemplate: customSubject,
    bodyTemplate: customBody,
  });
}

async function loadPoolMeta(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ name: string; lockAt: string | null }> {
  const { data } = await supabase
    .from("pools")
    .select("name, lock_at")
    .eq("id", SAMPLE_POOL_ID)
    .maybeSingle();
  return {
    name: (data?.name as string | undefined)?.trim() || "Your pool",
    lockAt: (data?.lock_at as string | null) ?? null,
  };
}

async function loadCommunicationParticipants(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<PoolCommunicationParticipant[]> {
  const { data, error } = await supabase
    .from("participants")
    .select("id, display_name, email, is_paid")
    .eq("pool_id", SAMPLE_POOL_ID)
    .order("display_name", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as {
    id: string;
    display_name: string;
    email: string | null;
    is_paid: boolean;
  }[];

  const ids = rows.map((r) => r.id);
  const incomplete = await loadParticipantIdsWithIncompletePicks(
    supabase,
    SAMPLE_POOL_ID,
    ids,
  );

  return rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    email: r.email ?? "",
    isPaid: r.is_paid,
    picksComplete: !incomplete.has(r.id),
  }));
}

export async function sendPoolCommunicationsAction(input: {
  preset: RecipientPreset;
  selectedParticipantIds: string[];
  messageKind: MessageKind;
  customSubject?: string;
  customBody?: string;
}): Promise<SendPoolCommunicationsResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "You must be signed in." };
    }
    if (!(await isAppAdmin(supabase, user.id))) {
      return { ok: false, error: "Not allowed." };
    }

    if (input.messageKind === "custom") {
      const sub = input.customSubject?.trim() ?? "";
      const body = input.customBody?.trim() ?? "";
      if (!sub) {
        return { ok: false, error: "Add a subject for your custom email." };
      }
      if (!body) {
        return { ok: false, error: "Add a message body." };
      }
    }

    if (input.preset === "selected") {
      const sel = input.selectedParticipantIds.filter((x) => x.trim());
      if (sel.length === 0) {
        return {
          ok: false,
          error: "Choose at least one person when sending to selected participants.",
        };
      }
    }

    const participants = await loadCommunicationParticipants(supabase);
    const { targets } = resolvePoolEmailTargets(
      participants,
      input.preset,
      input.selectedParticipantIds,
    );

    if (targets.length === 0) {
      return {
        ok: false,
        error:
          "No recipients match this choice. People without an email address cannot be mailed — add emails on the Participants page.",
      };
    }

    const pool = await loadPoolMeta(supabase);
    const configured = getResendMailerConfig() !== null;
    const failures: { email: string; error: string }[] = [];
    let emailsAccepted = 0;

    const customSubject = input.customSubject ?? "";
    const customBody = input.customBody ?? "";

    if (!configured) {
      return {
        ok: true,
        deliveryConfigured: false,
        recipientCount: targets.length,
        emailsAccepted: 0,
        failures: [],
      };
    }

    for (const t of targets) {
      const msg = messageForRecipient(
        input.messageKind,
        t.displayName,
        pool.name,
        pool.lockAt,
        customSubject,
        customBody,
      );
      const res = await sendResendEmail({
        to: t.email,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      });
      if (res.ok) {
        emailsAccepted += 1;
      } else {
        failures.push({
          email: t.email,
          error: res.skipped ? "Email not configured" : res.error,
        });
      }
    }

    return {
      ok: true,
      deliveryConfigured: true,
      recipientCount: targets.length,
      emailsAccepted,
      failures,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong.",
    };
  }
}
