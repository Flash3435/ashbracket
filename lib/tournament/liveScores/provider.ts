import { fetchApiFootballWorldCupScores } from "./apiFootballProvider";
import { readLiveScoresProviderConfig } from "./config";
import { fetchMockWorldCupScores } from "./mockProvider";
import type { LiveScoresFetchResult, LiveScoresProviderConfig } from "./types";

export function getLiveScoresProviderConfig(): LiveScoresProviderConfig {
  return readLiveScoresProviderConfig();
}

/**
 * Fetch latest World Cup fixture scores from the configured live-scores provider.
 * Returns a friendly error when env vars are missing — does not throw.
 */
export async function fetchLiveWorldCupScores(
  config: LiveScoresProviderConfig = readLiveScoresProviderConfig(),
): Promise<LiveScoresFetchResult> {
  if (!config.configured) {
    return {
      ok: false,
      provider: config.provider,
      error: config.configWarning ?? "Live scores provider is not configured.",
      configWarning: config.configWarning,
    };
  }

  switch (config.provider) {
    case "mock":
      return fetchMockWorldCupScores();
    case "api-football":
      return fetchApiFootballWorldCupScores(config);
    default:
      return {
        ok: false,
        provider: config.provider,
        error: `Unsupported LIVE_SCORES_PROVIDER "${config.provider}".`,
        configWarning: config.configWarning,
      };
  }
}
