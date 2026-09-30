import { FastifyInstance } from 'fastify';
import { LeaveController } from './leave.controller.js';
import { authenticate, requireActiveAttendance } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permissions.js';

export async function leaveRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireActiveAttendance);

  // Leave Types
  fastify.get('/types', LeaveController.getTypes);
  fastify.post('/types', { preHandler: [requirePermission('LEAVE_MANAGE')] }, LeaveController.createType);
  fastify.put('/types/:id', { preHandler: [requirePermission('LEAVE_MANAGE')] }, LeaveController.updateType);
  fastify.delete('/types/:id', { preHandler: [requirePermission('LEAVE_MANAGE')] }, LeaveController.deleteType);

  // Leave Policies
  fastify.get('/policies', LeaveController.getPolicies);
  fastify.put('/policies/:leaveTypeId', { preHandler: [requirePermission('LEAVE_MANAGE')] }, LeaveController.updatePolicy);

  // Leave Allocations
  fastify.get('/allocations', LeaveController.getAllocations);
  fastify.post('/allocations', { preHandler: [requirePermission('LEAVE_MANAGE')] }, LeaveController.createAllocation);
  fastify.put('/allocations/:id', { preHandler: [requirePermission('LEAVE_MANAGE')] }, LeaveController.updateAllocation);
  fastify.delete('/allocations/:id', { preHandler: [requirePermission('LEAVE_MANAGE')] }, LeaveController.deleteAllocation);

  // Leave Balances & Organization Summary
  fastify.get('/balances', LeaveController.getBalances);
  fastify.get('/organization-summary', { preHandler: [requirePermission('LEAVE_VIEW')] }, LeaveController.getOrganizationSummary);

  // Leave Requests
  fastify.get('/requests', LeaveController.listRequests);
  fastify.post('/requests', LeaveController.requestLeave);
  fastify.delete('/requests/:id/cancel', LeaveController.cancelRequest);

  // Admin / Manager Review
  fastify.put('/requests/:id/review', { preHandler: [requirePermission('LEAVE_APPROVE')] }, LeaveController.reviewRequest);
}
