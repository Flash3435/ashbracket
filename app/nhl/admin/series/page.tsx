import { NhlAdminSeriesLedgerForm } from "@/components/nhl/NhlAdminSeriesLedgerForm";
import { NhlAdminSeriesWinnerForm } from "@/components/nhl/NhlAdminSeriesWinnerForm";
import { NhlTeamLogo } from "@/components/nhl/NhlTeamLogo";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { buildNhlSeriesStatePresentation } from "@/lib/nhl/nhlSeriesStateText";
import { getOfficial2026EditionTeamStatus } from "@/lib/nhl/official2026Edition";
import {
  fetchActiveNhlEdition,
  fetchNhlSeriesRowsForEdition,
  fetchNhlTeamSlugsForEdition,
} from "@/lib/nhl/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

function sideLabel(side: string | null): string {
  if (side === "cup") return "Cup";
  if (side === "east" || side === "west") return side.charAt(0).toUpperCase() + side.slice(1);
  return "—";
}

function SeriesTeamCell({
  abbr,
  name,
  slug,
  logoPath,
}: {
  abbr: string | null;
  name: string | null;
  slug: string | null;
  logoPath: string | null;
}) {
  if (!abbr && !name) {
    return <span className="text-slate-600">—</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <NhlTeamLogo
        size="sm"
        teamSlug={slug}
        abbreviation={abbr}
        logoPath={logoPath}
        name={name ?? abbr}
      />
      <div className="min-w-0">
        <span className="font-mono text-xs text-slate-300">{abbr ?? "—"}</span>
        {name ? <span className="mt-0.5 block truncate text-xs text-slate-500">{name}</span> : null}
      </div>
    </div>
  );
}

export default async function NhlAdminSeriesPage() {
  const supabase = await createClient();
  const { edition, error: edErr } = await fetchActiveNhlEdition(supabase);

  const seriesRes =
    edition && !edErr
      ? await fetchNhlSeriesRowsForEdition(supabase, edition.id)
      : { rows: [], error: null as string | null };

  const slugRes =
    edition && !edErr
      ? await fetchNhlTeamSlugsForEdition(supabase, edition.id)
      : { slugs: [] as string[], error: null as string | null };

  const fieldStatus =
    edition && !edErr && !slugRes.error
      ? slugRes.slugs.length > 0
        ? getOfficial2026EditionTeamStatus(slugRes.slugs.map((s) => ({ team_slug: s })))
        : "empty"
      : null;

  return (
    <PageContainer compactBottom>
      <PageTitle
        title="Series"
        description="All bracket slots from Round 1 through the Stanley Cup Final. Round 1 scores can also sync from the league bracket API via /api/nhl/sync-playoff-series when NHL_PLAYOFF_SYNC_ENABLED=true (see ops env below)."
      />

      <p className="text-xs leading-relaxed text-slate-500">
        Public pages overlay live Round 1 scores from NHLE by default. To disable that read-through,
        set{" "}
        <code className="rounded bg-slate-950/70 px-1 py-px text-slate-300">NHL_DISABLE_LIVE_BRACKET_OVERLAY=true</code>{" "}
        (the old <code className="text-slate-400">NHL_PUBLIC_BRACKET_OVERLAY</code> flag is ignored). Optional DB sync:{" "}
        <code className="rounded bg-slate-950/70 px-1 py-px text-slate-300">NHL_PLAYOFF_SYNC_ENABLED=true</code> with{" "}
        <code className="rounded bg-slate-950/70 px-1 py-px text-slate-300">CRON_SECRET</code> and{" "}
        <code className="rounded bg-slate-950/70 px-1 py-px text-slate-300">SUPABASE_SERVICE_ROLE_KEY</code>; optional{" "}
        <code className="rounded bg-slate-950/70 px-1 py-px text-slate-300">NHL_PLAYOFF_BRACKET_YEAR=2026</code> (
        <code className="text-slate-400">vercel.json</code> cron).
      </p>

      <p className="text-sm text-ash-muted">
        <Link href="/nhl/admin" className="ash-link">
          ← Overview
        </Link>
        {" · "}
        <Link href="/nhl/admin/bracket" className="ash-link font-medium text-blue-200">
          Bracket (visual overview)
        </Link>
      </p>

      {edErr ? (
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {edErr}
        </p>
      ) : null}

      {!edition ? (
        <p className="text-sm text-ash-muted">
          No active edition. Create one from the{" "}
          <Link href="/nhl/admin" className="ash-link">
            overview
          </Link>
          .
        </p>
      ) : null}

      {seriesRes.error ? (
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {seriesRes.error}
        </p>
      ) : null}

      {slugRes.error ? (
        <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {slugRes.error}
        </p>
      ) : null}

      {edition && !seriesRes.error ? (
        <>
          <p className="text-sm text-ash-muted">
            Active edition:{" "}
            <span className="font-medium text-ash-text">{edition.season_label}</span>
          </p>
          {fieldStatus ? (
            <p
              className={`mt-2 rounded-md border px-3 py-2 text-sm ${
                fieldStatus === "official_2026"
                  ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-100"
                  : fieldStatus === "empty"
                    ? "border-slate-600/60 bg-slate-950/50 text-slate-300"
                    : "border-amber-800/70 bg-amber-950/35 text-amber-100"
              }`}
            >
              {fieldStatus === "official_2026"
                ? "Round 1 lists the official 2026 pairings for this edition."
                : fieldStatus === "empty"
                  ? "Load teams and bracket rows from Overview → Maintenance when this edition is new."
                  : "Team set does not match the official 2026 field — run Repair from Overview → Maintenance."}
            </p>
          ) : null}
          {seriesRes.rows.length === 0 ? (
            <p className="text-sm text-ash-muted">
              No series rows yet. Use Overview → Maintenance → Create bracket skeleton if you need to
              initialize slots.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-blue-500/20">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="border-b border-blue-500/20 bg-slate-950/60 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Round</th>
                    <th className="px-3 py-2">Slot</th>
                    <th className="px-3 py-2">Side</th>
                    <th className="px-3 py-2">Higher seed</th>
                    <th className="px-3 py-2">Lower seed</th>
                    <th className="px-3 py-2">Score</th>
                    <th className="px-3 py-2">State</th>
                    <th className="px-3 py-2">Summary</th>
                    <th className="px-3 py-2">Live ledger</th>
                    <th className="px-3 py-2">Winner</th>
                    <th className="px-3 py-2">Record result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-500/10 text-ash-text">
                  {seriesRes.rows.map((r) => {
                    const pres = buildNhlSeriesStatePresentation(r);
                    return (
                    <tr key={r.id} className="bg-slate-950/30">
                      <td className="px-3 py-2 font-mono text-xs">{r.round_code}</td>
                      <td className="px-3 py-2 tabular-nums">{r.slot_index}</td>
                      <td className="px-3 py-2 text-ash-muted">{sideLabel(r.side_or_conference)}</td>
                      <td className="px-3 py-2 text-ash-muted">
                        <SeriesTeamCell
                          abbr={r.higher_team_abbr}
                          name={r.higher_team_name}
                          slug={r.higher_team_slug}
                          logoPath={r.higher_team_logo_path}
                        />
                      </td>
                      <td className="px-3 py-2 text-ash-muted">
                        <SeriesTeamCell
                          abbr={r.lower_team_abbr}
                          name={r.lower_team_name}
                          slug={r.lower_team_slug}
                          logoPath={r.lower_team_logo_path}
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-300" title="Higher wins · Lower wins">
                        {pres.scoreHigherLower ?? "—"}
                      </td>
                      <td
                        className="px-3 py-2 text-xs font-medium text-blue-100/95"
                        title={`Database status: ${r.status.replaceAll("_", " ")}`}
                      >
                        {pres.statusLabel}
                      </td>
                      <td className="max-w-[220px] px-3 py-2 text-xs leading-snug text-slate-400">
                        {pres.primaryLine}
                      </td>
                      <td className="px-3 py-2 align-top text-ash-muted">
                        {r.higher_seed_team_id && r.lower_seed_team_id ? (
                          <NhlAdminSeriesLedgerForm
                            seriesId={r.id}
                            higherAbbr={r.higher_team_abbr ?? "Hi"}
                            lowerAbbr={r.lower_team_abbr ?? "Lo"}
                            gamesWonHigher={r.games_won_by_higher_seed}
                            gamesWonLower={r.games_won_by_lower_seed}
                            status={r.status}
                          />
                        ) : (
                          <span className="text-xs text-slate-500">Assign both teams first</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-ash-muted">
                        {r.winner_team_abbr || r.winner_team_name ? (
                          <SeriesTeamCell
                            abbr={r.winner_team_abbr}
                            name={r.winner_team_name}
                            slug={r.winner_team_slug}
                            logoPath={r.winner_team_logo_path}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-ash-muted">
                        {r.higher_seed_team_id && r.lower_seed_team_id ? (
                          <NhlAdminSeriesWinnerForm
                            seriesId={r.id}
                            higherTeamId={r.higher_seed_team_id}
                            lowerTeamId={r.lower_seed_team_id}
                            higherAbbr={r.higher_team_abbr ?? "Hi"}
                            lowerAbbr={r.lower_team_abbr ?? "Lo"}
                            currentWinnerTeamId={r.winner_team_id}
                          />
                        ) : (
                          <span className="text-slate-500">Assign both teams first</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </PageContainer>
  );
}
