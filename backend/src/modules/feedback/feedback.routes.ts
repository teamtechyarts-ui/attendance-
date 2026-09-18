import { FastifyInstance } from 'fastify';
import { FeedbackController } from './feedback.controller.js';
import { authenticate, requireActiveAttendance } from '../../middleware/auth.js';
import { requireManagerOrAdmin } from '../../middleware/permissions.js';

export async function feedbackRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireActiveAttendance);

  fastify.get('/', FeedbackController.list);
  fastify.post('/', { preHandler: [requireManagerOrAdmin()] }, FeedbackController.create);
}
