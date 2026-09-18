import { FastifyReply, FastifyRequest } from 'fastify';
import { DigitalIdService } from './digital-id.service.js';

export class DigitalIdController {
  public static async getMyCard(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user?.employeeId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Employee profile required' },
      });
    }

    const card = await DigitalIdService.getMyCard(request.user.employeeId);
    return reply.send({
      success: true,
      data: card,
    });
  }

  public static async verifyPublicToken(request: FastifyRequest, reply: FastifyReply) {
    const { token } = request.params as { token: string };
    const result = await DigitalIdService.verifyPublicToken(token);
    return reply.send({
      success: true,
      data: result,
    });
  }
}
