import { isProductionDeployment } from "./deploymentEnvironment";

export function productionAckRequired(): boolean {
  return isProductionDeployment();
}

/**
 * Server-side guard: on production, risky admin actions must pass an explicit ack flag
 * set only after the admin confirms in the UI.
 */
export function checkProductionAdminAck(
  acknowledged: boolean | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!productionAckRequired()) {
    return { ok: true };
  }
  if (!acknowledged) {
    return {
      ok: false,
      error:
        "This action requires confirmation on production. Open the action panel, review the impact summary, check the confirmation box, and try again.",
    };
  }
  return { ok: true };
}
