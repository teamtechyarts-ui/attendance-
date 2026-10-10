import { FastifyReply, FastifyRequest } from 'fastify';
import { EmployeeService } from './employee.service.js';
import { createEmployeeSchema, updateEmployeeSchema, updateJoiningDateSchema, updateSelfProfileSchema } from '../../validation/index.js';
import { RbacService } from '../../services/rbac.service.js';

export class EmployeeController {
  public static async listAssignable(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user!;
    const query = request.query as any;

    const canList =
      user.role === 'SUPER_ADMIN' ||
      user.role === 'ADMIN' ||
      user.role === 'MANAGER' ||
      RbacService.hasPermission(user, 'EMPLOYEE_VIEW') ||
      RbacService.hasPermission(user, 'TASK_ASSIGN') ||
      RbacService.hasPermission(user, 'TASK_CREATE') ||
      RbacService.hasPermission(user, 'PROJECT_CREATE') ||
      RbacService.hasPermission(user, 'PROJECT_UPDATE') ||
      RbacService.hasPermission(user, 'TEAM_MEMBER_ADD') ||
      RbacService.hasPermission(user, 'TEAM_VIEW');

    if (!canList) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not have permission to view assignable employees' },
      });
    }

    const employees = await EmployeeService.listAssignableEmployees(user, {
      search: query.search,
      departmentId: query.departmentId,
      projectId: query.projectId,
    });

    return reply.send({
      success: true,
      data: employees,
    });
  }

  public static async list(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;
    const result = await EmployeeService.listEmployees({
      search: query.search,
      departmentId: query.departmentId,
      designationId: query.designationId,
      status: query.status,
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 20,
    });

    return reply.send({
      success: true,
      data: result.items,
      meta: result.meta,
    });
  }

  public static async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const emp = await EmployeeService.getEmployeeById(id);

    return reply.send({
      success: true,
      data: emp,
    });
  }

  public static async create(request: FastifyRequest, reply: FastifyReply) {
    const body = createEmployeeSchema.parse(request.body);
    const emp = await EmployeeService.createEmployee(body, request.user!.id, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({
      success: true,
      data: emp,
    });
  }

  public static async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = updateEmployeeSchema.parse(request.body);
    const emp = await EmployeeService.updateEmployee(id, body, request.user!.id, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({
      success: true,
      data: emp,
    });
  }

  public static async updateJoiningDate(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { joiningDate } = updateJoiningDateSchema.parse(request.body);

    const emp = await EmployeeService.updateJoiningDate(id, joiningDate || null, request.user!.id, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({
      success: true,
      data: emp,
      message: 'Joining date updated successfully',
    });
  }

  public static async updateSelfProfile(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user?.employeeId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Employee profile not associated' },
      });
    }

    const body = updateSelfProfileSchema.parse(request.body);
    const emp = await EmployeeService.updateSelfProfile(request.user.employeeId, body);

    return reply.send({
      success: true,
      data: emp,
    });
  }

  public static async uploadProfilePhoto(request: FastifyRequest, reply: FastifyReply) {
    let employeeId = request.user?.employeeId;
    if (!employeeId) {
      const emp = await EmployeeService.resolveEmployeeByUserId(request.user!.id);
      employeeId = emp?.id;
    }

    if (!employeeId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Employee profile not associated' },
      });
    }

    const body = (request.body || {}) as { image?: string };
    if (!body.image || typeof body.image !== 'string') {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_IMAGE', message: 'Image data URL is required' },
      });
    }

    const result = await EmployeeService.uploadProfilePhoto(employeeId, request.user!.id, body.image);
    return reply.send({
      success: true,
      data: result,
    });
  }

  public static async deleteProfilePhoto(request: FastifyRequest, reply: FastifyReply) {
    let employeeId = request.user?.employeeId;
    if (!employeeId) {
      const emp = await EmployeeService.resolveEmployeeByUserId(request.user!.id);
      employeeId = emp?.id;
    }

    if (!employeeId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Employee profile not associated' },
      });
    }

    const result = await EmployeeService.deleteProfilePhoto(employeeId, request.user!.id);
    return reply.send({
      success: true,
      data: result,
    });
  }

  public static async resendOnboarding(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const result = await EmployeeService.resendOnboardingEmail(id, request.user!.id, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({
      success: true,
      data: result,
    });
  }

  public static async deactivate(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };

    try {
      const result = await EmployeeService.deactivateEmployee(
        id,
        request.user!.id,
        request.user!.employeeId || null,
        request.user!.role,
        {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        }
      );

      if (result.alreadyInactive) {
        return reply.send({
          success: true,
          data: { deactivated: false, message: 'Employee is already inactive' },
        });
      }

      return reply.send({
        success: true,
        data: { deactivated: true, message: 'Employee deactivated successfully' },
      });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      const code = err.code || 'INTERNAL_ERROR';
      return reply.status(statusCode).send({
        success: false,
        error: { code, message: err.message },
      });
    }
  }

  public static async reactivate(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };

    try {
      const result = await EmployeeService.reactivateEmployee(
        id,
        request.user!.id,
        {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        }
      );

      return reply.send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      const code = err.code || 'INTERNAL_ERROR';
      return reply.status(statusCode).send({
        success: false,
        error: { code, message: err.message },
      });
    }
  }

  public static async getNextCode(request: FastifyRequest, reply: FastifyReply) {
    const nextCode = await EmployeeService.generateNextEmployeeCode();
    return reply.send({
      success: true,
      data: { nextEmployeeCode: nextCode },
    });
  }
}

