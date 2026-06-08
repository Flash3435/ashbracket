import {
  formatActivityItemCount,
  formatBracketCount,
  formatBracketsCompleteLine,
  formatEntryCount,
  formatNewParticipantsJoined,
  formatParticipantCount,
  formatPeopleUpdatedPicks,
  formatRemainingBracketPhrase,
  formatStillNeedToFinishVerb,
  verbHasHave,
  verbIsAre,
} from "./pluralize";

let failed = 0;
function t(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

t(formatBracketCount(1) === "1 bracket", "one bracket");
t(formatBracketCount(2) === "2 brackets", "two brackets");
t(formatParticipantCount(1) === "1 participant", "one participant");
t(formatEntryCount(1) === "1 entry", "one entry");
t(verbIsAre(1) === "is" && verbIsAre(2) === "are", "is/are");
t(verbHasHave(1) === "has" && verbHasHave(3) === "have", "has/have");
t(
  formatBracketsCompleteLine(0, 1) === "0 of 1 brackets are complete.",
  "brackets complete line",
);
t(
  formatRemainingBracketPhrase(1) === "Still waiting on 1 bracket.",
  "remaining phrase singular",
);
t(
  formatNewParticipantsJoined(1) === "1 new participant joined",
  "one join",
);
t(
  formatPeopleUpdatedPicks(1) === "1 person updated their picks",
  "one pick update",
);
t(formatActivityItemCount(1) === "1 activity item", "one activity item");
t(
  formatStillNeedToFinishVerb(1) === "still needs to finish",
  "still needs singular",
);
t(
  formatStillNeedToFinishVerb(2) === "still need to finish",
  "still need plural",
);

if (failed) {
  process.exit(1);
}
console.log("pluralize.selftest: ok");
