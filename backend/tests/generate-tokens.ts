import { prisma } from '../src/plugins/prisma.js';
import { DbService } from '../src/services/db.service.js';
import { SecurityUtil } from '../src/utils/security.js';

async function main() {
  const users = await DbService.query(
    async () => prisma.user.findMany({ include: { employee: true }, take: 5 }),
    async () => DbService.restRequest('/users?select=*,employee:employees(*)')
  );
  console.log('Found users:', users.map(u => ({ id: u.id, email: u.email, role: u.role, employeeId: u.employee?.id })));

  // Generate tokens for testing
  for (const u of users) {
    // Create a mock session or real session in DB
    const sessionToken = SecurityUtil.generateRandomToken(32);
    const sessionHash = SecurityUtil.hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

    const session = await DbService.query(
      async () => prisma.userSession.create({
        data: {
          userId: u.id,
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
            user_id: u.id,
            session_token_hash: sessionHash,
            access_mode: 'NORMAL',
            attendance_required: false,
            expires_at: expiresAt.toISOString(),
          },
        });
        return res[0];
      }
    );

    const accessToken = SecurityUtil.generateAccessToken({
      userId: u.id,
      sessionId: session.id,
      role: u.role,
      accessMode: 'NORMAL',
    });

    console.log(`Role: ${u.role}, Email: ${u.email}`);
    console.log(`Token: ${accessToken}\n`);
  }
}

main().catch(console.error).finally(() => process.exit(0));
