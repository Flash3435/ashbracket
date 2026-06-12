/**
 * Apply one final score to a live official `tournament_matches` row (service role).
 * Does not run the daily standings update — run that from Admin → Update today's scores after.
 *
 * Usage (from ashbracket/):
 *   npm run apply:live-match-score -- --match-code WC2026-G-A-01 --home 2 --away 1
 *   npm run apply:live-match-score -- --match-code WC2026-G-A-01 --home 1 --away 1 --home-pen 4 --away-pen 5
 *   npm run apply:live-match-score -- --dry-run --match-code WC2026-G-A-01 --home 2 --away 1
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local ok).
 */

import { createClient } from "@supabase/supabase-js";
import { OFFICIAL_EDITION_CODE } from "../lib/config/officialTournament";
import { winnerFromMatchScores } from "../lib/tournament/matchOutcome";
import { loadEnvLocal } from "./loadEnvLocal";

type Args = {
  matchCode: string;
  homeGoals: number;
  awayGoals: number;
  homePenalties: number | null;
  awayPenalties: number | null;
  dryRun: boolean;
  forceSyncLocked: boolean;
};

function usage(): never {
  console.error(`Usage:
  npm run apply:live-match-score -- --match-code <code> --home <n> --away <n> [options]

Options:
  --home-pen <n>       Home penalty shootout goals (knockout draws)
  --away-pen <n>       Away penalty shootout goals
  --dry-run            Print the update without writing
  --force-sync-locked  Update even when sync_locked is true
`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  let matchCode = "";
  let homeGoals: number | null = null;
  let awayGoals: number | null = null;
  let homePenalties: number | null = null;
  let awayPenalties: number | null = null;
  let dryRun = false;
  let forceSyncLocked = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const next = argv[i + 1];
    switch (arg) {
      case "--match-code":
        matchCode = (next ?? "").trim();
        i += 1;
        break;
      case "--home":
        homeGoals = Number(next);
        i += 1;
        break;
      case "--away":
        awayGoals = Number(next);
        i += 1;
        break;
      case "--home-pen":
        homePenalties = Number(next);
        i += 1;
        break;
      case "--away-pen":
        awayPenalties = Number(next);
        i += 1;
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--force-sync-locked":
        forceSyncLocked = true;
        break;
      case "--help":
      case "-h":
        usage();
      default:
        if (arg.startsWith("-")) {
          console.error(`Unknown option: ${arg}`);
          usage();
        }
    }
  }

  if (!matchCode || homeGoals == null || awayGoals == null) usage();
  if (!Number.isInteger(homeGoals) || homeGoals < 0) usage();
  if (!Number.isInteger(awayGoals) || awayGoals < 0) usage();
  if (homePenalties != null && (!Number.isInteger(homePenalties) || homePenalties < 0)) usage();
  if (awayPenalties != null && (!Number.isInteger(awayPenalties) || awayPenalties < 0)) usage();

  return {
    matchCode,
    homeGoals,
    awayGoals,
    homePenalties,
    awayPenalties,
    dryRun,
    forceSyncLocked,
  };
}

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: edition, error: edErr } = await supabase
    .from("tournament_editions")
    .select("id, code, name, is_simulation")
    .eq("code", OFFICIAL_EDITION_CODE)
    .maybeSingle();

  if (edErr || !edition) {
    console.error(edErr?.message ?? `Edition ${OFFICIAL_EDITION_CODE} not found.`);
    process.exit(1);
  }
  if (edition.is_simulation) {
    console.error("Official edition is marked simulation — refusing live score apply.");
    process.exit(1);
  }

  const { data: match, error: mErr } = await supabase
    .from("tournament_matches")
    .select(
      "id, match_code, stage_code, group_code, home_team_id, away_team_id, home_goals, away_goals, home_penalties, away_penalties, winner_team_id, status, sync_locked",
    )
    .eq("edition_id", edition.id as string)
    .eq("match_code", args.matchCode)
    .maybeSingle();

  if (mErr || !match) {
    console.error(mErr?.message ?? `Match ${args.matchCode} not found on live edition.`);
    process.exit(1);
  }

  if (match.sync_locked && !args.forceSyncLocked) {
    console.error(
      `Match ${args.matchCode} is sync_locked. Re-run with --force-sync-locked if intentional.`,
    );
    process.exit(1);
  }

  const winnerTeamId = winnerFromMatchScores({
    homeTeamId: match.home_team_id as string | null,
    awayTeamId: match.away_team_id as string | null,
    homeGoals: args.homeGoals,
    awayGoals: args.awayGoals,
    homePenalties: args.homePenalties,
    awayPenalties: args.awayPenalties,
  });

  const update = {
    home_goals: args.homeGoals,
    away_goals: args.awayGoals,
    home_penalties: args.homePenalties,
    away_penalties: args.awayPenalties,
    winner_team_id: winnerTeamId,
    status: winnerTeamId ? "finished" : match.status,
  };

  console.log("Edition:", edition.name, `(${edition.code})`);
  console.log("Match:", match.match_code, `stage=${match.stage_code}`, match.group_code ? `group=${match.group_code}` : "");
  console.log("Previous:", `${match.home_goals ?? "—"}-${match.away_goals ?? "—"}`, `status=${match.status}`);
  console.log("New:", `${args.homeGoals}-${args.awayGoals}`, update.status, winnerTeamId ? `winner=${winnerTeamId}` : "no winner yet");

  if (args.dryRun) {
    console.log("Dry run — no database write.");
    return;
  }

  const { error: upErr } = await supabase
    .from("tournament_matches")
    .update(update)
    .eq("id", match.id as string);

  if (upErr) {
    console.error("Update failed:", upErr.message);
    process.exit(1);
  }

  console.log("OK: score saved. Next: Admin → Update today's scores to rebuild results and leaderboards.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
