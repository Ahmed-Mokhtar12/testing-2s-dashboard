import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// PostgREST clamps every response to api.max_rows = 1000 (supabase/config.toml).
// A literal .limit(N) above that is a silent-truncation bug: the query returns
// 1000 rows and any total derived from rows.length is wrong. Twice shipped,
// twice fixed (edge tools: 4c6c584; insights hooks: this commit). Bulk reads
// must go through fetchAllRows (frontend) or fetchAllWithCap (edge functions).
const SERVER_MAX_ROWS = 1000;
const ROOTS = ['src', 'supabase/functions'];

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : tsFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [full] : [];
  });
}

test(`no literal .limit() exceeds the PostgREST max_rows clamp of ${SERVER_MAX_ROWS}`, () => {
  const offenders: string[] = [];
  for (const root of ROOTS) {
    for (const file of tsFiles(root)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/\.limit\(\s*(\d+)\s*\)/g)) {
        if (Number(match[1]) > SERVER_MAX_ROWS) offenders.push(`${file}: .limit(${match[1]})`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
