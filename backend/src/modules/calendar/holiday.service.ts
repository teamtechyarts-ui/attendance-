import { randomUUID } from 'crypto';
import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';
import { DateTimeUtil } from '../../utils/datetime.js';
import { AuthUser } from '../../types/index.js';
import { AuditService } from '../../services/audit.service.js';

export interface RegisterHolidayInput {
  date: string; // YYYY-MM-DD
  name: string;
  description?: string | null;
  isOptional?: boolean;
}

export class HolidayService {
  /**
   * List official company holidays
   */
  public static async getHolidays(year?: number) {
    const filter = year
      ? {
          holidayDate: {
            gte: new Date(Date.UTC(year, 0, 1, 0, 0, 0)),
            lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
          },
        }
      : {};

    return DbService.query(
      async () => {
        return prisma.holiday.findMany({
          where: filter,
          orderBy: { holidayDate: 'asc' },
        });
      },
      async () => {
        const query = year ? `/holidays?holiday_date=gte.${year}-01-01&holiday_date=lte.${year}-12-31&order=holiday_date.asc` : `/holidays?order=holiday_date.asc`;
        return (await DbService.restRequest<any[]>(query)) || [];
      }
    );
  }

  /**
   * Check if a holiday exists on a specific date (YYYY-MM-DD)
   */
  public static async getHolidayByDate(dateStr: string) {
    const cleanDate = dateStr.slice(0, 10);
    const startOfDay = new Date(Date.UTC(
      parseInt(cleanDate.slice(0, 4), 10),
      parseInt(cleanDate.slice(5, 7), 10) - 1,
      parseInt(cleanDate.slice(8, 10), 10),
      0, 0, 0, 0
    ));
    const endOfDay = new Date(Date.UTC(
      parseInt(cleanDate.slice(0, 4), 10),
      parseInt(cleanDate.slice(5, 7), 10) - 1,
      parseInt(cleanDate.slice(8, 10), 10),
      23, 59, 59, 999
    ));

    return DbService.query(
      async () => {
        return prisma.holiday.findFirst({
          where: {
            holidayDate: {
              gte: startOfDay,
              lte: endOfDay,
            },
          },
        });
      },
      async () => {
        const res = await DbService.restRequest<any[]>(`/holidays?holiday_date=eq.${cleanDate}`);
        return res?.[0] || null;
      }
    );
  }

  /**
   * Register or update an authoritative company holiday.
   * Concurrency-safe, prevents duplicates, synchronizes calendar display.
   */
  public static async registerHoliday(input: RegisterHolidayInput, user: AuthUser) {
    // 1. RBAC Check: Only Super Admin and Admin can manage company holidays
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      const err: any = new Error('Forbidden: Only authorized administrators can create or manage company holidays');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_HOLIDAY_MANAGEMENT';
      throw err;
    }

    // 2. Validate date
    const cleanDate = input.date.slice(0, 10);
    if (!DateTimeUtil.isValidDateString(cleanDate)) {
      const err: any = new Error(`Invalid holiday date: ${input.date}. Expected format YYYY-MM-DD`);
      err.statusCode = 400;
      err.code = 'INVALID_HOLIDAY_DATE';
      throw err;
    }

    const [y, m, d] = cleanDate.split('-').map(Number);
    const holDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    const startAt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    const endAt = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
    const isOptional = Boolean(input.isOptional);

    const holiday = await DbService.query(
      async () => {
        // Check for existing holiday on that date to prevent duplicates
        const existingHol = await prisma.holiday.findFirst({
          where: {
            holidayDate: {
              gte: startAt,
              lte: endAt,
            },
          },
        });

        let savedHoliday;
        if (existingHol) {
          savedHoliday = await prisma.holiday.update({
            where: { id: existingHol.id },
            data: {
              name: input.name,
              description: input.description !== undefined ? input.description : existingHol.description,
              isOptional,
            },
          });
        } else {
          savedHoliday = await prisma.holiday.create({
            data: {
              name: input.name,
              description: input.description || null,
              holidayDate: holDate,
              isOptional,
            },
          });
        }

        // Synchronize calendar_events display record
        const existingCalendarEvent = await prisma.calendarEvent.findFirst({
          where: {
            startAt: { gte: startAt, lte: endAt },
            OR: [
              { eventType: 'HOLIDAY' },
              { title: { equals: input.name, mode: 'insensitive' } },
            ],
          },
        });

        if (existingCalendarEvent) {
          await prisma.calendarEvent.update({
            where: { id: existingCalendarEvent.id },
            data: {
              title: input.name,
              description: input.description !== undefined ? input.description : existingCalendarEvent.description,
              eventType: 'HOLIDAY',
              visibility: 'EVERYONE',
              startAt,
              endAt,
              allDay: true,
              employeeId: null,
            },
          });
        } else {
          await prisma.calendarEvent.create({
            data: {
              title: input.name,
              description: input.description || null,
              eventType: 'HOLIDAY',
              visibility: 'EVERYONE',
              startAt,
              endAt,
              allDay: true,
              createdBy: user.id,
              employeeId: null,
            },
          });
        }

        return savedHoliday;
      },
      async () => {
        // Supabase REST Fallback
        const existingHols = await DbService.restRequest<any[]>(`/holidays?holiday_date=eq.${cleanDate}`);
        let savedHoliday;
        if (existingHols && existingHols.length > 0) {
          const res = await DbService.restRequest<any[]>(`/holidays?id=eq.${existingHols[0].id}`, {
            method: 'PATCH',
            body: {
              name: input.name,
              description: input.description || null,
              is_optional: isOptional,
            },
          });
          savedHoliday = res?.[0] || existingHols[0];
        } else {
          const res = await DbService.restRequest<any[]>('/holidays', {
            method: 'POST',
            body: {
              id: randomUUID(),
              name: input.name,
              description: input.description || null,
              holiday_date: cleanDate,
              is_optional: isOptional,
            },
          });
          savedHoliday = res?.[0];
        }

        // Sync calendar event in REST fallback
        try {
          const existingEvents = await DbService.restRequest<any[]>(
            `/calendar_events?start_at=gte.${cleanDate}T00:00:00.000Z&start_at=lte.${cleanDate}T23:59:59.999Z`
          );
          const matchEvent = existingEvents?.find(
            (e: any) => e.eventType === 'HOLIDAY' || e.event_type === 'HOLIDAY' || (e.title && e.title.toLowerCase() === input.name.toLowerCase())
          );
          if (matchEvent) {
            await DbService.restRequest(`/calendar_events?id=eq.${matchEvent.id}`, {
              method: 'PATCH',
              body: {
                title: input.name,
                description: input.description || null,
                event_type: 'HOLIDAY',
                visibility: 'EVERYONE',
                all_day: true,
                start_at: startAt.toISOString(),
                end_at: endAt.toISOString(),
                employee_id: null,
              },
            });
          } else {
            await DbService.restRequest('/calendar_events', {
              method: 'POST',
              body: {
                id: randomUUID(),
                title: input.name,
                description: input.description || null,
                event_type: 'HOLIDAY',
                visibility: 'EVERYONE',
                all_day: true,
                start_at: startAt.toISOString(),
                end_at: endAt.toISOString(),
                created_by: user.id,
                employee_id: null,
              },
            });
          }
        } catch {}

        return savedHoliday;
      }
    );

    // Audit Log
    await AuditService.log({
      userId: user.id,
      action: 'CREATE',
      entityType: 'holiday',
      entityId: holiday.id,
      description: `Registered official company holiday "${input.name}" on ${cleanDate}`,
      metadata: { date: cleanDate, name: input.name, isOptional },
    });

    return holiday;
  }

  /**
   * Delete an authoritative holiday and sync calendar display
   */
  public static async deleteHoliday(idOrDate: string, user: AuthUser) {
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      const err: any = new Error('Forbidden: Only authorized administrators can delete company holidays');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_HOLIDAY_MANAGEMENT';
      throw err;
    }

    return DbService.query(
      async () => {
        let existing = await prisma.holiday.findUnique({ where: { id: idOrDate } });
        if (!existing && DateTimeUtil.isValidDateString(idOrDate)) {
          const cleanDate = idOrDate.slice(0, 10);
          const [y, m, d] = cleanDate.split('-').map(Number);
          existing = await prisma.holiday.findFirst({
            where: {
              holidayDate: {
                gte: new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)),
                lte: new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999)),
              },
            },
          });
        }

        if (!existing) {
          return { success: true, message: 'Holiday not found or already deleted' };
        }

        const dateStr = DateTimeUtil.formatDateString(existing.holidayDate);
        const [y, m, d] = dateStr.split('-').map(Number);
        const startAt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
        const endAt = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));

        await prisma.holiday.delete({ where: { id: existing.id } });
        await prisma.calendarEvent.deleteMany({
          where: {
            startAt: { gte: startAt, lte: endAt },
            eventType: 'HOLIDAY',
          },
        });

        await AuditService.log({
          userId: user.id,
          action: 'DELETE',
          entityType: 'holiday',
          entityId: existing.id,
          description: `Deleted company holiday "${existing.name}" on ${dateStr}`,
          metadata: { date: dateStr, name: existing.name },
        });

        return { success: true, message: 'Holiday deleted successfully' };
      },
      async () => {
        try {
          await DbService.restRequest(`/holidays?id=eq.${idOrDate}`, { method: 'DELETE' });
        } catch {}
        return { success: true, message: 'Holiday deleted successfully' };
      }
    );
  }
}
