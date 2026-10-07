import { prisma } from '../plugins/prisma.js';
import { DbService } from './db.service.js';
import { DateTimeUtil } from '../utils/datetime.js';
import { WorkdayService } from './workday.service.js';
import { AttendanceService } from '../modules/attendance/attendance.service.js';
import { EmailService } from '../modules/email/email.service.js';
import { QuoteService } from '../utils/quotes.js';

export class SchedulerService {
  private static isRunning = false;
  private static intervalTimer: NodeJS.Timeout | null = null;
  private static readonly LONG_RUNNING_TIMER_THRESHOLD_MINUTES = 120;

  /**
   * Start the internal scheduler loop (runs every 60s)
   */
  public static start(): void {
    if (this.intervalTimer) return;
    console.log('[SchedulerService] Starting central scheduler daemon (1m interval)...');
    setTimeout(() => {
      this.runSchedulerTick().catch((e) => console.error('[SchedulerService] Initial tick error:', e.message));
    }, 5000);

    this.intervalTimer = setInterval(() => {
      this.runSchedulerTick().catch((e) => console.error('[SchedulerService] Tick error:', e.message));
    }, 60000);
  }

  /**
   * Stop the scheduler loop
   */
  public static stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
      console.log('[SchedulerService] Central scheduler daemon stopped.');
    }
  }

  /**
   * Check if a specific delivery key has already been executed/sent
   */
  public static async isDelivered(key: string): Promise<boolean> {
    const settingKey = `sched_delivery_${key}`;
    return DbService.query(
      async () => {
        const found = await prisma.systemSetting.findUnique({
          where: { settingKey },
        });
        return Boolean(found);
      },
      async () => {
        const found = await DbService.restRequest<any[]>(`/system_settings?setting_key=eq.${settingKey}`);
        return Boolean(found && found.length > 0);
      }
    );
  }

  /**
   * Mark a delivery key as completed to ensure strict idempotency
   */
  public static async markDelivered(key: string, metadata?: any): Promise<void> {
    const settingKey = `sched_delivery_${key}`;
    const payload = {
      key,
      deliveredAt: new Date().toISOString(),
      metadata: metadata || null,
    };

    await DbService.query(
      async () => {
        await prisma.systemSetting.upsert({
          where: { settingKey },
          create: {
            settingKey,
            settingValue: payload,
            description: `Scheduler delivery log for ${key}`,
          },
          update: {
            settingValue: payload,
            updatedAt: new Date(),
          },
        });
      },
      async () => {
        const existing = await DbService.restRequest<any[]>(`/system_settings?setting_key=eq.${settingKey}`);
        if (existing && existing.length > 0) {
          await DbService.restRequest(`/system_settings?setting_key=eq.${settingKey}`, {
            method: 'PATCH',
            body: { setting_value: payload, updated_at: new Date().toISOString() },
          });
        } else {
          await DbService.restRequest('/system_settings', {
            method: 'POST',
            body: {
              setting_key: settingKey,
              setting_value: payload,
              description: `Scheduler delivery log for ${key}`,
            },
          });
        }
      }
    );
  }

  /**
   * Main Scheduler Tick - Runs all server-authoritative jobs
   */
  public static async runSchedulerTick(): Promise<{
    success: boolean;
    timestamp: string;
    jobs: Record<string, any>;
  }> {
    if (this.isRunning) {
      return { success: false, timestamp: new Date().toISOString(), jobs: { status: 'already_running' } };
    }

    this.isRunning = true;
    const now = new Date();
    const todayStr = DateTimeUtil.getTodayDateString();
    const results: Record<string, any> = {};

    try {
      // 1. Process Date Rollover Auto-Checkout & Auto-Stop Timers for past dates
      try {
        const rolloverResults = await AttendanceService.processDateRolloverAutoCheckout();
        results.dateRollover = { processed: rolloverResults.length };
      } catch (e: any) {
        console.error('[SchedulerService] Date rollover error:', e.message);
        results.dateRollover = { error: e.message };
      }

      // 2. Reconcile Running Timers when employee is checked out
      try {
        const reconciled = await AttendanceService.reconcileMismatchedTimers();
        results.timerReconciliation = { reconciledCount: reconciled.length };
      } catch (e: any) {
        console.error('[SchedulerService] Timer reconciliation error:', e.message);
        results.timerReconciliation = { error: e.message };
      }

      // 3. Process Attendance Reminders (Check-In, Check-Out, 8-Hour, 30-Minute Overtime Check)
      try {
        results.attendanceReminders = await this.processAttendanceReminders(now, todayStr);
      } catch (e: any) {
        console.error('[SchedulerService] Attendance reminders error:', e.message);
        results.attendanceReminders = { error: e.message };
      }

      // 4. Process Tomorrow Holiday Reminder (Evening / Day Before)
      try {
        results.tomorrowHoliday = await this.processTomorrowHolidayReminders(todayStr);
      } catch (e: any) {
        console.error('[SchedulerService] Tomorrow holiday reminders error:', e.message);
        results.tomorrowHoliday = { error: e.message };
      }

      // 5. Process Task Reminders (Deadlines 24h & 1h, Scheduled Task 10m)
      try {
        results.taskReminders = await this.processTaskReminders(now, todayStr);
      } catch (e: any) {
        console.error('[SchedulerService] Task reminders error:', e.message);
        results.taskReminders = { error: e.message };
      }

      // 6. Process Long-Running Task Timers Reminder (120m threshold)
      try {
        results.longRunningTimers = await this.processLongRunningTimerReminders(now);
      } catch (e: any) {
        console.error('[SchedulerService] Long running timer error:', e.message);
        results.longRunningTimers = { error: e.message };
      }

    } finally {
      this.isRunning = false;
    }

    return {
      success: true,
      timestamp: now.toISOString(),
      jobs: results,
    };
  }

  private static parseTimeToMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(':').map((x) => parseInt(x, 10));
    return h * 60 + (m || 0);
  }

  /**
   * Process Check-in & Check-out reminders for all active employees
   */
  private static async processAttendanceReminders(now: Date, todayStr: string) {
    const currentKolkataTimeStr = now.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const currentMinutes = this.parseTimeToMinutes(currentKolkataTimeStr);

    const [activeEmployees, todayAttendances, approvedLeaves] = await DbService.query(
      async () => Promise.all([
        prisma.employee.findMany({
          where: {
            employmentStatus: 'ACTIVE',
            user: { status: 'ACTIVE' },
          },
          include: {
            user: true,
            workSchedules: {
              where: {
                effectiveFrom: { lte: new Date(todayStr) },
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date(todayStr) } }],
              },
              include: { schedule: true },
              take: 1,
            },
          },
        }),
        prisma.attendance.findMany({
          where: { attendanceDate: new Date(todayStr) },
          include: { sessions: true },
        }),
        prisma.leaveRequest.findMany({
          where: {
            status: 'APPROVED',
            startDate: { lte: new Date(todayStr) },
            endDate: { gte: new Date(todayStr) },
          },
        }),
      ]),
      async () => {
        const [rawEmps, rawAtts, rawLeaves] = await Promise.all([
          DbService.restRequest<any[]>('/employees?employment_status=eq.ACTIVE&select=*,user:users(*),workSchedules:employee_work_schedules(*,schedule:work_schedules(*))'),
          DbService.restRequest<any[]>(`/attendance?attendance_date=eq.${todayStr}&select=*,sessions:attendance_sessions(*)`),
          DbService.restRequest<any[]>(`/leave_requests?status=eq.APPROVED&start_date=lte.${todayStr}&end_date=gte.${todayStr}`),
        ]);
        return [rawEmps || [], rawAtts || [], rawLeaves || []];
      }
    );

    const attByEmp = new Map<string, any>();
    for (const a of todayAttendances) {
      const empId = a.employeeId || a.employee_id;
      attByEmp.set(empId, a);
    }

    const leaveEmpIds = new Set(approvedLeaves.map((l: any) => l.employeeId || l.employee_id));

    let checkInSent = 0;
    let checkOutSent = 0;
    let eightHourSent = 0;
    let thirtyMinSent = 0;

    const dailyQuote = QuoteService.getDailyQuote(todayStr);

    for (const emp of activeEmployees) {
      const empId = emp.id;
      const recipientEmail = emp.user?.email || emp.email;
      if (!recipientEmail) continue;

      const employeeName = emp.displayName || emp.display_name || `${emp.firstName || emp.first_name || ''} ${emp.lastName || emp.last_name || ''}`.trim();

      // Check leave
      if (leaveEmpIds.has(empId)) continue;

      // Evaluate workday for today
      const workday = await WorkdayService.evaluateDayForEmployee(empId, todayStr);
      if (workday.isHoliday || !workday.isWorkingDay) continue;

      const att = attByEmp.get(empId);
      const checkInAt = att?.checkInAt || att?.check_in_at;
      const checkOutAt = att?.checkOutAt || att?.check_out_at;
      const isCheckedIn = Boolean(checkInAt);
      const isCheckedOut = Boolean(checkOutAt);

      const startTimeStr = workday.schedule?.workStartTime || (workday.schedule as any)?.work_start_time || '09:00:00';
      const endTimeStr = workday.schedule?.workEndTime || (workday.schedule as any)?.work_end_time || '18:00:00';

      const startMinutes = this.parseTimeToMinutes(startTimeStr);
      const endMinutes = this.parseTimeToMinutes(endTimeStr);

      // 1. Check-In Reminder (10 mins before start)
      if (!isCheckedIn) {
        const checkInTargetMinutes = startMinutes - 10;
        if (currentMinutes >= checkInTargetMinutes && currentMinutes < startMinutes + 30) {
          const idempotencyKey = `CHECKIN_REMINDER:${empId}:${todayStr}`;
          const alreadyDelivered = await this.isDelivered(idempotencyKey);
          if (!alreadyDelivered) {
            try {
              await EmailService.sendCheckInReminder(recipientEmail, {
                employeeName,
                scheduledTime: startTimeStr.slice(0, 5),
                date: todayStr,
                quote: dailyQuote.quote,
                quoteAuthor: dailyQuote.author,
              });
              await this.markDelivered(idempotencyKey, { time: currentKolkataTimeStr });
              checkInSent++;
            } catch (e: any) {
              console.error(`[SchedulerService] Failed to send check-in reminder to ${recipientEmail}:`, e.message);
            }
          }
        }
      }

      // 2. Check-Out Reminder (10 mins before scheduled end)
      if (isCheckedIn && !isCheckedOut) {
        const checkOutTargetMinutes = endMinutes - 10;
        if (currentMinutes >= checkOutTargetMinutes && currentMinutes < endMinutes + 30) {
          const idempotencyKey = `CHECKOUT_REMINDER:${empId}:${todayStr}`;
          const alreadyDelivered = await this.isDelivered(idempotencyKey);
          if (!alreadyDelivered) {
            try {
              await EmailService.sendCheckOutReminder(recipientEmail, {
                employeeName,
                scheduledCheckoutTime: endTimeStr.slice(0, 5),
                date: todayStr,
              });
              await this.markDelivered(idempotencyKey, { time: currentKolkataTimeStr });
              checkOutSent++;
            } catch (e: any) {
              console.error(`[SchedulerService] Failed to send checkout reminder to ${recipientEmail}:`, e.message);
            }
          }
        }

        // 3. 8-Hour actual worked time checkout reminder & 30-min repeated reminders
        let workedMinutes = 0;
        const sessions = att.sessions || [];
        if (sessions.length > 0) {
          for (const s of sessions) {
            const dur = s.durationMinutes ?? s.duration_minutes;
            const startAt = s.startedAt || s.started_at;
            if (dur) {
              workedMinutes += dur;
            } else if (startAt) {
              workedMinutes += Math.floor(DateTimeUtil.diffSeconds(startAt, now) / 60);
            }
          }
        } else if (checkInAt) {
          workedMinutes = Math.floor(DateTimeUtil.diffSeconds(checkInAt, now) / 60);
        }

        if (workedMinutes >= 480) {
          const eightHourKey = `EIGHT_HOUR_REMINDER:${empId}:${todayStr}`;
          const eightHourDelivered = await this.isDelivered(eightHourKey);
          if (!eightHourDelivered) {
            try {
              await EmailService.sendEightHourCheckoutReminder(recipientEmail, {
                employeeName,
                workedDuration: `${Math.floor(workedMinutes / 60)}h ${workedMinutes % 60}m`,
                date: todayStr,
              });
              await this.markDelivered(eightHourKey, { workedMinutes });
              eightHourSent++;
            } catch (e: any) {
              console.error(`[SchedulerService] 8-hour reminder error for ${recipientEmail}:`, e.message);
            }
          }

          const isOT = await AttendanceService.isOvertimeConfirmed(empId, todayStr);
          if (!isOT) {
            const intervalIndex = Math.floor((workedMinutes - 480) / 30);
            if (intervalIndex > 0) {
              const thirtyMinKey = `THIRTY_MIN_REMINDER:${empId}:${todayStr}:${intervalIndex}`;
              const thirtyMinDelivered = await this.isDelivered(thirtyMinKey);
              if (!thirtyMinDelivered) {
                try {
                  await EmailService.sendThirtyMinuteCheckoutReminder(recipientEmail, {
                    employeeName,
                    workedDuration: `${Math.floor(workedMinutes / 60)}h ${workedMinutes % 60}m`,
                  });
                  await this.markDelivered(thirtyMinKey, { workedMinutes, intervalIndex });
                  thirtyMinSent++;
                } catch (e: any) {
                  console.error(`[SchedulerService] 30m reminder error for ${recipientEmail}:`, e.message);
                }
              }
            }
          }
        }
      }
    }

    return { checkInSent, checkOutSent, eightHourSent, thirtyMinSent };
  }

  /**
   * Tomorrow Holiday Email reminder
   */
  private static async processTomorrowHolidayReminders(todayStr: string) {
    const todayDate = new Date(todayStr);
    const tomorrowDate = new Date(todayDate.getTime() + 86400000);
    const tomorrowStr = DateTimeUtil.formatDateString(tomorrowDate);

    const [holidays, activeEmployees] = await DbService.query(
      () => Promise.all([
        prisma.holiday.findMany({
          where: {
            holidayDate: {
              gte: new Date(tomorrowStr),
              lte: new Date(tomorrowStr),
            },
          },
        }),
        prisma.employee.findMany({
          where: {
            employmentStatus: 'ACTIVE',
            user: { status: 'ACTIVE' },
          },
          include: { user: true },
        }),
      ]),
      () => Promise.all([
        DbService.restRequest<any[]>(`/holidays?holiday_date=eq.${tomorrowStr}`),
        DbService.restRequest<any[]>('/employees?employment_status=eq.ACTIVE&select=*,user:users(*)'),
      ])
    );

    if (!holidays || holidays.length === 0) {
      return { isHolidayTomorrow: false };
    }

    const holiday = holidays[0];
    let sentCount = 0;

    for (const emp of activeEmployees) {
      const recipientEmail = emp.user?.email || emp.email;
      if (!recipientEmail) continue;

      const idempotencyKey = `TOMORROW_HOLIDAY:${emp.id}:${tomorrowStr}`;
      const alreadySent = await this.isDelivered(idempotencyKey);
      if (!alreadySent) {
        try {
          await EmailService.sendTomorrowHoliday(recipientEmail, {
            employeeName: emp.displayName || emp.display_name || `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
            holidayName: holiday.name,
            holidayDate: tomorrowStr,
            description: holiday.description || 'Enjoy your holiday! The office will remain closed.',
          });
          await this.markDelivered(idempotencyKey, { holidayName: holiday.name });
          sentCount++;
        } catch (e: any) {
          console.error(`[SchedulerService] Tomorrow holiday email error for ${recipientEmail}:`, e.message);
        }
      }
    }

    return { isHolidayTomorrow: true, holidayName: holiday.name, sentCount };
  }

  /**
   * Task Deadline & Scheduled Task Start reminders
   */
  private static async processTaskReminders(now: Date, _todayStr: string) {
    const activeTasks = await DbService.query(
      () => prisma.task.findMany({
        where: {
          status: { in: ['TODO', 'IN_PROGRESS', 'PAUSED'] },
          OR: [
            { dueDate: { not: null } },
            { reminderAt: { not: null } },
            { startDate: { not: null } },
          ],
        },
        include: {
          employee: { include: { user: true } },
          project: true,
        },
      }),
      () => DbService.restRequest<any[]>('/tasks?status=in.(TODO,IN_PROGRESS,PAUSED)&select=*,employee:employees(*,user:users(*))')
    );

    let deadline24hSent = 0;
    let deadline1hSent = 0;
    let scheduledTaskSent = 0;

    for (const task of activeTasks || []) {
      const emp = task.employee;
      if (!emp) continue;
      const recipientEmail = emp.user?.email || emp.email;
      if (!recipientEmail) continue;
      const empName = emp.displayName || emp.display_name || `${emp.firstName || ''} ${emp.lastName || ''}`.trim();

      const rawDueDate = task.dueDate || task.due_date;
      const dueDate = rawDueDate ? new Date(rawDueDate) : null;

      if (dueDate) {
        const diffMs = dueDate.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours > 0 && diffHours <= 24 && diffHours >= 20) {
          const key24 = `TASK_DEADLINE_24H:${task.id}:${emp.id}`;
          const delivered = await this.isDelivered(key24);
          if (!delivered) {
            try {
              await EmailService.sendTaskDeadlineReminder(recipientEmail, {
                employeeName: empName,
                taskTitle: task.title,
                projectName: task.project?.name,
                priority: task.priority,
                dueDate: dueDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
                timeRemaining: '24 hours',
                taskUrl: `/tasks?taskId=${task.id}`,
              });
              await this.markDelivered(key24);
              deadline24hSent++;
            } catch (e: any) {
              console.error(`[SchedulerService] Task 24h deadline reminder error:`, e.message);
            }
          }
        }

        if (diffHours > 0 && diffHours <= 1.5) {
          const key1 = `TASK_DEADLINE_1H:${task.id}:${emp.id}`;
          const delivered = await this.isDelivered(key1);
          if (!delivered) {
            try {
              await EmailService.sendTaskDeadlineReminder(recipientEmail, {
                employeeName: empName,
                taskTitle: task.title,
                projectName: task.project?.name,
                priority: task.priority,
                dueDate: dueDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
                timeRemaining: '1 hour',
                taskUrl: `/tasks?taskId=${task.id}`,
              });
              await this.markDelivered(key1);
              deadline1hSent++;
            } catch (e: any) {
              console.error(`[SchedulerService] Task 1h deadline reminder error:`, e.message);
            }
          }
        }
      }

      const rawSched = task.reminderAt || task.reminder_at || task.startDate || task.start_date;
      const scheduledTime = rawSched ? new Date(rawSched) : null;
      if (scheduledTime) {
        const diffMinutes = (scheduledTime.getTime() - now.getTime()) / (1000 * 60);
        if (diffMinutes > 0 && diffMinutes <= 15) {
          const schedKey = `TASK_SCHEDULED_10M:${task.id}:${emp.id}`;
          const delivered = await this.isDelivered(schedKey);
          if (!delivered) {
            try {
              await EmailService.sendScheduledTaskReminder(recipientEmail, {
                employeeName: empName,
                taskTitle: task.title,
                projectName: task.project?.name,
                priority: task.priority,
                scheduledTime: scheduledTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
                taskUrl: `/tasks?taskId=${task.id}`,
              });
              await this.markDelivered(schedKey);
              scheduledTaskSent++;
            } catch (e: any) {
              console.error(`[SchedulerService] Scheduled task reminder error:`, e.message);
            }
          }
        }
      }
    }

    return { deadline24hSent, deadline1hSent, scheduledTaskSent };
  }

  /**
   * Long-running Task Timer warning emails (>= 120m threshold)
   */
  private static async processLongRunningTimerReminders(now: Date) {
    const activeTimers = await DbService.query(
      () => prisma.taskTimer.findMany({
        where: { isActive: true },
        include: {
          employee: { include: { user: true } },
          task: { include: { project: true } },
        },
      }),
      () => DbService.restRequest<any[]>('/task_timers?is_active=eq.true&select=*,employee:employees(*,user:users(*)),task:tasks(*)')
    );

    let warningSent = 0;

    for (const timer of activeTimers || []) {
      const emp = timer.employee;
      const task = timer.task;
      if (!emp || !task) continue;

      const recipientEmail = emp.user?.email || emp.email;
      if (!recipientEmail) continue;

      const startedAt = timer.startedAt || timer.started_at;
      if (!startedAt) continue;

      const elapsedMinutes = Math.floor(DateTimeUtil.diffSeconds(startedAt, now) / 60);
      if (elapsedMinutes >= this.LONG_RUNNING_TIMER_THRESHOLD_MINUTES) {
        const idempotencyKey = `LONG_RUNNING_TIMER:${timer.id}:${this.LONG_RUNNING_TIMER_THRESHOLD_MINUTES}`;
        const alreadyDelivered = await this.isDelivered(idempotencyKey);
        if (!alreadyDelivered) {
          try {
            await EmailService.sendLongRunningTimerWarning(recipientEmail, {
              employeeName: emp.displayName || emp.display_name || `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
              taskTitle: task.title,
              projectName: task.project?.name,
              startedAt: new Date(startedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }),
              elapsedMinutes,
              taskUrl: `/tasks?taskId=${task.id}`,
            });
            await this.markDelivered(idempotencyKey, { elapsedMinutes });
            warningSent++;
          } catch (e: any) {
            console.error(`[SchedulerService] Long-running timer warning error:`, e.message);
          }
        }
      }
    }

    return { warningSent };
  }
}
