import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_noStore as noStore } from "next/cache";
import { buildCompletionStatusForParticipant } from "../communications/picksCompleteness";
import { buildAdminIncompleteParticipantBreakdown } from "../picks/poolMembershipCompletionStatus";
import { buildAllParticipantPickDrafts } from "../predictions/buildParticipantPickDrafts";
import { detectPickKeyMismatches } from "../predictions/participantPickDiagnostics";
import { getResendMailerConfig } from "../email/sendResendEmail";
import {
  buildIncompleteBracketPanelData,
  INCOMPLETE_BRACKET_REMINDER_TYPE,
  type IncompleteBracketCompletionDebugRow,
  type IncompleteBracketPanelData,
} from "./incompleteBracketPanel";
import {
  loadAdminPicksCompletenessInputsForPool,
  type AdminCompletionSourceDiagnostics,
} from "./trustedPoolPicksCompleteness";

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
  noStore();

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
  let keyMismatchById = new Map<string, boolean>();
  let statusAvailable = true;
  let statusUnavailableReason: string | null = null;
  let sourceDiagnostics: AdminCompletionSourceDiagnostics = {
    buildCommitSha: "unknown",
    dataSource: "load-failed",
    serviceRoleAvailable: false,
    serviceRoleRequired: false,
    participantCount: participantIds.length,
    predictionRowCount: 0,
    groupMapSize: 0,
    trustedIncompleteCount: 0,
    warningMessage: null,
  };
  const completionDebug: IncompleteBracketCompletionDebugRow[] = [];
  const showCompletionDebug =
    process.env.INCOMPLETE_PANEL_COMPLETION_DEBUG === "1";

  if (participantIds.length > 0) {
    const loaded = await loadAdminPicksCompletenessInputsForPool(
      args.poolId,
      participantIds,
      { fallbackSupabase: supabase },
    );
    sourceDiagnostics = loaded.diagnostics;
    if (!loaded.ok) {
      statusAvailable = false;
      statusUnavailableReason = loaded.diagnostics.warningMessage;
    } else {
      const inputs = loaded.inputs;
      knockoutBracketPicksUnlocked = inputs.knockoutBracketPicksUnlocked;
      for (const row of participantRows) {
        const pid = row.id;
        const status = buildCompletionStatusForParticipant(inputs, pid);
        picksCompleteById.set(pid, status.isComplete);

        if (showCompletionDebug) {
          const group = status.sections.find((s) => s.id === "group");
          const third = status.sections.find((s) => s.id === "third_place");
          const bonus = status.sections.find((s) => s.id === "bonus");
          const knockout = status.sections.find((s) => s.id === "knockout");
          completionDebug.push({
            participantId: pid,
            displayName: row.display_name,
            isComplete: status.isComplete,
            missingPickKeysCount: status.missingPickKeys.length,
            sections: {
              group: group ? `${group.filled}/${group.total}` : "—",
              third: third ? `${third.filled}/${third.total}` : "—",
              bonus: bonus ? `${bonus.filled}/${bonus.total}` : "—",
              knockout: !inputs.knockoutBracketPicksUnlocked
                ? "not required"
                : knockout
                  ? `${knockout.filled}/${knockout.total}`
                  : "—",
            },
          });
        }

        if (!status.isComplete) {
          breakdownById.set(pid, buildAdminIncompleteParticipantBreakdown(status));
          const slots = buildAllParticipantPickDrafts({
            stageByCode: inputs.stageByCode,
            predictions: inputs.predictions,
            participantId: pid,
            bonusKeys: inputs.bonusKeys,
            teams: inputs.teams,
            groupTeamCountryCodesByLetter: inputs.groupTeamCountryCodesByLetter,
          });
          const mismatch = detectPickKeyMismatches({
            predictions: inputs.predictions,
            participantId: pid,
            slots,
            missingPickKeys: status.missingPickKeys,
            teams: inputs.teams,
            groupTeamCountryCodesByLetter: inputs.groupTeamCountryCodesByLetter,
          });
          keyMismatchById.set(pid, mismatch.possibleKeyMismatch);
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
      picksComplete: statusAvailable
        ? (picksCompleteById.get(r.id) ?? false)
        : false,
      userId: r.user_id,
      breakdown: breakdownById.get(r.id) ?? null,
      possibleKeyMismatch: keyMismatchById.get(r.id) ?? false,
    })),
    lastReminderSentAt: lastReminder?.sentAt ?? null,
    lastReminderRecipientCount: lastReminder?.recipientCount ?? null,
    emailConfigured: getResendMailerConfig() !== null,
    statusAvailable,
    completionDebug: showCompletionDebug ? completionDebug : undefined,
    sourceDiagnostics,
    statusUnavailableReason,
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
