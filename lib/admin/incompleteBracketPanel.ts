import { formatStillNeedToFinishVerb } from "../copy/pluralize";
import { formatPoolLockDeadline } from "../datetime/poolLockDeadline";
import type { AdminIncompleteParticipantBreakdown } from "../picks/poolMembershipCompletionStatus";
import { formatRelativeTimeUntilEn } from "../picks/poolPickDeadlineDisplay";
import type { AdminCompletionSourceDiagnostics } from "./trustedPoolPicksCompleteness";

export const INCOMPLETE_BRACKET_REMINDER_TYPE = "incomplete_bracket_reminder";

export const REMINDER_SPAM_GUARD_MS = 60 * 60 * 1000;

export type IncompleteBracketParticipant = {
  id: string;
  displayName: string;
  hasEmail: boolean;
  userId: string | null;
  breakdown: AdminIncompleteParticipantBreakdown;
};

export type IncompleteBracketPanelState =
  | "no_participants"
  | "all_complete"
  | "some_incomplete"
  | "past_lock"
  | "unavailable";

export type IncompleteBracketCompletionDebugRow = {
  participantId: string;
  displayName: string;
  isComplete: boolean;
  missingPickKeysCount: number;
  sections: {
    group: string;
    third: string;
    bonus: string;
    knockout: string;
  };
};

export type IncompleteBracketPanelData = {
  poolId: string;
  poolName: string;
  state: IncompleteBracketPanelState;
  totalParticipants: number;
  completedCount: number;
  incompleteCount: number;
  incompleteParticipants: IncompleteBracketParticipant[];
  /** Names beyond the first five incomplete participants. */
  moreIncompleteCount: number;
  lockAtIso: string | null;
  picksLocked: boolean;
  deadlineLabel: string | null;
  timeRemainingLabel: string | null;
  completionDefinitionLabel: string;
  knockoutBracketPicksUnlocked: boolean;
  /**
   * When true, at least one incomplete participant has saved picks that did not hydrate
   * into required slots (possible key mismatch). Reminder sends should be deferred.
   */
  possibleKeyMismatch: boolean;
  /** Incomplete participants who can receive email. */
  mailableIncompleteCount: number;
  skippedNoEmailCount: number;
  emailConfigured: boolean;
  lastReminderSentAt: string | null;
  lastReminderRecipientCount: number | null;
  reminderRecentlySent: boolean;
  communicationsHref: string;
  /** Populated when INCOMPLETE_PANEL_COMPLETION_DEBUG=1 on the server. */
  completionDebug?: IncompleteBracketCompletionDebugRow[];
  /** Always populated for admin visibility while verifying trusted completion reads. */
  sourceDiagnostics: AdminCompletionSourceDiagnostics;
  /** Shown when state is unavailable (e.g. missing service role in production). */
  statusUnavailableReason: string | null;
};

export type BuildIncompleteBracketPanelInput = {
  poolId: string;
  poolName: string;
  lockAtIso: string | null;
  knockoutBracketPicksUnlocked: boolean;
  participants: Array<{
    id: string;
    displayName: string;
    email: string;
    picksComplete: boolean;
    userId?: string | null;
    breakdown?: AdminIncompleteParticipantBreakdown | null;
    possibleKeyMismatch?: boolean;
  }>;
  lastReminderSentAt?: string | null;
  lastReminderRecipientCount?: number | null;
  emailConfigured: boolean;
  nowMs?: number;
  statusAvailable?: boolean;
  completionDebug?: IncompleteBracketCompletionDebugRow[];
  sourceDiagnostics?: AdminCompletionSourceDiagnostics;
  statusUnavailableReason?: string | null;
};

const MAX_VISIBLE_INCOMPLETE = 5;

export function completionDefinitionLabel(
  knockoutBracketPicksUnlocked: boolean,
): string {
  if (knockoutBracketPicksUnlocked) {
    return "Bracket complete for current stage (group, third-place, bonus, and knockout).";
  }
  return "Pre-lock picks complete (group, third-place, and bonus). Knockout picks are not required until Round of 32 is published.";
}

export function formatLastReminderSentLabel(
  sentAtIso: string,
  nowMs = Date.now(),
): string {
  const sentMs = new Date(sentAtIso).getTime();
  if (Number.isNaN(sentMs)) return "Last reminder sent recently";
  const diffMs = Math.max(0, nowMs - sentMs);
  if (diffMs < 60_000) return "Last reminder sent just now";
  if (diffMs < 3600_000) {
    const minutes = Math.max(1, Math.round(diffMs / 60_000));
    return minutes === 1
      ? "Last reminder sent 1 minute ago"
      : `Last reminder sent ${minutes} minutes ago`;
  }
  if (diffMs < 86_400_000) {
    const hours = Math.max(1, Math.round(diffMs / 3600_000));
    return hours === 1
      ? "Last reminder sent 1 hour ago"
      : `Last reminder sent ${hours} hours ago`;
  }
  const days = Math.max(1, Math.round(diffMs / 86_400_000));
  return days === 1
    ? "Last reminder sent 1 day ago"
    : `Last reminder sent ${days} days ago`;
}

/** Progress line verb after incomplete count (e.g. "still needs to finish"). */
export function formatIncompleteStillFinishingVerb(incompleteCount: number): string {
  return formatStillNeedToFinishVerb(incompleteCount);
}

export function reminderRecentlySent(
  lastReminderSentAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!lastReminderSentAt) return false;
  const sentMs = new Date(lastReminderSentAt).getTime();
  if (Number.isNaN(sentMs)) return false;
  return nowMs - sentMs < REMINDER_SPAM_GUARD_MS;
}

function picksLockedAt(lockAtIso: string | null, nowMs: number): boolean {
  if (lockAtIso == null || lockAtIso === "") return false;
  const t = new Date(lockAtIso).getTime();
  if (Number.isNaN(t)) return false;
  return t <= nowMs;
}

export function buildIncompleteBracketPanelData(
  input: BuildIncompleteBracketPanelInput,
): IncompleteBracketPanelData {
  const nowMs = input.nowMs ?? Date.now();
  const lockAtIso = input.lockAtIso?.trim() || null;
  const picksLocked = picksLockedAt(lockAtIso, nowMs);
  const deadlineLabel = lockAtIso
    ? formatPoolLockDeadline(lockAtIso, { style: "compact" })
    : null;
  const timeRemainingLabel =
    lockAtIso && !picksLocked
      ? formatRelativeTimeUntilEn(lockAtIso, nowMs) || null
      : picksLocked
        ? "locked"
        : null;

  const communicationsHref = `/admin/pools/${input.poolId}/communications?preset=incomplete_picks`;
  const sourceDiagnostics = input.sourceDiagnostics ?? {
    buildCommitSha: "unknown",
    dataSource: "load-failed",
    serviceRoleAvailable: false,
    serviceRoleRequired: false,
    participantCount: input.participants.length,
    predictionRowCount: 0,
    groupMapSize: 0,
    trustedIncompleteCount: 0,
    warningMessage: input.statusUnavailableReason ?? null,
  };

  if (input.statusAvailable === false) {
    return {
      poolId: input.poolId,
      poolName: input.poolName,
      state: "unavailable",
      totalParticipants: input.participants.length,
      completedCount: 0,
      incompleteCount: 0,
      incompleteParticipants: [],
      moreIncompleteCount: 0,
      lockAtIso,
      picksLocked,
      deadlineLabel,
      timeRemainingLabel,
      completionDefinitionLabel: completionDefinitionLabel(
        input.knockoutBracketPicksUnlocked,
      ),
      knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
      possibleKeyMismatch: false,
      mailableIncompleteCount: 0,
      skippedNoEmailCount: 0,
      emailConfigured: input.emailConfigured,
      lastReminderSentAt: input.lastReminderSentAt ?? null,
      lastReminderRecipientCount: input.lastReminderRecipientCount ?? null,
      reminderRecentlySent: reminderRecentlySent(
        input.lastReminderSentAt,
        nowMs,
      ),
      communicationsHref,
      completionDebug: input.completionDebug,
      sourceDiagnostics,
      statusUnavailableReason: input.statusUnavailableReason ?? null,
    };
  }

  const totalParticipants = input.participants.length;
  if (totalParticipants === 0) {
    return {
      poolId: input.poolId,
      poolName: input.poolName,
      state: "no_participants",
      totalParticipants: 0,
      completedCount: 0,
      incompleteCount: 0,
      incompleteParticipants: [],
      moreIncompleteCount: 0,
      lockAtIso,
      picksLocked,
      deadlineLabel,
      timeRemainingLabel,
      completionDefinitionLabel: completionDefinitionLabel(
        input.knockoutBracketPicksUnlocked,
      ),
      knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
      possibleKeyMismatch: false,
      mailableIncompleteCount: 0,
      skippedNoEmailCount: 0,
      emailConfigured: input.emailConfigured,
      lastReminderSentAt: input.lastReminderSentAt ?? null,
      lastReminderRecipientCount: input.lastReminderRecipientCount ?? null,
      reminderRecentlySent: reminderRecentlySent(
        input.lastReminderSentAt,
        nowMs,
      ),
      communicationsHref,
      completionDebug: input.completionDebug,
      sourceDiagnostics,
      statusUnavailableReason: null,
    };
  }

  const incompleteRows = input.participants.filter((p) => !p.picksComplete);
  const possibleKeyMismatch = incompleteRows.some(
    (p) => p.possibleKeyMismatch === true,
  );
  const completedCount = totalParticipants - incompleteRows.length;
  const incompleteCount = incompleteRows.length;
  const incompleteParticipants = incompleteRows
    .slice(0, MAX_VISIBLE_INCOMPLETE)
    .map((p) => ({
      id: p.id,
      displayName: p.displayName.trim() || "Participant",
      hasEmail: Boolean(p.email.trim()),
      userId: p.userId ?? null,
      breakdown: p.breakdown ?? {
        missingSummary: "Pick completion details unavailable.",
        groupPicks: "—",
        thirdPlacePicks: "—",
        bonusPicks: "—",
        knockoutStatus: input.knockoutBracketPicksUnlocked
          ? "—"
          : "Not required yet (Round of 32 not published)",
      },
    }));
  const moreIncompleteCount = Math.max(
    0,
    incompleteCount - incompleteParticipants.length,
  );
  const mailableIncompleteCount = incompleteRows.filter((p) =>
    Boolean(p.email.trim()),
  ).length;
  const skippedNoEmailCount = incompleteCount - mailableIncompleteCount;

  let state: IncompleteBracketPanelState;
  if (incompleteCount === 0) {
    state = "all_complete";
  } else if (picksLocked) {
    state = "past_lock";
  } else {
    state = "some_incomplete";
  }

  return {
    poolId: input.poolId,
    poolName: input.poolName,
    state,
    totalParticipants,
    completedCount,
    incompleteCount,
    incompleteParticipants,
    moreIncompleteCount,
    lockAtIso,
    picksLocked,
    deadlineLabel,
    timeRemainingLabel,
    completionDefinitionLabel: completionDefinitionLabel(
      input.knockoutBracketPicksUnlocked,
    ),
    knockoutBracketPicksUnlocked: input.knockoutBracketPicksUnlocked,
    possibleKeyMismatch,
    mailableIncompleteCount,
    skippedNoEmailCount,
    emailConfigured: input.emailConfigured,
    lastReminderSentAt: input.lastReminderSentAt ?? null,
    lastReminderRecipientCount: input.lastReminderRecipientCount ?? null,
    reminderRecentlySent: reminderRecentlySent(input.lastReminderSentAt, nowMs),
    communicationsHref,
    completionDebug: input.completionDebug,
    sourceDiagnostics,
    statusUnavailableReason: null,
  };
}
