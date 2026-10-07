import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ChatService } from './chat.service.js';
import { PresenceService } from './presence.service.js';
import { MeetingSignalingService } from './meeting-signaling.service.js';
import { UserPresenceStatus } from '../../types/index.js';

export class ChatController {
  /**
   * GET /api/collaboration/people
   */
  public static async getPeopleDirectory(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const query = request.query as { search?: string; departmentId?: string };

    const people = await ChatService.getPeopleDirectory(userId, query.search, query.departmentId);
    return reply.status(200).send({ people });
  }

  /**
   * GET /api/collaboration/presence
   */
  public static async getPresence(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const presence = await PresenceService.getPresence(userId);
    return reply.status(200).send({ presence });
  }

  /**
   * POST /api/collaboration/presence/status
   */
  public static async setPresenceStatus(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const schema = z.object({
      status: z.enum(['AVAILABLE', 'BUSY', 'DO_NOT_DISTURB', 'AWAY', 'OFFLINE']),
      customStatusMessage: z.string().max(100).optional().nullable(),
    });

    const body = schema.parse(request.body);
    const updated = await PresenceService.setUserStatus(
      userId,
      body.status as UserPresenceStatus,
      body.customStatusMessage
    );

    return reply.status(200).send({ presence: updated });
  }

  /**
   * GET /api/collaboration/conversations
   */
  public static async getConversations(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const conversations = await ChatService.getUserConversations(userId);
    return reply.status(200).send({ conversations });
  }

  /**
   * POST /api/collaboration/conversations/direct
   */
  public static async getOrCreateDirectConversation(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const schema = z.object({
      targetUserId: z.string().optional(),
      userId: z.string().optional(),
    });

    const body = schema.parse(request.body);
    const targetUserId = body.targetUserId || body.userId;
    if (!targetUserId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'targetUserId is required' },
      });
    }

    const conversation = await ChatService.getOrCreateDirectConversation(userId, targetUserId);
    return reply.status(200).send({ conversation });
  }

  /**
   * POST /api/collaboration/conversations/group
   */
  public static async createGroupConversation(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const schema = z.object({
      title: z.string().min(1, 'Group title is required').max(100),
      description: z.string().max(300).optional().nullable(),
      memberUserIds: z.array(z.string()).optional().default([]),
      memberIds: z.array(z.string()).optional().nullable(),
    });

    const body = schema.parse(request.body);
    const memberUserIds =
      body.memberUserIds && body.memberUserIds.length > 0
        ? body.memberUserIds
        : (body.memberIds || []);

    const conversation = await ChatService.createGroupConversation(
      userId,
      body.title,
      body.description || undefined,
      memberUserIds
    );
    return reply.status(201).send({ conversation });
  }

  /**
   * GET /api/collaboration/conversations/:id
   */
  public static async getConversationById(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const params = request.params as { id: string };

    const conversation = await ChatService.getConversationById(userId, params.id);
    return reply.status(200).send({ conversation });
  }

  /**
   * GET /api/collaboration/conversations/:id/messages
   */
  public static async getConversationMessages(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const params = request.params as { id: string };
    const query = request.query as { cursor?: string; limit?: string };

    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const result = await ChatService.getConversationMessages(userId, params.id, query.cursor, limit);
    return reply.status(200).send(result);
  }

  /**
   * POST /api/collaboration/conversations/:id/messages
   */
  public static async sendMessage(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const params = request.params as { id: string };
    const schema = z.object({
      body: z.string().min(1).max(5000),
      replyToMessageId: z.string().uuid().optional().nullable().or(z.literal('')),
    });

    const body = schema.parse(request.body);
    const replyToMessageId = body.replyToMessageId && body.replyToMessageId.trim() !== '' ? body.replyToMessageId : undefined;
    const message = await ChatService.sendMessage(
      userId,
      params.id,
      body.body,
      replyToMessageId
    );
    return reply.status(201).send({ message });
  }

  /**
   * PATCH /api/collaboration/messages/:id
   */
  public static async editMessage(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const params = request.params as { id: string };
    const schema = z.object({
      body: z.string().min(1).max(5000),
    });

    const body = schema.parse(request.body);
    const message = await ChatService.editMessage(userId, params.id, body.body);
    return reply.status(200).send({ message });
  }

  /**
   * DELETE /api/collaboration/messages/:id
   */
  public static async deleteMessage(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const params = request.params as { id: string };
    const isStaffAdmin = request.user?.role === 'SUPER_ADMIN' || request.user?.role === 'ADMIN';

    const result = await ChatService.deleteMessage(userId, params.id, isStaffAdmin);
    return reply.status(200).send(result);
  }

  /**
   * POST /api/collaboration/messages/:id/reactions
   */
  public static async toggleReaction(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const params = request.params as { id: string };
    const schema = z.object({
      reaction: z.string().min(1).max(20),
    });

    const body = schema.parse(request.body);
    const result = await ChatService.toggleReaction(userId, params.id, body.reaction);
    return reply.status(200).send(result);
  }

  /**
   * POST /api/collaboration/conversations/:id/read
   */
  public static async markConversationAsRead(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const params = request.params as { id: string };
    const schema = z.object({
      messageId: z.string().uuid().optional().nullable(),
    });

    const body = schema.parse(request.body || {});
    const result = await ChatService.markConversationAsRead(
      userId,
      params.id,
      body.messageId || undefined
    );
    return reply.status(200).send(result);
  }

  /**
   * POST /api/collaboration/conversations/:id/members
   */
  public static async addGroupMember(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const params = request.params as { id: string };
    const schema = z.object({
      targetUserId: z.string().optional(),
      userId: z.string().optional(),
    });

    const body = schema.parse(request.body);
    const targetUserId = body.targetUserId || body.userId;
    if (!targetUserId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'targetUserId is required' },
      });
    }

    const member = await ChatService.addGroupMember(userId, params.id, targetUserId);
    return reply.status(200).send({ member });
  }

  /**
   * DELETE /api/collaboration/conversations/:id/members/:targetUserId
   */
  public static async removeGroupMember(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const params = request.params as { id: string; targetUserId: string };
    const result = await ChatService.removeGroupMember(userId, params.id, params.targetUserId);
    return reply.status(200).send(result);
  }

  /**
   * POST /api/collaboration/conversations/:id/leave
   */
  public static async leaveGroupConversation(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const params = request.params as { id: string };
    const result = await ChatService.leaveGroupConversation(userId, params.id);
    return reply.status(200).send(result);
  }

  /**
   * GET /api/collaboration/conversations/:id/meeting
   */
  public static async getActiveMeetingForConversation(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const params = request.params as { id: string };

    // Validate access to conversation
    await ChatService.getConversationById(userId, params.id);

    const session = MeetingSignalingService.getActiveMeetingForConversation(params.id);
    if (!session || session.status !== 'ACTIVE') {
      return reply.status(200).send({ meeting: null });
    }

    return reply.status(200).send({ meeting: MeetingSignalingService.toPublicState(session) });
  }

  /**
   * GET /api/collaboration/meetings/:meetingId
   */
  public static async getMeetingById(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const params = request.params as { meetingId: string };

    const session = MeetingSignalingService.getMeeting(params.meetingId);
    if (!session) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Meeting not found' } });
    }

    // Validate access to conversation
    await ChatService.getConversationById(userId, session.conversationId);

    return reply.status(200).send({ meeting: MeetingSignalingService.toPublicState(session) });
  }
}

