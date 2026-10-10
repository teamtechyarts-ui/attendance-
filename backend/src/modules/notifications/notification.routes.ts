import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PassThrough } from 'stream';
import { authenticate } from '../../middleware/auth.js';
import { NotificationService } from './notification.service.js';

export async function notificationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // Get notifications with pagination and optional unread filter
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    const query = request.query as { page?: string; limit?: string; unreadOnly?: string };
    
    const page = query.page ? parseInt(query.page, 10) : 1;
    const limit = query.limit ? parseInt(query.limit, 10) : 20;
    const unreadOnly = query.unreadOnly === 'true' || query.unreadOnly === '1';

    const result = await NotificationService.getNotifications({
      userId,
      page,
      limit,
      unreadOnly,
    });

    return reply.send({
      success: true,
      data: result.items,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        unreadCount: result.unreadCount,
      },
    });
  });

  // Get unread notification count
  fastify.get('/unread-count', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    const count = await NotificationService.getUnreadCount(userId);
    return reply.send({ success: true, data: { unreadCount: count } });
  });

  // Server-Sent Events (SSE) Live Stream Endpoint
  fastify.get('/stream', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;

    const stream = new PassThrough();

    reply
      .header('Content-Type', 'text/event-stream')
      .header('Cache-Control', 'no-cache, no-transform')
      .header('Connection', 'keep-alive')
      .header('X-Accel-Buffering', 'no');

    // Send initial connected heartbeat
    stream.write(`event: connected\ndata: ${JSON.stringify({ userId, connectedAt: new Date().toISOString() })}\n\n`);

    // Listen for user notifications
    const unsubscribe = NotificationService.subscribe(userId, (notification) => {
      try {
        if (!stream.destroyed) {
          stream.write(`event: notification\ndata: ${JSON.stringify(notification)}\n\n`);
        }
      } catch {
        // Socket closed
      }
    });

    // Keep connection alive with periodic comment pings
    const interval = setInterval(() => {
      try {
        if (!stream.destroyed) {
          stream.write(': ping\n\n');
        } else {
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
      }
    }, 25000);

    // Clean up on disconnect or error
    const cleanup = () => {
      clearInterval(interval);
      unsubscribe();
      if (!stream.destroyed) {
        stream.end();
      }
    };

    request.raw.on('close', cleanup);
    stream.on('error', cleanup);

    return reply.send(stream);
  });

  // Mark single notification as read
  fastify.patch('/:id/read', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;

    await NotificationService.markAsRead(id, userId);
    return reply.send({ success: true, data: { id, isRead: true, readAt: new Date().toISOString() } });
  });

  // Mark all as read (POST and PATCH supported)
  const markAllHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    const count = await NotificationService.markAllAsRead(userId);
    return reply.send({ success: true, data: { message: 'All notifications marked as read', count } });
  };

  fastify.post('/read-all', markAllHandler);
  fastify.patch('/read-all', markAllHandler);

  // Bulk delete notifications (supports DELETE /bulk and POST /bulk-delete)
  const bulkDeleteHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    const { ids } = (request.body || {}) as { ids: string[] };
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'At least one notification ID is required' },
      });
    }

    const result = await NotificationService.bulkDeleteNotifications(ids, userId);
    return reply.send({
      success: true,
      data: {
        message: `Successfully deleted ${result.deletedCount} notification(s)`,
        deletedCount: result.deletedCount,
        deletedIds: result.deletedIds,
      },
    });
  };

  fastify.delete('/bulk', bulkDeleteHandler);
  fastify.post('/bulk-delete', bulkDeleteHandler);

  // Delete ALL notifications for current user
  const deleteAllHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.id;
    const result = await NotificationService.deleteAllNotifications(userId);
    return reply.send({
      success: true,
      data: {
        message: `Successfully deleted ${result.deletedCount} notification(s)`,
        deletedCount: result.deletedCount,
      },
    });
  };

  fastify.delete('/all', deleteAllHandler);
  fastify.delete('/delete-all', deleteAllHandler);
  fastify.delete('/clear-all', deleteAllHandler);
  fastify.post('/delete-all', deleteAllHandler);

  // Delete single notification
  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;

    const deleted = await NotificationService.deleteNotification(id, userId);
    if (!deleted) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Notification not found or access denied' },
      });
    }
    return reply.send({ success: true, data: { message: 'Notification deleted', id } });
  });
}
