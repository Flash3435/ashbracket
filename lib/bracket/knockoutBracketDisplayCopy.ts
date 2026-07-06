/** Shown on the champion card when knockout picks exist but no champion row is saved. */
export const NO_CHAMPION_PICK_SAVED_LABEL = "No champion pick saved";

/** Muted empty slot in live bracket tracker (no team known yet). */
export const NO_SAVED_PICK_BRACKET_LABEL = "No saved pick";

/** Waiting on upstream fixture when a matchup is not fully known. */
export const AWAITING_RESULT_BRACKET_LABEL = "Awaiting result";

/** Compact badge when an official advancer was not the participant's saved pick. */
export const NOT_YOUR_PICK_BADGE_LABEL = "Not your pick";

/** Saved pick is out of the official match slot — not a wrong upstream bracket path. */
export const WRONG_PATH_PICK_BADGE_LABEL = "Pick out";

/** Tooltip for official advancers the participant did not pick. */
export const OFFICIAL_ADVANCED_NOT_YOUR_PICK_TOOLTIP =
  "This team advanced officially, but was not one of your saved picks.";

/** Tooltip for genuinely empty participant slots in the tracker. */
export const NO_SAVED_PICK_BRACKET_TOOLTIP =
  "You have not saved a pick for this slot yet.";

/** Helper under M104 when feeder teams are shown but champion is unsaved. */
export const FINAL_FEEDER_NO_CHAMPION_HELPER =
  "Final teams are based on your semi-final picks. No champion pick saved yet.";

/** Participant/admin copy when saved SF+ picks are impossible after topology correction. */
export const TOPOLOGY_STALE_PICKS_REVIEW_HEADLINE = "Bracket correction needed";

export const TOPOLOGY_STALE_PICKS_REVIEW_BODY =
  "Some saved semifinal-winner, final, or champion picks no longer match FIFA's official bracket path after a bracket correction. Please review these picks.";

/** Admin panel intro — does not blame the participant. */
export const TOPOLOGY_STALE_PICKS_ADMIN_INTRO =
  "Some participants have saved semifinal-winner (finalist slot), final, or champion picks that cannot be valid under FIFA's corrected semi-final feeders (M101 = M97+M98, M102 = M99+M100). Missing-only picks are listed separately and are not cleared by the topology repair script.";

/** Admin note when M101/M102 matchup rows are fine but finalist slots were cleared. */
export const TOPOLOGY_STALE_PICKS_ADMIN_M101_M102_NOTE =
  "The displayed M101/M102 matchup rows are valid, but some saved semifinal-winner/finalist selections were cleared because they no longer fit the corrected FIFA path.";

/** Audit/repair JSON note — finalist slots are semifinal-winner picks. */
export const TOPOLOGY_STALE_FINALIST_SLOTS_EXPLANATION =
  "Finalist slots (predictionKind=finalist) store M101/M102 semifinal-winner picks. The dedicated M101/M102 matchup audit reports wrong-branch displayed semifinal matchup picks separately; this topology report covers stale semifinal-winner/finalist and champion selections users may need to remake.";

/** Repair script dry-run label. */
export const TOPOLOGY_STALE_PICKS_REPAIR_DRY_RUN_LABEL =
  "Dry run — no predictions were changed.";

/** List/admin section title for `predictionKind === "finalist"` rows (SF match winners). */
export const SEMI_FINAL_WINNER_SECTION_TITLE = "Semi-final winners";

/** List/admin section subtitle for `finalist` progression slots. */
export const SEMI_FINAL_WINNER_SECTION_SUBTITLE =
  "Teams picked to reach the Final";
