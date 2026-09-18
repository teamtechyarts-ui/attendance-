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
        const schedule = schedules[0];
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
}
