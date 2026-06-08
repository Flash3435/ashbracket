"use server";

import { logAdminRiskAction } from "@/lib/admin/adminRiskAuditLog";
import { assertCanManagePool } from "@/lib/admin/assertCanManagePool";
import { isProductionDeployment } from "@/lib/admin/deploymentEnvironment";
import {
  gateSimulationPoolOutboundEmail,
  logSimulationPoolEmailSuccess,
} from "@/lib/admin/enforceSimulationPoolEmailForAction";
import { recordIncompleteBracketReminderSend } from "@/lib/admin/loadIncompleteBracketPanelForPool";
import { checkProductionAdminAck } from "@/lib/admin/requireProductionAdminAck";
import { isSimulationEmailOverrideEnabledInProduction } from "@/lib/admin/simulationPoolEmailPolicy";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import {
  getEmailTemplateDefaults,
  renderTemplatedPoolEmail,
} from "@/lib/communications/messageTemplates";
import { loadParticipantIdsWithIncompletePicks } from "@/lib/communications/picksCompleteness";
import {
  resolvePoolEmailTargets,
  type PoolCommunicationParticipant,
} from "@/lib/communications/recipientResolve";
import {
  getResendMailerConfig,
  sendResendEmail,
} from "@/lib/email/sendResendEmail";

export type SendIncompleteBracketReminderResult =
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
): Promise<{ name: string; lockAt: string | null; isSimulation: boolean }> {
  const { data } = await supabase
    .from("pools")
    .select("name, lock_at, is_simulation")
    .eq("id", poolId)
    .maybeSingle();
  return {
    name: (data?.name as string | undefined)?.trim() || "Your pool",
    lockAt: (data?.lock_at as string | null) ?? null,
    isSimulation: Boolean(data?.is_simulation),
  };
}

async function loadIncompleteCommunicationParticipants(
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

export async function sendIncompleteBracketReminderAction(input: {
  poolId: string;
  productionAcknowledged?: boolean;
  simulationEmailAcknowledged?: boolean;
  typedConfirmationPhrase?: string;
}): Promise<SendIncompleteBracketReminderResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "You must be signed in." };
    }

    const poolId = input.poolId.trim();
    const gate = await assertCanManagePool(supabase, poolId);
    if (!gate.ok) return { ok: false, error: gate.error };

    const poolMetaEarly = await loadPoolMeta(supabase, poolId);

    if (isProductionDeployment() && !poolMetaEarly.isSimulation) {
      const prodAck = checkProductionAdminAck(input.productionAcknowledged);
      if (!prodAck.ok) return prodAck;
    }

    const participants = await loadIncompleteCommunicationParticipants(
      supabase,
      poolId,
    );
    const { targets } = resolvePoolEmailTargets(
      participants,
      "incomplete_picks",
      [],
    );

    if (targets.length === 0) {
      return {
        ok: false,
        error:
          "No incomplete participants have an email address. Add emails on the Participants page or use Open communications to customize a message.",
      };
    }

    const emailGate = await gateSimulationPoolOutboundEmail({
      supabase,
      poolId,
      poolName: poolMetaEarly.name,
      action: "pool_communications_send",
      userId: user.id,
      userEmail: user.email,
      recipientCount: targets.length,
      productionAcknowledged: input.productionAcknowledged,
      simulationEmailAcknowledged: input.simulationEmailAcknowledged,
      typedConfirmationPhrase: input.typedConfirmationPhrase,
    });
    if (!emailGate.ok) {
      return { ok: false, error: emailGate.error };
    }

    const pool = await loadPoolMeta(supabase, poolId);
    const template = getEmailTemplateDefaults("incomplete_bracket_reminder");
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
        subjectTemplate: template.subject,
        bodyTemplate: template.body,
        displayName: t.displayName,
        poolName: pool.name,
        lockAtIso: pool.lockAt,
        siteUrl,
        participantId: t.id,
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

    if (emailsAccepted > 0) {
      await recordIncompleteBracketReminderSend(supabase, {
        poolId,
        recipientCount: emailsAccepted,
        sentByUserId: user.id,
      });
    }

    logAdminRiskAction({
      action: "pool_communications_send",
      userId: user.id,
      userEmail: user.email,
      poolId,
      poolName: pool.name,
      isSimulation: poolMetaEarly.isSimulation,
      affectedParticipantCount: targets.length,
      detail: `incomplete_bracket_reminder emailsAccepted=${emailsAccepted}`,
    });

    logSimulationPoolEmailSuccess({
      action: "pool_communications_send",
      userId: user.id,
      userEmail: user.email,
      poolId,
      poolName: pool.name,
      isSimulationPool: poolMetaEarly.isSimulation,
      overrideEnabled: isSimulationEmailOverrideEnabledInProduction(),
      recipientCount: targets.length,
      detail: `incomplete_bracket_reminder emailsAccepted=${emailsAccepted}`,
    });

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
