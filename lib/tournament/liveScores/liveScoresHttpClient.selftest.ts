/**
 * Run: npx tsx lib/tournament/liveScores/liveScoresHttpClient.selftest.ts
 */
import assert from "node:assert/strict";
import {
  formatHttpDebugLine,
  parseLiveScoresResponseBody,
} from "./liveScoresHttpClient";

const base = {
  url: "/api/admin/live-scores/apply",
  elapsedMs: 42,
};

const json500 = parseLiveScoresResponseBody<{ ok: boolean; error?: string }>({
  ...base,
  httpStatus: 500,
  contentType: "application/json",
  bodyText: JSON.stringify({ ok: false, error: "Preview stale" }),
});
assert.equal(json500.ok, false);
if (!json500.ok) {
  assert.equal(json500.error, "Preview stale");
  assert.match(formatHttpDebugLine(json500.debug), /HTTP 500/);
}

const html = parseLiveScoresResponseBody<{ ok: boolean }>({
  ...base,
  httpStatus: 200,
  contentType: "text/html",
  bodyText: "<!DOCTYPE html><html><body>Login</body></html>",
});
assert.equal(html.ok, false);
if (!html.ok) assert.match(html.error, /HTML/);

const empty = parseLiveScoresResponseBody<{ ok: boolean }>({
  ...base,
  httpStatus: 504,
  contentType: null,
  bodyText: "",
});
assert.equal(empty.ok, false);
if (!empty.ok) assert.match(empty.error, /Empty response/);

const success = parseLiveScoresResponseBody<{ ok: boolean; build?: string }>({
  ...base,
  httpStatus: 200,
  contentType: "application/json",
  bodyText: JSON.stringify({ ok: true, build: "split-apply-v3" }),
});
assert.equal(success.ok, true);
if (success.ok) assert.equal(success.data.build, "split-apply-v3");

console.log("liveScoresHttpClient.selftest.ts: all assertions passed");
