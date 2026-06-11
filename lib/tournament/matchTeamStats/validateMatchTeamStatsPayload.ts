export type OptionalNonNegativeInt = number | null;

export type MatchTeamStatsSaveInput = {
  homeGoals: OptionalNonNegativeInt;
  awayGoals: OptionalNonNegativeInt;
  homeYellowCards: OptionalNonNegativeInt;
  awayYellowCards: OptionalNonNegativeInt;
  homeRedCards: OptionalNonNegativeInt;
  awayRedCards: OptionalNonNegativeInt;
};

export type ValidatedMatchTeamStatsSave = {
  homeGoals: number | null;
  awayGoals: number | null;
  homeYellowCards: number | null;
  awayYellowCards: number | null;
  homeRedCards: number | null;
  awayRedCards: number | null;
};

function parseOptionalNonNegativeInt(
  value: OptionalNonNegativeInt,
  label: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: null };
  if (!Number.isInteger(value) || value < 0) {
    return { ok: false, error: `${label} must be blank or a non-negative integer.` };
  }
  return { ok: true, value };
}

export function validateMatchTeamStatsPayload(
  input: MatchTeamStatsSaveInput,
): { ok: true; value: ValidatedMatchTeamStatsSave } | { ok: false; error: string } {
  const homeGoals = parseOptionalNonNegativeInt(input.homeGoals, "Home score");
  if (!homeGoals.ok) return homeGoals;
  const awayGoals = parseOptionalNonNegativeInt(input.awayGoals, "Away score");
  if (!awayGoals.ok) return awayGoals;
  const homeYellow = parseOptionalNonNegativeInt(input.homeYellowCards, "Home yellow cards");
  if (!homeYellow.ok) return homeYellow;
  const awayYellow = parseOptionalNonNegativeInt(input.awayYellowCards, "Away yellow cards");
  if (!awayYellow.ok) return awayYellow;
  const homeRed = parseOptionalNonNegativeInt(input.homeRedCards, "Home red cards");
  if (!homeRed.ok) return homeRed;
  const awayRed = parseOptionalNonNegativeInt(input.awayRedCards, "Away red cards");
  if (!awayRed.ok) return awayRed;

  if (homeGoals.value != null && awayGoals.value == null) {
    return { ok: false, error: "Enter away score when home score is set." };
  }
  if (awayGoals.value != null && homeGoals.value == null) {
    return { ok: false, error: "Enter home score when away score is set." };
  }

  return {
    ok: true,
    value: {
      homeGoals: homeGoals.value,
      awayGoals: awayGoals.value,
      homeYellowCards: homeYellow.value,
      awayYellowCards: awayYellow.value,
      homeRedCards: homeRed.value,
      awayRedCards: awayRed.value,
    },
  };
}

export function assertTeamIdsBelongToMatch(input: {
  homeTeamId: string | null;
  awayTeamId: string | null;
}): { ok: true } | { ok: false; error: string } {
  if (!input.homeTeamId || !input.awayTeamId) {
    return { ok: false, error: "Both teams must be set on the match before saving stats." };
  }
  return { ok: true };
}
