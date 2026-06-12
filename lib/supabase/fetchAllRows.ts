/** Supabase PostgREST default max rows per request. */
export const SUPABASE_MAX_ROWS_PER_REQUEST = 1000;

/** Pre-lock completeness uses ~35 saved rows per participant (24 group + 8 third + 3 bonus). */
export const PRE_LOCK_PICKS_PER_PARTICIPANT_ESTIMATE = 35;

export type FetchAllRowsResult<T> = {
  data: T[];
  error: string | null;
  pageCount: number;
};

/**
 * Paginate a Supabase query with `.range(from, to)` until a short page is returned.
 * `fetchPage` must apply a stable `.order(...)` when the underlying table can change between pages.
 */
export async function fetchAllRows<T>(
  fetchPage: (range: {
    from: number;
    to: number;
  }) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
  options?: { pageSize?: number },
): Promise<FetchAllRowsResult<T>> {
  const pageSize = options?.pageSize ?? SUPABASE_MAX_ROWS_PER_REQUEST;
  const all: T[] = [];
  let from = 0;
  let pageCount = 0;

  while (true) {
    pageCount += 1;
    const { data, error } = await fetchPage({
      from,
      to: from + pageSize - 1,
    });
    if (error) {
      return { data: [], error: error.message, pageCount };
    }
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < pageSize) {
      return { data: all, error: null, pageCount };
    }
    from += pageSize;
  }
}

export function warnIfPoolPredictionsLookTruncated(args: {
  participantCount: number;
  predictionRowCount: number;
  paginationPageCount: number;
  context: string;
  poolId?: string;
}): void {
  const expectedMin =
    args.participantCount * PRE_LOCK_PICKS_PER_PARTICIPANT_ESTIMATE;
  if (
    args.participantCount > 0 &&
    args.predictionRowCount === SUPABASE_MAX_ROWS_PER_REQUEST &&
    expectedMin > SUPABASE_MAX_ROWS_PER_REQUEST &&
    args.paginationPageCount <= 1
  ) {
    console.warn(
      `[${args.context}] pool predictions may be truncated at Supabase ${SUPABASE_MAX_ROWS_PER_REQUEST}-row limit`,
      {
        poolId: args.poolId,
        participantCount: args.participantCount,
        predictionRowCount: args.predictionRowCount,
        expectedMinRows: expectedMin,
        paginationPageCount: args.paginationPageCount,
      },
    );
  }
}
