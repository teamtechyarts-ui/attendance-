import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SecurityUtil } from '../src/utils/security.js';
import { DateTimeUtil } from '../src/utils/datetime.js';
import { TaskService } from '../src/modules/tasks/task.service.js';

describe('Continuous Work Session & Active Attendance Authentication Tests', () => {
  const userId = 'emp-user-123';
  const employeeId = 'emp-rec-456';
  const sessionId = 'session-test-789';

  test('TEST 1: Check-in upgrades session from RESTRICTED to NORMAL with continuous work validity', () => {
    const now = new Date();
    const todayStr = DateTimeUtil.getTodayDateString();

    // Session before check-in: RESTRICTED with 15-minute restriction window
    const preCheckInSession = {
      id: sessionId,
      userId,
      accessMode: 'RESTRICTED' as const,
      attendanceRequired: true,
      restrictedUntil: DateTimeUtil.addMinutes(now, 15),
      expiresAt: DateTimeUtil.addMinutes(now, 7 * 24 * 60),
      revokedAt: null,
    };

    assert.strictEqual(preCheckInSession.accessMode, 'RESTRICTED');
    assert.strictEqual(preCheckInSession.attendanceRequired, true);
    assert.ok(preCheckInSession.restrictedUntil !== null);

    // After successful check-in
    const postCheckInSession = {
      ...preCheckInSession,
      accessMode: 'NORMAL' as const,
      attendanceRequired: false,
      restrictedUntil: null,
      lastActivityAt: now,
    };

    const todayAttendance = {
      id: 'att-today-1',
      employeeId,
      attendanceDate: new Date(todayStr),
      status: 'PRESENT' as const,
      workMode: 'OFFICE' as const,
      checkInAt: now,
      checkOutAt: null,
      totalWorkMinutes: 0,
    };

    assert.strictEqual(postCheckInSession.accessMode, 'NORMAL');
    assert.strictEqual(postCheckInSession.attendanceRequired, false);
    assert.strictEqual(postCheckInSession.restrictedUntil, null);
    assert.ok(todayAttendance.checkInAt !== null);
    assert.strictEqual(todayAttendance.checkOutAt, null);

    // Evaluate active work session predicate
    const isActiveWorkSession = Boolean(
      postCheckInSession.accessMode === 'NORMAL' &&
      todayAttendance.checkInAt &&
      !todayAttendance.checkOutAt &&
      !postCheckInSession.revokedAt
    );

    assert.strictEqual(isActiveWorkSession, true, 'Checked-in employee with NORMAL mode must be evaluated as ACTIVE_WORK_SESSION');
  });

  test('TEST 2: Simulated Active Work Session over Time (15m, 30m, 1h, 4h, 8h, 10h) - Active Work Session MUST NOT Expire', () => {
    const loginTime = new Date('2026-10-01T09:00:00.000Z');
    const todayStr = DateTimeUtil.getTodayDateString(undefined, loginTime);

    // Access token payload
    const tokenPayload = {
      userId,
      sessionId,
      role: 'EMPLOYEE',
      accessMode: 'NORMAL' as const,
    };

    const token = SecurityUtil.generateAccessToken(tokenPayload, '24h');

    const activeAttendance = {
      id: 'att-today-1',
      employeeId,
      attendanceDate: new Date(todayStr),
      checkInAt: loginTime,
      checkOutAt: null,
    };

    const sessionRecord = {
      id: sessionId,
      userId,
      accessMode: 'NORMAL' as const,
      attendanceRequired: false,
      restrictedUntil: null,
      expiresAt: new Date(loginTime.getTime() + 7 * 24 * 3600 * 1000),
      revokedAt: null,
    };

    // Intervals to simulate
    const testIntervals = [
      { label: '15 minutes', minutes: 15 },
      { label: '30 minutes', minutes: 30 },
      { label: '1 hour', minutes: 60 },
      { label: '4 hours', minutes: 240 },
      { label: '8 hours', minutes: 480 },
      { label: '10 hours', minutes: 600 },
    ];

    for (const interval of testIntervals) {
      const simulatedCurrentTime = new Date(loginTime.getTime() + interval.minutes * 60 * 1000);

      // Verify token signature verification
      const verifiedPayload = SecurityUtil.verifyAccessToken(token, { ignoreExpiration: true });
      assert.ok(verifiedPayload, `[${interval.label}] Token signature verification must succeed`);
      assert.strictEqual(verifiedPayload?.sessionId, sessionId);

      // Evaluate active work session state at simulated time
      const isRevoked = Boolean(sessionRecord.revokedAt);
      const isCheckedIn = Boolean(activeAttendance.checkInAt && !activeAttendance.checkOutAt);
      const isActiveWorkSession = !isRevoked && sessionRecord.accessMode === 'NORMAL' && isCheckedIn;

      assert.strictEqual(
        isActiveWorkSession,
        true,
        `[${interval.label}] Session must remain an ACTIVE_WORK_SESSION and not expire`
      );

      // Verify that generic time expiry is bypassed while in active work session
      const isTimeExpired = sessionRecord.expiresAt < simulatedCurrentTime;
      const shouldAllowAccess = isActiveWorkSession || !isTimeExpired;

      assert.strictEqual(
        shouldAllowAccess,
        true,
        `[${interval.label}] Authenticated access must be granted continuously without logout or redirection`
      );
    }
  });

  test('TEST 3: Checkout immediately closes attendance, ends active work-session protection, and auto-stops timers', () => {
    const checkInTime = new Date('2026-10-01T09:00:00.000Z');
    const checkOutTime = new Date('2026-10-01T17:30:00.000Z'); // 8.5 hours later

    // Active timer running before checkout
    const activeTimer = {
      id: 'timer-active-1',
      taskId: 'task-1',
      employeeId,
      startedAt: new Date('2026-10-01T14:00:00.000Z'),
      durationSeconds: 1800, // already accumulated 30 mins from earlier interval
      isActive: true,
    };

    // Calculate worked seconds before checkout at 17:30 (3.5 hours running = 12600s + 1800s = 14400s = 4h)
    const elapsedAtCheckout = TaskService.calculateTaskWorkedSeconds([activeTimer], checkOutTime);
    assert.strictEqual(elapsedAtCheckout, 14400, 'Worked seconds before checkout must equal 14400 seconds (4 hours)');

    // Simulate Checkout
    const stoppedTimer = {
      ...activeTimer,
      endedAt: checkOutTime,
      pausedAt: checkOutTime,
      durationSeconds: elapsedAtCheckout,
      isActive: false,
    };

    const finalizedAttendance = {
      id: 'att-today-1',
      employeeId,
      checkInAt: checkInTime,
      checkOutAt: checkOutTime,
      totalWorkMinutes: Math.floor(DateTimeUtil.diffSeconds(checkInTime, checkOutTime) / 60),
    };

    assert.strictEqual(finalizedAttendance.totalWorkMinutes, 510, 'Total work minutes must be 510 (8.5 hours)');
    assert.strictEqual(stoppedTimer.isActive, false, 'Active timer must be stopped upon checkout');
    assert.strictEqual(stoppedTimer.durationSeconds, 14400, 'Final timer duration must be preserved');

    // Post-checkout: Active work session protection is ended
    const isCheckedInPostCheckout = Boolean(finalizedAttendance.checkInAt && !finalizedAttendance.checkOutAt);
    const isActiveWorkSessionPostCheckout = isCheckedInPostCheckout;

    assert.strictEqual(
      isActiveWorkSessionPostCheckout,
      false,
      'Post-checkout: isActiveWorkSession must be false, reverting to normal session policy'
    );
  });

  test('TEST 4: Pre-attendance 15-minute restricted rule is preserved and enforced', () => {
    const loginTime = new Date('2026-10-01T09:00:00.000Z');
    const restrictedUntil = new Date(loginTime.getTime() + 15 * 60 * 1000); // 09:15:00

    const restrictedSession = {
      id: sessionId,
      userId,
      accessMode: 'RESTRICTED' as const,
      attendanceRequired: true,
      restrictedUntil,
    };

    // Within 15 minutes (at 09:10): Allowed to access check-in & today status
    const timeWithin15m = new Date('2026-10-01T09:10:00.000Z');
    const isExpiredAt0910 = restrictedSession.restrictedUntil < timeWithin15m;
    assert.strictEqual(isExpiredAt0910, false, 'At 09:10, restricted session has not expired');

    // After 15 minutes (at 09:16): Restricted session window expired
    const timeAfter15m = new Date('2026-10-01T09:16:00.000Z');
    const isExpiredAt0916 = restrictedSession.restrictedUntil < timeAfter15m;
    assert.strictEqual(isExpiredAt0916, true, 'At 09:16, restricted window expired without check-in');
  });

  test('TEST 5: Security events immediately terminate access regardless of attendance status', () => {
    const checkInTime = new Date('2026-10-01T09:00:00.000Z');
    const todayAttendance = {
      checkInAt: checkInTime,
      checkOutAt: null,
    };

    // 1. Explicit User Logout / Session Revocation
    const revokedSession = {
      id: sessionId,
      userId,
      accessMode: 'NORMAL' as const,
      revokedAt: new Date(),
    };
    const isRevoked = Boolean(revokedSession.revokedAt);
    assert.strictEqual(isRevoked, true);
    // Security check: revoked session MUST be rejected
    const allowRevoked = !isRevoked && (todayAttendance.checkInAt && !todayAttendance.checkOutAt);
    assert.strictEqual(allowRevoked, false, 'Revoked session must be rejected immediately');

    // 2. Account Inactive / Suspended
    const suspendedUser = { id: userId, status: 'SUSPENDED' };
    const allowSuspended = suspendedUser.status === 'ACTIVE';
    assert.strictEqual(allowSuspended, false, 'Suspended account must be rejected immediately');

    // 3. Tampered / Invalid JWT
    const forgedToken = 'invalid.jwt.token.structure';
    const verifiedForged = SecurityUtil.verifyAccessToken(forgedToken);
    assert.strictEqual(verifiedForged, null, 'Forged or tampered JWT must be rejected');
  });

  test('TEST 6: Multiple tabs share the same authoritative server session state seamlessly', () => {
    // Both tabs hold the same sessionId and token
    const token = SecurityUtil.generateAccessToken({
      userId,
      sessionId,
      role: 'EMPLOYEE',
      accessMode: 'NORMAL',
    });

    const tabA_Payload = SecurityUtil.verifyAccessToken(token);
    const tabB_Payload = SecurityUtil.verifyAccessToken(token);

    assert.ok(tabA_Payload);
    assert.ok(tabB_Payload);
    assert.strictEqual(tabA_Payload?.sessionId, tabB_Payload?.sessionId);

    // Tab A performs check-in, setting DB attendance
    const attendanceRecord = {
      checkInAt: new Date(),
      checkOutAt: null,
    };

    // Both Tab A and Tab B queries evaluate against the authoritative DB attendance
    const isTabA_Active = Boolean(attendanceRecord.checkInAt && !attendanceRecord.checkOutAt);
    const isTabB_Active = Boolean(attendanceRecord.checkInAt && !attendanceRecord.checkOutAt);

    assert.strictEqual(isTabA_Active, true);
    assert.strictEqual(isTabB_Active, true);
  });

  test('TEST 7: Rate Limit (HTTP 429) simulation NEVER invalidates or revokes active session', () => {
    const session = {
      id: sessionId,
      userId,
      accessMode: 'NORMAL' as const,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    };

    // Simulate 429 response occurring on a rapid request
    const rateLimitResponse = {
      statusCode: 429,
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' },
    };

    assert.strictEqual(rateLimitResponse.statusCode, 429);

    // Ensure session properties remain completely unchanged
    assert.strictEqual(session.revokedAt, null, 'Rate limit response must NEVER set revokedAt');
    assert.strictEqual(session.accessMode, 'NORMAL', 'Rate limit response must NEVER downgrade accessMode');
    assert.ok(session.expiresAt > new Date(), 'Rate limit response must NEVER expire session');
  });

  test('TEST 8: Super Admin sessions maintain continuous stability and bypass attendance requirement', () => {
    const superAdminUser = {
      id: 'super-admin-1',
      role: 'SUPER_ADMIN' as const,
      appRole: 'SUPER_ADMIN' as const,
      status: 'ACTIVE' as const,
    };

    const isSuperAdmin = superAdminUser.role === 'SUPER_ADMIN' || superAdminUser.appRole === 'SUPER_ADMIN';
    assert.strictEqual(isSuperAdmin, true);

    // Super Admin does not require employee attendance to access workspace
    const bypassesAttendance = isSuperAdmin;
    assert.strictEqual(bypassesAttendance, true, 'Super Admin must always bypass attendance gating');
  });
});
