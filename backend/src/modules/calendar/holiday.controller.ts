import { FastifyReply, FastifyRequest } from 'fastify';
import { HolidayService } from './holiday.service.js';
import { z } from 'zod';

const registerHolidaySchema = z.object({
  name: z.string().min(1, 'Holiday name is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  description: z.string().optional().nullable(),
  isOptional: z.boolean().optional().default(false),
});

export class HolidayController {
  public static async getHolidays(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;
    const year = query?.year ? parseInt(query.year, 10) : undefined;
    const holidays = await HolidayService.getHolidays(year);

    return reply.send({
      success: true,
      data: holidays,
    });
  }

  public static async createHoliday(request: FastifyRequest, reply: FastifyReply) {
    const body = registerHolidaySchema.parse(request.body);
    const holiday = await HolidayService.registerHoliday(body, request.user!);

    return reply.status(201).send({
      success: true,
      data: holiday,
      message: 'Holiday registered successfully',
    });
  }

  public static async deleteHoliday(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const result = await HolidayService.deleteHoliday(id, request.user!);

    return reply.send({
      success: true,
      data: result,
    });
  }
}
