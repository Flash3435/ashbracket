import assert from "node:assert";
import {
  fetchAllRows,
  SUPABASE_MAX_ROWS_PER_REQUEST,
  warnIfPoolPredictionsLookTruncated,
} from "./fetchAllRows";

async function main(): Promise<void> {
  const totalRows = 1085;
  const rows = Array.from({ length: totalRows }, (_, i) => ({ id: `row-${i}` }));
  let rangeCalls = 0;

  const { data, error, pageCount } = await fetchAllRows<{ id: string }>(
    async ({ from, to }) => {
      rangeCalls += 1;
      return {
        data: rows.slice(from, to + 1),
        error: null,
      };
    },
  );

  assert.strictEqual(error, null);
  assert.strictEqual(data.length, totalRows);
  assert.strictEqual(pageCount, 2, "1085 rows require two 1000-row pages");
  assert.strictEqual(rangeCalls, 2);
  assert.strictEqual(data[0]?.id, "row-0");
  assert.strictEqual(data[totalRows - 1]?.id, `row-${totalRows - 1}`);

  let warned = false;
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (String(args[0]).includes("pool predictions may be truncated")) {
      warned = true;
    }
    originalWarn(...args);
  };

  warnIfPoolPredictionsLookTruncated({
    participantCount: 31,
    predictionRowCount: SUPABASE_MAX_ROWS_PER_REQUEST,
    paginationPageCount: 1,
    context: "test",
  });

  assert.strictEqual(warned, true, "31 participants at 1000 rows on one page warns");

  warned = false;
  warnIfPoolPredictionsLookTruncated({
    participantCount: 31,
    predictionRowCount: 1085,
    paginationPageCount: 2,
    context: "test",
  });
  assert.strictEqual(warned, false, "full paginated fetch does not warn");

  console.warn = originalWarn;

  console.log("fetchAllRows.selftest.ts: all assertions passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
