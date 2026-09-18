import { FastifyReply, FastifyRequest } from 'fastify';
import { FeedbackService } from './feedback.service.js';
import { createFeedbackSchema } from '../../validation/index.js';

export class FeedbackController {
  public static async list(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;
    const result = await FeedbackService.listFeedback({
      employeeId: query.employeeId,
      period: query.period,
      user: request.user!,
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 30,
    });

    return reply.send({
      success: true,
      data: result.items,
      meta: result.meta,
    });
  }

  public static async create(request: FastifyRequest, reply: FastifyReply) {
    const body = createFeedbackSchema.parse(request.body);
    const feedback = await FeedbackService.createFeedback(body, request.user!, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({
      success: true,
      data: feedback,
    });
  }
}
