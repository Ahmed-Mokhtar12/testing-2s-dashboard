import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The training-report recipient list has ONE authority — RECIPIENTS in
// supabase/functions/training-report/index.ts — but two copies that a reader
// trusts:
//
//   1. scripts/send-training-report-real.sh's RECIPIENTS_DISPLAY, which is
//      printed at the "REAL SEND — this emails other people" confirmation
//      prompt. If it disagrees with the function, the prompt tells the operator
//      they are about to email one set of people while the function emails
//      another. That is the worst possible place for this to drift.
//   2. the design spec's summary line, which is what anyone reads before
//      changing this next.
//
// Both were stale-by-construction until this test existed: nothing connected
// them to the function. Changing the recipients on 2026-08-01 (three named
// individuals -> the Departmental Trainers DL) touched four files, and the
// question "did the old list survive somewhere" had to be answered by grep.
// This test answers it on every run instead.
//
// It deliberately does NOT assert WHICH addresses are configured — that is a
// config value, and a test restating it would only ever fail when someone
// changed it on purpose. It asserts the copies agree with the authority.
const FUNCTION_SRC = 'supabase/functions/training-report/index.ts';
const SCRIPT_SRC = 'scripts/send-training-report-real.sh';
const SPEC_SRC = 'docs/superpowers/plans/2026-07-30-training-report-emails.md';

function recipientsFromFunction(): string[] {
  const source = readFileSync(FUNCTION_SRC, 'utf8');
  // Matches both the single-address form and a multi-line array, so re-expanding
  // to several recipients later does not silently disable this test.
  const match = source.match(/^const RECIPIENTS = (\[[\s\S]*?\]);/m);
  assert.ok(match, `could not find "const RECIPIENTS = [...]" in ${FUNCTION_SRC}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

test('the send script and the spec name the same recipients as the function', () => {
  const recipients = recipientsFromFunction();

  // ANTI-VACUITY. Every assertion below is a "does X contain each recipient"
  // check, and all of them pass trivially against an empty list — which is
  // exactly what a broken regex produces. A report with no recipients is also
  // a real bug in its own right, so this guard is load-bearing twice.
  assert.ok(
    recipients.length > 0,
    `extracted zero recipients from ${FUNCTION_SRC} — the regex broke, or the function would email nobody`,
  );

  const script = readFileSync(SCRIPT_SRC, 'utf8');
  const displayMatch = script.match(/^RECIPIENTS_DISPLAY="([^"]*)"/m);
  assert.ok(displayMatch, `could not find RECIPIENTS_DISPLAY in ${SCRIPT_SRC}`);
  const display = displayMatch[1];
  assert.ok(display.trim().length > 0, `RECIPIENTS_DISPLAY in ${SCRIPT_SRC} is empty`);

  const spec = readFileSync(SPEC_SRC, 'utf8');
  const specLine = spec.split('\n').find((line) => line.startsWith('- Recipients:'));
  assert.ok(specLine, `could not find the "- Recipients:" summary line in ${SPEC_SRC}`);

  for (const address of recipients) {
    assert.ok(
      display.includes(address),
      `${SCRIPT_SRC} RECIPIENTS_DISPLAY does not mention ${address}, so the real-send `
        + `confirmation prompt would name the wrong people. Got: "${display}"`,
    );
    assert.ok(
      specLine.includes(address),
      `${SPEC_SRC}'s "- Recipients:" line does not mention ${address}`,
    );
  }
});
