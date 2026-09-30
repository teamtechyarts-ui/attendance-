import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { AttendanceService } from '../src/modules/attendance/attendance.service.js';
import { DateTimeUtil } from '../src/utils/datetime.js';
import { attendanceHistoryQuerySchema } from '../src/validation/index.js';
import { DbService } from '../src/services/db.service.js';
import { prisma } from '../src/plugins/prisma.js';

describe('Attendance Date/Month/Year Filtering & Validation Test Suite', () => {
  let pavanEmployeeId: string | null = null;
  let pavanDisplayName: string = 'Pavan Amirishetty';

  before(async () => {
    const allRecords = await AttendanceService.getHistory();
    const pavanRecord = allRecords.find((r: any) => {
      const name = r.employee?.displayName || r.employee?.first_name || '';
      return name.toLowerCase().includes('pavan');
    });
    if (pavanRecord) {
      pavanEmployeeId = pavanRecord.employeeId;
      pavanDisplayName = pavanRecord.employee?.displayName || 'Pavan Amirishetty';
    }
  });

  // 1. Validation tests
  describe('Date Input Validation', () => {
    test('Accepts valid dates', () => {
      assert.strictEqual(DateTimeUtil.isValidDateString('2026-09-19'), true);
      assert.strictEqual(DateTimeUtil.isValidDateString('2026-09-30'), true);
      assert.strictEqual(DateTimeUtil.isValidDateString('2026-01-01'), true);
      assert.strictEqual(DateTimeUtil.isValidDateString('2026-12-31'), true);
    });

    test('Rejects invalid dates (e.g. Sept 31, Feb 30, Month 13, Day 00)', () => {
      assert.strictEqual(DateTimeUtil.isValidDateString('2026-09-31'), false);
      assert.strictEqual(DateTimeUtil.isValidDateString('2026-02-30'), false);
      assert.strictEqual(DateTimeUtil.isValidDateString('2026-13-01'), false);
      assert.strictEqual(DateTimeUtil.isValidDateString('2026-00-10'), false);
      assert.strictEqual(DateTimeUtil.isValidDateString('2026-01-00'), false);
      assert.strictEqual(DateTimeUtil.isValidDateString('invalid-date'), false);
    });

    test('Leap year handling for February', () => {
      assert.strictEqual(DateTimeUtil.isLeapYear(2024), true);
      assert.strictEqual(DateTimeUtil.getDaysInMonth(2024, 2), 29);
      assert.strictEqual(DateTimeUtil.isValidDateString('2024-02-29'), true);

      assert.strictEqual(DateTimeUtil.isLeapYear(2025), false);
      assert.strictEqual(DateTimeUtil.getDaysInMonth(2025, 2), 28);
      assert.strictEqual(DateTimeUtil.isValidDateString('2025-02-29'), false);

      assert.strictEqual(DateTimeUtil.isLeapYear(2026), false);
      assert.strictEqual(DateTimeUtil.getDaysInMonth(2026, 2), 28);
      assert.strictEqual(DateTimeUtil.isValidDateString('2026-02-29'), false);

      assert.strictEqual(DateTimeUtil.isLeapYear(2028), true);
      assert.strictEqual(DateTimeUtil.getDaysInMonth(2028, 2), 29);
      assert.strictEqual(DateTimeUtil.isValidDateString('2028-02-29'), true);
    });

    test('Schema validation blocks invalid query dates', () => {
      assert.throws(() => {
        attendanceHistoryQuerySchema.parse({ date: '2026-09-31' });
      });
      assert.throws(() => {
        attendanceHistoryQuerySchema.parse({ date: '2026-02-30' });
      });
      assert.throws(() => {
        attendanceHistoryQuerySchema.parse({ date: '2026-13-01' });
      });
      assert.throws(() => {
        attendanceHistoryQuerySchema.parse({ month: 13 });
      });
      assert.throws(() => {
        attendanceHistoryQuerySchema.parse({ month: 0 });
      });
    });
  });

  // 2. Database Filter Queries
  describe('Database Attendance Filtering Combinations', () => {
    test('1. All Employees + All Dates', async () => {
      const records = await AttendanceService.getHistory();
      assert.ok(Array.isArray(records));
      assert.ok(records.length > 0, 'Should return attendance records');
      console.log(`[Test 1] All Employees + All Dates count: ${records.length}`);
    });

    test('2. All Employees + Specific Date (2026-09-19)', async () => {
      const records = await AttendanceService.getHistory({ date: '2026-09-19' });
      assert.ok(Array.isArray(records));
      for (const r of records) {
        const dStr = r.attendanceDate instanceof Date ? r.attendanceDate.toISOString().slice(0, 10) : String(r.attendanceDate).slice(0, 10);
        assert.strictEqual(dStr, '2026-09-19');
      }
      console.log(`[Test 2] All Employees + Specific Date (2026-09-19) count: ${records.length}`);
    });

    test('2b. All Employees + Specific Date (2026-09-18)', async () => {
      const records = await AttendanceService.getHistory({ date: '2026-09-18' });
      assert.ok(Array.isArray(records));
      for (const r of records) {
        const dStr = r.attendanceDate instanceof Date ? r.attendanceDate.toISOString().slice(0, 10) : String(r.attendanceDate).slice(0, 10);
        assert.strictEqual(dStr, '2026-09-18');
      }
      console.log(`[Test 2b] All Employees + Specific Date (2026-09-18) count: ${records.length}`);
    });

    test('3. All Employees + Month (September 2026)', async () => {
      const records = await AttendanceService.getHistory({ year: 2026, month: 9 });
      assert.ok(Array.isArray(records));
      assert.ok(records.length >= 2, 'Should include records from both Sept 18 and Sept 19');
      for (const r of records) {
        const d = new Date(r.attendanceDate);
        assert.strictEqual(d.getUTCFullYear(), 2026);
        assert.strictEqual(d.getUTCMonth(), 8); // 8 is 0-indexed September
      }
      console.log(`[Test 3] All Employees + Month (Sept 2026) count: ${records.length}`);
    });

    test('4. All Employees + Year (2026)', async () => {
      const records = await AttendanceService.getHistory({ year: 2026 });
      assert.ok(Array.isArray(records));
      for (const r of records) {
        const d = new Date(r.attendanceDate);
        assert.strictEqual(d.getUTCFullYear(), 2026);
      }
      console.log(`[Test 4] All Employees + Year (2026) count: ${records.length}`);
    });

    test('5. Specific Employee + All Dates', async () => {
      assert.ok(pavanEmployeeId, 'Pavan employee record required');
      const records = await AttendanceService.getHistory({ employeeId: pavanEmployeeId });
      assert.ok(Array.isArray(records));
      for (const r of records) {
        assert.strictEqual(r.employeeId, pavanEmployeeId);
      }
      console.log(`[Test 5] Specific Employee (${pavanDisplayName}) + All Dates count: ${records.length}`);
    });

    test('6. Specific Employee + Specific Date (Pavan + 2026-09-18)', async () => {
      assert.ok(pavanEmployeeId, 'Pavan employee record required');
      const records = await AttendanceService.getHistory({
        employeeId: pavanEmployeeId,
        date: '2026-09-18',
      });
      assert.ok(Array.isArray(records));
      for (const r of records) {
        assert.strictEqual(r.employeeId, pavanEmployeeId);
        const dStr = r.attendanceDate instanceof Date ? r.attendanceDate.toISOString().slice(0, 10) : String(r.attendanceDate).slice(0, 10);
        assert.strictEqual(dStr, '2026-09-18');
      }
      console.log(`[Test 6] Specific Employee + 2026-09-18 count: ${records.length}`);
    });

    test('7. Specific Employee + Month (Pavan + September 2026)', async () => {
      assert.ok(pavanEmployeeId, 'Pavan employee record required');
      const records = await AttendanceService.getHistory({
        employeeId: pavanEmployeeId,
        year: 2026,
        month: 9,
      });
      assert.ok(Array.isArray(records));
      for (const r of records) {
        assert.strictEqual(r.employeeId, pavanEmployeeId);
        const d = new Date(r.attendanceDate);
        assert.strictEqual(d.getUTCFullYear(), 2026);
        assert.strictEqual(d.getUTCMonth(), 8);
      }
      console.log(`[Test 7] Specific Employee + Sept 2026 count: ${records.length}`);
    });

    test('8. Specific Employee + Year (Pavan + 2026)', async () => {
      assert.ok(pavanEmployeeId, 'Pavan employee record required');
      const records = await AttendanceService.getHistory({
        employeeId: pavanEmployeeId,
        year: 2026,
      });
      assert.ok(Array.isArray(records));
      for (const r of records) {
        assert.strictEqual(r.employeeId, pavanEmployeeId);
        const d = new Date(r.attendanceDate);
        assert.strictEqual(d.getUTCFullYear(), 2026);
      }
      console.log(`[Test 8] Specific Employee + Year 2026 count: ${records.length}`);
    });
  });
});
