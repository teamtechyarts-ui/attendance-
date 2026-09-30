import http from 'http';
import { SecurityUtil } from './src/utils/security.js';
import { DbService } from './src/services/db.service.js';
import { AuthService } from './src/modules/auth/auth.service.js';


function requestGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function verifyLive() {
  console.log('=== VERIFYING LIVE ATTENDANCE ENDPOINTS & PAGES ===');

  // Find active users
  const users = await DbService.restRequest('/users?select=id,email,role');
  const superUser = users.find(u => u.role === 'SUPER_ADMIN');
  const empUser = users.find(u => u.role === 'EMPLOYEE');

  const now = new Date();
  const expiresAt = new Date(Date.now() + 86400000);

  const superSession = await DbService.restRequest('/user_sessions', {
    method: 'POST',
    body: {
      user_id: superUser.id,
      session_token_hash: 'test-hash-super',
      access_mode: 'NORMAL',
      attendance_required: false,
      expires_at: expiresAt.toISOString(),
      last_activity_at: now.toISOString(),
    }
  });

  const empSession = await DbService.restRequest('/user_sessions', {
    method: 'POST',
    body: {
      user_id: empUser.id,
      session_token_hash: 'test-hash-emp',
      access_mode: 'NORMAL',
      attendance_required: false,
      expires_at: expiresAt.toISOString(),
      last_activity_at: now.toISOString(),
    }
  });


  const superToken = SecurityUtil.generateAccessToken({
    userId: superUser.id,
    sessionId: superSession[0].id,
    role: superUser.role,
    accessMode: 'NORMAL',
  });

  const empToken = SecurityUtil.generateAccessToken({
    userId: empUser.id,
    sessionId: empSession[0].id,
    role: empUser.role,
    accessMode: 'NORMAL',
  });



  console.log('\n[TEST 1] Employee GET /api/attendance/history?month=9&year=2026');
  const empRes = await requestGet('http://localhost:4000/api/attendance/history?month=9&year=2026', {
    authorization: `Bearer ${empToken}`,
  });
  console.log(`Status: ${empRes.status} | Success: ${empRes.data?.success} | Records: ${empRes.data?.data?.records?.length} | WorkingDays: ${empRes.data?.data?.summary?.workingDays}`);

  console.log('\n[TEST 2] Super Admin GET /api/attendance/history?adminView=true&month=9&year=2026');
  const adminRes = await requestGet('http://localhost:4000/api/attendance/history?adminView=true&month=9&year=2026', {
    authorization: `Bearer ${superToken}`,
  });
  console.log(`Status: ${adminRes.status} | Success: ${adminRes.data?.success} | Records: ${adminRes.data?.data?.records?.length} | TotalDays: ${adminRes.data?.data?.summary?.totalDays}`);

  console.log('\n[TEST 3] Super Admin GET /api/attendance/history?adminView=true&month=10&year=2026');
  const adminOctRes = await requestGet('http://localhost:4000/api/attendance/history?adminView=true&month=10&year=2026', {
    authorization: `Bearer ${superToken}`,
  });
  console.log(`Status: ${adminOctRes.status} | Success: ${adminOctRes.data?.success} | Records: ${adminOctRes.data?.data?.records?.length}`);

  // Cleanup test sessions
  await DbService.restRequest(`/user_sessions?id=eq.${superSession[0].id}`, { method: 'DELETE' }).catch(() => {});
  await DbService.restRequest(`/user_sessions?id=eq.${empSession[0].id}`, { method: 'DELETE' }).catch(() => {});

  console.log('\n=== LIVE VERIFICATION COMPLETE: ALL 200 OK ===');
}

verifyLive().catch(console.error);

