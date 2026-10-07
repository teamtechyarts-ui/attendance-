import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';
import { DateTimeUtil } from '../../utils/datetime.js';
import { WorkdayService } from '../../services/workday.service.js';
import { AuditService } from '../../services/audit.service.js';
import { CheckInInput, CheckOutInput } from '../../validation/index.js';
import { LiveEmployeeActivity, AdminDashboardMetrics, AttendanceStatus, WorkMode } from '../../types/index.js';
import { TaskService } from '../tasks/task.service.js';
import { LeaveService } from '../leave/leave.service.js';
import { NotificationService } from '../notifications/notification.service.js';
import { invalidateAuthSession, invalidateUserAuthSessions } from '../../middleware/auth.js';

export class AttendanceService {
  /**
   * Get today's attendance status for an employee
   */
  public static async getTodayAttendance(employeeId: string) {
    const todayStr = DateTimeUtil.getTodayDateString();
    const evaluation = await WorkdayService.evaluateDayForEmployee(employeeId, todayStr);

    return DbService.query(
      async () => {
        const record = await prisma.attendance.findUnique({
          where: {
            employeeId_attendanceDate: {
              employeeId,
              attendanceDate: new Date(todayStr),
            },
          },
          include: {
            sessions: { orderBy: { startedAt: 'desc' }, take: 1 },
          },
        });

        return {
          record,
          workday: evaluation,
          date: todayStr,
        };
      },
      async () => {
        const records = await DbService.restRequest<any[]>(
          `/attendance?employee_id=eq.${employeeId}&attendance_date=eq.${todayStr}&select=*,sessions:attendance_sessions(*)`
        );
        return {
          record: records?.[0] || null,
          workday: evaluation,
          date: todayStr,
        };
      }
    );
  }

  /**
   * Check In - Creates Attendance Record & Upgrades Session from RESTRICTED to NORMAL
   */
  public static async checkIn(
    employeeId: string,
    sessionId: string,
    userId: string,
    input: CheckInInput,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    const todayStr = DateTimeUtil.getTodayDateString();
    const now = new Date();

    // Workday evaluation
    const workday = await WorkdayService.evaluateDayForEmployee(employeeId, todayStr);

    // Determine status (WORKED_ON_HOLIDAY if holiday, otherwise LATE or PRESENT using work schedule and 15-minute grace threshold)
    const status: AttendanceStatus = workday.isHoliday
      ? 'WORKED_ON_HOLIDAY'
      : DateTimeUtil.calculateAttendanceStatus(
          now,
          workday.schedule,
          15
        );

    const result = await DbService.query(
      async () => {
        return await prisma.$transaction(async (tx) => {
          // Check if already checked in
          const existing = await tx.attendance.findUnique({
            where: {
              employeeId_attendanceDate: {
                employeeId,
                attendanceDate: new Date(todayStr),
              },
            },
          });

          if (existing && existing.checkInAt) {
            const err: any = new Error('You have already checked in for today');
            err.statusCode = 400;
            err.code = 'ATTENDANCE_ALREADY_CHECKED_IN';
            throw err;
          }

          // Create or update attendance record
          const dbStatus = (status === 'WORKED_ON_HOLIDAY' ? 'PRESENT' : status) as any;
          const attendance = existing
            ? await tx.attendance.update({
                where: { id: existing.id },
                data: {
                  status: dbStatus,
                  workMode: input.workMode as any,
                  verificationMethod: input.verificationMethod as any,
                  checkInAt: now,
                  checkInLatitude: input.latitude ? (input.latitude as any) : null,
                  checkInLongitude: input.longitude ? (input.longitude as any) : null,
                  deviceId: input.deviceId || null,
                  notes: status === 'WORKED_ON_HOLIDAY' ? `[WORKED_ON_HOLIDAY]\n${input.notes || ''}`.trim() : (input.notes || null),
                },
              })
            : await tx.attendance.create({
                data: {
                  employeeId,
                  attendanceDate: new Date(todayStr),
                  status: dbStatus,
                  workMode: input.workMode as any,
                  verificationMethod: input.verificationMethod as any,
                  checkInAt: now,
                  checkInLatitude: input.latitude ? (input.latitude as any) : null,
                  checkInLongitude: input.longitude ? (input.longitude as any) : null,
                  deviceId: input.deviceId || null,
                  notes: status === 'WORKED_ON_HOLIDAY' ? `[WORKED_ON_HOLIDAY]\n${input.notes || ''}`.trim() : (input.notes || null),
                },
              });

          // Create attendance session
          await tx.attendanceSession.create({
            data: {
              attendanceId: attendance.id,
              employeeId,
              startedAt: now,
            },
          });

          // Upgrade Session Mode in PostgreSQL from RESTRICTED to NORMAL
          await tx.userSession.update({
            where: { id: sessionId },
            data: {
              accessMode: 'NORMAL',
              attendanceRequired: false,
              restrictedUntil: null,
              lastActivityAt: now,
            },
          });

          console.log(`[AUTH] AUTH_WORK_SESSION_UPGRADED: userId=${userId}, sessionId=${sessionId}, attendanceId=${attendance.id}, timestamp=${now.toISOString()}`);

          await AuditService.log({
            userId,
            employeeId,
            action: 'ATTENDANCE_CHECK_IN',
            entityType: 'attendance',
            entityId: attendance.id,
            description: `Checked in for ${todayStr} (Mode: ${input.workMode}, Status: ${status})`,
            ipAddress: clientInfo.ipAddress,
            userAgent: clientInfo.userAgent,
          });

          // Informational in-app notification
          NotificationService.createNotification({
            userId,
            type: 'ATTENDANCE_MARKED',
            title: 'Attendance Marked',
            message: `You checked in today at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${input.workMode}, ${status}).`,
            actionUrl: '/attendance',
            entityType: 'attendance',
            entityId: attendance.id,
            actorId: userId,
          }).catch(() => {});

          return attendance;
        });
      },
      async () => {
        // REST Fallback
        const existingRecords = await DbService.restRequest<any[]>(
          `/attendance?employee_id=eq.${employeeId}&attendance_date=eq.${todayStr}`
        );
        const existing = existingRecords?.[0];
        const existingCheckIn = existing ? (existing.checkInAt || existing.check_in_at) : null;

        if (existingCheckIn) {
          const err: any = new Error('You have already checked in for today');
          err.statusCode = 400;
          err.code = 'ATTENDANCE_ALREADY_CHECKED_IN';
          throw err;
        }

        let attendance: any;
        if (existing) {
          const updated = await DbService.restRequest(`/attendance?id=eq.${existing.id}`, {
            method: 'PATCH',
            body: {
              status,
              work_mode: input.workMode,
              verification_method: input.verificationMethod,
              check_in_at: now.toISOString(),
              check_in_latitude: input.latitude || null,
              check_in_longitude: input.longitude || null,
              device_id: input.deviceId || null,
              notes: input.notes || null,
            },
          });
          attendance = updated[0];
        } else {
          const created = await DbService.restRequest<any[]>('/attendance', {
            method: 'POST',
            body: {
              employee_id: employeeId,
              attendance_date: todayStr,
              status,
              work_mode: input.workMode,
              verification_method: input.verificationMethod,
              check_in_at: now.toISOString(),
              check_in_latitude: input.latitude || null,
              check_in_longitude: input.longitude || null,
              device_id: input.deviceId || null,
              notes: input.notes || null,
            },
          });
          attendance = created[0];
        }

        await DbService.restRequest('/attendance_sessions', {
          method: 'POST',
          body: {
            attendance_id: attendance.id,
            employee_id: employeeId,
            started_at: now.toISOString(),
          },
        });

        await DbService.restRequest(`/user_sessions?id=eq.${sessionId}`, {
          method: 'PATCH',
          body: {
            access_mode: 'NORMAL',
            attendance_required: false,
            restricted_until: null,
            last_activity_at: now.toISOString(),
          },
        });

          console.log(`[AUTH] AUTH_WORK_SESSION_UPGRADED: userId=${userId}, sessionId=${sessionId}, attendanceId=${attendance.id}, timestamp=${now.toISOString()}`);

        await AuditService.log({
          userId,
          employeeId,
          action: 'ATTENDANCE_CHECK_IN',
          entityType: 'attendance',
          entityId: attendance.id,
          description: `Checked in for ${todayStr} (Mode: ${input.workMode}, Status: ${status})`,
          ipAddress: clientInfo.ipAddress,
          userAgent: clientInfo.userAgent,
        });

        return attendance;
      }
    );

    invalidateAuthSession(sessionId);
    return result;
  }

  /**
   * Check Out
   */
  public static async checkOut(
    employeeId: string,
    userId: string,
    input: CheckOutInput,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    const todayStr = DateTimeUtil.getTodayDateString();
    const now = new Date();

    const result = await DbService.query(
      async () => {
        return await prisma.$transaction(async (tx) => {
          const attendance = await tx.attendance.findUnique({
            where: {
              employeeId_attendanceDate: {
                employeeId,
                attendanceDate: new Date(todayStr),
              },
            },
          });

          if (!attendance || !attendance.checkInAt) {
            const err: any = new Error('No check-in record found for today');
            err.statusCode = 400;
            err.code = 'ATTENDANCE_NOT_CHECKED_IN';
            throw err;
          }

          if (attendance.checkOutAt) {
            const err: any = new Error('You have already checked out today');
            err.statusCode = 400;
            err.code = 'ATTENDANCE_ALREADY_CHECKED_OUT';
            throw err;
          }

          // Close active attendance session
          const activeSession = await tx.attendanceSession.findFirst({
            where: {
              attendanceId: attendance.id,
              endedAt: null,
            },
            orderBy: { startedAt: 'desc' },
          });

          if (activeSession) {
            const sessionSec = DateTimeUtil.diffSeconds(activeSession.startedAt, now);
            await tx.attendanceSession.update({
              where: { id: activeSession.id },
              data: {
                endedAt: now,
                durationMinutes: Math.floor(sessionSec / 60),
              },
            });
          }

          // Authoritative working minutes: sum of all completed session durations + current active session
          const allSessions = await tx.attendanceSession.findMany({
            where: { attendanceId: attendance.id },
          });

          let totalWorkMinutes = 0;
          if (allSessions && allSessions.length > 0) {
            for (const s of allSessions) {
              if (s.durationMinutes) {
                totalWorkMinutes += s.durationMinutes;
              } else if (s.startedAt) {
                const sEnd = s.endedAt || now;
                totalWorkMinutes += Math.floor(DateTimeUtil.diffSeconds(s.startedAt, sEnd) / 60);
              }
            }
          } else {
            const diffSec = DateTimeUtil.diffSeconds(attendance.checkInAt, now);
            totalWorkMinutes = Math.floor(diffSec / 60);
          }

          // Automatically stop all active task timers belonging to this employee
          const activeTimers = await tx.taskTimer.findMany({
            where: { employeeId, isActive: true },
            include: { task: true },
          });

          let timersAutoStopped = 0;
          for (const timer of activeTimers) {
            const diff = Math.max(0, DateTimeUtil.diffSeconds(timer.startedAt, now));
            await tx.taskTimer.update({
              where: { id: timer.id },
              data: {
                endedAt: now,
                pausedAt: now,
                durationSeconds: (timer.durationSeconds || 0) + diff,
                isActive: false,
              },
            });

            if (timer.task && timer.task.status === 'IN_PROGRESS') {
              await tx.task.update({
                where: { id: timer.taskId },
                data: { status: 'PAUSED' },
              });
            }

            timersAutoStopped++;

            await AuditService.log({
              userId,
              employeeId,
              action: 'TASK_PAUSED',
              entityType: 'task',
              entityId: timer.taskId,
              description: `Timer automatically stopped at attendance checkout for task "${timer.task?.title || timer.taskId}"`,
              ipAddress: clientInfo.ipAddress,
              userAgent: clientInfo.userAgent,
            });
          }

          // Workday evaluation for holiday & duration policy
          const workday = await WorkdayService.evaluateDayForEmployee(employeeId, todayStr);
          const isHolidayWork = workday.isHoliday || attendance.notes?.includes('[WORKED_ON_HOLIDAY]');
          let finalStatus: AttendanceStatus = attendance.status;
          let earnedLeaveCredited = 0;

          if (isHolidayWork) {
            finalStatus = 'WORKED_ON_HOLIDAY';
            if (totalWorkMinutes >= 390) {
              // 6h 30m or more -> 1.0 Earned Leave
              await LeaveService.creditEarnedLeaveForHolidayWork(employeeId, todayStr, 1.0, userId, totalWorkMinutes);
              earnedLeaveCredited = 1.0;
            } else if (totalWorkMinutes >= 240) {
              // 4h to 6h 29m -> 0.5 Earned Leave (half day)
              await LeaveService.creditEarnedLeaveForHolidayWork(employeeId, todayStr, 0.5, userId, totalWorkMinutes);
              earnedLeaveCredited = 0.5;
            }
          } else {
            // Normal workday: if actual work is below 6h30m (390 min), classify as HALF_DAY
            if (totalWorkMinutes < 390 && (attendance.status === 'PRESENT' || attendance.status === 'LATE')) {
              finalStatus = 'HALF_DAY';
            }
          }

          const dbStatus = (finalStatus === 'WORKED_ON_HOLIDAY' ? 'PRESENT' : finalStatus) as any;
          const updatedNotes = isHolidayWork && !attendance.notes?.includes('[WORKED_ON_HOLIDAY]')
            ? `[WORKED_ON_HOLIDAY]\n${input.notes ? `${attendance.notes || ''}\n${input.notes}` : (attendance.notes || '')}`.trim()
            : (input.notes ? `${attendance.notes || ''}\n${input.notes}`.trim() : attendance.notes);

          const updated = await tx.attendance.update({
            where: { id: attendance.id },
            data: {
              status: dbStatus,
              checkOutAt: now,
              totalWorkMinutes,
              checkOutLatitude: input.latitude ? (input.latitude as any) : null,
              checkOutLongitude: input.longitude ? (input.longitude as any) : null,
              notes: updatedNotes || null,
            },
          });

          console.log(`[AUTH] AUTH_WORK_SESSION_ENDED: userId=${userId}, employeeId=${employeeId}, attendanceId=${attendance.id}, totalWorkMinutes=${totalWorkMinutes}, earnedLeaveCredited=${earnedLeaveCredited}, timestamp=${now.toISOString()}`);

          await AuditService.log({
            userId,
            employeeId,
            action: 'ATTENDANCE_CHECK_OUT',
            entityType: 'attendance',
            entityId: attendance.id,
            description: `Checked out for ${todayStr} (Duration: ${totalWorkMinutes} mins, Status: ${finalStatus}, Earned Leave: ${earnedLeaveCredited}, Timers stopped: ${timersAutoStopped})`,
            ipAddress: clientInfo.ipAddress,
            userAgent: clientInfo.userAgent,
          });

          return {
            ...updated,
            earnedLeaveCredited,
            timersAutoStopped,
          };
        });
      },
      async () => {
        // REST Fallback
        const attendances = await DbService.restRequest<any[]>(
          `/attendance?employee_id=eq.${employeeId}&attendance_date=eq.${todayStr}`
        );
        const attendance = attendances?.[0];
        const checkInAt = attendance ? (attendance.checkInAt || attendance.check_in_at) : null;

        if (!attendance || !checkInAt) {
          const err: any = new Error('No check-in record found for today');
          err.statusCode = 400;
          err.code = 'ATTENDANCE_NOT_CHECKED_IN';
          throw err;
        }

        const checkOutAt = attendance.checkOutAt || attendance.check_out_at;
        if (checkOutAt) {
          const err: any = new Error('You have already checked out today');
          err.statusCode = 400;
          err.code = 'ATTENDANCE_ALREADY_CHECKED_OUT';
          throw err;
        }

        // Close active session in REST fallback
        const allSessions = await DbService.restRequest<any[]>(
          `/attendance_sessions?attendance_id=eq.${attendance.id}`
        );

        let totalWorkMinutes = 0;
        if (allSessions && allSessions.length > 0) {
          for (const s of allSessions) {
            const sStartedAt = s.startedAt || s.started_at;
            const sEndedAt = s.endedAt || s.ended_at;
            if (!sEndedAt && sStartedAt) {
              const sessionSec = DateTimeUtil.diffSeconds(sStartedAt, now);
              const sessionMins = Math.floor(sessionSec / 60);
              await DbService.restRequest(`/attendance_sessions?id=eq.${s.id}`, {
                method: 'PATCH',
                body: {
                  ended_at: now.toISOString(),
                  duration_minutes: sessionMins,
                },
              });
              totalWorkMinutes += sessionMins;
            } else if (s.durationMinutes !== undefined || s.duration_minutes !== undefined) {
              totalWorkMinutes += (s.durationMinutes ?? s.duration_minutes ?? 0);
            }
          }
        } else {
          const diffSec = DateTimeUtil.diffSeconds(checkInAt, now);
          totalWorkMinutes = Math.floor(diffSec / 60);
        }

        // Automatically stop all active task timers in REST fallback
        const activeTimers = await DbService.restRequest<any[]>(
          `/task_timers?employee_id=eq.${employeeId}&is_active=eq.true&select=*,task:tasks(*)`
        );

        let timersAutoStopped = 0;
        if (activeTimers && activeTimers.length > 0) {
          for (const t of activeTimers) {
            const tStartedAt = t.startedAt || t.started_at;
            const diff = Math.max(0, DateTimeUtil.diffSeconds(tStartedAt, now));
            const currentDur = t.durationSeconds || t.duration_seconds || 0;
            await DbService.restRequest(`/task_timers?id=eq.${t.id}`, {
              method: 'PATCH',
              body: {
                ended_at: now.toISOString(),
                paused_at: now.toISOString(),
                duration_seconds: currentDur + diff,
                is_active: false,
              },
            });

            const taskObj = t.task;
            const taskStatus = taskObj?.status || t.task_status;
            const taskId = t.taskId || t.task_id;
            if (taskStatus === 'IN_PROGRESS' || !taskStatus) {
              await DbService.restRequest(`/tasks?id=eq.${taskId}`, {
                method: 'PATCH',
                body: { status: 'PAUSED' },
              });
            }

            timersAutoStopped++;

            await AuditService.log({
              userId,
              employeeId,
              action: 'TASK_PAUSED',
              entityType: 'task',
              entityId: taskId,
              description: `Timer automatically stopped at attendance checkout for task "${taskObj?.title || taskId}"`,
              ipAddress: clientInfo.ipAddress,
              userAgent: clientInfo.userAgent,
            });
          }
        }

        // Workday evaluation for holiday & duration policy
        const workday = await WorkdayService.evaluateDayForEmployee(employeeId, todayStr);
        let finalStatus = attendance.status;
        let earnedLeaveCredited = 0;

        if (workday.isHoliday || attendance.status === 'WORKED_ON_HOLIDAY') {
          finalStatus = 'WORKED_ON_HOLIDAY';
          if (totalWorkMinutes >= 390) {
            await LeaveService.creditEarnedLeaveForHolidayWork(employeeId, todayStr, 1.0, userId, totalWorkMinutes);
            earnedLeaveCredited = 1.0;
          } else if (totalWorkMinutes >= 240) {
            await LeaveService.creditEarnedLeaveForHolidayWork(employeeId, todayStr, 0.5, userId, totalWorkMinutes);
            earnedLeaveCredited = 0.5;
          }
        } else {
          if (totalWorkMinutes < 390 && (attendance.status === 'PRESENT' || attendance.status === 'LATE')) {
            finalStatus = 'HALF_DAY';
          }
        }

        const updated = await DbService.restRequest(`/attendance?id=eq.${attendance.id}`, {
          method: 'PATCH',
          body: {
            status: finalStatus,
            check_out_at: now.toISOString(),
            total_work_minutes: totalWorkMinutes,
          },
        });

        console.log(`[AUTH] AUTH_WORK_SESSION_ENDED: userId=${userId}, employeeId=${employeeId}, attendanceId=${attendance.id}, totalWorkMinutes=${totalWorkMinutes}, earnedLeaveCredited=${earnedLeaveCredited}, timestamp=${now.toISOString()}`);

        await AuditService.log({
          userId,
          employeeId,
          action: 'ATTENDANCE_CHECK_OUT',
          entityType: 'attendance',
          entityId: attendance.id,
          description: `Checked out for ${todayStr} (Duration: ${totalWorkMinutes} mins, Status: ${finalStatus}, Earned Leave: ${earnedLeaveCredited}, Timers stopped: ${timersAutoStopped})`,
          ipAddress: clientInfo.ipAddress,
          userAgent: clientInfo.userAgent,
        });

        return {
          ...updated[0],
          earnedLeaveCredited,
          timersAutoStopped,
        };
      }
    );

    invalidateUserAuthSessions(userId);
    return result;
  }

  /**
   * Admin Dashboard Live Employee Activity Overview
   * Displays: Employee name, photo, status, workMode, Current Task + Running Timer!
   */
  public static async getLiveOverview(): Promise<LiveEmployeeActivity[]> {
    const todayStr = DateTimeUtil.getTodayDateString();

    return DbService.query(
      async () => {
        const [employees, leaves] = await Promise.all([
          prisma.employee.findMany({
            where: {
              employmentStatus: 'ACTIVE',
              NOT: { user: { role: 'SUPER_ADMIN' } },
            },
            include: {
              department: true,
              designation: true,
              attendances: {
                where: { attendanceDate: new Date(todayStr) },
                take: 1,
              },
              tasks: {
                where: { status: { in: ['IN_PROGRESS', 'TODO', 'PAUSED'] } },
                include: {
                  project: { select: { id: true, name: true } },
                  timers: true,
                },
                orderBy: { updatedAt: 'desc' },
              },
            },
            orderBy: { firstName: 'asc' },
          }),
          prisma.leaveRequest.findMany({
            where: {
              status: 'APPROVED',
              startDate: { lte: new Date(todayStr) },
              endDate: { gte: new Date(todayStr) },
            },
            include: { leaveType: true },
          }),
        ]);

        const leaveByEmpId = new Map<string, any>();
        for (const l of leaves) {
          leaveByEmpId.set(l.employeeId, l);
        }

        return employees.map((emp) => {
          const todayAtt = emp.attendances[0];
          const todayLeave = leaveByEmpId.get(emp.id);

          let attendanceStatus: AttendanceStatus | 'NOT_MARKED' = 'NOT_MARKED';
          let workMode: WorkMode | null = null;
          let checkInAt: string | null = null;
          let checkOutAt: string | null = null;
          let isCheckedIn = false;
          let isOnLeave = Boolean(todayLeave);

          if (todayAtt && todayAtt.checkInAt) {
            attendanceStatus = todayAtt.status;
            workMode = todayAtt.workMode;
            checkInAt = todayAtt.checkInAt.toISOString();
            checkOutAt = todayAtt.checkOutAt ? todayAtt.checkOutAt.toISOString() : null;
            isCheckedIn = !todayAtt.checkOutAt;
          } else if (todayLeave) {
            attendanceStatus = 'ON_LEAVE';
          }

          // Find current active task & timer
          const runningTask = emp.tasks.find((t) => t.timers && t.timers.some((timer) => timer.isActive)) || emp.tasks[0];
          const activeTimer = runningTask?.timers?.find((t) => t.isActive);

          let priorClosedDurationSeconds = 0;
          let elapsedSeconds = 0;
          if (runningTask && runningTask.timers && runningTask.timers.length > 0) {
            priorClosedDurationSeconds = runningTask.timers
              .filter((t) => !t.isActive)
              .reduce((acc, t) => acc + (t.durationSeconds || 0), 0);
            elapsedSeconds = TaskService.calculateTaskWorkedSeconds(runningTask.timers, new Date());
          }

          return {
            employeeId: emp.id,
            employeeCode: emp.employeeCode,
            name: `${emp.firstName} ${emp.lastName}`.trim(),
            displayName: emp.displayName,
            profilePhotoUrl: emp.profilePhotoUrl,
            departmentName: emp.department?.name || null,
            designationName: emp.designation?.name || null,
            attendanceStatus,
            isCheckedIn,
            workMode,
            checkInAt,
            checkOutAt,
            isOnLeave,
            leaveDetails: todayLeave
              ? {
                  leaveType: todayLeave.leaveType?.name || 'Approved Leave',
                  startDate: todayLeave.startDate.toISOString().split('T')[0],
                  endDate: todayLeave.endDate.toISOString().split('T')[0],
                  status: todayLeave.status,
                }
              : null,
            currentTask: runningTask
              ? {
                  id: runningTask.id,
                  title: runningTask.title,
                  priority: runningTask.priority,
                  status: runningTask.status,
                  timerStartedAt: activeTimer ? activeTimer.startedAt.toISOString() : null,
                  priorClosedDurationSeconds,
                  totalDurationSeconds: elapsedSeconds,
                  elapsedSeconds,
                  isActive: Boolean(activeTimer?.isActive),
                  projectName: runningTask.project?.name || null,
                }
              : null,
            activeTaskCount: emp.tasks.length,
          };
        });
      },
      async () => {
        // REST Fallback
        const [rawEmployees, attendances, leaves, tasks] = await Promise.all([
          DbService.restRequest<any[]>(
            `/employees?employment_status=eq.ACTIVE&select=*,department:departments(*),designation:designations(*),user:users(role)`
          ),
          DbService.restRequest<any[]>(
            `/attendance?attendance_date=eq.${todayStr}&select=*`
          ),
          DbService.restRequest<any[]>(
            `/leave_requests?status=eq.APPROVED&start_date=lte.${todayStr}&end_date=gte.${todayStr}&select=*,leave_type:leave_types(*)`
          ),
          DbService.restRequest<any[]>(
            `/tasks?status=in.(TODO,IN_PROGRESS,PAUSED)&select=*,timers:task_timers(*)`
          ).catch(() => []),
        ]);

        const employees = (rawEmployees || []).filter((e) => e.user?.role !== 'SUPER_ADMIN');

        const attByEmpId = new Map<string, any>();
        for (const a of attendances || []) {
          attByEmpId.set(a.employee_id || a.employeeId, a);
        }

        const leaveByEmpId = new Map<string, any>();
        for (const l of leaves || []) {
          leaveByEmpId.set(l.employee_id || l.employeeId, l);
        }

        const tasksByEmpId = new Map<string, any[]>();
        for (const t of tasks || []) {
          const empId = t.employee_id || t.employeeId;
          if (!tasksByEmpId.has(empId)) tasksByEmpId.set(empId, []);
          tasksByEmpId.get(empId)!.push(t);
        }

        return (employees || []).map((emp) => {
          const todayAtt = attByEmpId.get(emp.id);
          const todayLeave = leaveByEmpId.get(emp.id);
          const empTasks = tasksByEmpId.get(emp.id) || [];

          const runningTask = empTasks.find((t: any) => t.timers?.some((timer: any) => timer.isActive || timer.is_active)) || empTasks[0];
          const activeTimer = runningTask?.timers?.find((t: any) => t.isActive || t.is_active);

          let priorClosedDurationSeconds = 0;
          let elapsedSeconds = 0;
          if (runningTask && runningTask.timers && runningTask.timers.length > 0) {
            priorClosedDurationSeconds = (runningTask.timers || [])
              .filter((t: any) => !(t.isActive || t.is_active))
              .reduce((acc: number, t: any) => acc + (t.durationSeconds ?? t.duration_seconds ?? 0), 0);
            elapsedSeconds = TaskService.calculateTaskWorkedSeconds(runningTask.timers, new Date());
          } else if (runningTask) {
            elapsedSeconds = runningTask.totalDurationSeconds ?? runningTask.total_duration_seconds ?? 0;
          }

          const firstName = emp.firstName || emp.first_name || '';
          const lastName = emp.lastName || emp.last_name || '';
          const fullName = `${firstName} ${lastName}`.trim();
          const displayName = emp.displayName || emp.display_name || fullName || 'Employee';

          const checkIn = todayAtt?.checkInAt || todayAtt?.check_in_at;
          const checkOut = todayAtt?.checkOutAt || todayAtt?.check_out_at;
          const hasCheckIn = Boolean(checkIn);
          const isCheckedIn = Boolean(checkIn && !checkOut);
          const isOnLeave = Boolean(todayLeave);

          let attendanceStatus: AttendanceStatus | 'NOT_MARKED' = 'NOT_MARKED';
          if (hasCheckIn) {
            attendanceStatus = todayAtt.status || 'PRESENT';
          } else if (isOnLeave) {
            attendanceStatus = 'ON_LEAVE';
          }

          return {
            employeeId: emp.id,
            employeeCode: emp.employeeCode || emp.employee_code || '',
            name: fullName || displayName,
            displayName,
            profilePhotoUrl: emp.profilePhotoUrl || emp.profile_photo_url || null,
            departmentName: emp.department?.name || null,
            designationName: emp.designation?.name || null,
            attendanceStatus,
            isCheckedIn,
            workMode: todayAtt?.workMode || todayAtt?.work_mode || null,
            checkInAt: checkIn || null,
            checkOutAt: checkOut || null,
            isOnLeave,
            leaveDetails: todayLeave
              ? {
                  leaveType: todayLeave.leave_type?.name || todayLeave.leaveType?.name || 'Approved Leave',
                  startDate: (todayLeave.startDate || todayLeave.start_date || '').split('T')[0],
                  endDate: (todayLeave.endDate || todayLeave.end_date || '').split('T')[0],
                  status: todayLeave.status,
                }
              : null,
            currentTask: runningTask
              ? {
                  id: runningTask.id,
                  title: runningTask.title,
                  priority: runningTask.priority,
                  status: runningTask.status,
                  timerStartedAt: activeTimer?.startedAt || activeTimer?.started_at || null,
                  priorClosedDurationSeconds,
                  totalDurationSeconds: elapsedSeconds,
                  elapsedSeconds,
                  isActive: Boolean(activeTimer?.isActive ?? activeTimer?.is_active ?? false),
                  projectName: runningTask.project?.name || null,
                }
              : null,
            activeTaskCount: empTasks.length,
          };
        });
      }
    );
  }

  /**
   * Admin Dashboard KPI Metrics
   */
  public static async getMetrics(): Promise<AdminDashboardMetrics> {
    const todayStr = DateTimeUtil.getTodayDateString();

    return DbService.query(
      async () => {
        const [
          activeEmployees,
          todayAttendances,
          approvedLeaves,
          activeTasks,
          completedTasks,
          overdueTasks,
          pendingLeaves,
          submittedReports,
        ] = await Promise.all([
          prisma.employee.findMany({
            where: {
              employmentStatus: 'ACTIVE',
              NOT: { user: { role: 'SUPER_ADMIN' } },
            },
            select: { id: true },
          }),
          prisma.attendance.findMany({
            where: { attendanceDate: new Date(todayStr) },
          }),
          prisma.leaveRequest.findMany({
            where: {
              status: 'APPROVED',
              startDate: { lte: new Date(todayStr) },
              endDate: { gte: new Date(todayStr) },
            },
            select: { employeeId: true },
          }),
          prisma.task.count({ where: { status: { in: ['TODO', 'IN_PROGRESS', 'PAUSED'] } } }),
          prisma.task.count({ where: { status: 'COMPLETED' } }),
          prisma.task.count({ where: { status: 'OVERDUE' } }),
          prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
          prisma.dailyWorkReport.count({ where: { reportDate: new Date(todayStr) } }),
        ]);

        const totalEmployees = activeEmployees.length;
        const activeEmpIds = new Set(activeEmployees.map((e) => e.id));

        const markedEmpIds = new Set<string>();
        let working = 0;
        let wfh = 0;

        for (const a of todayAttendances) {
          if (activeEmpIds.has(a.employeeId)) {
            if (a.checkInAt) {
              markedEmpIds.add(a.employeeId);
              if (!a.checkOutAt) {
                working++;
              }
              if (a.workMode === 'WFH') {
                wfh++;
              }
            }
          }
        }

        const onLeaveEmpIds = new Set(
          approvedLeaves.map((l) => l.employeeId).filter((id) => activeEmpIds.has(id))
        );
        const onLeaveCount = onLeaveEmpIds.size;

        const unmarkedEmployees = activeEmployees.filter(
          (e) => !markedEmpIds.has(e.id) && !onLeaveEmpIds.has(e.id)
        );
        const absentOrNotMarked = unmarkedEmployees.length;

        return {
          totalEmployees,
          currentlyWorking: working,
          wfhCount: wfh,
          onLeaveCount: onLeaveCount,
          absentOrNotMarkedCount: absentOrNotMarked,
          activeTasksCount: activeTasks,
          completedTasksCount: completedTasks,
          overdueTasksCount: overdueTasks,
          pendingLeaveRequestsCount: pendingLeaves,
          reportsSubmittedCount: submittedReports,
          reportsMissingCount: Math.max(0, totalEmployees - submittedReports),
        };
      },
      async () => {
        const [employees, attendances, leaves, tasks, completedTasks, pendingLeaves, submittedReports] = await Promise.all([
          DbService.restRequest<any[]>('/employees?employment_status=eq.ACTIVE&select=id,user:users(role)'),
          DbService.restRequest<any[]>(`/attendance?attendance_date=eq.${todayStr}&select=*`),
          DbService.restRequest<any[]>(`/leave_requests?status=eq.APPROVED&start_date=lte.${todayStr}&end_date=gte.${todayStr}&select=employee_id`),
          DbService.restRequest<any[]>('/tasks?status=in.(TODO,IN_PROGRESS,PAUSED)&select=id'),
          DbService.restRequest<any[]>('/tasks?status=eq.COMPLETED&select=id'),
          DbService.restRequest<any[]>('/leave_requests?status=eq.PENDING&select=id'),
          DbService.restRequest<any[]>(`/daily_work_reports?report_date=eq.${todayStr}&select=id`),
        ]);

        const activeEmployees = (employees || []).filter((e: any) => e.user?.role !== 'SUPER_ADMIN');
        const totalEmployees = activeEmployees.length;
        const activeEmpIds = new Set(activeEmployees.map((e: any) => e.id));

        const markedEmpIds = new Set<string>();
        let working = 0;
        let wfh = 0;

        for (const a of attendances || []) {
          const empId = a.employee_id || a.employeeId;
          if (activeEmpIds.has(empId)) {
            const checkIn = a.check_in_at || a.checkInAt;
            const checkOut = a.check_out_at || a.checkOutAt;
            const workMode = a.work_mode || a.workMode;

            if (checkIn) {
              markedEmpIds.add(empId);
              if (!checkOut) {
                working++;
              }
              if (workMode === 'WFH') {
                wfh++;
              }
            }
          }
        }

        const onLeaveEmpIds = new Set(
          (leaves || [])
            .map((l: any) => l.employee_id || l.employeeId)
            .filter((id: string) => activeEmpIds.has(id))
        );
        const onLeaveCount = onLeaveEmpIds.size;

        const unmarkedEmployees = activeEmployees.filter(
          (e: any) => !markedEmpIds.has(e.id) && !onLeaveEmpIds.has(e.id)
        );
        const absentOrNotMarked = unmarkedEmployees.length;

        const activeTasksCount = tasks?.length || 0;
        const completedTasksCount = completedTasks?.length || 0;
        const pendingLeaveRequestsCount = pendingLeaves?.length || 0;
        const reportsSubmittedCount = submittedReports?.length || 0;

        return {
          totalEmployees,
          currentlyWorking: working,
          wfhCount: wfh,
          onLeaveCount,
          absentOrNotMarkedCount: absentOrNotMarked,
          activeTasksCount,
          completedTasksCount,
          overdueTasksCount: 0,
          pendingLeaveRequestsCount,
          reportsSubmittedCount,
          reportsMissingCount: Math.max(0, totalEmployees - reportsSubmittedCount),
        };
      }
    );
  }

  /**
   * Get attendance history (for a specific employee or all employees)
   * Computes the complete authoritative attendance calendar including:
   * - PRESENT, LATE, HALF_DAY (from attendance logs)
   * - LEAVE (from approved leave requests)
   * - HOLIDAY (from holiday calendar)
   * - OFF (from scheduled non-working days / weekends)
   * - ABSENT (scheduled working days with no attendance/leave)
   * Returns records and comprehensive monthly summary metrics.
   */
  public static async getHistory(
    employeeIdOrOptions?: string | string[] | null | {
      employeeId?: string | string[] | null;
      date?: string;
      year?: number;
      month?: number;
      status?: string;
      adminView?: boolean;
    },
    yearArg?: number,
    monthArg?: number,
    dateArg?: string
  ) {
    let employeeId: string | string[] | null | undefined;
    let date: string | undefined;
    let year: number | undefined;
    let month: number | undefined;
    let statusFilter: string | undefined;
    let adminView: boolean | undefined;

    if (employeeIdOrOptions && typeof employeeIdOrOptions === 'object' && !Array.isArray(employeeIdOrOptions)) {
      employeeId = employeeIdOrOptions.employeeId;
      date = employeeIdOrOptions.date;
      year = employeeIdOrOptions.year;
      month = employeeIdOrOptions.month;
      statusFilter = employeeIdOrOptions.status;
      adminView = employeeIdOrOptions.adminView;
    } else {
      employeeId = employeeIdOrOptions;
      year = yearArg;
      month = monthArg;
      date = dateArg;
    }

    const todayStr = DateTimeUtil.getTodayDateString();
    const [currYearStr, currMonthStr] = todayStr.split('-');
    const currYear = parseInt(currYearStr, 10);
    const currMonth = parseInt(currMonthStr, 10);

    // Determine Date Range based on business today
    let startStr: string;
    let endStr: string;
    let isSpecificDate = false;

    if (date && DateTimeUtil.isValidDateString(date)) {
      if (date > todayStr) {
        // Single date in future -> return empty history
        return {
          records: [],
          summary: {
            totalDays: 0,
            workingDays: 0,
            present: 0,
            late: 0,
            halfDay: 0,
            absent: 0,
            leave: 0,
            holidays: 0,
            offDays: 0,
          },
        };
      }
      startStr = date;
      endStr = date;
      isSpecificDate = true;
    } else if (year && month) {
      if (year > currYear || (year === currYear && month > currMonth)) {
        // Future month -> return empty history
        return {
          records: [],
          summary: {
            totalDays: 0,
            workingDays: 0,
            present: 0,
            late: 0,
            halfDay: 0,
            absent: 0,
            leave: 0,
            holidays: 0,
            offDays: 0,
          },
        };
      }
      const range = DateTimeUtil.getMonthDateRange(year, month);
      startStr = range.startStr;
      if (year === currYear && month === currMonth) {
        // Current month: stop strictly at business today
        endStr = todayStr;
      } else {
        // Past month: full month
        endStr = range.endStr;
      }
    } else if (year) {
      if (year > currYear) {
        // Future year -> return empty history
        return {
          records: [],
          summary: {
            totalDays: 0,
            workingDays: 0,
            present: 0,
            late: 0,
            halfDay: 0,
            absent: 0,
            leave: 0,
            holidays: 0,
            offDays: 0,
          },
        };
      }
      const range = DateTimeUtil.getYearDateRange(year);
      startStr = range.startStr;
      if (year === currYear) {
        endStr = todayStr;
      } else {
        endStr = range.endStr;
      }
    } else {
      // Default: Current Month -> from 1st to business today
      const range = DateTimeUtil.getMonthDateRange(currYear, currMonth);
      startStr = range.startStr;
      endStr = todayStr;
    }

    const startObj = new Date(startStr);
    const endObj = new Date(endStr);

    return DbService.query(
      async () => {
        // 1. Resolve Target Employees
        let targetEmployees: {
          id: string;
          displayName: string;
          firstName: string;
          lastName: string;
          employeeCode: string;
        }[] = [];

        if (employeeId) {
          const empWhere = Array.isArray(employeeId) ? { in: employeeId } : employeeId;
          targetEmployees = await prisma.employee.findMany({
            where: { id: empWhere },
            select: { id: true, displayName: true, firstName: true, lastName: true, employeeCode: true },
          });
        } else if (adminView) {
          targetEmployees = await prisma.employee.findMany({
            where: {
              employmentStatus: 'ACTIVE',
              NOT: { user: { role: 'SUPER_ADMIN' } },
            },
            select: { id: true, displayName: true, firstName: true, lastName: true, employeeCode: true },
            orderBy: { displayName: 'asc' },
          });
        } else {
          targetEmployees = [];
        }

        if (targetEmployees.length === 0) {
          return {
            records: [],
            summary: {
              totalDays: 0,
              workingDays: 0,
              present: 0,
              late: 0,
              halfDay: 0,
              absent: 0,
              leave: 0,
              holidays: 0,
              offDays: 0,
            },
          };
        }

        const targetEmpIds = targetEmployees.map((e) => e.id);

        // 2. Concurrently fetch attendance records, approved leaves, and workday evaluations
        const [attendances, approvedLeaves, evaluations] = await Promise.all([
          prisma.attendance.findMany({
            where: {
              employeeId: { in: targetEmpIds },
              attendanceDate: { gte: startObj, lte: endObj },
            },
            include: {
              employee: {
                select: { id: true, displayName: true, firstName: true, lastName: true, employeeCode: true },
              },
            },
            orderBy: { attendanceDate: 'desc' },
          }),
          prisma.leaveRequest.findMany({
            where: {
              employeeId: { in: targetEmpIds },
              status: 'APPROVED',
              startDate: { lte: endObj },
              endDate: { gte: startObj },
            },
            include: { leaveType: { select: { id: true, name: true } } },
          }),
          WorkdayService.evaluateDateRange(targetEmpIds, startStr, endStr),
        ]);

        // Build Index Maps
        // Attendance Map: empId -> dateStr -> record
        const attMap = new Map<string, Map<string, any>>();
        for (const a of attendances) {
          if (!attMap.has(a.employeeId)) attMap.set(a.employeeId, new Map());
          const rawDate: any = a.attendanceDate;
          const dStr = typeof rawDate === 'string' ? rawDate.slice(0, 10) : DateTimeUtil.formatDateString(rawDate);
          if (dStr) {
            attMap.get(a.employeeId)!.set(dStr, a);
          }
        }

        // Leave Map: empId -> list of approved requests
        const leaveMap = new Map<string, any[]>();
        for (const l of approvedLeaves) {
          if (!leaveMap.has(l.employeeId)) leaveMap.set(l.employeeId, []);
          leaveMap.get(l.employeeId)!.push(l);
        }

        // 3. Build Calendar Dates List (historical up to today only)
        const dateStrings: string[] = [];
        let curr = new Date(startObj);
        while (curr <= endObj) {
          dateStrings.push(DateTimeUtil.formatDateString(curr));
          curr = new Date(curr.getTime() + 86400000);
        }

        const allRecords: any[] = [];
        let summaryWorkingDays = 0;
        let summaryPresent = 0;
        let summaryLate = 0;
        let summaryHalfDay = 0;
        let summaryAbsent = 0;
        let summaryLeave = 0;
        let summaryHolidays = 0;
        let summaryOffDays = 0;

        for (const emp of targetEmployees) {
          const empDays = evaluations.get(emp.id) || new Map<string, any>();
          const empAtts = attMap.get(emp.id) || new Map<string, any>();
          const empLeaves = leaveMap.get(emp.id) || [];

          for (const dateStr of dateStrings) {
            const evalResult = empDays.get(dateStr) || { isWorkingDay: true, isHoliday: false, isWeekend: false };
            const att = empAtts.get(dateStr);

            // Check if date is covered by approved leave
            const matchingLeave = empLeaves.find((l) => {
              const rawStart = l.startDate || l.start_date;
              const rawEnd = l.endDate || l.end_date;
              const lStart = typeof rawStart === 'string' ? rawStart.slice(0, 10) : DateTimeUtil.formatDateString(rawStart);
              const lEnd = typeof rawEnd === 'string' ? rawEnd.slice(0, 10) : DateTimeUtil.formatDateString(rawEnd);
              return Boolean(lStart && lEnd && dateStr >= lStart && dateStr <= lEnd);
            });

            // Authoritative Status Resolution (Only historical & today records exist)
            let status: AttendanceStatus | 'LEAVE' | 'OFF';
            if (evalResult.isHoliday) {
              status = att?.checkInAt ? (att.status === 'WORKED_ON_HOLIDAY' ? 'WORKED_ON_HOLIDAY' : 'WORKED_ON_HOLIDAY') : 'HOLIDAY';
            } else if (!evalResult.isWorkingDay) {
              status = att?.checkInAt ? (att.status as AttendanceStatus) : 'OFF';
            } else if (matchingLeave) {
              status = 'LEAVE';
            } else if (att?.checkInAt) {
              status = att.status as AttendanceStatus;
            } else {
              status = 'ABSENT';
            }

            // Reconcile Summary Totals
            if (evalResult.isHoliday) {
              summaryHolidays++;
            } else if (!evalResult.isWorkingDay) {
              summaryOffDays++;
            } else {
              summaryWorkingDays++;
            }

            if (status === 'PRESENT' || status === 'WORKED_ON_HOLIDAY') {
              summaryPresent++;
            } else if (status === 'LATE') {
              summaryLate++;
            } else if (status === 'HALF_DAY') {
              summaryHalfDay++;
            } else if (status === 'ABSENT') {
              summaryAbsent++;
            } else if (status === 'LEAVE') {
              summaryLeave++;
            }

            const record = {
              id: att?.id || `calendar-${emp.id}-${dateStr}`,
              employeeId: emp.id,
              employee: {
                id: emp.id,
                displayName: emp.displayName,
                firstName: emp.firstName,
                lastName: emp.lastName,
                employeeCode: emp.employeeCode,
              },
              attendanceDate: dateStr,
              status,
              workMode: att?.workMode || (status === 'OFF' || status === 'HOLIDAY' ? 'OFFICE' : 'OFFICE'),
              verificationMethod: att?.verificationMethod || 'MANUAL',
              checkInAt: att?.checkInAt ? new Date(att.checkInAt).toISOString() : null,
              checkOutAt: att?.checkOutAt ? new Date(att.checkOutAt).toISOString() : null,
              totalWorkMinutes: att?.totalWorkMinutes || null,
              isWorkingDay: evalResult.isWorkingDay,
              holidayName: evalResult.holidayName || null,
              leaveType: matchingLeave?.leaveType?.name || null,
              leaveReason: matchingLeave?.reason || null,
              notes: att?.notes || null,
              isDerived: !att,
            };

            allRecords.push(record);
          }
        }

        // Filter by status if specified
        let filteredRecords = allRecords;
        if (statusFilter && statusFilter.toUpperCase() !== 'ALL') {
          const normFilter = statusFilter.toUpperCase();
          filteredRecords = allRecords.filter((r) => {
            if (normFilter === 'LEAVE') return r.status === 'LEAVE' || r.status === 'ON_LEAVE';
            if (normFilter === 'OFF') return r.status === 'OFF' || r.status === 'WEEKEND';
            return r.status === normFilter;
          });
        }

        // Sort descending by attendance date, then employee name
        filteredRecords.sort((a, b) => {
          if (b.attendanceDate !== a.attendanceDate) {
            return b.attendanceDate.localeCompare(a.attendanceDate);
          }
          return (a.employee?.displayName || '').localeCompare(b.employee?.displayName || '');
        });

        return {
          records: filteredRecords,
          summary: {
            totalDays: dateStrings.length * targetEmployees.length,
            workingDays: summaryWorkingDays,
            present: summaryPresent,
            late: summaryLate,
            halfDay: summaryHalfDay,
            absent: summaryAbsent,
            leave: summaryLeave,
            holidays: summaryHolidays,
            offDays: summaryOffDays,
          },
        };
      },
      async () => {
        // Supabase REST Fallback
        let empQueryFilter = '';
        let fkFilter = '';
        if (employeeId) {
          if (Array.isArray(employeeId)) {
            empQueryFilter = `id=in.(${employeeId.join(',')})&`;
            fkFilter = `employee_id=in.(${employeeId.join(',')})&`;
          } else {
            empQueryFilter = `id=eq.${employeeId}&`;
            fkFilter = `employee_id=eq.${employeeId}&`;
          }
        }

        const [employees, rawAttendances, rawLeaves] = await Promise.all([
          employeeId
            ? DbService.restRequest<any[]>(`/employees?${empQueryFilter}select=id,display_name,first_name,last_name,employee_code`)
            : DbService.restRequest<any[]>('/employees?employment_status=eq.ACTIVE&select=id,display_name,first_name,last_name,employee_code,user:users(role)'),
          DbService.restRequest<any[]>(
            `/attendance?${fkFilter}attendance_date=gte.${startStr}&attendance_date=lte.${endStr}&select=*,employee:employees(id,display_name,first_name,last_name,employee_code)&order=attendance_date.desc`
          ),
          DbService.restRequest<any[]>(
            `/leave_requests?${fkFilter}status=eq.APPROVED&start_date=lte.${endStr}&end_date=gte.${startStr}&select=*,leave_type:leave_types(id,name)`
          ),
        ]);

        const activeEmployees = (employees || []).filter((e: any) => employeeId || e.user?.role !== 'SUPER_ADMIN');
        const targetEmpIds = activeEmployees.map((e: any) => e.id);

        const evaluations = await WorkdayService.evaluateDateRange(
          targetEmpIds,
          startStr,
          endStr
        );

        const attMap = new Map<string, Map<string, any>>();
        for (const a of rawAttendances || []) {
          const empId = a.employeeId || a.employee_id;
          if (!empId) continue;
          if (!attMap.has(empId)) attMap.set(empId, new Map());
          const rawDate = a.attendanceDate || a.attendance_date;
          const dStr = typeof rawDate === 'string' ? rawDate.slice(0, 10) : DateTimeUtil.formatDateString(rawDate);
          if (dStr) {
            attMap.get(empId)!.set(dStr, DbService.toCamelCase(a));
          }
        }

        const leaveMap = new Map<string, any[]>();
        for (const l of rawLeaves || []) {
          const empId = l.employeeId || l.employee_id;
          if (!empId) continue;
          if (!leaveMap.has(empId)) leaveMap.set(empId, []);
          leaveMap.get(empId)!.push(DbService.toCamelCase(l));
        }

        const dateStrings: string[] = [];
        let curr = new Date(startObj);
        while (curr <= endObj) {
          dateStrings.push(DateTimeUtil.formatDateString(curr));
          curr = new Date(curr.getTime() + 86400000);
        }

        const allRecords: any[] = [];
        let summaryWorkingDays = 0;
        let summaryPresent = 0;
        let summaryLate = 0;
        let summaryHalfDay = 0;
        let summaryAbsent = 0;
        let summaryLeave = 0;
        let summaryHolidays = 0;
        let summaryOffDays = 0;

        for (const emp of activeEmployees) {
          const empDays = evaluations.get(emp.id) || new Map<string, any>();
          const empAtts = attMap.get(emp.id) || new Map<string, any>();
          const empLeaves = leaveMap.get(emp.id) || [];

          for (const dateStr of dateStrings) {
            const evalResult = empDays.get(dateStr) || { isWorkingDay: true, isHoliday: false, isWeekend: false };
            const att = empAtts.get(dateStr);

            const matchingLeave = empLeaves.find((l) => {
              const rawStart = l.startDate || l.start_date;
              const rawEnd = l.endDate || l.end_date;
              const lStart = typeof rawStart === 'string' ? rawStart.slice(0, 10) : DateTimeUtil.formatDateString(rawStart);
              const lEnd = typeof rawEnd === 'string' ? rawEnd.slice(0, 10) : DateTimeUtil.formatDateString(rawEnd);
              return Boolean(lStart && lEnd && dateStr >= lStart && dateStr <= lEnd);
            });

            let status: AttendanceStatus | 'LEAVE' | 'OFF';
            if (evalResult.isHoliday) {
              status = att?.checkInAt ? (att.status === 'WORKED_ON_HOLIDAY' ? 'WORKED_ON_HOLIDAY' : 'WORKED_ON_HOLIDAY') : 'HOLIDAY';
            } else if (!evalResult.isWorkingDay) {
              status = att?.checkInAt ? att.status : 'OFF';
            } else if (matchingLeave) {
              status = 'LEAVE';
            } else if (att?.checkInAt) {
              status = att.status;
            } else {
              status = 'ABSENT';
            }

            if (evalResult.isHoliday) {
              summaryHolidays++;
            } else if (!evalResult.isWorkingDay) {
              summaryOffDays++;
            } else {
              summaryWorkingDays++;
            }

            if (status === 'PRESENT' || status === 'WORKED_ON_HOLIDAY') {
              summaryPresent++;
            } else if (status === 'LATE') {
              summaryLate++;
            } else if (status === 'HALF_DAY') {
              summaryHalfDay++;
            } else if (status === 'ABSENT') {
              summaryAbsent++;
            } else if (status === 'LEAVE') {
              summaryLeave++;
            }

            allRecords.push({
              id: att?.id || `calendar-${emp.id}-${dateStr}`,
              employeeId: emp.id,
              employee: {
                id: emp.id,
                displayName: emp.displayName || emp.display_name,
                firstName: emp.firstName || emp.first_name,
                lastName: emp.lastName || emp.last_name,
                employeeCode: emp.employeeCode || emp.employee_code,
              },
              attendanceDate: dateStr,
              status,
              workMode: att?.workMode || 'OFFICE',
              verificationMethod: att?.verificationMethod || 'MANUAL',
              checkInAt: att?.checkInAt || null,
              checkOutAt: att?.checkOutAt || null,
              totalWorkMinutes: att?.totalWorkMinutes || null,
              isWorkingDay: evalResult.isWorkingDay,
              holidayName: evalResult.holidayName || null,
              leaveType: matchingLeave?.leaveType?.name || null,
              leaveReason: matchingLeave?.reason || null,
              notes: att?.notes || null,
              isDerived: !att,
            });
          }
        }

        let filteredRecords = allRecords;
        if (statusFilter && statusFilter.toUpperCase() !== 'ALL') {
          const normFilter = statusFilter.toUpperCase();
          filteredRecords = allRecords.filter((r) => {
            if (normFilter === 'LEAVE') return r.status === 'LEAVE' || r.status === 'ON_LEAVE';
            if (normFilter === 'OFF') return r.status === 'OFF' || r.status === 'WEEKEND';
            return r.status === normFilter;
          });
        }

        filteredRecords.sort((a, b) => {
          if (b.attendanceDate !== a.attendanceDate) {
            return b.attendanceDate.localeCompare(a.attendanceDate);
          }
          return (a.employee?.displayName || '').localeCompare(b.employee?.displayName || '');
        });

        return {
          records: filteredRecords,
          summary: {
            totalDays: dateStrings.length * activeEmployees.length,
            workingDays: summaryWorkingDays,
            present: summaryPresent,
            late: summaryLate,
            halfDay: summaryHalfDay,
            absent: summaryAbsent,
            leave: summaryLeave,
            holidays: summaryHolidays,
            offDays: summaryOffDays,
          },
        };
      }
    );
  }

  /**
   * Overtime Confirmation (Part 13 & 14)
   * Stored server-authoritatively
   */
  public static async confirmOvertime(
    employeeId: string,
    userId: string,
    clientInfo?: { ipAddress?: string; userAgent?: string }
  ) {
    const todayStr = DateTimeUtil.getTodayDateString();
    const key = `overtime_${employeeId}_${todayStr}`;
    const now = new Date();

    const record = {
      employeeId,
      date: todayStr,
      confirmed: true,
      confirmedAt: now.toISOString(),
      userId,
    };

    await DbService.query(
      async () => {
        await prisma.systemSetting.upsert({
          where: { settingKey: key },
          create: {
            settingKey: key,
            settingValue: record,
            description: `Overtime confirmation for employee ${employeeId} on ${todayStr}`,
          },
          update: {
            settingValue: record,
            updatedAt: now,
          },
        });

        const att = await prisma.attendance.findUnique({
          where: {
            employeeId_attendanceDate: {
              employeeId,
              attendanceDate: new Date(todayStr),
            },
          },
        });
        if (att) {
          const updatedNotes = att.notes
            ? `${att.notes}\n[OVERTIME_CONFIRMED: ${now.toISOString()}]`
            : `[OVERTIME_CONFIRMED: ${now.toISOString()}]`;
          await prisma.attendance.update({
            where: { id: att.id },
            data: { notes: updatedNotes },
          });
        }

        await AuditService.log({
          userId,
          employeeId,
          action: 'UPDATE',
          entityType: 'attendance',
          entityId: att?.id || employeeId,
          description: `Overtime confirmed for ${todayStr}`,
          ipAddress: clientInfo?.ipAddress,
          userAgent: clientInfo?.userAgent,
        });

        return record;
      },
      async () => {
        const existing = await DbService.restRequest<any[]>(`/system_settings?setting_key=eq.${key}`);
        if (existing && existing.length > 0) {
          await DbService.restRequest(`/system_settings?setting_key=eq.${key}`, {
            method: 'PATCH',
            body: {
              setting_value: record,
              updated_at: now.toISOString(),
            },
          });
        } else {
          await DbService.restRequest(`/system_settings`, {
            method: 'POST',
            body: {
              setting_key: key,
              setting_value: record,
              description: `Overtime confirmation for employee ${employeeId} on ${todayStr}`,
            },
          });
        }
        return record;
      }
    );

    return { success: true, overtimeConfirmed: true, date: todayStr };
  }

  /**
   * Check if overtime is confirmed for an employee on a given date
   */
  public static async isOvertimeConfirmed(employeeId: string, dateStr: string): Promise<boolean> {
    const key = `overtime_${employeeId}_${dateStr}`;
    return DbService.query(
      async () => {
        const setting = await prisma.systemSetting.findUnique({
          where: { settingKey: key },
        });
        if (setting) {
          const val = typeof setting.settingValue === 'string' ? JSON.parse(setting.settingValue) : setting.settingValue;
          if (val && (val.confirmed === true || val.overtimeConfirmed === true)) {
            return true;
          }
        }
        const att = await prisma.attendance.findUnique({
          where: {
            employeeId_attendanceDate: {
              employeeId,
              attendanceDate: new Date(dateStr),
            },
          },
        });
        if (att && att.notes && att.notes.includes('[OVERTIME_CONFIRMED')) {
          return true;
        }
        return false;
      },
      async () => {
        const settings = await DbService.restRequest<any[]>(`/system_settings?setting_key=eq.${key}`);
        const item = settings?.[0];
        if (item) {
          const rawVal = item.setting_value ?? item.settingValue;
          const val = typeof rawVal === 'string' ? JSON.parse(rawVal) : rawVal;
          if (val && (val.confirmed === true || val.overtimeConfirmed === true)) return true;
        }
        const atts = await DbService.restRequest<any[]>(`/attendance?employee_id=eq.${employeeId}&attendance_date=eq.${dateStr}`);
        const notes = atts?.[0]?.notes;
        if (notes && notes.includes('[OVERTIME_CONFIRMED')) return true;
        return false;
      }
    );
  }

  /**
   * Auto-stop running task timers & Auto-checkout attendance at business date rollover (Asia/Kolkata)
   */
  public static async processDateRolloverAutoCheckout() {
    const todayStr = DateTimeUtil.getTodayDateString();
    const todayDate = new Date(todayStr);

    return DbService.query(
      async () => {
        const openAttendances = await prisma.attendance.findMany({
          where: {
            attendanceDate: { lt: todayDate },
            checkInAt: { not: null },
            checkOutAt: null,
          },
          include: {
            employee: true,
            sessions: true,
          },
        });

        const results: any[] = [];

        for (const att of openAttendances) {
          const empId = att.employeeId;
          const rawAttDate: any = att.attendanceDate;
          const attDateStr = typeof rawAttDate === 'string' ? rawAttDate.slice(0, 10) : DateTimeUtil.formatDateString(rawAttDate);
          const cutoffTime = new Date(`${attDateStr}T23:59:59.999+05:30`);

          // 1. Auto stop active task timers for this employee
          const activeTimers = await prisma.taskTimer.findMany({
            where: { employeeId: empId, isActive: true },
            include: { task: true },
          });

          for (const timer of activeTimers) {
            const timerStart = timer.startedAt;
            const stopAt = timerStart < cutoffTime ? cutoffTime : timerStart;
            const diff = Math.max(0, DateTimeUtil.diffSeconds(timerStart, stopAt));
            await prisma.taskTimer.update({
              where: { id: timer.id },
              data: {
                endedAt: stopAt,
                pausedAt: stopAt,
                durationSeconds: (timer.durationSeconds || 0) + diff,
                isActive: false,
              },
            });

            if (timer.task && timer.task.status === 'IN_PROGRESS') {
              await prisma.task.update({
                where: { id: timer.taskId },
                data: { status: 'PAUSED' },
              });
            }

            await AuditService.log({
              userId: att.employee.userId || empId,
              employeeId: empId,
              action: 'TASK_PAUSED',
              entityType: 'task',
              entityId: timer.taskId,
              description: `Task timer auto-stopped at midnight rollover for date ${attDateStr}`,
            });
          }

          // 2. Close active attendance sessions
          for (const s of att.sessions) {
            if (!s.endedAt) {
              const sStart = s.startedAt;
              const sEnd = sStart < cutoffTime ? cutoffTime : sStart;
              const sSec = Math.max(0, DateTimeUtil.diffSeconds(sStart, sEnd));
              await prisma.attendanceSession.update({
                where: { id: s.id },
                data: {
                  endedAt: sEnd,
                  durationMinutes: Math.floor(sSec / 60),
                },
              });
            }
          }

          // 3. Compute total work minutes
          const allSessions = await prisma.attendanceSession.findMany({
            where: { attendanceId: att.id },
          });
          let totalMinutes = 0;
          for (const s of allSessions) {
            totalMinutes += s.durationMinutes || 0;
          }
          if (totalMinutes === 0 && att.checkInAt) {
            totalMinutes = Math.floor(Math.max(0, DateTimeUtil.diffSeconds(att.checkInAt, cutoffTime)) / 60);
          }

          // 4. Determine status & Holiday Earned Leave
          const workday = await WorkdayService.evaluateDayForEmployee(empId, attDateStr);
          const isHolidayWork = workday.isHoliday || att.notes?.includes('[WORKED_ON_HOLIDAY]');
          let finalStatus: AttendanceStatus = att.status;

          if (isHolidayWork) {
            finalStatus = 'WORKED_ON_HOLIDAY';
            if (totalMinutes >= 390) {
              await LeaveService.creditEarnedLeaveForHolidayWork(empId, attDateStr, 1.0, att.employee.userId || empId, totalMinutes);
            } else if (totalMinutes >= 240) {
              await LeaveService.creditEarnedLeaveForHolidayWork(empId, attDateStr, 0.5, att.employee.userId || empId, totalMinutes);
            }
          } else {
            if (totalMinutes < 390 && (att.status === 'PRESENT' || att.status === 'LATE')) {
              finalStatus = 'HALF_DAY';
            }
          }

          const dbStatus = (finalStatus === 'WORKED_ON_HOLIDAY' ? 'PRESENT' : finalStatus) as any;

          // 5. Update attendance record
          await prisma.attendance.update({
            where: { id: att.id },
            data: {
              checkOutAt: cutoffTime,
              totalWorkMinutes: totalMinutes,
              status: dbStatus,
              notes: att.notes ? `${att.notes}\n[AUTO_CHECKOUT_DATE_ROLLOVER: ${cutoffTime.toISOString()}]` : `[AUTO_CHECKOUT_DATE_ROLLOVER: ${cutoffTime.toISOString()}]`,
            },
          });

          await AuditService.log({
            userId: att.employee.userId || empId,
            employeeId: empId,
            action: 'ATTENDANCE_CHECK_OUT',
            entityType: 'attendance',
            entityId: att.id,
            description: `Auto-checkout at date rollover for ${attDateStr} (Total: ${totalMinutes} mins, Status: ${finalStatus})`,
          });

          results.push({
            employeeId: empId,
            attendanceDate: attDateStr,
            totalWorkMinutes: totalMinutes,
            status: finalStatus,
          });
        }

        return results;
      },
      async () => {
        const openAtts = await DbService.restRequest<any[]>(
          `/attendance?attendance_date=lt.${todayStr}&check_out_at=is.null&select=*,employee:employees(*)`
        );
        const results: any[] = [];
        for (const att of (openAtts || [])) {
          const empId = att.employee_id || att.employeeId;
          const rawDate = att.attendance_date || att.attendanceDate;
          const attDateStr = typeof rawDate === 'string' ? rawDate.slice(0, 10) : DateTimeUtil.formatDateString(rawDate);
          const cutoffTime = new Date(`${attDateStr}T23:59:59.999+05:30`);

          const activeTimers = await DbService.restRequest<any[]>(
            `/task_timers?employee_id=eq.${empId}&is_active=eq.true`
          );
          for (const t of (activeTimers || [])) {
            await DbService.restRequest(`/task_timers?id=eq.${t.id}`, {
              method: 'PATCH',
              body: {
                is_active: false,
                ended_at: cutoffTime.toISOString(),
                paused_at: cutoffTime.toISOString(),
              },
            });
          }

          await DbService.restRequest(`/attendance?id=eq.${att.id}`, {
            method: 'PATCH',
            body: {
              check_out_at: cutoffTime.toISOString(),
              total_work_minutes: 480,
            },
          });
          results.push({ employeeId: empId, attendanceDate: attDateStr });
        }
        return results;
      }
    );
  }

  /**
   * Reconcile running timers when attendance is checked out or not active
   */
  public static async reconcileMismatchedTimers() {
    const todayStr = DateTimeUtil.getTodayDateString();
    const now = new Date();

    return DbService.query(
      async () => {
        const activeTimers = await prisma.taskTimer.findMany({
          where: { isActive: true },
          include: {
            employee: true,
            task: true,
          },
        });

        const reconciled: any[] = [];

        for (const timer of activeTimers) {
          const empId = timer.employeeId;
          const att = await prisma.attendance.findUnique({
            where: {
              employeeId_attendanceDate: {
                employeeId: empId,
                attendanceDate: new Date(todayStr),
              },
            },
          });

          // Mismatch: No attendance checkin OR attendance is checked out
          if (!att || !att.checkInAt || att.checkOutAt) {
            const stopAt = att?.checkOutAt || now;
            const diff = Math.max(0, DateTimeUtil.diffSeconds(timer.startedAt, stopAt));

            await prisma.taskTimer.update({
              where: { id: timer.id },
              data: {
                endedAt: stopAt,
                pausedAt: stopAt,
                durationSeconds: (timer.durationSeconds || 0) + diff,
                isActive: false,
              },
            });

            if (timer.task && timer.task.status === 'IN_PROGRESS') {
              await prisma.task.update({
                where: { id: timer.taskId },
                data: { status: 'PAUSED' },
              });
            }

            await AuditService.log({
              userId: timer.employee?.userId || empId,
              employeeId: empId,
              action: 'TASK_PAUSED',
              entityType: 'task',
              entityId: timer.taskId,
              description: `Timer reconciled (stopped) due to checked-out attendance state`,
            });

            reconciled.push({ timerId: timer.id, employeeId: empId });
          }
        }

        return reconciled;
      },
      async () => []
    );
  }
}


