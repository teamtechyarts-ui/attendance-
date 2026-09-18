import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';
import { DateTimeUtil } from '../../utils/datetime.js';
import { WorkdayService } from '../../services/workday.service.js';
import { AuditService } from '../../services/audit.service.js';
import { CheckInInput, CheckOutInput } from '../../validation/index.js';
import { LiveEmployeeActivity, AdminDashboardMetrics, AttendanceStatus, WorkMode } from '../../types/index.js';

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

    // Determine status (LATE or PRESENT)
    let status: AttendanceStatus = 'PRESENT';
    if (workday.schedule?.workStartTime) {
      const scheduleMinutes = DateTimeUtil.timeToMinutes(workday.schedule.workStartTime);
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      const nowMinutes = currentHours * 60 + currentMinutes;
      // If checked in > 15 minutes after schedule start time
      if (nowMinutes > scheduleMinutes + 15) {
        status = 'LATE';
      }
    }

    return DbService.query(
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
          const attendance = existing
            ? await tx.attendance.update({
                where: { id: existing.id },
                data: {
                  status,
                  workMode: input.workMode as any,
                  verificationMethod: input.verificationMethod as any,
                  checkInAt: now,
                  checkInLatitude: input.latitude ? (input.latitude as any) : null,
                  checkInLongitude: input.longitude ? (input.longitude as any) : null,
                  deviceId: input.deviceId || null,
                  notes: input.notes || null,
                },
              })
            : await tx.attendance.create({
                data: {
                  employeeId,
                  attendanceDate: new Date(todayStr),
                  status,
                  workMode: input.workMode as any,
                  verificationMethod: input.verificationMethod as any,
                  checkInAt: now,
                  checkInLatitude: input.latitude ? (input.latitude as any) : null,
                  checkInLongitude: input.longitude ? (input.longitude as any) : null,
                  deviceId: input.deviceId || null,
                  notes: input.notes || null,
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

          if (process.env.NODE_ENV !== 'production') {
            console.log(`[AttendanceService] checkIn: userId=${userId}, employeeId=${employeeId}, date=${todayStr}, attendanceId=${attendance.id}, status=${status}`);
          }

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

        if (process.env.NODE_ENV !== 'production') {
          console.log(`[AttendanceService] checkIn (REST): userId=${userId}, employeeId=${employeeId}, date=${todayStr}, attendanceId=${attendance.id}, status=${status}`);
        }

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

    return DbService.query(
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

          const updated = await tx.attendance.update({
            where: { id: attendance.id },
            data: {
              checkOutAt: now,
              totalWorkMinutes,
              checkOutLatitude: input.latitude ? (input.latitude as any) : null,
              checkOutLongitude: input.longitude ? (input.longitude as any) : null,
              notes: input.notes ? `${attendance.notes || ''}\n${input.notes}`.trim() : attendance.notes,
            },
          });

          if (process.env.NODE_ENV !== 'production') {
            console.log(`[AttendanceService] checkOut: userId=${userId}, employeeId=${employeeId}, date=${todayStr}, attendanceId=${attendance.id}, totalWorkMinutes=${totalWorkMinutes}, timersAutoStopped=${timersAutoStopped}`);
          }

          await AuditService.log({
            userId,
            employeeId,
            action: 'ATTENDANCE_CHECK_OUT',
            entityType: 'attendance',
            entityId: attendance.id,
            description: `Checked out for ${todayStr} (Duration: ${totalWorkMinutes} mins, Timers stopped: ${timersAutoStopped})`,
            ipAddress: clientInfo.ipAddress,
            userAgent: clientInfo.userAgent,
          });

          return {
            ...updated,
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

        const updated = await DbService.restRequest(`/attendance?id=eq.${attendance.id}`, {
          method: 'PATCH',
          body: {
            check_out_at: now.toISOString(),
            total_work_minutes: totalWorkMinutes,
          },
        });

        if (process.env.NODE_ENV !== 'production') {
          console.log(`[AttendanceService] checkOut (REST): userId=${userId}, employeeId=${employeeId}, date=${todayStr}, attendanceId=${attendance.id}, totalWorkMinutes=${totalWorkMinutes}, timersAutoStopped=${timersAutoStopped}`);
        }

        await AuditService.log({
          userId,
          employeeId,
          action: 'ATTENDANCE_CHECK_OUT',
          entityType: 'attendance',
          entityId: attendance.id,
          description: `Checked out for ${todayStr} (Duration: ${totalWorkMinutes} mins, Timers stopped: ${timersAutoStopped})`,
          ipAddress: clientInfo.ipAddress,
          userAgent: clientInfo.userAgent,
        });

        return {
          ...updated[0],
          timersAutoStopped,
        };
      }
    );
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
            where: { employmentStatus: 'ACTIVE' },
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
                  timers: {
                    where: { isActive: true },
                    take: 1,
                  },
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
          const runningTask = emp.tasks.find((t) => t.timers && t.timers.length > 0 && t.timers[0].isActive) || emp.tasks[0];
          const activeTimer = runningTask?.timers?.[0];

          let elapsedSeconds = 0;
          if (activeTimer) {
            const startedAt = new Date(activeTimer.startedAt);
            elapsedSeconds = (activeTimer.durationSeconds || 0) + DateTimeUtil.diffSeconds(startedAt, new Date());
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
        const [employees, attendances, leaves, tasks] = await Promise.all([
          DbService.restRequest<any[]>(
            `/employees?employment_status=eq.ACTIVE&select=*,department:departments(*),designation:designations(*)`
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

          let elapsedSeconds = 0;
          if (activeTimer) {
            const startedAtStr = activeTimer.startedAt || activeTimer.started_at;
            const dur = activeTimer.durationSeconds ?? activeTimer.duration_seconds ?? 0;
            if (startedAtStr) {
              elapsedSeconds = dur + DateTimeUtil.diffSeconds(startedAtStr, new Date());
            }
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
            where: { employmentStatus: 'ACTIVE' },
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
          DbService.restRequest<any[]>('/employees?employment_status=eq.ACTIVE&select=id'),
          DbService.restRequest<any[]>(`/attendance?attendance_date=eq.${todayStr}&select=*`),
          DbService.restRequest<any[]>(`/leave_requests?status=eq.APPROVED&start_date=lte.${todayStr}&end_date=gte.${todayStr}&select=employee_id`),
          DbService.restRequest<any[]>('/tasks?status=in.(TODO,IN_PROGRESS,PAUSED)&select=id'),
          DbService.restRequest<any[]>('/tasks?status=eq.COMPLETED&select=id'),
          DbService.restRequest<any[]>('/leave_requests?status=eq.PENDING&select=id'),
          DbService.restRequest<any[]>(`/daily_work_reports?report_date=eq.${todayStr}&select=id`),
        ]);

        const activeEmployees = employees || [];
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
   * Get attendance history for an employee
   */
  public static async getHistory(employeeId: string, year?: number, month?: number) {
    const now = new Date();
    const currentYear = year || now.getFullYear();
    const currentMonth = month || now.getMonth() + 1;

    const { startDate, endDate, startStr, endStr } = DateTimeUtil.getMonthDateRange(currentYear, currentMonth);

    return DbService.query(
      async () => {
        return await prisma.attendance.findMany({
          where: {
            employeeId,
            attendanceDate: {
              gte: startDate,
              lte: endDate,
            },
          },
          orderBy: { attendanceDate: 'desc' },
        });
      },
      async () => {
        return await DbService.restRequest<any[]>(
          `/attendance?employee_id=eq.${employeeId}&attendance_date=gte.${startStr}&attendance_date=lte.${endStr}&order=attendance_date.desc`
        );
      }
    );
  }
}
