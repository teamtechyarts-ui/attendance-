import { DateTimeUtil } from '../utils/datetime.js';
import { DbService } from './db.service.js';
import { prisma } from '../plugins/prisma.js';
import { WorkSchedule } from '../types/index.js';

export interface WorkdayEvaluation {
  isWorkingDay: boolean;
  isHoliday: boolean;
  isWeekend: boolean;
  holidayName?: string | null;
  schedule?: WorkSchedule | null;
}

export class WorkdayService {
  /**
   * Evaluate a single date for an employee
   */
  public static async evaluateDayForEmployee(
    employeeId: string,
    dateString: string = DateTimeUtil.getTodayDateString()
  ): Promise<WorkdayEvaluation> {
    return DbService.query(
      async () => {
        // 1. Check if date is a holiday
        const dateObj = new Date(dateString);
        const holiday = await prisma.holiday.findFirst({
          where: { holidayDate: dateObj },
        });

        if (holiday) {
          return {
            isWorkingDay: false,
            isHoliday: true,
            isWeekend: false,
            holidayName: holiday.name,
          };
        }

        // 2. Check employee specific schedule
        const empSchedule = await prisma.employeeWorkSchedule.findFirst({
          where: {
            employeeId,
            effectiveFrom: { lte: dateObj },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: dateObj } },
            ],
          },
          include: { schedule: true },
          orderBy: { effectiveFrom: 'desc' },
        });

        let schedule = empSchedule?.schedule;

        // 3. If no employee-specific schedule, get default schedule
        if (!schedule) {
          const defaultSched = await prisma.workSchedule.findFirst({
            where: { isDefault: true },
          });
          schedule = defaultSched || undefined;
        }

        if (!schedule) {
          // Fallback Mon-Fri
          const dayOfWeek = DateTimeUtil.getDayOfWeek(dateString);
          const isWeekend = dayOfWeek === 'saturday' || dayOfWeek === 'sunday';
          return {
            isWorkingDay: !isWeekend,
            isHoliday: false,
            isWeekend,
          };
        }

        const dayOfWeek = DateTimeUtil.getDayOfWeek(dateString);
        const isWorkingDay = (schedule as any)[dayOfWeek] === true;

        return {
          isWorkingDay,
          isHoliday: false,
          isWeekend: !isWorkingDay,
          schedule: schedule as unknown as WorkSchedule,
        };
      },
      async () => {
        // REST Fallback
        const holidays = await DbService.restRequest<any[]>(`/holidays?holiday_date=eq.${dateString}`);
        if (holidays && holidays.length > 0) {
          return {
            isWorkingDay: false,
            isHoliday: true,
            isWeekend: false,
            holidayName: holidays[0].name,
          };
        }

        const schedules = await DbService.restRequest<any[]>(`/work_schedules?is_default=eq.true`);
        const schedule = schedules?.[0];
        const dayOfWeek = DateTimeUtil.getDayOfWeek(dateString);
        const isWorkingDay = schedule ? schedule[dayOfWeek] === true : (dayOfWeek !== 'saturday' && dayOfWeek !== 'sunday');

        return {
          isWorkingDay,
          isHoliday: false,
          isWeekend: !isWorkingDay,
          schedule,
        };
      }
    );
  }

  /**
   * Batch evaluate all days in a date range for one or multiple employees.
   * Loads all holidays and schedules in one query for maximum performance (<10ms).
   */
  public static async evaluateDateRange(
    employeeIds: string[],
    startDateStr: string,
    endDateStr: string
  ): Promise<Map<string, Map<string, WorkdayEvaluation>>> {
    const startObj = new Date(startDateStr);
    const endObj = new Date(endDateStr);

    return DbService.query(
      async () => {
        const [holidays, defaultSchedule, empSchedules] = await Promise.all([
          prisma.holiday.findMany({
            where: { holidayDate: { gte: startObj, lte: endObj } },
          }),
          prisma.workSchedule.findFirst({ where: { isDefault: true } }),
          prisma.employeeWorkSchedule.findMany({
            where: {
              employeeId: { in: employeeIds },
              effectiveFrom: { lte: endObj },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: startObj } }],
            },
            include: { schedule: true },
            orderBy: { effectiveFrom: 'desc' },
          }),
        ]);

        const holidayMap = new Map<string, string>();
        for (const h of holidays) {
          const dStr = DateTimeUtil.formatDateString(new Date(h.holidayDate));
          holidayMap.set(dStr, h.name);
        }

        const empScheduleMap = new Map<string, any>();
        for (const es of empSchedules) {
          if (!empScheduleMap.has(es.employeeId)) {
            empScheduleMap.set(es.employeeId, es.schedule);
          }
        }

        const resultMap = new Map<string, Map<string, WorkdayEvaluation>>();

        for (const empId of employeeIds) {
          const dayMap = new Map<string, WorkdayEvaluation>();
          const schedule = empScheduleMap.get(empId) || defaultSchedule;

          let current = new Date(startObj);
          while (current <= endObj) {
            const dateStr = DateTimeUtil.formatDateString(current);
            const holidayName = holidayMap.get(dateStr);

            if (holidayName) {
              dayMap.set(dateStr, {
                isWorkingDay: false,
                isHoliday: true,
                isWeekend: false,
                holidayName,
                schedule: schedule as unknown as WorkSchedule,
              });
            } else if (schedule) {
              const dayOfWeek = DateTimeUtil.getDayOfWeek(dateStr);
              const isWorkingDay = (schedule as any)[dayOfWeek] === true;
              dayMap.set(dateStr, {
                isWorkingDay,
                isHoliday: false,
                isWeekend: !isWorkingDay,
                schedule: schedule as unknown as WorkSchedule,
              });
            } else {
              const dayOfWeek = DateTimeUtil.getDayOfWeek(dateStr);
              const isWeekend = dayOfWeek === 'saturday' || dayOfWeek === 'sunday';
              dayMap.set(dateStr, {
                isWorkingDay: !isWeekend,
                isHoliday: false,
                isWeekend,
              });
            }

            current = new Date(current.getTime() + 86400000);
          }

          resultMap.set(empId, dayMap);
        }

        return resultMap;
      },
      async () => {
        const [holidays, schedules] = await Promise.all([
          DbService.restRequest<any[]>(`/holidays?holiday_date=gte.${startDateStr}&holiday_date=lte.${endDateStr}`),
          DbService.restRequest<any[]>(`/work_schedules?is_default=eq.true`),
        ]);

        const defaultSchedule = schedules?.[0];
        const holidayMap = new Map<string, string>();
        for (const h of holidays || []) {
          const dStr = typeof h.holiday_date === 'string' ? h.holiday_date.slice(0, 10) : DateTimeUtil.formatDateString(new Date(h.holiday_date));
          holidayMap.set(dStr, h.name);
        }

        const resultMap = new Map<string, Map<string, WorkdayEvaluation>>();

        for (const empId of employeeIds) {
          const dayMap = new Map<string, WorkdayEvaluation>();
          let current = new Date(startObj);
          while (current <= endObj) {
            const dateStr = DateTimeUtil.formatDateString(current);
            const holidayName = holidayMap.get(dateStr);

            if (holidayName) {
              dayMap.set(dateStr, {
                isWorkingDay: false,
                isHoliday: true,
                isWeekend: false,
                holidayName,
                schedule: defaultSchedule,
              });
            } else if (defaultSchedule) {
              const dayOfWeek = DateTimeUtil.getDayOfWeek(dateStr);
              const isWorkingDay = defaultSchedule[dayOfWeek] === true;
              dayMap.set(dateStr, {
                isWorkingDay,
                isHoliday: false,
                isWeekend: !isWorkingDay,
                schedule: defaultSchedule,
              });
            } else {
              const dayOfWeek = DateTimeUtil.getDayOfWeek(dateStr);
              const isWeekend = dayOfWeek === 'saturday' || dayOfWeek === 'sunday';
              dayMap.set(dateStr, {
                isWorkingDay: !isWeekend,
                isHoliday: false,
                isWeekend,
              });
            }
            current = new Date(current.getTime() + 86400000);
          }
          resultMap.set(empId, dayMap);
        }

        return resultMap;
      }
    );
  }

  /**
   * Calculate actual leave working days for a multi-day leave request,
   * excluding non-working scheduled days and company holidays.
   */
  public static async calculateLeaveWorkingDays(
    employeeId: string,
    startDateStr: string,
    endDateStr: string,
    isHalfDay: boolean = false
  ): Promise<{ totalDays: number; workingDates: string[]; excludedDates: string[] }> {
    const evaluations = await WorkdayService.evaluateDateRange([employeeId], startDateStr, endDateStr);
    const empDays = evaluations.get(employeeId) || new Map<string, WorkdayEvaluation>();

    const workingDates: string[] = [];
    const excludedDates: string[] = [];

    for (const [dateStr, evalResult] of empDays.entries()) {
      if (evalResult.isWorkingDay) {
        workingDates.push(dateStr);
      } else {
        excludedDates.push(dateStr);
      }
    }

    const dayMultiplier = isHalfDay ? 0.5 : 1.0;
    const totalDays = Math.round(workingDates.length * dayMultiplier * 10) / 10;

    return {
      totalDays,
      workingDates,
      excludedDates,
    };
  }
}

