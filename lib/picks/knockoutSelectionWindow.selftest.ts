import assert from "node:assert";
import {
  buildKnockoutSelectionInstructionCard,
  deriveKnockoutSelectionSchedule,
  formatKnockoutSelectionCountdown,
  GROUP_STAGE_MATCH_DURATION_BUFFER_MS,
  isMatchStarted,
  KNOCKOUT_EXPECTED_UNLOCK_LINE,
  selectionCountdownExpired,
} from "./knockoutSelectionWindow";
import { formatKickoffLocalSingleLine } from "../datetime/scheduleDisplay";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

function match(
  partial: Partial<TournamentMatchPublicRow> &
    Pick<TournamentMatchPublicRow, "stage_code" | "match_code">,
): TournamentMatchPublicRow {
  return {
    match_id: partial.match_id ?? partial.match_code,
    edition_id: "ed",
    edition_code: "wc2026",
    match_code: partial.match_code,
    stage_code: partial.stage_code,
    stage_label: partial.stage_code,
    stage_sort_order: partial.stage_sort_order ?? 1,
    group_code: partial.group_code ?? null,
    round_index: partial.round_index ?? 0,
    kickoff_at: partial.kickoff_at ?? null,
    status: partial.status ?? "scheduled",
    home_goals: null,
    away_goals: null,
    home_penalties: null,
    away_penalties: null,
    home_team_name: partial.home_team_name ?? null,
    home_country_code: partial.home_country_code ?? null,
    away_team_name: partial.away_team_name ?? null,
    away_country_code: partial.away_country_code ?? null,
    winner_team_name: null,
    winner_country_code: null,
  };
}

// Locked/upcoming before group stage completion
{
  const nowMs = new Date("2026-06-20T12:00:00Z").getTime();
  const matches = [
    match({
      match_code: "M1",
      stage_code: "group",
      group_code: "A",
      kickoff_at: "2026-06-20T18:00:00Z",
    }),
    match({
      match_code: "M72",
      stage_code: "group",
      group_code: "L",
      kickoff_at: "2026-06-27T20:00:00Z",
    }),
    match({
      match_code: "M73",
      stage_code: "round_of_32",
      kickoff_at: "2026-06-28T19:00:00Z",
    }),
  ];

  const model = buildKnockoutSelectionInstructionCard({
    knockoutBracketPicksUnlocked: false,
    matches,
    picksHref: "/account/picks?participant=x",
    nowMs,
  });

  assert.ok(model);
  assert.strictEqual(model!.phase, "upcoming");
  assert.strictEqual(model!.title, "Knockout picks open after the group stage");
  assert.ok(model!.body.includes("third-place"));
  assert.strictEqual(model!.expectedUnlockLine, KNOCKOUT_EXPECTED_UNLOCK_LINE);
  assert.strictEqual(model!.expectedUnlockKickoffIso, "2026-06-27T20:00:00Z");
  assert.ok(!model!.expectedUnlockLine.includes("UTC"));
  assert.ok(!model!.expectedUnlockLine.includes("Jun"));
  assert.ok(model!.countdown);
  assert.strictEqual(model!.countdown!.label, "Selections open in");
  assert.strictEqual(model!.upcomingFallbackLine, null);
  assert.strictEqual(model!.gradualStatusLine, null);

  const schedule = deriveKnockoutSelectionSchedule(matches, nowMs);
  assert.strictEqual(schedule.finalGroupKickoffIso, "2026-06-27T20:00:00Z");
  assert.strictEqual(
    schedule.expectedUnlockAtIso,
    new Date(
      new Date("2026-06-27T20:00:00Z").getTime() +
        GROUP_STAGE_MATCH_DURATION_BUFFER_MS,
    ).toISOString(),
  );
}

// Partial gradual unlock — some R32 confirmed
{
  const nowMs = new Date("2026-06-28T10:00:00Z").getTime();
  const matches = [
    match({
      match_code: "M73",
      stage_code: "round_of_32",
      kickoff_at: "2026-06-28T19:00:00Z",
      home_country_code: "USA",
      away_country_code: "MEX",
      home_team_name: "United States",
      away_team_name: "Mexico",
    }),
  ];

  const model = buildKnockoutSelectionInstructionCard({
    knockoutBracketPicksUnlocked: false,
    matches,
    picksHref: "/account/picks",
    nowMs,
  });

  assert.strictEqual(model.phase, "upcoming");
  assert.strictEqual(model.title, "Knockout picks are opening gradually");
  assert.strictEqual(model.countdown?.label, "First available match locks in");
  assert.strictEqual(model.countdown?.targetIso, "2026-06-28T19:00:00Z");
  assert.ok(model.gradualStatusLine?.includes("1 confirmed"));
  assert.ok(model.gradualStatusLine?.includes("15 waiting"));
}

// Open state — full R32 before first kickoff
{
  const nowMs = new Date("2026-06-27T22:00:00Z").getTime();
  const r32 = Array.from({ length: 16 }, (_, i) =>
    match({
      match_code: `M${73 + i}`,
      stage_code: "round_of_32",
      kickoff_at: i === 0 ? "2026-06-28T19:00:00Z" : `2026-06-29T${10 + i}:00:00Z`,
      home_country_code: "USA",
      away_country_code: "MEX",
      home_team_name: "United States",
      away_team_name: "Mexico",
    }),
  );

  const model = buildKnockoutSelectionInstructionCard({
    knockoutBracketPicksUnlocked: true,
    matches: r32,
    picksHref: "/account/picks",
    nowMs,
  });

  assert.ok(model);
  assert.strictEqual(model!.phase, "open");
  assert.strictEqual(model!.title, "Knockout picks are open");
  assert.ok(model!.countdown);
  assert.strictEqual(model!.countdown!.label, "First match locks in");
  assert.strictEqual(model!.countdown!.targetIso, "2026-06-28T19:00:00Z");
  assert.strictEqual(model!.cta?.label, "Make knockout picks");
  assert.ok(model!.helperText?.includes("kickoff"));
}

// In-progress/locking after first knockout kickoff
{
  const nowMs = new Date("2026-06-28T19:30:00Z").getTime();
  const matches = [
    match({
      match_code: "M73",
      stage_code: "round_of_32",
      kickoff_at: "2026-06-28T19:00:00Z",
      status: "live",
      home_country_code: "USA",
      away_country_code: "MEX",
    }),
    match({
      match_code: "M74",
      stage_code: "round_of_32",
      kickoff_at: "2026-06-28T22:00:00Z",
      home_country_code: "BRA",
      away_country_code: "ARG",
    }),
  ];

  const model = buildKnockoutSelectionInstructionCard({
    knockoutBracketPicksUnlocked: true,
    matches,
    picksHref: "/account/picks",
    nowMs,
  });

  assert.ok(model);
  assert.strictEqual(model!.phase, "locking");
  assert.strictEqual(model!.title, "Knockout picks are now locking");
  assert.strictEqual(model!.countdown, null);
  assert.strictEqual(model!.cta?.label, "Review picks");
}

// Missing schedule fallback
{
  const model = buildKnockoutSelectionInstructionCard({
    knockoutBracketPicksUnlocked: false,
    matches: [],
    picksHref: "/account/picks",
    nowMs: Date.now(),
  });

  assert.ok(model);
  assert.strictEqual(model!.phase, "upcoming");
  assert.strictEqual(model!.countdown, null);
  assert.strictEqual(
    model!.upcomingFallbackLine,
    "Expected after final group-stage results are official",
  );
}

// Countdown expiry — upcoming phase after expected unlock passed
{
  const nowMs = new Date("2026-06-28T10:00:00Z").getTime();
  const matches = [
    match({
      match_code: "M72",
      stage_code: "group",
      kickoff_at: "2026-06-27T20:00:00Z",
      status: "finished",
    }),
  ];

  const model = buildKnockoutSelectionInstructionCard({
    knockoutBracketPicksUnlocked: false,
    matches,
    picksHref: "/account/picks",
    nowMs,
  });

  assert.ok(model);
  assert.strictEqual(model!.countdown, null);
  assert.strictEqual(
    model!.upcomingFallbackLine,
    "Expected after final group-stage results are official",
  );
}

// Countdown never negative
{
  const past = new Date("2026-06-28T19:00:00Z").toISOString();
  const nowMs = new Date("2026-06-28T20:00:00Z").getTime();
  assert.strictEqual(selectionCountdownExpired(past, nowMs), true);
  assert.strictEqual(formatKnockoutSelectionCountdown(past, nowMs), "now");
}

// Match started by kickoff time even when status still scheduled
{
  const m = match({
    match_code: "M73",
    stage_code: "round_of_32",
    kickoff_at: "2026-06-28T19:00:00Z",
    status: "scheduled",
  });
  assert.strictEqual(
    isMatchStarted(m, new Date("2026-06-28T19:01:00Z").getTime()),
    true,
  );
}

// Participant-facing metadata uses ISO for client-local display, not server UTC strings
{
  const kickoffIso = "2026-06-27T20:00:00Z";
  const model = buildKnockoutSelectionInstructionCard({
    knockoutBracketPicksUnlocked: false,
    matches: [
      match({
        match_code: "M72",
        stage_code: "group",
        group_code: "L",
        kickoff_at: kickoffIso,
      }),
    ],
    picksHref: "/account/picks",
    nowMs: new Date("2026-06-20T12:00:00Z").getTime(),
  });
  assert.strictEqual(model.expectedUnlockKickoffIso, kickoffIso);
  assert.ok(!JSON.stringify(model).includes("UTC"));
  const localLabel = formatKickoffLocalSingleLine(kickoffIso, {
    timeZone: "America/Edmonton",
  });
  assert.ok(/MDT|MST/i.test(localLabel), localLabel);
  assert.ok(!/UTC/i.test(localLabel), localLabel);
}

console.log("knockoutSelectionWindow.selftest.ts: ok");
