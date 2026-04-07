/**
 * Public /rules page: display copy and fallback values for the **configured sample pool**
 * (`SAMPLE_POOL_ID` from `lib/config/sample-pool.ts`, or the sole public pool when
 * the configured id has no scoring rows — see fetcher `solePublicPoolFallback`).
 *
 * ## Workflow for future edits
 * - **Wording** (ties / prize split text, prize intro, section blurbs): edit `PUBLIC_RULES_PAGE_COPY` below
 *   (includes third-place and knockout intros).
 * - **Default prize tiers / entry fee / group-stage point story** (when the DB omits them for
 *   the sample pool): edit `DEFAULT_*` constants. No migration or seed change required.
 * - **Knockout / third-place / bonus point values on /rules**: canonical copy in
 *   `PUBLIC_RULES_KNOCKOUT_ROWS`, `PUBLIC_RULES_BONUS_ROWS` (must stay aligned with
 *   `scoring_rules` for the sample pool).
 * - **Optional DB overrides** for the sample pool: `pools` columns (`entry_fee_cents`,
 *   `prize_distribution_json`, group advance columns, `tie_break_note`) still win when set;
 *   defaults fill only missing pieces.
 */

import { poolIdsMatchConfiguredSample } from "../config/sample-pool";
import type {
  PoolPrizeTier,
  SamplePoolScoringRulesPayload,
} from "../../types/publicScoringRules";

/** Shown when the payload has no `tie_break_note` (non-sample pools or empty DB). */
export const PUBLIC_RULES_DEFAULT_TIE_BREAK = `If two or more users finish with the same total score, the prize money for the tied positions is combined and split equally among those tied users.

Examples:
• If two users tie for 1st, they split 1st and 2nd prize money evenly.
• If three users tie across 2nd to 4th, they split the combined 2nd, 3rd, and 4th prize money evenly.`;

export const DEFAULT_PUBLIC_RULES_ENTRY_FEE_CENTS = 2500;

export const DEFAULT_PUBLIC_RULES_PRIZE_TIERS: readonly PoolPrizeTier[] = [
  { place: 1, label: "1st place", percent: 50 },
  { place: 2, label: "2nd place", percent: 25 },
  { place: 3, label: "3rd place", percent: 15 },
  { place: 4, label: "4th place", percent: 10 },
];

export const DEFAULT_PUBLIC_RULES_GROUP_ADVANCE = {
  exactPoints: 5,
  wrongSlotPoints: 2.5,
} as const;

/** Knockout progression rows shown on /rules (Round of 32 is a pick step but not listed here). */
export const PUBLIC_RULES_KNOCKOUT_ROWS: readonly {
  label: string;
  points: number;
}[] = [
  { label: "Round of 16", points: 5 },
  { label: "Quarterfinalist", points: 10 },
  { label: "Semifinalist", points: 20 },
  { label: "Finalist", points: 50 },
  { label: "Champion", points: 100 },
];

export const PUBLIC_RULES_BONUS_ROWS: readonly {
  label: string;
  points: number;
}[] = [
  { label: "Team with the most goals", points: 50 },
  { label: "Team with the most yellow cards", points: 10 },
  { label: "Team with the most red cards", points: 10 },
];

export const PUBLIC_RULES_PAGE_COPY = {
  howYouScoreP1:
    "You earn points when your picks match actual tournament results. Points are awarded across the Group Stage, Third Place Qualification, Knockout Rounds, and Bonus Picks.",
  howYouScoreP2:
    "All points combine into one total score, and standings are based on that total.",
  entryPerPersonNote:
    "One entry per person unless the organizer says otherwise.",
  entryUnknownFee:
    "No entry fee is listed on this page. Ask the organizer if you are unsure what to pay or how to pay.",
  prizeIntro: "Payouts are a percentage of the total prize pool.",
  prizeNotPublished:
    "The prize breakdown is not published here yet. Ask the host how the pot is split.",
  groupPerKindIntro:
    "Points per correct group finishing position for this pool:",
  groupNoTableCopy:
    "This pool does not list separate group-stage points on this page. Knockout and bonus scoring below still apply.",
  knockoutIntro:
    "Each row is a one-time score when that team reaches the round. Points are awarded once and do not carry forward.",
  thirdPlaceIntro:
    "Pick the 8 national teams that will advance as the best third-place finishers. You are not predicting which bracket slot each one gets — only that they qualify.",
  thirdPlacePointsLine:
    "3 points for each correct team (any of your eight slots); 0 points if the team does not advance.",
  bonusIntro:
    "Separate questions tied to the whole tournament. You pick one team per category.",
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
 * and ties copy when the database left them empty. Other pools are unchanged.
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
    return `${name} — ${tier.percent}% of the total prize pool (remainder)`;
  }
  if (tier.remainder) {
    return `${name} — the rest of the total prize pool after the places above`;
  }
  if (typeof tier.percent === "number") {
    return `${name} — ${tier.percent}% of the total prize pool`;
  }
  return name;
}
