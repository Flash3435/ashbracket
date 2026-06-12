import assert from "node:assert";
import {
  ACCOUNT_REVEAL_RESULTS_HASH,
  buildAccountProfileLinkHref,
  buildAccountRevealProfileLinkHref,
} from "./buildAccountProfileLinkHref";

const participantId = "a0000001-0000-4000-8000-000000000102";

assert.equal(
  buildAccountProfileLinkHref("/account/reveal", participantId),
  `/account/reveal?participant=${participantId}`,
  "reveal profile link includes participant id",
);

assert.equal(
  buildAccountRevealProfileLinkHref(participantId),
  `/account/reveal?participant=${participantId}#${ACCOUNT_REVEAL_RESULTS_HASH}`,
  "reveal picks link scrolls to results anchor",
);

assert.equal(
  buildAccountProfileLinkHref("/account/picks", participantId),
  `/account/picks?participant=${participantId}`,
  "picks profile link includes participant id",
);

assert.equal(
  buildAccountProfileLinkHref("/account/picks/summary", participantId),
  `/account/picks/summary?participant=${participantId}`,
  "summary profile link includes participant id",
);

assert.equal(
  buildAccountProfileLinkHref("/account/activity", participantId),
  `/account/activity?participant=${participantId}`,
  "activity profile link includes participant id",
);

assert.equal(
  buildAccountProfileLinkHref("/account?foo=1", participantId),
  `/account?foo=1&participant=${participantId}`,
  "appends participant to existing query string",
);

console.log("buildAccountProfileLinkHref.selftest.ts: all passed");
