import { FastifyInstance } from 'fastify';
import { ReportController } from './report.controller.js';
import { authenticate, requireActiveAttendance } from '../../middleware/auth.js';
import { requireManagerOrAdmin } from '../../middleware/permissions.js';

export async function reportRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireActiveAttendance);

  fastify.get('/today', ReportController.getToday);
  fastify.get('/', ReportController.list);
  fastify.post('/', ReportController.submit);
  fastify.put('/:id/review', { preHandler: [requireManagerOrAdmin()] }, ReportController.review);
}
