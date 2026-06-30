/**
 * Self-test: `npx tsx lib/picks/picksViewMode.selftest.ts`
 */
import {
  buildPicksViewHrefs,
  resolvePicksViewMode,
} from "./picksViewMode";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

void (async function main() {
  assert(resolvePicksViewMode(undefined) === "bracket", "missing param defaults to bracket");
  assert(resolvePicksViewMode("") === "bracket", "empty param defaults to bracket");
  assert(resolvePicksViewMode("bracket") === "bracket", "explicit bracket");
  assert(resolvePicksViewMode("list") === "list", "explicit list");
  assert(resolvePicksViewMode("other") === "bracket", "unknown param defaults to bracket");

  const bare = buildPicksViewHrefs("/account", new URLSearchParams());
  assert(bare.bracketHref === "/account", "bracket href omits view param");
  assert(bare.listHref === "/account?view=list", "list href sets view=list");

  const withParticipant = buildPicksViewHrefs(
    "/account",
    new URLSearchParams({ participant: "abc-123" }),
  );
  assert(
    withParticipant.bracketHref === "/account?participant=abc-123",
    "bracket href keeps other params without view",
  );
  assert(
    withParticipant.listHref === "/account?participant=abc-123&view=list",
    "list href keeps other params and adds view=list",
  );

  const cleared = buildPicksViewHrefs(
    "/account/picks/summary",
    new URLSearchParams({ participant: "x", view: "bracket" }),
  );
  assert(
    cleared.bracketHref === "/account/picks/summary?participant=x",
    "buildPicksViewHrefs strips view for bracket link",
  );
  assert(
    cleared.listHref === "/account/picks/summary?participant=x&view=list",
    "buildPicksViewHrefs sets list view explicitly",
  );

  console.log("picksViewMode.selftest.ts: ok");
})();
