import { FastifyReply, FastifyRequest } from 'fastify';
import { LeaveService } from './leave.service.js';
import {
  createLeaveRequestSchema,
  reviewLeaveRequestSchema,
  createLeaveTypeSchema,
  updateLeaveTypeSchema,
  updateLeavePolicySchema,
  createLeaveAllocationSchema,
  updateLeaveAllocationSchema,
} from '../../validation/index.js';
import { RbacService } from '../../services/rbac.service.js';

export class LeaveController {
  // ==========================================
  // LEAVE TYPES
  // ==========================================

  public static async getTypes(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;
    const includeInactive = query?.all === 'true' || query?.includeInactive === 'true';
    const data = await LeaveService.getLeaveTypes(includeInactive);
    return reply.send({
      success: true,
      data,
    });
  }

  public static async createType(request: FastifyRequest, reply: FastifyReply) {
    const body = createLeaveTypeSchema.parse(request.body);
    const data = await LeaveService.createLeaveType(body, request.user!, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return reply.status(201).send({
      success: true,
      data,
    });
  }

  public static async updateType(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = updateLeaveTypeSchema.parse(request.body);
    const data = await LeaveService.updateLeaveType(id, body, request.user!, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return reply.send({
      success: true,
      data,
    });
  }

  public static async deleteType(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const data = await LeaveService.deleteLeaveType(id, request.user!, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return reply.send({
      success: true,
      data,
    });
  }

  // ==========================================
  // LEAVE POLICIES
  // ==========================================

  public static async getPolicies(request: FastifyRequest, reply: FastifyReply) {
    const data = await LeaveService.getPolicies();
    return reply.send({
      success: true,
      data,
    });
  }

  public static async updatePolicy(request: FastifyRequest, reply: FastifyReply) {
    const { leaveTypeId } = request.params as { leaveTypeId: string };
    const body = updateLeavePolicySchema.parse(request.body);
    const data = await LeaveService.updatePolicy(leaveTypeId, body, request.user!, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return reply.send({
      success: true,
      data,
    });
  }

  // ==========================================
  // LEAVE ALLOCATIONS
  // ==========================================

  public static async getAllocations(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;
    const data = await LeaveService.getAllocations({
      year: query.year ? parseInt(query.year, 10) : undefined,
      month: query.month ? parseInt(query.month, 10) : (query.month === null ? null : undefined),
      employeeId: query.employeeId || undefined,
      leaveTypeId: query.leaveTypeId || undefined,
    });
    return reply.send({
      success: true,
      data,
    });
  }

  public static async createAllocation(request: FastifyRequest, reply: FastifyReply) {
    const body = createLeaveAllocationSchema.parse(request.body);
    const data = await LeaveService.createAllocation(body, request.user!, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return reply.status(201).send({
      success: true,
      data,
    });
  }

  public static async updateAllocation(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = updateLeaveAllocationSchema.parse(request.body);
    const data = await LeaveService.updateAllocation(id, body, request.user!, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return reply.send({
      success: true,
      data,
    });
  }

  public static async deleteAllocation(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const data = await LeaveService.deleteAllocation(id, request.user!, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return reply.send({
      success: true,
      data,
    });
  }

  // ==========================================
  // BALANCES & ORGANIZATION SUMMARY
  // ==========================================

  public static async getBalances(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;
    const user = request.user!;
    const isSuper = user.role === 'SUPER_ADMIN' || user.appRole === 'SUPER_ADMIN';
    const isAdminView = query?.adminView === 'true' || query?.adminView === true;

    let targetEmpId = user.employeeId;

    if (isAdminView) {
      if (query.employeeId && query.employeeId !== 'undefined' && query.employeeId !== 'null') {
        if (!isSuper) {
          const hasScope = await RbacService.hasScopeAccess(user, { employeeId: query.employeeId });
          if (!hasScope) {
            return reply.status(403).send({
              success: false,
              error: { code: 'FORBIDDEN', message: 'Target employee is outside your administrative scope' },
            });
          }
        }
        targetEmpId = query.employeeId;
      }
    }

    if (!targetEmpId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EMPLOYEE_ID_REQUIRED', message: 'Employee ID is required' },
      });
    }

    const year = query.year ? parseInt(query.year, 10) : new Date().getFullYear();
    const month = query.month ? parseInt(query.month, 10) : null;

    const data = await LeaveService.getBalances(targetEmpId, year, month);
    return reply.send({
      success: true,
      data,
    });
  }

  public static async getOrganizationSummary(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;
    const year = query.year ? parseInt(query.year, 10) : new Date().getFullYear();
    const month = query.month ? parseInt(query.month, 10) : null;

    const data = await LeaveService.getOrganizationSummary({
      year,
      month,
      departmentId: query.departmentId || undefined,
    });

    return reply.send({
      success: true,
      data,
    });
  }

  // ==========================================
  // LEAVE REQUESTS
  // ==========================================

  public static async listRequests(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;
    const result = await LeaveService.listRequests({
      employeeId: query.employeeId,
      leaveTypeId: query.leaveTypeId,
      status: query.status,
      month: query.month ? parseInt(query.month, 10) : undefined,
      year: query.year ? parseInt(query.year, 10) : undefined,
      adminView: query.adminView === 'true' || query.adminView === true,
      user: request.user!,
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
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
