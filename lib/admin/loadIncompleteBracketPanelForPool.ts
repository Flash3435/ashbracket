import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCompletionStatusForParticipant,
  loadPicksCompletenessInputsForPool,
} from "../communications/picksCompleteness";
import { buildAdminIncompleteParticipantBreakdown } from "../picks/poolMembershipCompletionStatus";
import { getResendMailerConfig } from "../email/sendResendEmail";
import {
  buildIncompleteBracketPanelData,
  INCOMPLETE_BRACKET_REMINDER_TYPE,
  type IncompleteBracketPanelData,
} from "./incompleteBracketPanel";

export async function loadLastIncompleteBracketReminder(
  supabase: SupabaseClient,
  poolId: string,
): Promise<{ sentAt: string; recipientCount: number } | null> {
  const { data, error } = await supabase
    .from("pool_reminder_sends")
    .select("sent_at, recipient_count")
    .eq("pool_id", poolId)
    .eq("reminder_type", INCOMPLETE_BRACKET_REMINDER_TYPE)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const sentAt = data.sent_at as string | undefined;
  if (!sentAt) return null;
  return {
    sentAt,
    recipientCount: Number(data.recipient_count) || 0,
  };
}

export async function loadIncompleteBracketPanelForPool(
  supabase: SupabaseClient,
  args: {
    poolId: string;
    poolName: string;
    lockAtIso: string | null;
  },
): Promise<IncompleteBracketPanelData> {
  const { data: rows, error } = await supabase
    .from("participants")
    .select("id, display_name, email, user_id")
    .eq("pool_id", args.poolId)
    .order("display_name", { ascending: true });

  if (error) {
    return buildIncompleteBracketPanelData({
      poolId: args.poolId,
      poolName: args.poolName,
      lockAtIso: args.lockAtIso,
      knockoutBracketPicksUnlocked: true,
      participants: [],
      emailConfigured: getResendMailerConfig() !== null,
      statusAvailable: false,
    });
  }

  const participantRows = (rows ?? []) as {
    id: string;
    display_name: string;
    email: string | null;
    user_id: string | null;
  }[];
  const participantIds = participantRows.map((r) => r.id);

  let knockoutBracketPicksUnlocked = true;
  let picksCompleteById = new Map<string, boolean>();
  let breakdownById = new Map<string, ReturnType<typeof buildAdminIncompleteParticipantBreakdown>>();
  let statusAvailable = true;

  if (participantIds.length > 0) {
    const inputs = await loadPicksCompletenessInputsForPool(
      supabase,
      args.poolId,
      participantIds,
    );
    if (!inputs) {
      statusAvailable = false;
    } else {
      knockoutBracketPicksUnlocked = inputs.knockoutBracketPicksUnlocked;
      for (const pid of participantIds) {
        const status = buildCompletionStatusForParticipant(inputs, pid);
        picksCompleteById.set(pid, status.isComplete);
        if (!status.isComplete) {
          breakdownById.set(pid, buildAdminIncompleteParticipantBreakdown(status));
        }
      }
    }
  }

  const lastReminder = await loadLastIncompleteBracketReminder(
    supabase,
    args.poolId,
  );

  return buildIncompleteBracketPanelData({
    poolId: args.poolId,
    poolName: args.poolName,
    lockAtIso: args.lockAtIso,
    knockoutBracketPicksUnlocked,
    participants: participantRows.map((r) => ({
      id: r.id,
      displayName: r.display_name,
      email: r.email ?? "",
      picksComplete: picksCompleteById.get(r.id) ?? false,
      userId: r.user_id,
      breakdown: breakdownById.get(r.id) ?? null,
    })),
    lastReminderSentAt: lastReminder?.sentAt ?? null,
    lastReminderRecipientCount: lastReminder?.recipientCount ?? null,
    emailConfigured: getResendMailerConfig() !== null,
    statusAvailable,
  });
}

export async function recordIncompleteBracketReminderSend(
  supabase: SupabaseClient,
  args: {
    poolId: string;
    recipientCount: number;
    sentByUserId: string;
  },
): Promise<void> {
  const { error } = await supabase.from("pool_reminder_sends").insert({
    pool_id: args.poolId,
    reminder_type: INCOMPLETE_BRACKET_REMINDER_TYPE,
    recipient_count: args.recipientCount,
    sent_by_user_id: args.sentByUserId,
  });
  if (error) {
    console.error("[recordIncompleteBracketReminderSend]", error.message);
  }
}
