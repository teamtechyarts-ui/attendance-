import { FastifyInstance } from 'fastify';
import { RbacController } from './rbac.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requireSuperAdmin } from '../../middleware/permissions.js';

export async function rbacRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // View master permissions registry (Super Admin + Limited Admin with ROLE_VIEW or PERMISSION_VIEW)
  fastify.get('/permissions', RbacController.getPermissions);

  // Super Admin Role Assignment Endpoints
  fastify.get('/assignments', { preHandler: [requireSuperAdmin()] }, RbacController.getAssignments);
  fastify.get('/assignments/:employeeId', { preHandler: [requireSuperAdmin()] }, RbacController.getAssignmentByEmployee);
  fastify.post('/assignments', { preHandler: [requireSuperAdmin()] }, RbacController.grantAssignment);
  fastify.post('/assignments/:employeeId', { preHandler: [requireSuperAdmin()] }, RbacController.grantAssignment);
  fastify.delete('/assignments/:employeeId', { preHandler: [requireSuperAdmin()] }, RbacController.revokeAssignment);
}
