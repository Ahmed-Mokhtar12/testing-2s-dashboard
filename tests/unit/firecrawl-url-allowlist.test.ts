import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveScrapeUrl, ALLOWED_SCRAPE_HOSTS,
} from '../../supabase/functions/firecrawl-scrape/url-allowlist.ts';

// This is a security boundary: before 2026-07-31 firecrawl-scrape fetched any
// caller-supplied URL on the account's Firecrawl key. The cases below are the
// bypasses that a naive check would let through.

const ok = (raw: string): string => {
  const r = resolveScrapeUrl(raw);
  assert.equal(r.ok, true, `expected ${raw} to be allowed, got: ${r.ok ? '' : r.error}`);
  return r.ok ? r.url : '';
};

const rejected = (raw: unknown): string => {
  const r = resolveScrapeUrl(raw);
  assert.equal(r.ok, false, `expected ${String(raw)} to be REJECTED but it was allowed`);
  return r.ok ? '' : r.error;
};

test('allows the hotel-brand hosts and their subdomains', () => {
  ok('https://www.marriott.com/reservation/rateListMenu.mi?propertyCode=DXBSI');
  ok('https://all.accor.com/hotel/A8V6/index.en.shtml?dateIn=2026-08-01');
  ok('https://accor.com/hotel/A8V6');            // apex, not just subdomains
  ok('https://www.gloriahotels.com/khalidiya-palace-rayhaan/rooms-and-rates');
  ok('https://www.rotana.com/rotanahotelandresorts/al-bandar-rotana');
  ok('https://www.ihg.com/crowneplaza/hotels/ae/en/dubai/DXBCP/hoteldetail');
  ok('https://www.hyatt.com/shop/rooms/dubai');
});

test('keeps the bare-host convenience behaviour (https:// is added)', () => {
  assert.equal(ok('www.marriott.com/x?a=1'), 'https://www.marriott.com/x?a=1');
});

test('accepts http:// as well as https://', () => {
  assert.equal(ok('http://www.hyatt.com/x'), 'http://www.hyatt.com/x');
});

test('an upper-case scheme is recognised, not mangled into a bogus hostname', () => {
  // A case-sensitive startsWith would turn this into 'https://HTTP://...',
  // whose hostname is 'http' — rejected for the wrong reason.
  assert.equal(ok('HTTP://www.hyatt.com/x'), 'http://www.hyatt.com/x');
  assert.equal(ok('HttPS://www.hyatt.com/x'), 'https://www.hyatt.com/x');
});

test('every accepted URL is http(s) — pins the property, not the branch', () => {
  // The explicit protocol guard in the module is unreachable while bare input
  // is prefixed with https://. This asserts the invariant it exists to protect,
  // so a future refactor of that prefixing cannot silently drop it.
  for (const raw of [
    'www.marriott.com', 'https://all.accor.com/x', 'http://www.ihg.com/y',
    'HTTP://www.hyatt.com', 'rotana.com/z?a=1',
  ]) {
    assert.match(ok(raw), /^https?:\/\//);
  }
});

test('returns the parsed URL, so Firecrawl fetches exactly what was validated', () => {
  // Trailing slash added, host lowercased — the canonical form of the target.
  assert.equal(ok('  https://WWW.Marriott.com  '), 'https://www.marriott.com/');
});

test('a trailing dot names the same host and is accepted', () => {
  assert.equal(ok('https://www.marriott.com./x'), 'https://www.marriott.com./x');
});

test('rejects a host that merely ENDS WITH an allowed domain', () => {
  // The endsWith(domain) trap: these are attacker-controlled registrations.
  assert.match(rejected('https://evilmarriott.com/x'), /Host not allowed/);
  assert.match(rejected('https://notaccor.com/x'), /Host not allowed/);
  assert.match(rejected('https://xihg.com/x'), /Host not allowed/);
});

test('rejects an allowed domain used as a prefix of another host', () => {
  assert.match(rejected('https://marriott.com.evil.com/x'), /Host not allowed/);
  assert.match(rejected('https://www.hyatt.com.attacker.net/'), /Host not allowed/);
});

test('rejects userinfo that makes an allowed host look like the target', () => {
  // hostname here is evil.com, not marriott.com.
  assert.match(rejected('https://www.marriott.com@evil.com/x'), /evil\.com/);
  assert.match(rejected('https://www.marriott.com:pass@evil.com/x'), /evil\.com/);
});

test('rejects an allowed domain that only appears in path or query', () => {
  assert.match(rejected('https://evil.com/?next=https://www.marriott.com'), /Host not allowed/);
  assert.match(rejected('https://evil.com/www.marriott.com'), /Host not allowed/);
});

test('rejects non-http schemes and local/metadata targets', () => {
  rejected('file:///etc/passwd');
  rejected('javascript:alert(1)');
  rejected('data:text/html,<h1>x</h1>');
  rejected('http://169.254.169.254/latest/meta-data/');   // cloud metadata SSRF
  rejected('http://localhost:8000/');
  rejected('http://127.0.0.1/');
  rejected('http://[::1]/');
  rejected('//evil.com/x');                                // scheme-relative
});

test('rejects unicode look-alike hostnames', () => {
  // 'mаrriott.com' with a Cyrillic 'а' punycodes to xn--mrriott-j4g.com.
  assert.match(rejected('https://www.mаrriott.com/x'), /Host not allowed/);
});

test('rejects missing, empty and non-string input', () => {
  assert.equal(rejected(undefined), 'URL is required');
  assert.equal(rejected(null), 'URL is required');
  assert.equal(rejected(''), 'URL is required');
  assert.equal(rejected('   '), 'URL is required');
  assert.equal(rejected(42), 'URL is required');
  assert.equal(rejected({ url: 'https://www.marriott.com' }), 'URL is required');
  assert.equal(rejected(['https://www.marriott.com']), 'URL is required');
});

test('the allowlist is the six brand domains browserless-scrape targets', () => {
  // Guards against a host being added here without a deliberate decision.
  assert.deepEqual([...ALLOWED_SCRAPE_HOSTS], [
    'marriott.com', 'accor.com', 'gloriahotels.com', 'rotana.com', 'ihg.com', 'hyatt.com',
  ]);
});
