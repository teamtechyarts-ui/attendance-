import { FastifyInstance } from 'fastify';
import { DigitalIdController } from './digital-id.controller.js';
import { authenticate } from '../../middleware/auth.js';

export async function digitalIdRoutes(fastify: FastifyInstance) {
  // Public verification endpoint
  fastify.get('/verify/:token', DigitalIdController.verifyPublicToken);

  // Authenticated routes
  fastify.get('/me', { preHandler: [authenticate] }, DigitalIdController.getMyCard);
  fastify.get('/card', { preHandler: [authenticate] }, DigitalIdController.getMyCard);
}
