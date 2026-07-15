import assert from "node:assert/strict";
import { validateKnockoutLedgerPayload } from "./validateKnockoutLedgerPayload";

{
  const ok = validateKnockoutLedgerPayload({
    rows: [
      {
        participant_id: "p1",
        points_delta: 8,
        prediction_kind: "quarterfinalist",
        prediction_id: "pred1",
        result_id: "r1",
      },
      {
        participant_id: "p1",
        points_delta: 3,
        prediction_kind: "group_winner",
        prediction_id: "g1",
        result_id: "rg1",
      },
    ],
    resultTeamIdById: new Map([
      ["r1", "team-a"],
      ["rg1", "team-a"],
    ]),
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.knockoutRowCount, 1);
  assert.equal(ok.pointsByCategory.knockout_progression, 8);
  assert.equal(ok.pointsByCategory.group, 3);
}

{
  const bad = validateKnockoutLedgerPayload({
    rows: [
      {
        participant_id: "p1",
        points_delta: 8,
        prediction_kind: "quarterfinalist",
        prediction_id: "pred1",
        result_id: "r1",
      },
      {
        participant_id: "p1",
        points_delta: 8,
        prediction_kind: "quarterfinalist",
        prediction_id: "pred1b",
        result_id: "r2",
      },
    ],
    resultTeamIdById: new Map([
      ["r1", "team-a"],
      ["r2", "team-a"],
    ]),
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.error?.includes("duplicate"));
  assert.equal(bad.duplicateParticipantTeamKeys.length, 1);
}

console.log("validateKnockoutLedgerPayload.selftest.ts: ok");
