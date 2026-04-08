/**
 * Public /rules page: display copy and fallback values for the **configured sample pool**
 * (`SAMPLE_POOL_ID` from `lib/config/sample-pool.ts`, or the sole pool with
 * published public rules when the configured id has no scoring rows — see fetcher
 * `solePublicPoolFallback`).
 *
 * ## Workflow for future edits
 * - **Wording** (ties / prize split text, prize intro, section blurbs): edit `PUBLIC_RULES_PAGE_COPY` below.
 * - **Default prize tiers / entry fee / group-stage point story** (when the DB omits them for
 *   the sample pool): edit `DEFAULT_*` constants.
 * - **Knockout / bonus point values on /rules**: prefer rows from `scoring_rules_public`.
 *   Fallback tables `PUBLIC_RULES_KNOCKOUT_ROWS` / `PUBLIC_RULES_BONUS_ROWS` apply only when
 *   the pool has no rows for those sections (empty DB edge case).
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
  exactPoints: 3,
  wrongSlotPoints: 1,
} as const;

/** Default Stage 2 points per correct best third-place advancer when the pool has no `third_place` scoring rows. */
export const DEFAULT_PUBLIC_RULES_STAGE2_CORRECT = 5;

/** Fallback knockout table only when `scoring_rules` has no knockout rows. */
export const PUBLIC_RULES_KNOCKOUT_ROWS: readonly {
  label: string;
  points: number;
}[] = [
  { label: "Round of 16", points: 4 },
  { label: "Quarter-finals", points: 8 },
  { label: "Semi-finals", points: 16 },
  { label: "Finalist", points: 24 },
  { label: "Champion", points: 32 },
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
  howPoolWorksLead:
    "This pool has three stages. Every point you earn adds to one total score.",
  stage1Title: "Stage 1 — First and second in each group",
  stage1Body:
    "Pick the team that finishes 1st and the team that finishes 2nd in every group.",
  stage2Title: "Stage 2 — Best third-place teams",
  stage2Body:
    "Pick eight teams you think will advance as the best third-place finishers. Order does not matter — you are only predicting who qualifies, not which bracket slot each lands in. FIFA places those teams into the real Round of 32; your list does not set matchups. You cannot pick the same nation twice across Stage 1 and Stage 2 (a group top-two pick cannot also be one of your eight third-place advancers).",
  stage2ScoringIntro:
    "Pick eight teams that advance as the best third-place finishers. You are not placing them into bracket positions — only predicting who qualifies.",
  stage2ScoringFollow:
    "After the group stage, FIFA assigns those sides to real knockout slots. You cannot pick the same nation twice across Stage 1 and Stage 2 (a group top-two pick cannot also be one of your eight third-place advancers).",
  stage3Title: "Stage 3 — Knockout bracket",
  stage3Body:
    "After the group stage, organizers publish the official Round of 32 bracket with real FIFA matchups. Once that bracket is live in the app, you fill Round of 32 through champion using those slots. Knockout scoring counts once per team you picked, based on how far that team actually goes in the tournament.",
  howYouScoreP1:
    "You earn points when your picks line up with real results. Group finishes, third-place advancers, knockout depth, and bonus categories all add into the same total.",
  howYouScoreP2:
    "Standings rank everyone by that single total.",
  lockingTitle: "When things lock",
  lockingP1:
    "Stages 1 and 2 (group 1st/2nd picks and your eight third-place advancers), plus bonus picks, are due by the pool’s lock time — usually before the first match.",
  lockingP2:
    "Stage 3 stays closed until organizers enter every official Round of 32 slot. After that, you can complete the knockout path while those picks still follow the published FIFA bracket.",
  knockoutScoringNote:
    "Knockout point values are listed for this pool in the table below. They are awarded once per team, using the furthest round that team reaches — not once per round pick.",
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
    "This pool does not list separate group-stage points on this page. Other scoring sections below still apply.",
  groupAdvanceZero:
    "0 points if the team does not finish in the top two in the group.",
  bonusIntro:
    "Tournament-wide picks — one team per category. Scoring values come from the table below (or from the database for this pool).",
} as const;

export type PublicRulesDisplayDefaultsOptions = {
  /**
   * Set when the fetcher had no rows for `SAMPLE_POOL_ID` and loaded the only pool
   * with rows in `scoring_rules_public` instead. That pool is what /rules is showing, so
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
