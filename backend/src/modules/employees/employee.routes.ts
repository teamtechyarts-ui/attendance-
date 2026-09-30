import { FastifyInstance } from 'fastify';
import { EmployeeController } from './employee.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permissions.js';

export async function employeeRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // Self Profile Update
  fastify.put('/me/profile', EmployeeController.updateSelfProfile);

  // Next Employee Code helper
  fastify.get('/next-code', { preHandler: [requirePermission('EMPLOYEE_CREATE')] }, EmployeeController.getNextCode);

  // Active / Assignable Employees (for Projects, Tasks, and Scope assignments)
  fastify.get('/assignable', EmployeeController.listAssignable);

  // Admin / Manager Routes
  fastify.get('/', { preHandler: [requirePermission('EMPLOYEE_VIEW')] }, EmployeeController.list);
  fastify.get('/:id', { preHandler: [requirePermission('EMPLOYEE_VIEW')] }, EmployeeController.getById);
  fastify.post('/', { preHandler: [requirePermission('EMPLOYEE_CREATE')] }, EmployeeController.create);
  fastify.put('/:id', { preHandler: [requirePermission('EMPLOYEE_EDIT')] }, EmployeeController.update);
  fastify.post('/:id/resend-onboarding', { preHandler: [requirePermission('EMPLOYEE_EDIT')] }, EmployeeController.resendOnboarding);
  fastify.post('/:id/reactivate', { preHandler: [requirePermission('EMPLOYEE_DEACTIVATE')] }, EmployeeController.reactivate);
  fastify.post('/:id/activate', { preHandler: [requirePermission('EMPLOYEE_DEACTIVATE')] }, EmployeeController.reactivate);
  fastify.post('/:id/deactivate', { preHandler: [requirePermission('EMPLOYEE_DEACTIVATE')] }, EmployeeController.deactivate);
  fastify.delete('/:id', { preHandler: [requirePermission('EMPLOYEE_DEACTIVATE')] }, EmployeeController.deactivate);
}

