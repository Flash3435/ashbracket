import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { requireGlobalAdminPage } from "@/lib/admin/requireGlobalAdmin";
import { createClient } from "@/lib/supabase/server";
import { OFFICIAL_EDITION_CODE } from "../../../../lib/config/officialTournament";
import { computeStandingsFreshness } from "../../../../lib/tournament/standingsFreshness";
import Link from "next/link";

export const dynamic = "force-dynamic";

function formatWhen(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

type PageProps = {
  searchParams: Promise<{ ok?: string; err?: string }>;
};

export default async function AdminTournamentStatusPage({ searchParams }: PageProps) {
  await requireGlobalAdminPage("/admin/tournament/status");

  const sp = await searchParams;
  const supabase = await createClient();

  let loadError: string | null = null;

  const { data: edition, error: edErr } = await supabase
    .from("tournament_editions")
    .select("id, code, name, starts_on, ends_on, created_at, updated_at")
    .eq("code", OFFICIAL_EDITION_CODE)
    .maybeSingle();

  if (edErr) loadError = edErr.message;

  const editionId = edition?.id as string | undefined;

  const teamsCountRes = await supabase
    .from("teams")
    .select("id", { count: "exact", head: true });

  const resultsSyncRes = await supabase
    .from("results")
    .select("id", { count: "exact", head: true })
    .eq("source", "sync");

  const resultsManualRes = await supabase
    .from("results")
    .select("id", { count: "exact", head: true })
    .eq("source", "manual");

  const resultsLockedRes = await supabase
    .from("results")
    .select("id", { count: "exact", head: true })
    .eq("locked", true);

  const ledgerMaxRes = await supabase
    .from("points_ledger")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const predMaxRes = await supabase
    .from("predictions")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const resultResolvedMaxRes = await supabase
    .from("results")
    .select("resolved_at")
    .order("resolved_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let matchesTotal: number | null = null;
  let matchesFinished: number | null = null;
  let matchesSyncLocked: number | null = null;
  let lastMatchSyncAt: string | null = null;

  if (editionId) {
    const [mt, mf, ms, ls] = await Promise.all([
      supabase
        .from("tournament_matches")
        .select("id", { count: "exact", head: true })
        .eq("edition_id", editionId),
      supabase
        .from("tournament_matches")
        .select("id", { count: "exact", head: true })
        .eq("edition_id", editionId)
        .eq("status", "finished"),
      supabase
        .from("tournament_matches")
        .select("id", { count: "exact", head: true })
        .eq("edition_id", editionId)
        .eq("sync_locked", true),
      supabase
        .from("tournament_matches")
        .select("last_sync_at")
        .eq("edition_id", editionId)
        .not("last_sync_at", "is", null)
        .order("last_sync_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (mt.error && !loadError) loadError = mt.error.message;
    if (mf.error && !loadError) loadError = mf.error.message;
    if (ms.error && !loadError) loadError = ms.error.message;
    if (ls.error && !loadError) loadError = ls.error.message;

    matchesTotal = mt.count ?? 0;
    matchesFinished = mf.count ?? 0;
    matchesSyncLocked = ms.count ?? 0;
    lastMatchSyncAt = ls.data?.last_sync_at ?? null;
  }

  const aggErr =
    teamsCountRes.error?.message ??
    resultsSyncRes.error?.message ??
    resultsManualRes.error?.message ??
    resultsLockedRes.error?.message ??
    ledgerMaxRes.error?.message ??
    predMaxRes.error?.message ??
    resultResolvedMaxRes.error?.message;

  if (aggErr && !loadError) loadError = aggErr;

  const freshness = computeStandingsFreshness({
    lastLedgerAt: ledgerMaxRes.data?.created_at ?? null,
    lastPredictionUpdateAt: predMaxRes.data?.updated_at ?? null,
    lastResultResolvedAt: resultResolvedMaxRes.data?.resolved_at ?? null,
  });

  return (
    <PageContainer>
      <PageTitle
        title="Tournament status"
        description="A read-only overview of teams, matches, results, and how fresh the leaderboard looks. To pull new data in, use Tournament sync."
      />

      {sp.ok === "1" ? (
        <p className="mb-4 rounded-md border border-ash-accent/40 bg-ash-accent/10 px-3 py-2 text-sm text-ash-muted">
          Last sync finished successfully and the leaderboard was recalculated.
        </p>
      ) : null}
      {sp.err ? (
        <p
          className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          <span className="font-medium">Last sync error: </span>
          {sp.err}
        </p>
      ) : null}

      {!sp.ok && !sp.err ? (
        <p className="mb-4 text-xs text-ash-muted">
          After you run{" "}
          <Link href="/admin/tournament" className="ash-link">
            Tournament sync
          </Link>
          , success or error messages show here for this visit only.
        </p>
      ) : null}

      {loadError ? (
        <p className="mb-4 rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {loadError}
        </p>
      ) : null}

      <section className="ash-surface mb-6 space-y-3 p-4 text-sm text-ash-muted">
        <h2 className="text-base font-bold text-ash-text">Edition</h2>
        {edition ? (
          <ul className="space-y-1.5">
            <li>
              <span className="font-medium text-ash-text">Name: </span>
              {edition.name}{" "}
              <span className="text-ash-border-hover">({edition.code})</span>
            </li>
            <li>
              <span className="font-medium text-ash-text">Schedule window: </span>
              {edition.starts_on ?? "—"} → {edition.ends_on ?? "—"}
            </li>
            <li>
              <span className="font-medium text-ash-text">Record last updated: </span>
              {formatWhen(edition.updated_at)}
            </li>
          </ul>
        ) : (
          <p className="text-amber-200">
            Official tournament data for this edition is not installed yet.
            Contact whoever set up this site.
          </p>
        )}
      </section>

      <section className="ash-surface mb-6 p-4">
        <h2 className="mb-3 text-base font-bold text-ash-text">Counts</h2>
        <dl className="grid gap-2 text-sm text-ash-muted sm:grid-cols-2">
          <div className="flex justify-between gap-4 border-b border-ash-border py-2 sm:block sm:border-0 sm:py-0">
            <dt className="font-medium text-ash-text">Teams</dt>
            <dd>{teamsCountRes.count ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-ash-border py-2 sm:block sm:border-0 sm:py-0">
            <dt className="font-medium text-ash-text">Matches (edition)</dt>
            <dd>{editionId ? matchesTotal : "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-ash-border py-2 sm:block sm:border-0 sm:py-0">
            <dt className="font-medium text-ash-text">Matches finished</dt>
            <dd>{editionId ? matchesFinished : "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-ash-border py-2 sm:block sm:border-0 sm:py-0">
            <dt className="font-medium text-ash-text">Results from sync</dt>
            <dd>{resultsSyncRes.count ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-ash-border py-2 sm:block sm:border-0 sm:py-0">
            <dt className="font-medium text-ash-text">Results entered manually</dt>
            <dd>{resultsManualRes.count ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-ash-border py-2 sm:block sm:border-0 sm:py-0">
            <dt className="font-medium text-ash-text">Locked results (won’t auto-update)</dt>
            <dd>{resultsLockedRes.count ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 py-2 sm:block sm:py-0">
            <dt className="font-medium text-ash-text">Matches frozen for sync</dt>
            <dd>{editionId ? matchesSyncLocked : "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="ash-surface mb-6 space-y-3 p-4 text-sm text-ash-muted">
        <h2 className="text-base font-bold text-ash-text">Sync & standings</h2>
        <p>
          <span className="font-medium text-ash-text">
            Last time match data was synced:
          </span>{" "}
          {formatWhen(lastMatchSyncAt)}
        </p>
        <div className="rounded-md border border-ash-border bg-ash-body/40 px-3 py-2">
          <p className="font-medium text-ash-text">Leaderboard freshness</p>
          {freshness.ledgerEmpty ? (
            <p className="mt-2 text-amber-200">
              No scores calculated yet. Run{" "}
              <Link href="/admin/tournament" className="ash-link">
                Tournament sync
              </Link>{" "}
              or use <strong className="font-medium text-ash-text">Recalculate</strong>{" "}
              on each pool&apos;s Standings page (or Recalculate all pools on Tournament results).
            </p>
          ) : freshness.appearsCurrent ? (
            <p className="mt-2 text-ash-accent">
              Looks up to date. Last full score run:{" "}
              {formatWhen(freshness.lastLedgerAt)}. Latest pick change:{" "}
              {formatWhen(freshness.lastPredictionUpdateAt)}. Latest official
              result entered: {formatWhen(freshness.lastResultResolvedAt)}.
            </p>
          ) : (
            <p className="mt-2 text-amber-200">
              Something may have changed after the last score run (
              {formatWhen(freshness.lastLedgerAt)}). Run{" "}
              <Link href="/admin/tournament" className="ash-link">
                Tournament sync
              </Link>{" "}
              or recalculate from a pool&apos;s admin Standings page.
            </p>
          )}
          <p className="mt-2 text-xs text-ash-muted">
            This is an automatic check and may not catch every edge case (for
            example, scoring rule changes). If in doubt, recalculate the
            leaderboard.
          </p>
        </div>
      </section>

      {(resultsLockedRes.count ?? 0) > 0 || (matchesSyncLocked ?? 0) > 0 ? (
        <section className="mb-6 rounded-xl border border-amber-700/50 bg-amber-950/25 p-4 text-sm text-amber-100">
          <h2 className="text-base font-bold text-amber-50">Overrides in effect</h2>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {(resultsLockedRes.count ?? 0) > 0 ? (
              <li>
                {resultsLockedRes.count} locked result row
                {(resultsLockedRes.count ?? 0) === 1 ? "" : "s"} — automated sync
                will not replace those slots.
              </li>
            ) : null}
            {(matchesSyncLocked ?? 0) > 0 ? (
              <li>
                {matchesSyncLocked} match
                {(matchesSyncLocked ?? 0) === 1 ? "" : "es"} frozen for sync —
                automated updates will not overwrite scores for those games.
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <p className="text-sm text-ash-muted">
        <Link href="/admin/tournament" className="ash-link">
          Tournament sync
        </Link>
        {" · "}
        <Link href="/admin" className="ash-link">
          Admin home
        </Link>
      </p>
    </PageContainer>
  );
}
