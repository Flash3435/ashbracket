import {
  recapFactsFromActivityMetadata,
  type RecapFacts,
} from "../poolActivity/buildDeterministicRecapBody";
import type { PoolActivityFeedRow } from "../poolActivity/poolActivityTypes";

export type AshBotCommentaryContext = {
  liveRecapFacts?: RecapFacts | null;
  liveRecapDateYmd?: string | null;
};

/** FNV-1a over UTF-16 code units — stable template pick per activity id. */
export function stableTemplateIndex(seed: string, templateCount: number): number {
  if (templateCount <= 0) return 0;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % templateCount;
}

function participantName(item: PoolActivityFeedRow): string | null {
  const n = item.participant_display_name?.trim();
  return n || null;
}

function recapCounts(
  item: PoolActivityFeedRow,
  context: AshBotCommentaryContext | undefined,
): { completed: number; total: number; remaining: number } | null {
  const meta = item.metadata_json;
  const recapDate = meta.recap_date;
  if (
    context?.liveRecapFacts &&
    context.liveRecapDateYmd &&
    typeof recapDate === "string" &&
    recapDate === context.liveRecapDateYmd
  ) {
    const { submittedCount, participantCount } = context.liveRecapFacts;
    return {
      completed: submittedCount,
      total: participantCount,
      remaining: Math.max(0, participantCount - submittedCount),
    };
  }
  const facts = recapFactsFromActivityMetadata(meta);
  if (!facts) return null;
  return {
    completed: facts.submittedCount,
    total: facts.participantCount,
    remaining: Math.max(0, facts.participantCount - facts.submittedCount),
  };
}

function pickTemplate(seed: string, templates: readonly string[]): string {
  return templates[stableTemplateIndex(seed, templates.length)] ?? templates[0];
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

/**
 * Template-based AshBot one-liner for supported activity types.
 * Returns null when commentary should not appear (unsupported type, missing name, etc.).
 */
export function buildAshBotComment(
  item: PoolActivityFeedRow,
  context?: AshBotCommentaryContext,
): string | null {
  const seed = item.id.trim() || `${item.type}:${item.created_at}`;

  switch (item.type) {
    case "participant_joined": {
      const name = participantName(item);
      if (!name) return null;
      const templates = [
        "Welcome {name}. May your bracket survive the group stage.",
        "{name} joined the pool. Fresh bracket, fresh hope.",
        "Another contender enters the arena. Welcome, {name}.",
      ] as const;
      return fill(pickTemplate(seed, templates), { name });
    }
    case "participant_submitted_picks": {
      const name = participantName(item);
      if (!name) return null;
      const templates = [
        "{name} has completed their bracket. The crystal ball has spoken.",
        "{name} made their picks. Confidence level: mysterious.",
        "{name} is officially locked in... for now.",
      ] as const;
      return fill(pickTemplate(seed, templates), { name });
    }
    case "participant_updated_picks": {
      const name = participantName(item);
      if (!name) return null;
      const templates = [
        "{name} updated their picks. The overthinking phase has begun.",
        "{name} made a change. The bracket gods have been notified.",
        "{name} adjusted their picks. Strategy, panic, or genius? Time will tell.",
      ] as const;
      return fill(pickTemplate(seed, templates), { name });
    }
    case "ash_daily_recap": {
      const counts = recapCounts(item, context);
      if (!counts || counts.total <= 0) return null;
      const { completed, total, remaining } = counts;
      const templates =
        remaining > 0
          ? ([
              "{completed} of {total} brackets are complete. {remaining} brave souls are still \"researching.\"",
              "{completed} of {total} brackets are in. The pressure is now professionally applied.",
              "{completed} completed, {remaining} to go. Someone send a reminder pigeon.",
            ] as const)
          : ([
              "Every bracket is in ({total} of {total}). The pool is officially ready for drama.",
              "All {total} brackets are complete. AshBot approves this level of preparedness.",
              "{total} of {total} — full completion. The bracket gossip can take a breather.",
            ] as const);
      return fill(pickTemplate(seed, templates), {
        completed: String(completed),
        total: String(total),
        remaining: String(remaining),
      });
    }
    case "announcement": {
      const templates = [
        "Fresh news from pool HQ. AshBot is taking notes.",
        "An admin announcement landed. Curiosity encouraged.",
        "Pool update posted. AshBot will be watching the reactions.",
      ] as const;
      return pickTemplate(seed, templates);
    }
    default:
      return null;
  }
}
