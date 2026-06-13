"use client";

import { useEffect, useMemo, useState } from "react";
import type { TournamentMatchPublicRow } from "../../types/tournamentPublic";
import type { KnockoutPickSlotDraft } from "../../types/adminKnockoutPicks";
import type { Team } from "../../src/types/domain";
import {
  formatKickoffLocal,
  formatKickoffTimeOnly,
} from "@/lib/datetime/scheduleDisplay";
import { KickoffTimeDisplay } from "../datetime/KickoffTimeDisplay";
import { ScheduleMatchPickTeams } from "./ScheduleMatchPickTeams";

const TBD_DATE_KEY = "__kickoff_tbd__";

function statusPill(status: string): string {
  switch (status) {
    case "live":
      return "rounded-full border border-red-800/60 bg-red-950/50 px-2 py-0.5 text-xs font-medium text-red-200";
    case "scheduled":
      return "rounded-full bg-ash-accent/15 px-2 py-0.5 text-xs font-medium text-ash-accent";
    case "postponed":
    case "cancelled":
      return "rounded-full bg-amber-950/50 px-2 py-0.5 text-xs font-medium text-amber-100";
    default:
      return "rounded-full bg-ash-surface px-2 py-0.5 text-xs font-medium text-ash-muted";
  }
}

function localDateGroupKey(iso: string | null | undefined): string {
  if (iso == null || iso === "") return TBD_DATE_KEY;
  const parts = formatKickoffLocal(iso);
  if (!parts.dateLine) return TBD_DATE_KEY;
  return parts.dateLine;
}

type DateGroup = {
  key: string;
  label: string;
  matches: TournamentMatchPublicRow[];
};

function groupMatchesByLocalDate(
  matches: TournamentMatchPublicRow[],
): DateGroup[] {
  const groups: DateGroup[] = [];
  const indexByKey = new Map<string, number>();

  for (const match of matches) {
    const key = localDateGroupKey(match.kickoff_at);
    const label = key === TBD_DATE_KEY ? "Time TBD" : key;
    const existing = indexByKey.get(key);
    if (existing == null) {
      indexByKey.set(key, groups.length);
      groups.push({ key, label, matches: [match] });
    } else {
      groups[existing]!.matches.push(match);
    }
  }

  return groups;
}

function UpcomingMatchRow({
  m,
  pickContext,
  showDateOnRow,
}: {
  m: TournamentMatchPublicRow;
  pickContext?: { slots: KnockoutPickSlotDraft[]; teams: Team[] } | null;
  showDateOnRow: boolean;
}) {
  const meta = [m.stage_label];
  if (m.group_code) meta.push(`Group ${m.group_code}`);

  const timeOnly =
    m.kickoff_at && !Number.isNaN(new Date(m.kickoff_at).getTime())
      ? formatKickoffTimeOnly(m.kickoff_at)
      : "";

  return (
    <li className="border-b border-ash-border py-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ash-muted">{meta.join(" · ")}</p>
        <span className={statusPill(m.status)}>{m.status}</span>
      </div>
      {showDateOnRow ? (
        <p className="mt-1 text-sm text-ash-muted">
          <KickoffTimeDisplay iso={m.kickoff_at} emptyLabel="Time TBD" />
        </p>
      ) : timeOnly ? (
        <p className="mt-1 text-sm font-medium text-ash-text">{timeOnly}</p>
      ) : (
        <p className="mt-1 text-sm text-ash-muted">Time TBD</p>
      )}
      <div className="mt-2">
        <ScheduleMatchPickTeams m={m} pickContext={pickContext} className="min-w-0" />
      </div>
    </li>
  );
}

type Props = {
  matches: TournamentMatchPublicRow[];
  pickContext?: { slots: KnockoutPickSlotDraft[]; teams: Team[] } | null;
};

export function UpcomingMatchesSchedule({ matches, pickContext }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dateGroups = useMemo(
    () => (mounted ? groupMatchesByLocalDate(matches) : null),
    [mounted, matches],
  );

  if (matches.length === 0) {
    return (
      <p className="text-sm text-ash-muted">No scheduled matches left in the dataset.</p>
    );
  }

  if (!mounted || dateGroups == null) {
    return (
      <ul>
        {matches.map((m) => (
          <UpcomingMatchRow
            key={m.match_id}
            m={m}
            pickContext={pickContext}
            showDateOnRow
          />
        ))}
      </ul>
    );
  }

  if (dateGroups.length === 0) {
    return (
      <p className="text-sm text-ash-muted">No scheduled matches left in the dataset.</p>
    );
  }

  return (
    <div className="space-y-5">
      {dateGroups.map((group) => (
        <section key={group.key}>
          <h3 className="text-sm font-semibold text-ash-text">{group.label}</h3>
          <ul className="mt-1">
            {group.matches.map((m) => (
              <UpcomingMatchRow
                key={m.match_id}
                m={m}
                pickContext={pickContext}
                showDateOnRow={group.key === TBD_DATE_KEY}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
