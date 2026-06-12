import { createServiceRoleClient } from "@/lib/supabase/service";
import type { WcLedgerRecomputeTrigger } from "@/lib/scoring/recomputePoolLedger";
import { buildScoreImpactCommentary } from "./buildScoreImpactCommentary";
import { detectScoreImpact, scoreImpactHasMeaningfulChange } from "./detectScoreImpact";
import {
  buildScoreImpactDedupKey,
  buildScoreSignatureFromMatches,
} from "./scoreImpactDedupKey";
import {
  countGroupAdvancePicksForTeam,
  loadParticipantNamesById,
  loadTeamNameMapForEdition,
} from "./loadScoreImpactContext";
import { isScoreImpactLedgerTrigger, poolMatchesEditionSimulationScope } from "./scoreImpactTriggers";
import type {
  BonusLeaderSnapshot,
  ScoreImpactMatchResult,
  ScoreImpactRunContext,
  ScoreImpactStandingsSnapshot,
} from "./types";

async function upsertScoreImpactActivity(input: {
  poolId: string;
  bodyText: string;
  sourceKey: string;
  metadata: Record<string, unknown>;
}): Promise<"inserted" | "skipped"> {
  const supabase = createServiceRoleClient();

  const { data: existing, error: findErr } = await supabase
    .from("pool_activity")
    .select("id")
    .eq("pool_id", input.poolId)
    .eq("type", "ash_score_impact")
    .eq("metadata_json->>source_key", input.sourceKey)
    .maybeSingle();

  if (findErr) throw new Error(findErr.message);
  if (existing?.id) return "skipped";

  const { error } = await supabase.from("pool_activity").insert({
    pool_id: input.poolId,
    participant_id: null,
    actor_user_id: null,
    type: "ash_score_impact",
    body_text: input.bodyText,
    metadata_json: {
      source_key: input.sourceKey,
      score_impact_label: "SCORE IMPACT",
      icon: "⚽",
      ...input.metadata,
    },
    related_path: null,
    is_ai_generated: false,
  });

  if (error) {
    if (error.code === "23505") return "skipped";
    throw new Error(error.message);
  }

  return "inserted";
}

async function verifyPoolSimulationScope(
  poolId: string,
  editionIsSimulation: boolean | undefined,
): Promise<boolean> {
  if (editionIsSimulation == null) return true;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("pools")
    .select("is_simulation")
    .eq("id", poolId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;
  return poolMatchesEditionSimulationScope(
    Boolean(data.is_simulation),
    editionIsSimulation,
  );
}

export async function postScoreImpactActivityForPool(input: {
  poolId: string;
  trigger: WcLedgerRecomputeTrigger;
  before: ScoreImpactStandingsSnapshot;
  after: ScoreImpactStandingsSnapshot;
  runContext?: ScoreImpactRunContext;
  beforeBonusLeaders?: BonusLeaderSnapshot | null;
  afterBonusLeaders?: BonusLeaderSnapshot | null;
  editionIsSimulation?: boolean;
}): Promise<"inserted" | "skipped" | "none"> {
  if (!isScoreImpactLedgerTrigger(input.trigger)) return "none";

  const scopeOk = await verifyPoolSimulationScope(
    input.poolId,
    input.editionIsSimulation,
  );
  if (!scopeOk) return "none";

  if (input.before.summaryHash === input.after.summaryHash) {
    const matchResults = input.runContext?.matchResults ?? [];
    const bonusChanged =
      input.beforeBonusLeaders &&
      input.afterBonusLeaders &&
      (input.beforeBonusLeaders.mostGoalsTeamId !==
        input.afterBonusLeaders.mostGoalsTeamId ||
        input.beforeBonusLeaders.mostYellowCardsTeamId !==
          input.afterBonusLeaders.mostYellowCardsTeamId ||
        input.beforeBonusLeaders.mostRedCardsTeamId !==
          input.afterBonusLeaders.mostRedCardsTeamId);
    if (matchResults.length === 0 && !bonusChanged) return "none";
  }

  const supabase = createServiceRoleClient();
  const matchResults = input.runContext?.matchResults ?? [];
  const primaryMatch = matchResults[0] ?? null;
  const teamNameById = input.runContext?.editionId
    ? await loadTeamNameMapForEdition(supabase, input.runContext.editionId)
    : new Map<string, string>();

  let winnerPickCount = 0;
  let primaryWinnerTeamName: string | null = null;
  if (
    primaryMatch?.winnerTeamId &&
    primaryMatch.groupCode &&
    primaryMatch.stageCode === "group"
  ) {
    winnerPickCount = await countGroupAdvancePicksForTeam(
      supabase,
      input.poolId,
      primaryMatch.groupCode,
      primaryMatch.winnerTeamId,
    );
    primaryWinnerTeamName = teamNameById.get(primaryMatch.winnerTeamId) ?? null;
  }

  const participantNames = await loadParticipantNamesById(supabase, input.poolId);
  const analysis = detectScoreImpact({
    beforeRows: input.before.rows,
    afterRows: input.after.rows,
    matchResults,
    beforeBonusLeaders: input.beforeBonusLeaders,
    afterBonusLeaders: input.afterBonusLeaders,
    teamNameById,
    winnerPickCount,
    primaryWinnerTeamName,
    bracketsScoredCount: undefined,
    perfectGroupPickers: [],
  });

  if (!scoreImpactHasMeaningfulChange(analysis)) return "none";

  const bodyText = buildScoreImpactCommentary(analysis);
  if (!bodyText) return "none";

  const scoreSignature =
    input.runContext?.scoreSignature ??
    buildScoreSignatureFromMatches(matchResults);
  const sourceKey = buildScoreImpactDedupKey({
    poolId: input.poolId,
    trigger: input.trigger,
    afterStandingsHash: input.after.summaryHash,
    scoreSignature,
  });

  return upsertScoreImpactActivity({
    poolId: input.poolId,
    bodyText,
    sourceKey,
    metadata: {
      trigger: input.trigger,
      standings_hash: input.after.summaryHash,
      score_signature: scoreSignature,
      match_codes: matchResults.map((m) => m.matchCode),
      point_gainers: analysis.pointGainers.slice(0, 5).map((g) => ({
        participant_id: g.participantId,
        display_name: participantNames.get(g.participantId) ?? g.displayName,
        points_gained: g.pointsGained,
      })),
    },
  });
}

export async function postScoreImpactForPools(input: {
  poolIds: readonly string[];
  trigger: WcLedgerRecomputeTrigger;
  beforeByPool: ReadonlyMap<string, ScoreImpactStandingsSnapshot>;
  afterByPool: ReadonlyMap<string, ScoreImpactStandingsSnapshot>;
  runContext?: ScoreImpactRunContext;
  beforeBonusLeaders?: BonusLeaderSnapshot | null;
  afterBonusLeaders?: BonusLeaderSnapshot | null;
  editionIsSimulation?: boolean;
}): Promise<{ inserted: number; skipped: number }> {
  if (!isScoreImpactLedgerTrigger(input.trigger)) {
    return { inserted: 0, skipped: 0 };
  }

  let inserted = 0;
  let skipped = 0;

  for (const poolId of input.poolIds) {
    const before = input.beforeByPool.get(poolId);
    const after = input.afterByPool.get(poolId);
    if (!before || !after) continue;

    const result = await postScoreImpactActivityForPool({
      poolId,
      trigger: input.trigger,
      before,
      after,
      runContext: input.runContext,
      beforeBonusLeaders: input.beforeBonusLeaders,
      afterBonusLeaders: input.afterBonusLeaders,
      editionIsSimulation: input.editionIsSimulation,
    });

    if (result === "inserted") inserted += 1;
    if (result === "skipped") skipped += 1;
  }

  return { inserted, skipped };
}
