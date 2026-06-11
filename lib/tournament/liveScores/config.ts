import type { LiveScoresProviderConfig } from "./types";

const DEFAULT_PROVIDER = "api-football";

export function readLiveScoresProviderConfig(): LiveScoresProviderConfig {
  const provider = (process.env.LIVE_SCORES_PROVIDER?.trim() || DEFAULT_PROVIDER).toLowerCase();
  const apiFootballKey = process.env.API_FOOTBALL_KEY?.trim();
  const apiFootballLeagueId = process.env.API_FOOTBALL_LEAGUE_ID?.trim();
  const apiFootballSeason = process.env.API_FOOTBALL_SEASON?.trim() || "2026";

  if (provider === "mock") {
    return {
      provider: "mock",
      configured: true,
      configWarning: null,
    };
  }

  if (provider === "api-football") {
    if (!apiFootballKey) {
      return {
        provider,
        configured: false,
        configWarning:
          "Live scores provider is api-football but API_FOOTBALL_KEY is not set. Add it to .env.local (local) or Vercel project environment variables (production).",
        apiFootballSeason,
      };
    }
    if (!apiFootballLeagueId) {
      return {
        provider,
        configured: false,
        configWarning:
          "Live scores provider is api-football but API_FOOTBALL_LEAGUE_ID is not set. Set the competition/league id from your provider dashboard.",
        apiFootballKey,
        apiFootballSeason,
      };
    }
    return {
      provider,
      configured: true,
      configWarning: null,
      apiFootballKey,
      apiFootballLeagueId,
      apiFootballSeason,
    };
  }

  return {
    provider,
    configured: false,
    configWarning: `Unknown LIVE_SCORES_PROVIDER "${provider}". Supported: api-football, mock.`,
  };
}
