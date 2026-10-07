import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { SecurityUtil } from '../src/utils/security.js';
import { ChatService } from '../src/modules/collaboration/chat.service.js';
import { CallSignalingService } from '../src/modules/collaboration/call-signaling.service.js';
import { MeetingSignalingService } from '../src/modules/collaboration/meeting-signaling.service.js';
import { prisma } from '../src/plugins/prisma.js';
import { DbService } from '../src/services/db.service.js';

describe('Phase 2C — Screen Sharing Test Suite', () => {
  let app: FastifyInstance;
  let userA: any; // Pavan / Host / Caller
  let userB: any; // Super Admin / Callee / Participant
  let userC: any; // Employee / Participant
  let userNonMember: any;
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

    // Setup direct and group conversations
    const directConv = await ChatService.getOrCreateDirectConversation(userA.id, userB.id);
    directConvId = directConv.id;

    const groupConv = await ChatService.createGroupConversation(
      userA.id,
      'Engineering Screen Share Group',
      'Phase 2C test',
      [userB.id, userC.id]
    );
    groupConvId = groupConv.id;
  });

  describe('1:1 Call Screen Sharing', () => {
    const callId = 'call_screen_share_test_101';

    test('TEST 1 — Start 1:1 Call and accept', () => {
      const call = CallSignalingService.initiateCall(
        callId,
        directConvId,
        userA.id,
        userB.id,
        'Pavan Amirishetty',
        null,
        'VIDEO',
        { type: 'offer', sdp: 'v=0...' }
      );
      assert.ok(call);
      assert.equal(call.state, 'RINGING');

      const connected = CallSignalingService.updateCallState(callId, 'CONNECTED', { type: 'answer', sdp: 'v=0...' });
      assert.ok(connected);
      assert.equal(connected.state, 'CONNECTED');
    });

    test('TEST 2 — Start screen share in 1:1 call', () => {
      const result = CallSignalingService.startScreenShare(callId, userA.id);
      assert.equal(result.success, true);
      assert.ok(result.session);
      assert.equal(result.session.activeScreenSharerUserId, userA.id);

      const session = CallSignalingService.getCall(callId);
      assert.equal(session?.activeScreenSharerUserId, userA.id);
    });

    test('TEST 3 — Stop screen share in 1:1 call preserves call connection', () => {
      const result = CallSignalingService.stopScreenShare(callId, userA.id);
      assert.equal(result.success, true);
      assert.ok(result.session);
      assert.equal(result.session.activeScreenSharerUserId, null);

      const session = CallSignalingService.getCall(callId);
      assert.equal(session?.state, 'CONNECTED');
      assert.equal(session?.activeScreenSharerUserId, null);
    });

    test('TEST 4 — End 1:1 call cleans up session', () => {
      const ended = CallSignalingService.endCall(callId);
      assert.ok(ended);
      assert.equal(CallSignalingService.isUserInCall(userA.id), false);
      assert.equal(CallSignalingService.isUserInCall(userB.id), false);
    });
  });

  describe('Group Meeting Screen Sharing', () => {
    const meetingId = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';

    test('TEST 5 — Start Group Meeting with 3 participants', async () => {
      const { session } = await MeetingSignalingService.startMeeting(
        meetingId,
        groupConvId,
        userA.id,
        'Pavan Amirishetty',
        null,
        'Engineering Standup & Demo'
      );
      assert.ok(session);
      assert.equal(session.status, 'ACTIVE');

      // Join userB and userC
      await MeetingSignalingService.joinMeeting(meetingId, userB.id, 'Super Admin', null);
      await MeetingSignalingService.joinMeeting(meetingId, userC.id, 'Employee A', null);

      const updated = MeetingSignalingService.getMeeting(meetingId);
      assert.equal(updated?.participants.size, 3);
    });

    test('TEST 6 — Pavan starts screen sharing in group meeting', () => {
      const result = MeetingSignalingService.startScreenShare(meetingId, userA.id, 'Pavan Amirishetty');
      assert.equal(result.success, true);
      assert.ok(result.session);
      assert.equal(result.session.activeScreenShare?.userId, userA.id);
      assert.equal(result.session.activeScreenShare?.displayName, 'Pavan Amirishetty');
      assert.ok(result.session.activeScreenShare?.startedAt);
    });

    test('TEST 7 — Single Active Sharer Enforcement: Super Admin attempt to share is rejected', () => {
      const result = MeetingSignalingService.startScreenShare(meetingId, userB.id, 'Super Admin');
      assert.equal(result.success, false);
      assert.equal(result.reason, 'Someone is already sharing their screen.');

      // Verify Pavan remains active sharer
      const session = MeetingSignalingService.getMeeting(meetingId);
      assert.equal(session?.activeScreenShare?.userId, userA.id);
    });

    test('TEST 8 — Pavan stops screen share; state resets to null', () => {
      const result = MeetingSignalingService.stopScreenShare(meetingId, userA.id);
      assert.equal(result.success, true);
      assert.ok(result.session);
      assert.equal(result.session.activeScreenShare, null);
    });

    test('TEST 9 — Super Admin can now start sharing after first sharer stops', () => {
      const result = MeetingSignalingService.startScreenShare(meetingId, userB.id, 'Super Admin');
      assert.equal(result.success, true);
      assert.ok(result.session);
      assert.equal(result.session.activeScreenShare?.userId, userB.id);
      assert.equal(result.session.activeScreenShare?.displayName, 'Super Admin');
    });

    test('TEST 10 — Disconnect / Leave Cleanup: When active sharer leaves, screen share stops automatically', async () => {
      const leaveResult = await MeetingSignalingService.leaveMeeting(meetingId, userB.id);
      assert.ok(leaveResult);
      assert.equal(leaveResult.session.activeScreenShare, null);

      const session = MeetingSignalingService.getMeeting(meetingId);
      assert.equal(session?.activeScreenShare, null);
    });

    test('TEST 11 — Host Ends Meeting: Screen sharing state is cleared', async () => {
      const endedSession = await MeetingSignalingService.endMeeting(meetingId, userA.id);
      assert.ok(endedSession);
      assert.equal(endedSession.status, 'ENDED');
      assert.equal(endedSession.activeScreenShare, null);
      assert.equal(MeetingSignalingService.isMeetingActive(meetingId), false);
    });
  });
});
