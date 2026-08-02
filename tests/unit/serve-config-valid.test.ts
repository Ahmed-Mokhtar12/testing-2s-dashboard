import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// public/serve.json sets the cache headers for the built site. `serve` validates
// it against @zeit/schemas' config-static with `additionalProperties: false` at
// every level, and REFUSES TO START when validation fails — so an invalid file
// here does not degrade the cache policy, it takes the site down at the next
// `pm2 restart`.
//
// The failure is invisible in review. The first version of this config carried
// "$comment" keys documenting why each header exists; that is ordinary practice
// in JSON config and it would have been fatal. Nothing in the repo's gates would
// have caught it: the file is not TypeScript, not imported, and not linted.
//
// This test does not re-implement the schema. It asserts the one property that
// makes the schema fatal — no key anywhere that the schema does not know — plus
// that the two headers we care about are actually present and spelled correctly.
const CONFIG = 'public/serve.json';

// From @zeit/schemas/deployment/config-static.js, the schema `serve` compiles.
// Widening this list is a decision, not a fix: check the installed schema first.
const ALLOWED_TOP_LEVEL = new Set([
  'public',
  'cleanUrls',
  'rewrites',
  'redirects',
  'headers',
  'directoryListing',
  'unlisted',
  'trailingSlash',
  'renderSingle',
  'symlinks',
]);

interface ServeConfig {
  headers?: Array<{ source?: string; headers?: Array<{ key?: string; value?: string }> }>;
}

function loadConfig(): ServeConfig {
  const raw = readFileSync(CONFIG, 'utf8');
  // A syntax error here is the same site-down failure, so surface it as one.
  return JSON.parse(raw) as ServeConfig;
}

test('serve.json carries no key the schema would reject', () => {
  const config = loadConfig();

  const topLevel = Object.keys(config);
  assert.ok(topLevel.length > 0, 'serve.json is empty; it would do nothing');
  for (const key of topLevel) {
    assert.ok(
      ALLOWED_TOP_LEVEL.has(key),
      `"${key}" is not a key @zeit/schemas config-static allows. additionalProperties is false, so serve exits on startup rather than ignoring it.`,
    );
  }

  for (const entry of config.headers ?? []) {
    assert.deepEqual(
      Object.keys(entry).sort(),
      ['headers', 'source'],
      'a headers entry may contain exactly `source` and `headers`',
    );
    for (const header of entry.headers ?? []) {
      assert.deepEqual(
        Object.keys(header).sort(),
        ['key', 'value'],
        'a header may contain exactly `key` and `value`',
      );
    }
  }
});

test('the hashed assets are immutable and index.html is not cached', () => {
  const config = loadConfig();
  const entries = config.headers ?? [];

  const find = (source: string) => {
    const entry = entries.find((candidate) => candidate.source === source);
    assert.ok(entry, `no headers entry for ${source}`);
    const cacheControl = entry.headers?.find((header) => header.key === 'Cache-Control');
    assert.ok(cacheControl, `${source} has no Cache-Control`);
    return cacheControl.value ?? '';
  };

  // Vite content-hashes every filename under /assets, which is what makes
  // `immutable` correct: the URL changes whenever the bytes do.
  const assets = find('/assets/**');
  assert.match(assets, /\bimmutable\b/);
  assert.match(assets, /max-age=31536000\b/);

  // index.html is the only file whose name never changes and it carries the
  // hashed script tags. Cached, a browser keeps loading the previous deploy.
  assert.match(find('/index.html'), /^no-cache$/);
});
