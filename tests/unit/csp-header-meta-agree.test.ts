import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The CSP is delivered twice: as an HTTP header from public/serve.json (testing,
// where nginx proxies to `serve`) and as a <meta http-equiv> in index.html
// (production, where nginx serves dist/ directly and serve.json is inert — see
// docs/backlog.md B12). Two copies drift unless pinned to each other. One
// deliberate exception: frame-ancestors is header-ONLY — browsers ignore it in
// <meta> (Chrome logs a console error about it), and an inert-but-protective-
// looking directive is exactly the false green docs/testing-lessons.md warns
// about.

function parseCsp(policy: string): Map<string, Set<string>> {
  const directives = new Map<string, Set<string>>();
  for (const part of policy.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const [name, ...sources] = tokens;
    assert.ok(!directives.has(name), `duplicate directive ${name}`);
    directives.set(name, new Set(sources));
  }
  return directives;
}

function headerValue(): string {
  const config = JSON.parse(readFileSync('public/serve.json', 'utf8')) as {
    headers?: Array<{ source?: string; headers?: Array<{ key?: string; value?: string }> }>;
  };
  const entry = (config.headers ?? []).find((candidate) => candidate.source === '/index.html');
  assert.ok(entry, 'serve.json has no /index.html headers entry');
  const header = (entry.headers ?? []).find((h) => h.key === 'Content-Security-Policy');
  assert.ok(header, 'serve.json /index.html carries no Content-Security-Policy');
  return header.value ?? '';
}

function metaValue(): string {
  const html = readFileSync('index.html', 'utf8');
  const match = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i);
  assert.ok(match, 'index.html has no Content-Security-Policy <meta>');
  return match[1];
}

test('the header CSP is a single line serve can emit', () => {
  const value = headerValue();
  assert.ok(!/[\r\n]/.test(value), 'serve.json header values must be single-line');
  assert.ok(value.length <= 2048, `header value is ${value.length} chars; @zeit/schemas caps at 2048`);
  assert.match(value, /^[\x20-\x7e]+$/, 'header value must be printable ASCII');
});

test('header and meta carry the same policy, except frame-ancestors is header-only', () => {
  const header = parseCsp(headerValue());
  const meta = parseCsp(metaValue());

  assert.ok(header.has('frame-ancestors'), 'header must carry frame-ancestors');
  assert.deepEqual([...(header.get('frame-ancestors') ?? [])], ["'none'"]);
  assert.ok(
    !meta.has('frame-ancestors'),
    'frame-ancestors is spec-ignored in <meta>; carrying it there is a false green',
  );

  header.delete('frame-ancestors');
  assert.deepEqual([...header.keys()].sort(), [...meta.keys()].sort(), 'directive sets differ');
  for (const [name, sources] of header) {
    assert.deepEqual(
      [...sources].sort(),
      [...(meta.get(name) ?? [])].sort(),
      `sources differ for ${name}`,
    );
  }
  // Anti-vacuity: this test must fail if either copy goes empty.
  assert.deepEqual([...(meta.get('default-src') ?? [])], ["'self'"]);
});

test('neither copy readmits the audited-out sources', () => {
  for (const policy of [headerValue(), metaValue()]) {
    assert.ok(!/localhost|127\.0\.0\.1/.test(policy), 'dev origins do not belong in the shipped CSP (audit #8)');
    assert.ok(!policy.includes("'unsafe-eval'"), "'unsafe-eval' was removed by decision (audit #9)");
    assert.ok(!policy.includes('cdnjs.cloudflare.com'), 'the cdnjs worker-src is dead weight (W9)');
  }
});
