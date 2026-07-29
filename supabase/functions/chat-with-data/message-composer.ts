// Composes the system message. The persona prompt defines behavior; the data
// context carries retrieved rows. Both must reach the model — a bug that
// dropped the context (consultantPrompt || context) hid all data from Sera.
export function composeSystemContent(consultantPrompt?: string, context?: string): string {
  const persona = consultantPrompt?.trim();
  const data = context?.trim();
  if (persona && data) {
    return `${persona}\n\n## RETRIEVED DATA (live database context — treat as ground truth)\n${data}`;
  }
  return persona || data || '';
}
