import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// MCP deploy_edge_function is proven only for files inside the function's own directory,
// so single-file functions carry a sibling copy of _shared/jwt-role.ts. This pins every
// copy to the canonical file: a fix that lands in one place and not the others fails here.
const CANONICAL = 'supabase/functions/_shared/jwt-role.ts';
const COPIES = [
  'supabase/functions/whatsapp-auto-release/jwt-role.ts',
  // Task 10 adds: browserless-scrape, serpapi-hotels, sheraton-marriott-browser, firecrawl-scrape
];

test('every sibling copy of jwt-role.ts is byte-identical to _shared/jwt-role.ts', () => {
  const canonical = readFileSync(CANONICAL, 'utf8');
  assert.ok(COPIES.length > 0, 'the copies list must not be empty');
  for (const copy of COPIES) assert.equal(readFileSync(copy, 'utf8'), canonical, `${copy} drifted from ${CANONICAL}`);
});
