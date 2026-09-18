import { FastifyReply, FastifyRequest } from 'fastify';
import { LeaveService } from './leave.service.js';
import { createLeaveRequestSchema, reviewLeaveRequestSchema } from '../../validation/index.js';

export class LeaveController {
  public static async getTypes(request: FastifyRequest, reply: FastifyReply) {
    const data = await LeaveService.getLeaveTypes();
    return reply.send({
      success: true,
      data,
    });
  }

  public static async getBalances(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;
    const empId = query.employeeId || request.user?.employeeId;

    if (!empId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EMPLOYEE_ID_REQUIRED', message: 'Employee ID is required' },
      });
    }

    const data = await LeaveService.getBalances(empId, query.year ? parseInt(query.year, 10) : undefined);
    return reply.send({
      success: true,
      data,
    });
  }

  public static async listRequests(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;
    const result = await LeaveService.listRequests({
      employeeId: query.employeeId,
      status: query.status,
      user: request.user!,
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 30,
    });

    return reply.send({
      success: true,
      data: result.items,
      meta: result.meta,
    });
  }

  public static async requestLeave(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user?.employeeId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Employee profile required' },
      });
    }

    const body = createLeaveRequestSchema.parse(request.body);
    const data = await LeaveService.requestLeave(request.user.employeeId, body, request.user, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({
      success: true,
      data,
    });
  }

  public static async reviewRequest(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = reviewLeaveRequestSchema.parse(request.body);

    const data = await LeaveService.reviewRequest(
      id,
      body.status as 'APPROVED' | 'REJECTED',
      body.reviewComment,
      request.user!,
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

  public static async cancelRequest(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const data = await LeaveService.cancelRequest(id, request.user!, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({
      success: true,
      data,
    });
  }
}
