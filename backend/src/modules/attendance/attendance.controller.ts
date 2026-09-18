import { FastifyReply, FastifyRequest } from 'fastify';
import { AttendanceService } from './attendance.service.js';
import { checkInSchema, checkOutSchema } from '../../validation/index.js';

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
    const query = request.query as any;
    const user = request.user;
    if (!user) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    // RBAC: An employee can ONLY view their own attendance history
    let empId: string | null = null;
    if (user.role === 'EMPLOYEE') {
      empId = user.employeeId || null;
    } else {
      empId = query.employeeId || user.employeeId || null;
    }

    if (!empId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EMPLOYEE_ID_REQUIRED', message: 'Employee ID required' },
      });
    }

    const data = await AttendanceService.getHistory(
      empId,
      query.year ? parseInt(query.year, 10) : undefined,
      query.month ? parseInt(query.month, 10) : undefined
    );

    return reply.send({
      success: true,
      data,
    });
  }
}
