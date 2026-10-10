import { FastifyInstance } from 'fastify';
import { CalendarController } from './calendar.controller.js';
import { HolidayController } from './holiday.controller.js';
import { authenticate, requireActiveAttendance } from '../../middleware/auth.js';

export async function calendarRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireActiveAttendance);

  // Calendar Events
  fastify.get('/events', CalendarController.getEvents);
  fastify.get('/year/:year', CalendarController.getEvents);
  fastify.get('/', CalendarController.getEvents);
  fastify.post('/events', CalendarController.createEvent);
  fastify.put('/events/:id', CalendarController.updateEvent);
  fastify.patch('/events/:id', CalendarController.updateEvent);
  fastify.delete('/events/:id', CalendarController.deleteEvent);

  // Authoritative Holidays
  fastify.get('/holidays', HolidayController.getHolidays);
  fastify.post('/holidays', HolidayController.createHoliday);
  fastify.delete('/holidays/:id', HolidayController.deleteHoliday);
}
