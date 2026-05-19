import {
  createNhlBracketSkeletonAction,
  createNhlInitialEditionAction,
  loadOfficial2026PlayoffTeamsAction,
  repairOfficial2026NhlEditionAction,
} from "./actions";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { getOfficial2026EditionTeamStatus } from "@/lib/nhl/official2026Edition";
import {
  countNhlMembershipsForEdition,
  countNhlSeriesForEdition,
  countNhlTeamsForEdition,
  fetchActiveNhlEdition,
  fetchNhlTeamSlugsForEdition,
} from "@/lib/nhl/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ ok?: string; err?: string }>;
};

const OK_MESSAGES: Record<string, string> = {
  edition_created: "Created the default NHL playoff edition and set it active.",
  teams_seeded:
    "Inserted the official 2026 Stanley Cup Playoffs 16-team field for the active edition.",
  edition_repaired_official_2026:
    "Replaced teams with the official 2026 playoff field, ensured the bracket skeleton, and wired Round 1 matchups.",
  skeleton_created:
    "Created bracket series rows (Round 1 through Stanley Cup Final) and wired Round 1 to the official 2026 matchups.",
  skeleton_created_needs_teams:
    "Bracket skeleton created. Load the official 2026 teams (or run Repair) so Round 1 labels populate.",
};

const ERR_MESSAGES: Record<string, string> = {
  edition_slug_exists:
    "An edition with the default slug already exists. Use the Editions page or SQL if you need a different setup.",
  no_active_edition: "No active NHL edition. Create an edition first.",
  teams_already_seeded:
    "This edition already has team rows. Use “Repair active edition to official 2026 field” to replace incorrect clubs.",
  skeleton_already_exists:
    "Series rows already exist for the active edition; skeleton create was skipped.",
};

function describeFlash(ok?: string, err?: string): string | null {
  if (err) {
    if (ERR_MESSAGES[err]) return ERR_MESSAGES[err];
    if (err.startsWith("insert:") || err.startsWith("deactivate:")) {
      return err;
    }
    try {
      return decodeURIComponent(err);
    } catch {
      return err;
    }
  }
  if (ok) {
    if (OK_MESSAGES[ok]) return OK_MESSAGES[ok];
    return `Done (${ok}).`;
  }
  return null;
}

type FieldStatus = ReturnType<typeof getOfficial2026EditionTeamStatus> | null;

function activeEditionStatusLine(fieldStatus: FieldStatus): string {
  if (fieldStatus === "official_2026") {
    return "Official 2026 Stanley Cup Playoffs field";
  }
  if (fieldStatus === "empty") {
    return "No teams on this edition yet";
  }
  if (fieldStatus === "non_official") {
    return "Team list does not match the official 2026 field";
  }
  return "—";
}

export default async function NhlAdminPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const flash = describeFlash(sp.ok, sp.err);

  const supabase = await createClient();
  const { edition, error: edErr } = await fetchActiveNhlEdition(supabase);

  let teamCount = 0;
  let seriesCount = 0;
  let competitorCount = 0;
  let countErr: string | null = null;
  let fieldStatus: FieldStatus = null;

  if (edition) {
    const [tc, sc, mc, slugRes] = await Promise.all([
      countNhlTeamsForEdition(supabase, edition.id),
      countNhlSeriesForEdition(supabase, edition.id),
      countNhlMembershipsForEdition(supabase, edition.id),
      fetchNhlTeamSlugsForEdition(supabase, edition.id),
    ]);
    if (tc.error || sc.error || mc.error || slugRes.error) {
      countErr = tc.error ?? sc.error ?? mc.error ?? slugRes.error ?? null;
    } else {
      teamCount = tc.count;
      seriesCount = sc.count;
      competitorCount = mc.count;
      fieldStatus = getOfficial2026EditionTeamStatus(
        slugRes.slugs.map((team_slug) => ({ team_slug })),
      );
    }
  }

  const officialBanner =
    edition && fieldStatus === "official_2026" ? (
      <div className="rounded-md border border-emerald-700/40 bg-emerald-950/25 px-3 py-2 text-sm text-emerald-100/95">
        <span className="font-medium">Official 2026 field loaded.</span>{" "}
        <span className="text-emerald-100/80">
          Round 1 reflects seeded pairings from the database; later rounds fill in as winners are
          assigned.
        </span>
      </div>
    ) : null;

  const attentionBanner =
    edition && fieldStatus === "non_official" ? (
      <div className="rounded-md border border-amber-700/45 bg-amber-950/20 px-3 py-2 text-sm text-amber-100/95">
        <span className="font-medium">Edition needs attention.</span>{" "}
        Teams do not match the official 2026 set. Use Maintenance → Repair to align the active
        edition.
      </div>
    ) : edition && fieldStatus === "empty" ? (
      <div className="rounded-md border border-slate-600/50 bg-slate-950/45 px-3 py-2 text-sm text-slate-300">
        <span className="font-medium text-slate-200">No teams yet.</span>{" "}
        Load the official 2026 field from Maintenance when you are ready to populate this edition.
      </div>
    ) : null;

  return (
    <PageContainer>
      <PageTitle
        title="NHL Admin"
        description="Manage the NHL playoff edition, teams, and bracket structure."
      />
      <p className="max-w-2xl text-sm leading-relaxed text-ash-muted">
        Manage the active NHL edition, bracket results, and global competition entry. Competitors
        join the edition directly (no private NHL pools).
      </p>

      <div className="mt-6 space-y-4">
        {edErr ? (
          <p className="rounded-md border border-amber-800/80 bg-amber-950/40 px-3 py-2 text-sm text-amber-100">
            Could not load NHL editions ({edErr}). If this is a fresh environment, apply Supabase
            migrations (including{" "}
            <code className="rounded bg-slate-900/80 px-1">
              20260422120000_nhl_phase2_foundation.sql
            </code>
            ).
          </p>
        ) : null}

        {countErr ? (
          <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {countErr}
          </p>
        ) : null}

        {flash ? (
          <p
            className={`rounded-md border px-3 py-2 text-sm ${
              sp.err
                ? "border-red-800/80 bg-red-950/40 text-red-100"
                : "border-emerald-800/80 bg-emerald-950/40 text-emerald-100"
            }`}
          >
            {flash}
          </p>
        ) : null}

        {officialBanner}
        {!officialBanner ? attentionBanner : null}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Active edition"
          body={
            edition ? (
              <>
                <p className="font-medium text-ash-text">{edition.season_label}</p>
                <p className="mt-1 font-mono text-xs text-ash-muted">{edition.slug}</p>
                <p className="mt-3 border-t border-blue-500/15 pt-2 text-xs text-ash-muted">
                  <span className="text-slate-500">Status: </span>
                  {activeEditionStatusLine(fieldStatus)}
                </p>
              </>
            ) : (
              <p className="text-sm text-ash-muted">No active edition.</p>
            )
          }
          footer={
            edition ? (
              <Link href="/nhl/admin/editions" className="ash-link text-sm">
                Manage editions
              </Link>
            ) : null
          }
        />
        <DashboardCard
          title="Teams"
          body={
            <p className="text-2xl font-semibold tabular-nums text-ash-text">
              {edition ? teamCount : "—"}
            </p>
          }
          footer={
            edition ? (
              <Link href="/nhl/admin/teams" className="ash-link text-sm">
                View teams
              </Link>
            ) : null
          }
        />
        <DashboardCard
          title="Series"
          body={
            <p className="text-2xl font-semibold tabular-nums text-ash-text">
              {edition ? seriesCount : "—"}
            </p>
          }
          footer={
            edition ? (
              <Link href="/nhl/admin/series" className="ash-link text-sm">
                Series table
              </Link>
            ) : null
          }
        />
        <DashboardCard
          title="Competitors"
          body={
            <p className="text-2xl font-semibold tabular-nums text-ash-text">
              {edition ? competitorCount : "—"}
            </p>
          }
          footer={
            edition ? (
              <p className="text-xs text-ash-muted">
                Users who joined the active edition (global competition).
              </p>
            ) : null
          }
        />
        <DashboardCard
          title="Bracket"
          body={
            <p className="text-sm text-ash-muted">
              {edition && seriesCount > 0
                ? "Read-only conference columns through the Stanley Cup Final."
                : edition
                  ? "No series rows yet — the page opens for a preview; use Maintenance if you need to create the skeleton."
                  : "Available once an active edition exists."}
            </p>
          }
          footer={
            edition ? (
              <Link href="/nhl/admin/bracket" className="ash-link text-sm font-medium text-blue-200">
                Open bracket
              </Link>
            ) : null
          }
        />
      </div>

      <section className="mt-8 rounded-lg border border-blue-500/25 bg-slate-950/50 p-4">
        <h2 className="text-sm font-semibold text-ash-text">Quick links</h2>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <li>
            <Link href="/nhl/admin/editions" className="ash-link">
              Editions
            </Link>
          </li>
          <li>
            <Link href="/nhl/admin/teams" className="ash-link">
              Teams
            </Link>
          </li>
          <li>
            <Link href="/nhl/admin/series" className="ash-link">
              Series
            </Link>
            <span className="ml-1 text-xs text-ash-muted">(table)</span>
          </li>
          <li>
            <Link href="/nhl/admin/bracket" className="ash-link font-medium text-blue-200">
              Bracket
            </Link>
            <span className="ml-1 text-xs text-ash-muted">(visual overview)</span>
          </li>
        </ul>
      </section>

      <section className="mt-8 rounded-lg border border-dashed border-slate-700/60 bg-slate-950/25 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Maintenance</h2>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-500">
          Recovery and seeding tools for new environments, replacing legacy data, or rebuilding the
          bracket skeleton. Day-to-day review is usually the dashboard above, the bracket view, and
          the series table.
        </p>
        <p className="mt-2 text-[11px] text-slate-600">
          CLI (service role), from <code className="text-slate-500">ashbracket/</code>:{" "}
          <code className="text-slate-500">npm run seed:nhl-phase2</code> ·{" "}
          <code className="text-slate-500">npm run repair:nhl-2026-official</code>
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <form action={createNhlInitialEditionAction}>
            <button
              type="submit"
              className="rounded-md border border-slate-700/80 bg-slate-900/50 px-3 py-1.5 text-xs font-medium text-slate-400 hover:border-slate-600 hover:bg-slate-900/80 hover:text-slate-200"
            >
              Create initial NHL playoff edition
            </button>
          </form>
          <form action={loadOfficial2026PlayoffTeamsAction}>
            <button
              type="submit"
              className="rounded-md border border-slate-700/80 bg-slate-900/50 px-3 py-1.5 text-xs font-medium text-slate-400 hover:border-slate-600 hover:bg-slate-900/80 hover:text-slate-200"
            >
              Load official 2026 playoff teams
            </button>
          </form>
          <form action={createNhlBracketSkeletonAction}>
            <button
              type="submit"
              className="rounded-md border border-slate-700/80 bg-slate-900/50 px-3 py-1.5 text-xs font-medium text-slate-400 hover:border-slate-600 hover:bg-slate-900/80 hover:text-slate-200"
            >
              Create bracket skeleton
            </button>
          </form>
          <form action={repairOfficial2026NhlEditionAction}>
            <button
              type="submit"
              className="rounded-md border border-amber-800/40 bg-amber-950/25 px-3 py-1.5 text-xs font-medium text-amber-200/90 hover:bg-amber-950/45"
            >
              Repair active edition to official 2026 field
            </button>
          </form>
        </div>
      </section>
    </PageContainer>
  );
}

function DashboardCard({
  title,
  body,
  footer,
}: {
  title: string;
  body: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-blue-500/25 bg-slate-950/50 p-4 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <div className="mt-2">{body}</div>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
}
