import assert from "node:assert";
import {
  buildPostSaveSuccessResult,
  mergeSavedWarningWithRefreshFailure,
  PICKS_LEDGER_REVALIDATE_WARNING_PREFIX,
  PICKS_PAGE_REFRESH_WARNING,
  resolvePicksSaveClientNextStep,
  savePicksSuccess,
  savePicksUnexpectedError,
  savePicksValidationError,
  tryRefreshPicksPage,
} from "./participantPicksSaveFlow";

assert.deepStrictEqual(savePicksSuccess(), {
  ok: true,
  kind: "success",
});

assert.deepStrictEqual(
  resolvePicksSaveClientNextStep(savePicksSuccess(), {}),
  { step: "show_saved", warning: undefined },
  "save succeeds",
);

assert.deepStrictEqual(
  resolvePicksSaveClientNextStep(
    buildPostSaveSuccessResult({ ledgerError: "timeout", revalidateError: "boom" }),
    {},
  ),
  {
    step: "show_saved",
    warning: `${PICKS_LEDGER_REVALIDATE_WARNING_PREFIX} timeout ${PICKS_PAGE_REFRESH_WARNING}`,
  },
  "save succeeds with post-save refresh/revalidation warnings",
);

assert.deepStrictEqual(
  resolvePicksSaveClientNextStep(
    savePicksValidationError("Invalid participant id."),
    {},
  ),
  { step: "show_error", message: "Invalid participant id." },
  "save fails validation",
);

assert.deepStrictEqual(
  resolvePicksSaveClientNextStep(
    savePicksUnexpectedError("insert or update on table predictions violates foreign key"),
    {},
  ),
  {
    step: "show_error",
    message: "insert or update on table predictions violates foreign key",
  },
  "save fails database write",
);

assert.strictEqual(
  mergeSavedWarningWithRefreshFailure(undefined, true),
  PICKS_PAGE_REFRESH_WARNING,
  "client refresh failure should surface recoverable warning",
);

assert.strictEqual(
  mergeSavedWarningWithRefreshFailure("Server warning.", true),
  `Server warning. ${PICKS_PAGE_REFRESH_WARNING}`,
);

void (async function main() {
  const refreshOk = await tryRefreshPicksPage(async () => undefined);
  assert.deepStrictEqual(refreshOk, { refreshFailed: false });

  const refreshFailed = await tryRefreshPicksPage(async () => {
    throw new Error("Connection closed.");
  });
  assert.deepStrictEqual(refreshFailed, {
    refreshFailed: true,
    message: "Connection closed.",
  });

  console.log("participantPicksSaveFlow selftest: ok");
})();
