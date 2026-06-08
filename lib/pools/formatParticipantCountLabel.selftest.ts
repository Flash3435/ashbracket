import { formatParticipantCountLabel } from "./formatParticipantCountLabel";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

t(formatParticipantCountLabel(0) === "0 participants", "zero");
t(formatParticipantCountLabel(1) === "1 participant", "singular");
t(formatParticipantCountLabel(2) === "2 participants", "plural");

if (failed) {
  process.exit(1);
}
console.log("formatParticipantCountLabel.selftest: ok");
