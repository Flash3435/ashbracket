import {
  NHL_DRAFT26_PROSPECTS_SEED,
  type NhlDraft26Prospect,
} from "@/lib/nhldraft26/prospectsSeed";
import { NHL_DRAFT26_PICK_COUNT } from "@/lib/nhldraft26/config";

export type { NhlDraft26Prospect };

export function getNhlDraft26ProspectPool(): NhlDraft26Prospect[] {
  return [...NHL_DRAFT26_PROSPECTS_SEED].sort(
    (a, b) => a.consensusRank - b.consensusRank,
  );
}

export function getNhlDraft26ProspectById(
  id: string,
): NhlDraft26Prospect | undefined {
  return NHL_DRAFT26_PROSPECTS_SEED.find((p) => p.id === id);
}

export function getNhlDraft26ConsensusTop10Ids(): string[] {
  return getNhlDraft26ProspectPool()
    .slice(0, NHL_DRAFT26_PICK_COUNT)
    .map((p) => p.id);
}

export function buildNhlDraft26ProspectMap(): Map<string, NhlDraft26Prospect> {
  return new Map(NHL_DRAFT26_PROSPECTS_SEED.map((p) => [p.id, p]));
}
