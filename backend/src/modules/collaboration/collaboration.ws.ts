import { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { WebSocket } from 'ws';
import { prisma } from '../../plugins/prisma.js';
import { SecurityUtil } from '../../utils/security.js';
import { PresenceService } from './presence.service.js';
import { ChatService } from './chat.service.js';
import { CallSignalingService } from './call-signaling.service.js';
import { MeetingSignalingService } from './meeting-signaling.service.js';
import { NotificationService } from '../notifications/notification.service.js';
import { UserPresenceStatus } from '../../types/index.js';

export function registerCollaborationWebSocket(app: FastifyInstance) {
  // Fastify WebSocket endpoint
  app.get(
    '/api/collaboration/ws',
    { websocket: true },
    async (connection: any, request: FastifyRequest) => {
      const socket: WebSocket = connection.socket || connection;

      // 1. Extract access token from query, header, or cookies
      const query = request.query as Record<string, any>;
      let token: string | undefined = query?.token;

      if (!token && request.headers.authorization?.startsWith('Bearer ')) {
        token = request.headers.authorization.substring(7);
      }
      if (!token && request.cookies?.access_token) {
        token = request.cookies.access_token;
      }
      if (!token && request.cookies?.session_token) {
        token = request.cookies.session_token;
      }

      if (!token) {
        try {
          socket.send(JSON.stringify({ type: 'ERROR', message: 'Authentication required' }));
          socket.close(4001, 'Unauthorized');
        } catch {}
        return;
      }

      // 2. Verify access token
      let payload = SecurityUtil.verifyAccessToken(token);
      if (!payload || !payload.userId) {
        payload = SecurityUtil.verifyAccessToken(token, { ignoreExpiration: true });
      }

      // Fallback for raw session tokens from cookies
      let userId = payload?.userId;
      if (!userId && token) {
        try {
          const tokenHash = SecurityUtil.hashSessionToken(token);
          const session = await (prisma as any).userSession.findUnique({
            where: { sessionTokenHash: tokenHash },
          });
          if (session && session.userId && new Date(session.expiresAt) > new Date()) {
            userId = session.userId;
          }
        } catch {}
      }

      if (!userId) {
        try {
          socket.send(JSON.stringify({ type: 'ERROR', message: 'Invalid or expired token' }));
          socket.close(4001, 'Invalid token');
        } catch {}
        return;
      }

      console.log(`[WS AUTH] authenticated user: ${userId}`);

      const connId = crypto.randomUUID();

      // 3. Register connection
      const initialPresence = await PresenceService.registerConnection(userId, connId, socket);
      console.log(`[CALL DEBUG] [SERVER] [WS CONNECT] userId=${userId} connId=${connId} connection registered = true`);

      // Check if user has an active meeting session to resync
      const activeMeetingSession = MeetingSignalingService.handleUserReconnect(userId);

      // Send initial connected handshake
      socket.send(
        JSON.stringify({
          type: 'CONNECTED',
          payload: {
            connId,
            userId,
            presence: initialPresence,
            serverTime: new Date().toISOString(),
          },
        })
      );

      // 4. Handle incoming messages from client
      socket.on('message', async (raw: any) => {
        try {
          const str = raw.toString();
          if (!str) return;
          const data = JSON.parse(str);

          switch (data.type) {
            case 'PING':
            case 'HEARTBEAT': {
              await PresenceService.handleHeartbeat(userId, connId, Boolean(data.isIdle));
              socket.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
              break;
            }

            case 'SET_STATUS': {
              const status: UserPresenceStatus = data.status;
              const customMsg: string | null = data.customStatusMessage;
              if (['AVAILABLE', 'BUSY', 'DO_NOT_DISTURB', 'AWAY', 'OFFLINE'].includes(status)) {
                await PresenceService.setUserStatus(userId, status, customMsg);
              }
              break;
            }

            case 'SET_ACTIVE_CONVERSATION': {
              const conversationId: string | null = data.conversationId || null;
              PresenceService.setActiveConversation(connId, conversationId);
              break;
            }

            case 'TYPING_START': {
              const convId: string = data.conversationId;
              if (convId) {
                try {
                  const conv = await ChatService.getConversationById(userId, convId);
                  const memberUserIds = conv.members?.map((m) => m.userId).filter((id) => id !== userId) || [];
                  const typingMember = conv.members?.find((m) => m.userId === userId);
                  const memberUser = (typingMember as any)?.user;
                  const displayName = memberUser?.employee?.firstName
                    ? `${memberUser.employee.firstName} ${memberUser.employee.lastName || ''}`.trim()
                    : memberUser?.displayName || (memberUser?.role === 'SUPER_ADMIN' ? 'Super Admin' : memberUser?.email?.split('@')[0]) || 'Someone';

                  PresenceService.broadcastToUsers(memberUserIds, {
                    type: 'TYPING_START',
                    payload: {
                      conversationId: convId,
                      userId,
                      displayName,
                    },
                  });
                } catch {}
              }
              break;
            }

            case 'TYPING_STOP': {
              const convId: string = data.conversationId;
              if (convId) {
                try {
                  const conv = await ChatService.getConversationById(userId, convId);
                  const memberUserIds = conv.members?.map((m) => m.userId).filter((id) => id !== userId) || [];
                  PresenceService.broadcastToUsers(memberUserIds, {
                    type: 'TYPING_STOP',
                    payload: {
                      conversationId: convId,
                      userId,
                    },
                  });
                } catch {}
              }
              break;
            }

            // ==========================================
            // Phase 2A — 1:1 Audio / Video Call Signaling
            // ==========================================
            case 'CALL_INVITE': {
              const { conversationId, callType, sdp } = data.payload || {};
              const callId = data.payload?.callId || crypto.randomUUID();
              const type: 'AUDIO' | 'VIDEO' = callType === 'VIDEO' ? 'VIDEO' : 'AUDIO';

              console.log('==================================================');
              console.log('[CALL DEBUG]');
              console.log('[BACKEND WS] Received CALL_INVITE');
              console.log(`authenticatedUserId: ${userId}`);
              console.log(`callId: ${callId}`);
              console.log(`conversationId: ${conversationId}`);
              console.log(`callType: ${type}`);
              console.log(`hasSdpOffer: ${Boolean(sdp)}`);

              if (!conversationId) {
                socket.send(JSON.stringify({ type: 'CALL_FAILED', payload: { callId, reason: 'conversationId is required' } }));
                break;
              }

              try {
                // 1. Authorize conversation and ensure direct 1:1 call
                const conv = await ChatService.getConversationById(userId, conversationId);
                if (conv.type !== 'DIRECT') {
                  console.warn(`[CALL SERVICE] Rejected call: conversation ${conversationId} is not DIRECT`);
                  socket.send(JSON.stringify({ type: 'CALL_FAILED', payload: { callId, reason: 'Calling is only supported for direct 1:1 conversations' } }));
                  break;
                }

                // 2. Resolve other participant (callee)
                const otherMember = conv.members?.find((m) => m.userId !== userId);
                const calleeUserId = otherMember?.userId || (conv.directUserAId === userId ? conv.directUserBId : conv.directUserAId);
                if (!calleeUserId) {
                  console.warn(`[CALL SERVICE] Rejected call: recipient not found in conversation ${conversationId}`);
                  socket.send(JSON.stringify({ type: 'CALL_FAILED', payload: { callId, reason: 'Recipient not found in conversation' } }));
                  break;
                }

                console.log('[CALL SERVICE] Validated CALL_INVITE');
                console.log(`callerUserId: ${userId}`);
                console.log(`calleeUserId: ${calleeUserId}`);
                console.log(`callId: ${callId}`);

                // 3. Check callee connection availability
                const calleeSockets = PresenceService.getUserSockets(calleeUserId);
                console.log('[CALL SERVICE] Target connections found:');
                console.log(`count: ${calleeSockets.length}`);

                if (calleeSockets.length === 0) {
                  console.log(`[CALL SERVICE] Callee ${calleeUserId} has 0 active connections. Sending CALL_FAILED to caller.`);
                  socket.send(JSON.stringify({
                    type: 'CALL_FAILED',
                    payload: {
                      callId,
                      conversationId,
                      calleeUserId,
                      reason: 'Recipient is currently unavailable or offline',
                    },
                  }));
                  break;
                }

                // 4. Check busy state
                if (CallSignalingService.isUserInCall(calleeUserId)) {
                  console.log(`[CALL SERVICE] Callee ${calleeUserId} is already on another call, sending CALL_BUSY to caller=${userId}`);
                  socket.send(JSON.stringify({
                    type: 'CALL_BUSY',
                    payload: {
                      callId,
                      conversationId,
                      calleeUserId,
                      message: 'User is currently on another call',
                    },
                  }));
                  break;
                }

                // 5. Resolve caller identity accurately
                let callerName = '';
                let callerAvatar: string | null = null;

                try {
                  const callerUser = await (prisma as any).user.findUnique({
                    where: { id: userId },
                    include: { employee: true },
                  });
                  if (callerUser) {
                    const emp = callerUser.employee;
                    if (emp && (emp.firstName || emp.lastName)) {
                      callerName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
                      callerAvatar = emp.profilePhotoUrl || null;
                    } else if (callerUser.displayName && callerUser.displayName !== 'Colleague' && callerUser.displayName !== 'Caller') {
                      callerName = callerUser.displayName;
                    } else if (callerUser.role === 'SUPER_ADMIN' || (callerUser.email && callerUser.email.toLowerCase().startsWith('admin@'))) {
                      callerName = 'Super Admin';
                    } else if (callerUser.email) {
                      const local = callerUser.email.split('@')[0];
                      callerName = local.charAt(0).toUpperCase() + local.slice(1);
                    }
                  }
                } catch {}

                if (!callerName) {
                  const currentMember = conv.members?.find((m) => m.userId === userId);
                  const currentUserObj = (currentMember as any)?.user;
                  const emp = currentUserObj?.employee;
                  callerName = emp?.firstName || emp?.lastName
                    ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim()
                    : currentUserObj?.displayName || (currentUserObj?.role === 'SUPER_ADMIN' ? 'Super Admin' : currentUserObj?.email?.split('@')[0]) || 'Colleague';
                  callerAvatar = callerAvatar || emp?.profilePhotoUrl || currentUserObj?.profilePhotoUrl || null;
                }

                // 6. Register session with offer SDP
                CallSignalingService.initiateCall(
                  callId,
                  conversationId,
                  userId,
                  calleeUserId,
                  callerName,
                  callerAvatar,
                  type,
                  sdp
                );

                // 7. Broadcast CALL_INVITE to callee
                console.log('[CALL SERVICE] Broadcasting CALL_INVITE');
                console.log(`targetUserId: ${calleeUserId}`);
                console.log(`connectionCount: ${calleeSockets.length}`);

                const deliveredCount = PresenceService.broadcastToUsers([calleeUserId], {
                  type: 'CALL_INVITE',
                  payload: {
                    callId,
                    conversationId,
                    callerUserId: userId,
                    calleeUserId,
                    callerName,
                    callerAvatar,
                    callType: type,
                    sdp,
                  },
                });

                if (deliveredCount > 0) {
                  console.log(`[BACKEND WS] CALL_INVITE delivered (${deliveredCount} socket(s))`);
                } else {
                  console.warn('[BACKEND WS] CALL_INVITE delivery failed to all sockets');
                  CallSignalingService.endCall(callId);
                  socket.send(JSON.stringify({
                    type: 'CALL_FAILED',
                    payload: {
                      callId,
                      conversationId,
                      reason: 'Failed to deliver call invitation',
                    },
                  }));
                }
              } catch (err: any) {
                console.error('[CollaborationWS] CALL_INVITE error:', err);
                socket.send(JSON.stringify({ type: 'CALL_FAILED', payload: { callId, reason: err?.message || 'Failed to initiate call' } }));
              }
              break;
            }

            case 'CALL_RINGING': {
              const { callId } = data.payload || {};
              const session = callId ? CallSignalingService.getCall(callId) : undefined;
              console.log(`[CALL DEBUG] [SERVER] Received CALL_RINGING ack from userId=${userId} callId=${callId} sessionFound=${Boolean(session)}`);
              if (session && session.calleeUserId === userId) {
                console.log(`[CALL DEBUG] [SERVER] Forwarding CALL_RINGING to caller=${session.callerUserId}`);
                PresenceService.broadcastToUsers([session.callerUserId], {
                  type: 'CALL_RINGING',
                  payload: {
                    callId: session.callId,
                    conversationId: session.conversationId,
                    callerUserId: session.callerUserId,
                    calleeUserId: session.calleeUserId,
                  },
                });
              }
              break;
            }

            case 'CALL_ACCEPT': {
              const { callId } = data.payload || {};
              const session = callId ? CallSignalingService.getCall(callId) : undefined;
              console.log(`[CALL DEBUG] [SERVER] Received CALL_ACCEPT from userId=${userId} callId=${callId} sessionFound=${Boolean(session)}`);
              if (session && session.calleeUserId === userId) {
                CallSignalingService.updateCallState(callId, 'CONNECTING');
                console.log(`[CALL DEBUG] [SERVER] Forwarding CALL_ACCEPT to caller=${session.callerUserId}`);
                PresenceService.broadcastToUsers([session.callerUserId], {
                  type: 'CALL_ACCEPT',
                  payload: {
                    callId: session.callId,
                    conversationId: session.conversationId,
                    callerUserId: session.callerUserId,
                    calleeUserId: session.calleeUserId,
                  },
                });
              }
              break;
            }

            case 'CALL_REJECT': {
              const { callId, reason } = data.payload || {};
              const session = callId ? CallSignalingService.getCall(callId) : undefined;
              console.log(`[CALL DEBUG] [SERVER] Received CALL_REJECT from userId=${userId} callId=${callId} reason=${reason}`);
              if (session && session.calleeUserId === userId) {
                CallSignalingService.endCall(callId);
                console.log(`[CALL DEBUG] [SERVER] Forwarding CALL_REJECT to caller=${session.callerUserId}`);
                PresenceService.broadcastToUsers([session.callerUserId], {
                  type: 'CALL_REJECT',
                  payload: {
                    callId: session.callId,
                    conversationId: session.conversationId,
                    callerUserId: session.callerUserId,
                    calleeUserId: session.calleeUserId,
                    reason: reason || 'Call declined',
                  },
                });
              }
              break;
            }

            case 'CALL_CANCEL': {
              const { callId } = data.payload || {};
              const session = callId ? CallSignalingService.getCall(callId) : undefined;
              console.log(`[CALL DEBUG] [SERVER] Received CALL_CANCEL from userId=${userId} callId=${callId}`);
              if (session && session.callerUserId === userId) {
                CallSignalingService.endCall(callId);
                console.log(`[CALL DEBUG] [SERVER] Forwarding CALL_CANCEL to callee=${session.calleeUserId}`);
                PresenceService.broadcastToUsers([session.calleeUserId], {
                  type: 'CALL_CANCEL',
                  payload: {
                    callId: session.callId,
                    conversationId: session.conversationId,
                    callerUserId: session.callerUserId,
                    calleeUserId: session.calleeUserId,
                  },
                });
              }
              break;
            }

            case 'CALL_OFFER': {
              const { callId, sdp } = data.payload || {};
              const session = callId ? CallSignalingService.getCall(callId) : undefined;
              console.log(`[CALL DEBUG] [SERVER] Received CALL_OFFER from userId=${userId} callId=${callId} sessionFound=${Boolean(session)} hasSdp=${Boolean(sdp)}`);
              if (session && (session.callerUserId === userId || session.calleeUserId === userId)) {
                CallSignalingService.setOfferSdp(callId, sdp);
                const targetUserId = session.callerUserId === userId ? session.calleeUserId : session.callerUserId;
                console.log(`[CALL DEBUG] [SERVER] Forwarding CALL_OFFER to targetUserId=${targetUserId}`);
                PresenceService.broadcastToUsers([targetUserId], {
                  type: 'CALL_OFFER',
                  payload: {
                    callId: session.callId,
                    conversationId: session.conversationId,
                    callerUserId: session.callerUserId,
                    calleeUserId: session.calleeUserId,
                    sdp,
                  },
                });
              }
              break;
            }

            case 'CALL_ANSWER': {
              const { callId, sdp } = data.payload || {};
              const session = callId ? CallSignalingService.getCall(callId) : undefined;
              console.log(`[CALL DEBUG] [SERVER] Received CALL_ANSWER from userId=${userId} callId=${callId} sessionFound=${Boolean(session)} hasSdp=${Boolean(sdp)}`);
              if (session && (session.callerUserId === userId || session.calleeUserId === userId)) {
                CallSignalingService.updateCallState(callId, 'CONNECTED', sdp);
                const targetUserId = session.callerUserId === userId ? session.calleeUserId : session.callerUserId;
                console.log(`[CALL DEBUG] [SERVER] Forwarding CALL_ANSWER to targetUserId=${targetUserId}`);
                PresenceService.broadcastToUsers([targetUserId], {
                  type: 'CALL_ANSWER',
                  payload: {
                    callId: session.callId,
                    conversationId: session.conversationId,
                    callerUserId: session.callerUserId,
                    calleeUserId: session.calleeUserId,
                    sdp,
                  },
                });
              }
              break;
            }

            case 'CALL_ICE_CANDIDATE': {
              const { callId, candidate } = data.payload || {};
              const session = callId ? CallSignalingService.getCall(callId) : undefined;
              if (session && (session.callerUserId === userId || session.calleeUserId === userId)) {
                const targetUserId = session.callerUserId === userId ? session.calleeUserId : session.callerUserId;
                PresenceService.broadcastToUsers([targetUserId], {
                  type: 'CALL_ICE_CANDIDATE',
                  payload: {
                    callId: session.callId,
                    conversationId: session.conversationId,
                    candidate,
                  },
                });
              }
              break;
            }

            case 'CALL_END': {
              const { callId } = data.payload || {};
              const session = callId ? CallSignalingService.getCall(callId) : undefined;
              console.log(`[CALL DEBUG] [SERVER] Received CALL_END from userId=${userId} callId=${callId}`);
              if (session && (session.callerUserId === userId || session.calleeUserId === userId)) {
                const targetUserId = session.callerUserId === userId ? session.calleeUserId : session.callerUserId;
                CallSignalingService.endCall(callId);
                console.log(`[CALL DEBUG] [SERVER] Forwarding CALL_END to targetUserId=${targetUserId}`);
                PresenceService.broadcastToUsers([targetUserId], {
                  type: 'CALL_END',
                  payload: {
                    callId: session.callId,
                    conversationId: session.conversationId,
                    endedByUserId: userId,
                  },
                });
              }
              break;
            }

            case 'CALL_FAILED': {
              const { callId, reason } = data.payload || {};
              const session = callId ? CallSignalingService.getCall(callId) : undefined;
              console.log(`[CALL DEBUG] [SERVER] Received CALL_FAILED from userId=${userId} callId=${callId} reason=${reason}`);
              if (session && (session.callerUserId === userId || session.calleeUserId === userId)) {
                CallSignalingService.endCall(callId);
                const targetUserId = session.callerUserId === userId ? session.calleeUserId : session.callerUserId;
                console.log(`[CALL DEBUG] [SERVER] Forwarding CALL_FAILED to targetUserId=${targetUserId}`);
                PresenceService.broadcastToUsers([targetUserId], {
                  type: 'CALL_FAILED',
                  payload: {
                    callId: session.callId,
                    conversationId: session.conversationId,
                    reason: reason || 'Call failed',
                  },
                });
              }
              break;
            }

            // ==========================================
            // Phase 2B — Group Meetings Signaling & Mesh WebRTC
            // ==========================================
            case 'MEETING_START': {
              const { conversationId, title } = data.payload || {};
              console.log(`[MEETING WS] Received MEETING_START for convId=${conversationId} from userId=${userId}`);

              if (!conversationId) {
                socket.send(JSON.stringify({ type: 'MEETING_FAILED', payload: { reason: 'conversationId is required' } }));
                break;
              }

              try {
                // 1. Authorize conversation and ensure GROUP conversation
                const conv = await ChatService.getConversationById(userId, conversationId);
                if (conv.type !== 'GROUP') {
                  socket.send(JSON.stringify({
                    type: 'MEETING_FAILED',
                    payload: { conversationId, reason: 'Meetings can only be started in group conversations. Use direct calling for 1:1 chats.' },
                  }));
                  break;
                }

                // 2. Resolve host identity accurately
                const hostIdentity = await MeetingSignalingService.resolveUserIdentity(userId);
                const hostName = hostIdentity.displayName;
                const hostAvatar = hostIdentity.avatarUrl;

                const meetingTitle = title || conv.title || 'Group Meeting';
                const meetingId = crypto.randomUUID();

                // 3. Start or retrieve active meeting
                const { session, isNew } = await MeetingSignalingService.startMeeting(
                  meetingId,
                  conversationId,
                  userId,
                  hostName,
                  hostAvatar,
                  meetingTitle
                );

                const publicState = MeetingSignalingService.toPublicState(session);

                // 4. Send MEETING_STARTED to host
                socket.send(JSON.stringify({
                  type: 'MEETING_STARTED',
                  payload: {
                    meeting: publicState,
                  },
                }));

                // 5. If new meeting, notify other group members via WebSocket and In-App Notifications
                if (isNew) {
                  const otherMemberIds = conv.members?.map((m) => m.userId).filter((id) => id !== userId) || [];
                  
                  // Real-time WebSocket announcement to other members
                  PresenceService.broadcastToUsers(otherMemberIds, {
                    type: 'MEETING_STARTED',
                    payload: {
                      meeting: publicState,
                    },
                  });

                  // Persistent in-app notification to group members
                  for (const mId of otherMemberIds) {
                    NotificationService.createNotification({
                      userId: mId,
                      type: 'SYSTEM',
                      title: `${conv.title || 'Group'} meeting started`,
                      message: `${hostName} started a meeting in ${conv.title || 'the group'}.`,
                      actionUrl: `/chat?id=${conversationId}&meetingId=${session.meetingId}`,
                      metadata: {
                        meetingId: session.meetingId,
                        conversationId,
                        hostUserId: userId,
                        hostName,
                      },
                    }).catch(() => {});
                  }
                }
              } catch (err: any) {
                console.error('[Meeting WS] MEETING_START error:', err);
                socket.send(JSON.stringify({
                  type: 'MEETING_FAILED',
                  payload: { conversationId, reason: err?.message || 'Failed to start meeting' },
                }));
              }
              break;
            }

            case 'MEETING_JOIN': {
              const { meetingId, conversationId, isMuted, isCameraOff } = data.payload || {};
              console.log(`[MEETING WS] Received MEETING_JOIN for meetingId=${meetingId} from userId=${userId}`);

              if (!meetingId) {
                socket.send(JSON.stringify({ type: 'MEETING_FAILED', payload: { reason: 'meetingId is required' } }));
                break;
              }

              const session = MeetingSignalingService.getMeeting(meetingId);
              if (!session || session.status !== 'ACTIVE') {
                socket.send(JSON.stringify({
                  type: 'MEETING_FAILED',
                  payload: { meetingId, reason: 'Meeting is no longer active or has ended' },
                }));
                break;
              }

              try {
                // Verify user is a member of the meeting conversation
                await ChatService.getConversationById(userId, session.conversationId);

                // Resolve user display name & avatar
                const userIdent = await MeetingSignalingService.resolveUserIdentity(userId);
                const userName = userIdent.displayName;
                const userAvatar = userIdent.avatarUrl;

                const result = await MeetingSignalingService.joinMeeting(
                  meetingId,
                  userId,
                  userName,
                  userAvatar,
                  Boolean(isMuted),
                  Boolean(isCameraOff)
                );

                if (!result) {
                  socket.send(JSON.stringify({
                    type: 'MEETING_FAILED',
                    payload: { meetingId, reason: 'Failed to join meeting' },
                  }));
                  break;
                }

                const publicState = MeetingSignalingService.toPublicState(result.session);

                // Send MEETING_JOINED with full meeting state to joining user
                socket.send(JSON.stringify({
                  type: 'MEETING_JOINED',
                  payload: {
                    meeting: publicState,
                    participant: result.participant,
                  },
                }));

                // Broadcast participant joined to other active participants in meeting
                const otherParticipantIds = Array.from(result.session.participants.keys()).filter((id) => id !== userId);
                PresenceService.broadcastToUsers(otherParticipantIds, {
                  type: 'MEETING_PARTICIPANT_JOINED',
                  payload: {
                    meetingId,
                    conversationId: session.conversationId,
                    participant: result.participant,
                  },
                });
              } catch (err: any) {
                console.error('[Meeting WS] MEETING_JOIN error:', err);
                socket.send(JSON.stringify({
                  type: 'MEETING_FAILED',
                  payload: { meetingId, reason: err?.message || 'Access denied' },
                }));
              }
              break;
            }

            // ==========================================
            // Group Meeting WebRTC Mesh Peer Signaling
            // ==========================================
            case 'MEETING_PEER_OFFER': {
              const { meetingId, targetUserId, sdp } = data.payload || {};
              console.log(`[MEETING MESH] Routing offer from userId=${userId} to targetUserId=${targetUserId} meetingId=${meetingId}`);
              if (meetingId && targetUserId && sdp) {
                PresenceService.broadcastToUsers([targetUserId], {
                  type: 'MEETING_PEER_OFFER',
                  payload: {
                    meetingId,
                    fromUserId: userId,
                    sdp,
                  },
                });
              }
              break;
            }

            case 'MEETING_PEER_ANSWER': {
              const { meetingId, targetUserId, sdp } = data.payload || {};
              console.log(`[MEETING MESH] Routing answer from userId=${userId} to targetUserId=${targetUserId} meetingId=${meetingId}`);
              if (meetingId && targetUserId && sdp) {
                PresenceService.broadcastToUsers([targetUserId], {
                  type: 'MEETING_PEER_ANSWER',
                  payload: {
                    meetingId,
                    fromUserId: userId,
                    sdp,
                  },
                });
              }
              break;
            }

            case 'MEETING_PEER_ICE_CANDIDATE': {
              const { meetingId, targetUserId, candidate } = data.payload || {};
              if (meetingId && targetUserId && candidate) {
                PresenceService.broadcastToUsers([targetUserId], {
                  type: 'MEETING_PEER_ICE_CANDIDATE',
                  payload: {
                    meetingId,
                    fromUserId: userId,
                    candidate,
                  },
                });
              }
              break;
            }

            case 'MEETING_LEAVE': {
              const { meetingId } = data.payload || {};
              console.log(`[MEETING WS] Received MEETING_LEAVE for meetingId=${meetingId} from userId=${userId}`);

              if (meetingId) {
                const session = MeetingSignalingService.getMeeting(meetingId);
                const convId = session?.conversationId;
                const result = await MeetingSignalingService.leaveMeeting(meetingId, userId);

                socket.send(JSON.stringify({
                  type: 'MEETING_LEFT',
                  payload: { meetingId, conversationId: convId },
                }));

                if (result && result.session.status === 'ACTIVE') {
                  const remainingIds = Array.from(result.session.participants.keys()).filter((id) => id !== userId);
                  PresenceService.broadcastToUsers(remainingIds, {
                    type: 'MEETING_PARTICIPANT_LEFT',
                    payload: {
                      meetingId,
                      conversationId: result.session.conversationId,
                      userId,
                    },
                  });
                }
              }
              break;
            }

            case 'MEETING_PARTICIPANT_UPDATE': {
              const { meetingId, isMuted, isCameraOff } = data.payload || {};
              if (meetingId) {
                const result = MeetingSignalingService.updateParticipantMedia(meetingId, userId, {
                  isMuted,
                  isCameraOff,
                });
                if (result) {
                  const participantIds = Array.from(result.session.participants.keys());
                  PresenceService.broadcastToUsers(participantIds, {
                    type: 'MEETING_PARTICIPANT_UPDATED',
                    payload: {
                      meetingId,
                      conversationId: result.session.conversationId,
                      participant: result.participant,
                    },
                  });
                }
              }
              break;
            }

            case 'MEETING_END': {
              const { meetingId } = data.payload || {};
              console.log(`[MEETING WS] Received MEETING_END for meetingId=${meetingId} from userId=${userId}`);

              if (meetingId) {
                const session = MeetingSignalingService.getMeeting(meetingId);
                if (!session) break;

                // Only host or Super Admin can end the meeting for everyone
                let isHostOrAdmin = session.hostUserId === userId;
                if (!isHostOrAdmin) {
                  try {
                    const u = await (prisma as any).user.findUnique({ where: { id: userId } });
                    if (u && (u.role === 'SUPER_ADMIN' || u.role === 'ADMIN')) {
                      isHostOrAdmin = true;
                    }
                  } catch {}
                }

                if (!isHostOrAdmin) {
                  socket.send(JSON.stringify({
                    type: 'MEETING_FAILED',
                    payload: { meetingId, reason: 'Only the meeting host can end the meeting for all participants' },
                  }));
                  break;
                }

                const allParticipantIds = Array.from(session.participants.keys());
                await MeetingSignalingService.endMeeting(meetingId, userId);

                // Broadcast MEETING_ENDED to all participants and group members
                PresenceService.broadcastToUsers(allParticipantIds, {
                  type: 'MEETING_ENDED',
                  payload: {
                    meetingId,
                    conversationId: session.conversationId,
                    endedByUserId: userId,
                  },
                });
              }
              break;
            }

            case 'HOST_MUTE_PARTICIPANT': {
              const { meetingId, targetUserId } = data.payload || {};
              console.log(`[HOST CONTROL WS] Host ${userId} requested mute on targetUserId=${targetUserId} in meetingId=${meetingId}`);

              if (!meetingId || !targetUserId) {
                socket.send(JSON.stringify({
                  type: 'MEETING_FAILED',
                  payload: { reason: 'meetingId and targetUserId are required' },
                }));
                break;
              }

              const result = MeetingSignalingService.hostMuteParticipant(meetingId, userId, targetUserId);
              if (!result.success || !result.session || !result.targetParticipant) {
                socket.send(JSON.stringify({
                  type: 'MEETING_FAILED',
                  payload: { meetingId, reason: result.reason || 'Failed to mute participant' },
                }));
                break;
              }

              // 1. Notify target participant explicitly with HOST_MUTED_YOU
              PresenceService.broadcastToUsers([targetUserId], {
                type: 'HOST_MUTED_YOU',
                payload: {
                  meetingId,
                  mutedByUserId: userId,
                  message: 'You were muted by the host.',
                },
              });

              // 2. Broadcast updated participant state to all participants
              const allParticipantIds = Array.from(result.session.participants.keys());
              PresenceService.broadcastToUsers(allParticipantIds, {
                type: 'MEETING_PARTICIPANT_UPDATED',
                payload: {
                  meetingId,
                  conversationId: result.session.conversationId,
                  participant: result.targetParticipant,
                },
              });
              break;
            }

            case 'HOST_REMOVE_PARTICIPANT': {
              const { meetingId, targetUserId, reason } = data.payload || {};
              console.log(`[HOST CONTROL WS] Host ${userId} requested remove on targetUserId=${targetUserId} in meetingId=${meetingId}`);

              if (!meetingId || !targetUserId) {
                socket.send(JSON.stringify({
                  type: 'MEETING_FAILED',
                  payload: { reason: 'meetingId and targetUserId are required' },
                }));
                break;
              }

              const result = await MeetingSignalingService.hostRemoveParticipant(meetingId, userId, targetUserId, reason);
              if (!result.success || !result.session || !result.targetParticipant) {
                socket.send(JSON.stringify({
                  type: 'MEETING_FAILED',
                  payload: { meetingId, reason: result.reason || 'Failed to remove participant' },
                }));
                break;
              }

              // 1. Notify removed user directly
              PresenceService.broadcastToUsers([targetUserId], {
                type: 'HOST_REMOVED_YOU',
                payload: {
                  meetingId,
                  removedByUserId: userId,
                  reason: reason || 'You were removed from the meeting by the host.',
                },
              });

              // 2. Broadcast left/removed event to all other participants
              const remainingIds = Array.from(result.session.participants.keys()).filter((id) => id !== targetUserId);
              PresenceService.broadcastToUsers(remainingIds, {
                type: 'MEETING_PARTICIPANT_LEFT',
                payload: {
                  meetingId,
                  conversationId: result.session.conversationId,
                  userId: targetUserId,
                  reason: 'REMOVED_BY_HOST',
                },
              });
              break;
            }

            case 'MEETING_SYNC': {
              const { meetingId, conversationId } = data.payload || {};
              let session: any;
              if (meetingId) {
                session = MeetingSignalingService.getMeeting(meetingId);
              } else if (conversationId) {
                session = MeetingSignalingService.getActiveMeetingForConversation(conversationId);
              }

              if (session && session.status === 'ACTIVE') {
                socket.send(JSON.stringify({
                  type: 'MEETING_STATE',
                  payload: {
                    meeting: MeetingSignalingService.toPublicState(session),
                  },
                }));
              } else {
                socket.send(JSON.stringify({
                  type: 'MEETING_STATE',
                  payload: {
                    meeting: null,
                    meetingId,
                    conversationId,
                  },
                }));
              }
              break;
            }

            // ==========================================
            // Phase 2C — Screen Sharing Signaling
            // ==========================================
            case 'SCREEN_SHARE_START':
            case 'CALL_SCREEN_SHARE_START': {
              const { callId, meetingId, conversationId } = data.payload || {};
              console.log(`[SCREEN SHARE WS] START requested by userId=${userId} (callId=${callId}, meetingId=${meetingId})`);

              // 1. If 1:1 call screen share
              if (callId) {
                const callSession = CallSignalingService.getCall(callId);
                if (!callSession || (callSession.callerUserId !== userId && callSession.calleeUserId !== userId)) {
                  socket.send(JSON.stringify({
                    type: 'SCREEN_SHARE_FAILED',
                    payload: { callId, reason: 'Call session not found or access denied' },
                  }));
                  break;
                }

                const result = CallSignalingService.startScreenShare(callId, userId);
                if (!result.success) {
                  socket.send(JSON.stringify({
                    type: 'SCREEN_SHARE_FAILED',
                    payload: { callId, reason: result.reason || 'Screen sharing failed' },
                  }));
                  break;
                }

                // Broadcast to both participants
                const participantIds = [callSession.callerUserId, callSession.calleeUserId];
                PresenceService.broadcastToUsers(participantIds, {
                  type: 'SCREEN_SHARE_STARTED',
                  payload: {
                    callId,
                    conversationId: callSession.conversationId,
                    sharerUserId: userId,
                  },
                });
                break;
              }

              // 2. If Group Meeting screen share
              if (meetingId) {
                const meetingSession = MeetingSignalingService.getMeeting(meetingId);
                if (!meetingSession || meetingSession.status !== 'ACTIVE') {
                  socket.send(JSON.stringify({
                    type: 'SCREEN_SHARE_FAILED',
                    payload: { meetingId, reason: 'Meeting is not active' },
                  }));
                  break;
                }

                // Resolve sharer display name
                let sharerName = '';
                const part = meetingSession.participants.get(userId);
                if (part) {
                  sharerName = part.displayName;
                } else {
                  try {
                    const u = await (prisma as any).user.findUnique({
                      where: { id: userId },
                      include: { employee: true },
                    });
                    const emp = u?.employee;
                    sharerName = emp?.firstName || emp?.lastName
                      ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim()
                      : u?.displayName || (u?.role === 'SUPER_ADMIN' ? 'Super Admin' : u?.email?.split('@')[0]) || 'Participant';
                  } catch {}
                }

                const result = MeetingSignalingService.startScreenShare(meetingId, userId, sharerName || 'Participant');
                if (!result.success) {
                  socket.send(JSON.stringify({
                    type: 'SCREEN_SHARE_FAILED',
                    payload: { meetingId, reason: result.reason || 'Screen sharing failed' },
                  }));
                  break;
                }

                const publicState = MeetingSignalingService.toPublicState(meetingSession);
                const participantIds = Array.from(meetingSession.participants.keys());
                PresenceService.broadcastToUsers(participantIds, {
                  type: 'SCREEN_SHARE_STARTED',
                  payload: {
                    meetingId,
                    conversationId: meetingSession.conversationId,
                    screenShare: result.screenShare,
                    meeting: publicState,
                  },
                });
                break;
              }

              socket.send(JSON.stringify({
                type: 'SCREEN_SHARE_FAILED',
                payload: { reason: 'Either callId or meetingId is required' },
              }));
              break;
            }

            case 'SCREEN_SHARE_STOP':
            case 'CALL_SCREEN_SHARE_STOP': {
              const { callId, meetingId, conversationId } = data.payload || {};
              console.log(`[SCREEN SHARE WS] STOP requested by userId=${userId} (callId=${callId}, meetingId=${meetingId})`);

              // 1. 1:1 Call
              if (callId) {
                const callSession = CallSignalingService.getCall(callId);
                if (callSession) {
                  CallSignalingService.stopScreenShare(callId, userId);
                  const participantIds = [callSession.callerUserId, callSession.calleeUserId];
                  PresenceService.broadcastToUsers(participantIds, {
                    type: 'SCREEN_SHARE_STOPPED',
                    payload: {
                      callId,
                      conversationId: callSession.conversationId,
                      sharerUserId: userId,
                    },
                  });
                }
                break;
              }

              // 2. Group Meeting
              if (meetingId) {
                const meetingSession = MeetingSignalingService.getMeeting(meetingId);
                if (meetingSession) {
                  MeetingSignalingService.stopScreenShare(meetingId, userId);
                  const publicState = MeetingSignalingService.toPublicState(meetingSession);
                  const participantIds = Array.from(meetingSession.participants.keys());
                  PresenceService.broadcastToUsers(participantIds, {
                    type: 'SCREEN_SHARE_STOPPED',
                    payload: {
                      meetingId,
                      conversationId: meetingSession.conversationId,
                      sharerUserId: userId,
                      meeting: publicState,
                    },
                  });
                }
                break;
              }
              break;
            }

            default:
              break;
          }
        } catch (err) {
          console.error('[CollaborationWS] Message error:', err);
        }
      });

      // 5. Handle disconnection
      socket.on('close', () => {
        PresenceService.unregisterConnection(userId, connId);
        if (!PresenceService.isUserOnline(userId)) {
          CallSignalingService.handleUserDisconnect(userId);
          MeetingSignalingService.handleUserDisconnect(userId);
        }
      });

      socket.on('error', (err: any) => {
        console.error(`[CollaborationWS] Socket error for user ${userId}:`, err);
        PresenceService.unregisterConnection(userId, connId);
        if (!PresenceService.isUserOnline(userId)) {
          CallSignalingService.handleUserDisconnect(userId);
          MeetingSignalingService.handleUserDisconnect(userId);
        }
      });
    }
  );
}


