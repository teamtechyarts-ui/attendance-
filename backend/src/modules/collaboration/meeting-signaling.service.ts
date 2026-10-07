import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';
import { PresenceService } from './presence.service.js';
import { NotificationService } from '../notifications/notification.service.js';
import crypto from 'crypto';

export type MeetingStatus = 'SCHEDULED' | 'LOBBY' | 'ACTIVE' | 'ENDING' | 'ENDED' | 'CANCELLED';

export type MeetingParticipantStatus = 'INVITED' | 'JOINING' | 'JOINED' | 'LEFT' | 'DISCONNECTED' | 'REMOVED';

export interface ScreenShareInfo {
  userId: string;
  displayName: string;
  startedAt: string;
}

export interface MeetingParticipantInfo {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'HOST' | 'PARTICIPANT';
  status: MeetingParticipantStatus;
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing?: boolean;
  joinedAt: string;
  leftAt?: string | null;
  lastSeenAt: string;
}

export interface ActiveMeetingSession {
  meetingId: string;
  conversationId: string;
  title: string;
  hostUserId: string;
  hostName: string;
  hostAvatarUrl: string | null;
  status: MeetingStatus;
  startedAt: string;
  endedAt?: string | null;
  durationSeconds?: number;
  activeScreenShare?: ScreenShareInfo | null;
  participants: Map<string, MeetingParticipantInfo>;
}

export interface PublicMeetingState {
  meetingId: string;
  conversationId: string;
  title: string;
  hostUserId: string;
  hostName: string;
  hostAvatarUrl: string | null;
  status: MeetingStatus;
  startedAt: string;
  endedAt?: string | null;
  activeScreenShare?: ScreenShareInfo | null;
  participants: MeetingParticipantInfo[];
}

export class MeetingSignalingService {
  // Map of meetingId -> ActiveMeetingSession
  private static activeMeetings = new Map<string, ActiveMeetingSession>();
  // Map of conversationId -> active meetingId (one active meeting per group conversation)
  private static convToActiveMeeting = new Map<string, string>();
  // Map of userId -> active meetingId
  private static userToMeeting = new Map<string, string>();
  // Disconnect grace timers for participants: `${meetingId}_${userId}` -> NodeJS.Timeout
  private static disconnectTimers = new Map<string, NodeJS.Timeout>();
  private static dbDisabled = false;

  /**
   * Check if a meeting is currently active
   */
  public static isMeetingActive(meetingId: string): boolean {
    const session = this.activeMeetings.get(meetingId);
    return Boolean(session && session.status === 'ACTIVE');
  }

  /**
   * Get active meeting session by meetingId
   */
  public static getMeeting(meetingId: string): ActiveMeetingSession | undefined {
    return this.activeMeetings.get(meetingId);
  }

  /**
   * Get active meeting session for a specific conversation
   */
  public static getActiveMeetingForConversation(conversationId: string): ActiveMeetingSession | undefined {
    const meetingId = this.convToActiveMeeting.get(conversationId);
    if (!meetingId) return undefined;
    const session = this.activeMeetings.get(meetingId);
    if (session && session.status === 'ACTIVE') {
      return session;
    }
    this.convToActiveMeeting.delete(conversationId);
    return undefined;
  }

  /**
   * Get active meeting session for a user
   */
  public static getActiveMeetingForUser(userId: string): ActiveMeetingSession | undefined {
    const meetingId = this.userToMeeting.get(userId);
    if (!meetingId) return undefined;
    return this.activeMeetings.get(meetingId);
  }

  /**
   * Format active meeting for public consumption (array of participants)
   */
  public static toPublicState(session: ActiveMeetingSession): PublicMeetingState {
    return {
      meetingId: session.meetingId,
      conversationId: session.conversationId,
      title: session.title,
      hostUserId: session.hostUserId,
      hostName: session.hostName,
      hostAvatarUrl: session.hostAvatarUrl,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt || null,
      activeScreenShare: session.activeScreenShare || null,
      participants: Array.from(session.participants.values()),
    };
  }

  /**
   * Authoritative user identity resolution for multiple user IDs in batch
   */
  public static async resolveUserIdentitiesBatch(
    userIds: string[]
  ): Promise<Map<string, { displayName: string; avatarUrl: string | null; email?: string; employee?: any; role?: string }>> {
    const result = new Map<string, { displayName: string; avatarUrl: string | null; email?: string; employee?: any; role?: string }>();
    const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
    if (uniqueIds.length === 0) return result;

    try {
      const usersData = await DbService.query(
        async () => {
          return await (prisma as any).user.findMany({
            where: { id: { in: uniqueIds } },
            include: {
              employee: {
                include: { department: true, designation: true },
              },
            },
          });
        },
        async () => {
          const [users, emps] = await Promise.all([
            DbService.restRequest<any[]>(
              `/users?id=in.(${uniqueIds.join(',')})&select=id,email,role,status`
            ).catch(() => []),
            DbService.restRequest<any[]>(
              `/employees?user_id=in.(${uniqueIds.join(',')})&select=id,user_id,first_name,last_name,profile_photo_url,designation_id,department_id,employee_code`
            ).catch(() => []),
          ]);

          const empMap = new Map<string, any>();
          for (const emp of emps || []) {
            const uid = emp.user_id || emp.userId;
            if (uid) empMap.set(uid, emp);
          }

          return (users || []).map((u: any) => {
            const empObj = empMap.get(u.id);
            return {
              ...(u || {}),
              employee: empObj
                ? {
                    id: empObj.id,
                    firstName: empObj.first_name || empObj.firstName,
                    lastName: empObj.last_name || empObj.lastName,
                    profilePhotoUrl: empObj.profile_photo_url || empObj.profilePhotoUrl,
                    designation: empObj.designation || null,
                    department: empObj.department || null,
                    employeeCode: empObj.employee_code || empObj.employeeCode,
                  }
                : null,
            };
          });
        }
      );

      for (const u of usersData || []) {
        if (!u || !u.id) continue;
        const emp = u.employee;
        let displayName = 'User';
        let avatarUrl: string | null = null;

        if (emp && (emp.firstName || emp.lastName)) {
          displayName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
          avatarUrl = emp.profilePhotoUrl || null;
        } else if (
          u.displayName &&
          u.displayName !== 'Participant' &&
          u.displayName !== 'Colleague' &&
          u.displayName !== 'Caller' &&
          u.displayName !== 'Employee' &&
          u.displayName !== 'Team Member'
        ) {
          displayName = u.displayName;
          avatarUrl = u.profilePhotoUrl || null;
        } else if (u.role === 'SUPER_ADMIN' || (u.email && u.email.toLowerCase().startsWith('admin@'))) {
          displayName = 'Super Admin';
          avatarUrl = u.profilePhotoUrl || null;
        } else if (u.role === 'ADMIN' || u.role === 'LIMITED_ADMIN') {
          displayName = 'Administrator';
          avatarUrl = u.profilePhotoUrl || null;
        } else if (u.email) {
          const local = u.email.split('@')[0];
          displayName = local.charAt(0).toUpperCase() + local.slice(1);
          avatarUrl = u.profilePhotoUrl || null;
        }

        result.set(u.id, {
          displayName,
          avatarUrl,
          email: u.email || '',
          employee: emp || null,
          role: u.role || 'EMPLOYEE',
        });
      }
    } catch (err: any) {
      console.warn('[MEETING IDENTITY] Batch identity resolution error:', err?.message);
    }

    return result;
  }

  /**
   * Authoritative user identity resolution for meeting participants and hosts
   */
  public static async resolveUserIdentity(
    userId: string,
    clientSentName?: string | null
  ): Promise<{ displayName: string; avatarUrl: string | null }> {
    const map = await this.resolveUserIdentitiesBatch([userId]);
    const found = map.get(userId);
    if (found) {
      return {
        displayName: found.displayName,
        avatarUrl: found.avatarUrl,
      };
    }

    if (
      clientSentName &&
      clientSentName !== 'Participant' &&
      clientSentName !== 'Colleague' &&
      clientSentName !== 'Caller' &&
      clientSentName !== 'Employee' &&
      clientSentName !== 'Team Member'
    ) {
      return { displayName: clientSentName, avatarUrl: null };
    }

    return { displayName: 'Colleague', avatarUrl: null };
  }

  /**
   * Start a new group meeting (idempotent: if an active meeting already exists in conversation, returns it)
   */
  public static async startMeeting(
    meetingId: string,
    conversationId: string,
    hostUserId: string,
    hostName?: string,
    hostAvatarUrl?: string | null,
    title: string = 'Group Meeting'
  ): Promise<{ session: ActiveMeetingSession; isNew: boolean }> {
    // Resolve authoritative host name if missing or generic
    let resolvedHostName = hostName;
    let resolvedHostAvatar = hostAvatarUrl;
    if (!resolvedHostName || resolvedHostName === 'Participant' || resolvedHostName === 'Colleague' || resolvedHostName === 'Employee') {
      const hostIdentity = await this.resolveUserIdentity(hostUserId);
      resolvedHostName = hostIdentity.displayName;
      resolvedHostAvatar = resolvedHostAvatar || hostIdentity.avatarUrl;
    }

    // Check if an active meeting already exists for this conversation
    const existingMeetingId = this.convToActiveMeeting.get(conversationId);
    if (existingMeetingId) {
      const existing = this.activeMeetings.get(existingMeetingId);
      if (existing && existing.status === 'ACTIVE') {
        console.log(`[MEETING] Reusing existing active meeting ${existingMeetingId} for conversation ${conversationId}`);
        // Ensure host is participant
        if (!existing.participants.has(hostUserId)) {
          existing.participants.set(hostUserId, {
            userId: hostUserId,
            displayName: resolvedHostName,
            avatarUrl: resolvedHostAvatar || null,
            role: existing.hostUserId === hostUserId ? 'HOST' : 'PARTICIPANT',
            status: 'JOINED',
            isMuted: false,
            isCameraOff: false,
            joinedAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
          });
        }
        this.userToMeeting.set(hostUserId, existingMeetingId);
        return { session: existing, isNew: false };
      }
    }

    const now = new Date().toISOString();
    const participants = new Map<string, MeetingParticipantInfo>();

    const hostParticipant: MeetingParticipantInfo = {
      userId: hostUserId,
      displayName: resolvedHostName,
      avatarUrl: resolvedHostAvatar || null,
      role: 'HOST',
      status: 'JOINED',
      isMuted: false,
      isCameraOff: false,
      joinedAt: now,
      lastSeenAt: now,
    };

    participants.set(hostUserId, hostParticipant);

    const session: ActiveMeetingSession = {
      meetingId,
      conversationId,
      title,
      hostUserId,
      hostName: resolvedHostName,
      hostAvatarUrl: resolvedHostAvatar || null,
      status: 'ACTIVE',
      startedAt: now,
      participants,
    };

    this.activeMeetings.set(meetingId, session);
    this.convToActiveMeeting.set(conversationId, meetingId);
    this.userToMeeting.set(hostUserId, meetingId);

    console.log(`[MEETING] Started new group meeting: meetingId=${meetingId} convId=${conversationId} host=${hostUserId} hostName="${resolvedHostName}"`);

    // Persist meeting and host participant to PostgreSQL
    try {
      await this.persistMeetingToDb(session);
      await this.persistParticipantToDb(meetingId, hostParticipant);
    } catch (err: any) {
      console.warn('[MEETING DB] Could not persist meeting record:', err?.message);
    }

    return { session, isNew: true };
  }

  /**
   * Join an active meeting
   */
  public static async joinMeeting(
    meetingId: string,
    userId: string,
    displayName?: string,
    avatarUrl?: string | null,
    isMuted: boolean = false,
    isCameraOff: boolean = false
  ): Promise<{ session: ActiveMeetingSession; participant: MeetingParticipantInfo } | null> {
    const session = this.activeMeetings.get(meetingId);
    if (!session || session.status !== 'ACTIVE') {
      console.warn(`[MEETING] Cannot join meeting ${meetingId}: not found or not active`);
      return null;
    }

    // Resolve authoritative display name if missing or generic
    let resolvedName = displayName;
    let resolvedAvatar = avatarUrl;
    if (!resolvedName || resolvedName === 'Participant' || resolvedName === 'Colleague' || resolvedName === 'Employee') {
      const userIdent = await this.resolveUserIdentity(userId);
      resolvedName = userIdent.displayName;
      resolvedAvatar = resolvedAvatar || userIdent.avatarUrl;
    }

    // Cancel any pending disconnect timer for this user
    const timerKey = `${meetingId}_${userId}`;
    const timer = this.disconnectTimers.get(timerKey);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(timerKey);
    }

    const now = new Date().toISOString();
    let participant = session.participants.get(userId);

    if (participant) {
      // User rejoining or updating
      participant.status = 'JOINED';
      participant.lastSeenAt = now;
      participant.leftAt = null;
      participant.isMuted = isMuted;
      participant.isCameraOff = isCameraOff;
      if (resolvedName) participant.displayName = resolvedName;
      if (resolvedAvatar) participant.avatarUrl = resolvedAvatar;
    } else {
      // New participant joining
      participant = {
        userId,
        displayName: resolvedName || 'Team Member',
        avatarUrl: resolvedAvatar || null,
        role: session.hostUserId === userId ? 'HOST' : 'PARTICIPANT',
        status: 'JOINED',
        isMuted,
        isCameraOff,
        joinedAt: now,
        lastSeenAt: now,
      };
      session.participants.set(userId, participant);
    }

    this.userToMeeting.set(userId, meetingId);
    console.log(`[MEETING] User ${userId} (${resolvedName}) joined meeting ${meetingId}. Total active participants: ${session.participants.size}`);

    try {
      await this.persistParticipantToDb(meetingId, participant);
    } catch (err: any) {
      console.warn('[MEETING DB] Could not persist participant join:', err?.message);
    }

    return { session, participant };
  }

  /**
   * Leave a meeting
   */
  public static async leaveMeeting(
    meetingId: string,
    userId: string
  ): Promise<{ session: ActiveMeetingSession; participant: MeetingParticipantInfo } | null> {
    const session = this.activeMeetings.get(meetingId);
    if (!session) return null;

    const participant = session.participants.get(userId);
    if (!participant) return null;

    const now = new Date().toISOString();
    participant.status = 'LEFT';
    participant.leftAt = now;
    participant.lastSeenAt = now;

    // Remove user active meeting mapping
    if (this.userToMeeting.get(userId) === meetingId) {
      this.userToMeeting.delete(userId);
    }

    // If the leaving user was sharing their screen, clear activeScreenShare
    if (session.activeScreenShare?.userId === userId) {
      session.activeScreenShare = null;
    }
    participant.isScreenSharing = false;

    console.log(`[MEETING] User ${userId} left meeting ${meetingId}`);

    try {
      await this.persistParticipantToDb(meetingId, participant);
    } catch (err: any) {
      console.warn('[MEETING DB] Could not persist participant leave:', err?.message);
    }

    // Check if any participants remain active
    const activeRemaining = Array.from(session.participants.values()).filter(
      (p) => p.status === 'JOINED' || p.status === 'JOINING'
    );

    if (activeRemaining.length === 0) {
      console.log(`[MEETING] All participants left meeting ${meetingId}. Auto-ending session.`);
      await this.endMeeting(meetingId, userId);
    }

    return { session, participant };
  }

  /**
   * Update participant media state (mic/camera)
   */
  public static updateParticipantMedia(
    meetingId: string,
    userId: string,
    updates: { isMuted?: boolean; isCameraOff?: boolean }
  ): { session: ActiveMeetingSession; participant: MeetingParticipantInfo } | null {
    const session = this.activeMeetings.get(meetingId);
    if (!session || session.status !== 'ACTIVE') return null;

    const participant = session.participants.get(userId);
    if (!participant) return null;

    if (typeof updates.isMuted === 'boolean') {
      participant.isMuted = updates.isMuted;
    }
    if (typeof updates.isCameraOff === 'boolean') {
      participant.isCameraOff = updates.isCameraOff;
    }
    participant.lastSeenAt = new Date().toISOString();

    return { session, participant };
  }

  /**
   * Start screen sharing in a group meeting (strictly ONE active sharer at a time)
   */
  public static startScreenShare(
    meetingId: string,
    userId: string,
    displayName: string
  ): { success: boolean; session?: ActiveMeetingSession; screenShare?: ScreenShareInfo; reason?: string } {
    const session = this.activeMeetings.get(meetingId);
    if (!session || session.status !== 'ACTIVE') {
      return { success: false, reason: 'Meeting is not active' };
    }

    const participant = session.participants.get(userId);
    if (!participant || participant.status !== 'JOINED') {
      return { success: false, reason: 'Participant is not in this meeting' };
    }

    // Check if another participant is already sharing
    if (session.activeScreenShare && session.activeScreenShare.userId !== userId) {
      return {
        success: false,
        reason: 'Someone is already sharing their screen.',
      };
    }

    const screenShare: ScreenShareInfo = {
      userId,
      displayName,
      startedAt: new Date().toISOString(),
    };

    session.activeScreenShare = screenShare;
    participant.isScreenSharing = true;
    participant.lastSeenAt = new Date().toISOString();

    console.log(`[MEETING] User ${userId} (${displayName}) started screen sharing in meeting ${meetingId}`);
    return { success: true, session, screenShare };
  }

  /**
   * Stop screen sharing in a group meeting
   */
  public static stopScreenShare(
    meetingId: string,
    userId: string
  ): { success: boolean; session?: ActiveMeetingSession } {
    const session = this.activeMeetings.get(meetingId);
    if (!session || session.status !== 'ACTIVE') {
      return { success: false };
    }

    const participant = session.participants.get(userId);
    if (participant) {
      participant.isScreenSharing = false;
      participant.lastSeenAt = new Date().toISOString();
    }

    if (session.activeScreenShare && (session.activeScreenShare.userId === userId || session.hostUserId === userId)) {
      session.activeScreenShare = null;
      console.log(`[MEETING] Screen sharing stopped in meeting ${meetingId} by user ${userId}`);
      return { success: true, session };
    }

    return { success: false, session };
  }

  /**
   * Host mutes a participant
   */
  public static hostMuteParticipant(
    meetingId: string,
    hostUserId: string,
    targetUserId: string
  ): { success: boolean; session?: ActiveMeetingSession; targetParticipant?: MeetingParticipantInfo; reason?: string } {
    const session = this.activeMeetings.get(meetingId);
    if (!session || session.status !== 'ACTIVE') {
      return { success: false, reason: 'Meeting is not active' };
    }

    if (session.hostUserId !== hostUserId) {
      return { success: false, reason: 'Only the meeting host can mute participants' };
    }

    const targetParticipant = session.participants.get(targetUserId);
    if (!targetParticipant || targetParticipant.status !== 'JOINED') {
      return { success: false, reason: 'Target participant is not actively in this meeting' };
    }

    targetParticipant.isMuted = true;
    targetParticipant.lastSeenAt = new Date().toISOString();

    console.log(`[MEETING] Host ${hostUserId} muted participant ${targetUserId} in meeting ${meetingId}`);
    return { success: true, session, targetParticipant };
  }

  /**
   * Host removes a participant from the meeting
   */
  public static async hostRemoveParticipant(
    meetingId: string,
    hostUserId: string,
    targetUserId: string,
    reason?: string
  ): Promise<{ success: boolean; session?: ActiveMeetingSession; targetParticipant?: MeetingParticipantInfo; reason?: string }> {
    const session = this.activeMeetings.get(meetingId);
    if (!session || session.status !== 'ACTIVE') {
      return { success: false, reason: 'Meeting is not active' };
    }

    if (session.hostUserId !== hostUserId) {
      return { success: false, reason: 'Only the meeting host can remove participants' };
    }

    if (targetUserId === hostUserId) {
      return { success: false, reason: 'Host cannot remove themselves; use End Meeting or Leave' };
    }

    const targetParticipant = session.participants.get(targetUserId);
    if (!targetParticipant || (targetParticipant.status !== 'JOINED' && targetParticipant.status !== 'JOINING')) {
      return { success: false, reason: 'Target participant is not in this meeting' };
    }

    const now = new Date().toISOString();
    targetParticipant.status = 'REMOVED';
    targetParticipant.leftAt = now;
    targetParticipant.lastSeenAt = now;
    targetParticipant.isScreenSharing = false;

    if (this.userToMeeting.get(targetUserId) === meetingId) {
      this.userToMeeting.delete(targetUserId);
    }

    if (session.activeScreenShare?.userId === targetUserId) {
      session.activeScreenShare = null;
    }

    console.log(`[MEETING] Host ${hostUserId} removed participant ${targetUserId} from meeting ${meetingId} (reason: ${reason || 'none'})`);

    this.persistParticipantToDb(meetingId, targetParticipant).catch(() => {});

    return { success: true, session, targetParticipant };
  }

  /**
   * End meeting completely (host action)
   */
  public static async endMeeting(
    meetingId: string,
    endedByUserId: string
  ): Promise<ActiveMeetingSession | null> {
    const session = this.activeMeetings.get(meetingId);
    if (!session) return null;

    if (session.hostUserId !== endedByUserId) {
      throw new Error('Only the meeting host can end the meeting');
    }

    const now = new Date().toISOString();
    session.status = 'ENDED';
    session.endedAt = now;
    session.activeScreenShare = null;

    // Mark all currently joined participants as LEFT
    for (const p of session.participants.values()) {
      if (p.status === 'JOINED' || p.status === 'JOINING' || p.status === 'DISCONNECTED') {
        p.status = 'LEFT';
        p.leftAt = now;
      }
      if (this.userToMeeting.get(p.userId) === meetingId) {
        this.userToMeeting.delete(p.userId);
      }
    }

    if (this.convToActiveMeeting.get(session.conversationId) === meetingId) {
      this.convToActiveMeeting.delete(session.conversationId);
    }

    console.log(`[MEETING] Meeting ${meetingId} ENDED by ${endedByUserId}`);

    // Persist meeting end and participant left times to DB
    await this.persistMeetingEndToDb(session);

    // Create persistent meeting summary event message in the conversation
    try {
      const durationSeconds = Math.max(
        0,
        Math.round((new Date(now).getTime() - new Date(session.startedAt).getTime()) / 1000)
      );
      session.durationSeconds = durationSeconds;

      const participantList = Array.from(session.participants.values()).map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        role: p.role,
      }));

      const summaryPayload = {
        type: 'MEETING_SUMMARY',
        meetingId: session.meetingId,
        title: session.title,
        hostUserId: session.hostUserId,
        hostName: session.hostName,
        startedAt: session.startedAt,
        endedAt: now,
        durationSeconds,
        participants: participantList,
        participantNames: participantList.map((p) => p.displayName),
      };

      const systemMsg = await DbService.query(
        async () => {
          return await (prisma as any).message.create({
            data: {
              conversationId: session.conversationId,
              senderUserId: endedByUserId,
              body: JSON.stringify(summaryPayload),
              isSystem: true,
              createdAt: new Date(now),
            },
            include: {
              sender: {
                include: { employee: true },
              },
            },
          });
        },
        async () => {
          const rows = await DbService.restRequest<any[]>('/messages', {
            method: 'POST',
            body: {
              conversation_id: session.conversationId,
              sender_user_id: endedByUserId,
              body: JSON.stringify(summaryPayload),
              is_system: true,
              created_at: now,
            },
          });
          return (
            rows?.[0] || {
              id: crypto.randomUUID(),
              conversationId: session.conversationId,
              senderUserId: endedByUserId,
              body: JSON.stringify(summaryPayload),
              isSystem: true,
              createdAt: now,
            }
          );
        }
      );

      // Update conversation lastMessageAt
      await DbService.query(
        async () => {
          return await (prisma as any).conversation.update({
            where: { id: session.conversationId },
            data: {
              lastMessageAt: new Date(now),
              updatedAt: new Date(now),
            },
          });
        },
        async () => {
          return await DbService.restRequest(`/conversations?id=eq.${session.conversationId}`, {
            method: 'PATCH',
            body: {
              last_message_at: now,
              updated_at: now,
            },
          });
        }
      );

      // Broadcast new message to all group conversation members
      const activeMembers = await DbService.query(
        async () => {
          return await (prisma as any).conversationMember.findMany({
            where: {
              conversationId: session.conversationId,
              leftAt: null,
            },
          });
        },
        async () => {
          return await DbService.restRequest<any[]>(
            `/conversation_members?conversation_id=eq.${session.conversationId}&left_at=is.null`
          );
        }
      );
      const memberUserIds = (activeMembers || []).map((m: any) => m.userId || m.user_id);

      PresenceService.broadcastToUsers(memberUserIds, {
        type: 'NEW_MESSAGE',
        payload: {
          conversationId: session.conversationId,
          message: {
            id: systemMsg.id,
            conversationId: session.conversationId,
            senderUserId: endedByUserId,
            body: systemMsg.body,
            replyToMessageId: null,
            isSystem: true,
            createdAt: typeof systemMsg.createdAt === 'string' ? systemMsg.createdAt : systemMsg.createdAt?.toISOString?.() || now,
            editedAt: null,
            deletedAt: null,
            sender: {
              id: endedByUserId,
              email: '',
              displayName: session.hostName,
              firstName: null,
              lastName: null,
              profilePhotoUrl: null,
            },
            replyTo: null,
            reactions: [],
            attachments: [],
          },
        },
      });
    } catch (err: any) {
      console.warn('[MEETING] Failed to create meeting summary message in conversation:', err?.message);
    }

    return session;
  }

  /**
   * Handle user WebSocket disconnect with a grace period
   */
  public static handleUserDisconnect(userId: string, graceMs: number = 8000): void {
    const meetingId = this.userToMeeting.get(userId);
    if (!meetingId) return;

    const session = this.activeMeetings.get(meetingId);
    if (!session || session.status !== 'ACTIVE') return;

    const participant = session.participants.get(userId);
    if (!participant || participant.status !== 'JOINED') return;

    participant.status = 'DISCONNECTED';
    participant.lastSeenAt = new Date().toISOString();

    console.log(`[MEETING] User ${userId} disconnected from meeting ${meetingId}. Starting grace period.`);

    // Broadcast participant state change to other meeting participants
    const otherUserIds = Array.from(session.participants.keys()).filter((id) => id !== userId);
    PresenceService.broadcastToUsers(otherUserIds, {
      type: 'MEETING_PARTICIPANT_UPDATED',
      payload: {
        meetingId,
        conversationId: session.conversationId,
        participant,
      },
    });

    const timerKey = `${meetingId}_${userId}`;
    const timer = setTimeout(async () => {
      this.disconnectTimers.delete(timerKey);
      const currentSession = this.activeMeetings.get(meetingId);
      if (!currentSession || currentSession.status !== 'ACTIVE') return;

      const p = currentSession.participants.get(userId);
      if (p && p.status === 'DISCONNECTED') {
        console.log(`[MEETING] Grace period expired for user ${userId} in meeting ${meetingId}. Marking LEFT.`);
        await this.leaveMeeting(meetingId, userId);

        const remainingIds = Array.from(currentSession.participants.keys()).filter((id) => id !== userId);
        PresenceService.broadcastToUsers(remainingIds, {
          type: 'MEETING_PARTICIPANT_LEFT',
          payload: {
            meetingId,
            conversationId: currentSession.conversationId,
            userId,
            reason: 'Connection lost',
          },
        });
      }
    }, graceMs);

    this.disconnectTimers.set(timerKey, timer);
  }

  /**
   * Handle user WebSocket reconnect / sync
   */
  public static handleUserReconnect(userId: string): ActiveMeetingSession | undefined {
    const meetingId = this.userToMeeting.get(userId);
    if (!meetingId) return undefined;

    const session = this.activeMeetings.get(meetingId);
    if (!session || session.status !== 'ACTIVE') return undefined;

    const timerKey = `${meetingId}_${userId}`;
    const timer = this.disconnectTimers.get(timerKey);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(timerKey);
    }

    const participant = session.participants.get(userId);
    if (participant && participant.status === 'DISCONNECTED') {
      participant.status = 'JOINED';
      participant.lastSeenAt = new Date().toISOString();

      const otherUserIds = Array.from(session.participants.keys()).filter((id) => id !== userId);
      PresenceService.broadcastToUsers(otherUserIds, {
        type: 'MEETING_PARTICIPANT_UPDATED',
        payload: {
          meetingId,
          conversationId: session.conversationId,
          participant,
        },
      });
    }

    return session;
  }

  private static isValidUuid(str: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  }

  private static async persistMeetingToDb(session: ActiveMeetingSession) {
    if (this.dbDisabled) return;
    if (!this.isValidUuid(session.meetingId) || !this.isValidUuid(session.conversationId) || !this.isValidUuid(session.hostUserId)) return;
    try {
      await DbService.query(
        async () => {
          return await (prisma as any).meeting.upsert({
            where: { id: session.meetingId },
            create: {
              id: session.meetingId,
              conversationId: session.conversationId,
              hostUserId: session.hostUserId,
              title: session.title,
              status: 'ACTIVE',
              startedAt: new Date(session.startedAt),
            },
            update: {
              status: 'ACTIVE',
            },
          });
        },
        async () => {
          const existing = await DbService.restRequest<any[]>(
            `/meetings?id=eq.${session.meetingId}`
          );
          if (existing && existing.length > 0) {
            return await DbService.restRequest(`/meetings?id=eq.${session.meetingId}`, {
              method: 'PATCH',
              body: {
                status: 'ACTIVE',
              },
            });
          } else {
            return await DbService.restRequest('/meetings', {
              method: 'POST',
              body: {
                id: session.meetingId,
                conversation_id: session.conversationId,
                host_user_id: session.hostUserId,
                title: session.title,
                status: 'ACTIVE',
                started_at: session.startedAt,
              },
            });
          }
        }
      );
    } catch (e: any) {
      console.warn('[MEETING DB] Could not persist meeting record:', e?.message);
    }
  }

  private static async persistParticipantToDb(meetingId: string, participant: MeetingParticipantInfo) {
    if (this.dbDisabled) return;
    if (!this.isValidUuid(meetingId) || !this.isValidUuid(participant.userId)) return;
    try {
      await DbService.query(
        async () => {
          return await (prisma as any).meetingParticipant.upsert({
            where: {
              meetingId_userId: {
                meetingId,
                userId: participant.userId,
              },
            },
            create: {
              meetingId,
              userId: participant.userId,
              status: participant.status,
              isMuted: participant.isMuted,
              isCameraOff: participant.isCameraOff,
              joinedAt: new Date(participant.joinedAt),
              lastSeenAt: new Date(participant.lastSeenAt),
              leftAt: participant.leftAt ? new Date(participant.leftAt) : null,
            },
            update: {
              status: participant.status,
              isMuted: participant.isMuted,
              isCameraOff: participant.isCameraOff,
              lastSeenAt: new Date(participant.lastSeenAt),
              leftAt: participant.leftAt ? new Date(participant.leftAt) : null,
            },
          });
        },
        async () => {
          const existing = await DbService.restRequest<any[]>(
            `/meeting_participants?meeting_id=eq.${meetingId}&user_id=eq.${participant.userId}`
          );
          if (existing && existing.length > 0) {
            return await DbService.restRequest(
              `/meeting_participants?meeting_id=eq.${meetingId}&user_id=eq.${participant.userId}`,
              {
                method: 'PATCH',
                body: {
                  status: participant.status,
                  is_muted: participant.isMuted,
                  is_camera_off: participant.isCameraOff,
                  last_seen_at: participant.lastSeenAt,
                  left_at: participant.leftAt || null,
                },
              }
            );
          } else {
            return await DbService.restRequest('/meeting_participants', {
              method: 'POST',
              body: {
                meeting_id: meetingId,
                user_id: participant.userId,
                status: participant.status,
                is_muted: participant.isMuted,
                is_camera_off: participant.isCameraOff,
                joined_at: participant.joinedAt,
                last_seen_at: participant.lastSeenAt,
                left_at: participant.leftAt || null,
              },
            });
          }
        }
      );
    } catch (e: any) {
      console.warn('[MEETING DB] Could not persist participant record:', e?.message);
    }
  }

  private static async persistMeetingEndToDb(session: ActiveMeetingSession) {
    if (this.dbDisabled) return;
    if (!this.isValidUuid(session.meetingId)) return;
    try {
      const endedAt = session.endedAt || new Date().toISOString();
      await DbService.query(
        async () => {
          const endedAtDate = new Date(endedAt);
          // Update meeting status
          await (prisma as any).meeting.update({
            where: { id: session.meetingId },
            data: {
              status: 'ENDED',
              endedAt: endedAtDate,
            },
          });

          // Update active participant records to set leftAt
          for (const p of session.participants.values()) {
            await (prisma as any).meetingParticipant.updateMany({
              where: {
                meetingId: session.meetingId,
                userId: p.userId,
                leftAt: null,
              },
              data: {
                status: 'LEFT',
                leftAt: endedAtDate,
                lastSeenAt: endedAtDate,
              },
            });
          }
        },
        async () => {
          await DbService.restRequest(`/meetings?id=eq.${session.meetingId}`, {
            method: 'PATCH',
            body: {
              status: 'ENDED',
              ended_at: endedAt,
            },
          });

          for (const p of session.participants.values()) {
            await DbService.restRequest(
              `/meeting_participants?meeting_id=eq.${session.meetingId}&user_id=eq.${p.userId}&left_at=is.null`,
              {
                method: 'PATCH',
                body: {
                  status: 'LEFT',
                  left_at: endedAt,
                  last_seen_at: endedAt,
                },
              }
            );
          }
        }
      );
    } catch (e: any) {
      console.warn('[MEETING DB] Could not persist meeting end:', e?.message);
    }
  }
}
