import type { RecapFacts } from "./buildDeterministicRecapBody";
import type { PoolMilestoneLabel } from "./poolActivityTypes";

export type PoolMilestoneCandidate = {
  sourceKey: string;
  bodyText: string;
  milestoneLabel: PoolMilestoneLabel;
  metadata?: Record<string, unknown>;
};

function incompleteSuffix(remaining: number): string {
  if (remaining <= 0) return "";
  const noun = remaining === 1 ? "participant" : "participants";
  return ` ${remaining} ${noun} still need to finish.`;
}

/**
 * Pure evaluation of completion milestones that should exist given current pool stats.
 * Each candidate maps 1:1 to a stable source_key for deduplicated persistence.
 */
export function buildCompletionMilestoneCandidates(
  facts: RecapFacts,
): PoolMilestoneCandidate[] {
  const { participantCount, submittedCount } = facts;
  if (participantCount <= 0 || submittedCount <= 0) return [];

  const remaining = participantCount - submittedCount;
  const pct = submittedCount / participantCount;
  const out: PoolMilestoneCandidate[] = [];

  if (participantCount >= 5) {
    for (let n = 5; n <= submittedCount && n <= participantCount; n += 5) {
      out.push({
        sourceKey: `completion_count_${n}`,
        bodyText: `🎉 ${n} brackets are now complete.`,
        milestoneLabel: "MILESTONE",
        metadata: { completed_count: n, participant_count: participantCount },
      });
    }
  }

  if (participantCount >= 2 && pct >= 0.5) {
    out.push({
      sourceKey: "completion_50",
      bodyText: "✅ Half the pool has completed their bracket.",
      milestoneLabel: "MILESTONE",
      metadata: {
        completed_count: submittedCount,
        participant_count: participantCount,
      },
    });
  }

  if (participantCount >= 4 && pct >= 0.75) {
    out.push({
      sourceKey: "completion_75",
      bodyText: "🎉 Three quarters of the pool has completed their bracket.",
      milestoneLabel: "MILESTONE",
      metadata: {
        completed_count: submittedCount,
        participant_count: participantCount,
      },
    });
  }

  if (submittedCount >= participantCount) {
    out.push({
      sourceKey: "completion_100",
      bodyText: "✅ All brackets are complete. Let the chaos begin.",
      milestoneLabel: "MILESTONE",
      metadata: {
        completed_count: submittedCount,
        participant_count: participantCount,
      },
    });
  }

  if (remaining > 0 && remaining <= 3 && submittedCount > 0) {
    const bracketWord = remaining === 1 ? "bracket" : "brackets";
    out.push({
      sourceKey: "completion_remaining_le3",
      bodyText: `⏳ Only ${remaining} ${bracketWord} left to complete.`,
      milestoneLabel: "MILESTONE",
      metadata: {
        remaining_count: remaining,
        participant_count: participantCount,
      },
    });
  }

  return out;
}

/**
 * Pure evaluation of deadline / lock milestones from pool lock_at and completion stats.
 */
export function buildDeadlineMilestoneCandidates(
  lockAtIso: string | null | undefined,
  facts: RecapFacts,
  nowMs = Date.now(),
): PoolMilestoneCandidate[] {
  const lockAt = lockAtIso?.trim();
  if (!lockAt) return [];

  const lockMs = new Date(lockAt).getTime();
  if (Number.isNaN(lockMs)) return [];

  const remaining = Math.max(0, facts.participantCount - facts.submittedCount);
  const suffix = incompleteSuffix(remaining);
  const out: PoolMilestoneCandidate[] = [];

  if (lockMs <= nowMs) {
    out.push({
      sourceKey: "lock_passed",
      bodyText: "🔒 Picks are locked. No more changes.",
      milestoneLabel: "POOL UPDATE",
      metadata: { lock_at: lockAt, incomplete_count: remaining },
    });
    out.push({
      sourceKey: "picks_locked_insights",
      bodyText: "👀 Brackets are locked. Time to see who believed in chaos.",
      milestoneLabel: "POOL UPDATE",
      metadata: { lock_at: lockAt },
    });
    return out;
  }

  const hoursUntil = (lockMs - nowMs) / (3600 * 1000);

  if (hoursUntil <= 48 && hoursUntil > 24) {
    out.push({
      sourceKey: "lock_tomorrow",
      bodyText: `⏳ Picks lock tomorrow.${suffix}`,
      milestoneLabel: "DEADLINE",
      metadata: {
        lock_at: lockAt,
        incomplete_count: remaining,
        hours_until_lock: Math.round(hoursUntil),
      },
    });
  }

  if (hoursUntil <= 24) {
    out.push({
      sourceKey: "lock_today",
      bodyText: `🚨 Final call: picks lock today.${suffix}`,
      milestoneLabel: "DEADLINE",
      metadata: {
        lock_at: lockAt,
        incomplete_count: remaining,
        hours_until_lock: Math.round(hoursUntil),
      },
    });
  }

  if (hoursUntil <= 48 && remaining > 0) {
    out.push({
      sourceKey: "lock_soon",
      bodyText: `⏰ Picks lock soon:${suffix}`,
      milestoneLabel: "DEADLINE",
      metadata: {
        lock_at: lockAt,
        incomplete_count: remaining,
        hours_until_lock: Math.round(hoursUntil),
      },
    });
  }

  return out;
}

export function buildAllPoolMilestoneCandidates(
  facts: RecapFacts,
  lockAtIso: string | null | undefined,
  nowMs = Date.now(),
): PoolMilestoneCandidate[] {
  return [
    ...buildCompletionMilestoneCandidates(facts),
    ...buildDeadlineMilestoneCandidates(lockAtIso, facts, nowMs),
  ];
}
