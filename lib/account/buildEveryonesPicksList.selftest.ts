import assert from "node:assert";
import {
  buildEveryonesPicksList,
  participantBracketSnapshotHref,
} from "./buildEveryonesPicksList";
import type { PoolMembershipCompletionStatus } from "../picks/poolMembershipCompletionStatus";

const participantRows = [
  { id: "p-complete", display_name: "Alice" },
  { id: "p-incomplete", display_name: "Bob" },
];

function completionStatus(
  partial: Partial<PoolMembershipCompletionStatus> &
    Pick<PoolMembershipCompletionStatus, "isComplete">,
): PoolMembershipCompletionStatus {
  return {
    requiredSections: [],
    completedSections: [],
    missingSections: [],
    missingPickKeys: [],
    displaySummary: "",
    sections: partial.sections ?? [],
    knockoutBracketPicksUnlocked: true,
    ...partial,
  };
}

// Unlocked pool: no participant list exposed
{
  const list = buildEveryonesPicksList({
    locked: false,
    participantRows,
    completeParticipantIds: ["p-complete"],
    championByParticipantId: new Map([
      ["p-complete", { teamName: "Brazil", teamCode: "BRA" }],
    ]),
  });
  assert.strictEqual(list.length, 0);
}

// Locked pool: participants visible with snapshot links
{
  const list = buildEveryonesPicksList({
    locked: true,
    participantRows,
    completeParticipantIds: ["p-complete"],
    championByParticipantId: new Map([
      ["p-complete", { teamName: "Brazil", teamCode: "BRA" }],
    ]),
    completionByParticipantId: new Map([
      [
        "p-complete",
        completionStatus({
          isComplete: true,
          sections: [
            {
              id: "group",
              label: "Group picks",
              required: true,
              filled: 24,
              total: 24,
              complete: true,
              missingLabels: [],
            },
            {
              id: "bonus",
              label: "Bonus picks",
              required: true,
              filled: 3,
              total: 3,
              complete: true,
              missingLabels: [],
            },
          ],
        }),
      ],
      [
        "p-incomplete",
        completionStatus({
          isComplete: false,
          sections: [
            {
              id: "group",
              label: "Group picks",
              required: true,
              filled: 10,
              total: 24,
              complete: false,
              missingLabels: [],
            },
            {
              id: "bonus",
              label: "Bonus picks",
              required: true,
              filled: 0,
              total: 3,
              complete: false,
              missingLabels: [],
            },
          ],
        }),
      ],
    ]),
  });

  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0]!.displayName, "Alice");
  assert.strictEqual(list[0]!.statusLabel, "Complete");
  assert.strictEqual(list[0]!.championTeamName, "Brazil");
  assert.strictEqual(list[0]!.groupPicksSummary, "24/24 group picks");
  assert.strictEqual(list[0]!.bonusComplete, true);
  assert.strictEqual(
    list[0]!.snapshotHref,
    participantBracketSnapshotHref("p-complete"),
  );

  assert.strictEqual(list[1]!.displayName, "Bob");
  assert.strictEqual(list[1]!.statusLabel, "Incomplete at lock");
  assert.strictEqual(list[1]!.championTeamName, null);
  assert.strictEqual(list[1]!.groupPicksSummary, "10/24 group picks");
  assert.strictEqual(list[1]!.bonusComplete, false);
  assert.strictEqual(
    list[1]!.snapshotHref,
    "/participant/p-incomplete/snapshot?from=reveal",
  );
}

// Empty pool
{
  const list = buildEveryonesPicksList({
    locked: true,
    participantRows: [],
    completeParticipantIds: [],
    championByParticipantId: new Map(),
  });
  assert.strictEqual(list.length, 0);
}

// Snapshot href helper
assert.strictEqual(
  participantBracketSnapshotHref("550e8400-e29b-41d4-a716-446655440000"),
  "/participant/550e8400-e29b-41d4-a716-446655440000/snapshot?from=reveal",
);

// Peer access is enforced server-side (RPC + RLS), not in this builder.
assert.ok(
  participantBracketSnapshotHref("p1").includes("/participant/p1/snapshot"),
  "snapshot links target the protected snapshot route",
);

console.log("buildEveryonesPicksList.selftest.ts: all passed");
