import type { ChampionPickExposure } from "./buildChampionPickExposure";
import type { KnockoutMatchExposure } from "./buildKnockoutMatchExposure";
import type { ParticipantRaceOutlook } from "./buildParticipantRaceOutlook";

/**
 * Participant-facing champion exposure is shown after picks lock when at least one
 * complete bracket has a resolved champion pick — including when every pick is
 * eliminated (empty surviving list).
 */
export function shouldShowChampionPickExposure(input: {
  picksLocked: boolean;
  exposure: ChampionPickExposure;
}): boolean {
  return input.picksLocked && input.exposure.totalCompletedChampionPicks > 0;
}

/**
 * Participant-facing match exposure is shown after picks lock when there are
 * complete brackets and at least one eligible upcoming/live knockout fixture.
 */
export function shouldShowKnockoutMatchExposure(input: {
  picksLocked: boolean;
  exposure: KnockoutMatchExposure;
}): boolean {
  return (
    input.picksLocked &&
    input.exposure.totalCompletedBrackets > 0 &&
    input.exposure.fixtures.length > 0
  );
}

/**
 * Race outlook is shown after picks lock when complete brackets exist and at least
 * one leaderboard-visible participant qualifies for the outlook list.
 */
export function shouldShowParticipantRaceOutlook(input: {
  picksLocked: boolean;
  outlook: ParticipantRaceOutlook;
  totalCompletedBrackets: number;
}): boolean {
  return (
    input.picksLocked &&
    input.totalCompletedBrackets > 0 &&
    input.outlook.rows.length > 0
  );
}

/** Aggregate exposure payloads must not include per-participant identifiers. */
export function poolExposurePayloadIsAggregateOnly(input: {
  champion?: ChampionPickExposure;
  match?: KnockoutMatchExposure;
}): boolean {
  const json = JSON.stringify(input);
  return !json.includes("participantId") && !json.includes("participantDisplayName");
}
