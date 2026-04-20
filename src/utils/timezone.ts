import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';

// Dubai timezone (Gulf Standard Time - GST)
export const DUBAI_TIMEZONE = 'Asia/Dubai';

// Language and timezone constants
export const DEFAULT_LANGUAGE = 'English';
export const SUPPORTED_LANGUAGES = ['English', 'Arabic'] as const;

/**
 * Format a date to Dubai timezone
 */
export const formatToDubaiTime = (
  date: Date | string | number,
  formatString: string = 'HH:mm'
): string => {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return formatInTimeZone(dateObj, DUBAI_TIMEZONE, formatString);
};

/**
 * "Now" expressed as a Date with the same wall-clock as Dubai.
 * Useful for date-math like subDays where we want Dubai's calendar day.
 */
export const getDubaiNow = (): Date => {
  return toZonedTime(new Date(), DUBAI_TIMEZONE);
};

/**
 * Backwards-compat alias
 */
export const getDubaiTime = (): Date => getDubaiNow();

/**
 * Date key (yyyy-MM-dd) for a given instant, computed in Dubai's calendar.
 * Use this for queries on Postgres `date` columns to avoid UTC day-shift.
 */
export const dubaiDateKey = (date: Date | string | number = new Date()): string => {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return formatInTimeZone(dateObj, DUBAI_TIMEZONE, 'yyyy-MM-dd');
};

/**
 * Start of day in Dubai for a given date, returned as an absolute UTC instant (Date).
 * Suitable for `.gte()` on `timestamptz` columns.
 */
export const dubaiStartOfDay = (date: Date | string | number): Date => {
  const key = dubaiDateKey(date);
  return fromZonedTime(`${key}T00:00:00.000`, DUBAI_TIMEZONE);
};

/**
 * End of day in Dubai for a given date (inclusive boundary 23:59:59.999),
 * returned as an absolute UTC instant.
 */
export const dubaiEndOfDay = (date: Date | string | number): Date => {
  const key = dubaiDateKey(date);
  return fromZonedTime(`${key}T23:59:59.999`, DUBAI_TIMEZONE);
};

/**
 * Format timestamp for chat messages
 */
export const formatChatTimestamp = (timestamp: Date | string): string => {
  const dateObj = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return formatToDubaiTime(dateObj, 'h:mm a');
};

/**
 * Format full date and time for Dubai timezone
 */
export const formatDubaiDateTime = (
  date: Date | string | number,
  includeSeconds: boolean = false
): string => {
  const formatString = includeSeconds ? 'MMM dd, yyyy h:mm:ss a' : 'MMM dd, yyyy h:mm a';
  return formatToDubaiTime(date, formatString);
};

/**
 * Get Dubai timezone offset info
 */
export const getDubaiTimezoneInfo = () => ({
  timezone: DUBAI_TIMEZONE,
  name: 'Gulf Standard Time',
  abbreviation: 'GST',
  offset: '+04:00',
});
