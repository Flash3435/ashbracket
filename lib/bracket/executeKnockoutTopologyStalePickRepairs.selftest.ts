/**
 * Self-test: `npx tsx lib/bracket/executeKnockoutTopologyStalePickRepairs.selftest.ts`
 */
import assert from "node:assert";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import {
  auditKnockoutTopologyStalePicks,
} from "./auditKnockoutTopologyStalePicks";
import {
  applyTopologyStalePickClear,
  executeTopologyStalePickRepairs,
} from "./executeKnockoutTopologyStalePickRepairs";
import {
  dedupeStaleFindingsForRepair,
  planClearsFromStaleFindings,
  repairPlanFingerprint,
  type TopologyStalePickRepairAction,
} from "./planKnockoutTopologyStalePickRepairs";

function sfSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `semifinalist|${slotKey}`,
    sectionLabel: "SF",
    slotLabel: slotKey,
    predictionKind: "semifinalist",
    tournamentStageId: "sf-stage",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

function finSlot(slotKey: string, teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: `finalist|${slotKey}`,
    sectionLabel: "F",
    slotLabel: slotKey,
    predictionKind: "finalist",
    tournamentStageId: "final-stage",
    slotKey,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

function champSlot(teamId = ""): KnockoutPickSlotDraft {
  return {
    rowKey: "champion|",
    sectionLabel: "C",
    slotLabel: "Champion",
    predictionKind: "champion",
    tournamentStageId: "final-stage",
    slotKey: null,
    groupCode: null,
    bonusKey: null,
    teamId,
  };
}

const names: Record<string, string> = {
  "team-fra": "France",
  "team-esp": "Spain",
  "team-bra": "Brazil",
};

function planFranceSpain(): {
  slots: KnockoutPickSlotDraft[];
  actions: TopologyStalePickRepairAction[];
} {
  const slots = [
    sfSlot("1", "team-fra"),
    sfSlot("2", "team-esp"),
    finSlot("1", "team-fra"),
    finSlot("2", "team-esp"),
    champSlot("team-esp"),
  ];
  const audit = auditKnockoutTopologyStalePicks({
    slots,
    teamName: (id) => names[id] ?? id,
  });
  const actions = planClearsFromStaleFindings({
    poolId: "pool-1",
    poolName: "Test Pool",
    participantId: "participant-1",
    participantName: "Test User",
    participantEmail: null,
    slots,
    staleFindings: dedupeStaleFindingsForRepair(audit.stalePicks),
  });
  return { slots, actions };
}

type StoredPrediction = {
  pool_id: string;
  participant_id: string;
  prediction_kind: string;
  tournament_stage_id: string;
  slot_key: string | null;
  team_id: string;
};

function createMockSupabase(initialRows: StoredPrediction[]) {
  const rows = [...initialRows];
  const deletes: StoredPrediction[] = [];

  const client = {
    from(table: string) {
      assert.strictEqual(table, "predictions");
      const filters: Record<string, unknown> = {};
      const chain = {
        delete() {
          return chain;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return chain;
        },
        is(column: string, value: unknown) {
          filters[column] = value;
          return chain;
        },
        then(
          resolve: (value: { error: null }) => void,
          reject?: (reason: unknown) => void,
        ) {
          try {
            const remaining: StoredPrediction[] = [];
            for (const row of rows) {
              const matches =
                row.pool_id === filters.pool_id &&
                row.participant_id === filters.participant_id &&
                row.prediction_kind === filters.prediction_kind &&
                row.tournament_stage_id === filters.tournament_stage_id &&
                (filters.slot_key === undefined
                  ? true
                  : filters.slot_key === null
                    ? row.slot_key === null
                    : row.slot_key === filters.slot_key);
              if (matches) {
                deletes.push(row);
              } else {
                remaining.push(row);
              }
            }
            rows.length = 0;
            rows.push(...remaining);
            resolve({ error: null });
          } catch (error) {
            reject?.(error);
          }
        },
      };
      return chain;
    },
  };

  return {
    client: client as unknown as Parameters<
      typeof executeTopologyStalePickRepairs
    >[0]["client"],
    rows,
    deletes,
  };
}

function rowsFromSlots(
  slots: KnockoutPickSlotDraft[],
): StoredPrediction[] {
  return slots
    .filter((slot) => slot.teamId.trim())
    .map((slot) => ({
      pool_id: "pool-1",
      participant_id: "participant-1",
      prediction_kind: slot.predictionKind,
      tournament_stage_id: slot.tournamentStageId,
      slot_key: slot.slotKey,
      team_id: slot.teamId,
    }));
}

async function main(): Promise<void> {
  // Dry run performs no writes.
  {
    const { slots, actions } = planFranceSpain();
    const mock = createMockSupabase(rowsFromSlots(slots));
    const result = await executeTopologyStalePickRepairs({
      client: mock.client,
      actions,
      mode: "dry_run",
      replan: async () => ({ fingerprint: "unused" }),
    });
    assert.strictEqual(result.clearedCount, 0);
    assert.strictEqual(mock.deletes.length, 0);
    assert.strictEqual(mock.rows.length, slots.filter((s) => s.teamId).length);
  }

  // Apply clears only the stale slots.
  {
    const { slots, actions } = planFranceSpain();
    const mock = createMockSupabase(rowsFromSlots(slots));
    const staleKeys = new Set(
      actions.map((a) => `${a.predictionKind}|${a.slotKey ?? ""}`),
    );

    const result = await executeTopologyStalePickRepairs({
      client: mock.client,
      actions,
      mode: "apply",
      replan: async () => ({
        fingerprint: repairPlanFingerprint(actions),
      }),
    });

    assert.ok(result.clearedCount > 0);
    assert.strictEqual(mock.deletes.length, actions.length);
    for (const row of mock.rows) {
      const key = `${row.prediction_kind}|${row.slot_key ?? ""}`;
      assert.ok(!staleKeys.has(key), `stale row should be cleared: ${key}`);
    }
    assert.ok(mock.rows.some((row) => row.prediction_kind === "semifinalist"));
    assert.strictEqual(
      mock.rows.filter((row) => row.prediction_kind === "finalist").length,
      0,
    );
    assert.strictEqual(
      mock.rows.filter((row) => row.prediction_kind === "champion").length,
      0,
    );
  }

  // applyTopologyStalePickClear targets one row.
  {
    const { slots, actions } = planFranceSpain();
    const action = actions[0];
    const mock = createMockSupabase(rowsFromSlots(slots));
    const before = mock.rows.length;
    await applyTopologyStalePickClear(mock.client, action);
    assert.strictEqual(mock.deletes.length, 1);
    assert.strictEqual(mock.rows.length, before - 1);
  }

  console.log("executeKnockoutTopologyStalePickRepairs.selftest.ts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
