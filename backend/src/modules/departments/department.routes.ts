import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';
import { AuditService } from '../../services/audit.service.js';
import { authenticate } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/permissions.js';
import { createDepartmentSchema, updateDepartmentSchema } from '../../validation/index.js';

export async function departmentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // List departments (all authenticated users, with includeInactive support for Admins)
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as any;
    const includeInactive = query?.includeInactive === 'true' || query?.all === 'true';
    const where = includeInactive ? {} : { isActive: true };

    const items = await DbService.query(
      async () => prisma.department.findMany({ where, orderBy: { name: 'asc' } }),
      async () => DbService.restRequest(`/departments?${includeInactive ? '' : 'is_active=eq.true&'}order=name.asc`)
    );
    return reply.send({ success: true, data: items || [] });
  });

  // Get department by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const item = await DbService.query(
      async () => prisma.department.findUnique({ where: { id } }),
      async () => {
        const res = await DbService.restRequest<any[]>(`/departments?id=eq.${id}&select=*`);
        return res?.[0] || null;
      }
    );
    if (!item) {
      return reply.status(404).send({
        success: false,
        error: { code: 'DEPARTMENT_NOT_FOUND', message: 'Department not found' },
      });
    }
    return reply.send({ success: true, data: item });
  });

  // Create department (Admin only)
  fastify.post('/', { preHandler: [requireAdmin()] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createDepartmentSchema.parse(request.body);
    try {
      const item = await DbService.query(
        async () => prisma.department.create({ data: body }),
        async () => {
          const res = await DbService.restRequest('/departments', { method: 'POST', body });
          return res[0];
        }
      );

      await AuditService.log({
        userId: request.user?.id,
        employeeId: request.user?.employeeId,
        action: 'CREATE',
        entityType: 'department',
        entityId: item.id,
        description: `Created department "${item.name}" (Status: ${item.isActive ? 'ACTIVE' : 'INACTIVE'})`,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.status(201).send({ success: true, data: item });
    } catch (err: any) {
      if (err.code === 'P2002' || err.code === '23505' || err.statusCode === 409 || err.code === 'CONFLICT') {
        return reply.status(409).send({
          success: false,
          error: { code: 'DEPARTMENT_ALREADY_EXISTS', message: 'A department with this name already exists' },
        });
      }
      throw err;
    }
  });

  // Update department (Admin only)
  const handleUpdate = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const body = updateDepartmentSchema.parse(request.body);
    try {
      const item = await DbService.query(
        async () => prisma.department.update({ where: { id }, data: body }),
        async () => {
          const res = await DbService.restRequest<any[]>(`/departments?id=eq.${id}`, { method: 'PATCH', body });
          return res?.[0] || null;
        }
      );
      if (!item) {
        return reply.status(404).send({
          success: false,
          error: { code: 'DEPARTMENT_NOT_FOUND', message: 'Department not found' },
        });
      }

      await AuditService.log({
        userId: request.user?.id,
        employeeId: request.user?.employeeId,
        action: 'UPDATE',
        entityType: 'department',
        entityId: id,
        description: `Updated department "${item.name}" (Status: ${item.isActive ? 'ACTIVE' : 'INACTIVE'})`,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({ success: true, data: item });
    } catch (err: any) {
      if (err.code === 'P2002' || err.code === '23505' || err.statusCode === 409 || err.code === 'CONFLICT') {
        return reply.status(409).send({
          success: false,
          error: { code: 'DEPARTMENT_ALREADY_EXISTS', message: 'A department with this name already exists' },
        });
      }
      if (err.code === 'P2025' || err.statusCode === 404) {
        return reply.status(404).send({
          success: false,
          error: { code: 'DEPARTMENT_NOT_FOUND', message: 'Department not found' },
        });
      }
      throw err;
    }
  };

  fastify.put<{ Params: { id: string } }>('/:id', { preHandler: [requireAdmin()] }, handleUpdate);
  fastify.patch<{ Params: { id: string } }>('/:id', { preHandler: [requireAdmin()] }, handleUpdate);

  // Delete/Deactivate department (Admin only)
  fastify.delete<{ Params: { id: string } }>('/:id', { preHandler: [requireAdmin()] }, async (request, reply) => {
    const { id } = request.params;
    try {
      // 1. Check if department exists
      const existing = await DbService.query(
        async () => prisma.department.findUnique({ where: { id } }),
        async () => {
          const res = await DbService.restRequest<any[]>(`/departments?id=eq.${id}&select=*`);
          return res?.[0] || null;
        }
      );

      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: { code: 'DEPARTMENT_NOT_FOUND', message: 'Department not found' },
        });
      }

      // 2. Check employee dependencies
      const employeeCount = await DbService.query(
        async () => prisma.employee.count({ where: { departmentId: id } }),
        async () => {
          const res = await DbService.restRequest<any[]>(`/employees?department_id=eq.${id}&select=id`);
          return res?.length || 0;
        }
      );

      // If referenced by employees, perform safe deactivation to preserve historical records
      if (employeeCount > 0) {
        const item = await DbService.query(
          async () => prisma.department.update({ where: { id }, data: { isActive: false } }),
          async () => {
            const res = await DbService.restRequest<any[]>(`/departments?id=eq.${id}`, {
              method: 'PATCH',
              body: { is_active: false },
            });
            return res?.[0] || null;
          }
        );

        await AuditService.log({
          userId: request.user?.id,
          employeeId: request.user?.employeeId,
          action: 'UPDATE',
          entityType: 'department',
          entityId: id,
          description: `Deactivated department "${existing.name}" due to ${employeeCount} employee assignment(s)`,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        });

        return reply.send({
          success: true,
          message: `Department is assigned to ${employeeCount} employee(s) and has been deactivated/archived to preserve historical data.`,
          data: item,
          deactivated: true,
        });
      }

      // If no employee dependencies exist, perform safe hard deletion
      const deletedItem = await DbService.query(
        async () => prisma.department.delete({ where: { id } }),
        async () => {
          const res = await DbService.restRequest<any[]>(`/departments?id=eq.${id}`, { method: 'DELETE' });
          return res?.[0] || existing;
        }
      );

      await AuditService.log({
        userId: request.user?.id,
        employeeId: request.user?.employeeId,
        action: 'DELETE',
        entityType: 'department',
        entityId: id,
        description: `Permanently deleted unreferenced department "${existing.name}"`,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({
        success: true,
        message: 'Department deleted successfully',
        data: deletedItem,
        deactivated: false,
      });
    } catch (err: any) {
      if (err.code === 'P2025' || err.statusCode === 404) {
        return reply.status(404).send({
          success: false,
          error: { code: 'DEPARTMENT_NOT_FOUND', message: 'Department not found' },
        });
      }
      throw err;
    }
  });
}


