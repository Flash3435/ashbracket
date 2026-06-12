import { NhlDraft26PickSlotTeam } from "@/components/nhldraft26/NhlDraft26PickSlotTeam";
import type { NhlDraft26PickSlot } from "@/lib/nhldraft26/draftOrder";
import { getNhlDraft26ConsensusTop10Ids } from "@/lib/nhldraft26/prospects";
import type { NhlDraft26Prospect } from "@/lib/nhldraft26/prospectsSeed";
import Link from "next/link";

type Props = {
  pickSlots: NhlDraft26PickSlot[];
  prospectById: Map<string, NhlDraft26Prospect>;
};

export function NhlDraft26SeedConsensusBoard({ pickSlots, prospectById }: Props) {
  const consensusIds = getNhlDraft26ConsensusTop10Ids();

  return (
    <div className="space-y-6">
      <section className="ash-surface px-4 py-5 sm:px-5">
        <p className="text-sm leading-relaxed text-slate-300">
          No public boards have been submitted yet. Be the first to submit and shape the community
          consensus.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/nhldraft26/picks" className="btn-primary no-underline">
            Make my picks
          </Link>
          <Link
            href="/nhldraft26/picks?quick=consensus"
            className="btn-ghost border-amber-500/25 no-underline"
          >
            Start with consensus top 10
          </Link>
        </div>
      </section>

      <section className="ash-surface px-4 py-4 sm:px-5">
        <h2 className="text-lg font-semibold text-ash-text">Seed consensus board</h2>
        <p className="mt-1 text-sm text-slate-400">
          Based on the current prospect seed rankings — real draft pick slots with team logos.
        </p>
        <ol className="mt-4 space-y-2">
          {pickSlots.map((slot, i) => {
            const prospectId = consensusIds[i];
            const p = prospectId ? prospectById.get(prospectId) : undefined;
            return (
              <li
                key={`seed-slot-${slot.pickNumber}`}
                className="rounded-lg border border-amber-500/20 bg-slate-950/50 px-3 py-2"
              >
                <NhlDraft26PickSlotTeam slot={slot} compact />
                <div className="mt-1 border-t border-slate-700/35 pt-1">
                  {p ? (
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ash-text">{p.name}</p>
                      <p className="truncate text-xs text-slate-400">
                        {p.position} · {p.teamLeague} · seed #{p.consensusRank}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">—</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
