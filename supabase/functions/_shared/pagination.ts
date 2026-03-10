// supabase/functions/_shared/pagination.ts
// WS-003: Auto-Pagination Helper for Google & Microsoft APIs

export interface PaginateOptions {
  /** Maximum number of pages to fetch (default 50) */
  maxPages?: number;
  /** Delay between page fetches in ms (default 100) */
  delayMs?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  totalPages: number;
  truncated: boolean;
}

/**
 * Google-style pagination: the fetch function returns { items, nextPageToken }
 */
interface GooglePageResult<T> {
  items: T[];
  nextPageToken?: string | null;
}

/**
 * Microsoft-style pagination: the fetch function returns { items, nextLink }
 */
interface MicrosoftPageResult<T> {
  items: T[];
  nextLink?: string | null;
}

type PageResult<T> = GooglePageResult<T> | MicrosoftPageResult<T>;

/**
 * Auto-paginate through a provider API that uses token-based pagination.
 *
 * Works with both Google (`nextPageToken`) and Microsoft (`@odata.nextLink`) patterns.
 *
 * @param fetchPage - Function that fetches one page. Receives pageToken/nextLink (undefined for first page).
 * @param options - Pagination limits.
 *
 * @example Google:
 * ```ts
 * const result = await paginateAll<GmailMessage>(async (pageToken) => {
 *   const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
 *   if (pageToken) url.searchParams.set('pageToken', pageToken);
 *   const res = await fetch(url, { headers });
 *   const data = await res.json();
 *   return { items: data.messages || [], nextPageToken: data.nextPageToken };
 * });
 * ```
 *
 * @example Microsoft:
 * ```ts
 * const result = await paginateAll<OutlookMessage>(async (nextLink) => {
 *   const url = nextLink || 'https://graph.microsoft.com/v1.0/me/messages';
 *   const res = await fetch(url, { headers });
 *   const data = await res.json();
 *   return { items: data.value || [], nextLink: data['@odata.nextLink'] };
 * });
 * ```
 */
export async function paginateAll<T>(
  fetchPage: (cursor?: string) => Promise<PageResult<T>>,
  options: PaginateOptions = {}
): Promise<PaginatedResult<T>> {
  const { maxPages = 50, delayMs = 100 } = options;

  const allItems: T[] = [];
  let cursor: string | undefined;
  let pageCount = 0;

  while (pageCount < maxPages) {
    const page = await fetchPage(cursor);
    allItems.push(...page.items);
    pageCount++;

    // Determine next cursor from whichever pattern the provider uses
    const nextCursor =
      ('nextPageToken' in page ? page.nextPageToken : undefined) ||
      ('nextLink' in page ? page.nextLink : undefined);

    if (!nextCursor) break;

    cursor = nextCursor;

    // Rate-limit delay between pages
    if (delayMs > 0 && pageCount < maxPages) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return {
    items: allItems,
    totalPages: pageCount,
    truncated: pageCount >= maxPages,
  };
}
