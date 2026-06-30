import Link from "next/link";
import { ParticipantBracketView } from "@/components/bracket/ParticipantBracketView";
import { WideSectionBreakout } from "@/components/ui/WideSectionBreakout";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

type Props = {
  slots: KnockoutPickSlotDraft[];
  teams: Team[];
  knockoutBracketPicksUnlocked: boolean;
  tournamentMatches: TournamentMatchPublicRow[] | null | undefined;
  editPicksHref: string;
  knockoutPicksEditable: boolean;
  hasActionablePicks: boolean;
};

export function DashboardBracketTrackerCard({
  slots,
  teams,
  knockoutBracketPicksUnlocked,
  tournamentMatches,
  editPicksHref,
  knockoutPicksEditable,
  hasActionablePicks,
}: Props) {
  return (
    <WideSectionBreakout>
      <section className="rounded-xl border border-ash-border bg-ash-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-ash-text">Live bracket tracker</h2>
            <p className="mt-0.5 text-xs text-ash-muted">
              Your saved picks against live tournament results.
            </p>
          </div>
          {hasActionablePicks ? (
            knockoutPicksEditable ? (
              <Link href={editPicksHref} className="btn-primary inline-flex shrink-0 text-xs">
                Edit picks
              </Link>
            ) : (
              <Link
                href={editPicksHref}
                className="btn-ghost inline-flex shrink-0 text-xs ring-1 ring-ash-border"
              >
                View picks
              </Link>
            )
          ) : null}
        </div>

        <div className="mt-4">
          <ParticipantBracketView
            slots={slots}
            teams={teams}
            knockoutBracketPicksUnlocked={knockoutBracketPicksUnlocked}
            tournamentMatches={tournamentMatches}
            editPicksHref={knockoutPicksEditable ? editPicksHref : null}
            readOnly
            showIntro={false}
          />
        </div>
      </section>
    </WideSectionBreakout>
  );
}
