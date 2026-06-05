import {
  recapFactsFromActivityMetadata,
  type RecapFacts,
} from "../poolActivity/buildDeterministicRecapBody";
import type { PoolActivityFeedRow } from "../poolActivity/poolActivityTypes";

export type AshBotCommentaryContext = {
  liveRecapFacts?: RecapFacts | null;
  liveRecapDateYmd?: string | null;
};

export type AshBotVisibilityContext = {
  items: PoolActivityFeedRow[];
  itemIndex: number;
  /** Newest recap in the current feed slice (items are newest-first). */
  latestRecapId: string | null;
  ashbotEnabled?: boolean;
};

const NEARBY_DUPLICATE_WINDOW = 3;
const MAX_TEMPLATE_OFFSET = 12;

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

function activitySeed(item: PoolActivityFeedRow): string {
  return item.id.trim() || `${item.type}:${item.created_at}`;
}

function milestoneSourceKey(item: PoolActivityFeedRow): string | null {
  const sk = item.metadata_json.source_key;
  return typeof sk === "string" && sk.trim() ? sk.trim() : null;
}

function insightSourceKey(item: PoolActivityFeedRow): string | null {
  const sk = item.metadata_json.source_key;
  return typeof sk === "string" && sk.trim() ? sk.trim() : null;
}

function isJoinType(type: PoolActivityFeedRow["type"]): boolean {
  return type === "participant_joined";
}

function isPicksType(type: PoolActivityFeedRow["type"]): boolean {
  return (
    type === "participant_submitted_picks" || type === "participant_updated_picks"
  );
}

function runBounds(
  items: PoolActivityFeedRow[],
  index: number,
  matches: (type: PoolActivityFeedRow["type"]) => boolean,
): { length: number; position: number } {
  let start = index;
  while (start > 0 && matches(items[start - 1]!.type)) start -= 1;
  let end = index;
  while (end < items.length - 1 && matches(items[end + 1]!.type)) end += 1;
  return { length: end - start + 1, position: index - start };
}

/**
 * Deterministic per-item visibility — same feed order and ids always yield the same result.
 */
export function shouldShowAshBotComment(
  item: PoolActivityFeedRow,
  ctx: AshBotVisibilityContext,
): boolean {
  if (ctx.ashbotEnabled === false) return false;

  switch (item.type) {
    case "ash_daily_recap":
      return ctx.latestRecapId !== null && item.id === ctx.latestRecapId;
    case "announcement":
      return true;
    case "participant_joined": {
      const name = participantName(item);
      if (!name) return false;
      const { length, position } = runBounds(ctx.items, ctx.itemIndex, isJoinType);
      if (length === 1) return true;
      if (length === 2) return position === 0;
      if (position === 0) return true;
      return stableTemplateIndex(`${activitySeed(item)}:join-visible`, 3) === 0;
    }
    case "participant_submitted_picks":
    case "participant_updated_picks": {
      if (!participantName(item)) return false;
      const { length } = runBounds(ctx.items, ctx.itemIndex, isPicksType);
      if (length <= 2) return true;
      return stableTemplateIndex(`${activitySeed(item)}:picks-visible`, 2) === 0;
    }
    case "pool_milestone": {
      const sk = milestoneSourceKey(item);
      if (!sk) return false;
      if (
        sk === "completion_100" ||
        sk === "completion_50" ||
        sk === "lock_passed"
      ) {
        return stableTemplateIndex(`${activitySeed(item)}:milestone-visible`, 2) === 0;
      }
      return false;
    }
    case "pool_insight": {
      const sk = insightSourceKey(item);
      if (!sk) return false;
      if (
        sk.startsWith("prelock_completion_percent_") ||
        sk.startsWith("prelock_remaining_") ||
        sk.startsWith("prelock_activity_today_") ||
        sk === "postlock_top_champion" ||
        sk.startsWith("postlock_unique_champion_pick_") ||
        sk.startsWith("postlock_no_champion_pick_") ||
        sk.startsWith("postlock_underdog_finalist_")
      ) {
        return stableTemplateIndex(`${activitySeed(item)}:insight-visible`, 2) === 0;
      }
      return false;
    }
    default:
      return false;
  }
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

function pickTemplate(
  seed: string,
  templates: readonly string[],
  offset: number,
): string {
  return (
    templates[stableTemplateIndex(`${seed}:${offset}`, templates.length)] ??
    templates[0]
  );
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

function templatesForItem(item: PoolActivityFeedRow): readonly string[] | null {
  switch (item.type) {
    case "participant_joined":
      return JOIN_TEMPLATES;
    case "participant_submitted_picks":
      return PICKS_MADE_TEMPLATES;
    case "participant_updated_picks":
      return PICKS_UPDATED_TEMPLATES;
    case "ash_daily_recap":
      return null;
    case "announcement":
      return ANNOUNCEMENT_TEMPLATES;
    case "pool_milestone":
      return milestoneTemplatesForSourceKey(milestoneSourceKey(item));
    case "pool_insight":
      return insightTemplatesForSourceKey(insightSourceKey(item));
    default:
      return null;
  }
}

const JOIN_TEMPLATES = [
  "Welcome {name}. The bracket drama officially has one more cast member.",
  "{name} joined the pool. Fresh bracket, fresh hope.",
  "Another contender enters the arena. Welcome, {name}.",
  "{name} is here. The standings have been warned.",
  "Welcome {name}. May your picks be bold and your regrets be minimal.",
  "{name} joined the pool. The group chat just got more dangerous.",
  "Welcome {name}. The bracket gods are watching.",
  "{name} has arrived. Nobody panic. Yet.",
] as const;

const PICKS_MADE_TEMPLATES = [
  "{name} completed their bracket. The crystal ball has spoken.",
  "{name} made their picks. Confidence level: mysterious.",
  "{name} is officially locked in... for now.",
  "{name} has submitted a bracket. Fortune favors the brave.",
  "{name} made their picks. The spreadsheet energy is strong.",
  "{name} completed their picks. Future bragging rights are now pending.",
  "{name} has entered the prediction zone.",
  "{name} picked a path through chaos. Respect.",
] as const;

const PICKS_UPDATED_TEMPLATES = [
  "{name} updated their picks. The overthinking phase has begun.",
  "{name} made a change. The bracket gods have been notified.",
  "{name} adjusted their picks. Strategy, panic, or genius? Time will tell.",
  "{name} revised the bracket. A bold pivot, or a quiet panic?",
  "{name} updated their picks. The plot thickens.",
  "{name} changed something. Somewhere, a future point total shifted.",
  "{name} has reconsidered. That is either wisdom or danger.",
  "{name} edited their picks. Confidence remains officially unconfirmed.",
] as const;

const RECAP_INCOMPLETE_TEMPLATES = [
  "{completed} of {total} brackets are in. The pressure is now professionally applied.",
  "{completed} completed, {remaining} to go. Someone send a reminder pigeon.",
  "{completed} of {total} brackets are complete. The remaining {remaining} are still \"researching.\"",
  "{completed} brackets are done. {remaining} brave souls remain undecided.",
  "{completed}/{total} complete. The pool is slowly becoming sentient.",
  "{remaining} brackets left. The deadline clock is not getting friendlier.",
  "{completed} entries are locked in. {remaining} are still negotiating with fate.",
  "{completed} of {total} have made their move. The rest are preserving suspense.",
] as const;

const RECAP_COMPLETE_TEMPLATES = [
  "Every bracket is in ({total} of {total}). The pool is officially ready for drama.",
  "All {total} brackets are complete. AshBot approves this level of preparedness.",
  "{total} of {total} — full completion. The bracket gossip can take a breather.",
  "{completed} of {total} locked in. Suspense will have to come from the matches.",
] as const;

const ANNOUNCEMENT_TEMPLATES = [
  "Fresh news from pool HQ. AshBot is taking notes.",
  "An admin announcement landed. Curiosity encouraged.",
  "Pool update posted. AshBot will be watching the reactions.",
  "Official word from the pool admins. AshBot is on standby.",
] as const;

const MILESTONE_COMPLETION_50_TEMPLATES = [
  "Half the pool has spoken. The other half is preserving suspense.",
  "Fifty percent complete. The bracket tension is officially measurable.",
] as const;

const MILESTONE_COMPLETION_100_TEMPLATES = [
  "The brackets are in. Future bragging rights are officially pending.",
  "Every bracket is complete. The pool is now a waiting room with opinions.",
] as const;

const MILESTONE_LOCK_PASSED_TEMPLATES = [
  "No more edits. The bracket gods are now in charge.",
  "Picks are locked. From here on, destiny handles customer service.",
] as const;

const INSIGHT_PRELOCK_READY_TEMPLATES = [
  "The pool is filling in nicely. AshBot likes this energy.",
  "Readiness is climbing. The deadline clock remains unimpressed, but noted.",
  "More brackets in means more opinions. AshBot is here for it.",
] as const;

const INSIGHT_PRELOCK_HEATING_TEMPLATES = [
  "Busy day in the feed. Someone is definitely overthinking their bracket.",
  "High activity today. The pool has officially entered chaos prep mode.",
] as const;

const INSIGHT_PRELOCK_REMAINING_TEMPLATES = [
  "Almost everyone is in. The holdouts are preserving maximum suspense.",
  "Just a few brackets left. AshBot will not name names. Yet.",
] as const;

const INSIGHT_POSTLOCK_CHAMPION_TEMPLATES = [
  "A crowd favorite at the top. Bold or safe — history will judge.",
  "The champion pick leaderboard has a leader. Drama pending.",
] as const;

const INSIGHT_POSTLOCK_UNIQUE_TEMPLATES = [
  "One brave bracket went its own way. Respect the conviction.",
  "A lone wolf champion pick. AshBot is taking notes.",
] as const;

const INSIGHT_POSTLOCK_ABSENT_TEMPLATES = [
  "Interesting omission in the champion column. The plot thickens.",
  "Not everyone believes in the usual suspects. Noted.",
] as const;

const INSIGHT_POSTLOCK_UNDERDOG_TEMPLATES = [
  "Some brackets are betting on chaos in the final. AshBot approves the spice.",
  "Underdog finalists on the board. This pool is not playing it safe.",
] as const;

function milestoneTemplatesForSourceKey(
  sourceKey: string | null,
): readonly string[] | null {
  if (!sourceKey) return null;
  if (sourceKey === "completion_50") return MILESTONE_COMPLETION_50_TEMPLATES;
  if (sourceKey === "completion_100") return MILESTONE_COMPLETION_100_TEMPLATES;
  if (sourceKey === "lock_passed") return MILESTONE_LOCK_PASSED_TEMPLATES;
  return null;
}

function insightTemplatesForSourceKey(
  sourceKey: string | null,
): readonly string[] | null {
  if (!sourceKey) return null;
  if (sourceKey.startsWith("prelock_completion_percent_")) {
    return INSIGHT_PRELOCK_READY_TEMPLATES;
  }
  if (sourceKey.startsWith("prelock_remaining_")) {
    return INSIGHT_PRELOCK_REMAINING_TEMPLATES;
  }
  if (sourceKey.startsWith("prelock_activity_today_")) {
    return INSIGHT_PRELOCK_HEATING_TEMPLATES;
  }
  if (sourceKey === "postlock_top_champion") {
    return INSIGHT_POSTLOCK_CHAMPION_TEMPLATES;
  }
  if (sourceKey.startsWith("postlock_unique_champion_pick_")) {
    return INSIGHT_POSTLOCK_UNIQUE_TEMPLATES;
  }
  if (sourceKey.startsWith("postlock_no_champion_pick_")) {
    return INSIGHT_POSTLOCK_ABSENT_TEMPLATES;
  }
  if (sourceKey.startsWith("postlock_underdog_finalist_")) {
    return INSIGHT_POSTLOCK_UNDERDOG_TEMPLATES;
  }
  return null;
}

/**
 * Template-based AshBot one-liner for supported activity types.
 * Returns null when commentary text cannot be built (unsupported type, missing name, etc.).
 */
export function buildAshBotComment(
  item: PoolActivityFeedRow,
  context?: AshBotCommentaryContext,
  templateOffset = 0,
): string | null {
  const seed = activitySeed(item);

  switch (item.type) {
    case "participant_joined": {
      const name = participantName(item);
      if (!name) return null;
      return fill(pickTemplate(seed, JOIN_TEMPLATES, templateOffset), { name });
    }
    case "participant_submitted_picks": {
      const name = participantName(item);
      if (!name) return null;
      return fill(pickTemplate(seed, PICKS_MADE_TEMPLATES, templateOffset), { name });
    }
    case "participant_updated_picks": {
      const name = participantName(item);
      if (!name) return null;
      return fill(pickTemplate(seed, PICKS_UPDATED_TEMPLATES, templateOffset), {
        name,
      });
    }
    case "ash_daily_recap": {
      const counts = recapCounts(item, context);
      if (!counts || counts.total <= 0) return null;
      const { completed, total, remaining } = counts;
      const templates =
        remaining > 0 ? RECAP_INCOMPLETE_TEMPLATES : RECAP_COMPLETE_TEMPLATES;
      return fill(pickTemplate(seed, templates, templateOffset), {
        completed: String(completed),
        total: String(total),
        remaining: String(remaining),
      });
    }
    case "announcement":
      return pickTemplate(seed, ANNOUNCEMENT_TEMPLATES, templateOffset);
    case "pool_milestone": {
      const templates = milestoneTemplatesForSourceKey(milestoneSourceKey(item));
      if (!templates) return null;
      return pickTemplate(seed, templates, templateOffset);
    }
    case "pool_insight": {
      const templates = insightTemplatesForSourceKey(insightSourceKey(item));
      if (!templates) return null;
      return pickTemplate(seed, templates, templateOffset);
    }
    default:
      return null;
  }
}

function commentWithNearbyAvoidance(
  item: PoolActivityFeedRow,
  context: AshBotCommentaryContext | undefined,
  recentLines: readonly string[],
): string | null {
  const templates = templatesForItem(item);
  const maxOffset = templates
    ? Math.min(MAX_TEMPLATE_OFFSET, templates.length)
    : MAX_TEMPLATE_OFFSET;

  for (let offset = 0; offset <= maxOffset; offset++) {
    const candidate = buildAshBotComment(item, context, offset);
    if (!candidate) return null;
    if (!recentLines.includes(candidate)) return candidate;
  }

  const fallback = buildAshBotComment(item, context, 0);
  return fallback;
}

/**
 * Build AshBot lines for a rendered feed slice (newest-first).
 * Respects visibility rules and avoids repeating the same line on nearby cards.
 */
export function buildAshBotCommentsForFeed(
  items: PoolActivityFeedRow[],
  options: {
    ashbotEnabled?: boolean;
    liveRecapFacts?: RecapFacts | null;
    liveRecapDateYmd?: string | null;
  },
): Map<string, string> {
  const out = new Map<string, string>();
  if (options.ashbotEnabled === false || items.length === 0) return out;

  const latestRecapId =
    items.find((i) => i.type === "ash_daily_recap")?.id ?? null;
  const commentaryContext: AshBotCommentaryContext = {
    liveRecapFacts: options.liveRecapFacts,
    liveRecapDateYmd: options.liveRecapDateYmd,
  };
  const recentLines: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const visible = shouldShowAshBotComment(item, {
      items,
      itemIndex: i,
      latestRecapId,
      ashbotEnabled: true,
    });
    if (!visible) continue;

    const line = commentWithNearbyAvoidance(
      item,
      commentaryContext,
      recentLines.slice(0, NEARBY_DUPLICATE_WINDOW),
    );
    if (!line) continue;

    out.set(item.id, line);
    recentLines.unshift(line);
    if (recentLines.length > NEARBY_DUPLICATE_WINDOW) {
      recentLines.length = NEARBY_DUPLICATE_WINDOW;
    }
  }

  return out;
}
