import { WebSocket } from 'ws';
import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';
import { UserPresenceStatus, UserPresence } from '../../types/index.js';

interface ConnectionInfo {
  userId: string;
  connId: string;
  socket: WebSocket;
  connectedAt: Date;
  lastActiveAt: Date;
  activeConversationId?: string | null;
}

export class PresenceService {
  // Map of userId -> Set of connIds (supporting multiple tabs/devices per user)
  private static userConnections = new Map<string, Set<string>>();
  // Map of connId -> ConnectionInfo
  private static connectionRegistry = new Map<string, ConnectionInfo>();
  // Map of userId -> In-memory cached UserPresence
  private static presenceCache = new Map<string, UserPresence>();
  // Offline grace period timeouts: userId -> NodeJS.Timeout
  private static offlineTimers = new Map<string, NodeJS.Timeout>();
  // Listeners for presence changes
  private static presenceListeners = new Set<(event: { userId: string; presence: UserPresence }) => void>();

  private static broadcastPresence(userId: string, presence: UserPresence) {
    const event = {
      type: 'PRESENCE_CHANGE',
      payload: {
        userId,
        status: presence.status,
        customStatusMessage: presence.customStatusMessage,
        lastSeenAt: presence.lastSeenAt,
        isOnline: this.isUserOnline(userId),
      },
    };
    this.broadcastAll(event);

    for (const listener of this.presenceListeners) {
      try {
        listener({ userId, presence });
      } catch (err) {
        console.error('[PresenceService] Error in presence listener:', err);
      }
    }
  }

  public static broadcastAll(eventPayload: any): void {
    const jsonStr = JSON.stringify(eventPayload);
    for (const info of this.connectionRegistry.values()) {
      if (info.socket && info.socket.readyState === WebSocket.OPEN) {
        try {
          info.socket.send(jsonStr);
        } catch {}
      }
    }
  }

  public static async getUserPresence(userId: string): Promise<UserPresence> {
    return this.getPresence(userId);
  }

  /**
   * Register a new WebSocket connection for a user
   */
  public static async registerConnection(userId: string, connId: string, socket: WebSocket): Promise<UserPresence> {
    // Clear any pending offline grace timer for this user
    const pendingOffline = this.offlineTimers.get(userId);
    if (pendingOffline) {
      clearTimeout(pendingOffline);
      this.offlineTimers.delete(userId);
    }

    // Register connection
    let conns = this.userConnections.get(userId);
    if (!conns) {
      conns = new Set<string>();
      this.userConnections.set(userId, conns);
    }
    conns.add(connId);

    const now = new Date();
    this.connectionRegistry.set(connId, {
      userId,
      connId,
      socket,
      connectedAt: now,
      lastActiveAt: now,
    });

    // Determine target presence status from persistent state
    let currentPresence = await this.getPresence(userId);
    let targetStatus: UserPresenceStatus = currentPresence?.status || 'AVAILABLE';

    // If it was previously saved in DB as 'OFFLINE' from an older version, default to 'AVAILABLE'
    if (targetStatus === 'OFFLINE') {
      targetStatus = 'AVAILABLE';
    }

    const updated = await this.updatePresenceInDb(userId, {
      status: targetStatus,
      lastSeenAt: now.toISOString(),
    });

    this.presenceCache.set(userId, updated);
    this.broadcastPresence(userId, updated);
    return updated;
  }

  /**
   * Unregister a WebSocket connection
   */
  public static unregisterConnection(userId: string, connId: string, graceMs: number = 5000): void {
    this.connectionRegistry.delete(connId);

    const conns = this.userConnections.get(userId);
    if (conns) {
      conns.delete(connId);
      if (conns.size === 0) {
        this.userConnections.delete(userId);

        // Grace period before broadcasting online=false
        const timer = setTimeout(async () => {
          this.offlineTimers.delete(userId);
          const stillActiveConns = this.userConnections.get(userId);
          if (!stillActiveConns || stillActiveConns.size === 0) {
            const currentPresence = await this.getPresence(userId);
            if (currentPresence) {
              const now = new Date();
              currentPresence.lastSeenAt = now.toISOString();
              this.presenceCache.set(userId, currentPresence);
              this.broadcastPresence(userId, currentPresence);
            }
          }
        }, graceMs);

        this.offlineTimers.set(userId, timer);
      }
    }
  }

  /**
   * Update active conversation currently being viewed in a connection
   */
  public static setActiveConversation(connId: string, conversationId: string | null): void {
    const conn = this.connectionRegistry.get(connId);
    if (conn) {
      conn.activeConversationId = conversationId;
    }
  }

  /**
   * Check if a user is currently actively focused on a specific conversation
   */
  public static isUserViewingConversation(userId: string, conversationId: string): boolean {
    const conns = this.userConnections.get(userId);
    if (!conns || conns.size === 0) return false;

    for (const connId of conns) {
      const info = this.connectionRegistry.get(connId);
      if (info && info.activeConversationId === conversationId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Set user manual status
   */
  public static async setUserStatus(
    userId: string,
    status: UserPresenceStatus,
    customStatusMessage?: string | null
  ): Promise<UserPresence> {
    const now = new Date();

    const targetStatus = status;

    const updated = await this.updatePresenceInDb(userId, {
      status: targetStatus,
      customStatusMessage: customStatusMessage !== undefined ? customStatusMessage : null,
      lastSeenAt: now.toISOString(),
    });

    this.presenceCache.set(userId, updated);
    this.broadcastPresence(userId, updated);
    return updated;
  }

  /**
   * Touch activity for heartbeat (does not mutate user-selected availability)
   */
  public static async handleHeartbeat(userId: string, connId: string, isIdle: boolean = false): Promise<void> {
    const conn = this.connectionRegistry.get(connId);
    if (conn) {
      conn.lastActiveAt = new Date();
    }
  }

  /**
   * Check if user has at least one active WebSocket connection
   */
  public static isUserOnline(userId: string): boolean {
    const conns = this.userConnections.get(userId);
    return Boolean(conns && conns.size > 0);
  }

  /**
   * Get all active WebSocket connections for a user
   */
  public static getUserSockets(userId: string): WebSocket[] {
    const conns = this.userConnections.get(userId);
    if (!conns) return [];

    const sockets: WebSocket[] = [];
    for (const connId of conns) {
      const info = this.connectionRegistry.get(connId);
      if (info && info.socket.readyState === WebSocket.OPEN) {
        sockets.push(info.socket);
      }
    }
    return sockets;
  }

  /**
   * Broadcast a message to all active sockets of a set of users
   * Returns the count of successfully sent messages
   */
  public static broadcastToUsers(userIds: string[], eventPayload: any): number {
    const jsonStr = JSON.stringify(eventPayload);
    let totalDelivered = 0;
    for (const uId of userIds) {
      const sockets = this.getUserSockets(uId);
      for (const ws of sockets) {
        try {
          ws.send(jsonStr);
          totalDelivered++;
        } catch (err) {
          console.error(`[PresenceService] Failed to send WS message to user ${uId}:`, err);
        }
      }
    }
    return totalDelivered;
  }

  private static tableNotFound = false;

  /**
   * Get single user presence (cached or from DB)
   */
  public static async getPresence(userId: string): Promise<UserPresence> {
    const cached = this.presenceCache.get(userId);
    if (cached) return cached;

    if (this.tableNotFound) {
      const defaultP: UserPresence = {
        id: userId,
        userId,
        status: 'AVAILABLE',
        lastSeenAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.presenceCache.set(userId, defaultP);
      return defaultP;
    }

    const dbPresence = await DbService.query(
      async () => {
        return await (prisma as any).userPresence.findUnique({
          where: { userId },
        });
      },
      async () => {
        try {
          const rows = await DbService.querySupabaseTable<any>('user_presence', {
            user_id: `eq.${userId}`,
          });
          return rows[0] ? DbService.toCamelCase<UserPresence>(rows[0]) : null;
        } catch {
          this.tableNotFound = true;
          return null;
        }
      }
    );

    if (dbPresence) {
      const status = (dbPresence.status === 'OFFLINE' ? 'AVAILABLE' : dbPresence.status) as UserPresenceStatus;
      const result: UserPresence = {
        id: dbPresence.id,
        userId: dbPresence.userId,
        status: status || 'AVAILABLE',
        customStatusMessage: dbPresence.customStatusMessage,
        lastSeenAt: dbPresence.lastSeenAt instanceof Date ? dbPresence.lastSeenAt.toISOString() : (dbPresence.lastSeenAt || new Date().toISOString()),
        updatedAt: dbPresence.updatedAt instanceof Date ? dbPresence.updatedAt.toISOString() : (dbPresence.updatedAt || new Date().toISOString()),
      };
      this.presenceCache.set(userId, result);
      return result;
    }

    // Default presence if not in DB yet: AVAILABLE
    const defaultPresence: UserPresence = {
      id: userId,
      userId,
      status: 'AVAILABLE',
      lastSeenAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.presenceCache.set(userId, defaultPresence);
    return defaultPresence;
  }

  /**
   * Bulk get presence for multiple user IDs
   */
  public static async getBulkPresence(userIds: string[]): Promise<Map<string, UserPresence>> {
    const result = new Map<string, UserPresence>();
    const missingIds: string[] = [];

    for (const uId of userIds) {
      const cached = this.presenceCache.get(uId);
      if (cached) {
        result.set(uId, cached);
      } else {
        missingIds.push(uId);
      }
    }

    if (missingIds.length > 0) {
      const dbRows = await DbService.query(
        async () => {
          return await (prisma as any).userPresence.findMany({
            where: { userId: { in: missingIds } },
          });
        },
        async () => {
          try {
            const rows = await DbService.querySupabaseTable<any>('user_presence', {
              user_id: `in.(${missingIds.join(',')})`,
            });
            return rows.map((r: any) => DbService.toCamelCase<UserPresence>(r));
          } catch {
            this.tableNotFound = true;
            return [];
          }
        }
      );

      for (const row of dbRows) {
        const p: UserPresence = {
          id: row.id,
          userId: row.userId,
          status: row.status as UserPresenceStatus,
          customStatusMessage: row.customStatusMessage,
          lastSeenAt: row.lastSeenAt instanceof Date ? row.lastSeenAt.toISOString() : (row.lastSeenAt || new Date().toISOString()),
          updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : (row.updatedAt || new Date().toISOString()),
        };
        this.presenceCache.set(p.userId, p);
        result.set(p.userId, p);
      }

      // Any remaining IDs that don't have DB rows
      for (const uId of missingIds) {
        if (!result.has(uId)) {
          const defaultP: UserPresence = {
            id: uId,
            userId: uId,
            status: 'AVAILABLE',
            lastSeenAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          this.presenceCache.set(uId, defaultP);
          result.set(uId, defaultP);
        }
      }
    }

    return result;
  }

  /**
   * Helper to persist presence changes to database
   */
  private static async updatePresenceInDb(
    userId: string,
    data: {
      status?: UserPresenceStatus;
      customStatusMessage?: string | null;
      lastSeenAt?: string;
    }
  ): Promise<UserPresence> {
    const now = new Date();
    const nowIso = now.toISOString();
    const existing = this.presenceCache.get(userId);

    const updatedCached: UserPresence = {
      id: existing?.id || userId,
      userId,
      status: data.status || existing?.status || 'AVAILABLE',
      customStatusMessage: data.customStatusMessage !== undefined ? data.customStatusMessage : (existing?.customStatusMessage || null),
      lastSeenAt: data.lastSeenAt || nowIso,
      updatedAt: nowIso,
    };
    this.presenceCache.set(userId, updatedCached);

    return DbService.query(
      async () => {
        const upserted = await (prisma as any).userPresence.upsert({
          where: { userId },
          create: {
            userId,
            status: data.status || 'AVAILABLE',
            customStatusMessage: data.customStatusMessage || null,
            lastSeenAt: data.lastSeenAt ? new Date(data.lastSeenAt) : now,
            updatedAt: now,
          },
          update: {
            ...(data.status ? { status: data.status } : {}),
            ...(data.customStatusMessage !== undefined ? { customStatusMessage: data.customStatusMessage } : {}),
            ...(data.lastSeenAt ? { lastSeenAt: new Date(data.lastSeenAt) } : {}),
            updatedAt: now,
          },
        });

        const res: UserPresence = {
          id: upserted.id,
          userId: upserted.userId,
          status: upserted.status as UserPresenceStatus,
          customStatusMessage: upserted.customStatusMessage || null,
          lastSeenAt: upserted.lastSeenAt instanceof Date ? upserted.lastSeenAt.toISOString() : (upserted.lastSeenAt || nowIso),
          updatedAt: upserted.updatedAt instanceof Date ? upserted.updatedAt.toISOString() : (upserted.updatedAt || nowIso),
        };
        return res;
      },
      async () => {
        return updatedCached;
      }
    );
  }
}
