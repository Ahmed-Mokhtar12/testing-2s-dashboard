import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';

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
 * Get current Dubai time
 */
export const getDubaiTime = (): Date => {
  return toZonedTime(new Date(), DUBAI_TIMEZONE);
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
  offset: '+04:00'
});