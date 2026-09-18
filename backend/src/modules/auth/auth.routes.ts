import { FastifyInstance } from 'fastify';
import { AuthController } from './auth.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { config } from '../../config/env.js';

export async function authRoutes(fastify: FastifyInstance) {
  // Stricter rate limit on public auth routes
  fastify.post('/login', {
    config: {
      rateLimit: {
        max: config.nodeEnv === 'production' ? 10 : 100,
        timeWindow: '1 minute',
      },
    },
    handler: AuthController.login,
  });

  fastify.post('/refresh', AuthController.refresh);

  fastify.post('/forgot-password', {
    config: {
      rateLimit: {
        max: config.nodeEnv === 'production' ? 5 : 50,
        timeWindow: '1 minute',
      },
    },
    handler: AuthController.forgotPassword,
  });

  fastify.post('/reset-password', {
    config: {
      rateLimit: {
        max: config.nodeEnv === 'production' ? 5 : 50,
        timeWindow: '1 minute',
      },
    },
    handler: AuthController.resetPassword,
  });

  // Authenticated routes
  fastify.get('/me', { preHandler: [authenticate] }, AuthController.getMe);
  fastify.post('/logout', { preHandler: [authenticate] }, AuthController.logout);
  fastify.post('/change-password', {
    config: {
      rateLimit: {
        max: config.nodeEnv === 'production' ? 10 : 50,
        timeWindow: '1 minute',
      },
    },
    preHandler: [authenticate],
    handler: AuthController.changePassword,
  });
}
