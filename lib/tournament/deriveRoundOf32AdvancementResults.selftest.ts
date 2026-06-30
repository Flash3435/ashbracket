/**
 * Run: npx tsx lib/tournament/deriveRoundOf32AdvancementResults.selftest.ts
 */
import assert from "node:assert/strict";
import {
  buildRoundOf32AdvancementResultInserts,
  isOfficialFinishedKnockoutMatchWithWinner,
  wc2026R32MatchIndexFromCode,
  type KnockoutMatchForAdvancement,
} from "./deriveRoundOf32AdvancementResults";

const editionId = "edition-wc2026";
const r32StageId = "stage-r32";
const r16StageId = "stage-r16";
const resolvedAt = "2026-07-01T22:00:00.000Z";

function resultSlotKey(
  stageId: string,
  kind: string,
  groupCode: string | null,
  slotKey: string | null,
): string {
  return [stageId, kind, groupCode ?? "", slotKey ?? ""].join("\0");
}

function r32Match(
  overrides: Partial<KnockoutMatchForAdvancement> & Pick<KnockoutMatchForAdvancement, "match_code">,
): KnockoutMatchForAdvancement {
  return {
    stage_code: "round_of_32",
    home_team_id: "team-home",
    away_team_id: "team-away",
    home_goals: 2,
    away_goals: 1,
    winner_team_id: "team-home",
    status: "finished",
    scoring_result_kind: null,
    scoring_stage_code: null,
    ...overrides,
  };
}

assert.equal(wc2026R32MatchIndexFromCode("M73"), 0);
assert.equal(wc2026R32MatchIndexFromCode("m88"), 15);
assert.equal(wc2026R32MatchIndexFromCode("M72"), null);

assert.equal(
  isOfficialFinishedKnockoutMatchWithWinner({
    status: "finished",
    winner_team_id: "team-home",
    home_goals: 1,
    away_goals: 0,
  }),
  true,
);
assert.equal(
  isOfficialFinishedKnockoutMatchWithWinner({
    status: "live",
    winner_team_id: "team-home",
    home_goals: 1,
    away_goals: 0,
  }),
  false,
);
assert.equal(
  isOfficialFinishedKnockoutMatchWithWinner({
    status: "finished",
    winner_team_id: null,
    home_goals: 1,
    away_goals: 1,
  }),
  false,
);

// Finished R32 fixture with home winner → round_of_32 slot 1 + round_of_16 slot 1
{
  const rows = buildRoundOf32AdvancementResultInserts({
    editionId,
    matches: [r32Match({ match_code: "M73" })],
    roundOf32StageId: r32StageId,
    roundOf16StageId: r16StageId,
    resolvedAtIso: resolvedAt,
    lockedKeys: new Set(),
    resultSlotKey,
  });
  assert.equal(rows.length, 2);
  const r32 = rows.find((r) => r.kind === "round_of_32");
  const r16 = rows.find((r) => r.kind === "round_of_16");
  assert.equal(r32?.team_id, "team-home");
  assert.equal(r32?.slot_key, "1");
  assert.equal(r16?.team_id, "team-home");
  assert.equal(r16?.slot_key, "1");
}

// Away winner uses bottom bracket slot (M76 → slots 7/8, away wins → slot 8, R16 slot 4)
{
  const rows = buildRoundOf32AdvancementResultInserts({
    editionId,
    matches: [
      r32Match({
        match_code: "M76",
        home_team_id: "team-bra",
        away_team_id: "team-jpn",
        winner_team_id: "team-jpn",
        home_goals: 0,
        away_goals: 1,
      }),
    ],
    roundOf32StageId: r32StageId,
    roundOf16StageId: r16StageId,
    resolvedAtIso: resolvedAt,
    lockedKeys: new Set(),
    resultSlotKey,
  });
  const r32 = rows.find((r) => r.kind === "round_of_32");
  const r16 = rows.find((r) => r.kind === "round_of_16");
  assert.equal(r32?.slot_key, "8");
  assert.equal(r16?.slot_key, "4");
  assert.equal(r32?.team_id, "team-jpn");
}

// Scheduled / live fixtures are skipped
{
  const rows = buildRoundOf32AdvancementResultInserts({
    editionId,
    matches: [
      r32Match({ match_code: "M74", status: "scheduled", winner_team_id: null, home_goals: null, away_goals: null }),
      r32Match({ match_code: "M75", status: "live", winner_team_id: "team-home" }),
    ],
    roundOf32StageId: r32StageId,
    roundOf16StageId: r16StageId,
    resolvedAtIso: resolvedAt,
    lockedKeys: new Set(),
    resultSlotKey,
  });
  assert.equal(rows.length, 0);
}

// Finished without winner (draw pending pens) is skipped
{
  const rows = buildRoundOf32AdvancementResultInserts({
    editionId,
    matches: [
      r32Match({
        match_code: "M77",
        home_goals: 1,
        away_goals: 1,
        winner_team_id: null,
      }),
    ],
    roundOf32StageId: r32StageId,
    roundOf16StageId: r16StageId,
    resolvedAtIso: resolvedAt,
    lockedKeys: new Set(),
    resultSlotKey,
  });
  assert.equal(rows.length, 0);
}

// Penalty winner counts when winner_team_id is set
{
  const rows = buildRoundOf32AdvancementResultInserts({
    editionId,
    matches: [
      r32Match({
        match_code: "M73",
        home_goals: 1,
        away_goals: 1,
        winner_team_id: "team-away",
        home_team_id: "team-home",
        away_team_id: "team-away",
      }),
    ],
    roundOf32StageId: r32StageId,
    roundOf16StageId: r16StageId,
    resolvedAtIso: resolvedAt,
    lockedKeys: new Set(),
    resultSlotKey,
  });
  assert.equal(rows.find((r) => r.kind === "round_of_32")?.team_id, "team-away");
  assert.equal(rows.find((r) => r.kind === "round_of_32")?.slot_key, "2");
}

// Locked admin override is preserved
{
  const lockedKeys = new Set([
    resultSlotKey(r32StageId, "round_of_32", null, "1"),
  ]);
  const rows = buildRoundOf32AdvancementResultInserts({
    editionId,
    matches: [r32Match({ match_code: "M73" })],
    roundOf32StageId: r32StageId,
    roundOf16StageId: r16StageId,
    resolvedAtIso: resolvedAt,
    lockedKeys,
    resultSlotKey,
  });
  assert.equal(rows.filter((r) => r.kind === "round_of_32").length, 0);
  assert.equal(rows.filter((r) => r.kind === "round_of_16").length, 1);
}

// Matches with scoring_* metadata use the generic sync path only
{
  const rows = buildRoundOf32AdvancementResultInserts({
    editionId,
    matches: [
      r32Match({
        match_code: "M73",
        scoring_result_kind: "round_of_16",
        scoring_stage_code: "round_of_16",
      }),
    ],
    roundOf32StageId: r32StageId,
    roundOf16StageId: r16StageId,
    resolvedAtIso: resolvedAt,
    lockedKeys: new Set(),
    resultSlotKey,
  });
  assert.equal(rows.length, 0);
}

// No duplicate rows when called for the same finished match twice in one batch
{
  const rows = buildRoundOf32AdvancementResultInserts({
    editionId,
    matches: [r32Match({ match_code: "M73" }), r32Match({ match_code: "M73" })],
    roundOf32StageId: r32StageId,
    roundOf16StageId: r16StageId,
    resolvedAtIso: resolvedAt,
    lockedKeys: new Set(),
    resultSlotKey,
  });
  assert.equal(rows.filter((r) => r.kind === "round_of_32").length, 1);
  assert.equal(rows.filter((r) => r.kind === "round_of_16").length, 1);
}

console.log("deriveRoundOf32AdvancementResults.selftest.ts: ok");
