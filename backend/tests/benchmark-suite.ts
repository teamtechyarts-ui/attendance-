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
    return { name, duration, status: res.status, success: res.ok };
  } catch (err: any) {
    const duration = Math.round(performance.now() - start);
    return { name, duration, status: 'ERR', success: false, error: err.message };
  }
}

async function runBenchmark() {
  console.log('========================================');
  console.log('RUNNING COMPLETE END-TO-END BENCHMARK');
  console.log('========================================');

  const users = await DbService.query(
    async () => prisma.user.findMany({ include: { employee: true }, take: 10 }),
    async () => DbService.restRequest('/users?select=*,employee:employees(*)')
  );

  const empUser = users.find((u: any) => u.role === 'EMPLOYEE') || users[0];
  const adminUser = users.find((u: any) => u.role === 'SUPER_ADMIN') || users[0];

  // Set password_changed_at if null so employee is in NORMAL active mode
  if (!empUser.passwordChangedAt && !empUser.password_changed_at) {
    await DbService.restRequest(`/users?id=eq.${empUser.id}`, {
      method: 'PATCH',
      body: { password_changed_at: new Date().toISOString() },
    });
  }

  // Create real sessions in database so auth passes
  const createTestSession = async (user: any) => {
    const sessionToken = SecurityUtil.generateRandomToken(32);
    const sessionHash = SecurityUtil.hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

    const session = await DbService.query(
      async () => prisma.userSession.create({
        data: {
          userId: user.id,
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
            user_id: user.id,
            session_token_hash: sessionHash,
            access_mode: 'NORMAL',
            attendance_required: false,
            expires_at: expiresAt.toISOString(),
          },
        });
        return res[0];
      }
    );

    return SecurityUtil.generateAccessToken({
      userId: user.id,
      sessionId: session.id,
      role: user.role,
      accessMode: 'NORMAL',
    });
  };

  const empToken = await createTestSession(empUser);
  const adminToken = await createTestSession(adminUser);

  // Warm-up 1 request
  await fetch(`${BASE_URL}/health`);

  const endpoints = [
    { name: 'GET /api/auth/me (Employee)', url: '/api/auth/me', token: empToken },
    { name: 'GET /api/tasks (Employee)', url: '/api/tasks', token: empToken },
    { name: 'GET /api/tasks/summary (Employee)', url: '/api/tasks/summary', token: empToken },
    { name: 'GET /api/projects (Employee)', url: '/api/projects', token: empToken },
    { name: 'GET /api/attendance/today (Employee)', url: '/api/attendance/today', token: empToken },
    { name: 'GET /api/attendance/history (Employee)', url: '/api/attendance/history', token: empToken },
    { name: 'GET /api/leave/balances (Employee)', url: '/api/leave/balances', token: empToken },
    { name: 'GET /api/leave/requests (Employee)', url: '/api/leave/requests', token: empToken },
    { name: 'GET /api/reports (Employee)', url: '/api/reports', token: empToken },
    { name: 'GET /api/reports/today (Employee)', url: '/api/reports/today', token: empToken },
    { name: 'GET /api/attendance/metrics (Admin)', url: '/api/attendance/metrics', token: adminToken },
    { name: 'GET /api/attendance/live-overview (Admin)', url: '/api/attendance/live-overview', token: adminToken },
    { name: 'GET /api/employees (Admin)', url: '/api/employees', token: adminToken },
  ];

  const results = [];
  for (const ep of endpoints) {
    const r1 = await timeApi(ep.name, ep.url, ep.token);
    const r2 = await timeApi(ep.name, ep.url, ep.token);
    const r3 = await timeApi(ep.name, ep.url, ep.token);
    const avg = Math.round((r1.duration + r2.duration + r3.duration) / 3);
    results.push({ name: ep.name, avg_ms: avg, runs: [r1.duration, r2.duration, r3.duration], status: r1.status });
  }

  console.table(results);
}

runBenchmark().catch(console.error).finally(() => process.exit(0));
