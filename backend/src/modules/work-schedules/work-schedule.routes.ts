import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';
import { AuditService } from '../../services/audit.service.js';
import { authenticate } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/permissions.js';
import { createWorkScheduleSchema, updateWorkScheduleSchema } from '../../validation/index.js';

export async function workScheduleRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // List all work schedules
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const items = await DbService.query(
      async () => prisma.workSchedule.findMany({ orderBy: { createdAt: 'asc' } }),
      async () => DbService.restRequest('/work_schedules?order=created_at.asc')
    );
    return reply.send({ success: true, data: items || [] });
  });

  // Get work schedule by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const item = await DbService.query(
      async () => prisma.workSchedule.findUnique({ where: { id } }),
      async () => {
        const res = await DbService.restRequest<any[]>(`/work_schedules?id=eq.${id}&select=*`);
        return res?.[0] || null;
      }
    );
    if (!item) {
      return reply.status(404).send({
        success: false,
        error: { code: 'WORK_SCHEDULE_NOT_FOUND', message: 'Work schedule not found' },
      });
    }
    return reply.send({ success: true, data: item });
  });

  // Create work schedule (Admin only)
  fastify.post('/', { preHandler: [requireAdmin()] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createWorkScheduleSchema.parse(request.body);
    try {
      const item = await DbService.query(
        async () => {
          return await prisma.$transaction(async (tx) => {
            const count = await tx.workSchedule.count();
            const shouldBeDefault = body.isDefault || count === 0;

            if (shouldBeDefault) {
              await tx.workSchedule.updateMany({
                where: {},
                data: { isDefault: false },
              });
            }

            return await tx.workSchedule.create({
              data: {
                ...body,
                isDefault: shouldBeDefault,
              },
            });
          });
        },
        async () => {
          if (body.isDefault) {
            await DbService.restRequest('/work_schedules?is_default=eq.true', {
              method: 'PATCH',
              body: { is_default: false },
            });
          }
          const res = await DbService.restRequest('/work_schedules', { method: 'POST', body });
          return res[0];
        }
      );

      await AuditService.log({
        userId: request.user?.id,
        employeeId: request.user?.employeeId,
        action: 'CREATE',
        entityType: 'work_schedule',
        entityId: item.id,
        description: `Created work schedule "${item.name}" (Shift: ${item.workStartTime}-${item.workEndTime}, Default: ${item.isDefault})`,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.status(201).send({ success: true, data: item });
    } catch (err: any) {
      if (err.code === 'P2002' || err.code === '23505' || err.statusCode === 409 || err.code === 'CONFLICT') {
        return reply.status(409).send({
          success: false,
          error: { code: 'WORK_SCHEDULE_ALREADY_EXISTS', message: 'A work schedule with this name already exists' },
        });
      }
      throw err;
    }
  });

  // Update work schedule (Admin only)
  const handleUpdate = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const body = updateWorkScheduleSchema.parse(request.body);
    try {
      const item = await DbService.query(
        async () => {
          return await prisma.$transaction(async (tx) => {
            if (body.isDefault === true) {
              await tx.workSchedule.updateMany({
                where: { id: { not: id } },
                data: { isDefault: false },
              });
            }

            return await tx.workSchedule.update({
              where: { id },
              data: body,
            });
          });
        },
        async () => {
          if (body.isDefault === true) {
            await DbService.restRequest(`/work_schedules?id=neq.${id}&is_default=eq.true`, {
              method: 'PATCH',
              body: { is_default: false },
            });
          }
          const res = await DbService.restRequest<any[]>(`/work_schedules?id=eq.${id}`, { method: 'PATCH', body });
          return res?.[0] || null;
        }
      );

      if (!item) {
        return reply.status(404).send({
          success: false,
          error: { code: 'WORK_SCHEDULE_NOT_FOUND', message: 'Work schedule not found' },
        });
      }

      await AuditService.log({
        userId: request.user?.id,
        employeeId: request.user?.employeeId,
        action: 'UPDATE',
        entityType: 'work_schedule',
        entityId: id,
        description: `Updated work schedule "${item.name}" (Shift: ${item.workStartTime}-${item.workEndTime}, Default: ${item.isDefault})`,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({ success: true, data: item });
    } catch (err: any) {
      if (err.code === 'P2002' || err.code === '23505' || err.statusCode === 409 || err.code === 'CONFLICT') {
        return reply.status(409).send({
          success: false,
          error: { code: 'WORK_SCHEDULE_ALREADY_EXISTS', message: 'A work schedule with this name already exists' },
        });
      }
      if (err.code === 'P2025' || err.statusCode === 404) {
        return reply.status(404).send({
          success: false,
          error: { code: 'WORK_SCHEDULE_NOT_FOUND', message: 'Work schedule not found' },
        });
      }
      throw err;
    }
  };

  fastify.put<{ Params: { id: string } }>('/:id', { preHandler: [requireAdmin()] }, handleUpdate);
  fastify.patch<{ Params: { id: string } }>('/:id', { preHandler: [requireAdmin()] }, handleUpdate);

  // Delete work schedule (Admin only)
  fastify.delete<{ Params: { id: string } }>('/:id', { preHandler: [requireAdmin()] }, async (request, reply) => {
    const { id } = request.params;
    try {
      // 1. Check if schedule exists
      const existing = await DbService.query(
        async () => prisma.workSchedule.findUnique({ where: { id } }),
        async () => {
          const res = await DbService.restRequest<any[]>(`/work_schedules?id=eq.${id}&select=*`);
          return res?.[0] || null;
        }
      );

      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: { code: 'WORK_SCHEDULE_NOT_FOUND', message: 'Work schedule not found' },
        });
      }

      // 2. Check employee dependencies in employee_work_schedules
      const assignedCount = await DbService.query(
        async () => prisma.employeeWorkSchedule.count({ where: { scheduleId: id } }),
        async () => {
          const res = await DbService.restRequest<any[]>(`/employee_work_schedules?schedule_id=eq.${id}&select=id`);
          return res?.length || 0;
        }
      );

      if (assignedCount > 0) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'SCHEDULE_ASSIGNED_TO_EMPLOYEES',
            message: `This work schedule is currently assigned to ${assignedCount} employee(s) and cannot be deleted.`,
          },
        });
      }

      // 3. Default schedule protection
      if (existing.isDefault) {
        const totalSchedules = await DbService.query(
          async () => prisma.workSchedule.count(),
          async () => {
            const res = await DbService.restRequest<any[]>('/work_schedules?select=id');
            return res?.length || 0;
          }
        );

        if (totalSchedules > 1) {
          return reply.status(409).send({
            success: false,
            error: {
              code: 'CANNOT_DELETE_DEFAULT_SCHEDULE',
              message: 'Cannot delete the default work schedule. Please set another schedule as default first.',
            },
          });
        }
      }

      // 4. Safe hard deletion
      const deletedItem = await DbService.query(
        async () => prisma.workSchedule.delete({ where: { id } }),
        async () => {
          const res = await DbService.restRequest<any[]>(`/work_schedules?id=eq.${id}`, { method: 'DELETE' });
          return res?.[0] || existing;
        }
      );

      await AuditService.log({
        userId: request.user?.id,
        employeeId: request.user?.employeeId,
        action: 'DELETE',
        entityType: 'work_schedule',
        entityId: id,
        description: `Deleted work schedule "${existing.name}"`,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send({
        success: true,
        message: 'Work schedule deleted successfully',
        data: deletedItem,
      });
    } catch (err: any) {
      if (err.code === 'P2025' || err.statusCode === 404) {
        return reply.status(404).send({
          success: false,
          error: { code: 'WORK_SCHEDULE_NOT_FOUND', message: 'Work schedule not found' },
        });
      }
      throw err;
    }
  });
}

