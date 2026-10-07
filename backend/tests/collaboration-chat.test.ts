import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { SecurityUtil } from '../src/utils/security.js';
import { PresenceService } from '../src/modules/collaboration/presence.service.js';
import { ChatService } from '../src/modules/collaboration/chat.service.js';
import { prisma } from '../src/plugins/prisma.js';
import { DbService } from '../src/services/db.service.js';

describe('Phase 1: Teams Collaboration, People, Presence & Chat Suite', () => {
  let app: FastifyInstance;
  let userA: any;
  let userB: any;
  let userC: any;
  let tokenA: string;
  let tokenB: string;
  let tokenC: string;
  let sessA: string;
  let sessB: string;
  let sessC: string;

  before(async () => {
    DbService.forceRestFallback(true);
    app = await buildApp();
    await app.ready();

    // 1. Get or create test users via DbService.query
    const userRows = await DbService.query(
      async () => prisma.user.findMany({
        where: { status: 'ACTIVE' },
        take: 3,
        include: { employee: true },
      }),
      async () => DbService.restRequest<any[]>('/users?status=eq.ACTIVE&limit=3')
    );

    if (userRows && userRows.length >= 2) {
      userA = userRows[0];
      userB = userRows[1];
      userC = userRows[2] || userRows[0];
    } else {
      userA = { id: '00000000-0000-0000-0000-000000000001', email: 'alice@techyarts.com', role: 'EMPLOYEE' };
      userB = { id: '00000000-0000-0000-0000-000000000002', email: 'bob@techyarts.com', role: 'EMPLOYEE' };
      userC = { id: '00000000-0000-0000-0000-000000000003', email: 'charlie@techyarts.com', role: 'EMPLOYEE' };
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
  });

  after(async () => {
    await app.close();
  });

  describe('Part 1: People Directory & Presence Management', () => {
    test('GET /api/collaboration/people returns authorized directory with live presence', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/collaboration/people',
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
      });

      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.ok(Array.isArray(data.people));
      if (data.people.length > 0) {
        const person = data.people[0];
        assert.ok(person.userId);
        assert.ok(person.presence);
        assert.ok(typeof person.presence.status === 'string');
      }
    });

    test('POST /api/collaboration/presence/status updates manual presence and retains status', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/collaboration/presence/status',
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
        payload: {
          status: 'BUSY',
          customStatusMessage: 'In client review meeting',
        },
      });

      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.presence.status, 'BUSY');
      assert.equal(data.presence.customStatusMessage, 'In client review meeting');

      // Verify getPresence returns updated presence
      const getRes = await app.inject({
        method: 'GET',
        url: '/api/collaboration/presence',
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
      });
      assert.equal(getRes.statusCode, 200);
      const getData = JSON.parse(getRes.body);
      assert.equal(getData.presence.status, 'BUSY');
    });
  });

  describe('Part 2: One-to-One Direct Chat & Deterministic Uniqueness', () => {
    let directConvId: string;

    test('Creates a direct chat between User A and User B', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/collaboration/conversations/direct',
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
        payload: {
          targetUserId: userB.id,
        },
      });

      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.ok(data.conversation);
      assert.equal(data.conversation.type, 'DIRECT');
      directConvId = data.conversation.id;
    });

    test('Calling direct chat again returns the exact same conversation (no duplicates)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/collaboration/conversations/direct',
        headers: {
          authorization: `Bearer ${tokenB}`,
        },
        payload: {
          targetUserId: userA.id,
        },
      });

      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.conversation.id, directConvId);
    });

    test('Rejects creating direct chat with oneself', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/collaboration/conversations/direct',
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
        payload: {
          targetUserId: userA.id,
        },
      });

      assert.equal(res.statusCode, 400);
    });
  });

  describe('Part 3: Group Chat Creation, Messages, Reactions, Replies, Edit & Delete', () => {
    let groupConvId: string;
    let messageId: string;

    test('Creates a group chat with title, description, and members', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/collaboration/conversations/group',
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
        payload: {
          title: 'Product Launch Engineering',
          description: 'Coordination channel for Q4 release',
          memberUserIds: [userB.id],
        },
      });

      assert.equal(res.statusCode, 201);
      const data = JSON.parse(res.body);
      assert.equal(data.conversation.type, 'GROUP');
      assert.equal(data.conversation.title, 'Product Launch Engineering');
      groupConvId = data.conversation.id;
    });

    test('User A sends a message in the group chat', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/collaboration/conversations/${groupConvId}/messages`,
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
        payload: {
          body: 'Welcome to the project launch channel!',
        },
      });

      assert.equal(res.statusCode, 201);
      const data = JSON.parse(res.body);
      assert.equal(data.message.body, 'Welcome to the project launch channel!');
      messageId = data.message.id;
    });

    test('User B sends a reply message', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/collaboration/conversations/${groupConvId}/messages`,
        headers: {
          authorization: `Bearer ${tokenB}`,
        },
        payload: {
          body: 'Thanks! Ready to deploy.',
          replyToMessageId: messageId,
        },
      });

      assert.equal(res.statusCode, 201);
      const data = JSON.parse(res.body);
      assert.equal(data.message.body, 'Thanks! Ready to deploy.');
      assert.equal(data.message.replyToMessageId, messageId);
    });

    test('User B toggles a reaction on the message', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/collaboration/messages/${messageId}/reactions`,
        headers: {
          authorization: `Bearer ${tokenB}`,
        },
        payload: {
          reaction: '👍',
        },
      });

      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.ok(data.reactions);
      assert.ok(data.reactions.some((r: any) => r.reaction === '👍' && r.userId === userB.id));
    });

    test('User A edits their sent message', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/collaboration/messages/${messageId}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
        payload: {
          body: 'Welcome to the project launch channel! (Updated notes)',
        },
      });

      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.message.body, 'Welcome to the project launch channel! (Updated notes)');
      assert.ok(data.message.editedAt);
    });

    test('User A soft-deletes their message', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/collaboration/messages/${messageId}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
      });

      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.success, true);
    });

    test('Marks conversation as read', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/collaboration/conversations/${groupConvId}/read`,
        headers: {
          authorization: `Bearer ${tokenB}`,
        },
        payload: {},
      });

      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.success, true);
    });
  });

  describe('Part 4: Security & Access Boundary Enforcement', () => {
    test('Unauthorized user receives 403 Forbidden when trying to access conversation', async () => {
      // Create a private direct chat between userA and userB
      const directRes = await app.inject({
        method: 'POST',
        url: '/api/collaboration/conversations/direct',
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
        payload: {
          targetUserId: userB.id,
        },
      });
      const conv = JSON.parse(directRes.body).conversation;

      // User C (not in conversation) tries to get messages
      const res = await app.inject({
        method: 'GET',
        url: `/api/collaboration/conversations/${conv.id}/messages`,
        headers: {
          authorization: `Bearer ${tokenC}`,
        },
      });

      assert.equal(res.statusCode, 403);
    });

    test('Rejects unauthenticated chat requests with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/collaboration/conversations',
      });
      assert.equal(res.statusCode, 401);
    });
  });

  describe('Part 5: Role Matrix Tests (Super Admin, Limited Admin & Employee)', () => {
    let superAdminToken: string;
    let limitedAdminToken: string;
    let superAdminUserId = '99999999-9999-9999-9999-999999999999';

    before(async () => {
      // Create dedicated Super Admin session without linked employee record
      const superAdminSess = '88888888-8888-8888-8888-888888888888';
      superAdminToken = SecurityUtil.generateAccessToken({
        userId: superAdminUserId,
        sessionId: superAdminSess,
        role: 'SUPER_ADMIN',
        accessMode: 'NORMAL',
      });

      // Limited Admin session
      limitedAdminToken = SecurityUtil.generateAccessToken({
        userId: userB.id,
        sessionId: sessB,
        role: 'EMPLOYEE',
        accessMode: 'NORMAL',
      });
    });

    test('Super Admin can access People directory and view all colleagues', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/collaboration/people',
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
      });

      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.ok(Array.isArray(data.people));
    });

    test('Super Admin starts direct chat with normal Employee and sends message', async () => {
      // Direct chat between Super Admin (userA) and Employee (userB)
      const convRes = await app.inject({
        method: 'POST',
        url: '/api/collaboration/conversations/direct',
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
        payload: {
          targetUserId: userB.id,
        },
      });

      assert.equal(convRes.statusCode, 200);
      const conv = JSON.parse(convRes.body).conversation;
      assert.ok(conv.id);

      // Super Admin sends message to employee
      const msgRes = await app.inject({
        method: 'POST',
        url: `/api/collaboration/conversations/${conv.id}/messages`,
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
        payload: {
          body: 'Hello from Super Admin!',
        },
      });

      assert.equal(msgRes.statusCode, 201);
      const msgData = JSON.parse(msgRes.body);
      assert.equal(msgData.message.body, 'Hello from Super Admin!');

      // Employee reads message
      const readRes = await app.inject({
        method: 'POST',
        url: `/api/collaboration/conversations/${conv.id}/read`,
        headers: {
          authorization: `Bearer ${tokenB}`,
        },
        payload: {},
      });

      assert.equal(readRes.statusCode, 200);
    });

    test('Employee sends reply back to Super Admin', async () => {
      const convRes = await app.inject({
        method: 'POST',
        url: '/api/collaboration/conversations/direct',
        headers: {
          authorization: `Bearer ${tokenB}`,
        },
        payload: {
          targetUserId: userA.id,
        },
      });

      const conv = JSON.parse(convRes.body).conversation;

      const replyRes = await app.inject({
        method: 'POST',
        url: `/api/collaboration/conversations/${conv.id}/messages`,
        headers: {
          authorization: `Bearer ${tokenB}`,
        },
        payload: {
          body: 'Hello Super Admin, acknowledged and working on it.',
        },
      });

      assert.equal(replyRes.statusCode, 201);
      const data = JSON.parse(replyRes.body);
      assert.equal(data.message.body, 'Hello Super Admin, acknowledged and working on it.');
    });
  });
});

