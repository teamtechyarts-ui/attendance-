import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';
import { DateTimeUtil } from '../../utils/datetime.js';
import { AuditService } from '../../services/audit.service.js';
import { CreateDailyReportInput } from '../../validation/index.js';
import { AuthUser } from '../../types/index.js';

export class ReportService {
  public static async getTodayReport(employeeId: string) {
    const todayStr = DateTimeUtil.getTodayDateString();
    return DbService.query(
      async () => {
        return await prisma.dailyWorkReport.findUnique({
          where: {
            employeeId_reportDate: {
              employeeId,
              reportDate: new Date(todayStr),
            },
          },
        });
      },
      async () => {
        const res = await DbService.restRequest<any[]>(
          `/daily_work_reports?employee_id=eq.${employeeId}&report_date=eq.${todayStr}`
        );
        return res?.[0] || null;
      }
    );
  }

  public static async listReports(params: {
    employeeId?: string;
    reportDate?: string;
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
        if (params.reportDate) {
          where.reportDate = new Date(params.reportDate);
        }

        const [items, total] = await Promise.all([
          prisma.dailyWorkReport.findMany({
            where,
            include: {
              employee: { select: { id: true, displayName: true, employeeCode: true, profilePhotoUrl: true } },
              reviewer: { select: { id: true, email: true } },
            },
            orderBy: { reportDate: 'desc' },
            skip,
            take: limit,
          }),
          prisma.dailyWorkReport.count({ where }),
        ]);

        return {
          items,
          meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
      },
      async () => {
        let path = `/daily_work_reports?select=*,employee:employees(id,display_name,employee_code,profile_photo_url),reviewer:users(id,email)&order=report_date.desc&limit=${limit}&offset=${skip}`;
        if (params.user.role === 'EMPLOYEE' && params.user.employeeId) {
          path += `&employee_id=eq.${params.user.employeeId}`;
        } else if (params.employeeId) {
          path += `&employee_id=eq.${params.employeeId}`;
        }
        if (params.reportDate) {
          path += `&report_date=eq.${params.reportDate}`;
        }

        const items = await DbService.restRequest<any[]>(path);
        return {
          items,
          meta: { page, limit, total: items.length, totalPages: 1 },
        };
      }
    );
  }

  public static async submitReport(
    employeeId: string,
    input: CreateDailyReportInput,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    const reportDate = new Date(input.reportDate);
    const now = new Date();

    return DbService.query(
      async () => {
        const report = await prisma.dailyWorkReport.upsert({
          where: {
            employeeId_reportDate: {
              employeeId,
              reportDate,
            },
          },
          update: {
            description: input.description,
            blockers: input.blockers || null,
            status: input.status || 'SUBMITTED',
            submittedAt: now,
          },
          create: {
            employeeId,
            reportDate,
            description: input.description,
            blockers: input.blockers || null,
            status: input.status || 'SUBMITTED',
            submittedAt: now,
          },
          include: { employee: true },
        });

        await AuditService.log({
          userId: user.id,
          employeeId,
          action: 'REPORT_SUBMITTED',
          entityType: 'daily_work_report',
          entityId: report.id,
          description: `Submitted daily work report for ${input.reportDate}`,
          ipAddress: clientInfo.ipAddress,
          userAgent: clientInfo.userAgent,
        });

        return report;
      },
      async () => {
        const res = await DbService.restRequest<any[]>('/daily_work_reports?on_conflict=employee_id,report_date', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
          body: {
            employee_id: employeeId,
            report_date: input.reportDate,
            description: input.description,
            blockers: input.blockers || null,
            status: input.status || 'SUBMITTED',
            submitted_at: now.toISOString(),
          },
        });
        return res[0];
      }
    );
  }

  public static async reviewReport(reportId: string, reviewer: AuthUser) {
    const now = new Date();
    return DbService.query(
      async () => {
        return await prisma.dailyWorkReport.update({
          where: { id: reportId },
          data: {
            status: 'REVIEWED',
            reviewedBy: reviewer.id,
            reviewedAt: now,
          },
        });
      },
      async () => {
        const res = await DbService.restRequest(`/daily_work_reports?id=eq.${reportId}`, {
          method: 'PATCH',
          body: {
            status: 'REVIEWED',
            reviewed_by: reviewer.id,
            reviewed_at: now.toISOString(),
          },
        });
        return res[0];
      }
    );
  }
}
