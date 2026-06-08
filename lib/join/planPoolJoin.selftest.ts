import {
  JOIN_DISPLAY_NAME_AMBIGUOUS_MESSAGE,
  JOIN_DISPLAY_NAME_TAKEN_MESSAGE,
} from "./joinDisplayName";
import { planPoolJoin } from "./planPoolJoin";
import { validateJoinCodeFormat } from "../pools/joinCodeFormat";
import { validateJoinDisplayName } from "./joinDisplayName";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

const noMatches: [] = [];
const oneMatch = [
  { participantId: "p1", displayName: "Alex" },
] as const;
const twoMatches = [
  { participantId: "p1", displayName: "Alex" },
  { participantId: "p2", displayName: "Alex" },
];

t(
  planPoolJoin({
    intent: "initial",
    unclaimedMatches: noMatches,
    nameTakenByJoinedParticipant: false,
  }).action === "register",
  "no pre-created row → register",
);

t(
  planPoolJoin({
    intent: "initial",
    unclaimedMatches: [...oneMatch],
    nameTakenByJoinedParticipant: false,
  }).action === "needs_confirmation",
  "one unclaimed match → confirmation",
);

t(
  planPoolJoin({
    intent: "confirm_existing",
    unclaimedMatches: [...oneMatch],
    nameTakenByJoinedParticipant: false,
  }).action === "claim",
  "confirm_existing → claim",
);

const taken = planPoolJoin({
  intent: "initial",
  unclaimedMatches: noMatches,
  nameTakenByJoinedParticipant: true,
});
t(
  taken.action === "error" &&
    (taken as { message: string }).message === JOIN_DISPLAY_NAME_TAKEN_MESSAGE,
  "joined name taken → friendly error",
);

t(
  planPoolJoin({
    intent: "create_new",
    unclaimedMatches: [...oneMatch],
    nameTakenByJoinedParticipant: true,
  }).action === "error",
  "create_new blocked when joined name taken",
);

t(
  planPoolJoin({
    intent: "create_new",
    unclaimedMatches: [...oneMatch],
    nameTakenByJoinedParticipant: false,
  }).action === "register",
  "create_new skips unclaimed placeholder",
);

const ambiguous = planPoolJoin({
  intent: "initial",
  unclaimedMatches: [...twoMatches],
  nameTakenByJoinedParticipant: false,
});
t(
  ambiguous.action === "ambiguous" &&
    ambiguous.action === "ambiguous" &&
    ambiguous.message === JOIN_DISPLAY_NAME_AMBIGUOUS_MESSAGE,
  "multiple unclaimed matches → ambiguous",
);

t(validateJoinDisplayName("  Pat  ").ok === true, "display name trims");
t(
  validateJoinDisplayName("   ").ok === false,
  "empty display name rejected",
);

const joinLink = validateJoinCodeFormat("ash-2026");
t(joinLink.ok === true && joinLink.normalized === "ASH-2026", "join URL codes normalize");

if (failed) {
  process.exit(1);
}
console.log("planPoolJoin.selftest: ok");
