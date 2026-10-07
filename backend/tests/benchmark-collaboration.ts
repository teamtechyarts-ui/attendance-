import { performance } from 'perf_hooks';
import { DbService } from '../src/services/db.service.js';
import { SecurityUtil } from '../src/utils/security.js';
import { prisma } from '../src/plugins/prisma.js';

const BASE_URL = 'http://localhost:4000';

async function timeApi(name: string, url: string, token: string) {
  const start = performance.now();
  try {
    const res = await fetch(`${BASE_URL}${url}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const duration = Math.round(performance.now() - start);
    const data = await res.json().catch(() => ({}));
    return { name, duration, status: res.status, success: res.ok, data };
  } catch (err: any) {
    const duration = Math.round(performance.now() - start);
    return { name, duration, status: 'ERR', success: false, error: err.message };
  }
}

async function runCollaborationBenchmark() {
  console.log('============================================================');
  console.log('MEASURING COLLABORATION INITIALIZATION WATERFALL (HTTP API)');
  console.log('============================================================');

  const users = await DbService.query(
    async () => prisma.user.findMany({ include: { employee: true }, take: 5 }),
    async () => DbService.restRequest('/users?select=*,employee:employees(*)')
  );

  const empUser = users.find((u: any) => u.role === 'EMPLOYEE') || users[0];

  const sessionToken = SecurityUtil.generateRandomToken(32);
  const sessionHash = SecurityUtil.hashSessionToken(sessionToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

  const session = await DbService.query(
    async () =>
      prisma.userSession.create({
        data: {
          userId: empUser.id,
          sessionTokenHash: sessionHash,
          accessMode: 'NORMAL',
          attendanceRequired: false,
          expiresAt,
        },
      }),
    async () => {
      const res = await DbService.restRequest('/user_sessions', {
        method: 'POST',
        body: {
          user_id: empUser.id,
          session_token_hash: sessionHash,
          access_mode: 'NORMAL',
          attendance_required: false,
          expires_at: expiresAt.toISOString(),
        },
      });
      return res[0];
    }
  );

  const token = SecurityUtil.generateAccessToken({
    userId: empUser.id,
    sessionId: session.id,
    role: empUser.role,
    accessMode: 'NORMAL',
  });

  // Warm-up
  await fetch(`${BASE_URL}/health`);

  console.log('\n--- 1. Single Calls Measurement ---');
  const rMe = await timeApi('GET /api/auth/me', '/api/auth/me', token);
  console.log(`${rMe.name}: ${rMe.duration}ms [status=${rMe.status}]`);

  const rPres = await timeApi('GET /api/collaboration/presence', '/api/collaboration/presence', token);
  console.log(`${rPres.name}: ${rPres.duration}ms [status=${rPres.status}]`);

  const rConv = await timeApi('GET /api/collaboration/conversations', '/api/collaboration/conversations', token);
  console.log(`${rConv.name}: ${rConv.duration}ms [status=${rConv.status}] (found ${rConv.data?.conversations?.length || 0} conversations)`);

  const rDir = await timeApi('GET /api/collaboration/people', '/api/collaboration/people', token);
  console.log(`${rDir.name}: ${rDir.duration}ms [status=${rDir.status}] (found ${rDir.data?.people?.length || 0} people)`);

  let targetConvId = rConv.data?.conversations?.[0]?.id;
  if (targetConvId) {
    const rConvDetails = await timeApi(`GET /api/collaboration/conversations/${targetConvId}`, `/api/collaboration/conversations/${targetConvId}`, token);
    console.log(`${rConvDetails.name}: ${rConvDetails.duration}ms [status=${rConvDetails.status}]`);

    const rMsgs = await timeApi(`GET /api/collaboration/conversations/${targetConvId}/messages`, `/api/collaboration/conversations/${targetConvId}/messages`, token);
    console.log(`${rMsgs.name}: ${rMsgs.duration}ms [status=${rMsgs.status}] (found ${rMsgs.data?.messages?.length || 0} messages)`);
  }

  console.log('\n--- 2. Optimized Parallel Initial Fetch (Promise.all([presence, conversations])) ---');
  const pStart = performance.now();
  const [pPres, pConv] = await Promise.all([
    fetch(`${BASE_URL}/api/collaboration/presence`, { headers: { Authorization: `Bearer ${token}` } }),
    fetch(`${BASE_URL}/api/collaboration/conversations`, { headers: { Authorization: `Bearer ${token}` } }),
  ]);
  const pDur = Math.round(performance.now() - pStart);
  console.log(`Parallel initial data fetch completed in: ${pDur}ms (Presence: ${pPres.status}, Conversations: ${pConv.status})`);

  console.log('\n============================================================');
  console.log('BENCHMARK COMPLETE');
  console.log('============================================================');
}

runCollaborationBenchmark().catch(console.error);
