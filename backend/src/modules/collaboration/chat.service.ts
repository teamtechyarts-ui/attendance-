import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';
import { PresenceService } from './presence.service.js';
import { MeetingSignalingService } from './meeting-signaling.service.js';
import { NotificationService } from '../notifications/notification.service.js';
import crypto from 'crypto';
import {
  Conversation,
  ConversationMember,
  Message,
  MessageReaction,
  PeopleDirectoryItem,
  UserPresenceStatus,
} from '../../types/index.js';

export class ChatService {
  /**
   * Get People directory for collaboration
   */
  public static async getPeopleDirectory(
    currentUserId: string,
    search?: string,
    departmentId?: string
  ): Promise<PeopleDirectoryItem[]> {
    return DbService.query(
      async () => {
        const whereClause: any = {
          employmentStatus: { not: 'TERMINATED' },
          user: {
            status: 'ACTIVE',
          },
        };

        if (departmentId) {
          whereClause.departmentId = departmentId;
        }

        if (search && search.trim()) {
          const q = search.trim();
          whereClause.OR = [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { employeeCode: { contains: q, mode: 'insensitive' } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
          ];
        }

        const employees = await prisma.employee.findMany({
          where: whereClause,
          include: {
            user: true,
            department: true,
            designation: true,
          },
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        });

        // Enrich with presence
        const results: PeopleDirectoryItem[] = [];
        for (const emp of employees) {
          if (emp.user) {
            const presence = await PresenceService.getUserPresence(emp.user.id);
            results.push({
              userId: emp.user.id,
              employeeId: emp.id,
              employeeCode: emp.employeeCode,
              displayName: `${emp.firstName} ${emp.lastName}`.trim(),
              firstName: emp.firstName,
              lastName: emp.lastName,
              email: emp.user.email,
              profilePhotoUrl: emp.profilePhotoUrl,
              departmentId: emp.departmentId,
              departmentName: emp.department?.name,
              designationId: emp.designationId,
              designationName: emp.designation?.name,
              workMode: emp.user ? 'OFFICE' : undefined,
              employmentStatus: emp.employmentStatus,
              presence: {
                status: presence.status,
                customStatusMessage: presence.customStatusMessage,
                lastSeenAt: presence.lastSeenAt,
                isOnline: presence.status !== 'OFFLINE',
              },
            });
          }
        }

        // If current user or Super Admin does not have employee record, include them
        try {
          const superAdmins = await prisma.user.findMany({
            where: {
              role: 'SUPER_ADMIN',
              status: 'ACTIVE',
              employee: null,
            },
          });
          for (const sa of superAdmins) {
            const presence = await PresenceService.getUserPresence(sa.id);
            results.unshift({
              userId: sa.id,
              employeeId: sa.id,
              employeeCode: 'SUPER_ADMIN',
              displayName: 'Super Admin',
              firstName: 'Super',
              lastName: 'Admin',
              email: sa.email,
              profilePhotoUrl: null,
              departmentId: null,
              departmentName: 'Executive',
              designationId: null,
              designationName: 'Super Admin',
              workMode: 'OFFICE',
              employmentStatus: 'ACTIVE',
              presence: {
                status: presence.status,
                customStatusMessage: presence.customStatusMessage,
                lastSeenAt: presence.lastSeenAt,
                isOnline: presence.status !== 'OFFLINE',
              },
            });
          }
        } catch {
          // Ignore super admin enrichment errors
        }

        return results;
      },
      async () => {
        let path = '/employees?employment_status=neq.TERMINATED&select=*,user:users!user_id(*),department:departments(*),designation:designations(*)';
        if (departmentId) {
          path += `&department_id=eq.${departmentId}`;
        }
        if (search && search.trim()) {
          const q = search.trim();
          path += `&or=(first_name.ilike.*${q}*,last_name.ilike.*${q}*,employee_code.ilike.*${q}*)`;
        }

        const employees = await DbService.restRequest<any[]>(path);
        const activeEmployees = (employees || []).filter((emp: any) => emp.user && emp.user.status === 'ACTIVE');
        const userIds = activeEmployees.map((emp: any) => emp.user.id);
        const presenceMap = await PresenceService.getBulkPresence(userIds);

        const results: PeopleDirectoryItem[] = activeEmployees.map((emp: any) => {
          const presence = presenceMap.get(emp.user.id) || {
            status: 'AVAILABLE' as UserPresenceStatus,
            customStatusMessage: null,
            lastSeenAt: new Date().toISOString(),
          };

          return {
            userId: emp.user.id,
            employeeId: emp.id,
            employeeCode: emp.employeeCode,
            displayName: `${emp.firstName} ${emp.lastName}`.trim(),
            firstName: emp.firstName,
            lastName: emp.lastName,
            email: emp.user.email,
            profilePhotoUrl: emp.profilePhotoUrl,
            departmentId: emp.departmentId,
            departmentName: emp.department?.name,
            designationId: emp.designationId,
            designationName: emp.designation?.name,
            workMode: 'OFFICE',
            employmentStatus: emp.employmentStatus,
            presence: {
              status: presence.status,
              customStatusMessage: presence.customStatusMessage,
              lastSeenAt: presence.lastSeenAt,
              isOnline: presence.status !== 'OFFLINE',
            },
          };
        });

        return results;
      }
    );
  }

  /**
   * Helper: Generate a deterministic direct key for 1:1 conversation
   */
  public static getDirectKey(userAId: string, userBId: string): {
    directKey: string;
    directUserAId: string;
    directUserBId: string;
  } {
    const [directUserAId, directUserBId] = [userAId, userBId].sort();
    const directKey = `${directUserAId}_${directUserBId}`;
    return { directKey, directUserAId, directUserBId };
  }

  /**
   * Get or create a 1:1 direct conversation between two users
   */
  public static async getOrCreateDirectConversation(
    currentUserId: string,
    targetUserId: string
  ): Promise<Conversation> {
    if (currentUserId === targetUserId) {
      const err: any = new Error('Cannot create a direct conversation with yourself');
      err.statusCode = 400;
      throw err;
    }

    // Verify target user exists and is active
    const targetUser = await DbService.query(
      async () =>
        prisma.user.findUnique({
          where: { id: targetUserId },
          include: { employee: true },
        }),
      async () => {
        const rows = await DbService.restRequest<any[]>(`/users?id=eq.${targetUserId}&limit=1`);
        return rows?.[0] || null;
      }
    );

    if (!targetUser || targetUser.status === 'TERMINATED' || targetUser.status === 'DEACTIVATED') {
      const err: any = new Error('User not found or is deactivated');
      err.statusCode = 404;
      throw err;
    }

    const { directKey, directUserAId, directUserBId } = this.getDirectKey(
      currentUserId,
      targetUserId
    );

    return DbService.query(
      async () => {
        let conversation = await (prisma as any).conversation.findUnique({
          where: { directKey },
          include: {
            members: {
              where: { leftAt: null },
              include: {
                user: {
                  include: {
                    employee: {
                      include: { department: true, designation: true },
                    },
                  },
                },
              },
            },
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              include: {
                sender: {
                  include: { employee: true },
                },
              },
            },
          },
        });

        if (!conversation) {
          conversation = await (prisma as any).conversation.create({
            data: {
              type: 'DIRECT',
              directKey,
              directUserAId,
              directUserBId,
              createdBy: currentUserId,
              members: {
                create: [
                  { userId: currentUserId, role: 'MEMBER' },
                  { userId: targetUserId, role: 'MEMBER' },
                ],
              },
            },
            include: {
              members: {
                include: {
                  user: {
                    include: {
                      employee: {
                        include: { department: true, designation: true },
                      },
                    },
                  },
                },
              },
              messages: {
                take: 1,
                orderBy: { createdAt: 'desc' },
                include: {
                  sender: {
                    include: { employee: true },
                  },
                },
              },
            },
          });
        }

        return await this.enrichConversation(currentUserId, conversation);
      },
      async () => {
        const rows = await DbService.restRequest<any[]>(`/conversations?direct_key=eq.${directKey}&limit=1`);
        let c = rows?.[0];
        const now = new Date().toISOString();
        let convId = c?.id;

        if (!c) {
          const newConvs = await DbService.restRequest<any[]>('/conversations', {
            method: 'POST',
            body: {
              type: 'DIRECT',
              title: null,
              description: null,
              direct_user_a_id: directUserAId,
              direct_user_b_id: directUserBId,
              direct_key: directKey,
              created_by: currentUserId,
              is_archived: false,
              created_at: now,
              updated_at: now,
              last_message_at: null,
            },
          });
          c = newConvs[0];
          convId = c.id;

          await DbService.restRequest('/conversation_members', {
            method: 'POST',
            body: [
              {
                conversation_id: convId,
                user_id: currentUserId,
                role: 'MEMBER',
                joined_at: now,
              },
              {
                conversation_id: convId,
                user_id: targetUserId,
                role: 'MEMBER',
                joined_at: now,
              },
            ],
          });
        }

        const members = await DbService.restRequest<any[]>(`/conversation_members?conversation_id=eq.${convId}&left_at=is.null`);
        const messages = await DbService.restRequest<any[]>(`/messages?conversation_id=eq.${convId}&order=created_at.desc&limit=1`);

        return await this.enrichConversation(currentUserId, {
          ...c,
          members,
          messages,
        });
      }
    );
  }

  /**
   * Create a group conversation
   */
  public static async createGroupConversation(
    currentUserId: string,
    title: string,
    description?: string,
    memberUserIds: string[] = []
  ): Promise<Conversation> {
    if (!title || !title.trim()) {
      const err: any = new Error('Group title is required');
      err.statusCode = 400;
      throw err;
    }

    const uniqueMembers = Array.from(new Set([currentUserId, ...memberUserIds]));

    return DbService.query(
      async () => {
        const now = new Date();
        const conversation = await (prisma as any).conversation.create({
          data: {
            type: 'GROUP',
            title: title.trim(),
            description: description ? description.trim() : null,
            createdBy: currentUserId,
            members: {
              create: uniqueMembers.map((userId) => ({
                userId,
                role: userId === currentUserId ? 'ADMIN' : 'MEMBER',
                joinedAt: now,
              })),
            },
          },
          include: {
            members: {
              include: {
                user: {
                  include: {
                    employee: {
                      include: { department: true, designation: true },
                    },
                  },
                },
              },
            },
          },
        });

        const creatorIdentity = await MeetingSignalingService.resolveUserIdentity(currentUserId);
        const creatorName = creatorIdentity?.displayName || 'A member';

        // Create initial system message in group
        const sysMsg = await (prisma as any).message.create({
          data: {
            conversationId: conversation.id,
            senderUserId: currentUserId,
            body: `${creatorName} created this group`,
            isSystem: true,
            createdAt: now,
          },
          include: {
            sender: {
              include: { employee: true },
            },
          },
        });

        // Update conversation lastMessageAt
        await (prisma as any).conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: now,
            updatedAt: now,
          },
        });

        const enriched = await this.enrichConversation(currentUserId, {
          ...conversation,
          messages: [sysMsg],
        });

        // Broadcast to all added members
        PresenceService.broadcastToUsers(uniqueMembers, {
          type: 'CONVERSATION_CREATED',
          payload: enriched,
        });

        PresenceService.broadcastToUsers(uniqueMembers, {
          type: 'NEW_MESSAGE',
          payload: {
            conversationId: conversation.id,
            message: this.formatMessage(sysMsg),
          },
        });

        return enriched;
      },
      async () => {
        const now = new Date().toISOString();
        const createdConvs = await DbService.restRequest<any[]>('/conversations', {
          method: 'POST',
          body: {
            type: 'GROUP',
            title: title.trim(),
            description: typeof description === 'string' ? description.trim() : null,
            created_by: currentUserId,
            is_archived: false,
            created_at: now,
            updated_at: now,
            last_message_at: now,
          },
        });
        const newConv = createdConvs[0];
        const convId = newConv.id;

        const memberRows = uniqueMembers.map((uId) => ({
          conversation_id: convId,
          user_id: uId,
          role: uId === currentUserId ? 'ADMIN' : 'MEMBER',
          joined_at: now,
        }));
        await DbService.restRequest('/conversation_members', {
          method: 'POST',
          body: memberRows,
        });

        const creatorIdentity = await MeetingSignalingService.resolveUserIdentity(currentUserId);
        const creatorName = creatorIdentity?.displayName || 'A member';

        const sysMsgs = await DbService.restRequest<any[]>('/messages', {
          method: 'POST',
          body: {
            conversation_id: convId,
            sender_user_id: currentUserId,
            body: `${creatorName} created this group`,
            is_system: true,
            created_at: now,
          },
        });
        const sysMsg = sysMsgs[0];

        const members = await DbService.restRequest<any[]>(`/conversation_members?conversation_id=eq.${convId}&left_at=is.null`);
        const enriched = await this.enrichConversation(currentUserId, {
          ...newConv,
          members,
          messages: [sysMsg],
        });

        PresenceService.broadcastToUsers(uniqueMembers, {
          type: 'CONVERSATION_CREATED',
          payload: enriched,
        });

        PresenceService.broadcastToUsers(uniqueMembers, {
          type: 'NEW_MESSAGE',
          payload: {
            conversationId: convId,
            message: this.formatMessage(sysMsg),
          },
        });

        return enriched;
      }
    );
  }

  /**
   * Get all conversations for a user
   */
  public static async getUserConversations(userId: string): Promise<Conversation[]> {
    return DbService.query(
      async () => {
        const memberRecords = await (prisma as any).conversationMember.findMany({
          where: {
            userId,
            leftAt: null,
          },
          include: {
            conversation: {
              include: {
                members: {
                  where: { leftAt: null },
                  include: {
                    user: {
                      include: {
                        employee: {
                          include: { department: true, designation: true },
                        },
                      },
                    },
                  },
                },
                messages: {
                  take: 1,
                  orderBy: { createdAt: 'desc' },
                  include: {
                    sender: {
                      include: { employee: true },
                    },
                  },
                },
              },
            },
          },
          orderBy: {
            conversation: {
              updatedAt: 'desc',
            },
          },
        });

        const list: Conversation[] = [];
        for (const record of memberRecords) {
          if (record.conversation && !record.conversation.isArchived) {
            const enriched = await this.enrichConversation(userId, record.conversation, record);
            list.push(enriched);
          }
        }

        list.sort((a, b) => {
          const timeA = new Date(a.lastMessageAt || a.updatedAt).getTime();
          const timeB = new Date(b.lastMessageAt || b.updatedAt).getTime();
          return timeB - timeA;
        });

        return list;
      },
      async () => {
        const userMembers = await DbService.restRequest<any[]>(
          `/conversation_members?user_id=eq.${userId}&left_at=is.null`
        );
        if (!userMembers || userMembers.length === 0) return [];

        const convIds = Array.from(
          new Set(userMembers.map((m: any) => m.conversationId || m.conversation_id).filter(Boolean))
        );
        if (convIds.length === 0) return [];

        // Batch query all conversations, all active members, and all recent messages in parallel
        const [convs, allMembers, allMessages] = await Promise.all([
          DbService.restRequest<any[]>(
            `/conversations?id=in.(${convIds.join(',')})&is_archived=eq.false&select=id,type,title,description,created_by,created_at,updated_at,last_message_at,direct_user_a_id,direct_user_b_id`
          ).catch(() => []),
          DbService.restRequest<any[]>(
            `/conversation_members?conversation_id=in.(${convIds.join(',')})&left_at=is.null&select=id,conversation_id,user_id,role,last_read_at`
          ).catch(() => []),
          DbService.restRequest<any[]>(
            `/messages?conversation_id=in.(${convIds.join(',')})&order=created_at.desc&select=id,conversation_id,sender_user_id,body,created_at,is_system,deleted_at`
          ).catch(() => []),
        ]);

        // Collect all distinct user IDs across all conversations
        const allUserIdsSet = new Set<string>();
        for (const c of convs || []) {
          const cBy = c.createdBy || c.created_by;
          const uA = c.directUserAId || c.direct_user_a_id;
          const uB = c.directUserBId || c.direct_user_b_id;
          if (cBy) allUserIdsSet.add(cBy);
          if (uA) allUserIdsSet.add(uA);
          if (uB) allUserIdsSet.add(uB);
        }
        for (const m of allMembers || []) {
          const uId = m.userId || m.user_id;
          if (uId) allUserIdsSet.add(uId);
        }
        for (const msg of allMessages || []) {
          const sId = msg.senderUserId || msg.sender_user_id;
          if (sId) allUserIdsSet.add(sId);
        }

        const allUserIds = Array.from(allUserIdsSet);

        // Batch resolve all user identities and presences in parallel
        const [identityMap, presenceMap] = await Promise.all([
          MeetingSignalingService.resolveUserIdentitiesBatch(allUserIds),
          PresenceService.getBulkPresence(allUserIds),
        ]);

        // Group members by conversation ID
        const membersByConv = new Map<string, any[]>();
        for (const m of allMembers || []) {
          const cId = m.conversationId || m.conversation_id;
          if (!membersByConv.has(cId)) membersByConv.set(cId, []);
          membersByConv.get(cId)!.push(m);
        }

        // Group messages by conversation ID (keep latest)
        const lastMsgByConv = new Map<string, any>();
        for (const msg of allMessages || []) {
          const cId = msg.conversationId || msg.conversation_id;
          if (!lastMsgByConv.has(cId)) {
            lastMsgByConv.set(cId, msg);
          }
        }

        // Map of userMember by conversation ID
        const userMemberByConv = new Map<string, any>();
        for (const um of userMembers || []) {
          const cId = um.conversationId || um.conversation_id;
          if (cId) userMemberByConv.set(cId, um);
        }

        const list: Conversation[] = [];
        for (const c of convs || []) {
          if (!c || c.isArchived || c.is_archived) continue;
          const cMembers = membersByConv.get(c.id) || [];
          const cLastMsg = lastMsgByConv.get(c.id);
          const um = userMemberByConv.get(c.id);

          const enriched = await this.enrichConversation(
            userId,
            {
              ...c,
              members: cMembers,
              messages: cLastMsg ? [cLastMsg] : [],
            },
            um,
            identityMap,
            presenceMap
          );
          list.push(enriched);
        }

        list.sort((a, b) => {
          const timeA = new Date(a.lastMessageAt || a.updatedAt).getTime();
          const timeB = new Date(b.lastMessageAt || b.updatedAt).getTime();
          return timeB - timeA;
        });

        return list;
      }
    );
  }

  /**
   * Get single conversation by ID (with membership validation)
   */
  public static async getConversationById(
    userId: string,
    conversationId: string
  ): Promise<Conversation> {
    return DbService.query(
      async () => {
        const member = await (prisma as any).conversationMember.findUnique({
          where: {
            conversationId_userId: {
              conversationId,
              userId,
            },
          },
        });

        if (!member || member.leftAt) {
          const err: any = new Error('Access denied: You are not a member of this conversation');
          err.statusCode = 403;
          throw err;
        }

        const conversation = await (prisma as any).conversation.findUnique({
          where: { id: conversationId },
          include: {
            members: {
              where: { leftAt: null },
              include: {
                user: {
                  include: {
                    employee: {
                      include: { department: true, designation: true },
                    },
                  },
                },
              },
            },
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              include: {
                sender: {
                  include: { employee: true },
                },
              },
            },
          },
        });

        if (!conversation) {
          const err: any = new Error('Conversation not found');
          err.statusCode = 404;
          throw err;
        }

        return await this.enrichConversation(userId, conversation, member);
      },
      async () => {
        const [members, convs, lastMsgs] = await Promise.all([
          DbService.restRequest<any[]>(
            `/conversation_members?conversation_id=eq.${conversationId}&left_at=is.null&select=id,conversation_id,user_id,role,last_read_at`
          ).catch(() => []),
          DbService.restRequest<any[]>(
            `/conversations?id=eq.${conversationId}&limit=1&select=id,type,title,description,created_by,created_at,updated_at,last_message_at,direct_user_a_id,direct_user_b_id`
          ).catch(() => []),
          DbService.restRequest<any[]>(
            `/messages?conversation_id=eq.${conversationId}&order=created_at.desc&limit=1&select=id,conversation_id,sender_user_id,body,created_at,is_system,deleted_at`
          ).catch(() => []),
        ]);

        const userMember = (members || []).find((m: any) => (m.userId || m.user_id) === userId);
        if (!userMember) {
          const err: any = new Error('Access denied: You are not a member of this conversation');
          err.statusCode = 403;
          throw err;
        }

        const c = convs?.[0];
        if (!c) {
          const err: any = new Error('Conversation not found');
          err.statusCode = 404;
          throw err;
        }

        const userIdsSet = new Set<string>();
        if (c.createdBy || c.created_by) userIdsSet.add(c.createdBy || c.created_by);
        if (c.directUserAId || c.direct_user_a_id) userIdsSet.add(c.directUserAId || c.direct_user_a_id);
        if (c.directUserBId || c.direct_user_b_id) userIdsSet.add(c.directUserBId || c.direct_user_b_id);
        for (const m of members || []) {
          const uId = m.userId || m.user_id;
          if (uId) userIdsSet.add(uId);
        }
        if (lastMsgs?.[0]?.senderUserId || lastMsgs?.[0]?.sender_user_id) {
          userIdsSet.add(lastMsgs[0].senderUserId || lastMsgs[0].sender_user_id);
        }

        const userIds = Array.from(userIdsSet);
        const [identityMap, presenceMap] = await Promise.all([
          MeetingSignalingService.resolveUserIdentitiesBatch(userIds),
          PresenceService.getBulkPresence(userIds),
        ]);

        return await this.enrichConversation(
          userId,
          {
            ...c,
            members: members || [],
            messages: lastMsgs || [],
          },
          userMember,
          identityMap,
          presenceMap
        );
      }
    );
  }

  /**
   * Get message history for a conversation (paginated)
   */
  public static async getConversationMessages(
    userId: string,
    conversationId: string,
    beforeCursor?: string,
    limit: number = 50
  ): Promise<{ messages: Message[]; nextCursor: string | null }> {
    return DbService.query(
      async () => {
        await this.verifyMembership(userId, conversationId);

        const whereClause: any = {
          conversationId,
        };

        if (beforeCursor) {
          const cursorMsg = await (prisma as any).message.findUnique({
            where: { id: beforeCursor },
          });
          if (cursorMsg) {
            whereClause.createdAt = { lt: cursorMsg.createdAt };
          }
        }

        const messages = await (prisma as any).message.findMany({
          where: whereClause,
          take: limit + 1,
          orderBy: { createdAt: 'desc' },
          include: {
            sender: {
              include: {
                employee: {
                  include: { department: true, designation: true },
                },
              },
            },
            replyTo: {
              include: {
                sender: {
                  include: { employee: true },
                },
              },
            },
            reactions: {
              include: {
                user: {
                  include: { employee: true },
                },
              },
            },
            attachments: true,
          },
        });

        let nextCursor: string | null = null;
        if (messages.length > limit) {
          const nextItem = messages.pop();
          nextCursor = nextItem.id;
        }

        messages.reverse();
        return {
          messages: messages.map((m: any) => this.formatMessage(m)),
          nextCursor,
        };
      },
      async () => {
        let path = `/messages?conversation_id=eq.${conversationId}&order=created_at.desc&limit=${limit + 1}&select=id,conversation_id,sender_user_id,body,reply_to_message_id,is_system,created_at,edited_at,deleted_at`;
        if (beforeCursor) {
          const cursors = await DbService.restRequest<any[]>(`/messages?id=eq.${beforeCursor}&limit=1&select=id,created_at`);
          const cursorCreatedAt = cursors?.[0]?.createdAt || cursors?.[0]?.created_at;
          if (cursorCreatedAt) {
            path += `&created_at=lt.${cursorCreatedAt}`;
          }
        }

        // Parallelize membership check and message retrieval
        const [, rows] = await Promise.all([
          this.verifyMembership(userId, conversationId),
          DbService.restRequest<any[]>(path),
        ]);

        let nextCursor: string | null = null;
        if (rows && rows.length > limit) {
          const nextItem = rows.pop();
          nextCursor = nextItem.id;
        }

        const messagesList = rows || [];
        messagesList.reverse();

        const senderIds = Array.from(
          new Set(messagesList.map((m: any) => m.senderUserId || m.sender_user_id).filter(Boolean))
        );
        const msgIds = messagesList.map((m: any) => m.id).filter(Boolean);
        const replyIds = Array.from(
          new Set(messagesList.map((m: any) => m.replyToMessageId || m.reply_to_message_id).filter(Boolean))
        );

        const rowsById = new Map<string, any>(messagesList.map((m: any) => [m.id, m]));
        const missingReplyIds = replyIds.filter((id) => !rowsById.has(id));

        const [identityMap, reactions, extraReplies] = await Promise.all([
          MeetingSignalingService.resolveUserIdentitiesBatch(senderIds),
          msgIds.length > 0
            ? DbService.restRequest<any[]>(
                `/message_reactions?message_id=in.(${msgIds.join(',')})&select=id,message_id,user_id,reaction,created_at`
              ).catch(() => [])
            : Promise.resolve([]),
          missingReplyIds.length > 0
            ? DbService.restRequest<any[]>(
                `/messages?id=in.(${missingReplyIds.join(',')})&select=id,sender_user_id,body,created_at,is_system,deleted_at`
              ).catch(() => [])
            : Promise.resolve([]),
        ]);

        for (const er of extraReplies || []) {
          rowsById.set(er.id, er);
        }

        const reactionsByMsg = new Map<string, any[]>();
        for (const r of reactions || []) {
          const mId = r.messageId || r.message_id;
          if (!reactionsByMsg.has(mId)) reactionsByMsg.set(mId, []);
          reactionsByMsg.get(mId)!.push({
            id: r.id,
            messageId: mId,
            userId: r.userId || r.user_id,
            reaction: r.reaction,
            createdAt: r.createdAt || r.created_at,
          });
        }

        const formatted = messagesList.map((m: any) => {
          const senderUserId = m.senderUserId || m.sender_user_id;
          const senderIdentity = identityMap.get(senderUserId);
          const replyId = m.replyToMessageId || m.reply_to_message_id || null;
          const referencedReply = replyId ? rowsById.get(replyId) : null;

          return {
            id: m.id,
            conversationId: m.conversationId || m.conversation_id,
            senderUserId,
            body: (m.deletedAt || m.deleted_at) ? 'This message was deleted' : m.body,
            replyToMessageId: replyId,
            replyTo: referencedReply
              ? {
                  id: referencedReply.id,
                  conversationId: referencedReply.conversationId || referencedReply.conversation_id,
                  senderUserId: referencedReply.senderUserId || referencedReply.sender_user_id,
                  body: (referencedReply.deletedAt || referencedReply.deleted_at)
                    ? 'This message was deleted'
                    : referencedReply.body,
                  isSystem: Boolean(referencedReply.isSystem || referencedReply.is_system),
                  createdAt: referencedReply.createdAt || referencedReply.created_at,
                }
              : undefined,
            isSystem: Boolean(m.isSystem || m.is_system),
            createdAt: m.createdAt || m.created_at,
            editedAt: m.editedAt || m.edited_at || null,
            deletedAt: m.deletedAt || m.deleted_at || null,
            sender: {
              id: senderUserId,
              email: senderIdentity?.email || '',
              displayName: senderIdentity?.displayName || 'User',
              avatarUrl: senderIdentity?.avatarUrl || null,
              employee: senderIdentity?.employee || null,
            },
            reactions: reactionsByMsg.get(m.id) || [],
            attachments: [],
          };
        });

        return { messages: formatted, nextCursor };
      }
    );
  }

  /**
   * Send a message to a conversation
   */
  public static async sendMessage(
    userId: string,
    conversationId: string,
    body: string,
    replyToMessageId?: string
  ): Promise<Message> {
    if (!body || !body.trim()) {
      const err: any = new Error('Message body cannot be empty');
      err.statusCode = 400;
      throw err;
    }

    const member = await this.verifyMembership(userId, conversationId);

    return DbService.query(
      async () => {
        if (replyToMessageId) {
          const replyTarget = await (prisma as any).message.findUnique({
            where: { id: replyToMessageId },
          });
          if (!replyTarget || replyTarget.conversationId !== conversationId) {
            const err: any = new Error('Reply target message not found in this conversation');
            err.statusCode = 404;
            throw err;
          }
        }

        const now = new Date();
        const message = await (prisma as any).message.create({
          data: {
            conversationId,
            senderUserId: userId,
            body: body.trim(),
            replyToMessageId: replyToMessageId || null,
            createdAt: now,
          },
          include: {
            sender: {
              include: {
                employee: {
                  include: { department: true, designation: true },
                },
              },
            },
            replyTo: {
              include: {
                sender: {
                  include: { employee: true },
                },
              },
            },
            reactions: {
              include: {
                user: {
                  include: { employee: true },
                },
              },
            },
            attachments: true,
          },
        });

        // Update conversation lastMessageAt and updatedAt
        await (prisma as any).conversation.update({
          where: { id: conversationId },
          data: {
            lastMessageAt: now,
            updatedAt: now,
          },
        });

        // Update sender's lastReadMessageId
        await (prisma as any).conversationMember.update({
          where: { id: member.id },
          data: {
            lastReadMessageId: message.id,
            lastReadAt: now,
          },
        });

        const formatted = this.formatMessage(message);

        // Broadcast to all active conversation members
        const activeMembers = await (prisma as any).conversationMember.findMany({
          where: { conversationId, leftAt: null },
        });
        const memberUserIds = activeMembers.map((m: any) => m.userId);

        PresenceService.broadcastToUsers(memberUserIds, {
          type: 'NEW_MESSAGE',
          payload: {
            conversationId,
            message: formatted,
          },
        });

        return formatted;
      },
      async () => {
        const now = new Date().toISOString();
        const createdMsgs = await DbService.restRequest<any[]>('/messages', {
          method: 'POST',
          body: {
            conversation_id: conversationId,
            sender_user_id: userId,
            body: body.trim(),
            reply_to_message_id: replyToMessageId || null,
            created_at: now,
          },
        });
        const msg = createdMsgs[0];

        await DbService.restRequest(`/conversations?id=eq.${conversationId}`, {
          method: 'PATCH',
          body: {
            last_message_at: now,
            updated_at: now,
          },
        });

        const senderIdentity = await MeetingSignalingService.resolveUserIdentity(userId);
        const formatted: Message = {
          id: msg.id,
          conversationId,
          senderUserId: userId,
          body: msg.body,
          replyToMessageId: msg.replyToMessageId,
          isSystem: false,
          createdAt: msg.createdAt,
          sender: {
            id: userId,
            email: '',
            displayName: senderIdentity?.displayName || 'User',
          },
          reactions: [],
          attachments: [],
        };

        const activeMembers = await DbService.restRequest<any[]>(`/conversation_members?conversation_id=eq.${conversationId}&left_at=is.null`);
        const memberUserIds = (activeMembers || []).map((m) => m.userId);

        PresenceService.broadcastToUsers(memberUserIds, {
          type: 'NEW_MESSAGE',
          payload: {
            conversationId,
            message: formatted,
          },
        });

        return formatted;
      }
    );
  }

  /**
   * Edit an existing message
   */
  public static async editMessage(
    userId: string,
    messageId: string,
    newBody: string
  ): Promise<Message> {
    if (!newBody || !newBody.trim()) {
      const err: any = new Error('Message body cannot be empty');
      err.statusCode = 400;
      throw err;
    }

    return DbService.query(
      async () => {
        const message = await (prisma as any).message.findUnique({
          where: { id: messageId },
        });

        if (!message) {
          const err: any = new Error('Message not found');
          err.statusCode = 404;
          throw err;
        }

        if (message.senderUserId !== userId) {
          const err: any = new Error('Forbidden: You can only edit your own messages');
          err.statusCode = 403;
          throw err;
        }

        if (message.deletedAt) {
          const err: any = new Error('Cannot edit a deleted message');
          err.statusCode = 400;
          throw err;
        }

        const now = new Date();
        const updated = await (prisma as any).message.update({
          where: { id: messageId },
          data: {
            body: newBody.trim(),
            editedAt: now,
          },
          include: {
            sender: {
              include: { employee: true },
            },
            replyTo: {
              include: {
                sender: {
                  include: { employee: true },
                },
              },
            },
            reactions: {
              include: {
                user: {
                  include: { employee: true },
                },
              },
            },
            attachments: true,
          },
        });

        const formatted = this.formatMessage(updated);

        const members = await (prisma as any).conversationMember.findMany({
          where: { conversationId: message.conversationId, leftAt: null },
        });
        const userIds = members.map((m: any) => m.userId);

        PresenceService.broadcastToUsers(userIds, {
          type: 'MESSAGE_EDITED',
          payload: {
            conversationId: message.conversationId,
            message: formatted,
          },
        });

        return formatted;
      },
      async () => {
        const now = new Date().toISOString();
        const updatedRows = await DbService.restRequest<any[]>(`/messages?id=eq.${messageId}`, {
          method: 'PATCH',
          body: {
            body: newBody.trim(),
            edited_at: now,
          },
        });
        const target = updatedRows?.[0];
        if (!target) {
          const err: any = new Error('Message not found');
          err.statusCode = 404;
          throw err;
        }

        const senderIdentity = await MeetingSignalingService.resolveUserIdentity(userId);
        const formatted: Message = {
          id: target.id,
          conversationId: target.conversationId,
          senderUserId: target.senderUserId,
          body: target.body,
          replyToMessageId: target.replyToMessageId,
          isSystem: false,
          createdAt: target.createdAt,
          editedAt: target.editedAt,
          sender: {
            id: userId,
            email: '',
            displayName: senderIdentity?.displayName || 'User',
          },
        };

        const members = await DbService.restRequest<any[]>(`/conversation_members?conversation_id=eq.${target.conversationId}&left_at=is.null`);
        const userIds = (members || []).map((m) => m.userId);

        PresenceService.broadcastToUsers(userIds, {
          type: 'MESSAGE_EDITED',
          payload: { conversationId: target.conversationId, message: formatted },
        });

        return formatted;
      }
    );
  }

  /**
   * Delete a message (soft delete)
   */
  public static async deleteMessage(
    userId: string,
    messageId: string,
    isStaffAdmin?: boolean
  ): Promise<{ success: boolean; messageId: string; conversationId: string }> {
    return DbService.query(
      async () => {
        const message = await (prisma as any).message.findUnique({
          where: { id: messageId },
        });

        if (!message) {
          const err: any = new Error('Message not found');
          err.statusCode = 404;
          throw err;
        }

        if (message.senderUserId !== userId && !isStaffAdmin) {
          const member = await (prisma as any).conversationMember.findUnique({
            where: {
              conversationId_userId: {
                conversationId: message.conversationId,
                userId,
              },
            },
          });
          if (!member || member.role !== 'ADMIN') {
            const err: any = new Error('Forbidden: You can only delete your own messages');
            err.statusCode = 403;
            throw err;
          }
        }

        const now = new Date();
        await (prisma as any).message.update({
          where: { id: messageId },
          data: {
            deletedAt: now,
          },
        });

        const members = await (prisma as any).conversationMember.findMany({
          where: { conversationId: message.conversationId, leftAt: null },
        });
        const userIds = members.map((m: any) => m.userId);

        PresenceService.broadcastToUsers(userIds, {
          type: 'MESSAGE_DELETED',
          payload: {
            conversationId: message.conversationId,
            messageId,
          },
        });

        return {
          success: true,
          messageId,
          conversationId: message.conversationId,
        };
      },
      async () => {
        const now = new Date().toISOString();
        const updated = await DbService.restRequest<any[]>(`/messages?id=eq.${messageId}`, {
          method: 'PATCH',
          body: {
            deleted_at: now,
          },
        });
        const target = updated?.[0];
        if (!target) {
          const err: any = new Error('Message not found');
          err.statusCode = 404;
          throw err;
        }

        const members = await DbService.restRequest<any[]>(`/conversation_members?conversation_id=eq.${target.conversationId}&left_at=is.null`);
        const userIds = (members || []).map((item) => item.userId);

        PresenceService.broadcastToUsers(userIds, {
          type: 'MESSAGE_DELETED',
          payload: { conversationId: target.conversationId, messageId },
        });

        return { success: true, messageId, conversationId: target.conversationId };
      }
    );
  }

  /**
   * Add / Toggle a reaction on a message
   */
  public static async toggleReaction(
    userId: string,
    messageId: string,
    reaction: string
  ): Promise<{ messageId: string; reactions: MessageReaction[] }> {
    const validReactions = ['👍', '❤️', '😂', '✅', '👏', '🎉', '🔥', '👀'];
    if (!validReactions.includes(reaction)) {
      const err: any = new Error(`Invalid reaction: ${reaction}`);
      err.statusCode = 400;
      throw err;
    }

    return DbService.query(
      async () => {
        const msg = await (prisma as any).message.findUnique({
          where: { id: messageId },
        });
        if (!msg) {
          const err: any = new Error('Message not found');
          err.statusCode = 404;
          throw err;
        }

        await this.verifyMembership(userId, msg.conversationId);

        const existingForUser = await (prisma as any).messageReaction.findFirst({
          where: {
            messageId,
            userId,
          },
        });

        if (existingForUser) {
          if (existingForUser.reaction === reaction) {
            await (prisma as any).messageReaction.delete({
              where: { id: existingForUser.id },
            });
          } else {
            await (prisma as any).messageReaction.update({
              where: { id: existingForUser.id },
              data: {
                reaction,
                createdAt: new Date(),
              },
            });
          }
        } else {
          await (prisma as any).messageReaction.create({
            data: {
              messageId,
              userId,
              reaction,
            },
          });
        }

        const allReactions = await (prisma as any).messageReaction.findMany({
          where: { messageId },
          include: {
            user: {
              include: { employee: true },
            },
          },
        });

        const formattedReactions: MessageReaction[] = allReactions.map((r: any) => ({
          id: r.id,
          messageId: r.messageId,
          userId: r.userId,
          reaction: r.reaction,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
          user: {
            id: r.user?.id,
            displayName: r.user?.employee ? `${r.user.employee.firstName} ${r.user.employee.lastName}`.trim() : r.user?.email,
          },
        }));

        const members = await (prisma as any).conversationMember.findMany({
          where: { conversationId: msg.conversationId, leftAt: null },
        });
        const userIds = members.map((m: any) => m.userId);

        PresenceService.broadcastToUsers(userIds, {
          type: 'REACTION_UPDATED',
          payload: {
            conversationId: msg.conversationId,
            messageId,
            reactions: formattedReactions,
          },
        });

        return { messageId, reactions: formattedReactions };
      },
      async () => {
        const msgs = await DbService.restRequest<any[]>(`/messages?id=eq.${messageId}&limit=1`);
        const msg = msgs?.[0];
        if (!msg) {
          const err: any = new Error('Message not found');
          err.statusCode = 404;
          throw err;
        }

        const existing = await DbService.restRequest<any[]>(`/message_reactions?message_id=eq.${messageId}&user_id=eq.${userId}&limit=1`);
        if (existing && existing.length > 0) {
          if (existing[0].reaction === reaction) {
            await DbService.restRequest(`/message_reactions?id=eq.${existing[0].id}`, { method: 'DELETE' });
          } else {
            await DbService.restRequest(`/message_reactions?id=eq.${existing[0].id}`, {
              method: 'PATCH',
              body: { reaction, created_at: new Date().toISOString() },
            });
          }
        } else {
          await DbService.restRequest('/message_reactions', {
            method: 'POST',
            body: {
              message_id: messageId,
              user_id: userId,
              reaction,
              created_at: new Date().toISOString(),
            },
          });
        }

        const allReactions = await DbService.restRequest<any[]>(`/message_reactions?message_id=eq.${messageId}`);
        const members = await DbService.restRequest<any[]>(`/conversation_members?conversation_id=eq.${msg.conversationId}&left_at=is.null`);
        const userIds = (members || []).map((item: any) => item.userId);

        PresenceService.broadcastToUsers(userIds, {
          type: 'REACTION_UPDATED',
          payload: { conversationId: msg.conversationId, messageId, reactions: allReactions },
        });

        return { messageId, reactions: allReactions };
      }
    );
  }

  /**
   * Mark conversation as read
   */
  public static async markConversationAsRead(
    userId: string,
    conversationId: string,
    messageId?: string
  ): Promise<{ success: boolean; lastReadMessageId: string | null }> {
    const member = await this.verifyMembership(userId, conversationId);

    return DbService.query(
      async () => {
        let targetMessageId = messageId;
        if (!targetMessageId) {
          const latest = await (prisma as any).message.findFirst({
            where: { conversationId },
            orderBy: { createdAt: 'desc' },
          });
          targetMessageId = latest?.id || null;
        }

        const now = new Date();
        await (prisma as any).conversationMember.update({
          where: { id: member.id },
          data: {
            lastReadMessageId: targetMessageId,
            lastReadAt: now,
          },
        });

        const members = await (prisma as any).conversationMember.findMany({
          where: { conversationId, leftAt: null },
        });
        const userIds = members.map((m: any) => m.userId);

        PresenceService.broadcastToUsers(userIds, {
          type: 'READ_RECEIPT',
          payload: {
            conversationId,
            userId,
            lastReadMessageId: targetMessageId,
            readAt: now.toISOString(),
          },
        });

        return { success: true, lastReadMessageId: targetMessageId || null };
      },
      async () => {
        const now = new Date().toISOString();
        await DbService.restRequest(`/conversation_members?id=eq.${member.id}`, {
          method: 'PATCH',
          body: {
            last_read_message_id: messageId || null,
            last_read_at: now,
          },
        });

        const members = await DbService.restRequest<any[]>(`/conversation_members?conversation_id=eq.${conversationId}&left_at=is.null`);
        const userIds = (members || []).map((m: any) => m.userId);

        PresenceService.broadcastToUsers(userIds, {
          type: 'READ_RECEIPT',
          payload: {
            conversationId,
            userId,
            lastReadMessageId: messageId || null,
            readAt: now,
          },
        });

        return { success: true, lastReadMessageId: messageId || null };
      }
    );
  }

  /**
   * Add a member to a group conversation
   */
  public static async addGroupMember(
    currentUserId: string,
    conversationId: string,
    targetUserId: string
  ): Promise<ConversationMember> {
    await this.verifyMembership(currentUserId, conversationId);

    // Check if target user is valid and active
    const targetUser = await DbService.query(
      async () =>
        (prisma as any).user.findUnique({
          where: { id: targetUserId },
          include: { employee: true },
        }),
      async () => {
        const rows = await DbService.restRequest<any[]>(`/users?id=eq.${targetUserId}&limit=1`);
        return rows?.[0] || null;
      }
    );

    if (!targetUser || targetUser.status === 'TERMINATED' || targetUser.status === 'DEACTIVATED') {
      const err: any = new Error('Invalid user or employee is deactivated');
      err.statusCode = 400;
      throw err;
    }

    return DbService.query(
      async () => {
        const conv = await (prisma as any).conversation.findUnique({
          where: { id: conversationId },
        });

        if (!conv || conv.type !== 'GROUP') {
          const err: any = new Error('Cannot add members to a direct 1:1 conversation');
          err.statusCode = 400;
          throw err;
        }

        const existingMember = await (prisma as any).conversationMember.findUnique({
          where: {
            conversationId_userId: {
              conversationId,
              userId: targetUserId,
            },
          },
        });

        if (existingMember && !existingMember.leftAt) {
          const err: any = new Error('User is already a member of this conversation');
          err.statusCode = 400;
          throw err;
        }

        const now = new Date();
        const member = await (prisma as any).conversationMember.upsert({
          where: {
            conversationId_userId: {
              conversationId,
              userId: targetUserId,
            },
          },
          create: {
            conversationId,
            userId: targetUserId,
            role: 'MEMBER',
            joinedAt: now,
          },
          update: {
            leftAt: null,
            joinedAt: now,
          },
          include: {
            user: {
              include: {
                employee: {
                  include: { department: true, designation: true },
                },
              },
            },
          },
        });

        const actorIdentity = await MeetingSignalingService.resolveUserIdentity(currentUserId);
        const targetIdentity = await MeetingSignalingService.resolveUserIdentity(targetUserId);
        const actorName = actorIdentity?.displayName || 'Admin';
        const targetName = targetIdentity?.displayName || 'A member';

        // Create system activity message
        const sysMsg = await (prisma as any).message.create({
          data: {
            conversationId,
            senderUserId: currentUserId,
            body: `${actorName} added ${targetName}`,
            isSystem: true,
            createdAt: now,
          },
          include: {
            sender: {
              include: { employee: true },
            },
          },
        });

        // Update conversation lastMessageAt
        await (prisma as any).conversation.update({
          where: { id: conversationId },
          data: {
            lastMessageAt: now,
            updatedAt: now,
          },
        });

        const allMembers = await (prisma as any).conversationMember.findMany({
          where: { conversationId, leftAt: null },
        });
        const userIds = allMembers.map((m: any) => m.userId);

        PresenceService.broadcastToUsers(userIds, {
          type: 'GROUP_MEMBER_ADDED',
          payload: {
            conversationId,
            member,
            addedByUserId: currentUserId,
          },
        });

        PresenceService.broadcastToUsers(userIds, {
          type: 'MEMBER_JOINED',
          payload: {
            conversationId,
            member,
          },
        });

        PresenceService.broadcastToUsers(userIds, {
          type: 'NEW_MESSAGE',
          payload: {
            conversationId,
            message: this.formatMessage(sysMsg),
          },
        });

        return member;
      },
      async () => {
        const existingMembers = await DbService.restRequest<any[]>(`/conversation_members?conversation_id=eq.${conversationId}&user_id=eq.${targetUserId}&left_at=is.null&limit=1`);
        if (existingMembers && existingMembers.length > 0) {
          const err: any = new Error('User is already a member of this conversation');
          err.statusCode = 400;
          throw err;
        }

        const now = new Date().toISOString();
        const createdMembers = await DbService.restRequest<any[]>('/conversation_members', {
          method: 'POST',
          body: {
            conversation_id: conversationId,
            user_id: targetUserId,
            role: 'MEMBER',
            joined_at: now,
          },
        });
        const newMember = createdMembers[0];

        const actorIdentity = await MeetingSignalingService.resolveUserIdentity(currentUserId);
        const targetIdentity = await MeetingSignalingService.resolveUserIdentity(targetUserId);
        const actorName = actorIdentity?.displayName || 'Admin';
        const targetName = targetIdentity?.displayName || 'A member';

        const sysMsgs = await DbService.restRequest<any[]>('/messages', {
          method: 'POST',
          body: {
            conversation_id: conversationId,
            sender_user_id: currentUserId,
            body: `${actorName} added ${targetName}`,
            is_system: true,
            created_at: now,
          },
        });
        const sysMsg = sysMsgs[0];

        const allMembers = await DbService.restRequest<any[]>(`/conversation_members?conversation_id=eq.${conversationId}&left_at=is.null`);
        const userIds = (allMembers || []).map((m: any) => m.userId);

        PresenceService.broadcastToUsers(userIds, {
          type: 'GROUP_MEMBER_ADDED',
          payload: { conversationId, member: newMember, addedByUserId: currentUserId },
        });
        PresenceService.broadcastToUsers(userIds, {
          type: 'MEMBER_JOINED',
          payload: { conversationId, member: newMember },
        });
        PresenceService.broadcastToUsers(userIds, {
          type: 'NEW_MESSAGE',
          payload: { conversationId, message: this.formatMessage(sysMsg) },
        });

        return newMember as any;
      }
    );
  }

  /**
   * Remove a member from a group conversation (admin only)
   */
  public static async removeGroupMember(
    currentUserId: string,
    conversationId: string,
    targetUserId: string
  ): Promise<{ success: boolean }> {
    const currentMember = await this.verifyMembership(currentUserId, conversationId);
    if (currentMember.role !== 'ADMIN') {
      const err: any = new Error('Forbidden: Only group admins can remove members');
      err.statusCode = 403;
      throw err;
    }

    return DbService.query(
      async () => {
        const now = new Date();
        await (prisma as any).conversationMember.update({
          where: {
            conversationId_userId: {
              conversationId,
              userId: targetUserId,
            },
          },
          data: {
            leftAt: now,
          },
        });

        const actorIdentity = await MeetingSignalingService.resolveUserIdentity(currentUserId);
        const targetIdentity = await MeetingSignalingService.resolveUserIdentity(targetUserId);
        const actorName = actorIdentity?.displayName || 'Admin';
        const targetName = targetIdentity?.displayName || 'A member';

        const sysMsg = await (prisma as any).message.create({
          data: {
            conversationId,
            senderUserId: currentUserId,
            body: `${actorName} removed ${targetName} from the group`,
            isSystem: true,
            createdAt: now,
          },
          include: {
            sender: {
              include: { employee: true },
            },
          },
        });

        await (prisma as any).conversation.update({
          where: { id: conversationId },
          data: {
            lastMessageAt: now,
            updatedAt: now,
          },
        });

        const allMembers = await (prisma as any).conversationMember.findMany({
          where: { conversationId },
        });
        const userIds = allMembers.map((m: any) => m.userId);

        PresenceService.broadcastToUsers(userIds, {
          type: 'GROUP_MEMBER_REMOVED',
          payload: {
            conversationId,
            removedUserId: targetUserId,
            removedByUserId: currentUserId,
          },
        });

        PresenceService.broadcastToUsers(userIds, {
          type: 'NEW_MESSAGE',
          payload: {
            conversationId,
            message: this.formatMessage(sysMsg),
          },
        });

        return { success: true };
      },
      async () => {
        const now = new Date().toISOString();
        await DbService.restRequest(`/conversation_members?conversation_id=eq.${conversationId}&user_id=eq.${targetUserId}`, {
          method: 'PATCH',
          body: {
            left_at: now,
          },
        });

        const actorIdentity = await MeetingSignalingService.resolveUserIdentity(currentUserId);
        const targetIdentity = await MeetingSignalingService.resolveUserIdentity(targetUserId);
        const actorName = actorIdentity?.displayName || 'Admin';
        const targetName = targetIdentity?.displayName || 'A member';

        const sysMsgs = await DbService.restRequest<any[]>('/messages', {
          method: 'POST',
          body: {
            conversation_id: conversationId,
            sender_user_id: currentUserId,
            body: `${actorName} removed ${targetName} from the group`,
            is_system: true,
            created_at: now,
          },
        });
        const sysMsg = sysMsgs[0];

        const members = await DbService.restRequest<any[]>(`/conversation_members?conversation_id=eq.${conversationId}`);
        const userIds = (members || []).map((m: any) => m.userId);

        PresenceService.broadcastToUsers(userIds, {
          type: 'GROUP_MEMBER_REMOVED',
          payload: { conversationId, removedUserId: targetUserId, removedByUserId: currentUserId },
        });
        PresenceService.broadcastToUsers(userIds, {
          type: 'NEW_MESSAGE',
          payload: { conversationId, message: this.formatMessage(sysMsg) },
        });

        return { success: true };
      }
    );
  }

  /**
   * Leave a group conversation voluntarily
   */
  public static async leaveGroupConversation(
    currentUserId: string,
    conversationId: string
  ): Promise<{ success: boolean }> {
    await this.verifyMembership(currentUserId, conversationId);

    return DbService.query(
      async () => {
        const now = new Date();
        await (prisma as any).conversationMember.update({
          where: {
            conversationId_userId: {
              conversationId,
              userId: currentUserId,
            },
          },
          data: {
            leftAt: now,
          },
        });

        const userIdentity = await MeetingSignalingService.resolveUserIdentity(currentUserId);
        const userName = userIdentity?.displayName || 'A member';

        const sysMsg = await (prisma as any).message.create({
          data: {
            conversationId,
            senderUserId: currentUserId,
            body: `${userName} left the group`,
            isSystem: true,
            createdAt: now,
          },
          include: {
            sender: {
              include: { employee: true },
            },
          },
        });

        await (prisma as any).conversation.update({
          where: { id: conversationId },
          data: {
            lastMessageAt: now,
            updatedAt: now,
          },
        });

        const remainingMembers = await (prisma as any).conversationMember.findMany({
          where: { conversationId, leftAt: null },
        });
        const userIds = remainingMembers.map((m: any) => m.userId);

        PresenceService.broadcastToUsers(userIds, {
          type: 'GROUP_MEMBER_LEFT',
          payload: {
            conversationId,
            leftUserId: currentUserId,
          },
        });

        PresenceService.broadcastToUsers(userIds, {
          type: 'NEW_MESSAGE',
          payload: {
            conversationId,
            message: this.formatMessage(sysMsg),
          },
        });

        return { success: true };
      },
      async () => {
        const now = new Date().toISOString();
        await DbService.restRequest(`/conversation_members?conversation_id=eq.${conversationId}&user_id=eq.${currentUserId}`, {
          method: 'PATCH',
          body: {
            left_at: now,
          },
        });

        const userIdentity = await MeetingSignalingService.resolveUserIdentity(currentUserId);
        const userName = userIdentity?.displayName || 'A member';

        const sysMsgs = await DbService.restRequest<any[]>('/messages', {
          method: 'POST',
          body: {
            conversation_id: conversationId,
            sender_user_id: currentUserId,
            body: `${userName} left the group`,
            is_system: true,
            created_at: now,
          },
        });
        const sysMsg = sysMsgs[0];

        const members = await DbService.restRequest<any[]>(`/conversation_members?conversation_id=eq.${conversationId}&left_at=is.null`);
        const userIds = (members || []).map((m: any) => m.userId);

        PresenceService.broadcastToUsers(userIds, {
          type: 'GROUP_MEMBER_LEFT',
          payload: { conversationId, leftUserId: currentUserId },
        });
        PresenceService.broadcastToUsers(userIds, {
          type: 'NEW_MESSAGE',
          payload: { conversationId, message: this.formatMessage(sysMsg) },
        });

        return { success: true };
      }
    );
  }

  /**
   * Helper: Verify user is an active member of conversation
   */
  private static async verifyMembership(userId: string, conversationId: string): Promise<any> {
    return DbService.query(
      async () => {
        const member = await (prisma as any).conversationMember.findUnique({
          where: {
            conversationId_userId: {
              conversationId,
              userId,
            },
          },
        });

        if (!member || member.leftAt) {
          const err: any = new Error('Forbidden: You are not an active member of this conversation');
          err.statusCode = 403;
          throw err;
        }
        return member;
      },
      async () => {
        const rows = await DbService.restRequest<any[]>(`/conversation_members?conversation_id=eq.${conversationId}&user_id=eq.${userId}&left_at=is.null&limit=1`);
        const member = rows?.[0];
        if (!member) {
          const err: any = new Error('Forbidden: You are not an active member of this conversation');
          err.statusCode = 403;
          throw err;
        }
        return member;
      }
    );
  }

  /**
   * Helper: Format and enrich conversation with otherUser and unreadCount
   */
  private static async enrichConversation(
    currentUserId: string,
    conv: any,
    currentMember?: any,
    preIdentityMap?: Map<string, any>,
    prePresenceMap?: Map<string, any>
  ): Promise<Conversation> {
    const rawMembers = conv.members || [];
    let identityMap = preIdentityMap;
    let presenceMap = prePresenceMap;

    // If maps were not passed in, batch resolve all user IDs in this single conversation
    if (!identityMap || !presenceMap) {
      const userIdsSet = new Set<string>();
      if (conv.createdBy || conv.created_by) userIdsSet.add(conv.createdBy || conv.created_by);
      if (conv.directUserAId || conv.direct_user_a_id) userIdsSet.add(conv.directUserAId || conv.direct_user_a_id);
      if (conv.directUserBId || conv.direct_user_b_id) userIdsSet.add(conv.directUserBId || conv.direct_user_b_id);
      for (const m of rawMembers) {
        const uId = m.userId || m.user_id;
        if (uId) userIdsSet.add(uId);
      }
      const userIds = Array.from(userIdsSet);
      const [bIdentities, bPresence] = await Promise.all([
        MeetingSignalingService.resolveUserIdentitiesBatch(userIds),
        PresenceService.getBulkPresence(userIds),
      ]);
      identityMap = bIdentities;
      presenceMap = bPresence;
    }

    let otherUser: any = null;

    if (conv.type === 'DIRECT') {
      const otherMember = rawMembers.find((m: any) => (m.userId || m.user_id) !== currentUserId);
      const otherUserId = otherMember
        ? (otherMember.userId || otherMember.user_id)
        : (conv.directUserAId === currentUserId ? conv.directUserBId : conv.directUserAId);

      if (otherUserId) {
        const identity = identityMap.get(otherUserId);
        const pres = presenceMap.get(otherUserId) || {
          status: 'AVAILABLE' as UserPresenceStatus,
          customStatusMessage: null,
          lastSeenAt: new Date().toISOString(),
        };

        const resolvedDisplayName = identity?.displayName || 'Colleague';
        const emp = identity?.employee;

        otherUser = {
          id: otherUserId,
          email: identity?.email || '',
          displayName: resolvedDisplayName,
          firstName: emp?.firstName || null,
          lastName: emp?.lastName || null,
          profilePhotoUrl: identity?.avatarUrl || emp?.profilePhotoUrl || null,
          employee: emp
            ? {
                id: emp.id,
                employeeCode: emp.employeeCode,
                designation: emp.designation ? { name: emp.designation.name } : null,
                department: emp.department ? { name: emp.department.name } : null,
              }
            : null,
          presence: {
            status: pres.status,
            customStatusMessage: pres.customStatusMessage,
            lastSeenAt: pres.lastSeenAt,
            isOnline: pres.status !== 'OFFLINE',
          },
        };
      }
    }

    // Resolve creator name authoritatively
    let createdByName = 'A member';
    const creatorUserId = conv.createdBy || conv.created_by;
    if (creatorUserId) {
      const creatorIdentity = identityMap.get(creatorUserId);
      if (creatorIdentity?.displayName) {
        createdByName = creatorIdentity.displayName;
      }
    }

    // Enrich all members with real displayName & employee details synchronously from map
    const enrichedMembers = rawMembers.map((m: any) => {
      const uId = m.userId || m.user_id;
      const identity = identityMap.get(uId);
      const emp = identity?.employee;
      const displayName = identity?.displayName || 'User';

      return {
        id: m.id || crypto.randomUUID(),
        conversationId: conv.id,
        userId: uId,
        role: m.role || 'MEMBER',
        displayName,
        joinedAt: m.joinedAt instanceof Date ? m.joinedAt.toISOString() : (m.joinedAt || m.joined_at || conv.createdAt),
        leftAt: m.leftAt instanceof Date ? m.leftAt.toISOString() : (m.leftAt || m.left_at || null),
        lastReadMessageId: m.lastReadMessageId || m.last_read_message_id || null,
        lastReadAt: m.lastReadAt instanceof Date ? m.lastReadAt.toISOString() : (m.lastReadAt || m.last_read_at || null),
        mutedAt: m.mutedAt instanceof Date ? m.mutedAt.toISOString() : (m.mutedAt || m.muted_at || null),
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : (m.createdAt || m.created_at || conv.createdAt),
        updatedAt: m.updatedAt instanceof Date ? m.updatedAt.toISOString() : (m.updatedAt || m.updated_at || conv.updatedAt),
        user: {
          id: uId,
          email: identity?.email || '',
          role: (identity?.role || 'EMPLOYEE') as any,
          displayName,
          firstName: emp?.firstName || null,
          lastName: emp?.lastName || null,
          profilePhotoUrl: identity?.avatarUrl || emp?.profilePhotoUrl || null,
          employee: emp
            ? {
                id: emp.id,
                employeeCode: emp.employeeCode,
                designation: emp.designation ? { name: emp.designation.name } : null,
                department: emp.department ? { name: emp.department.name } : null,
              }
            : null,
        },
      };
    });

    const lastMsgRaw = conv.messages && conv.messages.length > 0 ? conv.messages[conv.messages.length - 1] : null;

    return {
      id: conv.id,
      type: conv.type,
      title: conv.type === 'GROUP' ? (conv.title || 'Group Chat') : (otherUser ? otherUser.displayName : 'Direct Chat'),
      description: conv.description || null,
      createdBy: creatorUserId,
      createdByName,
      creator: {
        id: creatorUserId,
        email: '',
        displayName: createdByName,
      },
      directUserAId: conv.directUserAId || conv.direct_user_a_id,
      directUserBId: conv.directUserBId || conv.direct_user_b_id,
      directKey: conv.directKey || conv.direct_key,
      isArchived: Boolean(conv.isArchived || conv.is_archived),
      lastMessageAt: conv.lastMessageAt instanceof Date ? conv.lastMessageAt.toISOString() : (conv.lastMessageAt || conv.last_message_at),
      createdAt: conv.createdAt instanceof Date ? conv.createdAt.toISOString() : (conv.createdAt || conv.created_at),
      updatedAt: conv.updatedAt instanceof Date ? conv.updatedAt.toISOString() : (conv.updatedAt || conv.updated_at),
      members: enrichedMembers,
      lastMessage: lastMsgRaw ? this.formatMessage(lastMsgRaw) : null,
      unreadCount: 0,
      otherUser,
    };
  }

  /**
   * Helper: Format message object
   */
  private static formatMessage(m: any): Message {
    const senderObj = m.sender || { id: m.senderUserId, email: '' };
    const emp = senderObj?.employee;
    const isSuperAdmin = senderObj?.role === 'SUPER_ADMIN';
    let senderDisplayName = '';
    if (emp && (emp.firstName || emp.lastName)) {
      senderDisplayName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
    } else if (isSuperAdmin) {
      senderDisplayName = 'Super Admin';
    } else if (senderObj?.displayName) {
      senderDisplayName = senderObj.displayName;
    } else {
      senderDisplayName = senderObj?.email?.split('@')[0] || 'User';
    }

    const replySenderObj = m.replyTo?.sender;
    const replyEmp = replySenderObj?.employee;
    const isReplySuperAdmin = replySenderObj?.role === 'SUPER_ADMIN';
    let replySenderDisplayName = '';
    if (replyEmp && (replyEmp.firstName || replyEmp.lastName)) {
      replySenderDisplayName = `${replyEmp.firstName || ''} ${replyEmp.lastName || ''}`.trim();
    } else if (isReplySuperAdmin) {
      replySenderDisplayName = 'Super Admin';
    } else if (replySenderObj?.displayName) {
      replySenderDisplayName = replySenderObj.displayName;
    } else if (m.replyTo) {
      replySenderDisplayName = 'User';
    }

    return {
      id: m.id,
      conversationId: m.conversationId,
      senderUserId: m.senderUserId,
      body: m.deletedAt ? 'This message was deleted' : m.body,
      replyToMessageId: m.replyToMessageId || null,
      isSystem: Boolean(m.isSystem),
      createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
      editedAt: m.editedAt instanceof Date ? m.editedAt.toISOString() : m.editedAt,
      deletedAt: m.deletedAt instanceof Date ? m.deletedAt.toISOString() : m.deletedAt,
      sender: {
        id: senderObj.id,
        email: senderObj.email || '',
        displayName: senderDisplayName,
        firstName: emp?.firstName || null,
        lastName: emp?.lastName || null,
        profilePhotoUrl: emp?.profilePhotoUrl || null,
        employee: emp
          ? {
              id: emp.id,
              employeeCode: emp.employeeCode,
              designation: emp.designation ? { name: emp.designation.name } : null,
              department: emp.department ? { name: emp.department.name } : null,
            }
          : null,
      },
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            senderUserId: m.replyTo.senderUserId,
            body: m.replyTo.deletedAt ? 'This message was deleted' : m.replyTo.body,
            deletedAt: m.replyTo.deletedAt instanceof Date ? m.replyTo.deletedAt.toISOString() : m.replyTo.deletedAt,
            sender: {
              id: replySenderObj?.id || m.replyTo.senderUserId,
              displayName: replySenderDisplayName,
            },
          }
        : null,
      reactions: (m.reactions || []).map((r: any) => ({
        id: r.id,
        messageId: r.messageId,
        userId: r.userId,
        reaction: r.reaction,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        user: {
          id: r.user?.id || r.userId,
          displayName: r.user?.employee
            ? `${r.user.employee.firstName} ${r.user.employee.lastName}`.trim()
            : r.user?.email,
        },
      })),
      attachments: (m.attachments || []).map((a: any) => ({
        id: a.id,
        messageId: a.messageId,
        fileName: a.fileName,
        fileUrl: a.fileUrl,
        fileSize: a.fileSize,
        fileType: a.fileType,
        createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
      })),
    };
  }
}
