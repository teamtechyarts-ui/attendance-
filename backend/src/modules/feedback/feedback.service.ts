import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';
import { AuditService } from '../../services/audit.service.js';
import { CreateFeedbackInput } from '../../validation/index.js';
import { AuthUser, FeedbackPeriod } from '../../types/index.js';

export class FeedbackService {
  public static async listFeedback(params: {
    employeeId?: string;
    period?: FeedbackPeriod;
    user: AuthUser;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 30));
    const skip = (page - 1) * limit;

    return DbService.query(
      async () => {
        const where: any = {};
        if (params.user.role === 'EMPLOYEE') {
          where.employeeId = params.user.employeeId;
        } else if (params.employeeId) {
          where.employeeId = params.employeeId;
        }
        if (params.period) where.period = params.period;

        const [items, total] = await Promise.all([
          prisma.feedback.findMany({
            where,
            include: {
              employee: { select: { id: true, displayName: true, employeeCode: true, profilePhotoUrl: true } },
              reviewer: { select: { id: true, email: true } },
            },
            orderBy: { periodEnd: 'desc' },
            skip,
            take: limit,
          }),
          prisma.feedback.count({ where }),
        ]);

        return {
          items,
          meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
      },
      async () => {
        let path = `/feedback?select=*,employee:employees(id,display_name,employee_code,profile_photo_url),reviewer:users(id,email)&order=period_end.desc&limit=${limit}&offset=${skip}`;
        if (params.user.role === 'EMPLOYEE' && params.user.employeeId) {
          path += `&employee_id=eq.${params.user.employeeId}`;
        } else if (params.employeeId) {
          path += `&employee_id=eq.${params.employeeId}`;
        }
        if (params.period) path += `&period=eq.${params.period}`;

        const items = await DbService.restRequest<any[]>(path);
        return {
          items,
          meta: { page, limit, total: items.length, totalPages: 1 },
        };
      }
    );
  }

  public static async createFeedback(
    input: CreateFeedbackInput,
    reviewer: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    return DbService.query(
      async () => {
        const feedback = await prisma.feedback.create({
          data: {
            employeeId: input.employeeId,
            reviewerId: reviewer.id,
            period: input.period,
            periodStart: new Date(input.periodStart),
            periodEnd: new Date(input.periodEnd),
            productivityScore: input.productivityScore,
            qualityScore: input.qualityScore,
            communicationScore: input.communicationScore,
            ownershipScore: input.ownershipScore,
            overallScore: input.overallScore,
            strengths: input.strengths || null,
            areasToImprove: input.areasToImprove || null,
            comments: input.comments || null,
            goals: input.goals || null,
          },
          include: { employee: true },
        });

        await AuditService.log({
          userId: reviewer.id,
          employeeId: input.employeeId,
          action: 'FEEDBACK_CREATED',
          entityType: 'feedback',
          entityId: feedback.id,
          description: `Created ${input.period} feedback for ${feedback.employee.displayName} (Score: ${input.overallScore})`,
          ipAddress: clientInfo.ipAddress,
          userAgent: clientInfo.userAgent,
        });

        return feedback;
      },
      async () => {
        const res = await DbService.restRequest<any[]>('/feedback', {
          method: 'POST',
          body: {
            employee_id: input.employeeId,
            reviewer_id: reviewer.id,
            period: input.period,
            period_start: input.periodStart,
            period_end: input.periodEnd,
            productivity_score: input.productivityScore,
            quality_score: input.qualityScore,
            communication_score: input.communicationScore,
            ownership_score: input.ownershipScore,
            overall_score: input.overallScore,
            strengths: input.strengths || null,
            areas_to_improve: input.areasToImprove || null,
            comments: input.comments || null,
            goals: input.goals || null,
          },
        });
        return res[0];
      }
    );
  }
}
