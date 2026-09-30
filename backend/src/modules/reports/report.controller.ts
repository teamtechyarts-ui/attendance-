import { FastifyReply, FastifyRequest } from 'fastify';
import { ReportService } from './report.service.js';
import { createDailyReportSchema } from '../../validation/index.js';

export class ReportController {
  public static async getToday(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user?.employeeId) {
      return reply.send({ success: true, data: null });
    }

    const report = await ReportService.getTodayReport(request.user.employeeId);
    return reply.send({
      success: true,
      data: report,
    });
  }

  public static async list(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;
    const result = await ReportService.listReports({
      employeeId: query.employeeId,
      reportDate: query.reportDate,
      adminView: query.adminView === 'true' || query.adminView === true,
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

  public static async submit(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user?.employeeId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Employee profile required' },
      });
    }

    const body = createDailyReportSchema.parse(request.body);
    const report = await ReportService.submitReport(request.user.employeeId, body, request.user, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({
      success: true,
      data: report,
    });
  }

  public static async review(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const report = await ReportService.reviewReport(id, request.user!);
    return reply.send({
      success: true,
      data: report,
    });
  }
}
