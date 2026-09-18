import { randomUUID } from 'crypto';
import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';
import { DateTimeUtil } from '../../utils/datetime.js';
import { AuditService } from '../../services/audit.service.js';
import { EmailService } from '../../services/email.service.js';
import { taskAssignedTemplate, taskReminderTemplate } from '../email/email.templates.js';
import { config } from '../../config/env.js';
import { EmployeeService } from '../employees/employee.service.js';
import { CreateTaskInput, UpdateTaskInput, CreateTaskCommentInput, CreateTaskMentionInput } from '../../validation/index.js';
import { AuthUser, TaskStatus, TaskPriority, TaskSource } from '../../types/index.js';

export class TaskService {
  /**
   * Helper: Stored comments in system_settings fallback
   */
  private static async getStoredTaskComments(): Promise<any[]> {
    try {
      const settings = await DbService.restRequest<any[]>('/system_settings?setting_key=eq.workos_task_comments&select=*');
      if (settings && settings.length > 0 && settings[0].settingValue) {
        return (typeof settings[0].settingValue === 'string' ? JSON.parse(settings[0].settingValue) : settings[0].settingValue) || [];
      }
    } catch {}
    return [];
  }

  private static async saveStoredTaskComments(comments: any[]): Promise<void> {
    const now = new Date().toISOString();
    try {
      const existing = await DbService.restRequest<any[]>('/system_settings?setting_key=eq.workos_task_comments&select=*');
      if (existing && existing.length > 0) {
        await DbService.restRequest(`/system_settings?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          body: { setting_value: comments, updated_at: now },
        });
      } else {
        await DbService.restRequest('/system_settings', {
          method: 'POST',
          body: {
            setting_key: 'workos_task_comments',
            setting_value: comments,
            description: 'WorkOS Task Comments and Mentions',
            is_public: false,
          },
        });
      }
    } catch {}
  }
  /**
   * Helper: Calculate total worked seconds for a task from all its timer intervals
   */
  public static calculateTaskWorkedSeconds(
    timers: Array<{ durationSeconds?: number | null; startedAt: Date | string; isActive: boolean }>,
    now = new Date()
  ): number {
    if (!timers || timers.length === 0) return 0;
    return timers.reduce((acc, t) => {
      const closedDuration = t.durationSeconds || 0;
      if (t.isActive) {
        const runningDuration = Math.max(0, DateTimeUtil.diffSeconds(t.startedAt, now));
        return acc + closedDuration + runningDuration;
      }
      return acc + closedDuration;
    }, 0);
  }

  /**
   * List Tasks with filtering, search, project filter, and accurate time calculation
   */
  public static async listTasks(params: {
    employeeId?: string;
    projectId?: string;
    status?: string;
    priority?: string;
    search?: string;
    user: AuthUser;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 50));
    const skip = (page - 1) * limit;
    const now = new Date();

    return DbService.query(
      async () => {
        const where: any = {};

        const targetEmpId =
          params.user.role === 'EMPLOYEE' && !params.projectId
            ? params.user.employeeId
            : params.employeeId &&
              params.employeeId !== 'undefined' &&
              params.employeeId !== 'null' &&
              params.employeeId.trim() !== ''
            ? params.employeeId
            : undefined;

        if (targetEmpId) {
          where.employeeId = targetEmpId;
        }

        if (params.projectId && params.projectId !== 'undefined' && params.projectId !== 'null' && params.projectId.trim() !== '') {
          where.projectId = params.projectId;
        }

        if (params.status && params.status !== 'ALL') where.status = params.status;
        if (params.priority && params.priority !== 'ALL') where.priority = params.priority;
        if (params.search && params.search.trim() !== '') {
          where.OR = [
            { title: { contains: params.search, mode: 'insensitive' } },
            { description: { contains: params.search, mode: 'insensitive' } },
          ];
        }

        const [tasks, total] = await Promise.all([
          prisma.task.findMany({
            where,
            include: {
              employee: { select: { id: true, displayName: true, firstName: true, lastName: true, profilePhotoUrl: true } },
              creator: { select: { id: true, email: true } },
              project: { select: { id: true, name: true, status: true } },
              timers: { orderBy: { startedAt: 'desc' } },
              mentions: {
                include: {
                  mentionedEmployee: { select: { id: true, displayName: true, firstName: true, lastName: true } },
                },
              },
            },
            orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
            skip,
            take: limit,
          }),
          prisma.task.count({ where }),
        ]);

        const formatted = tasks.map((task) => {
          const activeTimer = task.timers.find((t) => t.isActive) || null;
          const totalDuration = TaskService.calculateTaskWorkedSeconds(task.timers, now);

          return {
            ...task,
            startDate: task.startDate ? task.startDate.toISOString().split('T')[0] : null,
            dueDate: task.dueDate ? task.dueDate.toISOString().split('T')[0] : null,
            completedAt: task.completedAt ? task.completedAt.toISOString() : null,
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString(),
            activeTimer,
            totalDurationSeconds: totalDuration,
            totalWorkMinutes: Math.floor(totalDuration / 60),
          };
        });

        return {
          items: formatted,
          meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        };
      },
      async () => {
        let path = `/tasks?select=*,employee:employees(id,display_name,first_name,last_name,profile_photo_url),timers:task_timers(*)`;
        if (params.user.role === 'EMPLOYEE' && params.user.employeeId && !params.projectId) {
          path += `&employee_id=eq.${params.user.employeeId}`;
        } else if (params.employeeId && params.employeeId !== 'undefined' && params.employeeId !== 'null' && params.employeeId.trim() !== '') {
          path += `&employee_id=eq.${params.employeeId}`;
        }
        if (params.status && params.status !== 'ALL') path += `&status=eq.${params.status}`;

        let tasks: any[] = [];
        try {
          if (params.projectId && params.projectId !== 'undefined' && params.projectId !== 'null' && params.projectId.trim() !== '') {
            tasks = await DbService.restRequest<any[]>(`${path}&project_id=eq.${params.projectId}`);
          } else {
            tasks = await DbService.restRequest<any[]>(path);
          }
        } catch {
          // If project_id query parameter is not supported by postgrest schema
          tasks = await DbService.restRequest<any[]>(path);
        }

        const formatted = (tasks || []).map((task) => {
          const rawTimers = task.timers || [];
          const timers = rawTimers.map((t: any) => ({
            id: t.id,
            taskId: t.taskId || t.task_id,
            employeeId: t.employeeId || t.employee_id,
            startedAt: t.startedAt || t.started_at,
            pausedAt: t.pausedAt || t.paused_at || null,
            endedAt: t.endedAt || t.ended_at || null,
            durationSeconds: t.durationSeconds ?? t.duration_seconds ?? 0,
            isActive: t.isActive ?? t.is_active ?? false,
            createdAt: t.createdAt || t.created_at,
          }));

          const activeTimer = timers.find((t: any) => t.isActive) || null;
          const totalDuration = TaskService.calculateTaskWorkedSeconds(timers, now);
          
          let projectId = task.projectId || task.project_id || null;
          if (!projectId && task.description) {
            const match = task.description.match(/\[Project:\s*([a-f0-9-]+)\]/i);
            if (match) projectId = match[1];
          }

          const rawEmp = task.employee;
          const employee = rawEmp
            ? {
                id: rawEmp.id,
                displayName:
                  rawEmp.displayName ||
                  rawEmp.display_name ||
                  `${rawEmp.firstName || rawEmp.first_name || ''} ${rawEmp.lastName || rawEmp.last_name || ''}`.trim() ||
                  'Assigned Employee',
                firstName: rawEmp.firstName || rawEmp.first_name || '',
                lastName: rawEmp.lastName || rawEmp.last_name || '',
                profilePhotoUrl: rawEmp.profilePhotoUrl || rawEmp.profile_photo_url || null,
              }
            : null;

          return {
            id: task.id,
            title: task.title,
            description: task.description || null,
            projectId,
            employeeId: task.employeeId || task.employee_id,
            createdBy: task.createdBy || task.created_by,
            source: task.source || 'SELF',
            status: task.status || 'TODO',
            priority: task.priority || 'MEDIUM',
            startDate: task.startDate || task.start_date || null,
            dueDate: task.dueDate || task.due_date || null,
            estimatedMinutes: task.estimatedMinutes || task.estimated_minutes || null,
            completedAt: task.completedAt || task.completed_at || null,
            progressPercentage: task.progressPercentage ?? task.progress_percentage ?? (task.status === 'COMPLETED' ? 100 : 0),
            reminderEnabled: task.reminderEnabled ?? task.reminder_enabled ?? false,
            reminderAt: task.reminderAt || task.reminder_at || null,
            googleCalendarEventId: task.googleCalendarEventId || task.google_calendar_event_id || null,
            createdAt: task.createdAt || task.created_at,
            updatedAt: task.updatedAt || task.updated_at,
            employee,
            timers,
            activeTimer,
            totalDurationSeconds: totalDuration,
            totalWorkMinutes: Math.floor(totalDuration / 60),
          };
        });

        const filtered = params.projectId
          ? formatted.filter((t) => t.projectId === params.projectId)
          : formatted;

        return {
          items: filtered,
          meta: { page: 1, limit: filtered.length, total: filtered.length, totalPages: 1 },
        };
      }
    );
  }

  /**
   * Get Task by ID with all timer sessions, project, comments, and mentions
   */
  public static async getTaskById(id: string, user: AuthUser) {
    const now = new Date();

    return DbService.query(
      async () => {
        const task = await prisma.task.findUnique({
          where: { id },
          include: {
            employee: true,
            creator: { select: { id: true, email: true } },
            project: { select: { id: true, name: true, status: true, createdBy: true } },
            timers: { orderBy: { startedAt: 'desc' } },
            comments: {
              include: {
                user: { select: { id: true, email: true } },
                mentions: {
                  include: {
                    mentionedEmployee: { select: { id: true, displayName: true, firstName: true, lastName: true } },
                  },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
            mentions: {
              include: {
                mentionedEmployee: { select: { id: true, displayName: true, firstName: true, lastName: true } },
              },
            },
          },
        });

        if (!task) {
          const err: any = new Error('Task not found');
          err.statusCode = 404;
          throw err;
        }

        // If employee user, verify task ownership, project membership, or mention
        if (user.role === 'EMPLOYEE') {
          const isAssignee = task.employeeId === user.employeeId;
          const isCreator = task.createdBy === user.id;
          const isMentioned = task.mentions.some((m) => m.mentionedEmployeeId === user.employeeId);

          if (!isAssignee && !isCreator && !isMentioned) {
            // Check if user is a member of the task's project
            if (task.projectId) {
              const membership = await prisma.projectMember.findUnique({
                where: {
                  projectId_employeeId: {
                    projectId: task.projectId,
                    employeeId: user.employeeId!,
                  },
                },
              });
              if (!membership) {
                const err: any = new Error('Forbidden');
                err.statusCode = 403;
                throw err;
              }
            } else {
              const err: any = new Error('Forbidden');
              err.statusCode = 403;
              throw err;
            }
          }
        }

        const activeTimer = task.timers.find((t) => t.isActive) || null;
        const totalDuration = TaskService.calculateTaskWorkedSeconds(task.timers, now);

        return {
          ...task,
          startDate: task.startDate ? task.startDate.toISOString().split('T')[0] : null,
          dueDate: task.dueDate ? task.dueDate.toISOString().split('T')[0] : null,
          completedAt: task.completedAt ? task.completedAt.toISOString() : null,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
          activeTimer,
          totalDurationSeconds: totalDuration,
          totalWorkMinutes: Math.floor(totalDuration / 60),
        };
      },
      async () => {
        const tasks = await DbService.restRequest<any[]>(
          `/tasks?id=eq.${id}&select=*,employee:employees(*),timers:task_timers(*),comments:task_comments(*)`
        );
        if (!tasks || tasks.length === 0) {
          const err: any = new Error('Task not found');
          err.statusCode = 404;
          throw err;
        }
        const task = tasks[0];
        const timers = task.timers || [];
        const activeTimer = timers.find((tm: any) => tm.isActive ?? tm.is_active) || null;
        const totalDuration = TaskService.calculateTaskWorkedSeconds(timers, now);
        return {
          ...task,
          activeTimer,
          totalDurationSeconds: totalDuration,
          totalWorkMinutes: Math.floor(totalDuration / 60),
        };
      }
    );
  }

  /**
   * Helper: Check if an employee is a member of a project
   */
  public static async isEmployeeInProject(projectId: string, employeeId: string): Promise<boolean> {
    try {
      const dbMember = await prisma.projectMember.findUnique({
        where: { projectId_employeeId: { projectId, employeeId } },
      });
      if (dbMember) return true;

      const dbProject = await prisma.project.findUnique({
        where: { id: projectId },
      });
      if (dbProject && (dbProject as any).employeeId === employeeId) return true;
    } catch {}

    try {
      const setting = await prisma.systemSetting.findUnique({
        where: { settingKey: 'workos_projects' },
      });
      const projects: any[] = (setting?.settingValue as any) || [];
      const proj = projects.find((p) => p.id === projectId);
      if (proj) {
        if (proj.employeeId === employeeId) return true;
        if (proj.members && Array.isArray(proj.members) && proj.members.some((m: any) => m.employeeId === employeeId)) {
          return true;
        }
      }
    } catch {}

    try {
      const settings = await DbService.restRequest<any[]>('/system_settings?setting_key=eq.workos_projects');
      const projects: any[] = settings?.[0]?.settingValue || [];
      const proj = projects.find((p) => p.id === projectId);
      if (proj) {
        if (proj.employeeId === employeeId) return true;
        if (proj.members && Array.isArray(proj.members) && proj.members.some((m: any) => m.employeeId === employeeId)) {
          return true;
        }
      }
    } catch {}

    return false;
  }

  /**
   * Create Task
   */
  public static async createTask(
    input: CreateTaskInput,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    let targetEmployeeId = input.employeeId;
    let source: TaskSource = 'SELF';

    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
      source = 'ADMIN';
      targetEmployeeId = input.employeeId || user.employeeId || undefined;
    } else if (user.role === 'MANAGER') {
      source = 'MANAGER';
      targetEmployeeId = input.employeeId || user.employeeId || undefined;
    } else {
      source = 'SELF';
      targetEmployeeId = input.employeeId || user.employeeId!;
    }

    if (!targetEmployeeId) {
      const err: any = new Error('Target employee ID is required');
      err.statusCode = 400;
      throw err;
    }

    // Verify assignee is active
    const { exists, isEligible } = await EmployeeService.getEmployeeEligibility(targetEmployeeId);
    if (!exists) {
      const err: any = new Error('Assignee employee not found');
      err.statusCode = 404;
      err.code = 'EMPLOYEE_NOT_FOUND';
      throw err;
    }
    if (!isEligible) {
      const err: any = new Error('Only active employees can be assigned new tasks.');
      err.statusCode = 400;
      err.code = 'EMPLOYEE_NOT_ACTIVE';
      throw err;
    }

    // Verify project membership if assigned under a project
    if (input.projectId) {
      const isMember = await TaskService.isEmployeeInProject(input.projectId, targetEmployeeId);
      if (!isMember) {
        const err: any = new Error('The selected employee is not a member of this project.');
        err.statusCode = 400;
        err.code = 'ASSIGNEE_NOT_PROJECT_MEMBER';
        throw err;
      }
    }

    return DbService.query(
      async () => {
        const task = await prisma.task.create({
          data: {
            title: input.title,
            description: input.description || null,
            projectId: input.projectId || null,
            employeeId: targetEmployeeId!,
            createdBy: user.id,
            source,
            status: 'TODO',
            priority: input.priority || 'MEDIUM',
            startDate: input.startDate ? new Date(input.startDate) : new Date(),
            dueDate: input.dueDate ? new Date(input.dueDate) : null,
            estimatedMinutes: input.estimatedMinutes || null,
            reminderEnabled: input.reminderEnabled || false,
            reminderAt: input.reminderAt ? new Date(input.reminderAt) : null,
          },
          include: {
            employee: true,
            project: { select: { id: true, name: true, status: true } },
          },
        });

        // Handle mentions if provided
        if (input.mentionedEmployeeIds && Array.isArray(input.mentionedEmployeeIds)) {
          for (const empId of input.mentionedEmployeeIds) {
            try {
              await prisma.taskMention.create({
                data: {
                  taskId: task.id,
                  mentionedEmployeeId: empId,
                  mentionedBy: user.id,
                  context: 'TASK_DESCRIPTION',
                },
              });

              // Dispatch in-app notification to mentioned employee
              const emp = await prisma.employee.findUnique({ where: { id: empId }, select: { userId: true } });
              if (emp?.userId) {
                EmailService.createAndNotify({
                  userId: emp.userId,
                  type: 'TASK',
                  title: `Mentioned in Task: ${task.title}`,
                  message: `${user.displayName || user.email} mentioned you in task "${task.title}".`,
                  actionUrl: `/tasks?taskId=${task.id}`,
                }).catch((e) => console.error('[TaskService] Mention notification error:', e.message));
              }
            } catch (e) {
              // Ignore duplicates
            }
          }
        }

        await AuditService.log({
          userId: user.id,
          employeeId: targetEmployeeId,
          action: 'CREATE',
          entityType: 'task',
          entityId: task.id,
          description: `Created task "${task.title}" (Priority: ${task.priority})`,
          ipAddress: clientInfo.ipAddress,
          userAgent: clientInfo.userAgent,
        });

        // Dispatch in-app notification & task assignment email asynchronously
        if (task.employee?.userId && task.employeeId !== user.employeeId) {
          const empName = task.employee.displayName || `${task.employee.firstName} ${task.employee.lastName}`.trim();
          const emailTpl = taskAssignedTemplate({
            employeeName: empName,
            taskTitle: task.title,
            priority: task.priority,
            dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : undefined,
            assignedBy: user.email || 'Admin',
            taskUrl: `${config.corsOrigin}/tasks`,
          });

          EmailService.createAndNotify({
            userId: task.employee.userId,
            type: 'TASK',
            title: `New Task Assigned: ${task.title}`,
            message: `You have been assigned a new task: "${task.title}" (Priority: ${task.priority}).`,
            actionUrl: `/tasks?taskId=${task.id}`,
            email: task.employee.email
              ? {
                  to: task.employee.email,
                  subject: emailTpl.subject,
                  html: emailTpl.html,
                  text: emailTpl.text,
                }
              : undefined,
          }).catch((err) => {
            console.error('[TaskService] Failed to dispatch task assignment notification:', err.message);
          });
        }

        return {
          ...task,
          startDate: task.startDate ? task.startDate.toISOString().split('T')[0] : null,
          dueDate: task.dueDate ? task.dueDate.toISOString().split('T')[0] : null,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
          totalDurationSeconds: 0,
          totalWorkMinutes: 0,
        };
      },
      async () => {
        let finalDescription = input.description || '';
        if (input.projectId && !finalDescription.includes(`[Project: ${input.projectId}]`)) {
          finalDescription = (finalDescription ? finalDescription + '\n\n' : '') + `[Project: ${input.projectId}]`;
        }

        let tasks: any[];
        try {
          tasks = await DbService.restRequest<any[]>('/tasks', {
            method: 'POST',
            body: {
              title: input.title,
              description: finalDescription || null,
              project_id: input.projectId || null,
              employee_id: targetEmployeeId,
              created_by: user.id,
              source,
              status: 'TODO',
              priority: input.priority || 'MEDIUM',
              start_date: input.startDate || null,
              due_date: input.dueDate || null,
              estimated_minutes: input.estimatedMinutes || null,
            },
          });
        } catch {
          // If project_id column does not exist on tasks table
          tasks = await DbService.restRequest<any[]>('/tasks', {
            method: 'POST',
            body: {
              title: input.title,
              description: finalDescription || null,
              employee_id: targetEmployeeId,
              created_by: user.id,
              source,
              status: 'TODO',
              priority: input.priority || 'MEDIUM',
              start_date: input.startDate || null,
              due_date: input.dueDate || null,
              estimated_minutes: input.estimatedMinutes || null,
            },
          });
        }

        const task = tasks[0];
        return {
          ...task,
          projectId: input.projectId || task.projectId || task.project_id || null,
          totalDurationSeconds: 0,
          totalWorkMinutes: 0,
        };
      }
    );
  }

  /**
   * Update Task
   */
  public static async updateTask(
    id: string,
    input: UpdateTaskInput,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    const now = new Date();

    return DbService.query(
      async () => {
        const existing = await prisma.task.findUnique({
          where: { id },
          include: { timers: true },
        });
        if (!existing) {
          const err: any = new Error('Task not found');
          err.statusCode = 404;
          throw err;
        }

        const isStaff = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'MANAGER';
        if (!isStaff && existing.employeeId !== user.employeeId && existing.createdBy !== user.id) {
          const err: any = new Error('Forbidden');
          err.statusCode = 403;
          throw err;
        }

        const data: any = {};
        if (input.title !== undefined) data.title = input.title;
        if (input.description !== undefined) data.description = input.description;
        if (input.projectId !== undefined) data.projectId = input.projectId;
        if (input.employeeId !== undefined && isStaff) data.employeeId = input.employeeId;
        if (input.priority !== undefined) data.priority = input.priority;
        if (input.progressPercentage !== undefined) data.progressPercentage = input.progressPercentage;
        if (input.status !== undefined) data.status = input.status;
        if (input.startDate !== undefined) data.startDate = input.startDate ? new Date(input.startDate) : null;
        if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
        if (input.estimatedMinutes !== undefined) data.estimatedMinutes = input.estimatedMinutes;
        if (input.reminderEnabled !== undefined) data.reminderEnabled = input.reminderEnabled;
        if (input.reminderAt !== undefined) data.reminderAt = input.reminderAt ? new Date(input.reminderAt) : null;

        // If transitioning to COMPLETED, close any running timer
        if (input.status === 'COMPLETED') {
          data.completedAt = now;
          data.progressPercentage = 100;

          // Close active timer if running
          const activeTimer = existing.timers.find((t) => t.isActive);
          if (activeTimer) {
            const diff = Math.max(0, DateTimeUtil.diffSeconds(activeTimer.startedAt, now));
            await prisma.taskTimer.update({
              where: { id: activeTimer.id },
              data: {
                endedAt: now,
                durationSeconds: (activeTimer.durationSeconds || 0) + diff,
                isActive: false,
              },
            });
          }
        } else if (input.status) {
          data.completedAt = null;
        }

        const updated = await prisma.task.update({
          where: { id },
          data,
          include: {
            employee: true,
            project: { select: { id: true, name: true, status: true } },
            timers: { orderBy: { startedAt: 'desc' } },
          },
        });

        // Handle mentions if updated
        if (input.mentionedEmployeeIds && Array.isArray(input.mentionedEmployeeIds)) {
          for (const empId of input.mentionedEmployeeIds) {
            try {
              await prisma.taskMention.create({
                data: {
                  taskId: id,
                  mentionedEmployeeId: empId,
                  mentionedBy: user.id,
                  context: 'TASK_DESCRIPTION',
                },
              });
            } catch (e) {
              // Ignore duplicate
            }
          }
        }

        const totalDuration = TaskService.calculateTaskWorkedSeconds(updated.timers, now);

        await AuditService.log({
          userId: user.id,
          employeeId: existing.employeeId,
          action: 'UPDATE',
          entityType: 'task',
          entityId: id,
          description: `Updated task "${updated.title}" (Status: ${updated.status})`,
          ipAddress: clientInfo.ipAddress,
          userAgent: clientInfo.userAgent,
        });

        return {
          ...updated,
          startDate: updated.startDate ? updated.startDate.toISOString().split('T')[0] : null,
          dueDate: updated.dueDate ? updated.dueDate.toISOString().split('T')[0] : null,
          completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
          totalDurationSeconds: totalDuration,
          totalWorkMinutes: Math.floor(totalDuration / 60),
        };
      },
      async () => {
        const res = await DbService.restRequest(`/tasks?id=eq.${id}`, {
          method: 'PATCH',
          body: input,
        });
        return res[0];
      }
    );
  }

  /**
   * Add Comment to Task with @mention support
   */
  public static async addComment(
    taskId: string,
    input: CreateTaskCommentInput,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    return DbService.query(
      async () => {
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: { employee: true },
        });

        if (!task) {
          const err: any = new Error('Task not found');
          err.statusCode = 404;
          throw err;
        }

        const comment = await prisma.taskComment.create({
          data: {
            taskId,
            userId: user.id,
            comment: input.comment.trim(),
          },
          include: {
            user: {
              select: { id: true, email: true, role: true },
            },
          },
        });

        // Process mentioned employees
        const mentionedIds = input.mentionedEmployeeIds || [];

        for (const empId of mentionedIds) {
          try {
            await prisma.taskMention.create({
              data: {
                taskId,
                mentionedEmployeeId: empId,
                mentionedBy: user.id,
                context: 'COMMENT',
                commentId: comment.id,
              },
            });

            const mentionedEmp = await prisma.employee.findUnique({
              where: { id: empId },
              select: { userId: true, email: true, displayName: true },
            });

            if (mentionedEmp?.userId && mentionedEmp.userId !== user.id) {
              const preview = input.comment.length > 80 ? `${input.comment.slice(0, 80)}...` : input.comment;
              EmailService.createAndNotify({
                userId: mentionedEmp.userId,
                type: 'TASK',
                title: `Mentioned in comment on "${task.title}"`,
                message: `${user.displayName || user.email}: "${preview}"`,
                actionUrl: `/tasks?taskId=${taskId}`,
              }).catch((e) => console.error('[TaskService] Comment mention notification error:', e.message));
            }
          } catch (e) {
            // Ignore duplicate mentions
          }
        }

        // Notify task assignee if someone else commented
        if (task.employee?.userId && task.employee.userId !== user.id && !mentionedIds.includes(task.employeeId)) {
          const preview = input.comment.length > 80 ? `${input.comment.slice(0, 80)}...` : input.comment;
          EmailService.createAndNotify({
            userId: task.employee.userId,
            type: 'TASK',
            title: `New comment on task "${task.title}"`,
            message: `${user.displayName || user.email}: "${preview}"`,
            actionUrl: `/tasks?taskId=${taskId}`,
          }).catch((e) => console.error('[TaskService] Task comment notification error:', e.message));
        }

        return await prisma.taskComment.findUnique({
          where: { id: comment.id },
          include: {
            user: { select: { id: true, email: true, role: true } },
            mentions: {
              include: {
                mentionedEmployee: { select: { id: true, displayName: true, firstName: true, lastName: true } },
              },
            },
          },
        });
      },
      async () => {
        const commentId = randomUUID();
        const now = new Date().toISOString();
        const mentionedIds = input.mentionedEmployeeIds || [];

        let userEmail = user.email || 'User';
        let userRole = user.role;

        let employees: any[] = [];
        try {
          employees = await DbService.restRequest<any[]>('/employees?select=id,display_name,first_name,last_name,user_id');
        } catch {}

        const empById = new Map<string, any>();
        for (const e of employees || []) {
          empById.set(e.id, e);
        }

        const hydratedMentions = mentionedIds.map((mId) => {
          const emp = empById.get(mId);
          return {
            id: randomUUID(),
            taskId,
            mentionedEmployeeId: mId,
            mentionedBy: user.id,
            context: 'COMMENT',
            commentId,
            createdAt: now,
            mentionedEmployee: emp
              ? { id: emp.id, displayName: emp.displayName, firstName: emp.firstName, lastName: emp.lastName }
              : null,
          };
        });

        const newComment = {
          id: commentId,
          taskId,
          userId: user.id,
          comment: input.comment.trim(),
          createdAt: now,
          updatedAt: now,
          user: { id: user.id, email: userEmail, role: userRole },
          mentions: hydratedMentions,
        };

        const allComments = await TaskService.getStoredTaskComments();
        allComments.push(newComment);
        await TaskService.saveStoredTaskComments(allComments);

        for (const mId of mentionedIds) {
          const emp = empById.get(mId);
          if (emp?.userId && emp.userId !== user.id) {
            const preview = input.comment.length > 80 ? `${input.comment.slice(0, 80)}...` : input.comment;
            EmailService.createAndNotify({
              userId: emp.userId,
              type: 'TASK',
              title: `Mentioned in comment on task`,
              message: `${user.displayName || user.email}: "${preview}"`,
              actionUrl: `/tasks?taskId=${taskId}`,
            }).catch(() => {});
          }
        }

        return newComment as any;
      }
    );
  }

  /**
   * List Comments on a Task
   */
  public static async listComments(taskId: string, user: AuthUser) {
    return DbService.query(
      async () => {
        return await prisma.taskComment.findMany({
          where: { taskId },
          include: {
            user: { select: { id: true, email: true, role: true } },
            mentions: {
              include: {
                mentionedEmployee: { select: { id: true, displayName: true, firstName: true, lastName: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        });
      },
      async () => {
        const allComments = await TaskService.getStoredTaskComments();
        return allComments.filter((c) => c.taskId === taskId) as any;
      }
    );
  }

  /**
   * Add Mention to Task
   */
  public static async addMention(
    taskId: string,
    input: CreateTaskMentionInput,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    return DbService.query(
      async () => {
        const task = await prisma.task.findUnique({ where: { id: taskId } });
        if (!task) {
          const err: any = new Error('Task not found');
          err.statusCode = 404;
          throw err;
        }

        const mention = await prisma.taskMention.create({
          data: {
            taskId,
            mentionedEmployeeId: input.mentionedEmployeeId,
            mentionedBy: user.id,
            context: input.context || 'COMMENT',
            commentId: input.commentId || null,
          },
          include: {
            mentionedEmployee: {
              select: { id: true, displayName: true, firstName: true, lastName: true, userId: true },
            },
          },
        });

        if (mention.mentionedEmployee?.userId && mention.mentionedEmployee.userId !== user.id) {
          EmailService.createAndNotify({
            userId: mention.mentionedEmployee.userId,
            type: 'TASK',
            title: `You were mentioned in task "${task.title}"`,
            message: `${user.displayName || user.email} mentioned you.`,
            actionUrl: `/tasks?taskId=${taskId}`,
          }).catch((e) => console.error('[TaskService] Mention notification error:', e.message));
        }

        return mention;
      },
      async () => {
        return {
          id: randomUUID(),
          taskId,
          mentionedEmployeeId: input.mentionedEmployeeId,
          mentionedBy: user.id,
          context: input.context || 'COMMENT',
          commentId: input.commentId || null,
          createdAt: new Date().toISOString(),
        } as any;
      }
    );
  }

  /**
   * List Mentions on a Task
   */
  public static async listMentions(taskId: string, user: AuthUser) {
    return DbService.query(
      async () => {
        return await prisma.taskMention.findMany({
          where: { taskId },
          include: {
            mentionedEmployee: { select: { id: true, displayName: true, firstName: true, lastName: true } },
            author: { select: { id: true, email: true } },
          },
          orderBy: { createdAt: 'asc' },
        });
      },
      async () => {
        const allComments = await TaskService.getStoredTaskComments();
        const taskComments = allComments.filter((c) => c.taskId === taskId);
        const mentions: any[] = [];
        for (const c of taskComments) {
          if (c.mentions && Array.isArray(c.mentions)) {
            mentions.push(...c.mentions);
          }
        }
        return mentions;
      }
    );
  }

  // ==========================================
  // ROBUST SERVER-AUTHORITATIVE TASK TIMER
  // ==========================================

  /**
   * Start / Resume Timer (Enforces 1 active timer per employee)
   */
  public static async startTimer(
    taskId: string,
    employeeId: string,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    const now = new Date();
    const todayStr = DateTimeUtil.getTodayDateString();

    return DbService.query(
      async () => {
        return await prisma.$transaction(async (tx) => {
          // 0. Verify employee attendance state
          const todayAtt = await tx.attendance.findUnique({
            where: {
              employeeId_attendanceDate: {
                employeeId,
                attendanceDate: new Date(todayStr),
              },
            },
          });

          if (!todayAtt || !todayAtt.checkInAt) {
            const err: any = new Error('You must check in to attendance before starting a task timer.');
            err.statusCode = 400;
            err.code = 'ATTENDANCE_NOT_CHECKED_IN';
            throw err;
          }

          if (todayAtt.checkOutAt) {
            const err: any = new Error('Cannot start or resume a task timer after checking out of attendance today.');
            err.statusCode = 400;
            err.code = 'ATTENDANCE_ALREADY_CHECKED_OUT';
            throw err;
          }

          // 1. Resolve task
          const task = await tx.task.findUnique({
            where: { id: taskId },
            include: { timers: true },
          });

          if (!task) {
            const err: any = new Error('Task not found');
            err.statusCode = 404;
            err.code = 'TASK_NOT_FOUND';
            throw err;
          }

          if (user.role === 'EMPLOYEE' && task.employeeId !== employeeId) {
            const err: any = new Error('Cannot start timer for another employee task');
            err.statusCode = 403;
            err.code = 'FORBIDDEN';
            throw err;
          }

          if (task.status === 'COMPLETED') {
            const err: any = new Error('Cannot start timer on a completed task');
            err.statusCode = 409;
            err.code = 'TASK_ALREADY_COMPLETED';
            throw err;
          }

          // 2. Check if timer is already running on THIS task (idempotency / double-click protection)
          const existingRunningTimer = task.timers.find((t) => t.isActive && t.employeeId === employeeId);
          if (existingRunningTimer) {
            const totalDuration = TaskService.calculateTaskWorkedSeconds(task.timers, now);
            return {
              timer: existingRunningTimer,
              task: {
                ...task,
                startDate: task.startDate ? task.startDate.toISOString().split('T')[0] : null,
                dueDate: task.dueDate ? task.dueDate.toISOString().split('T')[0] : null,
                totalDurationSeconds: totalDuration,
                totalWorkMinutes: Math.floor(totalDuration / 60),
              },
            };
          }

          // 3. Pause any other currently running timer for this employee across any task
          const otherActiveTimers = await tx.taskTimer.findMany({
            where: { employeeId, isActive: true },
          });

          for (const otherTimer of otherActiveTimers) {
            const diff = Math.max(0, DateTimeUtil.diffSeconds(otherTimer.startedAt, now));
            await tx.taskTimer.update({
              where: { id: otherTimer.id },
              data: {
                pausedAt: now,
                endedAt: now,
                durationSeconds: (otherTimer.durationSeconds || 0) + diff,
                isActive: false,
              },
            });
            if (otherTimer.taskId !== taskId) {
              await tx.task.update({
                where: { id: otherTimer.taskId },
                data: { status: 'PAUSED' },
              });
            }
          }

          // 4. Create new running timer interval
          const createdTimer = await tx.taskTimer.create({
            data: {
              taskId,
              employeeId,
              startedAt: now,
              durationSeconds: 0,
              isActive: true,
            },
          });

          // 5. Transition task status to IN_PROGRESS
          const updatedTask = await tx.task.update({
            where: { id: taskId },
            data: { status: 'IN_PROGRESS' },
            include: { timers: true },
          });

          const totalDuration = TaskService.calculateTaskWorkedSeconds(updatedTask.timers, now);

          await AuditService.log({
            userId: user.id,
            employeeId,
            action: 'TASK_STARTED',
            entityType: 'task',
            entityId: taskId,
            description: `Started timer on task "${task.title}"`,
            ipAddress: clientInfo.ipAddress,
            userAgent: clientInfo.userAgent,
          });

          return {
            timer: createdTimer,
            task: {
              ...updatedTask,
              startDate: updatedTask.startDate ? updatedTask.startDate.toISOString().split('T')[0] : null,
              dueDate: updatedTask.dueDate ? updatedTask.dueDate.toISOString().split('T')[0] : null,
              totalDurationSeconds: totalDuration,
              totalWorkMinutes: Math.floor(totalDuration / 60),
            },
          };
        });
      },
      async () => {
        // REST Fallback
        const todayAttendances = await DbService.restRequest<any[]>(
          `/attendance?employee_id=eq.${employeeId}&attendance_date=eq.${todayStr}`
        );
        const todayAtt = todayAttendances?.[0];
        const checkInAt = todayAtt ? (todayAtt.checkInAt || todayAtt.check_in_at) : null;
        const checkOutAt = todayAtt ? (todayAtt.checkOutAt || todayAtt.check_out_at) : null;

        if (!todayAtt || !checkInAt) {
          const err: any = new Error('You must check in to attendance before starting a task timer.');
          err.statusCode = 400;
          err.code = 'ATTENDANCE_NOT_CHECKED_IN';
          throw err;
        }

        if (checkOutAt) {
          const err: any = new Error('Cannot start or resume a task timer after checking out of attendance today.');
          err.statusCode = 400;
          err.code = 'ATTENDANCE_ALREADY_CHECKED_OUT';
          throw err;
        }

        const tasks = await DbService.restRequest<any[]>(`/tasks?id=eq.${taskId}&select=*,timers:task_timers(*)`);
        if (!tasks || tasks.length === 0) {
          const err: any = new Error('Task not found');
          err.statusCode = 404;
          throw err;
        }
        const task = tasks[0];
        if (task.status === 'COMPLETED') {
          const err: any = new Error('Cannot start timer on a completed task');
          err.statusCode = 409;
          err.code = 'TASK_ALREADY_COMPLETED';
          throw err;
        }

        const timers = await DbService.restRequest<any[]>('/task_timers', {
          method: 'POST',
          body: {
            task_id: taskId,
            employee_id: employeeId,
            started_at: now.toISOString(),
            duration_seconds: 0,
            is_active: true,
          },
        });

        await DbService.restRequest(`/tasks?id=eq.${taskId}`, {
          method: 'PATCH',
          body: { status: 'IN_PROGRESS' },
        });

        return {
          timer: timers[0],
          task: { ...task, status: 'IN_PROGRESS' },
        };
      }
    );
  }

  /**
   * Pause Timer
   */
  public static async pauseTimer(
    taskId: string,
    employeeId: string,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    const now = new Date();

    return DbService.query(
      async () => {
        return await prisma.$transaction(async (tx) => {
          const task = await tx.task.findUnique({
            where: { id: taskId },
            include: { timers: true },
          });

          if (!task) {
            const err: any = new Error('Task not found');
            err.statusCode = 404;
            err.code = 'TASK_NOT_FOUND';
            throw err;
          }

          if (user.role === 'EMPLOYEE' && task.employeeId !== employeeId) {
            const err: any = new Error('Forbidden');
            err.statusCode = 403;
            err.code = 'FORBIDDEN';
            throw err;
          }

          const runningTimer = task.timers.find((t) => t.isActive && t.employeeId === employeeId);
          if (runningTimer) {
            const diff = Math.max(0, DateTimeUtil.diffSeconds(runningTimer.startedAt, now));
            await tx.taskTimer.update({
              where: { id: runningTimer.id },
              data: {
                pausedAt: now,
                endedAt: now,
                durationSeconds: (runningTimer.durationSeconds || 0) + diff,
                isActive: false,
              },
            });
          }

          const updatedTask = await tx.task.update({
            where: { id: taskId },
            data: { status: 'PAUSED' },
            include: { timers: true },
          });

          const totalDuration = TaskService.calculateTaskWorkedSeconds(updatedTask.timers, now);

          await AuditService.log({
            userId: user.id,
            employeeId,
            action: 'TASK_PAUSED',
            entityType: 'task',
            entityId: taskId,
            description: `Paused timer on task "${task.title}"`,
            ipAddress: clientInfo.ipAddress,
            userAgent: clientInfo.userAgent,
          });

          return {
            task: {
              ...updatedTask,
              startDate: updatedTask.startDate ? updatedTask.startDate.toISOString().split('T')[0] : null,
              dueDate: updatedTask.dueDate ? updatedTask.dueDate.toISOString().split('T')[0] : null,
              totalDurationSeconds: totalDuration,
              totalWorkMinutes: Math.floor(totalDuration / 60),
            },
          };
        });
      },
      async () => {
        const activeTimers = await DbService.restRequest<any[]>(
          `/task_timers?task_id=eq.${taskId}&employee_id=eq.${employeeId}&is_active=eq.true`
        );
        if (activeTimers && activeTimers.length > 0) {
          const t = activeTimers[0];
          const diff = Math.max(0, DateTimeUtil.diffSeconds(t.startedAt || t.started_at, now));
          await DbService.restRequest(`/task_timers?id=eq.${t.id}`, {
            method: 'PATCH',
            body: {
              paused_at: now.toISOString(),
              ended_at: now.toISOString(),
              duration_seconds: (t.durationSeconds || t.duration_seconds || 0) + diff,
              is_active: false,
            },
          });
        }

        await DbService.restRequest(`/tasks?id=eq.${taskId}`, {
          method: 'PATCH',
          body: { status: 'PAUSED' },
        });

        const refreshed = await DbService.restRequest<any[]>(`/tasks?id=eq.${taskId}&select=*,timers:task_timers(*)`);
        const totalDuration = TaskService.calculateTaskWorkedSeconds(refreshed?.[0]?.timers || [], now);

        return {
          task: {
            ...refreshed[0],
            totalDurationSeconds: totalDuration,
            totalWorkMinutes: Math.floor(totalDuration / 60),
          },
        };
      }
    );
  }

  /**
   * Stop / Complete Timer & Task
   */
  public static async stopTimer(
    taskId: string,
    employeeId: string,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    const now = new Date();

    return DbService.query(
      async () => {
        return await prisma.$transaction(async (tx) => {
          const task = await tx.task.findUnique({
            where: { id: taskId },
            include: { timers: true },
          });

          if (!task) {
            const err: any = new Error('Task not found');
            err.statusCode = 404;
            err.code = 'TASK_NOT_FOUND';
            throw err;
          }

          if (user.role === 'EMPLOYEE' && task.employeeId !== employeeId) {
            const err: any = new Error('Forbidden');
            err.statusCode = 403;
            err.code = 'FORBIDDEN';
            throw err;
          }

          const runningTimer = task.timers.find((t) => t.isActive && t.employeeId === employeeId);
          if (runningTimer) {
            const diff = Math.max(0, DateTimeUtil.diffSeconds(runningTimer.startedAt, now));
            await tx.taskTimer.update({
              where: { id: runningTimer.id },
              data: {
                endedAt: now,
                durationSeconds: (runningTimer.durationSeconds || 0) + diff,
                isActive: false,
              },
            });
          }

          const updatedTask = await tx.task.update({
            where: { id: taskId },
            data: {
              status: 'COMPLETED',
              progressPercentage: 100,
              completedAt: now,
            },
            include: { timers: true },
          });

          const totalDuration = TaskService.calculateTaskWorkedSeconds(updatedTask.timers, now);

          await AuditService.log({
            userId: user.id,
            employeeId,
            action: 'TASK_COMPLETED',
            entityType: 'task',
            entityId: taskId,
            description: `Completed task "${task.title}" (Total Duration: ${Math.floor(totalDuration / 60)}m)`,
            ipAddress: clientInfo.ipAddress,
            userAgent: clientInfo.userAgent,
          });

          return {
            task: {
              ...updatedTask,
              startDate: updatedTask.startDate ? updatedTask.startDate.toISOString().split('T')[0] : null,
              dueDate: updatedTask.dueDate ? updatedTask.dueDate.toISOString().split('T')[0] : null,
              completedAt: updatedTask.completedAt ? updatedTask.completedAt.toISOString() : null,
              totalDurationSeconds: totalDuration,
              totalWorkMinutes: Math.floor(totalDuration / 60),
            },
          };
        });
      },
      async () => {
        const activeTimers = await DbService.restRequest<any[]>(
          `/task_timers?task_id=eq.${taskId}&employee_id=eq.${employeeId}&is_active=eq.true`
        );
        if (activeTimers && activeTimers.length > 0) {
          const t = activeTimers[0];
          const diff = Math.max(0, DateTimeUtil.diffSeconds(t.startedAt || t.started_at, now));
          const currentDur = t.durationSeconds || t.duration_seconds || 0;
          await DbService.restRequest(`/task_timers?id=eq.${t.id}`, {
            method: 'PATCH',
            body: {
              ended_at: now.toISOString(),
              duration_seconds: currentDur + diff,
              is_active: false,
            },
          });
        }

        await DbService.restRequest(`/tasks?id=eq.${taskId}`, {
          method: 'PATCH',
          body: {
            status: 'COMPLETED',
            progress_percentage: 100,
            completed_at: now.toISOString(),
          },
        });

        const refreshed = await DbService.restRequest<any[]>(`/tasks?id=eq.${taskId}&select=*,timers:task_timers(*)`);
        const totalDuration = TaskService.calculateTaskWorkedSeconds(refreshed?.[0]?.timers || [], now);

        return {
          task: {
            ...refreshed[0],
            totalDurationSeconds: totalDuration,
            totalWorkMinutes: Math.floor(totalDuration / 60),
          },
        };
      }
    );
  }

  /**
   * Get Active Running Timer for Employee with Prior Closed Interval Accumulation
   */
  public static async getActiveTimer(employeeId: string) {
    const now = new Date();
    const todayStr = DateTimeUtil.getTodayDateString();

    return DbService.query(
      async () => {
        // Check today's attendance state
        const todayAtt = await prisma.attendance.findUnique({
          where: {
            employeeId_attendanceDate: {
              employeeId,
              attendanceDate: new Date(todayStr),
            },
          },
        });

        // If employee is checked out today or not checked in, auto-finalize any orphan active timers and return null
        if (todayAtt?.checkOutAt || !todayAtt?.checkInAt) {
          const orphanActiveTimers = await prisma.taskTimer.findMany({
            where: { employeeId, isActive: true },
          });
          if (orphanActiveTimers.length > 0) {
            const finalizeTime = todayAtt?.checkOutAt ? new Date(todayAtt.checkOutAt) : now;
            for (const ot of orphanActiveTimers) {
              const diff = Math.max(0, DateTimeUtil.diffSeconds(ot.startedAt, finalizeTime));
              await prisma.taskTimer.update({
                where: { id: ot.id },
                data: {
                  endedAt: finalizeTime,
                  pausedAt: finalizeTime,
                  durationSeconds: (ot.durationSeconds || 0) + diff,
                  isActive: false,
                },
              });
              await prisma.task.updateMany({
                where: { id: ot.taskId, status: 'IN_PROGRESS' },
                data: { status: 'PAUSED' },
              });
            }
          }
          return null;
        }

        const activeTimer = await prisma.taskTimer.findFirst({
          where: { employeeId, isActive: true },
          include: { task: true },
          orderBy: { startedAt: 'desc' },
        });

        if (!activeTimer) return null;

        // Fetch all timer intervals for this task to compute prior closed duration
        const allTimers = await prisma.taskTimer.findMany({
          where: { taskId: activeTimer.taskId },
        });

        const priorClosedDurationSeconds = allTimers
          .filter((t) => t.id !== activeTimer.id)
          .reduce((acc, t) => acc + (t.durationSeconds || 0), 0);

        const currentRunningIntervalSeconds = Math.max(0, DateTimeUtil.diffSeconds(activeTimer.startedAt, now));
        const totalTaskDurationSeconds = priorClosedDurationSeconds + currentRunningIntervalSeconds;

        return {
          ...activeTimer,
          priorClosedDurationSeconds,
          currentRunningIntervalSeconds,
          currentElapsedSeconds: totalTaskDurationSeconds,
          task: {
            ...activeTimer.task,
            startDate: activeTimer.task.startDate ? activeTimer.task.startDate.toISOString().split('T')[0] : null,
            dueDate: activeTimer.task.dueDate ? activeTimer.task.dueDate.toISOString().split('T')[0] : null,
            totalDurationSeconds: totalTaskDurationSeconds,
            totalWorkMinutes: Math.floor(totalTaskDurationSeconds / 60),
          },
        };
      },
      async () => {
        const todayAttendances = await DbService.restRequest<any[]>(
          `/attendance?employee_id=eq.${employeeId}&attendance_date=eq.${todayStr}`
        );
        const todayAtt = todayAttendances?.[0];
        const checkInAt = todayAtt ? (todayAtt.checkInAt || todayAtt.check_in_at) : null;
        const checkOutAt = todayAtt ? (todayAtt.checkOutAt || todayAtt.check_out_at) : null;

        if (checkOutAt || !checkInAt) {
          const orphanActiveTimers = await DbService.restRequest<any[]>(
            `/task_timers?employee_id=eq.${employeeId}&is_active=eq.true`
          );
          if (orphanActiveTimers && orphanActiveTimers.length > 0) {
            const finalizeTime = checkOutAt ? new Date(checkOutAt) : now;
            for (const ot of orphanActiveTimers) {
              const otStartedAt = ot.startedAt || ot.started_at;
              const diff = Math.max(0, DateTimeUtil.diffSeconds(otStartedAt, finalizeTime));
              const currentDur = ot.durationSeconds || ot.duration_seconds || 0;
              await DbService.restRequest(`/task_timers?id=eq.${ot.id}`, {
                method: 'PATCH',
                body: {
                  ended_at: finalizeTime.toISOString(),
                  paused_at: finalizeTime.toISOString(),
                  duration_seconds: currentDur + diff,
                  is_active: false,
                },
              });
              const taskId = ot.taskId || ot.task_id;
              await DbService.restRequest(`/tasks?id=eq.${taskId}`, {
                method: 'PATCH',
                body: { status: 'PAUSED' },
              });
            }
          }
          return null;
        }

        const timers = await DbService.restRequest<any[]>(
          `/task_timers?employee_id=eq.${employeeId}&is_active=eq.true&select=*,task:tasks(*)`
        );
        if (!timers || timers.length === 0) return null;
        const activeTimer = timers[0];

        const allTimers = await DbService.restRequest<any[]>(
          `/task_timers?task_id=eq.${activeTimer.taskId || activeTimer.task_id}`
        );
        const priorClosedDurationSeconds = (allTimers || [])
          .filter((t: any) => t.id !== activeTimer.id)
          .reduce((acc: number, t: any) => acc + (t.durationSeconds || t.duration_seconds || 0), 0);

        const startedAt = activeTimer.startedAt || activeTimer.started_at;
        const currentRunningIntervalSeconds = Math.max(0, DateTimeUtil.diffSeconds(startedAt, now));
        const totalTaskDurationSeconds = priorClosedDurationSeconds + currentRunningIntervalSeconds;

        return {
          ...activeTimer,
          priorClosedDurationSeconds,
          currentRunningIntervalSeconds,
          currentElapsedSeconds: totalTaskDurationSeconds,
          task: {
            ...activeTimer.task,
            totalDurationSeconds: totalTaskDurationSeconds,
            totalWorkMinutes: Math.floor(totalTaskDurationSeconds / 60),
          },
        };
      }
    );
  }

  /**
   * Get Time Tracking Summary & Project Analytics
   */
  public static async getTimeSummary(user: AuthUser, params: { employeeId?: string } = {}) {
    const now = new Date();
    const targetEmpId =
      user.role === 'EMPLOYEE'
        ? user.employeeId
        : params.employeeId &&
          params.employeeId !== 'undefined' &&
          params.employeeId !== 'null' &&
          params.employeeId.trim() !== ''
        ? params.employeeId
        : undefined;

    return DbService.query(
      async () => {
        const where: any = {};
        if (targetEmpId) {
          where.employeeId = targetEmpId;
        }

        const tasks = await prisma.task.findMany({
          where,
          include: {
            employee: { select: { id: true, displayName: true, firstName: true, lastName: true, employeeCode: true } },
            timers: true,
          },
        });

        let totalWorkedSeconds = 0;
        let totalActiveTimers = 0;
        let completedTasksCount = 0;

        const employeeAggregates: Record<string, { employee: any; totalWorkedSeconds: number; taskCount: number; completedCount: number }> = {};
        const statusCounts: Record<string, number> = { TODO: 0, IN_PROGRESS: 0, PAUSED: 0, COMPLETED: 0, CANCELLED: 0 };

        for (const task of tasks) {
          const taskWorked = TaskService.calculateTaskWorkedSeconds(task.timers, now);
          totalWorkedSeconds += taskWorked;

          if (task.timers.some((t) => t.isActive)) totalActiveTimers++;
          if (task.status === 'COMPLETED') completedTasksCount++;
          if (statusCounts[task.status] !== undefined) statusCounts[task.status]++;

          const empId = task.employeeId;
          if (!employeeAggregates[empId]) {
            employeeAggregates[empId] = {
              employee: task.employee,
              totalWorkedSeconds: 0,
              taskCount: 0,
              completedCount: 0,
            };
          }
          employeeAggregates[empId].totalWorkedSeconds += taskWorked;
          employeeAggregates[empId].taskCount++;
          if (task.status === 'COMPLETED') employeeAggregates[empId].completedCount++;
        }

        return {
          totalTasks: tasks.length,
          completedTasks: completedTasksCount,
          activeTimersCount: totalActiveTimers,
          totalWorkedSeconds,
          totalWorkedMinutes: Math.floor(totalWorkedSeconds / 60),
          totalWorkedHours: parseFloat((totalWorkedSeconds / 3600).toFixed(2)),
          statusBreakdown: statusCounts,
          employeeBreakdown: Object.values(employeeAggregates).map((item) => ({
            ...item,
            totalWorkedMinutes: Math.floor(item.totalWorkedSeconds / 60),
            totalWorkedHours: parseFloat((item.totalWorkedSeconds / 3600).toFixed(2)),
          })),
        };
      },
      async () => {
        let path = '/tasks?select=*,employee:employees(id,display_name,first_name,last_name,employee_code),timers:task_timers(*)';
        if (targetEmpId) {
          path += `&employee_id=eq.${targetEmpId}`;
        }
        const tasks = await DbService.restRequest<any[]>(path);

        let totalWorkedSeconds = 0;
        let totalActiveTimers = 0;
        let completedTasksCount = 0;

        const employeeAggregates: Record<string, { employee: any; totalWorkedSeconds: number; taskCount: number; completedCount: number }> = {};
        const statusCounts: Record<string, number> = { TODO: 0, IN_PROGRESS: 0, PAUSED: 0, COMPLETED: 0, CANCELLED: 0 };

        for (const task of tasks || []) {
          const timers = task.timers || [];
          const taskWorked = TaskService.calculateTaskWorkedSeconds(timers, now);
          totalWorkedSeconds += taskWorked;
          if (timers.some((t: any) => t.isActive ?? t.is_active)) totalActiveTimers++;
          if (task.status === 'COMPLETED') completedTasksCount++;
          if (statusCounts[task.status] !== undefined) statusCounts[task.status]++;

          const empId = task.employee_id || task.employeeId;
          if (empId) {
            if (!employeeAggregates[empId]) {
              employeeAggregates[empId] = {
                employee: task.employee,
                totalWorkedSeconds: 0,
                taskCount: 0,
                completedCount: 0,
              };
            }
            employeeAggregates[empId].totalWorkedSeconds += taskWorked;
            employeeAggregates[empId].taskCount++;
            if (task.status === 'COMPLETED') employeeAggregates[empId].completedCount++;
          }
        }

        return {
          totalTasks: (tasks || []).length,
          completedTasks: completedTasksCount,
          activeTimersCount: totalActiveTimers,
          totalWorkedSeconds,
          totalWorkedMinutes: Math.floor(totalWorkedSeconds / 60),
          totalWorkedHours: parseFloat((totalWorkedSeconds / 3600).toFixed(2)),
          statusBreakdown: statusCounts,
          employeeBreakdown: Object.values(employeeAggregates).map((item) => ({
            ...item,
            totalWorkedMinutes: Math.floor(item.totalWorkedSeconds / 60),
            totalWorkedHours: parseFloat((item.totalWorkedSeconds / 3600).toFixed(2)),
          })),
        };
      }
    );
  }
}
