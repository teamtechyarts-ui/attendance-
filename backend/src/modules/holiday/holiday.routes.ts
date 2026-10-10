import { FastifyInstance } from 'fastify';
import { HolidayController } from '../calendar/holiday.controller.js';
import { authenticate, requireActiveAttendance } from '../../middleware/auth.js';

export async function holidayRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireActiveAttendance);

  fastify.get('/', HolidayController.getHolidays);
  fastify.post('/', HolidayController.createHoliday);
  fastify.delete('/:id', HolidayController.deleteHoliday);
}
