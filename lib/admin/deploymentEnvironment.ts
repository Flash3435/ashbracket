/**
 * Deployment environment helpers for admin safety UX and audit logs.
 * Uses Vercel env when present; falls back to NODE_ENV for local runs.
 */

export type DeploymentEnvironment = "production" | "preview" | "development";

export function getDeploymentEnvironment(): DeploymentEnvironment {
  const vercel = process.env.VERCEL_ENV;
  if (vercel === "production") return "production";
  if (vercel === "preview") return "preview";
  if (process.env.NODE_ENV === "production") return "production";
  return "development";
}

export function isProductionDeployment(): boolean {
  return getDeploymentEnvironment() === "production";
}

/** Human label for banners and confirmations. */
export function getDeploymentEnvironmentLabel(): string {
  const env = getDeploymentEnvironment();
  if (env === "production") return "Production";
  if (env === "preview") return "Preview";
  return "Development";
}
