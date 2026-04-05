import { AccountPicksProfileLinks } from "@/components/account/AccountPicksProfileLinks";
import { ParticipantKnockoutPicksForm } from "@/components/admin/ParticipantKnockoutPicksForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { buildKnockoutPickSlotDrafts } from "../../../lib/predictions/knockoutPickSlots";
import {
  mapParticipantRow,
  type ParticipantRow,
} from "../../../lib/participants/participantsDb";
import {
  mapTeamRow,
  mapTournamentStageRow,
} from "../../../lib/results/mapRows";
import { mapPredictionRow } from "../../../src/lib/scoring/mapSupabaseRows";
import type { Prediction, Team, TournamentStage } from "../../../src/types/domain";
import type { Participant } from "../../../types/participant";
import Link from "next/link";
import { redirect } from "next/navigation";
import { saveMyKnockoutPicksAction } from "./actions";

export const dynamic = "force-dynamic";

const STAGE_CODES_NEEDED = ["quarterfinal", "semifinal", "final"] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PageProps = {
  searchParams: Promise<{ participant?: string }>;
};

type PoolEmbed = { name: string; lock_at: string | null } | null;

function embeddedPool(
  raw: { name: string; lock_at: string | null } | { name: string; lock_at: string | null }[] | null | undefined,
): PoolEmbed {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

function poolLocked(lockAt: string | null | undefined): boolean {
  if (lockAt == null || lockAt === "") return false;
  const t = new Date(lockAt).getTime();
  if (Number.isNaN(t)) return false;
  return t <= Date.now();
}

export default async function AccountPicksPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/account/picks");
  }

  const participantParam = sp.participant?.trim() ?? "";

  let myParticipants: Array<{
    id: string;
    display_name: string;
    email: string | null;
    is_paid: boolean;
    paid_at: string | null;
    pool_id: string;
    pools: PoolEmbed;
  }> = [];
  let teams: Team[] = [];
  let stages: TournamentStage[] = [];
  let predictions: Prediction[] = [];
  let loadError: string | null = null;

  try {
    const { data: rows, error: parErr } = await supabase
      .from("participants")
      .select(
        `
        id,
        display_name,
        email,
        is_paid,
        paid_at,
        pool_id,
        pools (
          name,
          lock_at
        )
      `,
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (parErr) loadError = parErr.message;
    else {
      myParticipants = (rows ?? []).map((r) => ({
        id: r.id as string,
        display_name: r.display_name as string,
        email: r.email as string | null,
        is_paid: Boolean(r.is_paid),
        paid_at: (r.paid_at as string | null) ?? null,
        pool_id: r.pool_id as string,
        pools: embeddedPool(
          r.pools as
            | { name: string; lock_at: string | null }
            | { name: string; lock_at: string | null }[]
            | null
            | undefined,
        ),
      }));
    }

    if (!loadError) {
      const [teamsRes, stagesRes] = await Promise.all([
        supabase
          .from("teams")
          .select("id, name, country_code, fifa_code, created_at, updated_at")
          .order("name", { ascending: true }),
        supabase
          .from("tournament_stages")
          .select(
            "id, code, label, sort_order, starts_at, ends_at, created_at, updated_at",
          )
          .in("code", [...STAGE_CODES_NEEDED])
          .order("sort_order", { ascending: true }),
      ]);

      if (teamsRes.error) loadError = teamsRes.error.message;
      else if (stagesRes.error) loadError = stagesRes.error.message;
      else {
        teams = (teamsRes.data ?? []).map(mapTeamRow);
        stages = (stagesRes.data ?? []).map(mapTournamentStageRow);
      }
    }

    if (!loadError) {
      for (const code of STAGE_CODES_NEEDED) {
        if (!stages.some((s) => s.code === code)) {
          loadError = `Missing tournament stage "${code}" in Supabase. Seed or migrate tournament_stages.`;
          break;
        }
      }
    }
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Failed to load your picks page.";
  }

  const profileIds = new Set(myParticipants.map((p) => p.id));

  const paramId =
    participantParam && UUID_RE.test(participantParam) ? participantParam : null;

  let selectedId: string | null = null;
  if (paramId && profileIds.has(paramId)) {
    selectedId = paramId;
  } else if (!paramId && myParticipants.length === 1) {
    selectedId = myParticipants[0].id;
  }

  // If user passed a UUID that isn't theirs, treat as invalid selection (show picker / message).
  const invalidOtherProfile =
    Boolean(participantParam) &&
    UUID_RE.test(participantParam) &&
    !profileIds.has(participantParam);

  let selectedParticipant: Participant | null = null;
  let selectedPoolName = "";
  let selectedLockAt: string | null = null;

  if (!loadError && selectedId) {
    const row = myParticipants.find((p) => p.id === selectedId);
    if (row) {
      selectedParticipant = mapParticipantRow({
        id: row.id,
        pool_id: row.pool_id,
        display_name: row.display_name,
        email: row.email,
        is_paid: row.is_paid,
        paid_at: row.paid_at,
      } as ParticipantRow);
      selectedPoolName = row.pools?.name ?? "Pool";
      selectedLockAt = row.pools?.lock_at ?? null;

      const { data: predData, error: predErr } = await supabase
        .from("predictions")
        .select(
          "id, pool_id, participant_id, prediction_kind, team_id, tournament_stage_id, group_code, slot_key, bonus_key, value_text, created_at, updated_at",
        )
        .eq("pool_id", row.pool_id)
        .eq("participant_id", selectedId)
        .in("prediction_kind", [
          "quarterfinalist",
          "semifinalist",
          "finalist",
          "champion",
        ]);

      if (predErr) loadError = predErr.message;
      else {
        type PredRow = Parameters<typeof mapPredictionRow>[0];
        predictions = (predData ?? []).map((r) =>
          mapPredictionRow(r as PredRow),
        );
      }
    }
  }

  const stageByCode = Object.fromEntries(
    stages.map((s) => [s.code, s]),
  ) as Partial<Record<TournamentStage["code"], TournamentStage>>;

  const initialSlots =
    selectedParticipant && !loadError
      ? buildKnockoutPickSlotDrafts(
          stageByCode,
          predictions,
          selectedParticipant.id,
        )
      : [];

  const locked = poolLocked(selectedLockAt);
  const lockHint =
    locked && selectedLockAt
      ? `Picks locked on ${new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(selectedLockAt))}.`
      : locked
        ? "This pool is locked — picks can no longer be changed."
        : null;

  const profileLinkItems = myParticipants.map((p) => ({
    id: p.id,
    displayName: p.display_name,
    poolName: p.pools?.name ?? "Pool",
  }));

  const invalidQuery =
    Boolean(participantParam) && !UUID_RE.test(participantParam);

  return (
    <PageContainer>
      <div className="mb-6">
        <Link
          href="/account"
          className="text-sm font-medium text-emerald-700 underline-offset-4 hover:underline"
        >
          ← Back to account
        </Link>
      </div>

      <PageTitle
        title="Your picks"
        description="Walk through quarter-finals, semis, the final, and your champion — with quick starter options if you want a nudge. Edits apply until the pool lock time."
      />

      {loadError ? (
        <p
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {loadError}
        </p>
      ) : null}

      {invalidQuery ? (
        <p
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="alert"
        >
          The profile id in the URL is not a valid UUID.
        </p>
      ) : null}

      {invalidOtherProfile ? (
        <p
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="alert"
        >
          That profile is not linked to your account. Choose one of your profiles
          below.
        </p>
      ) : null}

      {!loadError && myParticipants.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-zinc-700">
            You do not have a pool profile yet. Join with a code to create one,
            then return here to enter picks.
          </p>
          <Link
            href="/join"
            className="mt-4 inline-flex rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-800"
          >
            Join a pool
          </Link>
        </div>
      ) : null}

      {!loadError && myParticipants.length > 0 ? (
        <>
          <AccountPicksProfileLinks
            profiles={profileLinkItems}
            selectedId={selectedId}
          />

          {!selectedId && myParticipants.length > 1 ? (
            <p className="text-sm text-zinc-600">
              Select which pool profile you want to view or edit.
            </p>
          ) : null}

          {selectedId && selectedParticipant && !loadError ? (
            <>
              <p className="mb-4 text-sm text-zinc-600">
                Pool:{" "}
                <span className="font-medium text-zinc-900">
                  {selectedPoolName}
                </span>
                {locked ? (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                    Locked
                  </span>
                ) : (
                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                    Open for picks
                  </span>
                )}
              </p>

              {predictions.length === 0 && !locked ? (
                <p className="mb-6 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                  No saved knockout picks yet — all slots start empty. Choose a
                  team per slot, then save.
                </p>
              ) : null}

              <ParticipantKnockoutPicksForm
                participantId={selectedParticipant.id}
                participantDisplayName={selectedParticipant.displayName}
                initialSlots={initialSlots}
                teams={teams}
                disabled={teams.length === 0}
                readOnly={locked}
                lockedMessage={lockHint}
                savePicks={saveMyKnockoutPicksAction}
                successMessage="Saved. Your picks, leaderboard, and public profile are updated."
              />

              {teams.length === 0 ? (
                <p className="mt-4 text-sm text-amber-800">
                  Teams are not loaded yet. Ask an organizer or check Supabase
                  seeds.
                </p>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </PageContainer>
  );
}
