// Pure pagination helper — no Deno APIs, no URL imports, so Node unit tests
// can import it directly (same pattern as the aggregators).
//
// PostgREST caps every response at `api.max_rows` rows (1000 for this
// project, supabase/config.toml) regardless of the requested limit. Any
// query that may match more than one page of rows MUST paginate with
// .range(); a bare .limit(N > 1000) silently returns 1000 rows. `count:
// 'exact'` is not clamped, so the first page carries the true total.

export const PAGE_SIZE = 1000; // = PostgREST api.max_rows for this project

export interface PageResult<T> {
  data: T[] | null;
  count?: number | null;
  error: unknown;
}

export interface PagedFetchResult<T> {
  rows: T[];
  exactCount: number | null;
  error: unknown;
}

// fetchPage(from, to, withCount) issues one page query for rows [from..to]
// (inclusive, .range() semantics). withCount is true only on the first
// page, where the caller must request { count: 'exact' } so exactCount
// reflects ALL matching rows, not just the fetched ones.
export async function fetchAllWithCap<T>(
  fetchPage: (from: number, to: number, withCount: boolean) => PromiseLike<PageResult<T>>,
  cap: number,
  pageSize: number = PAGE_SIZE,
): Promise<PagedFetchResult<T>> {
  const rows: T[] = [];
  let exactCount: number | null = null;
  let offset = 0;
  while (rows.length < cap) {
    const span = Math.min(pageSize, cap - rows.length);
    const page = await fetchPage(offset, offset + span - 1, offset === 0);
    // Fail closed: partial rows with an unreliable total would recreate the
    // silent-truncation bug in a different shape.
    if (page.error) return { rows: [], exactCount: null, error: page.error };
    if (offset === 0) exactCount = page.count ?? null;
    const got = page.data ?? [];
    rows.push(...got);
    offset += got.length;
    // Short page ⇒ the server exhausted the result set (or clamped below
    // our span — exactCount still exposes the shortfall to the caller).
    if (got.length < span) break;
    if (exactCount !== null && rows.length >= exactCount) break;
  }
  return { rows: rows.slice(0, cap), exactCount, error: null };
}
