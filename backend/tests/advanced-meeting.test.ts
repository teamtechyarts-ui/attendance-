import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { SecurityUtil } from '../src/utils/security.js';
import { ChatService } from '../src/modules/collaboration/chat.service.js';
import { MeetingSignalingService } from '../src/modules/collaboration/meeting-signaling.service.js';
import { prisma } from '../src/plugins/prisma.js';
import { DbService } from '../src/services/db.service.js';

describe('Phase 2D — Advanced Meeting Experience Test Suite', () => {
  let app: FastifyInstance;
  let userA: any; // Pavan / Host
  let userB: any; // Super Admin / Participant
  let userC: any; // Employee / Participant
  let userNonMember: any;
  let sessA: string;
  let sessB: string;
  let sessC: string;
  let groupConvId: string;

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

    const groupConv = await ChatService.createGroupConversation(
      userA.id,
      'Product & Engineering Standup',
      'Phase 2D test group',
      [userB.id, userC.id]
    );
    groupConvId = groupConv.id;
  });

  describe('Meeting Lifecycle, Host Controls & Reconnection', () => {
    const meetingId = 'mtg_phase2d_experience_101';

    test('TEST 1 — Start Meeting with Pre-Join preferences (Camera ON, Mic Unmuted)', async () => {
      const { session } = await MeetingSignalingService.startMeeting(
        meetingId,
        groupConvId,
        userA.id,
        'Pavan Amirishetty',
        null,
        'Sprint 42 Demo & Review'
      );

      assert.ok(session);
      assert.equal(session.status, 'ACTIVE');
      assert.equal(session.hostUserId, userA.id);
      assert.equal(session.title, 'Sprint 42 Demo & Review');
    });

    test('TEST 2 — Join Meeting with Pre-Join preferences: Super Admin joins MUTED, Employee joins CAMERA OFF', async () => {
      // Super Admin joins with isMuted=true
      const joinB = await MeetingSignalingService.joinMeeting(meetingId, userB.id, 'Super Admin', null, true, false);
      assert.ok(joinB);
      assert.equal(joinB.participant.isMuted, true);
      assert.equal(joinB.participant.isCameraOff, false);

      // Employee joins with isCameraOff=true
      const joinC = await MeetingSignalingService.joinMeeting(meetingId, userC.id, 'Employee A', null, false, true);
      assert.ok(joinC);
      assert.equal(joinC.participant.isMuted, false);
      assert.equal(joinC.participant.isCameraOff, true);

      const session = MeetingSignalingService.getMeeting(meetingId);
      assert.equal(session?.participants.size, 3);
    });

    test('TEST 3 — Host Mute: Host mutes Employee A successfully', () => {
      const result = MeetingSignalingService.hostMuteParticipant(meetingId, userA.id, userC.id);
      assert.equal(result.success, true);
      assert.ok(result.targetParticipant);
      assert.equal(result.targetParticipant.isMuted, true);

      const session = MeetingSignalingService.getMeeting(meetingId);
      assert.equal(session?.participants.get(userC.id)?.isMuted, true);
    });

    test('TEST 4 — Security: Non-host (Super Admin) attempting to mute another participant is rejected', () => {
      const result = MeetingSignalingService.hostMuteParticipant(meetingId, userB.id, userC.id);
      assert.equal(result.success, false);
      assert.equal(result.reason, 'Only the meeting host can mute participants');
    });

    test('TEST 5 — Participant Self-Unmute: Employee A unmutes themselves after host mute', () => {
      const updateResult = MeetingSignalingService.updateParticipantMedia(meetingId, userC.id, {
        isMuted: false,
      });
      assert.ok(updateResult);
      assert.equal(updateResult.participant.isMuted, false);

      const session = MeetingSignalingService.getMeeting(meetingId);
      assert.equal(session?.participants.get(userC.id)?.isMuted, false);
    });

    test('TEST 6 — Screen Share then Host Remove: Employee A shares screen, Host removes Employee A', async () => {
      // 1. Employee A starts screen sharing
      const shareResult = MeetingSignalingService.startScreenShare(meetingId, userC.id, 'Employee A');
      assert.equal(shareResult.success, true);
      assert.equal(shareResult.session?.activeScreenShare?.userId, userC.id);

      // 2. Host removes Employee A
      const removeResult = await MeetingSignalingService.hostRemoveParticipant(
        meetingId,
        userA.id,
        userC.id,
        'Violated meeting guidelines'
      );
      assert.equal(removeResult.success, true);
      assert.equal(removeResult.targetParticipant?.status, 'REMOVED');

      // 3. Verify screen share automatically cleared upon removal
      const session = MeetingSignalingService.getMeeting(meetingId);
      assert.equal(session?.activeScreenShare, null);
      assert.equal(session?.participants.get(userC.id)?.status, 'REMOVED');
    });

    test('TEST 7 — Security: Non-host attempting to remove a participant is rejected', async () => {
      const result = await MeetingSignalingService.hostRemoveParticipant(meetingId, userB.id, userA.id);
      assert.equal(result.success, false);
      assert.equal(result.reason, 'Only the meeting host can remove participants');
    });

    test('TEST 8 — Reconnection and State Resync: Disconnected user recovers cleanly to JOINED', () => {
      // Disconnect userB with grace period
      MeetingSignalingService.handleUserDisconnect(userB.id, 60000);

      const sessionDuring = MeetingSignalingService.getMeeting(meetingId);
      assert.equal(sessionDuring?.participants.get(userB.id)?.status, 'DISCONNECTED');

      // Reconnect userB
      const sessionAfter = MeetingSignalingService.handleUserReconnect(userB.id);
      assert.ok(sessionAfter);
      assert.equal(sessionAfter.participants.get(userB.id)?.status, 'JOINED');
    });

    test('TEST 9 — Host End Meeting: Ends session and resets active meeting for group', async () => {
      const endedSession = await MeetingSignalingService.endMeeting(meetingId, userA.id);
      assert.ok(endedSession);
      assert.equal(endedSession.status, 'ENDED');
      assert.equal(MeetingSignalingService.isMeetingActive(meetingId), false);
    });
  });
});
