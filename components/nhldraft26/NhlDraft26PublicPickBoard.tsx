import { NhlDraft26PickSlotTeam } from "@/components/nhldraft26/NhlDraft26PickSlotTeam";
import type { NhlDraft26PickSlot } from "@/lib/nhldraft26/draftOrder";
import type { NhlDraft26Prospect } from "@/lib/nhldraft26/prospectsSeed";

type Props = {
  pickSlots: NhlDraft26PickSlot[];
  prospectIds: string[];
  prospectById: Map<string, NhlDraft26Prospect>;
};

export function NhlDraft26PublicPickBoard({
  pickSlots,
  prospectIds,
  prospectById,
}: Props) {
  return (
    <ol className="space-y-2">
      {pickSlots.map((slot, i) => {
        const prospectId = prospectIds[i];
        const p = prospectId ? prospectById.get(prospectId) : undefined;
        return (
          <li
            key={`public-pick-${slot.pickNumber}`}
            className="rounded-lg border border-amber-500/20 bg-slate-950/50 px-3 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <NhlDraft26PickSlotTeam slot={slot} compact />
              <div className="min-w-0 flex-1 text-right">
                {p ? (
                  <>
                    <p className="truncate text-sm font-medium text-ash-text">{p.name}</p>
                    <p className="truncate text-xs text-slate-400">
                      {p.position} · {p.teamLeague}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">—</p>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
