import { FastifyRequest, FastifyReply } from 'fastify';
import { RbacService } from '../../services/rbac.service.js';
import { Permission, AdminScope } from '../../types/index.js';

export class RbacController {
  /**
   * GET /api/rbac/permissions
   * List available permissions grouped by category
   */
  public static async getPermissions(request: FastifyRequest, reply: FastifyReply) {
    const registry = RbacService.getPermissionsRegistry();
    return reply.send({
      success: true,
      data: registry,
    });
  }

  /**
   * GET /api/rbac/assignments
   * Super Admin: List all Limited Admin role assignments
   */
  public static async getAssignments(request: FastifyRequest, reply: FastifyReply) {
    const assignments = await RbacService.listAdminAssignments();
    return reply.send({
      success: true,
      data: assignments,
    });
  }

  /**
   * GET /api/rbac/assignments/:employeeId
   * Super Admin: Get specific employee's RBAC assignment
   */
  public static async getAssignmentByEmployee(request: FastifyRequest, reply: FastifyReply) {
    const params = request.params as { employeeId?: string };
    const employeeId = params?.employeeId;
    if (!employeeId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EMPLOYEE_ID_REQUIRED', message: 'Employee ID is required' },
      });
    }

    const assignment = await RbacService.getEmployeeAssignment(employeeId);

    return reply.send({
      success: true,
      data: assignment,
    });
  }

  /**
   * POST /api/rbac/assignments and POST /api/rbac/assignments/:employeeId
   * Super Admin: Grant or update Limited Admin role & permissions
   */
  public static async grantAssignment(request: FastifyRequest, reply: FastifyReply) {
    const params = request.params as { employeeId?: string } | undefined;
    const body = (request.body || {}) as {
      employeeId?: string;
      permissions: Permission[];
      scope?: AdminScope;
      notes?: string;
    };

    const targetEmployeeId = params?.employeeId || body.employeeId;
    if (!targetEmployeeId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EMPLOYEE_ID_REQUIRED', message: 'Target employee ID is required' },
      });
    }

    if (!Array.isArray(body.permissions) || body.permissions.length === 0) {
      return reply.status(400).send({
        success: false,
        error: { code: 'PERMISSIONS_REQUIRED', message: 'At least one permission must be granted' },
      });
    }

    const clientInfo = {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    };

    const config = await RbacService.grantLimitedAdmin(
      request.user!.id,
      targetEmployeeId,
      body.permissions,
      body.scope || {},
      clientInfo
    );

    return reply.send({
      success: true,
      message: 'Limited Admin access successfully granted',
      data: config,
    });
  }

  /**
   * DELETE /api/rbac/assignments/:employeeId
   * Super Admin: Revoke Limited Admin role
   */
  public static async revokeAssignment(request: FastifyRequest, reply: FastifyReply) {
    const params = request.params as { employeeId?: string };
    const employeeId = params?.employeeId;
    if (!employeeId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EMPLOYEE_ID_REQUIRED', message: 'Employee ID is required' },
      });
    }

    const clientInfo = {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    };

    const res = await RbacService.revokeLimitedAdmin(request.user!.id, employeeId, clientInfo);

    return reply.send({
      success: true,
      message: res.message,
    });
  }
}
