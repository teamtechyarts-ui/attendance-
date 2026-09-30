import { FastifyReply, FastifyRequest } from 'fastify';
import { AttendanceService } from './attendance.service.js';
import { RbacService } from '../../services/rbac.service.js';
import { DbService } from '../../services/db.service.js';
import { prisma } from '../../plugins/prisma.js';
import { checkInSchema, checkOutSchema, attendanceHistoryQuerySchema } from '../../validation/index.js';


export class AttendanceController {
  public static async getToday(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user?.employeeId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EMPLOYEE_NOT_FOUND', message: 'No employee record associated' },
      });
    }

    const data = await AttendanceService.getTodayAttendance(request.user.employeeId);
    return reply.send({
      success: true,
      data,
    });
  }

  public static async checkIn(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user?.employeeId || !request.sessionId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'SESSION_INVALID', message: 'Active session required' },
      });
    }

    const body = checkInSchema.parse(request.body);
    const data = await AttendanceService.checkIn(
      request.user.employeeId,
      request.sessionId,
      request.user.id,
      body,
      {
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      }
    );

    return reply.status(201).send({
      success: true,
      data,
    });
  }

  public static async checkOut(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user?.employeeId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EMPLOYEE_NOT_FOUND', message: 'No employee record associated' },
      });
    }

    const body = checkOutSchema.parse(request.body);
    const data = await AttendanceService.checkOut(
      request.user.employeeId,
      request.user.id,
      body,
      {
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      }
    );

    return reply.send({
      success: true,
      data,
    });
  }

  public static async getLiveOverview(request: FastifyRequest, reply: FastifyReply) {
    const data = await AttendanceService.getLiveOverview();
    return reply.send({
      success: true,
      data,
    });
  }

  public static async getMetrics(request: FastifyRequest, reply: FastifyReply) {
    const data = await AttendanceService.getMetrics();
    return reply.send({
      success: true,
      data,
    });
  }

  public static async getHistory(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user;
    if (!user) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const query = attendanceHistoryQuerySchema.parse(request.query);
    const rawQuery = request.query as any;
    const isSuper = user.role === 'SUPER_ADMIN' || user.appRole === 'SUPER_ADMIN';
    const isAdminView = rawQuery?.adminView === 'true' || rawQuery?.adminView === true;

    let empId: string | string[] | null = null;

    if (isAdminView) {
      // Administrative Context (/admin-view/attendance or /admin/attendance)
      const canViewAllAttendance =
        isSuper ||
        RbacService.hasPermission(user, 'ATTENDANCE_VIEW') ||
        RbacService.hasPermission(user, 'ATTENDANCE_MANAGE') ||
        RbacService.hasPermission(user, 'ATTENDANCE_EDIT');

      if (!canViewAllAttendance) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You do not have administrative permission to view team attendance' },
        });
      }

      if (query.employeeId && query.employeeId !== 'undefined' && query.employeeId !== 'null' && query.employeeId.trim() !== '') {
        if (!isSuper) {
          const hasScope = await RbacService.hasScopeAccess(user, { employeeId: query.employeeId });
          if (!hasScope) {
            return reply.status(403).send({
              success: false,
              error: { code: 'FORBIDDEN', message: 'Target employee is outside your permitted administrative scope' },
            });
          }
        }
        empId = query.employeeId;
      } else if (!isSuper && user.scope?.employees && Array.isArray(user.scope.employees) && user.scope.employees.length > 0) {
        empId = user.scope.employees;
      } else {
        empId = null; // Organization-wide attendance
      }
    } else {
      // Personal Employee Context (Employee View: /attendance)
      empId = user.employeeId || null;
      if (!empId && user.id) {
        try {
          const emp = await DbService.query(
            () => prisma.employee.findFirst({ where: { userId: user.id } }),
            async () => {
              const emps = await DbService.restRequest<any[]>(`/employees?user_id=eq.${user.id}`);
              return emps?.[0] || null;
            }
          );
          if (emp) {
            empId = emp.id;
          }
        } catch {}
      }

      if (!empId) {
        return reply.send({
          success: true,
          data: {
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
          },
        });
      }
    }


    const data = await AttendanceService.getHistory({
      employeeId: empId,
      date: query.date || undefined,
      year: query.year || undefined,
      month: query.month || undefined,
      status: query.status || undefined,
      adminView: isAdminView,
    });

    return reply.send({
      success: true,
      data,
    });
  }
}
