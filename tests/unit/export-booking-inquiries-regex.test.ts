import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The eslint cleanup of export-booking-inquiries/index.ts removed redundant
// backslashes from inside character classes. That is exactly the kind of edit
// that looks cosmetic and silently changes a pattern: dropping the escape on a
// mid-class '-' turns two literals into a RANGE. These tests pin the two
// rewritten patterns against the pre-cleanup originals.
//
// The function itself cannot be imported here (it imports from esm.sh, a Deno
// URL specifier), so the live patterns are extracted from the source text — the
// same approach tests/unit/no-overclamp-limit.test.ts uses.

const SOURCE = readFileSync('supabase/functions/export-booking-inquiries/index.ts', 'utf8');

function extractRegex(name: string): RegExp {
  const m = SOURCE.match(new RegExp(`^const ${name} = /(.*)/([gimsuy]*);$`, 'm'));
  assert.ok(m, `could not find "const ${name} = /.../;" in the function source`);
  return new RegExp(m![1], m![2]);
}

// Verbatim from the function as it stood before the cleanup (version 9/10).
// The redundant escapes here are the whole point of the comparison — this is
// the only place in the repo where no-useless-escape is suppressed rather than
// fixed, because "fixing" these would delete the baseline being tested against.
/* eslint-disable no-useless-escape */
const OLD_EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/;
const OLD_DATE_RE = /((?:\d{1,2}[\s/\-\.]?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{0,4})|(?:\d{4}[\-/]\d{1,2}[\-/]\d{1,2})|(?:\d{1,2}[\-/]\d{1,2}[\-/]\d{2,4}))/gi;
/* eslint-enable no-useless-escape */

const NEW_EMAIL_RE = extractRegex('EMAIL_RE');
const NEW_DATE_RE = extractRegex('DATE_RE');

const allMatches = (re: RegExp, s: string): string[] =>
  [...s.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))]
    .map((m) => m[0]);

test('the cleaned patterns are still present and parseable in the source', () => {
  assert.equal(NEW_EMAIL_RE.flags, '');
  assert.equal(NEW_DATE_RE.flags, 'gi');
  // No backslash-escaped '-' or '.' left inside any character class.
  assert.equal(/\[[^\]]*\\[-.]/.test(NEW_EMAIL_RE.source), false);
  assert.equal(/\[[^\]]*\\[-.]/.test(NEW_DATE_RE.source), false);
});

test('EMAIL_RE: exhaustive ASCII sweep of the local-part class', () => {
  // If '+-]' had become a range, or '.-]' in the domain class, some ASCII byte
  // would start matching (or stop). Check every printable byte in both slots.
  for (let c = 32; c < 127; c++) {
    const ch = String.fromCharCode(c);
    for (const probe of [`a${ch}b@example.com`, `ab@ex${ch}ample.com`]) {
      assert.equal(
        NEW_EMAIL_RE.test(probe), OLD_EMAIL_RE.test(probe),
        `disagreement on ${JSON.stringify(probe)} (char code ${c})`,
      );
      assert.deepEqual(
        probe.match(NEW_EMAIL_RE)?.[0] ?? null,
        probe.match(OLD_EMAIL_RE)?.[0] ?? null,
        `matched text differs for ${JSON.stringify(probe)}`,
      );
    }
  }
});

test('DATE_RE: exhaustive ASCII sweep of the day/month separator class', () => {
  // '[\s/\-\.]' -> '[\s/.-]'. Naively unescaping the '-' in place would have
  // produced the reverse range '/-.' (0x2F..0x2E) and thrown; moving it to the
  // end keeps it literal. This proves no byte changed behaviour.
  for (let c = 32; c < 127; c++) {
    const ch = String.fromCharCode(c);
    for (const probe of [`12${ch}Jan 2026`, `2026${ch}01${ch}15`, `12${ch}01${ch}2026`]) {
      assert.deepEqual(
        allMatches(NEW_DATE_RE, probe), allMatches(OLD_DATE_RE, probe),
        `disagreement on ${JSON.stringify(probe)} (char code ${c})`,
      );
    }
  }
});

test('both patterns agree on realistic inputs', () => {
  const corpus = [
    'reach me at first.last+tag@sub-domain.co.uk please',
    'contact: a_b%c-d@ex-ample.travel',
    'no email here at all',
    'plain@localhost',                          // no TLD dot -> should not match
    'arriving 12 Jan 2027 leaving 15-Jan-2027',
    'check in 2026-08-01 and out 2026/08/07',
    'from 1/9/26 to 30/9/26',
    'dates 12.Jan and 12/Feb and 12-Mar',
    'حجز من 2026-09-01 إلى 2026-09-10 بريد: guest@example.com',
    '99999-99999-99999',
    'Sept 2026',
  ];
  for (const s of corpus) {
    assert.deepEqual(
      s.match(NEW_EMAIL_RE)?.[0] ?? null, s.match(OLD_EMAIL_RE)?.[0] ?? null,
      `EMAIL_RE differs on ${JSON.stringify(s)}`,
    );
    assert.deepEqual(
      allMatches(NEW_DATE_RE, s), allMatches(OLD_DATE_RE, s),
      `DATE_RE differs on ${JSON.stringify(s)}`,
    );
  }
});
