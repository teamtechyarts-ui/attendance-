import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permissions.js';

export async function auditRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requirePermission('SECURITY_AUDIT'));

  // List audit logs
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as any;
    const page = Math.max(1, query.page ? parseInt(query.page, 10) : 1);
    const limit = Math.min(100, Math.max(1, query.limit ? parseInt(query.limit, 10) : 30));
    const skip = (page - 1) * limit;

    const result = await DbService.query(
      async () => {
        const where: any = {};
        if (query.employeeId) where.employeeId = query.employeeId;
        if (query.action) where.action = query.action;

        const [items, total] = await Promise.all([
          prisma.auditLog.findMany({
            where,
            include: {
              user: { select: { id: true, email: true, role: true } },
              employee: { select: { id: true, displayName: true, employeeCode: true } },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
          }),
          prisma.auditLog.count({ where }),
        ]);

        return {
          items,
          meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
      },
      async () => {
        const items = await DbService.restRequest<any[]>(
          `/audit_logs?select=*,user:users(id,email,role),employee:employees(id,display_name,employee_code)&order=created_at.desc&limit=${limit}&offset=${skip}`
        );
        return { items, meta: { page, limit, total: items.length, totalPages: 1 } };
      }
    );

    return reply.send({
      success: true,
      data: result.items,
      meta: result.meta,
    });
  });
}
