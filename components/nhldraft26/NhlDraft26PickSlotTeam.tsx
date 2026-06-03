"use client";

import { NhlTeamLogo } from "@/components/nhl/NhlTeamLogo";
import type { NhlDraft26PickSlot } from "@/lib/nhldraft26/draftOrder";

type Props = {
  slot: NhlDraft26PickSlot;
  compact?: boolean;
};

/**
 * Draft slot team row — reuses NHL playoff logo resolver when a local asset exists;
 * otherwise shows abbreviation badge (no remote URLs).
 */
export function NhlDraft26PickSlotTeam({ slot, compact = false }: Props) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <NhlTeamLogo
        size={compact ? "sm" : "sm"}
        teamSlug={slot.teamSlug}
        abbreviation={slot.teamAbbreviation}
        logoPath={slot.logoPath}
        name={slot.teamName}
      />
      <div className="min-w-0">
        <p
          className={`truncate font-semibold text-amber-100/95 ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          {slot.pickNumber} — {slot.teamName}
        </p>
        {!compact ? (
          <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">
            {slot.teamAbbreviation}
          </p>
        ) : null}
      </div>
    </div>
  );
}
