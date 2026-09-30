import { config } from '../config/env.js';
import { AttendanceStatus } from '../types/index.js';

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
   * Returns formatted date string (YYYY-MM-DD) for a given Date in the timezone.
   * Safe against null, undefined, and Invalid Date.
   */
  public static formatDateString(date?: Date | string | null, timeZone: string = config.appTimezone): string {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    } catch {
      return '';
    }
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
   * Check if a year is a leap year
   */
  public static isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  }

  /**
   * Returns exact days in a month for a specific year
   */
  public static getDaysInMonth(year: number, month: number): number {
    if (month < 1 || month > 12) return 0;
    const days = [31, DateTimeUtil.isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return days[month - 1];
  }

  /**
   * Validates date string YYYY-MM-DD against calendar rules (leap years, month bounds)
   */
  public static isValidDateString(dateStr?: string | null): boolean {
    if (!dateStr || typeof dateStr !== 'string') return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const [yStr, mStr, dStr] = dateStr.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const d = parseInt(dStr, 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return false;
    if (y < 1900 || y > 2100) return false;
    if (m < 1 || m > 12) return false;
    const maxDays = DateTimeUtil.getDaysInMonth(y, m);
    return d >= 1 && d <= maxDays;
  }

  /**
   * Returns start and end Date objects and strings for a single specific date
   */
  public static getSpecificDateRange(dateStr: string): {
    startDate: Date;
    endDate: Date;
    dateStr: string;
  } {
    const [y, m, d] = dateStr.split('-').map(Number);
    const startDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
    return {
      startDate,
      endDate,
      dateStr,
    };
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
    nextMonthStartDate: Date;
    nextMonthStartStr: string;
  } {
    const validMonth = Math.min(12, Math.max(1, month));
    const lastDay = DateTimeUtil.getDaysInMonth(year, validMonth);
    const startStr = `${year}-${String(validMonth).padStart(2, '0')}-01`;
    const endStr = `${year}-${String(validMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const startDate = new Date(Date.UTC(year, validMonth - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, validMonth - 1, lastDay, 23, 59, 59, 999));

    const nextMonth = validMonth === 12 ? 1 : validMonth + 1;
    const nextYear = validMonth === 12 ? year + 1 : year;
    const nextMonthStartStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
    const nextMonthStartDate = new Date(Date.UTC(nextYear, nextMonth - 1, 1, 0, 0, 0, 0));

    return {
      startDate,
      endDate,
      startStr,
      endStr,
      lastDay,
      nextMonthStartDate,
      nextMonthStartStr,
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
    nextYearStartDate: Date;
    nextYearStartStr: string;
  } {
    const startStr = `${year}-01-01`;
    const endStr = `${year}-12-31`;
    const startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

    const nextYearStartStr = `${year + 1}-01-01`;
    const nextYearStartDate = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0));

    return {
      startDate,
      endDate,
      startStr,
      endStr,
      nextYearStartDate,
      nextYearStartStr,
    };
  }

  /**
   * Returns exact start and end Date objects for standard and custom worked-time periods
   */
  public static getPeriodDateRange(
    period: string = 'ALL_TIME',
    customFrom?: string | null,
    customTo?: string | null,
    timeZone: string = config.appTimezone
  ): {
    startDate: Date | null;
    endDate: Date | null;
    startStr?: string | null;
    endStr?: string | null;
    period: string;
  } {
    const normPeriod = (period || 'ALL_TIME').toUpperCase();

    if (normPeriod === 'TODAY') {
      const todayStr = DateTimeUtil.getTodayDateString(timeZone);
      const range = DateTimeUtil.getSpecificDateRange(todayStr);
      return { startDate: range.startDate, endDate: range.endDate, startStr: todayStr, endStr: todayStr, period: 'TODAY' };
    }

    if (normPeriod === 'YESTERDAY') {
      const todayStr = DateTimeUtil.getTodayDateString(timeZone);
      const [y, m, d] = todayStr.split('-').map(Number);
      const yesterdayDate = new Date(Date.UTC(y, m - 1, d - 1, 12, 0, 0));
      const yesterdayStr = DateTimeUtil.formatDateString(yesterdayDate, timeZone);
      const range = DateTimeUtil.getSpecificDateRange(yesterdayStr);
      return { startDate: range.startDate, endDate: range.endDate, startStr: yesterdayStr, endStr: yesterdayStr, period: 'YESTERDAY' };
    }

    if (normPeriod === 'THIS_WEEK') {
      const todayStr = DateTimeUtil.getTodayDateString(timeZone);
      const [y, m, d] = todayStr.split('-').map(Number);
      const curr = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      const dayOfWeek = curr.getUTCDay(); // 0 is Sunday, 1 is Monday...
      const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const mondayDate = new Date(Date.UTC(y, m - 1, d - distanceToMonday, 0, 0, 0, 0));
      const sundayDate = new Date(Date.UTC(y, m - 1, d - distanceToMonday + 6, 23, 59, 59, 999));
      return {
        startDate: mondayDate,
        endDate: sundayDate,
        startStr: DateTimeUtil.formatDateString(mondayDate, timeZone),
        endStr: DateTimeUtil.formatDateString(sundayDate, timeZone),
        period: 'THIS_WEEK',
      };
    }

    if (normPeriod === 'LAST_WEEK') {
      const todayStr = DateTimeUtil.getTodayDateString(timeZone);
      const [y, m, d] = todayStr.split('-').map(Number);
      const curr = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      const dayOfWeek = curr.getUTCDay();
      const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const lastMondayDate = new Date(Date.UTC(y, m - 1, d - distanceToMonday - 7, 0, 0, 0, 0));
      const lastSundayDate = new Date(Date.UTC(y, m - 1, d - distanceToMonday - 1, 23, 59, 59, 999));
      return {
        startDate: lastMondayDate,
        endDate: lastSundayDate,
        startStr: DateTimeUtil.formatDateString(lastMondayDate, timeZone),
        endStr: DateTimeUtil.formatDateString(lastSundayDate, timeZone),
        period: 'LAST_WEEK',
      };
    }

    if (normPeriod === 'THIS_MONTH') {
      const todayStr = DateTimeUtil.getTodayDateString(timeZone);
      const [y, m] = todayStr.split('-').map(Number);
      const range = DateTimeUtil.getMonthDateRange(y, m);
      return {
        startDate: range.startDate,
        endDate: range.endDate,
        startStr: range.startStr,
        endStr: range.endStr,
        period: 'THIS_MONTH',
      };
    }

    if (normPeriod === 'LAST_MONTH') {
      const todayStr = DateTimeUtil.getTodayDateString(timeZone);
      const [y, m] = todayStr.split('-').map(Number);
      const prevYear = m === 1 ? y - 1 : y;
      const prevMonth = m === 1 ? 12 : m - 1;
      const range = DateTimeUtil.getMonthDateRange(prevYear, prevMonth);
      return {
        startDate: range.startDate,
        endDate: range.endDate,
        startStr: range.startStr,
        endStr: range.endStr,
        period: 'LAST_MONTH',
      };
    }

    if (normPeriod === 'CUSTOM' && customFrom && customTo && DateTimeUtil.isValidDateString(customFrom) && DateTimeUtil.isValidDateString(customTo)) {
      const [y1, m1, d1] = customFrom.split('-').map(Number);
      const [y2, m2, d2] = customTo.split('-').map(Number);
      const startDate = new Date(Date.UTC(y1, m1 - 1, d1, 0, 0, 0, 0));
      const endDate = new Date(Date.UTC(y2, m2 - 1, d2, 23, 59, 59, 999));
      return {
        startDate,
        endDate,
        startStr: customFrom,
        endStr: customTo,
        period: 'CUSTOM',
      };
    }

    return {
      startDate: null,
      endDate: null,
      startStr: null,
      endStr: null,
      period: 'ALL_TIME',
    };
  }

  /**
   * Parse HH:mm:ss or HH:mm to minutes from midnight
   */
  public static timeToMinutes(timeStr: string): number {
    if (!timeStr) return 9 * 60;
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  /**
   * Parse HH:mm:ss or HH:mm string into seconds from midnight
   */
  public static timeToSeconds(timeStr: string): number {
    if (!timeStr) return 9 * 3600; // default 09:00:00 (32400 seconds)
    const parts = timeStr.split(':').map((p) => parseInt(p, 10) || 0);
    const h = parts[0] || 0;
    const m = parts[1] || 0;
    const s = parts[2] || 0;
    return h * 3600 + m * 60 + s;
  }

  /**
   * Returns the time of day in seconds from midnight for a given Date in the specified timezone
   */
  public static getTimeInSeconds(date: Date, timeZone: string = config.appTimezone): number {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
    const second = parseInt(parts.find((p) => p.type === 'second')?.value || '0', 10);
    return (hour % 24) * 3600 + minute * 60 + second;
  }

  /**
   * Authoritative calculation of attendance status (PRESENT vs LATE).
   * Compares actual check-in time against the work schedule's start time + grace period.
   * If actualCheckIn > lateThreshold => LATE, otherwise PRESENT.
   * Example with 09:00:00 start + 15 min grace (threshold 09:15:00):
   * 09:15:00 => PRESENT
   * 09:15:01 => LATE
   */
  public static calculateAttendanceStatus(
    checkInAt: Date,
    workSchedule?: { workStartTime?: string | null } | null,
    graceMinutes: number = 15,
    timeZone: string = config.appTimezone
  ): AttendanceStatus {
    const startTimeStr = workSchedule?.workStartTime || '09:00:00';
    const scheduleStartSeconds = DateTimeUtil.timeToSeconds(startTimeStr);
    const lateThresholdSeconds = scheduleStartSeconds + graceMinutes * 60;
    const checkInSeconds = DateTimeUtil.getTimeInSeconds(checkInAt, timeZone);

    return checkInSeconds > lateThresholdSeconds ? 'LATE' : 'PRESENT';
  }
}
