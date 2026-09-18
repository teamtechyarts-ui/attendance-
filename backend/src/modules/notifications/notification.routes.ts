import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';
import { authenticate } from '../../middleware/auth.js';

export async function notificationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // Get notifications
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    const items = await DbService.query(
      async () => {
        return await prisma.notification.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        });
      },
      async () => {
        return await DbService.restRequest(`/notifications?user_id=eq.${userId}&order=created_at.desc&limit=50`);
      }
    );

    return reply.send({ success: true, data: items });
  });

  // Mark single as read
  fastify.patch('/:id/read', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const now = new Date();

    const updated = await DbService.query(
      async () => {
        return await prisma.notification.update({
          where: { id, userId: request.user!.id },
          data: { isRead: true, readAt: now },
        });
      },
      async () => {
        const res = await DbService.restRequest(`/notifications?id=eq.${id}&user_id=eq.${request.user!.id}`, {
          method: 'PATCH',
          body: { is_read: true, read_at: now.toISOString() },
        });
        return res[0];
      }
    );

    return reply.send({ success: true, data: updated });
  });

  // Mark all as read
  fastify.post('/read-all', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    const now = new Date();

    await DbService.query(
      async () => {
        await prisma.notification.updateMany({
          where: { userId, isRead: false },
          data: { isRead: true, readAt: now },
        });
      },
      async () => {
        await DbService.restRequest(`/notifications?user_id=eq.${userId}&is_read=eq.false`, {
          method: 'PATCH',
          body: { is_read: true, read_at: now.toISOString() },
        });
      }
    );

    return reply.send({ success: true, data: { message: 'All notifications marked as read' } });
  });
}
