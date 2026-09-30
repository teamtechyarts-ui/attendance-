import { randomUUID } from 'crypto';
import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';
import { DateTimeUtil } from '../../utils/datetime.js';
import { TaskService } from '../tasks/task.service.js';
import { EmployeeService } from '../employees/employee.service.js';
import { CreateCalendarEventInput, UpdateCalendarEventInput } from '../../validation/index.js';
import { AuthUser, CalendarEvent } from '../../types/index.js';
import { NotificationService } from '../notifications/notification.service.js';

export class CalendarService {
  /**
   * Helper for stored calendar events in system_settings fallback if needed
   */
  private static async getStoredAttendees(): Promise<any[]> {
    try {
      const settings = await DbService.restRequest<any[]>('/system_settings?setting_key=eq.workos_calendar_attendees&select=*');
      if (settings && settings.length > 0 && settings[0].settingValue) {
        return (typeof settings[0].settingValue === 'string' ? JSON.parse(settings[0].settingValue) : settings[0].settingValue) || [];
      }
    } catch {}
    return [];
  }

  private static async saveStoredAttendees(attendees: any[]): Promise<void> {
    const now = new Date().toISOString();
    try {
      const existing = await DbService.restRequest<any[]>('/system_settings?setting_key=eq.workos_calendar_attendees&select=*');
      if (existing && existing.length > 0) {
        await DbService.restRequest(`/system_settings?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          body: { setting_value: attendees, updated_at: now },
        });
      } else {
        await DbService.restRequest('/system_settings', {
          method: 'POST',
          body: {
            setting_key: 'workos_calendar_attendees',
            setting_value: attendees,
            description: 'WorkOS Calendar Event Attendees',
            is_public: false,
          },
        });
      }
    } catch {}
  }

  /**
   * Get all calendar items for a given year and month (read-only derivation)
   */
  public static async getEvents(params: {
    year: number;
    month: number;
    user: AuthUser;
    employeeId?: string;
  }) {
    const { year, month, user } = params;
    const targetEmployeeId =
      user.role === 'EMPLOYEE'
        ? user.employeeId
        : params.employeeId && params.employeeId !== 'undefined' && params.employeeId !== 'null' && params.employeeId.trim() !== ''
        ? params.employeeId
        : user.employeeId;

    const { startDate, endDate, startStr, endStr } = DateTimeUtil.getMonthDateRange(year, month);

    return DbService.query(
      async () => {
        // 1. Fetch holidays
        const holidays = await prisma.holiday.findMany({
          where: {
            holidayDate: { gte: startDate, lte: endDate },
          },
          orderBy: { holidayDate: 'asc' },
        });

        // 2. Fetch calendar events visible to user / target employee
        const events = await prisma.calendarEvent.findMany({
          where: {
            startAt: { gte: startDate, lte: endDate },
            OR: [
              { visibility: 'EVERYONE' },
              { employeeId: null },
              { createdBy: user.id },
              ...(targetEmployeeId
                ? [
                    { employeeId: targetEmployeeId },
                    { attendees: { some: { employeeId: targetEmployeeId } } },
                  ]
                : []),
            ],
          },
          include: {
            creator: { select: { id: true, email: true } },
            attendees: {
              include: {
                employee: {
                  select: {
                    id: true,
                    displayName: true,
                    firstName: true,
                    lastName: true,
                    profilePhotoUrl: true,
                    email: true,
                  },
                },
              },
            },
          },
          orderBy: { startAt: 'asc' },
        });

        // 3. Fetch leaves
        const leaves = targetEmployeeId
          ? await prisma.leaveRequest.findMany({
              where: {
                employeeId: targetEmployeeId,
                status: 'APPROVED',
                startDate: { lte: endDate },
                endDate: { gte: startDate },
              },
              include: { leaveType: true },
            })
          : [];

        // 4. Fetch attendances
        const attendances = targetEmployeeId
          ? await prisma.attendance.findMany({
              where: {
                employeeId: targetEmployeeId,
                attendanceDate: { gte: startDate, lte: endDate },
              },
            })
          : [];

        // 5. Dynamically derive tasks for the assignee
        const tasks = targetEmployeeId
          ? await prisma.task.findMany({
              where: {
                employeeId: targetEmployeeId,
                status: { not: 'CANCELLED' },
                OR: [
                  { startDate: { gte: startDate, lte: endDate } },
                  { dueDate: { gte: startDate, lte: endDate } },
                ],
              },
              include: {
                project: { select: { id: true, name: true, status: true } },
                timers: { orderBy: { startedAt: 'desc' } },
              },
              orderBy: [{ startDate: 'asc' }, { dueDate: 'asc' }],
            })
          : [];

        const now = new Date();
        const formattedTasks = tasks.map((t) => {
          const activeTimer = t.timers.find((tm) => tm.isActive) || null;
          return {
            ...t,
            startDate: t.startDate ? t.startDate.toISOString().split('T')[0] : null,
            dueDate: t.dueDate ? t.dueDate.toISOString().split('T')[0] : null,
            completedAt: t.completedAt ? t.completedAt.toISOString() : null,
            createdAt: t.createdAt.toISOString(),
            updatedAt: t.updatedAt.toISOString(),
            activeTimer,
          };
        });

        return {
          holidays,
          events: events.map((e) => ({
            id: e.id,
            title: e.title,
            description: e.description,
            eventType: e.eventType,
            visibility: e.visibility,
            startAt: e.startAt.toISOString(),
            endAt: e.endAt.toISOString(),
            allDay: e.allDay,
            createdBy: e.createdBy,
            employeeId: e.employeeId,
            googleCalendarEventId: e.googleCalendarEventId,
            createdAt: e.createdAt.toISOString(),
            updatedAt: e.updatedAt.toISOString(),
            attendees: e.attendees.map((a) => ({
              id: a.id,
              eventId: a.eventId,
              employeeId: a.employeeId,
              createdAt: a.createdAt.toISOString(),
              employee: a.employee,
            })),
          })),
          leaves,
          attendances,
          tasks: formattedTasks,
        };
      },
      async () => {
        // --- Supabase REST Fallback Engine ---
        let holidays: any[] = [];
        try {
          holidays = await DbService.restRequest<any[]>(
            `/holidays?holiday_date=gte.${startStr}&holiday_date=lte.${endStr}&order=holiday_date.asc`
          );
        } catch {}

        let rawEvents: any[] = [];
        try {
          rawEvents = await DbService.restRequest<any[]>('/calendar_events?select=*');
        } catch {}

        const storedAttendees = await CalendarService.getStoredAttendees();
        let employees: any[] = [];
        try {
          employees = await DbService.restRequest<any[]>('/employees?select=id,display_name,first_name,last_name,email,profile_photo_url');
        } catch {}
        const empById = new Map<string, any>();
        for (const emp of employees || []) {
          empById.set(emp.id, {
            id: emp.id,
            displayName: emp.displayName || emp.display_name,
            firstName: emp.firstName || emp.first_name,
            lastName: emp.lastName || emp.last_name,
            email: emp.email,
            profilePhotoUrl: emp.profilePhotoUrl || emp.profile_photo_url,
          });
        }

        const events = (rawEvents || [])
          .filter((e) => {
            const rawStart = e.startAt || e.start_at;
            const evStart = rawStart ? new Date(rawStart) : null;
            if (!evStart || evStart < startDate || evStart > endDate) return false;

            // Admin / Super Admin can see all organization events
            if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return true;

            const isCompanyWide = e.visibility === 'EVERYONE' || !e.employee_id && !e.employeeId;
            if (isCompanyWide) return true;

            const createdBy = e.createdBy || e.created_by;
            if (createdBy === user.id) return true;

            const eventEmpId = e.employeeId || e.employee_id;
            if (targetEmployeeId && eventEmpId === targetEmployeeId) return true;
            if (targetEmployeeId && storedAttendees.some((a) => a.eventId === e.id && a.employeeId === targetEmployeeId)) return true;

            return false;
          })
          .map((e) => {
            const eventAttendees = storedAttendees
              .filter((a) => a.eventId === e.id)
              .map((a) => ({
                id: a.id,
                eventId: a.eventId,
                employeeId: a.employeeId,
                createdAt: a.createdAt,
                employee: empById.get(a.employeeId) || null,
              }));

            const startAt = e.startAt || e.start_at;
            const endAt = e.endAt || e.end_at;
            const eventEmpId = e.employeeId || e.employee_id || null;
            const visibility = e.visibility || (!eventEmpId ? 'EVERYONE' : 'SPECIFIC');

            return {
              id: e.id,
              title: e.title,
              description: e.description || null,
              eventType: e.eventType || e.event_type || 'OTHER',
              visibility,
              startAt: typeof startAt === 'string' ? startAt : new Date(startAt).toISOString(),
              endAt: typeof endAt === 'string' ? endAt : new Date(endAt).toISOString(),
              allDay: e.allDay ?? e.all_day ?? false,
              createdBy: e.createdBy || e.created_by,
              employeeId: eventEmpId,
              googleCalendarEventId: e.googleCalendarEventId || e.google_calendar_event_id || null,
              createdAt: e.createdAt || e.created_at,
              updatedAt: e.updatedAt || e.updated_at,
              attendees: eventAttendees,
            };
          });

        let leaves: any[] = [];
        if (targetEmployeeId) {
          try {
            leaves = await DbService.restRequest<any[]>(
              `/leave_requests?employee_id=eq.${targetEmployeeId}&status=eq.APPROVED&start_date=lte.${endStr}&end_date=gte.${startStr}&select=*,leave_type:leave_types(*)`
            );
          } catch {}
        }

        let attendances: any[] = [];
        if (targetEmployeeId) {
          try {
            attendances = await DbService.restRequest<any[]>(
              `/attendance?employee_id=eq.${targetEmployeeId}&attendance_date=gte.${startStr}&attendance_date=lte.${endStr}`
            );
          } catch {}
        }

        // Dynamically derive tasks
        let tasks: any[] = [];
        if (targetEmployeeId) {
          try {
            const taskRes = await TaskService.listTasks({
              employeeId: targetEmployeeId,
              user: { ...user, role: 'SUPER_ADMIN' },
              limit: 500,
            });
            tasks = (taskRes.items || []).filter((t: any) => {
              if (t.status === 'CANCELLED') return false;
              const hasStart = t.startDate && t.startDate >= startStr && t.startDate <= endStr;
              const hasDue = t.dueDate && t.dueDate >= startStr && t.dueDate <= endStr;
              return hasStart || hasDue;
            });
          } catch {}
        }

        return {
          holidays,
          events,
          leaves,
          attendances,
          tasks,
        };
      }
    );
  }

  /**
   * Create Calendar Event
   */
  public static async createEvent(input: CreateCalendarEventInput, user: AuthUser) {
    const isStaff = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'MANAGER';
    const visibility = input.visibility || (input.attendeeIds && input.attendeeIds.length > 0 ? 'SPECIFIC' : isStaff && !input.employeeId ? 'EVERYONE' : 'SPECIFIC');

    // Validate target employee is active
    if (input.employeeId) {
      const { exists, isEligible } = await EmployeeService.getEmployeeEligibility(input.employeeId);
      if (!exists || !isEligible) {
        const err: any = new Error('Cannot assign calendar event to a deactivated employee.');
        err.statusCode = 400;
        err.code = 'EMPLOYEE_NOT_ACTIVE';
        throw err;
      }
    }

    // Validate attendees are active
    if (input.attendeeIds && Array.isArray(input.attendeeIds)) {
      for (const attId of input.attendeeIds) {
        const { exists, isEligible } = await EmployeeService.getEmployeeEligibility(attId);
        if (!exists || !isEligible) {
          const err: any = new Error('Cannot add deactivated employees to calendar events.');
          err.statusCode = 400;
          err.code = 'EMPLOYEE_NOT_ACTIVE';
          throw err;
        }
      }
    }

    const created = await DbService.query(
      async () => {
        const event = await prisma.calendarEvent.create({
          data: {
            title: input.title,
            description: input.description || null,
            eventType: input.eventType || 'OTHER',
            visibility,
            startAt: new Date(input.startAt),
            endAt: new Date(input.endAt),
            allDay: input.allDay || false,
            createdBy: user.id,
            employeeId: input.employeeId || (input.attendeeIds && input.attendeeIds.length === 1 ? input.attendeeIds[0] : null),
          },
        });

        // If specific attendees provided, add them to calendar_event_attendees
        if (visibility === 'SPECIFIC' && input.attendeeIds && Array.isArray(input.attendeeIds)) {
          for (const empId of input.attendeeIds) {
            try {
              await prisma.calendarEventAttendee.create({
                data: {
                  eventId: event.id,
                  employeeId: empId,
                },
              });
            } catch (e) {
              // Ignore duplicates
            }
          }
        }

        const created = await prisma.calendarEvent.findUnique({
          where: { id: event.id },
          include: {
            attendees: {
              include: {
                employee: {
                  select: { id: true, displayName: true, firstName: true, lastName: true, profilePhotoUrl: true },
                },
              },
            },
          },
        });

        return created;
      },
      async () => {
        const eventId = randomUUID();
        const now = new Date().toISOString();

        let events: any[];
        try {
          events = await DbService.restRequest<any[]>('/calendar_events', {
            method: 'POST',
            body: {
              id: eventId,
              title: input.title,
              description: input.description || null,
              event_type: input.eventType || 'OTHER',
              visibility,
              start_at: input.startAt,
              end_at: input.endAt,
              all_day: input.allDay || false,
              created_by: user.id,
              employee_id: input.employeeId || (input.attendeeIds && input.attendeeIds.length === 1 ? input.attendeeIds[0] : null),
            },
          });
        } catch {
          // If visibility column not present
          events = await DbService.restRequest<any[]>('/calendar_events', {
            method: 'POST',
            body: {
              id: eventId,
              title: input.title,
              description: input.description || null,
              event_type: input.eventType || 'OTHER',
              start_at: input.startAt,
              end_at: input.endAt,
              all_day: input.allDay || false,
              created_by: user.id,
              employee_id: input.employeeId || (input.attendeeIds && input.attendeeIds.length === 1 ? input.attendeeIds[0] : null),
            },
          });
        }

        const createdEvent = events[0] || {
          id: eventId,
          title: input.title,
          description: input.description || null,
          eventType: input.eventType || 'OTHER',
          visibility,
          startAt: input.startAt,
          endAt: input.endAt,
          allDay: input.allDay || false,
          createdBy: user.id,
          employeeId: input.employeeId || null,
          createdAt: now,
          updatedAt: now,
        };

        if (visibility === 'SPECIFIC' && input.attendeeIds && Array.isArray(input.attendeeIds)) {
          const storedAttendees = await CalendarService.getStoredAttendees();
          for (const empId of input.attendeeIds) {
            storedAttendees.push({
              id: randomUUID(),
              eventId: createdEvent.id,
              employeeId: empId,
              createdAt: now,
            });
          }
          await CalendarService.saveStoredAttendees(storedAttendees);
        }

        return {
          ...createdEvent,
          visibility,
          attendees: (input.attendeeIds || []).map((empId) => ({
            id: randomUUID(),
            eventId: createdEvent.id,
            employeeId: empId,
            createdAt: now,
          })),
        };
      }
    );

    // AFTER SUCCESSFUL DB SAVE: Notify attendees or company-wide
    (async () => {
      try {
        if (visibility === 'EVERYONE') {
          const activeEmps = await DbService.query(
            async () =>
              prisma.employee.findMany({
                where: { employmentStatus: 'ACTIVE', user: { status: 'ACTIVE' } },
                select: { id: true, userId: true },
              }),
            async () =>
              DbService.restRequest<any[]>('/employees?employment_status=eq.ACTIVE&select=id,user_id')
          );
          const empIds = (activeEmps || []).map((e: any) => e.id).filter(Boolean);
          const userMaps = await NotificationService.resolveUserIdsFromEmployeeIds(empIds);
          const notifications = userMaps
            .filter((u) => u.userId && u.userId !== user.id)
            .map((u) => ({
              userId: u.userId,
              type: 'CALENDAR_EVENT_CREATED' as const,
              title: `New Calendar Event: ${input.title}`,
              message: `A new company event "${input.title}" has been scheduled for ${new Date(input.startAt).toLocaleDateString()}.`,
              actionUrl: `/calendar`,
              entityType: 'calendar_event',
              entityId: created.id,
              actorId: user.id,
            }));
          await NotificationService.createBulkNotifications(notifications);
        } else {
          const targetEmpIds = [
            ...(input.employeeId ? [input.employeeId] : []),
            ...(input.attendeeIds || []),
          ];
          if (targetEmpIds.length > 0) {
            const userMaps = await NotificationService.resolveUserIdsFromEmployeeIds(targetEmpIds);
            const notifications = userMaps
              .filter((u) => u.userId && u.userId !== user.id)
              .map((u) => ({
                userId: u.userId,
                type: 'CALENDAR_EVENT_CREATED' as const,
                title: `Calendar Event: ${input.title}`,
                message: `You have an event "${input.title}" on ${new Date(input.startAt).toLocaleDateString()}.`,
                actionUrl: `/calendar`,
                entityType: 'calendar_event',
                entityId: created.id,
                actorId: user.id,
              }));
            await NotificationService.createBulkNotifications(notifications);
          }
        }
      } catch (err: any) {
        console.error('[CalendarService] Failed to notify of calendar event creation:', err.message);
      }
    })();

    return created;
  }

  /**
   * Update Calendar Event
   */
  public static async updateEvent(id: string, input: UpdateCalendarEventInput, user: AuthUser) {
    const updated = await DbService.query(
      async () => {
        const existing = await prisma.calendarEvent.findUnique({
          where: { id },
          include: { attendees: true },
        });

        if (!existing) {
          const err: any = new Error('Calendar event not found');
          err.statusCode = 404;
          throw err;
        }

        const isStaff = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'MANAGER';
        if (!isStaff && existing.createdBy !== user.id) {
          const err: any = new Error('Forbidden: Only event creator or admins can edit this event');
          err.statusCode = 403;
          throw err;
        }

        await prisma.calendarEvent.update({
          where: { id },
          data: {
            title: input.title !== undefined ? input.title : undefined,
            description: input.description !== undefined ? input.description : undefined,
            eventType: input.eventType !== undefined ? input.eventType : undefined,
            visibility: input.visibility !== undefined ? input.visibility : undefined,
            startAt: input.startAt !== undefined ? new Date(input.startAt) : undefined,
            endAt: input.endAt !== undefined ? new Date(input.endAt) : undefined,
            allDay: input.allDay !== undefined ? input.allDay : undefined,
            employeeId: input.employeeId !== undefined ? input.employeeId : undefined,
          },
        });

        if (input.attendeeIds && Array.isArray(input.attendeeIds)) {
          // Remove old attendees and insert new
          await prisma.calendarEventAttendee.deleteMany({ where: { eventId: id } });
          for (const empId of input.attendeeIds) {
            try {
              await prisma.calendarEventAttendee.create({
                data: {
                  eventId: id,
                  employeeId: empId,
                },
              });
            } catch (e) {
              // Ignore duplicate
            }
          }
        }

        return await prisma.calendarEvent.findUnique({
          where: { id },
          include: {
            attendees: {
              include: {
                employee: {
                  select: { id: true, displayName: true, firstName: true, lastName: true, profilePhotoUrl: true },
                },
              },
            },
          },
        });
      },
      async () => {
        const res = await DbService.restRequest<any[]>(`/calendar_events?id=eq.${id}`, {
          method: 'PATCH',
          body: input,
        });
        return res[0];
      }
    );

    // AFTER SUCCESSFUL DB UPDATE: Notify attendees
    (async () => {
      try {
        const attendeeEmpIds = input.attendeeIds || (updated?.attendees ? updated.attendees.map((a: { employeeId: string }) => a.employeeId) : []);
        const targetEmpIds = [
          ...(input.employeeId ? [input.employeeId] : (updated?.employeeId ? [updated.employeeId] : [])),
          ...attendeeEmpIds,
        ];
        if (targetEmpIds.length > 0) {
          const userMaps = await NotificationService.resolveUserIdsFromEmployeeIds(targetEmpIds);
          const notifications = userMaps
            .filter((u) => u.userId && u.userId !== user.id)
            .map((u) => ({
              userId: u.userId,
              type: 'CALENDAR_EVENT_UPDATED' as const,
              title: `Calendar Event Updated: ${input.title || updated?.title || 'Event'}`,
              message: `The event "${input.title || updated?.title || 'Event'}" has been updated.`,
              actionUrl: `/calendar`,
              entityType: 'calendar_event',
              entityId: id,
              actorId: user.id,
            }));
          await NotificationService.createBulkNotifications(notifications);
        }
      } catch (err: any) {
        console.error('[CalendarService] Failed to notify of calendar event update:', err.message);
      }
    })();

    return updated;
  }

  /**
   * Delete Calendar Event
   */
  public static async deleteEvent(id: string, user: AuthUser) {
    let existingTitle = 'Event';
    let targetEmpIds: string[] = [];

    try {
      const existing = await DbService.query(
        async () => prisma.calendarEvent.findUnique({ where: { id }, include: { attendees: true } }),
        async () => {
          const evs = await DbService.restRequest<any[]>(`/calendar_events?id=eq.${id}`);
          return evs?.[0] || null;
        }
      );
      if (existing) {
        existingTitle = existing.title || 'Event';
        const attIds = existing.attendees ? existing.attendees.map((a: any) => a.employeeId) : [];
        targetEmpIds = [...(existing.employeeId ? [existing.employeeId] : []), ...attIds];
      }
    } catch {}

    await DbService.query(
      async () => {
        const existing = await prisma.calendarEvent.findUnique({
          where: { id },
          include: { attendees: true },
        });

        if (!existing) {
          const err: any = new Error('Calendar event not found');
          err.statusCode = 404;
          throw err;
        }

        const isStaff = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'MANAGER';
        if (!isStaff && existing.createdBy !== user.id) {
          const err: any = new Error('Forbidden: Only event creator or admins can delete this event');
          err.statusCode = 403;
          throw err;
        }

        await prisma.calendarEvent.delete({ where: { id } });
        return { success: true, message: 'Calendar event deleted successfully' };
      },
      async () => {
        await DbService.restRequest(`/calendar_events?id=eq.${id}`, {
          method: 'DELETE',
        });
        return { success: true, message: 'Calendar event deleted successfully' };
      }
    );

    // AFTER SUCCESSFUL DB DELETION: Notify attendees of cancellation
    if (targetEmpIds.length > 0) {
      (async () => {
        try {
          const userMaps = await NotificationService.resolveUserIdsFromEmployeeIds(targetEmpIds);
          const notifications = userMaps
            .filter((u) => u.userId && u.userId !== user.id)
            .map((u) => ({
              userId: u.userId,
              type: 'CALENDAR_EVENT_CANCELLED' as const,
              title: `Calendar Event Cancelled: ${existingTitle}`,
              message: `The event "${existingTitle}" has been cancelled.`,
              actionUrl: `/calendar`,
              entityType: 'calendar_event',
              entityId: id,
              actorId: user.id,
            }));
          await NotificationService.createBulkNotifications(notifications);
        } catch (err: any) {
          console.error('[CalendarService] Failed to notify of calendar event cancellation:', err.message);
        }
      })();
    }

    return { success: true, message: 'Calendar event deleted successfully' };
  }
}
