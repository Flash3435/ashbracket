/**
 * Future: derive official `results` rows for `round_of_32` (and third-place slot
 * assignments) from finalized group-stage `results` using FIFA’s third-place
 * combination table for this edition.
 *
 * Today, organizers enter the official Round of 32 bracket manually in Admin → Results
 * (or via sync). `official_round_of_32_complete` unlocks participant knockout picks
 * once all 32 `round_of_32` slots have `team_id` set.
 *
 * When implementing generation here, prefer:
 * - Reading group winners / runners-up / third-place finishers from `results`
 * - Writing deterministic `results` rows for `kind = round_of_32` with the pool’s
 *   canonical `slot_key` ordering (`"1"` … `"32"` from `knockoutResultsConfig`)
 * - Keeping third-place *qualifiers* (`kind = third_place_qualifier`) separate from
 *   bracket slot assignment
 */
export const ROUND_OF_32_GENERATION_SCAFFOLD_NOTE =
  "Implement FIFA combination mapping from group results to R32 slot keys; then upsert results.";
