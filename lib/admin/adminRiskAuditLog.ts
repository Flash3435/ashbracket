import { getDeploymentEnvironment } from "./deploymentEnvironment";

export type AdminRiskAction =
  | "bootstrap_simulation_pool"
  | "simulation_edition_sync"
  | "simulation_results_generate"
  | "live_tournament_sync"
  | "live_daily_update"
  | "edition_results_edit"
  | "edition_recompute_pools"
  | "pool_recompute"
  | "pool_communications_send"
  | "pool_communications_test"
  | "participant_invite_email"
  | "participant_pool_move"
  | "pool_admin_invite_email";

export type AdminRiskAuditPayload = {
  action: AdminRiskAction;
  userId: string | null;
  userEmail?: string | null;
  editionId?: string | null;
  editionCode?: string | null;
  isSimulation?: boolean;
  poolId?: string | null;
  poolName?: string | null;
  affectedMatchCount?: number;
  affectedPoolCount?: number;
  affectedParticipantCount?: number;
  previewOnly?: boolean;
  simulationEmailOverrideEnabled?: boolean;
  outboundEmailBlocked?: boolean;
  detail?: string;
};

/**
 * Structured single-line log for high-risk admin operations (grep-friendly).
 */
export function logAdminRiskAction(payload: AdminRiskAuditPayload): void {
  const env = getDeploymentEnvironment();
  const mode =
    payload.isSimulation === true
      ? "simulation"
      : payload.isSimulation === false
        ? "live"
        : "unknown";

  const parts = [
    "[ashbracket:admin-risk]",
    `env=${env}`,
    `action=${payload.action}`,
    `mode=${mode}`,
    payload.userId ? `userId=${payload.userId}` : null,
    payload.userEmail ? `email=${payload.userEmail}` : null,
    payload.editionId ? `editionId=${payload.editionId}` : null,
    payload.editionCode ? `editionCode=${payload.editionCode}` : null,
    payload.poolId ? `poolId=${payload.poolId}` : null,
    payload.poolName ? `poolName=${JSON.stringify(payload.poolName)}` : null,
    payload.affectedMatchCount != null
      ? `matches=${payload.affectedMatchCount}`
      : null,
    payload.affectedPoolCount != null
      ? `pools=${payload.affectedPoolCount}`
      : null,
    payload.affectedParticipantCount != null
      ? `participants=${payload.affectedParticipantCount}`
      : null,
    payload.previewOnly != null ? `previewOnly=${payload.previewOnly}` : null,
    payload.simulationEmailOverrideEnabled != null
      ? `simEmailOverride=${payload.simulationEmailOverrideEnabled}`
      : null,
    payload.outboundEmailBlocked != null
      ? `emailBlocked=${payload.outboundEmailBlocked}`
      : null,
    payload.detail ? `detail=${JSON.stringify(payload.detail)}` : null,
  ].filter(Boolean);

  console.info(parts.join(" "));
}
