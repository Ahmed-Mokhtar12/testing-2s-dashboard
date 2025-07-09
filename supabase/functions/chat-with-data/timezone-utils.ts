// Dubai timezone utilities for backend Edge Functions
export const DUBAI_TIMEZONE = 'Asia/Dubai';
export const DEFAULT_LANGUAGE = 'English';

/**
 * Get current Dubai time as ISO string
 */
export function getDubaiTimeISO(): string {
  const now = new Date();
  // Dubai is UTC+4 (GST - Gulf Standard Time)
  const dubaiTime = new Date(now.getTime() + (4 * 60 * 60 * 1000));
  return dubaiTime.toISOString();
}

/**
 * Format timestamp for Dubai timezone
 */
export function formatDubaiTimestamp(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const dubaiTime = new Date(dateObj.getTime() + (4 * 60 * 60 * 1000));
  
  return dubaiTime.toLocaleString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }) + ' (Dubai Time)';
}

/**
 * Get Dubai timezone context for AI prompts
 */
export function getDubaiTimezoneContext(): string {
  const dubaiTime = getDubaiTimeISO();
  const formattedTime = formatDubaiTimestamp(dubaiTime);
  
  return `
Current Dubai Time: ${formattedTime}
Timezone: Gulf Standard Time (GST, UTC+4)
Hotel operates in Dubai timezone for all business operations.
`;
}