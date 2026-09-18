import { FastifyReply, FastifyRequest } from 'fastify';
import { CalendarService } from './calendar.service.js';
import { createCalendarEventSchema, updateCalendarEventSchema } from '../../validation/index.js';

export class CalendarController {
  public static async getEvents(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;
    const params = request.params as any;
    const now = new Date();
    const year = params?.year ? parseInt(params.year, 10) : query?.year ? parseInt(query.year, 10) : now.getFullYear();
    const month = params?.month ? parseInt(params.month, 10) : query?.month ? parseInt(query.month, 10) : now.getMonth() + 1;

    const data = await CalendarService.getEvents({
      year,
      month,
      user: request.user!,
      employeeId: query?.employeeId,
    });

    return reply.send({
      success: true,
      data,
    });
  }

  public static async createEvent(request: FastifyRequest, reply: FastifyReply) {
    const body = createCalendarEventSchema.parse(request.body);
    const event = await CalendarService.createEvent(body, request.user!);

    return reply.status(201).send({
      success: true,
      data: event,
    });
  }

  public static async updateEvent(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = updateCalendarEventSchema.parse(request.body);
    const event = await CalendarService.updateEvent(id, body, request.user!);

    return reply.send({
      success: true,
      data: event,
    });
  }

  public static async deleteEvent(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const result = await CalendarService.deleteEvent(id, request.user!);

    return reply.send({
      success: true,
      data: result,
    });
  }
}
