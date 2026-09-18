import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';
import { AuditService } from '../../services/audit.service.js';
import { EmailService } from '../../services/email.service.js';
import { leaveSubmittedTemplate, leaveApprovedTemplate, leaveRejectedTemplate } from '../email/email.templates.js';
import { config } from '../../config/env.js';
import { CreateLeaveRequestInput } from '../../validation/index.js';
import { AuthUser, LeaveStatus } from '../../types/index.js';


export class LeaveService {
  /**
   * Get all active leave types
   */
  public static async getLeaveTypes() {
    return DbService.query(
      async () => prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      async () => DbService.restRequest('/leave_types?is_active=eq.true&order=name.asc')
    );
  }

  /**
   * Get employee leave balances for the year
   */
  public static async getBalances(employeeId: string, year: number = new Date().getFullYear()) {
    return DbService.query(
      async () => {
        return await prisma.employeeLeaveBalance.findMany({
          where: { employeeId, year },
          include: { leaveType: true },
        });
      },
      async () => {
        return await DbService.restRequest(
          `/employee_leave_balances?employee_id=eq.${employeeId}&year=eq.${year}&select=*,leave_type:leave_types(*)`
        );
      }
    );
  }

  /**
   * List Leave Requests
   */
  public static async listRequests(params: {
    employeeId?: string;
    status?: LeaveStatus;
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
        if (params.status) where.status = params.status;

        const [items, total] = await Promise.all([
          prisma.leaveRequest.findMany({
            where,
            include: {
              leaveType: true,
              employee: { select: { id: true, displayName: true, employeeCode: true, email: true } },
              reviewer: { select: { id: true, email: true } },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
          }),
          prisma.leaveRequest.count({ where }),
        ]);

        return {
          items,
          meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
      },
      async () => {
        let path = `/leave_requests?select=*,leave_type:leave_types(*),employee:employees(id,display_name,employee_code,email),reviewer:users(id,email)&order=created_at.desc&limit=${limit}&offset=${skip}`;
        if (params.user.role === 'EMPLOYEE' && params.user.employeeId) {
          path += `&employee_id=eq.${params.user.employeeId}`;
        } else if (params.employeeId) {
          path += `&employee_id=eq.${params.employeeId}`;
        }
        if (params.status) path += `&status=eq.${params.status}`;

        const items = await DbService.restRequest<any[]>(path);
        return {
          items,
          meta: { page, limit, total: items.length, totalPages: 1 },
        };
      }
    );
  }

  /**
   * Request Leave
   */
  public static async requestLeave(
    employeeId: string,
    input: CreateLeaveRequestInput,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    const year = start.getFullYear();

    if (start > end) {
      const err: any = new Error('Start date cannot be after end date');
      err.statusCode = 400;
      throw err;
    }

    return DbService.query(
      async () => {
        return await prisma.$transaction(async (tx) => {
          // 1. Check overlapping requests
          const overlap = await tx.leaveRequest.findFirst({
            where: {
              employeeId,
              status: { in: ['PENDING', 'APPROVED'] },
              OR: [
                { startDate: { lte: end }, endDate: { gte: start } },
              ],
            },
          });

          if (overlap) {
            const err: any = new Error('You already have a pending or approved leave request overlapping these dates');
            err.statusCode = 400;
            err.code = 'OVERLAPPING_LEAVE_REQUEST';
            throw err;
          }

          // 2. Check balance
          let balance = await tx.employeeLeaveBalance.findUnique({
            where: {
              employeeId_leaveTypeId_year: {
                employeeId,
                leaveTypeId: input.leaveTypeId,
                year,
              },
            },
          });

          if (!balance) {
            const leaveType = await tx.leaveType.findUnique({ where: { id: input.leaveTypeId } });
            balance = await tx.employeeLeaveBalance.create({
              data: {
                employeeId,
                leaveTypeId: input.leaveTypeId,
                year,
                allocatedDays: leaveType?.defaultDaysPerYear || 0,
                usedDays: 0,
                pendingDays: 0,
              },
            });
          }

          const available = Number(balance.allocatedDays) - Number(balance.usedDays) - Number(balance.pendingDays);
          if (input.totalDays > available) {
            const err: any = new Error(`Insufficient leave balance. Requested: ${input.totalDays}, Available: ${available}`);
            err.statusCode = 400;
            err.code = 'INSUFFICIENT_LEAVE_BALANCE';
            throw err;
          }

          // 3. Create request
          const request = await tx.leaveRequest.create({
            data: {
              employeeId,
              leaveTypeId: input.leaveTypeId,
              startDate: start,
              endDate: end,
              totalDays: input.totalDays,
              reason: input.reason,
              status: 'PENDING',
            },
            include: { leaveType: true },
          });

          // 4. Update pending days
          await tx.employeeLeaveBalance.update({
            where: { id: balance.id },
            data: {
              pendingDays: Number(balance.pendingDays) + input.totalDays,
            },
          });

          await AuditService.log({
            userId: user.id,
            employeeId,
            action: 'LEAVE_REQUESTED',
            entityType: 'leave_request',
            entityId: request.id,
            description: `Requested ${input.totalDays} days of ${request.leaveType.name} (${input.startDate} to ${input.endDate})`,
            ipAddress: clientInfo.ipAddress,
            userAgent: clientInfo.userAgent,
          });

          // Asynchronously notify manager if assigned
          const emp = await tx.employee.findUnique({
            where: { id: employeeId },
            include: { manager: { select: { userId: true, email: true, displayName: true } } },
          });

          if (emp?.manager?.userId) {
            const leaveTpl = leaveSubmittedTemplate({
              recipientName: emp.manager.displayName || 'Manager',
              employeeName: emp.displayName,
              leaveType: request.leaveType.name,
              startDate: input.startDate,
              endDate: input.endDate,
              totalDays: input.totalDays,
              reason: input.reason,
              reviewUrl: `${config.corsOrigin}/leaves`,
            });

            EmailService.createAndNotify({
              userId: emp.manager.userId,
              type: 'LEAVE',
              title: `New Leave Request: ${emp.displayName} (${request.leaveType.name})`,
              message: `${emp.displayName} requested ${input.totalDays} day(s) of ${request.leaveType.name}.`,
              actionUrl: '/leaves',
              email: emp.manager.email
                ? {
                    to: emp.manager.email,
                    subject: leaveTpl.subject,
                    html: leaveTpl.html,
                    text: leaveTpl.text,
                  }
                : undefined,
            }).catch((err) => {
              console.error('[LeaveService] Failed to notify manager of leave request:', err.message);
            });
          }

          return request;
        });
      },

      async () => {
        // REST Fallback
        const reqs = await DbService.restRequest<any[]>('/leave_requests', {
          method: 'POST',
          body: {
            employee_id: employeeId,
            leave_type_id: input.leaveTypeId,
            start_date: input.startDate,
            end_date: input.endDate,
            total_days: input.totalDays,
            reason: input.reason,
            status: 'PENDING',
          },
        });
        return reqs[0];
      }
    );
  }

  /**
   * Review Leave Request (APPROVE or REJECT)
   */
  public static async reviewRequest(
    requestId: string,
    status: 'APPROVED' | 'REJECTED',
    comment: string | null | undefined,
    reviewer: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    const now = new Date();

    return DbService.query(
      async () => {
        return await prisma.$transaction(async (tx) => {
          const req = await tx.leaveRequest.findUnique({
            where: { id: requestId },
            include: { employee: true, leaveType: true },
          });

          if (!req) {
            const err: any = new Error('Leave request not found');
            err.statusCode = 404;
            throw err;
          }

          if (req.status !== 'PENDING') {
            const err: any = new Error(`Leave request has already been ${req.status.toLowerCase()}`);
            err.statusCode = 400;
            throw err;
          }

          const year = req.startDate.getFullYear();
          const balance = await tx.employeeLeaveBalance.findUnique({
            where: {
              employeeId_leaveTypeId_year: {
                employeeId: req.employeeId,
                leaveTypeId: req.leaveTypeId,
                year,
              },
            },
          });

          const totalDays = Number(req.totalDays);

          if (status === 'APPROVED') {
            if (balance) {
              await tx.employeeLeaveBalance.update({
                where: { id: balance.id },
                data: {
                  pendingDays: Math.max(0, Number(balance.pendingDays) - totalDays),
                  usedDays: Number(balance.usedDays) + totalDays,
                },
              });
            }
          } else {
            // REJECTED: restore pending days
            if (balance) {
              await tx.employeeLeaveBalance.update({
                where: { id: balance.id },
                data: {
                  pendingDays: Math.max(0, Number(balance.pendingDays) - totalDays),
                },
              });
            }
          }

          const updated = await tx.leaveRequest.update({
            where: { id: requestId },
            data: {
              status,
              reviewedBy: reviewer.id,
              reviewedAt: now,
              reviewComment: comment || null,
            },
          });

          // Send notification & email to employee
          if (req.employee) {
            const empName = req.employee.displayName || `${req.employee.firstName} ${req.employee.lastName}`.trim();
            const reviewerName = reviewer.email || 'Manager';
            const isApproved = status === 'APPROVED';

            const emailTpl = isApproved
              ? leaveApprovedTemplate({
                  employeeName: empName,
                  leaveType: req.leaveType.name,
                  startDate: req.startDate.toISOString().slice(0, 10),
                  endDate: req.endDate.toISOString().slice(0, 10),
                  totalDays: totalDays,
                  reviewedBy: reviewerName,
                  comment: comment || undefined,
                })
              : leaveRejectedTemplate({
                  employeeName: empName,
                  leaveType: req.leaveType.name,
                  startDate: req.startDate.toISOString().slice(0, 10),
                  endDate: req.endDate.toISOString().slice(0, 10),
                  totalDays: totalDays,
                  reviewedBy: reviewerName,
                  reason: comment || undefined,
                });

            EmailService.createAndNotify({
              userId: req.employee.userId,
              type: 'LEAVE',
              title: `Leave Request ${status}: ${req.leaveType.name}`,
              message: `Your ${totalDays}-day leave request for ${req.leaveType.name} has been ${status.toLowerCase()}.${comment ? ` Note: ${comment}` : ''}`,
              actionUrl: '/leaves',
              email: req.employee.email
                ? {
                    to: req.employee.email,
                    subject: emailTpl.subject,
                    html: emailTpl.html,
                    text: emailTpl.text,
                  }
                : undefined,
            }).catch((err) => {
              console.error('[LeaveService] Failed to notify employee of leave decision:', err.message);
            });
          }

          await AuditService.log({
            userId: reviewer.id,
            employeeId: req.employeeId,
            action: status === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
            entityType: 'leave_request',
            entityId: requestId,
            description: `${status} leave request of ${totalDays} days for ${req.employee.displayName}`,
            ipAddress: clientInfo.ipAddress,
            userAgent: clientInfo.userAgent,
          });

          return updated;
        });
      },

      async () => {
        const res = await DbService.restRequest(`/leave_requests?id=eq.${requestId}`, {
          method: 'PATCH',
          body: {
            status,
            reviewed_by: reviewer.id,
            reviewed_at: now.toISOString(),
            review_comment: comment || null,
          },
        });
        return res[0];
      }
    );
  }

  /**
   * Cancel Pending Leave Request
   */
  public static async cancelRequest(
    requestId: string,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    return DbService.query(
      async () => {
        return await prisma.$transaction(async (tx) => {
          const req = await tx.leaveRequest.findUnique({ where: { id: requestId } });
          if (!req) {
            const err: any = new Error('Request not found');
            err.statusCode = 404;
            throw err;
          }

          if (user.role === 'EMPLOYEE' && req.employeeId !== user.employeeId) {
            const err: any = new Error('Forbidden');
            err.statusCode = 403;
            throw err;
          }

          if (req.status !== 'PENDING') {
            const err: any = new Error('Only pending requests can be cancelled');
            err.statusCode = 400;
            throw err;
          }

          const year = req.startDate.getFullYear();
          const balance = await tx.employeeLeaveBalance.findUnique({
            where: {
              employeeId_leaveTypeId_year: {
                employeeId: req.employeeId,
                leaveTypeId: req.leaveTypeId,
                year,
              },
            },
          });

          if (balance) {
            await tx.employeeLeaveBalance.update({
              where: { id: balance.id },
              data: {
                pendingDays: Math.max(0, Number(balance.pendingDays) - Number(req.totalDays)),
              },
            });
          }

          const updated = await tx.leaveRequest.update({
            where: { id: requestId },
            data: { status: 'CANCELLED' },
          });

          return updated;
        });
      },
      async () => {
        const res = await DbService.restRequest(`/leave_requests?id=eq.${requestId}`, {
          method: 'PATCH',
          body: { status: 'CANCELLED' },
        });
        return res[0];
      }
    );
  }
}
