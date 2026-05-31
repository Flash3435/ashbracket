import {
  REMOVE_PARTICIPANT_ALREADY_GONE_MESSAGE,
  buildRemoveParticipantWarnings,
  formatRemoveParticipantSuccessMessage,
  isParticipantRemovalTarget,
  otherPoolParticipantUntouched,
  removeParticipantModalSubject,
} from "./removeParticipantFromPoolPolicy";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

t(
  buildRemoveParticipantWarnings({ paid: false, picksStatus: null }).length === 0,
  "no warnings when unpaid and no picks status",
);

t(
  buildRemoveParticipantWarnings({
    paid: true,
    picksStatus: null,
  }).some((w) => w.includes("paid")),
  "paid warning",
);

t(
  buildRemoveParticipantWarnings({
    paid: false,
    picksStatus: {
      kind: "in_progress",
      label: "In progress",
      picksComplete: false,
      isIncomplete: true,
      savedPickCount: 3,
      lastSavedAt: null,
    },
  }).some((w) => w.includes("3 saved picks")),
  "picks warning plural",
);

t(
  formatRemoveParticipantSuccessMessage("Jamie Lee") ===
    "Jamie Lee was removed from this pool.",
  "success message",
);

t(
  formatRemoveParticipantSuccessMessage("  ") === "Participant was removed from this pool.",
  "success message fallback name",
);

t(
  removeParticipantModalSubject({
    displayName: "Jamie",
    email: "jamie@example.com",
  }) === "Jamie (jamie@example.com)",
  "modal subject with name and email",
);

t(
  REMOVE_PARTICIPANT_ALREADY_GONE_MESSAGE.includes("no longer"),
  "already gone message",
);

t(
  isParticipantRemovalTarget({
    targetParticipantId: "p1",
    targetPoolId: "pool-a",
    rowParticipantId: "p1",
    rowPoolId: "pool-a",
  }),
  "matches participant in same pool",
);

t(
  !isParticipantRemovalTarget({
    targetParticipantId: "p1",
    targetPoolId: "pool-a",
    rowParticipantId: "p1",
    rowPoolId: "pool-b",
  }),
  "does not match same participant id in another pool",
);

t(
  otherPoolParticipantUntouched({
    removalPoolId: "pool-a",
    rowPoolId: "pool-b",
  }),
  "other pool membership untouched",
);

t(
  !otherPoolParticipantUntouched({
    removalPoolId: "pool-a",
    rowPoolId: "pool-a",
  }),
  "same pool row is removal target",
);

if (failed) {
  process.exit(1);
}
console.log("removeParticipantFromPoolPolicy.selftest: ok");
