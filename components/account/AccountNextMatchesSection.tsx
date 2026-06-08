import type { ReactNode } from "react";
import { ParticipantPicksNextMatches } from "@/components/picks/ParticipantPicksNextMatches";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";

type Props = {
  title: string;
  description: ReactNode;
  tournamentErr: string | null;
  matches: TournamentMatchPublicRow[];
  initialSlots: KnockoutPickSlotDraft[];
  teams: Team[];
  /** e.g. ash-surface or bordered card */
  className?: string;
  /** Appended after the error reason (e.g. reassurance copy). */
  tournamentErrorSuffix?: string;
};

export function AccountNextMatchesSection({
  title,
  description,
  tournamentErr,
  matches,
  initialSlots,
  teams,
  className = "ash-surface p-4",
  tournamentErrorSuffix = "",
}: Props) {
  return (
    <section className={className}>
      <h2 className="text-base font-bold text-ash-text">{title}</h2>
      <div className="mt-1 text-xs text-ash-muted">{description}</div>
      {tournamentErr ? (
        <p className="mt-3 text-sm text-amber-200" role="status">
          Schedule could not be loaded ({tournamentErr}).
          {tournamentErrorSuffix ? ` ${tournamentErrorSuffix}` : ""}
        </p>
      ) : (
        <div className="mt-3">
          <ParticipantPicksNextMatches
            matches={matches}
            initialSlots={initialSlots}
            teams={teams}
          />
        </div>
      )}
    </section>
  );
}
