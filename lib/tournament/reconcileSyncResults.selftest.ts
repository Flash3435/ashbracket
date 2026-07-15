import assert from "node:assert/strict";
import {
  planSyncResultReconcile,
  resultLogicalKey,
} from "./reconcileSyncResults";

{
  const stage = "stage-ko";
  const keySf = resultLogicalKey(stage, "semifinalist", null, "M102");
  const keyFin = resultLogicalKey(stage, "finalist", null, "M103");
  const existing = [
    {
      id: "id-sf",
      tournament_stage_id: stage,
      kind: "semifinalist",
      team_id: "arg",
      group_code: null,
      slot_key: "M102",
      resolved_at: "2026-07-12T00:00:00Z",
    },
  ];
  const desired = new Map([
    [
      keySf,
      {
        edition_id: "ed",
        tournament_stage_id: stage,
        kind: "semifinalist",
        team_id: "arg",
        group_code: null,
        slot_key: "M102",
        resolved_at: "2026-07-15T00:00:00Z",
        source: "sync" as const,
        locked: false,
      },
    ],
    [
      keyFin,
      {
        edition_id: "ed",
        tournament_stage_id: stage,
        kind: "finalist",
        team_id: "arg",
        group_code: null,
        slot_key: "M103",
        resolved_at: "2026-07-15T00:00:00Z",
        source: "sync" as const,
        locked: false,
      },
    ],
  ]);
  const plan = planSyncResultReconcile({
    existingSyncUnlocked: existing,
    desiredByKey: desired,
    lockedKeys: new Set(),
  });
  assert.equal(plan.reusedIds.length, 1);
  assert.equal(plan.reusedIds[0], "id-sf");
  assert.equal(
    plan.toUpdate.length,
    0,
    "resolved_at-only change does not rewrite when team is unchanged",
  );
  assert.equal(plan.toInsert.length, 1, "new finalist slot inserts");
  assert.equal(plan.toDeleteIds.length, 0);
}

{
  const stage = "stage-ko";
  const keyOld = resultLogicalKey(stage, "semifinalist", null, "gone");
  const plan = planSyncResultReconcile({
    existingSyncUnlocked: [
      {
        id: "obsolete",
        tournament_stage_id: stage,
        kind: "semifinalist",
        team_id: "x",
        group_code: null,
        slot_key: "gone",
        resolved_at: null,
      },
    ],
    desiredByKey: new Map(),
    lockedKeys: new Set(),
  });
  assert.deepEqual(plan.toDeleteIds, ["obsolete"]);
  assert.equal(keyOld.split("\0")[1], "semifinalist");
}

{
  const stage = "stage-ko";
  const keySf = resultLogicalKey(stage, "semifinalist", null, "M102");
  const plan = planSyncResultReconcile({
    existingSyncUnlocked: [
      {
        id: "id-sf",
        tournament_stage_id: stage,
        kind: "semifinalist",
        team_id: "eng",
        group_code: null,
        slot_key: "M102",
        resolved_at: "old",
      },
    ],
    desiredByKey: new Map([
      [
        keySf,
        {
          edition_id: "ed",
          tournament_stage_id: stage,
          kind: "semifinalist",
          team_id: "arg",
          group_code: null,
          slot_key: "M102",
          resolved_at: "new",
          source: "sync" as const,
          locked: false,
        },
      ],
    ]),
    lockedKeys: new Set(),
  });
  assert.equal(plan.toUpdate.length, 1);
  assert.equal(plan.toUpdate[0]?.patch.team_id, "arg");
  assert.equal(plan.toInsert.length, 0);
}

{
  const stage = "s";
  const key = resultLogicalKey(stage, "finalist", null, "1");
  const row = {
    edition_id: "ed",
    tournament_stage_id: stage,
    kind: "finalist",
    team_id: "esp",
    group_code: null,
    slot_key: "1",
    resolved_at: "t1",
    source: "sync" as const,
    locked: false,
  };
  const plan1 = planSyncResultReconcile({
    existingSyncUnlocked: [],
    desiredByKey: new Map([[key, row]]),
    lockedKeys: new Set(),
  });
  assert.equal(plan1.toInsert.length, 1);
  const plan2 = planSyncResultReconcile({
    existingSyncUnlocked: [
      {
        id: "stable-uuid",
        tournament_stage_id: stage,
        kind: "finalist",
        team_id: "esp",
        group_code: null,
        slot_key: "1",
        resolved_at: "t1",
      },
    ],
    desiredByKey: new Map([[key, row]]),
    lockedKeys: new Set(),
  });
  assert.equal(plan2.toInsert.length, 0);
  assert.equal(plan2.toUpdate.length, 0);
  assert.equal(plan2.toDeleteIds.length, 0);
  assert.deepEqual(plan2.reusedIds, ["stable-uuid"]);
}

console.log("reconcileSyncResults.selftest.ts: ok");
