import { prisma } from '../plugins/prisma.js';
import { DbService } from './db.service.js';
import { AuditAction } from '../types/index.js';

export interface CreateAuditLogInput {
  userId?: string | null;
  employeeId?: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  description?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export class AuditService {
  public static async log(input: CreateAuditLogInput): Promise<void> {
    try {
      await DbService.query(
        async () => {
          await prisma.auditLog.create({
            data: {
              userId: input.userId || null,
              employeeId: input.employeeId || null,
              action: input.action as any,
              entityType: input.entityType || null,
              entityId: input.entityId || null,
              description: input.description || null,
              ipAddress: input.ipAddress || null,
              userAgent: input.userAgent || null,
              metadata: (input.metadata as any) || null,
            },
          });
        },
        async () => {
          await DbService.restRequest('/audit_logs', {
            method: 'POST',
            body: {
              user_id: input.userId || null,
              employee_id: input.employeeId || null,
              action: input.action,
              entity_type: input.entityType || null,
              entity_id: input.entityId || null,
              description: input.description || null,
              ip_address: input.ipAddress || null,
              user_agent: input.userAgent || null,
              metadata: input.metadata || null,
            },
          });
        }
      );
    } catch (err: any) {
      console.error('[AuditService] Failed to record audit log:', err.message);
    }
  }
}
