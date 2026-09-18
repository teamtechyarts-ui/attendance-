import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';
import { AuditService } from '../../services/audit.service.js';
import { authenticate } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/permissions.js';
import { createDesignationSchema, updateDesignationSchema } from '../../validation/index.js';

export async function designationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // List designations (All authenticated users, with includeInactive support for Admins)
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as any;
    const includeInactive = query?.includeInactive === 'true' || query?.all === 'true';
    const where = includeInactive ? {} : { isActive: true };

    const items = await DbService.query(
      async () => prisma.designation.findMany({ where, orderBy: { name: 'asc' } }),
      async () => DbService.restRequest(`/designations?${includeInactive ? '' : 'is_active=eq.true&'}order=name.asc`)
    );
    return reply.send({ success: true, data: items || [] });
  });

  // Get designation by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const item = await DbService.query(
      async () => prisma.designation.findUnique({ where: { id } }),
      async () => {
        const res = await DbService.restRequest<any[]>(`/designations?id=eq.${id}&select=*`);
        return res?.[0] || null;
      }
    );
    if (!item) {
      return reply.status(404).send({
        success: false,
        error: { code: 'DESIGNATION_NOT_FOUND', message: 'Designation not found' },
      });
    }
    return reply.send({ success: true, data: item });
  });

  // Create designation (Admin only)
  fastify.post('/', { preHandler: [requireAdmin()] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createDesignationSchema.parse(request.body);
    try {
      const item = await DbService.query(
        async () => prisma.designation.create({ data: body }),
        async () => {
          const res = await DbService.restRequest('/designations', { method: 'POST', body });
          return res[0];
        }
      );

      await AuditService.log({
        userId: request.user?.id,
        employeeId: request.user?.employeeId,
        action: 'CREATE',
        entityType: 'designation',
        entityId: item.id,
        description: `Created designation "${item.name}" (Status: ${item.isActive ? 'ACTIVE' : 'INACTIVE'})`,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.status(201).send({ success: true, data: item });
    } catch (err: any) {
      if (err.code === 'P2002' || err.code === '23505' || err.statusCode === 409 || err.code === 'CONFLICT') {
        return reply.status(409).send({
          success: false,
          error: { code: 'DESIGNATION_ALREADY_EXISTS', message: 'A designation with this name already exists' },
        });
      }
      throw err;
    }
  });

  // Update designation (Admin only)
  const handleUpdate = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const body = updateDesignationSchema.parse(request.body);
    try {
      const item = await DbService.query(
        async () => prisma.designation.update({ where: { id }, data: body }),
        async () => {
          const res = await DbService.restRequest<any[]>(`/designations?id=eq.${id}`, { method: 'PATCH', body });
          return res?.[0] || null;
        }
      );
      if (!item) {
        return reply.status(404).send({
          success: false,
          error: { code: 'DESIGNATION_NOT_FOUND', message: 'Designation not found' },
        });
      }

      await AuditService.log({
        userId: request.user?.id,
        employeeId: request.user?.employeeId,
        action: 'UPDATE',
        entityType: 'designation',
        entityId: id,
        description: `Updated designation "${item.name}" (Status: ${item.isActive ? 'ACTIVE' : 'INACTIVE'})`,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({ success: true, data: item });
    } catch (err: any) {
      if (err.code === 'P2002' || err.code === '23505' || err.statusCode === 409 || err.code === 'CONFLICT') {
        return reply.status(409).send({
          success: false,
          error: { code: 'DESIGNATION_ALREADY_EXISTS', message: 'A designation with this name already exists' },
        });
      }
      if (err.code === 'P2025' || err.statusCode === 404) {
        return reply.status(404).send({
          success: false,
          error: { code: 'DESIGNATION_NOT_FOUND', message: 'Designation not found' },
        });
      }
      throw err;
    }
  };

  fastify.put<{ Params: { id: string } }>('/:id', { preHandler: [requireAdmin()] }, handleUpdate);
  fastify.patch<{ Params: { id: string } }>('/:id', { preHandler: [requireAdmin()] }, handleUpdate);

  // Delete/Deactivate designation (Admin only)
  fastify.delete<{ Params: { id: string } }>('/:id', { preHandler: [requireAdmin()] }, async (request, reply) => {
    const { id } = request.params;
    try {
      // 1. Check if designation exists
      const existing = await DbService.query(
        async () => prisma.designation.findUnique({ where: { id } }),
        async () => {
          const res = await DbService.restRequest<any[]>(`/designations?id=eq.${id}&select=*`);
          return res?.[0] || null;
        }
      );

      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: { code: 'DESIGNATION_NOT_FOUND', message: 'Designation not found' },
        });
      }

      // 2. Check employee dependencies
      const employeeCount = await DbService.query(
        async () => prisma.employee.count({ where: { designationId: id } }),
        async () => {
          const res = await DbService.restRequest<any[]>(`/employees?designation_id=eq.${id}&select=id`);
          return res?.length || 0;
        }
      );

      // If referenced by employees, perform safe deactivation to preserve historical records
      if (employeeCount > 0) {
        const item = await DbService.query(
          async () => prisma.designation.update({ where: { id }, data: { isActive: false } }),
          async () => {
            const res = await DbService.restRequest<any[]>(`/designations?id=eq.${id}`, {
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
          entityType: 'designation',
          entityId: id,
          description: `Deactivated designation "${existing.name}" due to ${employeeCount} employee assignment(s)`,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        });

        return reply.send({
          success: true,
          message: `Designation is assigned to ${employeeCount} employee(s) and has been deactivated/archived to preserve historical data.`,
          data: item,
          deactivated: true,
        });
      }

      // If no employee dependencies exist, perform safe hard deletion
      const deletedItem = await DbService.query(
        async () => prisma.designation.delete({ where: { id } }),
        async () => {
          const res = await DbService.restRequest<any[]>(`/designations?id=eq.${id}`, { method: 'DELETE' });
          return res?.[0] || existing;
        }
      );

      await AuditService.log({
        userId: request.user?.id,
        employeeId: request.user?.employeeId,
        action: 'DELETE',
        entityType: 'designation',
        entityId: id,
        description: `Permanently deleted unreferenced designation "${existing.name}"`,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({
        success: true,
        message: 'Designation deleted successfully',
        data: deletedItem,
        deactivated: false,
      });
    } catch (err: any) {
      if (err.code === 'P2025' || err.statusCode === 404) {
        return reply.status(404).send({
          success: false,
          error: { code: 'DESIGNATION_NOT_FOUND', message: 'Designation not found' },
        });
      }
      throw err;
    }
  });
}


