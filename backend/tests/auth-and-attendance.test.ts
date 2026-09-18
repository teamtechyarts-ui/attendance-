import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SecurityUtil } from '../src/utils/security.js';
import { DateTimeUtil } from '../src/utils/datetime.js';

describe('Security & Authentication Unit Tests', () => {
  test('Argon2id hashes and verifies passwords correctly', async () => {
    const rawPassword = 'SecurePassword123!';
    const hash = await SecurityUtil.hashPassword(rawPassword);

    assert.ok(hash.startsWith('$argon2id$'), 'Hash should be Argon2id format');
    
    const isValid = await SecurityUtil.verifyPassword(rawPassword, hash);
    assert.strictEqual(isValid, true, 'Valid password must verify to true');

    const isInvalid = await SecurityUtil.verifyPassword('WrongPassword!', hash);
    assert.strictEqual(isInvalid, false, 'Invalid password must verify to false');
  });

  test('Session Token SHA-256 hashing is consistent and irreversible', () => {
    const token = SecurityUtil.generateRandomToken(32);
    const hash1 = SecurityUtil.hashSessionToken(token);
    const hash2 = SecurityUtil.hashSessionToken(token);

    assert.strictEqual(hash1, hash2, 'Same token must produce identical SHA-256 hash');
    assert.strictEqual(hash1.length, 64, 'SHA-256 hex string should be 64 characters');
  });

  test('Access token generation and verification returns valid payload', () => {
    const payload = {
      userId: 'test-user-id',
      sessionId: 'test-session-id',
      role: 'EMPLOYEE',
      accessMode: 'RESTRICTED' as const,
    };

    const token = SecurityUtil.generateAccessToken(payload);
    const verified = SecurityUtil.verifyAccessToken(token);

    assert.ok(verified, 'Access token should be verified');
    assert.strictEqual(verified?.userId, payload.userId);
    assert.strictEqual(verified?.sessionId, payload.sessionId);
    assert.strictEqual(verified?.accessMode, 'RESTRICTED');
  });
});

describe('DateTime & Workday Calculation Unit Tests', () => {
  test('DateTimeUtil formats date strings in target timezone', () => {
    const todayStr = DateTimeUtil.getTodayDateString('Asia/Kolkata');
    assert.match(todayStr, /^\d{4}-\d{2}-\d{2}$/, 'Date string should match YYYY-MM-DD format');
  });

  test('Day of week calculation matches exact UTC date', () => {
    const day = DateTimeUtil.getDayOfWeek('2026-09-16'); // 2026-09-16 is a Wednesday
    assert.strictEqual(day, 'wednesday');
  });

  test('diffSeconds accurately measures duration between timestamps', () => {
    const start = new Date('2026-09-16T10:00:00Z');
    const end = new Date('2026-09-16T10:15:30Z');
    const diff = DateTimeUtil.diffSeconds(start, end);
    assert.strictEqual(diff, 930); // 15 mins * 60 + 30 secs
  });

  test('getMonthDateRange accurately computes month boundaries without generating invalid dates (e.g. 2026-09-31)', () => {
    const boundaryCases = [
      { year: 2026, month: 1, expectedLastDay: 31, expectedEndStr: '2026-01-31' },
      { year: 2026, month: 2, expectedLastDay: 28, expectedEndStr: '2026-02-28' }, // Non-leap year
      { year: 2024, month: 2, expectedLastDay: 29, expectedEndStr: '2024-02-29' }, // Leap year
      { year: 2025, month: 2, expectedLastDay: 28, expectedEndStr: '2025-02-28' }, // Non-leap year
      { year: 2026, month: 4, expectedLastDay: 30, expectedEndStr: '2026-04-30' },
      { year: 2026, month: 6, expectedLastDay: 30, expectedEndStr: '2026-06-30' },
      { year: 2026, month: 9, expectedLastDay: 30, expectedEndStr: '2026-09-30' }, // September: NEVER 2026-09-31
      { year: 2026, month: 11, expectedLastDay: 30, expectedEndStr: '2026-11-30' },
      { year: 2026, month: 12, expectedLastDay: 31, expectedEndStr: '2026-12-31' },
    ];

    for (const c of boundaryCases) {
      const range = DateTimeUtil.getMonthDateRange(c.year, c.month);
      assert.strictEqual(range.lastDay, c.expectedLastDay, `Month ${c.month} in ${c.year} must have ${c.expectedLastDay} days`);
      assert.strictEqual(range.endStr, c.expectedEndStr, `End date string must be ${c.expectedEndStr}`);
      assert.notStrictEqual(range.endStr, `${c.year}-09-31`, 'Must NEVER generate 2026-09-31');
    }
  });
});
