// Dubai timezone utilities for backend Edge Functions
export const DUBAI_TIMEZONE = 'Asia/Dubai';
export const DEFAULT_LANGUAGE = 'English';

/**
 * Format a Date in the Dubai timezone using Intl. Returns parts so callers
 * can build any string they need without manual offset math.
 */
function dubaiParts(date: Date): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: DUBAI_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  return parts;
}

/**
 * Get current Dubai wall-clock time as an ISO-like string (yyyy-MM-ddTHH:mm:ss+04:00).
 */
export function getDubaiTimeISO(): string {
  const p = dubaiParts(new Date());
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+04:00`;
}

/**
 * Format timestamp for Dubai timezone (human-readable).
 */
export function formatDubaiTimestamp(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: DUBAI_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(dateObj);
  return `${formatted} (Dubai Time)`;
}

/**
 * Get Dubai timezone context for AI prompts
 */
export function getDubaiTimezoneContext(): string {
  const formattedTime = formatDubaiTimestamp(new Date());

  return `
Current Dubai Time: ${formattedTime}
Timezone: Gulf Standard Time (GST, UTC+4)
Hotel operates in Dubai timezone for all business operations.
`;
}
