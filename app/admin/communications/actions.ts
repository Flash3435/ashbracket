"use server";

import { assertCanManagePool } from "@/lib/admin/assertCanManagePool";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { renderTemplatedPoolEmail } from "../../../lib/communications/messageTemplates";
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
      deliveryConfigured: boolean;
      recipientCount: number;
      emailsAccepted: number;
      failures: { email: string; error: string }[];
    }
  | { ok: false; error: string };

async function loadPoolMeta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  poolId: string,
): Promise<{ name: string; lockAt: string | null }> {
  const { data } = await supabase
    .from("pools")
    .select("name, lock_at")
    .eq("id", poolId)
    .maybeSingle();
  return {
    name: (data?.name as string | undefined)?.trim() || "Your pool",
    lockAt: (data?.lock_at as string | null) ?? null,
  };
}

async function loadCommunicationParticipants(
  supabase: Awaited<ReturnType<typeof createClient>>,
  poolId: string,
): Promise<PoolCommunicationParticipant[]> {
  const { data, error } = await supabase
    .from("participants")
    .select("id, display_name, email, is_paid")
    .eq("pool_id", poolId)
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
    poolId,
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

function validateTemplates(subjectTemplate: string, bodyTemplate: string): string | null {
  const sub = subjectTemplate.trim();
  const body = bodyTemplate.trim();
  if (!sub) return "Add a subject.";
  if (!body) return "Add a message body.";
  return null;
}

export async function sendPoolCommunicationsAction(input: {
  poolId: string;
  preset: RecipientPreset;
  selectedParticipantIds: string[];
  subjectTemplate: string;
  bodyTemplate: string;
}): Promise<SendPoolCommunicationsResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "You must be signed in." };
    }

    const gate = await assertCanManagePool(supabase, input.poolId);
    if (!gate.ok) return { ok: false, error: gate.error };

    const poolId = input.poolId.trim();

    const err = validateTemplates(input.subjectTemplate, input.bodyTemplate);
    if (err) return { ok: false, error: err };

    if (input.preset === "selected") {
      const sel = input.selectedParticipantIds.filter((x) => x.trim());
      if (sel.length === 0) {
        return {
          ok: false,
          error:
            "Choose at least one person when sending to selected participants.",
        };
      }
    }

    const participants = await loadCommunicationParticipants(supabase, poolId);
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

    const pool = await loadPoolMeta(supabase, poolId);
    const configured = getResendMailerConfig() !== null;
    const failures: { email: string; error: string }[] = [];
    let emailsAccepted = 0;

    const siteUrl = getSiteUrl();

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
      const msg = renderTemplatedPoolEmail({
        subjectTemplate: input.subjectTemplate,
        bodyTemplate: input.bodyTemplate,
        displayName: t.displayName,
        poolName: pool.name,
        lockAtIso: pool.lockAt,
        siteUrl,
      });
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

export async function sendPoolCommunicationsTestAction(input: {
  poolId: string;
  subjectTemplate: string;
  bodyTemplate: string;
}): Promise<SendPoolCommunicationsResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "You must be signed in." };
    }

    const gate = await assertCanManagePool(supabase, input.poolId);
    if (!gate.ok) return { ok: false, error: gate.error };

    const poolId = input.poolId.trim();

    const err = validateTemplates(input.subjectTemplate, input.bodyTemplate);
    if (err) return { ok: false, error: err };

    const to = user.email?.trim();
    if (!to) {
      return {
        ok: false,
        error:
          "Your account has no email address. Add one in your profile, then try again.",
      };
    }

    const participants = await loadCommunicationParticipants(supabase, poolId);
    const pool = await loadPoolMeta(supabase, poolId);
    const siteUrl = getSiteUrl();

    const sampleName =
      participants.find((p) => p.email.trim())?.displayName ?? "Jamie Lee";

    const msg = renderTemplatedPoolEmail({
      subjectTemplate: input.subjectTemplate,
      bodyTemplate: input.bodyTemplate,
      displayName: sampleName,
      poolName: pool.name,
      lockAtIso: pool.lockAt,
      siteUrl,
    });

    const configured = getResendMailerConfig() !== null;
    if (!configured) {
      return {
        ok: true,
        deliveryConfigured: false,
        recipientCount: 1,
        emailsAccepted: 0,
        failures: [],
      };
    }

    const res = await sendResendEmail({
      to,
      subject: `[Test] ${msg.subject}`,
      text: msg.text,
      html: msg.html,
    });

    if (!res.ok) {
      return {
        ok: true,
        deliveryConfigured: true,
        recipientCount: 1,
        emailsAccepted: 0,
        failures: [
          {
            email: to,
            error: res.skipped ? "Email not configured" : res.error,
          },
        ],
      };
    }

    return {
      ok: true,
      deliveryConfigured: true,
      recipientCount: 1,
      emailsAccepted: 1,
      failures: [],
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong.",
    };
  }
}
