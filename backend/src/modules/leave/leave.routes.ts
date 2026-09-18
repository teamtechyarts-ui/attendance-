import { FastifyInstance } from 'fastify';
import { LeaveController } from './leave.controller.js';
import { authenticate, requireActiveAttendance } from '../../middleware/auth.js';
import { requireManagerOrAdmin } from '../../middleware/permissions.js';

export async function leaveRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireActiveAttendance);

  fastify.get('/types', LeaveController.getTypes);
  fastify.get('/balances', LeaveController.getBalances);
  fastify.get('/requests', LeaveController.listRequests);
  fastify.post('/requests', LeaveController.requestLeave);
  fastify.delete('/requests/:id/cancel', LeaveController.cancelRequest);

  // Admin / Manager Review
  fastify.put('/requests/:id/review', { preHandler: [requireManagerOrAdmin()] }, LeaveController.reviewRequest);
}
