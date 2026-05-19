import type { SupabaseClient } from "@supabase/supabase-js";
import { logAdminRiskAction, type AdminRiskAction } from "./adminRiskAuditLog";
import { isProductionDeployment } from "./deploymentEnvironment";

/** Server env: set to `true` to allow real email from simulation pools on production. */
export const SIMULATION_EMAIL_OVERRIDE_ENV = "ALLOW_SIMULATION_EMAIL_IN_PRODUCTION";

/** Typed confirmation required on production when override is enabled. */
export const SIMULATION_POOL_EMAIL_TYPED_PHRASE = "SEND TEST EMAIL";

export type SimulationPoolEmailUiStatus = {
  isSimulationPool: boolean;
  isProduction: boolean;
  overrideEnabled: boolean;
  /** True when production + simulation pool + override is off. */
  sendsBlocked: boolean;
  /** True when production + simulation pool + override is on. */
  requiresTypedPhrase: boolean;
  typedPhraseLabel: string;
  bannerTitle: string;
  bannerBody: string;
};

export type SimulationPoolEmailCheckResult =
  | { ok: true; overrideEnabled: boolean; blocked: false }
  | {
      ok: false;
      error: string;
      blocked: boolean;
      overrideEnabled: boolean;
    };

export function isSimulationEmailOverrideEnabledInProduction(): boolean {
  const raw = process.env[SIMULATION_EMAIL_OVERRIDE_ENV]?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export function normalizeTypedConfirmationPhrase(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

export function getSimulationPoolEmailUiStatus(
  isSimulationPool: boolean,
): SimulationPoolEmailUiStatus {
  const isProduction = isProductionDeployment();
  const overrideEnabled = isSimulationEmailOverrideEnabledInProduction();
  const sendsBlocked = isProduction && isSimulationPool && !overrideEnabled;
  const requiresTypedPhrase =
    isProduction && isSimulationPool && overrideEnabled;

  let bannerTitle = "Simulation pool · test data";
  let bannerBody =
    "Email only reaches people in this test pool. Use test accounts during a pilot.";

  if (sendsBlocked) {
    bannerTitle = "Simulation pool · email blocked on production";
    bannerBody =
      "This is a simulation (test) pool. Production blocks real outbound email from simulation pools by default so you cannot accidentally email real people during testing. Verify picks, results, and standings first. If your operator must enable test email, they can set ALLOW_SIMULATION_EMAIL_IN_PRODUCTION on the server — then you will need to type SEND TEST EMAIL to confirm each send.";
  } else if (requiresTypedPhrase) {
    bannerTitle = "Simulation pool · production override enabled";
    bannerBody =
      "Real email can be sent from this simulation pool because the production override is on. Use test recipients only. Before sending, type SEND TEST EMAIL exactly in the confirmation box below.";
  } else if (isSimulationPool && isProduction) {
    bannerBody =
      "Simulation pool on production. Email controls apply before anything is sent.";
  }

  return {
    isSimulationPool,
    isProduction,
    overrideEnabled,
    sendsBlocked,
    requiresTypedPhrase,
    typedPhraseLabel: SIMULATION_POOL_EMAIL_TYPED_PHRASE,
    bannerTitle,
    bannerBody,
  };
}

export async function fetchPoolIsSimulation(
  supabase: SupabaseClient,
  poolId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("pools")
    .select("is_simulation")
    .eq("id", poolId.trim())
    .maybeSingle();
  return Boolean(data?.is_simulation);
}

const BLOCKED_MESSAGE =
  "This is a simulation (test) pool. On production, real email from simulation pools is turned off by default. Verify picks, results, and standings first. If test email is truly needed, ask your site operator to set ALLOW_SIMULATION_EMAIL_IN_PRODUCTION on the server, then try again and type SEND TEST EMAIL to confirm.";

/**
 * Server-side gate for any outbound email tied to a pool (communications, invites).
 * Live pools on production are unchanged except existing production-ack flows elsewhere.
 */
export function assertSimulationPoolOutboundEmailAllowed(input: {
  isSimulationPool: boolean;
  productionAcknowledged?: boolean;
  simulationEmailAcknowledged?: boolean;
  typedConfirmationPhrase?: string;
}): SimulationPoolEmailCheckResult {
  const isProduction = isProductionDeployment();
  const overrideEnabled = isSimulationEmailOverrideEnabledInProduction();

  if (!input.isSimulationPool || !isProduction) {
    return { ok: true, overrideEnabled, blocked: false };
  }

  if (!overrideEnabled) {
    return {
      ok: false,
      error: BLOCKED_MESSAGE,
      blocked: true,
      overrideEnabled: false,
    };
  }

  const normalized = normalizeTypedConfirmationPhrase(
    input.typedConfirmationPhrase ?? "",
  );
  const expected = normalizeTypedConfirmationPhrase(
    SIMULATION_POOL_EMAIL_TYPED_PHRASE,
  );
  if (normalized !== expected) {
    return {
      ok: false,
      error: `Type ${SIMULATION_POOL_EMAIL_TYPED_PHRASE} exactly to confirm sending email from this simulation pool on production.`,
      blocked: false,
      overrideEnabled: true,
    };
  }

  if (!input.productionAcknowledged) {
    return {
      ok: false,
      error:
        "Confirm that you understand this sends real email on production before continuing.",
      blocked: false,
      overrideEnabled: true,
    };
  }

  if (!input.simulationEmailAcknowledged) {
    return {
      ok: false,
      error:
        "Confirm that you intend to send email from this simulation test pool before continuing.",
      blocked: false,
      overrideEnabled: true,
    };
  }

  return { ok: true, overrideEnabled: true, blocked: false };
}

export async function enforceSimulationPoolEmailPolicy(input: {
  supabase: SupabaseClient;
  poolId: string;
  poolName?: string | null;
  action: AdminRiskAction;
  userId: string | null;
  userEmail?: string | null;
  recipientCount?: number;
  productionAcknowledged?: boolean;
  simulationEmailAcknowledged?: boolean;
  typedConfirmationPhrase?: string;
}): Promise<
  | { ok: true; isSimulationPool: boolean; overrideEnabled: boolean }
  | { ok: false; error: string }
> {
  const isSimulationPool = await fetchPoolIsSimulation(
    input.supabase,
    input.poolId,
  );
  const overrideEnabled = isSimulationEmailOverrideEnabledInProduction();
  const check = assertSimulationPoolOutboundEmailAllowed({
    isSimulationPool,
    productionAcknowledged: input.productionAcknowledged,
    simulationEmailAcknowledged: input.simulationEmailAcknowledged,
    typedConfirmationPhrase: input.typedConfirmationPhrase,
  });

  if (!check.ok) {
    logSimulationPoolEmailAttempt({
      action: input.action,
      userId: input.userId,
      userEmail: input.userEmail,
      poolId: input.poolId,
      poolName: input.poolName,
      isSimulationPool,
      overrideEnabled: check.overrideEnabled,
      blocked: check.blocked,
      recipientCount: input.recipientCount,
      detail: check.error,
    });
    return { ok: false, error: check.error };
  }

  return { ok: true, isSimulationPool, overrideEnabled };
}

export function logSimulationPoolEmailAttempt(args: {
  action: AdminRiskAction;
  userId: string | null;
  userEmail?: string | null;
  poolId: string;
  poolName?: string | null;
  isSimulationPool: boolean;
  overrideEnabled: boolean;
  blocked: boolean;
  recipientCount?: number;
  detail?: string;
}): void {
  logAdminRiskAction({
    action: args.action,
    userId: args.userId,
    userEmail: args.userEmail,
    poolId: args.poolId,
    poolName: args.poolName,
    isSimulation: args.isSimulationPool,
    simulationEmailOverrideEnabled: args.overrideEnabled,
    outboundEmailBlocked: args.blocked,
    affectedParticipantCount: args.recipientCount,
    detail: args.detail,
  });
}
