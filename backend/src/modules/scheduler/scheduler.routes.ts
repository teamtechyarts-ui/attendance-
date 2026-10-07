import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SchedulerService } from '../../services/scheduler.service.js';
import { config } from '../../config/env.js';

export async function schedulerRoutes(fastify: FastifyInstance) {
  /**
   * Secure endpoint to manually or externally trigger a scheduler tick (e.g., Hostinger Cron Job)
   * Headers:
   *   x-scheduler-secret: <JWT_SECRET or SCHEDULER_SECRET>
   * OR
   *   Authorization: Bearer <JWT_SECRET or SCHEDULER_SECRET>
   */
  fastify.post('/tick', async (request: FastifyRequest, reply: FastifyReply) => {
    const headerSecret = (request.headers['x-scheduler-secret'] as string) || '';
    const authHeader = (request.headers['authorization'] as string) || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';

    const providedSecret = headerSecret || bearerToken;
    const expectedSecret = process.env.SCHEDULER_SECRET || config.jwtAccessSecret;

    if (!providedSecret || providedSecret !== expectedSecret) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED_SCHEDULER', message: 'Invalid or missing scheduler secret' },
      });
    }

    const result = await SchedulerService.runSchedulerTick();
    return reply.send(result);
  });
}
