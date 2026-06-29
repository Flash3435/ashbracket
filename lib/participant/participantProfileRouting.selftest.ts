import assert from "node:assert/strict";
import type { LeaderboardPublicRow } from "../../types/leaderboard";
import { buildPublicPoolLeaderboardPresentation } from "../leaderboard/buildPublicPoolLeaderboardPresentation";
import {
  normalizeParticipantProfileRouteId,
  participantPublicProfileHref,
} from "./participantProfileRouting";

const SAMPLE_ID = "028514d5-790e-45e2-b545-2b589bff830e";

assert.equal(
  normalizeParticipantProfileRouteId(`  ${SAMPLE_ID}  `),
  SAMPLE_ID,
  "trimmed participant uuid should normalize",
);

assert.equal(
  normalizeParticipantProfileRouteId("Snappin' Legs"),
  null,
  "display names must not be route ids",
);

assert.equal(
  normalizeParticipantProfileRouteId("Jordan Lee"),
  null,
  "names with spaces must not be route ids",
);

assert.equal(
  participantPublicProfileHref(SAMPLE_ID),
  `/participant/${SAMPLE_ID}`,
  "profile href should use participant id",
);

assert.equal(
  participantPublicProfileHref("Snappin' Legs"),
  null,
  "display names must not produce profile hrefs",
);

const rows: LeaderboardPublicRow[] = [
  {
    poolId: "7127be15-169c-4430-9e28-8eca5e20c9c7",
    poolName: "Wayzata World Cup",
    participantId: SAMPLE_ID,
    displayName: "Snappin' Legs",
    totalPoints: 48,
    rank: 6,
  },
];

const presentation = buildPublicPoolLeaderboardPresentation(rows);
const rowHref = participantPublicProfileHref(presentation.rows[0]!.participantId);

assert.equal(
  rowHref,
  `/participant/${SAMPLE_ID}`,
  "leaderboard row href should use participant_id not display_name",
);

assert.ok(
  !rowHref?.includes("Snappin"),
  "profile href must not embed display_name",
);

console.log("participantProfileRouting.selftest: ok");
