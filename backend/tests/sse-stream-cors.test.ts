import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { FastifyInstance } from 'fastify';
import { SecurityUtil } from '../src/utils/security.js';
import { DbService } from '../src/services/db.service.js';
import { NotificationService } from '../src/modules/notifications/notification.service.js';

describe('SSE Notification Stream CORS and Connection Integration Test', () => {
  let app: FastifyInstance;
  let testUserId: string;
  let accessToken: string;

  before(async () => {
    app = await buildApp();
    await app.ready();

    // Get an active user
    const users = await DbService.restRequest<any[]>('/users?status=eq.ACTIVE&limit=1&select=id,role');
    testUserId = users?.[0]?.id;

    // Create a fresh unexpired session
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const createdSessions = await DbService.restRequest<any[]>('/user_sessions', {
      method: 'POST',
      body: {
        user_id: testUserId,
        session_token_hash: SecurityUtil.hashSessionToken(SecurityUtil.generateRandomToken()),
        access_mode: 'NORMAL',
        expires_at: expiresAt,
      },
    });

    const sessionId = createdSessions?.[0]?.id || '00000000-0000-0000-0000-000000000001';

    accessToken = SecurityUtil.generateAccessToken({
      userId: testUserId,
      sessionId,
      role: 'SUPER_ADMIN',
      accessMode: 'NORMAL',
    });
  });

  after(async () => {
    await app.close();
  });

  test('OPTIONS preflight to /api/notifications/stream returns required CORS headers', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/notifications/stream',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'GET',
      },
    });

    assert.equal(res.statusCode, 204);
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:3000');
    assert.equal(res.headers['access-control-allow-credentials'], 'true');
    assert.ok(res.headers['access-control-allow-methods']?.includes('GET'));
  });

  test('GET /api/notifications/stream returns 200 with text/event-stream and CORS headers via real HTTP client', async () => {
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as any).port;

    const http = await import('http');

    const receivedChunks: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path: '/api/notifications/stream',
          method: 'GET',
          headers: {
            origin: 'http://localhost:3000',
            authorization: `Bearer ${accessToken}`,
          },
        },
        (res) => {
          assert.equal(res.statusCode, 200);
          assert.equal(res.headers['content-type'], 'text/event-stream');
          assert.equal(res.headers['cache-control'], 'no-cache, no-transform');
          assert.equal(res.headers['connection'], 'keep-alive');
          assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:3000');
          assert.equal(res.headers['access-control-allow-credentials'], 'true');

          res.on('data', (chunk) => {
            const str = chunk.toString();
            receivedChunks.push(str);

            if (str.includes('event: connected')) {
              // Now trigger a live notification
              NotificationService.createNotification({
                userId: testUserId,
                type: 'SYSTEM',
                title: 'SSE CORS Live Test',
                message: 'Live test notification stream event',
              }).catch(reject);
            }

            if (str.includes('SSE CORS Live Test')) {
              // Successfully verified live notification delivery over SSE
              req.destroy();
              resolve();
            }
          });
        }
      );

      req.on('error', (err) => {
        // req.destroy() causes an ECONNRESET/abort which is expected on intentional close
        if ((err as any).code === 'ECONNRESET' || req.destroyed) {
          resolve();
        } else {
          reject(err);
        }
      });

      req.end();
    });

    const fullOutput = receivedChunks.join('');
    assert.ok(fullOutput.includes('event: connected'), 'Must receive connected event');
    assert.ok(fullOutput.includes('SSE CORS Live Test'), 'Must receive notification event');
  });
});
