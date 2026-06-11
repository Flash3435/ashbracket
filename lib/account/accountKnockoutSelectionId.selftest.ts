import assert from "node:assert";
import { ASHBRACKET_2026_POOL_LOCK_AT_ISO } from "../datetime/poolLockDeadline";
import { resolveKnockoutSelectionParticipantId } from "./accountKnockoutSelectionId";

const afterCanonicalMs =
  new Date(ASHBRACKET_2026_POOL_LOCK_AT_ISO).getTime() + 60_000;

const simulationProfile = {
  id: "a0000001-0000-4000-8000-000000000101",
  pool_id: "a0000001-0000-4000-8000-000000000201",
  pool_name: "Simulation test pool",
  pool_lock_at: null,
  is_simulation: true,
};

const fampoolProfile = {
  id: "a0000001-0000-4000-8000-000000000106",
  pool_id: "a0000001-0000-4000-8000-000000000206",
  pool_name: "Fampool",
  pool_lock_at: ASHBRACKET_2026_POOL_LOCK_AT_ISO,
  is_simulation: false,
};

const ppfamilyProfile = {
  id: "a0000001-0000-4000-8000-000000000102",
  pool_id: "a0000001-0000-4000-8000-000000000202",
  pool_name: "PPFamily",
  pool_lock_at: ASHBRACKET_2026_POOL_LOCK_AT_ISO,
  is_simulation: false,
};

const profiles = [simulationProfile, ppfamilyProfile, fampoolProfile];

const explicitFampool = resolveKnockoutSelectionParticipantId(
  profiles,
  fampoolProfile.id,
  afterCanonicalMs,
);
assert.equal(
  explicitFampool.selectedId,
  fampoolProfile.id,
  "explicit participant param resolves to that profile",
);
assert.equal(explicitFampool.invalidOtherProfile, false);

const defaultSelection = resolveKnockoutSelectionParticipantId(
  profiles,
  "",
  afterCanonicalMs,
);
assert.equal(
  defaultSelection.selectedId,
  ppfamilyProfile.id,
  "default prefers locked live pool over simulation",
);

const foreignProfile = resolveKnockoutSelectionParticipantId(
  profiles,
  "b0000001-0000-4000-8000-000000000999",
  afterCanonicalMs,
);
assert.equal(foreignProfile.invalidOtherProfile, true);
assert.equal(
  foreignProfile.selectedId,
  null,
  "foreign participant param does not fall back to default",
);

const explicitLiveOverSimulation = resolveKnockoutSelectionParticipantId(
  profiles,
  fampoolProfile.id,
  afterCanonicalMs,
);
assert.equal(
  explicitLiveOverSimulation.selectedId,
  fampoolProfile.id,
  "explicit live participant is not overridden by simulation default",
);

console.log("accountKnockoutSelectionId.selftest.ts: all passed");
