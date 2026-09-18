import { FastifyReply, FastifyRequest } from 'fastify';
import { EmployeeService } from './employee.service.js';
import { createEmployeeSchema, updateEmployeeSchema, updateSelfProfileSchema } from '../../validation/index.js';

export class EmployeeController {
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
}

