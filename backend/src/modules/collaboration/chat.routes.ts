import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import { ChatController } from './chat.controller.js';
import { registerCollaborationWebSocket } from './collaboration.ws.js';

export async function collaborationRoutes(app: FastifyInstance) {
  // 1. Register WebSocket Endpoint
  registerCollaborationWebSocket(app);

  // 2. HTTP REST Endpoints (all require authentication)
  app.get('/api/collaboration/people', { preHandler: [authenticate] }, ChatController.getPeopleDirectory);
  app.get('/api/collaboration/presence', { preHandler: [authenticate] }, ChatController.getPresence);
  app.post('/api/collaboration/presence/status', { preHandler: [authenticate] }, ChatController.setPresenceStatus);

  app.get('/api/collaboration/conversations', { preHandler: [authenticate] }, ChatController.getConversations);
  app.post('/api/collaboration/conversations/direct', { preHandler: [authenticate] }, ChatController.getOrCreateDirectConversation);
  app.post('/api/collaboration/conversations/group', { preHandler: [authenticate] }, ChatController.createGroupConversation);

  app.get('/api/collaboration/conversations/:id', { preHandler: [authenticate] }, ChatController.getConversationById);
  app.get('/api/collaboration/conversations/:id/messages', { preHandler: [authenticate] }, ChatController.getConversationMessages);
  app.post('/api/collaboration/conversations/:id/messages', { preHandler: [authenticate] }, ChatController.sendMessage);
  app.post('/api/collaboration/conversations/:id/read', { preHandler: [authenticate] }, ChatController.markConversationAsRead);
  app.post('/api/collaboration/conversations/:id/members', { preHandler: [authenticate] }, ChatController.addGroupMember);
  app.delete('/api/collaboration/conversations/:id/members/:targetUserId', { preHandler: [authenticate] }, ChatController.removeGroupMember);
  app.post('/api/collaboration/conversations/:id/leave', { preHandler: [authenticate] }, ChatController.leaveGroupConversation);

  app.patch('/api/collaboration/messages/:id', { preHandler: [authenticate] }, ChatController.editMessage);
  app.delete('/api/collaboration/messages/:id', { preHandler: [authenticate] }, ChatController.deleteMessage);
  app.post('/api/collaboration/messages/:id/reactions', { preHandler: [authenticate] }, ChatController.toggleReaction);

  // Group Meeting REST Endpoints
  app.get('/api/collaboration/conversations/:id/meeting', { preHandler: [authenticate] }, ChatController.getActiveMeetingForConversation);
  app.get('/api/collaboration/meetings/:meetingId', { preHandler: [authenticate] }, ChatController.getMeetingById);
}
