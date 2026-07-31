import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, normalize, dirname } from 'node:path';

// WHY THIS EXISTS: there is no local type-check for edge-function code at all.
// `npm run typecheck` covers tsconfig.app.json and tsconfig.node.json, neither
// of which includes supabase/functions (Deno-style `.ts` import specifiers and
// `jsr:`/`https:` imports do not resolve under tsc), and deno is NOT installed
// on this host. So a broken relative import inside supabase/functions is
// invisible until deploy — or worse, until the function is invoked.
//
// The failure mode this guards is specifically deletion. When the 12 dead
// chat-with-data modules were removed, the evidence that nothing broke was a
// hand-run script; that script belongs in the suite rather than in a commit
// message. Deleting a module that something still imports, or renaming one
// and missing a caller, now fails here in ~10ms instead of at runtime.
//
// Scope is deliberately narrow: it resolves RELATIVE specifiers only. Bare and
// remote specifiers (`jsr:@supabase/...`, `https://deno.land/...`,
// `node:buffer`) are Deno's to resolve and cannot be checked from here without
// network access, which a unit test must not need.
const ROOT = 'supabase/functions';

// Matches `from './x.ts'`, `import './x.ts'` and the type-only forms, single
// or double quoted. Only specifiers starting with `.` are captured, so bare
// and remote ones are skipped by construction rather than by a later filter.
const RELATIVE_IMPORT = /(?:from|import)\s+['"](\.[^'"]+)['"]/g;

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? tsFiles(full) : (name.endsWith('.ts') ? [full] : []);
  });
}

test('every relative import in supabase/functions resolves to a file that exists', () => {
  const files = tsFiles(ROOT);
  // Guard against the whole test passing vacuously if ROOT is ever moved or
  // the walker breaks: an empty file list would otherwise report success.
  assert.ok(files.length > 20, `expected to scan many edge files, found ${files.length}`);

  const broken: string[] = [];
  let edges = 0;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const [, spec] of source.matchAll(RELATIVE_IMPORT)) {
      edges += 1;
      const target = normalize(join(dirname(file), spec));
      if (!existsSync(target)) broken.push(`${file} -> ${spec} (missing ${target})`);
    }
  }
  // Same anti-vacuity guard one level down: a regex that stopped matching would
  // leave `broken` empty and look like a pass.
  assert.ok(edges > 50, `expected many relative imports across the edge tree, found ${edges}`);
  assert.deepEqual(broken, []);
});

// The deploy script (scripts/deploy-chat-with-data.sh) strips `*-old.ts` and
// `*.test.ts` from the archive before deploying, so a live module importing one
// of those would resolve here and still 500 in production. Nothing does today;
// this pins it.
test('no deployed edge module imports a *-old.ts or *.test.ts file', () => {
  const offenders: string[] = [];
  for (const file of tsFiles(ROOT)) {
    if (/(-old|\.test)\.ts$/.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    for (const [, spec] of source.matchAll(RELATIVE_IMPORT)) {
      if (/(-old|\.test)\.ts$/.test(spec)) offenders.push(`${file} -> ${spec}`);
    }
  }
  assert.deepEqual(offenders, []);
});
