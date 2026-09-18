import { config } from '../config/env.js';

export class DateTimeUtil {
  /**
   * Returns current date string (YYYY-MM-DD) in configured application timezone
   */
  public static getTodayDateString(timeZone: string = config.appTimezone): string {
    const now = new Date();
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  }

  /**
   * Returns formatted date string (YYYY-MM-DD) for a given Date in the timezone
   */
  public static formatDateString(date: Date, timeZone: string = config.appTimezone): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  /**
   * Returns day of week string in lower-case (e.g. 'monday', 'tuesday') for a date string (YYYY-MM-DD)
   */
  public static getDayOfWeek(dateString: string): 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday' {
    const [y, m, d] = dateString.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
    return days[date.getUTCDay()];
  }

  /**
   * Calculates difference in seconds between two ISO strings or Dates
   */
  public static diffSeconds(start: Date | string, end: Date | string): number {
    const s = typeof start === 'string' ? new Date(start).getTime() : start.getTime();
    const e = typeof end === 'string' ? new Date(end).getTime() : end.getTime();
    return Math.max(0, Math.floor((e - s) / 1000));
  }

  /**
   * Add minutes to a date
   */
  public static addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60 * 1000);
  }

  /**
   * Returns exact start and end dates (and YYYY-MM-DD strings) for a given month
   * Month is 1-indexed (1 = January, 9 = September, 12 = December)
   */
  public static getMonthDateRange(year: number, month: number): {
    startDate: Date;
    endDate: Date;
    startStr: string;
    endStr: string;
    lastDay: number;
  } {
    const validMonth = Math.min(12, Math.max(1, month));
    // In UTC Date constructor, monthIndex 'validMonth' with day 0 gives the exact last day of validMonth
    const lastDay = new Date(Date.UTC(year, validMonth, 0)).getUTCDate();
    const startStr = `${year}-${String(validMonth).padStart(2, '0')}-01`;
    const endStr = `${year}-${String(validMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const startDate = new Date(Date.UTC(year, validMonth - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, validMonth - 1, lastDay, 23, 59, 59, 999));

    return {
      startDate,
      endDate,
      startStr,
      endStr,
      lastDay,
    };
  }

  /**
   * Returns exact start and end dates for a full year
   */
  public static getYearDateRange(year: number): {
    startDate: Date;
    endDate: Date;
    startStr: string;
    endStr: string;
  } {
    const startStr = `${year}-01-01`;
    const endStr = `${year}-12-31`;
    const startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

    return {
      startDate,
      endDate,
      startStr,
      endStr,
    };
  }

  /**
   * Parse HH:mm:ss to minutes from midnight
   */
  public static timeToMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }
}
