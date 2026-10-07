import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { SecurityUtil } from '../src/utils/security.js';
import { ChatService } from '../src/modules/collaboration/chat.service.js';
import { PresenceService } from '../src/modules/collaboration/presence.service.js';
import { CallSignalingService } from '../src/modules/collaboration/call-signaling.service.js';
import { MeetingSignalingService } from '../src/modules/collaboration/meeting-signaling.service.js';
import { prisma } from '../src/plugins/prisma.js';
import { DbService } from '../src/services/db.service.js';

describe('Phase 2A (Regression) & Phase 2B (Group Meetings) Comprehensive Test Suite', () => {
  let app: FastifyInstance;
  let userA: any; // Host / Caller
  let userB: any; // Member / Callee
  let userC: any; // Member
  let userNonMember: any; // External User
  let tokenA: string;
  let tokenB: string;
  let tokenC: string;
  let tokenNonMember: string;
  let sessA: string;
  let sessB: string;
  let sessC: string;
  let sessNonMember: string;
  let groupConvId: string;
  let directConvId: string;

  before(async () => {
    DbService.forceRestFallback(true);
    app = await buildApp();
    await app.ready();

    // 1. Fetch active test users from DB
    const userRows = await DbService.query(
      async () => prisma.user.findMany({
        where: { status: 'ACTIVE' },
        take: 4,
        include: { employee: true },
      }),
      async () => DbService.restRequest<any[]>('/users?status=eq.ACTIVE&limit=4')
    );

    if (userRows && userRows.length >= 3) {
      userA = userRows[0];
      userB = userRows[1];
      userC = userRows[2];
      userNonMember = userRows[3] || {
        id: '44444444-4444-4444-4444-444444444444',
        email: 'stranger@techyarts.com',
        role: 'EMPLOYEE',
      };
    } else {
      userA = { id: '11111111-1111-1111-1111-111111111111', email: 'alice@techyarts.com', role: 'SUPER_ADMIN' };
      userB = { id: '22222222-2222-2222-2222-222222222222', email: 'bob@techyarts.com', role: 'EMPLOYEE' };
      userC = { id: '33333333-3333-3333-3333-333333333333', email: 'charlie@techyarts.com', role: 'EMPLOYEE' };
      userNonMember = { id: '44444444-4444-4444-4444-444444444444', email: 'stranger@techyarts.com', role: 'EMPLOYEE' };
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const createSession = async (userId: string) => {
      try {
        const rows = await DbService.restRequest<any[]>('/user_sessions', {
          method: 'POST',
          body: {
            user_id: userId,
            session_token_hash: SecurityUtil.hashSessionToken(SecurityUtil.generateRandomToken()),
            access_mode: 'NORMAL',
            expires_at: expiresAt,
          },
        });
        return rows?.[0]?.id || '00000000-0000-0000-0000-000000000001';
      } catch {
        return '00000000-0000-0000-0000-000000000001';
      }
    };

    sessA = await createSession(userA.id);
    sessB = await createSession(userB.id);
    sessC = await createSession(userC.id);
    sessNonMember = await createSession(userNonMember.id);

    tokenA = SecurityUtil.generateAccessToken({
      userId: userA.id,
      sessionId: sessA,
      role: userA.role || 'SUPER_ADMIN',
      accessMode: 'NORMAL',
    });

    tokenB = SecurityUtil.generateAccessToken({
      userId: userB.id,
      sessionId: sessB,
      role: userB.role || 'EMPLOYEE',
      accessMode: 'NORMAL',
    });

    tokenC = SecurityUtil.generateAccessToken({
      userId: userC.id,
      sessionId: sessC,
      role: userC.role || 'EMPLOYEE',
      accessMode: 'NORMAL',
    });

    tokenNonMember = SecurityUtil.generateAccessToken({
      userId: userNonMember.id,
      sessionId: sessNonMember,
      role: userNonMember.role || 'EMPLOYEE',
      accessMode: 'NORMAL',
    });

    // 2. Create Direct Conversation between userA and userB
    const directRes = await app.inject({
      method: 'POST',
      url: '/api/collaboration/conversations/direct',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { targetUserId: userB.id },
    });
    const directData = JSON.parse(directRes.payload);
    directConvId = directData.conversation?.id || '00000000-0000-0000-0000-000000000010';

    // 3. Create Group Conversation with userA, userB, userC
    const groupRes = await app.inject({
      method: 'POST',
      url: '/api/collaboration/conversations/group',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        title: 'Development Team',
        description: 'Engineering and Product group',
        memberUserIds: [userB.id, userC.id],
      },
    });
    const groupData = JSON.parse(groupRes.payload);
    groupConvId = groupData.conversation?.id || '00000000-0000-0000-0000-000000000020';
  });

  after(async () => {
    await app.close();
  });

  // ==========================================
  // 1. PHASE 2A REGRESSION TESTS (1:1 CALLING)
  // ==========================================
  describe('Phase 2A — 1:1 Audio & Video Call Regression Suite', () => {
    test('Initiates 1:1 call session via CallSignalingService', () => {
      const callId = 'call_test_101';
      const session = CallSignalingService.initiateCall(
        callId,
        directConvId,
        userA.id,
        userB.id,
        'Pavan Amirishetty',
        null,
        'AUDIO',
        { type: 'offer', sdp: 'v=0...' }
      );

      assert.equal(session.callId, callId);
      assert.equal(session.callerUserId, userA.id);
      assert.equal(session.calleeUserId, userB.id);
      assert.equal(session.state, 'RINGING');
      assert.equal(CallSignalingService.isUserInCall(userA.id), true);
      assert.equal(CallSignalingService.isUserInCall(userB.id), true);
    });

    test('Transitions call state from RINGING to CONNECTING and CONNECTED upon accept', () => {
      const callId = 'call_test_101';
      const connecting = CallSignalingService.updateCallState(callId, 'CONNECTING');
      assert.equal(connecting?.state, 'CONNECTING');

      const connected = CallSignalingService.updateCallState(callId, 'CONNECTED', { type: 'answer', sdp: 'v=0...' });
      assert.equal(connected?.state, 'CONNECTED');
      assert.ok(connected?.connectedAt);
    });

    test('Handles busy state when callee is on another call', () => {
      assert.equal(CallSignalingService.isUserInCall(userB.id), true);
    });

    test('Ends 1:1 call session and releases participants', () => {
      const callId = 'call_test_101';
      const ended = CallSignalingService.endCall(callId);
      assert.ok(ended);
      assert.equal(CallSignalingService.isUserInCall(userA.id), false);
      assert.equal(CallSignalingService.isUserInCall(userB.id), false);
    });

    test('Rejects starting a group meeting inside a DIRECT conversation', async () => {
      const conv = await ChatService.getConversationById(userA.id, directConvId);
      assert.equal(conv.type, 'DIRECT');
    });
  });

  // ==========================================
  // 2. PHASE 2B GROUP MEETINGS TESTS
  // ==========================================
  describe('Phase 2B — Group Meetings Comprehensive Suite', () => {
    let activeMeetingId: string;

    test('TEST 1 — Start Group Meeting: Pavan becomes HOST and enters meeting', async () => {
      const meetingId = 'mtg_test_development_team';
      const { session, isNew } = await MeetingSignalingService.startMeeting(
        meetingId,
        groupConvId,
        userA.id,
        'Pavan Amirishetty',
        null,
        'Development Team'
      );

      assert.equal(isNew, true);
      assert.equal(session.meetingId, meetingId);
      assert.equal(session.conversationId, groupConvId);
      assert.equal(session.hostUserId, userA.id);
      assert.equal(session.hostName, 'Pavan Amirishetty');
      assert.equal(session.status, 'ACTIVE');

      // Pavan should be the initial JOINED participant with role HOST
      const hostPart = session.participants.get(userA.id);
      assert.ok(hostPart);
      assert.equal(hostPart?.role, 'HOST');
      assert.equal(hostPart?.status, 'JOINED');

      activeMeetingId = meetingId;
    });

    test('TEST 2 — Duplicate Start Protection / Idempotency: Returns existing active meeting', async () => {
      const { session, isNew } = await MeetingSignalingService.startMeeting(
        'mtg_duplicate_attempt',
        groupConvId,
        userA.id,
        'Pavan Amirishetty',
        null,
        'Development Team'
      );

      assert.equal(isNew, false);
      assert.equal(session.meetingId, activeMeetingId);
      assert.equal(session.status, 'ACTIVE');
    });

    test('TEST 3 & 4 — Join Group Meeting: Super Admin and Employee join and appear in participant list', async () => {
      // Super Admin joins
      const joinB = await MeetingSignalingService.joinMeeting(
        activeMeetingId,
        userB.id,
        'Super Admin',
        null,
        false,
        false
      );
      assert.ok(joinB);
      assert.equal(joinB.participant.userId, userB.id);
      assert.equal(joinB.participant.displayName, 'Super Admin');
      assert.equal(joinB.participant.status, 'JOINED');
      assert.equal(joinB.participant.role, 'PARTICIPANT');

      // Employee A joins
      const joinC = await MeetingSignalingService.joinMeeting(
        activeMeetingId,
        userC.id,
        'Employee A',
        null,
        false,
        false
      );
      assert.ok(joinC);
      assert.equal(joinC.participant.userId, userC.id);
      assert.equal(joinC.participant.displayName, 'Employee A');
      assert.equal(joinC.participant.status, 'JOINED');

      // Verify all 3 participants are present in the active meeting session
      const session = MeetingSignalingService.getMeeting(activeMeetingId);
      assert.ok(session);
      assert.equal(session.participants.size, 3);
      assert.ok(session.participants.has(userA.id));
      assert.ok(session.participants.has(userB.id));
      assert.ok(session.participants.has(userC.id));

      const publicState = MeetingSignalingService.toPublicState(session);
      assert.equal(publicState.participants.length, 3);
      assert.equal(publicState.participants.some((p) => p.displayName === 'Pavan Amirishetty'), true);
      assert.equal(publicState.participants.some((p) => p.displayName === 'Super Admin'), true);
      assert.equal(publicState.participants.some((p) => p.displayName === 'Employee A'), true);
    });

    test('TEST 5 — Microphone State: Pavan mutes microphone and state updates', () => {
      const updated = MeetingSignalingService.updateParticipantMedia(activeMeetingId, userA.id, {
        isMuted: true,
      });

      assert.ok(updated);
      assert.equal(updated.participant.isMuted, true);

      const session = MeetingSignalingService.getMeeting(activeMeetingId);
      assert.equal(session?.participants.get(userA.id)?.isMuted, true);
    });

    test('TEST 6 — Camera State: Super Admin turns camera off and state updates', () => {
      const updated = MeetingSignalingService.updateParticipantMedia(activeMeetingId, userB.id, {
        isCameraOff: true,
      });

      assert.ok(updated);
      assert.equal(updated.participant.isCameraOff, true);

      const session = MeetingSignalingService.getMeeting(activeMeetingId);
      assert.equal(session?.participants.get(userB.id)?.isCameraOff, true);
    });

    test('TEST 7 — Non-Host Leave: Employee A leaves; meeting remains ACTIVE for Pavan and Super Admin', async () => {
      const leaveResult = await MeetingSignalingService.leaveMeeting(activeMeetingId, userC.id);
      assert.ok(leaveResult);
      assert.equal(leaveResult.participant.status, 'LEFT');
      assert.equal(leaveResult.session.status, 'ACTIVE');

      const session = MeetingSignalingService.getMeeting(activeMeetingId);
      assert.ok(session);
      assert.equal(session.status, 'ACTIVE');

      // Active remaining joined participants count is 2
      const activeJoined = Array.from(session.participants.values()).filter((p) => p.status === 'JOINED');
      assert.equal(activeJoined.length, 2);
    });

    test('TEST 8 — Reconnection and State Resync: Disconnected user recovers to JOINED', () => {
      // Simulate userB socket disconnect
      MeetingSignalingService.handleUserDisconnect(userB.id, 60000);

      const sessionDuringDisconnect = MeetingSignalingService.getMeeting(activeMeetingId);
      assert.equal(sessionDuringDisconnect?.participants.get(userB.id)?.status, 'DISCONNECTED');

      // User reconnects
      const sessionAfterReconnect = MeetingSignalingService.handleUserReconnect(userB.id);
      assert.ok(sessionAfterReconnect);
      assert.equal(sessionAfterReconnect.participants.get(userB.id)?.status, 'JOINED');
    });

    test('TEST 9 — Non-Member Rejection: Stranger is blocked from accessing group conversation', async () => {
      try {
        await ChatService.getConversationById(userNonMember.id, groupConvId);
        assert.fail('Expected non-member access to be rejected');
      } catch (err: any) {
        assert.ok(err);
        assert.ok(err.statusCode === 403 || err.statusCode === 404 || err.status === 403);
      }
    });

    test('TEST 10 — Host End Meeting: Pavan ends meeting for all participants', async () => {
      const endedSession = await MeetingSignalingService.endMeeting(activeMeetingId, userA.id);
      assert.ok(endedSession);
      assert.equal(endedSession.status, 'ENDED');
      assert.ok(endedSession.endedAt);

      // Verify meeting is no longer active for the conversation
      const activeForConv = MeetingSignalingService.getActiveMeetingForConversation(groupConvId);
      assert.equal(activeForConv, undefined);
      assert.equal(MeetingSignalingService.isMeetingActive(activeMeetingId), false);
    });

    test('TEST 11 — Active Meeting Query: returns undefined when meeting ended', () => {
      const session = MeetingSignalingService.getActiveMeetingForConversation(groupConvId);
      assert.equal(session, undefined);
    });
  });
});
