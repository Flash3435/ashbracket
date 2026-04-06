/**
 * Public /rules page: display copy and fallback values for the **configured sample pool**
 * (`SAMPLE_POOL_ID` from `lib/config/sample-pool.ts`, or the sole public pool when
 * the configured id has no scoring rows — see fetcher `solePublicPoolFallback`).
 *
 * ## Workflow for future edits
 * - **Wording** (tie-break text, prize intro, section blurbs): edit `PUBLIC_RULES_PAGE_COPY` below.
 * - **Default prize tiers / entry fee / group-stage point story** (when the DB omits them for
 *   the sample pool): edit `DEFAULT_*` constants. No migration or seed change required.
 * - **Point values in tables** (knockout, bonus, etc.): still come from `scoring_rules` via
 *   `scoring_rules_public` — change those in the DB or seed when scoring should change.
 * - **Optional DB overrides** for the sample pool: `pools` columns (`entry_fee_cents`,
 *   `prize_distribution_json`, group advance columns, `tie_break_note`) still win when set;
 *   defaults fill only missing pieces.
 */

import { poolIdsMatchConfiguredSample } from "../config/sample-pool";
import type {
  PoolPrizeTier,
  SamplePoolScoringRulesPayload,
} from "../../types/publicScoringRules";

/** Shown when the payload has no tie-break note (non-sample pools or empty DB). */
export const PUBLIC_RULES_DEFAULT_TIE_BREAK =
  "If total points are tied, the organizer decides the tie-break rule.";

export const DEFAULT_PUBLIC_RULES_ENTRY_FEE_CENTS = 2500;

export const DEFAULT_PUBLIC_RULES_PRIZE_TIERS: readonly PoolPrizeTier[] = [
  { place: 1, label: "1st place", percent: 50 },
  { place: 2, label: "2nd place", percent: 25 },
  { place: 3, label: "3rd place", percent: 15 },
  {
    place: 4,
    label: "4th place",
    percent: 10,
    remainder: true,
  },
];

export const DEFAULT_PUBLIC_RULES_GROUP_ADVANCE = {
  exactPoints: 5,
  wrongSlotPoints: 2.5,
} as const;

export const PUBLIC_RULES_PAGE_COPY = {
  howYouScoreP1:
    "You earn points when your picks match what actually happens in the tournament. After each stage, official results are compared to your bracket — you do not need to do anything once your picks are in.",
  howYouScoreP2:
    "Points from the group stage, knockout rounds, and bonus questions all add up to your total. The standings page shows everyone ranked by that total.",
  entryPerPersonNote:
    "One entry per person unless the organizer says otherwise.",
  entryUnknownFee:
    "No entry fee is listed on this page. Ask the organizer if you are unsure what to pay or how to pay.",
  prizeIntro:
    "Payouts are a percentage of the prize pool (usually the total collected entry fees, unless the organizer keeps a portion for costs and says so). The exact dollar amounts depend on how many paid entries there are.",
  prizeNotPublished:
    "The prize breakdown is not published here yet. Ask the host how the pot is split.",
  groupPerKindIntro:
    "Points per correct group finishing position for this pool:",
  groupNoTableCopy:
    "This pool does not list separate group-stage points on this page. Knockout and bonus scoring below still apply.",
  knockoutIntro:
    "Each row is a one-time score when that team reaches the round — for example you get quarter-finalist points once when they make the quarter-finals, not again in later rounds.",
  knockoutUnpublished:
    "Knockout point values are not published here yet.",
  bonusIntro:
    "Separate questions tied to the whole tournament (for example most goals). You pick one team per bonus; points apply if your team wins that stat when the organizer locks the result.",
  bonusUnpublished:
    "No bonus questions are published for this pool yet.",
} as const;

export type PublicRulesDisplayDefaultsOptions = {
  /**
   * Set when the fetcher had no rows for `SAMPLE_POOL_ID` and loaded the only public
   * pool from `scoring_rules_public` instead. That pool is what /rules is showing, so
   * empty display fields (e.g. prize JSON) should still get app defaults.
   */
  solePublicPoolFallback?: boolean;
};

export function shouldApplyPublicRulesDisplayDefaults(
  poolId: string,
  opts?: PublicRulesDisplayDefaultsOptions,
): boolean {
  if (opts?.solePublicPoolFallback) return true;
  return poolIdsMatchConfiguredSample(poolId);
}

type RulesPageMeta = Pick<
  SamplePoolScoringRulesPayload,
  | "poolName"
  | "lockAt"
  | "entryFeeCents"
  | "prizeTiers"
  | "groupAdvance"
  | "tieBreakNote"
>;

/**
 * For the configured sample pool only: fills entry fee, prize tiers, group-stage summary,
 * and tie-break copy when the database left them empty. Other pools are unchanged.
 */
export function applyPublicRulesDisplayDefaults(
  poolId: string,
  meta: RulesPageMeta,
  opts?: PublicRulesDisplayDefaultsOptions,
): RulesPageMeta {
  if (!shouldApplyPublicRulesDisplayDefaults(poolId, opts)) {
    return meta;
  }

  return {
    ...meta,
    entryFeeCents: meta.entryFeeCents ?? DEFAULT_PUBLIC_RULES_ENTRY_FEE_CENTS,
    prizeTiers:
      meta.prizeTiers.length > 0
        ? meta.prizeTiers
        : [...DEFAULT_PUBLIC_RULES_PRIZE_TIERS],
    groupAdvance: meta.groupAdvance ?? {
      exactPoints: DEFAULT_PUBLIC_RULES_GROUP_ADVANCE.exactPoints,
      wrongSlotPoints: DEFAULT_PUBLIC_RULES_GROUP_ADVANCE.wrongSlotPoints,
    },
    tieBreakNote: meta.tieBreakNote ?? PUBLIC_RULES_DEFAULT_TIE_BREAK,
  };
}

/** One-line prize tier description for the /rules list (uses tier labels from DB or defaults). */
export function describePrizeTier(tier: PoolPrizeTier): string {
  const name = tier.label;
  if (tier.remainder && typeof tier.percent === "number") {
    return `${name} — remaining ${tier.percent}% of the prize pool`;
  }
  if (tier.remainder) {
    return `${name} — the rest of the prize pool after the places above`;
  }
  if (typeof tier.percent === "number") {
    if (tier.place === 1) {
      return `${name} — ${tier.percent}% of the prize pool`;
    }
    return `${name} — ${tier.percent}%`;
  }
  return name;
}
