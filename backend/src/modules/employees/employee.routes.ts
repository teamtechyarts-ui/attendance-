import { FastifyInstance } from 'fastify';
import { EmployeeController } from './employee.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requireAdmin, requireManagerOrAdmin } from '../../middleware/permissions.js';

export async function employeeRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // Self Profile Update
  fastify.put('/me/profile', EmployeeController.updateSelfProfile);

  // Admin / Manager Routes
  fastify.get('/', { preHandler: [requireManagerOrAdmin()] }, EmployeeController.list);
  fastify.get('/:id', { preHandler: [requireManagerOrAdmin()] }, EmployeeController.getById);
  fastify.post('/', { preHandler: [requireAdmin()] }, EmployeeController.create);
  fastify.put('/:id', { preHandler: [requireAdmin()] }, EmployeeController.update);
  fastify.post('/:id/resend-onboarding', { preHandler: [requireAdmin()] }, EmployeeController.resendOnboarding);
  fastify.post('/:id/reactivate', { preHandler: [requireAdmin()] }, EmployeeController.reactivate);
  fastify.post('/:id/activate', { preHandler: [requireAdmin()] }, EmployeeController.reactivate);
  fastify.post('/:id/deactivate', { preHandler: [requireAdmin()] }, EmployeeController.deactivate);
  fastify.delete('/:id', { preHandler: [requireAdmin()] }, EmployeeController.deactivate);
}

