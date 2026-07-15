import { createServiceRoleClient } from "@/lib/supabase/service";
import type { WcLedgerRecomputeTrigger } from "@/lib/scoring/recomputePoolLedger";
import { loadPoolExposureContext } from "@/lib/pool/loadPoolExposureContext";
import { buildBracketImpactForPool } from "./buildBracketImpact";
import { buildSoftImpactForMatch } from "./buildSoftImpact";
import { buildScoreImpactCommentary } from "./buildScoreImpactCommentary";
import { buildScoreImpactMetadata } from "./buildScoreImpactMetadata";
import { detectScoreImpact, scoreImpactHasMeaningfulChange } from "./detectScoreImpact";
import {
  buildScoreImpactDedupKey,
  buildScoreSignatureFromMatches,
} from "./scoreImpactDedupKey";
import {
  loadParticipantNamesById,
  loadParticipantTeamPicksById,
  loadTeamNameMapForEdition,
} from "./loadScoreImpactContext";
import { isScoreImpactLedgerTrigger, poolMatchesEditionSimulationScope } from "./scoreImpactTriggers";
import type {
  BonusLeaderSnapshot,
  ScoreImpactRunContext,
  ScoreImpactStandingsSnapshot,
} from "./types";

async function upsertScoreImpactActivity(input: {
  poolId: string;
  bodyText: string;
  sourceKey: string;
  metadata: Record<string, unknown>;
  primaryMatchCode: string | null;
}): Promise<"inserted" | "updated" | "skipped"> {
  const supabase = createServiceRoleClient();

  const { data: existingByKey, error: findErr } = await supabase
    .from("pool_activity")
    .select("id")
    .eq("pool_id", input.poolId)
    .eq("type", "ash_score_impact")
    .eq("metadata_json->>source_key", input.sourceKey)
    .maybeSingle();

  if (findErr) throw new Error(findErr.message);
  if (existingByKey?.id) return "skipped";

  if (input.primaryMatchCode) {
    const { data: existingByMatch, error: matchErr } = await supabase
      .from("pool_activity")
      .select("id")
      .eq("pool_id", input.poolId)
      .eq("type", "ash_score_impact")
      .eq("metadata_json->>match_id", input.primaryMatchCode)
      .maybeSingle();

    if (matchErr) throw new Error(matchErr.message);

    if (existingByMatch?.id) {
      const { error: updateErr } = await supabase
        .from("pool_activity")
        .update({
          body_text: input.bodyText,
          metadata_json: input.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingByMatch.id);

      if (updateErr) throw new Error(updateErr.message);
      return "updated";
    }
  }

  const { error } = await supabase.from("pool_activity").insert({
    pool_id: input.poolId,
    participant_id: null,
    actor_user_id: null,
    type: "ash_score_impact",
    body_text: input.bodyText,
    metadata_json: input.metadata,
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
}): Promise<"inserted" | "updated" | "skipped" | "none"> {
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

  const participantNames = await loadParticipantNamesById(supabase, input.poolId);
  const analysis = detectScoreImpact({
    beforeRows: input.before.rows,
    afterRows: input.after.rows,
    matchResults,
    beforeBonusLeaders: input.beforeBonusLeaders,
    afterBonusLeaders: input.afterBonusLeaders,
    teamNameById,
  });

  const scoringCorrections =
    input.runContext?.scoringCorrections ??
    (input.runContext?.thirdPlaceQualifiersNewlyScored
      ? [{ kind: "third_place_qualifier" as const }]
      : undefined);
  const standingsMoved = input.before.summaryHash !== input.after.summaryHash;
  const correctionForced =
    Boolean(scoringCorrections && scoringCorrections.length > 0) && standingsMoved;

  // Pure point-loss corrections (e.g. M101 −8) have no "gainers", so the default
  // gain-based meaningful-change gate would skip the activity entirely.
  if (!scoreImpactHasMeaningfulChange(analysis) && !correctionForced) {
    return "none";
  }

  let softImpact = null;
  let bracketImpact = null;
  if (!analysis.pointsChanged && primaryMatch) {
    const participantPicks = await loadParticipantTeamPicksById(supabase, input.poolId);
    softImpact = buildSoftImpactForMatch({
      match: primaryMatch,
      teamNameById,
      participantPicks,
      participantNames,
    });
  }

  if (analysis.pointsChanged && matchResults.length > 0) {
    const exposure = await loadPoolExposureContext(input.poolId);
    if (exposure.ok) {
      const participantPicks = await loadParticipantTeamPicksById(supabase, input.poolId);
      bracketImpact = buildBracketImpactForPool({
        participantBrackets: exposure.context.allParticipantBrackets,
        participantNames,
        participantPicks,
        championPicks: exposure.context.championPicks,
        teams: exposure.context.teams,
        tournamentMatches: exposure.context.matches,
        knockoutBracketPicksUnlocked: exposure.context.knockoutBracketPicksUnlocked,
        matchResults,
        beforeRows: input.before.rows,
        afterRows: input.after.rows,
        pointGainers: analysis.pointGainers,
      });
    }
  }

  let bodyText = buildScoreImpactCommentary(
    analysis,
    softImpact,
    bracketImpact?.summary ?? null,
    bracketImpact?.uniformPointsDelta ?? null,
  );
  if (!bodyText && correctionForced) {
    const mover = analysis.movers[0];
    const moverBit = mover
      ? ` Leaderboard shakeup: ${mover.displayName} ${mover.previousRank}→${mover.newRank}.`
      : "";
    bodyText = `Scoring correction applied.${moverBit}`.trim();
  }
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

  const metadata = buildScoreImpactMetadata({
    analysis,
    beforeRows: input.before.rows,
    afterRows: input.after.rows,
    matchResults,
    participantNames,
    trigger: input.trigger,
    sourceKey,
    standingsHash: input.after.summaryHash,
    scoreSignature,
    softImpact,
    bracketImpact,
    scoringCorrections,
  });

  return upsertScoreImpactActivity({
    poolId: input.poolId,
    bodyText,
    sourceKey,
    metadata,
    primaryMatchCode: primaryMatch?.matchCode ?? null,
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
}): Promise<{ inserted: number; updated: number; skipped: number }> {
  if (!isScoreImpactLedgerTrigger(input.trigger)) {
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  let inserted = 0;
  let updated = 0;
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
    if (result === "updated") updated += 1;
    if (result === "skipped") skipped += 1;
  }

  return { inserted, updated, skipped };
}
