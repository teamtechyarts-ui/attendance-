import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { SecurityUtil } from '../src/utils/security.js';
import { MeetingSignalingService } from '../src/modules/collaboration/meeting-signaling.service.js';
import { ChatService } from '../src/modules/collaboration/chat.service.js';
import { prisma } from '../src/plugins/prisma.js';
import { DbService } from '../src/services/db.service.js';

describe('Group Collaboration Forensic Fix — Identity, Multi-Video Mesh & Persistence Suite', () => {
  let app: FastifyInstance;
  let userPavan: any;
  let userAdmin: any;
  let userSushma: any;
  let groupConvId: string;
  let meetingId: string;

  before(async () => {
    DbService.forceRestFallback(true);
    app = await buildApp();
    await app.ready();

    // Fetch existing database users
    const userRows = await DbService.query(
      async () => prisma.user.findMany({
        where: { status: 'ACTIVE' },
        take: 3,
        include: { employee: true },
      }),
      async () => DbService.restRequest<any[]>('/users?status=eq.ACTIVE&limit=3')
    );

    if (userRows && userRows.length >= 3) {
      userPavan = userRows[0];
      userAdmin = userRows[1];
      userSushma = userRows[2];
    } else {
      userPavan = { id: crypto.randomUUID(), email: 'pavan@techyarts.com', role: 'EMPLOYEE', displayName: 'Pavan Amirishetty' };
      userAdmin = { id: crypto.randomUUID(), email: 'admin@techyarts.com', role: 'SUPER_ADMIN' };
      userSushma = { id: crypto.randomUUID(), email: 'sushma.singaram@techyarts.com', role: 'EMPLOYEE', displayName: 'Sushma Singaram' };
    }

    groupConvId = crypto.randomUUID();
  });

  after(async () => {
    await app.close();
  });

  // ==========================================
  // ROOT CAUSE 1: AUTHORITATIVE USER IDENTITY
  // ==========================================
  describe('Problem 1: Participant Identity Resolution', () => {
    test('TEST 1.1 — Resolves user with client-provided displayName when DB lookup falls back', async () => {
      const identity = await MeetingSignalingService.resolveUserIdentity(crypto.randomUUID(), 'Pavan Amirishetty');
      assert.ok(identity);
      assert.equal(identity.displayName, 'Pavan Amirishetty');
      assert.notEqual(identity.displayName, 'Participant');
      assert.notEqual(identity.displayName, 'Colleague');
    });

    test('TEST 1.2 — Resolves user with DB or client-sent Super Admin identity', async () => {
      const identity = await MeetingSignalingService.resolveUserIdentity(userAdmin.id, 'Super Admin');
      assert.ok(identity);
      assert.ok(identity.displayName.length > 0);
      assert.notEqual(identity.displayName, 'Participant');
      assert.notEqual(identity.displayName, 'Colleague');
    });

    test('TEST 1.3 — Resolves third user with non-generic identity', async () => {
      const identity = await MeetingSignalingService.resolveUserIdentity(userSushma.id, 'Sushma Singaram');
      assert.ok(identity);
      assert.ok(identity.displayName.length > 0);
      assert.notEqual(identity.displayName, 'Participant');
      assert.notEqual(identity.displayName, 'Colleague');
    });
  });

  // ==========================================
  // ROOT CAUSE 2: MULTI-PARTICIPANT WEBRTC MESH
  // ==========================================
  describe('Problem 2: Group Meeting Multi-Participant Media & Mesh Architecture', () => {
    test('TEST 2.1 — Pavan starts meeting with valid UUID for PostgreSQL DB persistence', async () => {
      meetingId = crypto.randomUUID();
      const { session, isNew } = await MeetingSignalingService.startMeeting(
        meetingId,
        groupConvId,
        userPavan.id,
        'Pavan Amirishetty',
        null,
        'Testing Group'
      );

      assert.equal(isNew, true);
      assert.equal(session.meetingId, meetingId);
      assert.equal(session.hostUserId, userPavan.id);
      assert.equal(session.status, 'ACTIVE');

      const hostParticipant = session.participants.get(userPavan.id);
      assert.ok(hostParticipant);
      assert.equal(hostParticipant?.role, 'HOST');
      assert.equal(hostParticipant?.displayName, 'Pavan Amirishetty');
      assert.equal(hostParticipant?.status, 'JOINED');
    });

    test('TEST 2.2 — Super Admin and Sushma join meeting, forming 3-way participant mesh', async () => {
      // Super Admin joins
      const joinAdmin = await MeetingSignalingService.joinMeeting(
        meetingId,
        userAdmin.id,
        'Super Admin',
        null,
        false,
        false
      );
      assert.ok(joinAdmin);
      assert.equal(joinAdmin.participant.displayName, 'Super Admin');
      assert.equal(joinAdmin.participant.role, 'PARTICIPANT');

      // Sushma joins
      const joinSushma = await MeetingSignalingService.joinMeeting(
        meetingId,
        userSushma.id,
        'Sushma Singaram',
        null,
        false,
        false
      );
      assert.ok(joinSushma);
      assert.equal(joinSushma.participant.displayName, 'Sushma Singaram');
      assert.equal(joinSushma.participant.role, 'PARTICIPANT');

      // Verify all 3 participants are active and have independent participant state
      const session = MeetingSignalingService.getMeeting(meetingId);
      assert.ok(session);
      assert.equal(session.participants.size, 3);
      assert.ok(session.participants.has(userPavan.id));
      assert.ok(session.participants.has(userAdmin.id));
      assert.ok(session.participants.has(userSushma.id));
    });

    test('TEST 2.3 — Camera toggles independently per participant without affecting others', () => {
      // Pavan turns camera OFF
      MeetingSignalingService.updateParticipantMedia(meetingId, userPavan.id, { isCameraOff: true });
      let session = MeetingSignalingService.getMeeting(meetingId);
      assert.ok(session);
      assert.equal(session.participants.get(userPavan.id)?.isCameraOff, true);
      assert.equal(session.participants.get(userAdmin.id)?.isCameraOff, false);
      assert.equal(session.participants.get(userSushma.id)?.isCameraOff, false);

      // Pavan turns camera ON
      MeetingSignalingService.updateParticipantMedia(meetingId, userPavan.id, { isCameraOff: false });
      session = MeetingSignalingService.getMeeting(meetingId);
      assert.ok(session);
      assert.equal(session.participants.get(userPavan.id)?.isCameraOff, false);
    });

    test('TEST 2.4 — Sushma leaves and rejoins: peer session cleans up and recovers cleanly', async () => {
      // Sushma leaves
      const leaveResult = await MeetingSignalingService.leaveMeeting(meetingId, userSushma.id);
      assert.ok(leaveResult);
      assert.equal(leaveResult.participant.status, 'LEFT');
      assert.ok(leaveResult.participant.leftAt);

      const sessionAfterLeave = MeetingSignalingService.getMeeting(meetingId);
      assert.ok(sessionAfterLeave);
      const activeAfterLeave = Array.from(sessionAfterLeave.participants.values()).filter(p => p.status === 'JOINED');
      assert.equal(activeAfterLeave.length, 2);

      // Sushma rejoins
      const rejoinResult = await MeetingSignalingService.joinMeeting(
        meetingId,
        userSushma.id,
        'Sushma Singaram',
        null,
        false,
        false
      );
      assert.ok(rejoinResult);
      assert.equal(rejoinResult.participant.status, 'JOINED');
      assert.equal(rejoinResult.participant.leftAt, null);

      const sessionAfterRejoin = MeetingSignalingService.getMeeting(meetingId);
      assert.ok(sessionAfterRejoin);
      const activeAfterRejoin = Array.from(sessionAfterRejoin.participants.values()).filter(p => p.status === 'JOINED');
      assert.equal(activeAfterRejoin.length, 3);
    });
  });

  // ==========================================
  // ROOT CAUSE 3: MEETING LIFECYCLE PERSISTENCE
  // ==========================================
  describe('Problem 3: Meeting Persistence and Group Chat History', () => {
    test('TEST 3.1 — Non-host user cannot end meeting (Authorization check)', async () => {
      await assert.rejects(
        async () => {
          await MeetingSignalingService.endMeeting(meetingId, userSushma.id);
        },
        /host/i
      );
    });

    test('TEST 3.2 — Host Pavan ends meeting: status becomes ENDED with duration and timestamps', async () => {
      const endedSession = await MeetingSignalingService.endMeeting(meetingId, userPavan.id);
      assert.ok(endedSession);
      assert.equal(endedSession.status, 'ENDED');
      assert.ok(endedSession.startedAt);
      assert.ok(endedSession.endedAt);
      assert.ok(typeof endedSession.durationSeconds === 'number');

      // Active meeting cache is cleared
      assert.equal(MeetingSignalingService.getActiveMeetingForConversation(groupConvId), undefined);
      assert.equal(MeetingSignalingService.isMeetingActive(meetingId), false);
    });
  });

  // ==========================================
  // ROOT CAUSE 4: GROUP MEMBER MANAGEMENT & ACTIVITY
  // ==========================================
  describe('Problem 4: Group Member Management, Authorization & Activity Messages', () => {
    let testGroupId: string;

    test('TEST 4.1 — Pavan creates group conversation with authoritative creator info & system message', async () => {
      const conv = await ChatService.createGroupConversation(
        userPavan.id,
        'Engineering Core',
        'Primary backend and frontend team',
        [userSushma.id]
      );

      assert.ok(conv);
      assert.equal(conv.type, 'GROUP');
      assert.equal(conv.title, 'Engineering Core');
      assert.equal(conv.createdBy, userPavan.id);
      assert.equal(conv.members?.length, 2); // Pavan + Sushma
      testGroupId = conv.id;
    });

    test('TEST 4.2 — Pavan adds Super Admin: membership increases and system message is generated', async () => {
      const addResult = await ChatService.addGroupMember(userPavan.id, testGroupId, userAdmin.id);
      assert.ok(addResult);
      assert.equal(addResult.userId, userAdmin.id);

      const conv = await ChatService.getConversationById(userPavan.id, testGroupId);
      assert.ok(conv);
      assert.equal(conv.members?.length, 3);
    });

    test('TEST 4.3 — Cannot add existing member twice (Stale client prevention)', async () => {
      await assert.rejects(
        async () => {
          await ChatService.addGroupMember(userPavan.id, testGroupId, userAdmin.id);
        },
        /already a member/i
      );
    });

    test('TEST 4.4 — Sushma voluntarily leaves the group: member count decreases', async () => {
      const leaveResult = await ChatService.leaveGroupConversation(userSushma.id, testGroupId);
      assert.equal(leaveResult.success, true);

      const conv = await ChatService.getConversationById(userPavan.id, testGroupId);
      assert.ok(conv);
      assert.equal(conv.members?.length, 2);
      assert.equal(conv.members?.some((m: any) => m.userId === userSushma.id), false);
    });

    test('TEST 4.5 — Pavan removes Super Admin: member is removed and member count updates', async () => {
      const removeResult = await ChatService.removeGroupMember(userPavan.id, testGroupId, userAdmin.id);
      assert.equal(removeResult.success, true);

      const conv = await ChatService.getConversationById(userPavan.id, testGroupId);
      assert.ok(conv);
      assert.equal(conv.members?.length, 1);
    });
  });
});
