// Per-chat composer drafts, keyed by sender number in localStorage. Text only:
// staged attachments stay session-local on purpose (a File can't be persisted,
// and silently re-arming an upload after a reload would be a mis-send hazard).
// Every accessor is try/catch'd — storage can throw (private mode, blocked).

const key = (senderNumber: string) => `wa_draft_${senderNumber}`;

export const getDraft = (senderNumber: string): string => {
  try {
    return window.localStorage.getItem(key(senderNumber)) ?? '';
  } catch {
    return '';
  }
};

export const setDraft = (senderNumber: string, text: string): void => {
  try {
    if (text.trim()) window.localStorage.setItem(key(senderNumber), text);
    else window.localStorage.removeItem(key(senderNumber));
  } catch {
    // best-effort only
  }
};

export const clearDraft = (senderNumber: string): void => setDraft(senderNumber, '');

/** Sidebar preview: a non-open chat with a pending draft shows it instead of
    the last message (the open chat shows its composer, like WhatsApp). */
export const getDraftPreview = (
  senderNumber: string,
  selectedNumber: string
): string | null => {
  if (senderNumber === selectedNumber) return null;
  const draft = getDraft(senderNumber);
  return draft.trim() ? draft : null;
};
