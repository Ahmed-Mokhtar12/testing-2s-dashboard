// Pure, import-free (unit-tested under node --test). Deployed alongside index.ts.
export function csvCell(v: unknown): string {
  const s = (v ?? '').toString().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Guest-typed text lands in a CSV that staff open in Excel. A leading = + - @ or a
  // tab/CR is executed as a formula (audit E10). An apostrophe prefix makes Excel treat the
  // cell as text and hides itself.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}
