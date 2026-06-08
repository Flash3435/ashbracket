import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getDeploymentEnvironment,
  getDeploymentEnvironmentLabel,
} from "./deploymentEnvironment";
import { fetchPoolPilotVerification } from "./fetchPoolPilotVerification";
import {
  isSimulationEmailOverrideEnabledInProduction,
  SIMULATION_EMAIL_OVERRIDE_ENV,
} from "./simulationPoolEmailPolicy";

export type PilotChecklistContext = {
  environment: string;
  environmentLabel: string;
  isProduction: boolean;
  simulationEmailOverrideEnabled: boolean;
  simulationEmailOverrideEnvName: string;
  pilotSnapshot: Awaited<ReturnType<typeof fetchPoolPilotVerification>>;
};

export async function fetchPilotChecklistContext(
  supabase: SupabaseClient,
): Promise<PilotChecklistContext> {
  const environment = getDeploymentEnvironment();
  return {
    environment,
    environmentLabel: getDeploymentEnvironmentLabel(),
    isProduction: environment === "production",
    simulationEmailOverrideEnabled: isSimulationEmailOverrideEnabledInProduction(),
    simulationEmailOverrideEnvName: SIMULATION_EMAIL_OVERRIDE_ENV,
    pilotSnapshot: await fetchPoolPilotVerification(supabase),
  };
}
