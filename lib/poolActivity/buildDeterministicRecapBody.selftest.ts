import {
  buildDeterministicRecapBody,
  recapActivityDisplayBody,
} from "./buildDeterministicRecapBody";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

const baseFacts = {
  topChampionTeamName: null as string | null,
  topChampionPickCount: 0,
};

t(
  buildDeterministicRecapBody({
    participantCount: 1,
    submittedCount: 0,
    ...baseFacts,
  }).includes("0 of 1 brackets are complete"),
  "daily recap 0 of 1",
);
t(
  buildDeterministicRecapBody({
    participantCount: 1,
    submittedCount: 1,
    ...baseFacts,
  }).includes("1 of 1 brackets are complete"),
  "daily recap 1 of 1",
);
t(
  buildDeterministicRecapBody({
    participantCount: 2,
    submittedCount: 1,
    ...baseFacts,
  }).includes("1 of 2 brackets are complete"),
  "daily recap 1 of 2",
);
t(
  !/participant(s)? ha(s|ve) completed/.test(
    buildDeterministicRecapBody({
      participantCount: 1,
      submittedCount: 0,
      ...baseFacts,
    }),
  ),
  "daily recap avoids old participant completion wording",
);

const staleBody =
  "Ash's daily recap: 0 of 1 participant have completed their bracket.\n\nFlavor line.";
const reconciled = recapActivityDisplayBody(staleBody, {
  participant_count: 1,
  submitted_count: 0,
});
t(
  reconciled.startsWith("Ash's daily recap: 0 of 1 brackets are complete."),
  "reconcile stale stored recap body",
);
t(reconciled.includes("Flavor line."), "preserve recap flavor");

if (failed) {
  process.exit(1);
}
console.log("buildDeterministicRecapBody.selftest: ok");
