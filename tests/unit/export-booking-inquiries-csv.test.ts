import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell } from '../../supabase/functions/export-booking-inquiries/csv.ts';

// Guest-typed text lands in a CSV that staff open in Excel. A leading = + - @ or a tab/CR
// is executed as a formula (audit E10). Prefix with an apostrophe, which Excel treats as
// "text follows" and hides.
test('quotes, collapses whitespace and neutralises formula-leading cells', () => {
  assert.equal(csvCell('hello'), '"hello"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('a\r\nb   c'), '"a b c"');
  assert.equal(csvCell('=HYPERLINK("http://evil","click")'), '"\'=HYPERLINK(""http://evil"",""click"")"');
  assert.equal(csvCell('+971500000000'), '"\'+971500000000"');
  assert.equal(csvCell('-5'), '"\'-5"');
  assert.equal(csvCell('@sum'), '"\'@sum"');
  assert.equal(csvCell(null), '""');
});
