/**
 * Search engine responses report the match count for the whole query, while the
 * `hits` array only holds the requested page. Paging metadata must be derived
 * from the engine total, never from the page length, or every response claims
 * `totalPages: 1` and clients stop after the first page.
 */
export function resolveSearchTotal(
  results: { totalHits?: number; estimatedTotalHits?: number } | null | undefined,
  offset: number,
  pageLength: number,
) {
  const engineTotal = results?.totalHits ?? results?.estimatedTotalHits;
  const reported =
    typeof engineTotal === "number" && Number.isFinite(engineTotal) && engineTotal > 0
      ? Math.floor(engineTotal)
      : 0;

  // Whatever the engine says, the total cannot be smaller than the rows this
  // page already returned.
  return Math.max(reported, Math.max(0, offset) + pageLength);
}
