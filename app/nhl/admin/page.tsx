import {
  createNhlBracketSkeletonAction,
  createNhlInitialEditionAction,
  seedNhlStarterTeamsAction,
} from "./actions";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import {
  countNhlSeriesForEdition,
  countNhlTeamsForEdition,
  fetchActiveNhlEdition,
} from "@/lib/nhl/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ ok?: string; err?: string }>;
};

const OK_MESSAGES: Record<string, string> = {
  edition_created: "Created the default NHL playoff edition and set it active.",
  teams_seeded: "Inserted starter NHL teams for the active edition.",
  skeleton_created: "Created empty bracket series rows (R1 → Stanley Cup Final).",
};

const ERR_MESSAGES: Record<string, string> = {
  edition_slug_exists:
    "An edition with the default slug already exists. Use the Editions page or SQL if you need a different setup.",
  no_active_edition: "No active NHL edition. Create an edition first.",
  teams_already_seeded: "This edition already has team rows; starter seed was skipped.",
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

export default async function NhlAdminPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const flash = describeFlash(sp.ok, sp.err);

  const supabase = await createClient();
  const { edition, error: edErr } = await fetchActiveNhlEdition(supabase);

  let teamCount = 0;
  let seriesCount = 0;
  let countErr: string | null = null;

  if (edition) {
    const [tc, sc] = await Promise.all([
      countNhlTeamsForEdition(supabase, edition.id),
      countNhlSeriesForEdition(supabase, edition.id),
    ]);
    if (tc.error || sc.error) {
      countErr = tc.error ?? sc.error ?? null;
    } else {
      teamCount = tc.count;
      seriesCount = sc.count;
    }
  }

  return (
    <PageContainer>
      <PageTitle
        title="NHL Admin"
        description="Internal setup for the isolated NHL playoff section. Requires a global AshBracket administrator (app_admins). No participant picks or scoring runs here yet."
      />

      {edErr ? (
        <p className="rounded-md border border-amber-800/80 bg-amber-950/40 px-3 py-2 text-sm text-amber-100">
          Could not load NHL editions ({edErr}). If this is a fresh environment,
          apply Supabase migrations (including{" "}
          <code className="rounded bg-slate-900/80 px-1">20260422120000_nhl_phase2_foundation.sql</code>
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

      <div className="grid gap-4 sm:grid-cols-3">
        <AdminCard
          title="Active edition"
          body={
            edition ? (
              <>
                <p className="font-medium text-ash-text">{edition.season_label}</p>
                <p className="mt-1 text-xs text-ash-muted">
                  Slug <code className="text-ash-text">{edition.slug}</code>
                </p>
              </>
            ) : (
              <p className="text-sm text-ash-muted">None — create an edition below.</p>
            )
          }
        />
        <AdminCard
          title="Teams"
          body={
            <p className="text-2xl font-semibold tabular-nums text-ash-text">
              {edition ? teamCount : "—"}
            </p>
          }
          footer={
            edition ? (
              <Link href="/nhl/admin/teams" className="ash-link text-sm">
                Inspect teams
              </Link>
            ) : null
          }
        />
        <AdminCard
          title="Series"
          body={
            <p className="text-2xl font-semibold tabular-nums text-ash-text">
              {edition ? seriesCount : "—"}
            </p>
          }
          footer={
            edition ? (
              <Link href="/nhl/admin/series" className="ash-link text-sm">
                Bracket / series table
              </Link>
            ) : null
          }
        />
      </div>

      <section className="rounded-lg border border-blue-500/25 bg-slate-950/50 p-4">
        <h2 className="text-sm font-semibold text-ash-text">Section shortcuts</h2>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-ash-muted">
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
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-ash-text">Setup actions</h2>
        <p className="text-sm text-ash-muted">
          Run these in order for a blank bracket: edition → starter teams → skeleton.
          Alternatively, from <code className="text-ash-text">ashbracket/</code> run{" "}
          <code className="text-ash-text">npm run seed:nhl-phase2</code> with a service
          role key (bypasses RLS; useful locally).
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <form action={createNhlInitialEditionAction}>
            <button
              type="submit"
              className="rounded-md border border-blue-500/40 bg-blue-600/25 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-blue-600/40"
            >
              Create initial NHL playoff edition
            </button>
          </form>
          <form action={seedNhlStarterTeamsAction}>
            <button
              type="submit"
              className="rounded-md border border-blue-500/40 bg-slate-800/80 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700/80"
            >
              Load starter NHL teams
            </button>
          </form>
          <form action={createNhlBracketSkeletonAction}>
            <button
              type="submit"
              className="rounded-md border border-blue-500/40 bg-slate-800/80 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700/80"
            >
              Create empty bracket skeleton
            </button>
          </form>
        </div>
      </section>
    </PageContainer>
  );
}

function AdminCard({
  title,
  body,
  footer,
}: {
  title: string;
  body: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-blue-500/20 bg-slate-950/40 p-4 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      <div className="mt-2">{body}</div>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
}
