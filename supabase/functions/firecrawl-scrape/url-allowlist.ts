// Host allowlist for firecrawl-scrape. Zero imports on purpose so this exact
// file runs both under Deno (the edge runtime) and under Node's type-stripping
// test runner, which is what lets tests/unit/firecrawl-url-allowlist.test.ts
// exercise the deployed logic rather than a copy of it.
//
// Why it exists: until 2026-07-31 this function fetched ANY caller-supplied URL
// through the account's Firecrawl key. Gateway verify_jwt (also set that day)
// stops anonymous callers, but every staff account could still aim the key at
// an arbitrary target. The old competitor-rates workstream this function
// belonged to is retired, so the target set is pinned to the six hotel-brand
// domains its sibling browserless-scrape builds URLs for (HOTEL_URLS there).
// Adding a host is a one-line change here plus a redeploy.

export const ALLOWED_SCRAPE_HOSTS = [
  'marriott.com',
  'accor.com',
  'gloriahotels.com',
  'rotana.com',
  'ihg.com',
  'hyatt.com',
] as const;

export type ScrapeUrlCheck =
  | { ok: true; url: string }
  | { ok: false; error: string };

function hostIsAllowed(hostname: string): boolean {
  // Lowercase, and drop a fully-qualified trailing dot — 'marriott.com.' names
  // the same host as 'marriott.com'.
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return ALLOWED_SCRAPE_HOSTS.some(
    // Exact match, or a subdomain of it. Deliberately NOT a bare
    // host.endsWith(domain): that would also accept 'evilmarriott.com'.
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

export function resolveScrapeUrl(raw: unknown): ScrapeUrlCheck {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, error: 'URL is required' };
  }

  let candidate = raw.trim();
  // Case-insensitive: 'HTTP://www.marriott.com' is a valid URL, and a
  // case-sensitive startsWith would prefix it into 'https://HTTP://...',
  // whose hostname parses as 'http' and gets rejected for the wrong reason.
  if (!/^https?:\/\//i.test(candidate)) {
    // Keeps the original function's convenience behaviour (a bare host gets
    // https://). Input carrying some other scheme ('file:', 'javascript:')
    // becomes either an unparseable URL or a hostname that is not on the list —
    // either way it fails closed below, which is why there is no scheme-sniffing
    // regex here (one would misfire on a bare 'host:port' input).
    candidate = `https://${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: 'URL is not parseable' };
  }

  // Unreachable by construction today — the block above guarantees `candidate`
  // starts with http:// or https://, so `parsed.protocol` can only be one of
  // those. Kept deliberately as a tripwire: if that prefixing is ever relaxed
  // into scheme-sniffing, this is what stops a 'file:'/'gopher:' target. The
  // "every accepted URL is http(s)" case in the test file pins that property
  // rather than this branch, so mutation-testing will show this `if` as
  // surviving — expected, not a coverage gap being ignored.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: `Unsupported protocol: ${parsed.protocol}` };
  }

  if (!hostIsAllowed(parsed.hostname)) {
    return {
      ok: false,
      error:
        `Host not allowed: ${parsed.hostname}. ` +
        `Allowed: ${ALLOWED_SCRAPE_HOSTS.join(', ')} (and their subdomains)`,
    };
  }

  // Hand back the PARSED form, not the raw input: the URL that goes to Firecrawl
  // is then literally the one this function validated, so a parser disagreement
  // between here and Firecrawl cannot resolve to a different host.
  return { ok: true, url: parsed.toString() };
}
