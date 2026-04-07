import {
  DEFAULT_PARTICIPANT_BONUS_KEYS,
  participantBonusKeysForPool,
} from "./buildParticipantPickDrafts";

const merged = participantBonusKeysForPool(["most_goals", "most_yellow_cards"]);
if (merged.length !== DEFAULT_PARTICIPANT_BONUS_KEYS.length) {
  throw new Error(
    `expected all default keys when DB omits most_red_cards, got ${merged.join(",")}`,
  );
}
for (const k of DEFAULT_PARTICIPANT_BONUS_KEYS) {
  if (!merged.includes(k)) {
    throw new Error(`missing default key ${k}`);
  }
}

const withBoot = participantBonusKeysForPool(["golden_boot", "most_goals"]);
if (!withBoot.includes("golden_boot") || !withBoot.includes("most_red_cards")) {
  throw new Error(`golden_boot merge failed: ${withBoot.join(",")}`);
}
if (withBoot.indexOf("most_goals") >= withBoot.indexOf("most_red_cards")) {
  throw new Error("defaults should stay in canonical order before golden_boot");
}

console.log("participantBonusKeys selftest: ok");
