import { EventEmitter } from 'events';
import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';
import { EmailService } from '../../services/email.service.js';
import { NotificationType } from '../../types/index.js';

export type GranularNotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_UPDATED'
  | 'TASK_STATUS_CHANGED'
  | 'TASK_COMPLETED'
  | 'TASK_COMMENTED'
  | 'TASK_DUE_SOON'
  | 'TASK_REASSIGNED'
  | 'PROJECT_CREATED'
  | 'PROJECT_UPDATED'
  | 'PROJECT_ASSIGNED'
  | 'PROJECT_MEMBER_ADDED'
  | 'PROJECT_MEMBER_REMOVED'
  | 'LEAVE_SUBMITTED'
  | 'LEAVE_APPROVED'
  | 'LEAVE_REJECTED'
  | 'LEAVE_CANCELLED'
  | 'CALENDAR_EVENT_CREATED'
  | 'CALENDAR_EVENT_UPDATED'
  | 'CALENDAR_EVENT_CANCELLED'
  | 'CALENDAR_EVENT_REMINDER'
  | 'ATTENDANCE_REMINDER'
  | 'ATTENDANCE_MARKED'
  | 'ATTENDANCE_UPDATED'
  | 'CHECKOUT_REMINDER'
  | 'TEAM_MEMBER_ADDED'
  | 'TEAM_MEMBER_REMOVED'
  | 'ADMIN_PERMISSION_GRANTED'
  | 'ADMIN_PERMISSION_REVOKED'
  | 'ADMIN_PERMISSION_UPDATED'
  | 'FEEDBACK'
  | 'REPORT'
  | 'SYSTEM'
  | NotificationType;

export interface CreateNotificationParams {
  userId: string;
  type: GranularNotificationType;
  title: string;
  message: string;
  actionUrl?: string | null;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  metadata?: Record<string, any>;
  email?: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  };
}

// Map granular types to database enum NotificationType
export function mapGranularToDbType(type: GranularNotificationType): NotificationType {
  switch (type) {
    case 'TASK_ASSIGNED':
    case 'TASK_UPDATED':
    case 'TASK_STATUS_CHANGED':
    case 'TASK_COMPLETED':
    case 'TASK_COMMENTED':
    case 'TASK_REASSIGNED':
      return 'TASK';
    case 'TASK_DUE_SOON':
      return 'TASK_REMINDER';
    case 'LEAVE_SUBMITTED':
    case 'LEAVE_APPROVED':
    case 'LEAVE_REJECTED':
    case 'LEAVE_CANCELLED':
      return 'LEAVE';
    case 'ATTENDANCE_REMINDER':
    case 'ATTENDANCE_MARKED':
    case 'ATTENDANCE_UPDATED':
    case 'CHECKOUT_REMINDER':
      return 'ATTENDANCE';
    case 'FEEDBACK':
      return 'FEEDBACK';
    case 'REPORT':
      return 'REPORT';
    default:
      return 'SYSTEM';
  }
}

export class NotificationService {
  private static eventEmitter = new EventEmitter();
  private static recentNotifications = new Map<string, number>();

  /**
   * Subscribe to live notifications for a specific user
   */
  public static subscribe(userId: string, listener: (notification: any) => void): () => void {
    const eventName = `notify:${userId}`;
    NotificationService.eventEmitter.on(eventName, listener);
    return () => {
      NotificationService.eventEmitter.off(eventName, listener);
    };
  }

  /**
   * Robust recipient resolver: employee.id -> employee.userId (User.id)
   * Resilient to both direct DB and Supabase REST fallback.
   */
  public static async resolveUserIdFromEmployeeId(
    employeeId: string
  ): Promise<{ userId: string; email?: string; displayName?: string } | null> {
    if (!employeeId) return null;
    try {
      const employee = await DbService.query(
        async () =>
          prisma.employee.findUnique({
            where: { id: employeeId },
            include: { user: { select: { id: true, email: true, status: true, role: true } } },
          }),
        async () => {
          const emps = await DbService.restRequest<any[]>(
            `/employees?id=eq.${employeeId}&select=*,user:users(id,email,status,role)`
          );
          return emps?.[0] || null;
        }
      );

      if (!employee) return null;

      const userId =
        employee.userId ||
        employee.user_id ||
        (Array.isArray(employee.user) ? employee.user[0]?.id : employee.user?.id);

      if (!userId) return null;

      const email =
        employee.email ||
        (Array.isArray(employee.user) ? employee.user[0]?.email : employee.user?.email);

      const displayName =
        employee.displayName ||
        employee.display_name ||
        `${employee.firstName || employee.first_name || ''} ${employee.lastName || employee.last_name || ''}`.trim();

      return { userId, email, displayName };
    } catch (err: any) {
      console.error(`[NotificationService] Failed to resolve userId for employee ${employeeId}:`, err.message);
      return null;
    }
  }

  /**
   * Robust batch resolver: employee.ids -> User.ids
   */
  public static async resolveUserIdsFromEmployeeIds(
    employeeIds: string[]
  ): Promise<Array<{ employeeId: string; userId: string; email?: string; displayName?: string }>> {
    if (!employeeIds || employeeIds.length === 0) return [];
    const uniqueIds = Array.from(new Set(employeeIds.filter(Boolean)));
    const results = await Promise.all(
      uniqueIds.map((id) => NotificationService.resolveUserIdFromEmployeeId(id))
    );

    const mapped: Array<{ employeeId: string; userId: string; email?: string; displayName?: string }> = [];
    for (let i = 0; i < uniqueIds.length; i++) {
      const resolved = results[i];
      if (resolved && resolved.userId) {
        mapped.push({
          employeeId: uniqueIds[i],
          userId: resolved.userId,
          email: resolved.email,
          displayName: resolved.displayName,
        });
      }
    }
    return mapped;
  }

  /**
   * Create a single in-app notification (and optional background email)
   */
  public static async createNotification(params: CreateNotificationParams): Promise<any> {
    if (!params.userId) {
      console.warn('[NotificationService] Skipped notification creation: missing userId');
      return null;
    }

    // Deduplication check: prevent duplicate notifications within 3 seconds
    const dedupKey = `${params.userId}:${params.type}:${params.entityId || ''}:${params.title}`;
    const now = Date.now();
    const lastSent = NotificationService.recentNotifications.get(dedupKey);
    if (lastSent && now - lastSent < 3000) {
      return null;
    }
    NotificationService.recentNotifications.set(dedupKey, now);

    // Prune old dedup entries periodically
    if (NotificationService.recentNotifications.size > 500) {
      for (const [key, timestamp] of NotificationService.recentNotifications.entries()) {
        if (now - timestamp > 10000) {
          NotificationService.recentNotifications.delete(key);
        }
      }
    }

    const dbType = mapGranularToDbType(params.type);

    try {
      const rawNotification = await DbService.query(
        async () => {
          return await prisma.notification.create({
            data: {
              userId: params.userId,
              type: dbType,
              title: params.title.trim(),
              message: params.message.trim(),
              actionUrl: params.actionUrl || null,
            },
          });
        },
        async () => {
          const res = await DbService.restRequest<any[]>('/notifications', {
            method: 'POST',
            body: {
              user_id: params.userId,
              type: dbType,
              title: params.title.trim(),
              message: params.message.trim(),
              action_url: params.actionUrl || null,
            },
          });
          return res?.[0] || null;
        }
      );

      const notification = DbService.toCamelCase(rawNotification);

      // Emit real-time event to SSE listeners
      if (notification) {
        const payload = {
          ...notification,
          granularType: params.type,
          entityType: params.entityType,
          entityId: params.entityId,
          actorId: params.actorId,
          metadata: params.metadata,
        };
        NotificationService.eventEmitter.emit(`notify:${params.userId}`, payload);
      }

      // Dispatch optional email safely in background
      if (params.email && notification?.id) {
        EmailService.sendEmail({
          to: params.email.to,
          subject: params.email.subject,
          html: params.email.html,
          text: params.email.text,
          notificationId: notification.id,
          userId: params.userId,
        }).catch((err) => {
          console.error('[NotificationService] Background email dispatch error:', err.message);
        });
      }

      return notification;
    } catch (err: any) {
      console.error('[NotificationService] Error creating notification:', err.message);
      return null;
    }
  }

  /**
   * Create multiple in-app notifications (e.g., for team/company-wide events)
   */
  public static async createBulkNotifications(
    notifications: CreateNotificationParams[]
  ): Promise<void> {
    if (!notifications || notifications.length === 0) return;

    // Deduplicate by userId
    const userMap = new Map<string, CreateNotificationParams>();
    for (const item of notifications) {
      if (item.userId && !userMap.has(item.userId)) {
        userMap.set(item.userId, item);
      }
    }

    const uniqueItems = Array.from(userMap.values());

    await Promise.allSettled(
      uniqueItems.map((item) => NotificationService.createNotification(item))
    );
  }

  /**
   * List paginated notifications strictly scoped to authenticated user
   */
  public static async getNotifications(params: {
    userId: string;
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
  }): Promise<{ items: any[]; total: number; unreadCount: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;
    const userId = params.userId;

    return DbService.query(
      async () => {
        const where: any = { userId };
        if (params.unreadOnly) {
          where.isRead = false;
        }

        const [items, total, unreadCount] = await Promise.all([
          prisma.notification.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
          }),
          prisma.notification.count({ where }),
          prisma.notification.count({ where: { userId, isRead: false } }),
        ]);

        return {
          items,
          total,
          unreadCount,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        };
      },
      async () => {
        let path = `/notifications?user_id=eq.${userId}&order=created_at.desc&limit=${limit}&offset=${skip}`;
        if (params.unreadOnly) {
          path += '&is_read=eq.false';
        }

        const items = await DbService.restRequest<any[]>(path);
        const unreadItems = await DbService.restRequest<any[]>(
          `/notifications?user_id=eq.${userId}&is_read=eq.false&select=id`
        );
        const unreadCount = unreadItems?.length || 0;
        const total = (items?.length || 0) + skip;

        return {
          items: (items || []).map((n) => DbService.toCamelCase(n)),
          total,
          unreadCount,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        };
      }
    );
  }

  /**
   * Get unread notification count for authenticated user
   */
  public static async getUnreadCount(userId: string): Promise<number> {
    return DbService.query(
      async () => {
        return await prisma.notification.count({
          where: { userId, isRead: false },
        });
      },
      async () => {
        const items = await DbService.restRequest<any[]>(
          `/notifications?user_id=eq.${userId}&is_read=eq.false&select=id`
        );
        return items?.length || 0;
      }
    );
  }

  /**
   * Mark a single notification as read (strictly owned by authenticated user)
   */
  public static async markAsRead(id: string, userId: string): Promise<any> {
    const now = new Date();

    return DbService.query(
      async () => {
        return await prisma.notification.updateMany({
          where: { id, userId },
          data: { isRead: true, readAt: now },
        });
      },
      async () => {
        const res = await DbService.restRequest(
          `/notifications?id=eq.${id}&user_id=eq.${userId}`,
          {
            method: 'PATCH',
            body: { is_read: true, read_at: now.toISOString() },
          }
        );
        return res?.[0] || null;
      }
    );
  }

  /**
   * Mark all unread notifications as read for authenticated user
   */
  public static async markAllAsRead(userId: string): Promise<number> {
    const now = new Date();

    return DbService.query(
      async () => {
        const result = await prisma.notification.updateMany({
          where: { userId, isRead: false },
          data: { isRead: true, readAt: now },
        });
        return result.count;
      },
      async () => {
        await DbService.restRequest(
          `/notifications?user_id=eq.${userId}&is_read=eq.false`,
          {
            method: 'PATCH',
            body: { is_read: true, read_at: now.toISOString() },
          }
        );
        return 1;
      }
    );
  }

  /**
   * Delete a notification (strictly owned by authenticated user)
   */
  public static async deleteNotification(id: string, userId: string): Promise<boolean> {
    if (!id || !userId) return false;

    return DbService.query(
      async () => {
        return await prisma.$transaction(async (tx) => {
          const exists = await tx.notification.findFirst({
            where: { id, userId },
            select: { id: true },
          });

          if (!exists) return false;

          await tx.notificationDelivery.deleteMany({
            where: { notificationId: id },
          }).catch(() => {});

          const result = await tx.notification.deleteMany({
            where: { id, userId },
          });
          return result.count > 0;
        });
      },
      async () => {
        const found = await DbService.restRequest<any[]>(
          `/notifications?id=eq.${id}&user_id=eq.${userId}&select=id`
        );
        if (!found || found.length === 0) {
          return false;
        }

        await DbService.restRequest(`/notification_deliveries?notification_id=eq.${id}`, {
          method: 'DELETE',
        }).catch(() => {});

        await DbService.restRequest(`/notifications?id=eq.${id}&user_id=eq.${userId}`, {
          method: 'DELETE',
        });
        return true;
      }
    );
  }

  /**
   * Bulk delete notifications (strictly owned by authenticated user)
   */
  public static async bulkDeleteNotifications(
    ids: string[],
    userId: string
  ): Promise<{ deletedCount: number; deletedIds: string[] }> {
    if (!ids || ids.length === 0 || !userId) {
      return { deletedCount: 0, deletedIds: [] };
    }

    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));

    return DbService.query(
      async () => {
        return await prisma.$transaction(async (tx) => {
          const owned = await tx.notification.findMany({
            where: {
              id: { in: uniqueIds },
              userId,
            },
            select: { id: true },
          });

          const authorizedIds = owned.map((n) => n.id);
          if (authorizedIds.length === 0) {
            return { deletedCount: 0, deletedIds: [] };
          }

          await tx.notificationDelivery.deleteMany({
            where: { notificationId: { in: authorizedIds } },
          }).catch(() => {});

          const deleteResult = await tx.notification.deleteMany({
            where: {
              id: { in: authorizedIds },
              userId,
            },
          });

          return {
            deletedCount: deleteResult.count,
            deletedIds: authorizedIds,
          };
        });
      },
      async () => {
        const found = await DbService.restRequest<any[]>(
          `/notifications?id=in.(${uniqueIds.join(',')})&user_id=eq.${userId}&select=id`
        );
        const authorizedIds = (found || []).map((n) => n.id || n.id).filter(Boolean);
        if (authorizedIds.length === 0) {
          return { deletedCount: 0, deletedIds: [] };
        }

        for (const id of authorizedIds) {
          await DbService.restRequest(`/notification_deliveries?notification_id=eq.${id}`, {
            method: 'DELETE',
          }).catch(() => {});
        }
        await DbService.restRequest(
          `/notifications?id=in.(${authorizedIds.join(',')})&user_id=eq.${userId}`,
          { method: 'DELETE' }
        );
        return {
          deletedCount: authorizedIds.length,
          deletedIds: authorizedIds,
        };
      }
    );
  }

  /**
   * Delete ALL notifications for the authenticated user across all pages in one atomic operation
   */
  public static async deleteAllNotifications(userId: string): Promise<{ deletedCount: number }> {
    if (!userId) {
      return { deletedCount: 0 };
    }

    return DbService.query(
      async () => {
        return await prisma.$transaction(async (tx) => {
          const userNotifications = await tx.notification.findMany({
            where: { userId },
            select: { id: true },
          });

          const notificationIds = userNotifications.map((n) => n.id);
          if (notificationIds.length === 0) {
            return { deletedCount: 0 };
          }

          await tx.notificationDelivery.deleteMany({
            where: { notificationId: { in: notificationIds } },
          }).catch(() => {});

          const deleteResult = await tx.notification.deleteMany({
            where: { userId },
          });

          return { deletedCount: deleteResult.count };
        });
      },
      async () => {
        const found = await DbService.restRequest<any[]>(
          `/notifications?user_id=eq.${userId}&select=id`
        );
        const notificationIds = (found || []).map((n) => n.id).filter(Boolean);
        if (notificationIds.length === 0) {
          return { deletedCount: 0 };
        }

        for (const id of notificationIds) {
          await DbService.restRequest(`/notification_deliveries?notification_id=eq.${id}`, {
            method: 'DELETE',
          }).catch(() => {});
        }

        await DbService.restRequest(`/notifications?user_id=eq.${userId}`, {
          method: 'DELETE',
        });

        return { deletedCount: notificationIds.length };
      }
    );
  }
}

