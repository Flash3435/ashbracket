/**
 * FIFA Annex C → official `round_of_32` `results` rows is implemented as:
 * - `lib/tournament/worldcup2026ThirdPlaceMapping.ts` — typed mapping + resolver
 * - `lib/admin/officialRoundOf32FromResults.ts` — builds 32 upsert rows from DB-shaped inputs
 * - Admin → Results: **Apply FIFA Round of 32** control (server action) runs the resolver
 *   after group winners, runners-up, and eight third-place advancers exist in `results`.
 *
 * `official_round_of_32_complete` still unlocks participant Stage 3 once all 32
 * `round_of_32` slots have `team_id` (whether filled manually or via the resolver).
 */
export const ROUND_OF_32_GENERATION_SCAFFOLD_NOTE =
  "Use applyOfficialRoundOf32FromEnteredResultsAction (Admin → Results) or lib/admin/officialRoundOf32FromResults.ts.";
