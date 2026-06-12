import assert from "node:assert";
import {
  ADMIN_COMPLETION_MISSING_SERVICE_ROLE_MESSAGE,
  adminBuildCommitSha,
  isProductionRuntime,
  isServiceRoleKeyConfigured,
} from "./adminCompletionEnv";
import { buildIncompleteBracketPanelData } from "./incompleteBracketPanel";
import { resolveAdminCompletionSupabaseClientForTest } from "./trustedPoolPicksCompleteness";

const envSnapshot = { ...process.env };

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in envSnapshot)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, envSnapshot);
}

function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => void,
): void {
  const saved = { ...process.env };
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    fn();
  } finally {
    restoreEnv();
    Object.assign(process.env, saved);
  }
}

withEnv({ VERCEL_ENV: "production" }, () => {
  assert.strictEqual(
    isProductionRuntime(),
    true,
    "VERCEL_ENV=production is production",
  );
});

withEnv({ VERCEL_ENV: "preview" }, () => {
  assert.strictEqual(isProductionRuntime(), false, "preview is not production");
});

withEnv({ VERCEL_GIT_COMMIT_SHA: "abcdef1234567890" }, () => {
  assert.strictEqual(adminBuildCommitSha(), "abcdef1");
});

assert.strictEqual(adminBuildCommitSha(), "unknown");

withEnv(
  {
    VERCEL_ENV: "production",
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  },
  () => {
    const fallbackUsed = { value: false };
    const fakeFallback = {
      from() {
        fallbackUsed.value = true;
        throw new Error("session fallback must not run in production");
      },
    };

    const resolved = resolveAdminCompletionSupabaseClientForTest({
      fallbackSupabase: fakeFallback as never,
    });

    assert.strictEqual(
      resolved.ok,
      false,
      "production without service role must fail",
    );
    assert.strictEqual(
      resolved.source,
      "missing-service-role",
      "data source must be missing-service-role",
    );
    assert.strictEqual(
      resolved.message,
      ADMIN_COMPLETION_MISSING_SERVICE_ROLE_MESSAGE,
    );
    assert.strictEqual(
      fallbackUsed.value,
      false,
      "must not fall back to session client",
    );

    const diagnostics = {
      buildCommitSha: adminBuildCommitSha(),
      dataSource: "missing-service-role" as const,
      serviceRoleAvailable: false,
      serviceRoleRequired: true,
      participantCount: 2,
      predictionRowCount: 0,
      groupMapSize: 0,
      trustedIncompleteCount: 0,
      warningMessage: ADMIN_COMPLETION_MISSING_SERVICE_ROLE_MESSAGE,
    };

    const panel = buildIncompleteBracketPanelData({
      poolId: "4c0a110a-62ab-42fc-a893-5b7a9c9fbd82",
      poolName: "Work pool",
      lockAtIso: null,
      knockoutBracketPicksUnlocked: true,
      participants: [
        {
          id: "p1",
          displayName: "Ang",
          email: "ang@example.com",
          picksComplete: false,
        },
      ],
      emailConfigured: true,
      statusAvailable: false,
      sourceDiagnostics: diagnostics,
      statusUnavailableReason: diagnostics.warningMessage,
    });
    assert.strictEqual(panel.state, "unavailable");
    assert.strictEqual(
      panel.statusUnavailableReason,
      ADMIN_COMPLETION_MISSING_SERVICE_ROLE_MESSAGE,
    );
    assert.strictEqual(panel.sourceDiagnostics.dataSource, "missing-service-role");
  },
);

assert.strictEqual(
  isServiceRoleKeyConfigured(),
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()?.length),
  "service role configured mirrors env",
);

console.log("trustedPoolPicksCompleteness.selftest.ts: all assertions passed");
