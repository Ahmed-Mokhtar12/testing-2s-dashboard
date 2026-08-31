// Chat-list timestamp ladder, computed at RENDER time from the stored ISO
// value (a label baked at fetch time goes stale: a chat stamped "14:05" today
// still said "14:05" tomorrow). Pure module — unit-tested under node --test.
//
// Ladder mirrors WhatsApp Web: time today · "Yesterday" · weekday within a
// week · short date after that. Locale-aware via toLocale* with an undefined
// locale (the operator's browser), which matches real WhatsApp Web behavior —
// the repo's Asia/Dubai rule governs scheduling calculations, not display
// (CLAUDE.md, Scheduling).

const startOfDay = (d: Date): number =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export const formatChatTimestamp = (iso: string, now: Date = new Date()): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (dayDiff <= 0) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};
