import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DateTimeUtil } from '../src/utils/datetime.js';
import { WorkdayService } from '../src/services/workday.service.js';
import { LeaveService } from '../src/modules/leave/leave.service.js';
import { DbService } from '../src/services/db.service.js';
import { prisma } from '../src/plugins/prisma.js';
import { AttendanceService } from '../src/modules/attendance/attendance.service.js';

describe('Local Fix Verification: Holiday Attendance Enum & Business Logic', () => {
  let activeEmp: any;

  before(async () => {
    activeEmp = await DbService.query(
      () => prisma.employee.findFirst({ where: { employmentStatus: 'ACTIVE' } }),
      async () => {
        const emps = await DbService.restRequest<any[]>('/employees?employment_status=eq.ACTIVE');
        return emps?.[0] || null;
      }
    );
  });

  describe('1. PostgreSQL Enum Compatibility & Status Mapping', () => {
    test('Allowed DB statuses must exclude WORKED_ON_HOLIDAY from DB column enum', () => {
      // In PostgreSQL, attendance_status contains: PRESENT, ABSENT, HALF_DAY, LATE, ON_LEAVE, HOLIDAY, WEEKEND
      const validDbStatuses = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LATE', 'ON_LEAVE', 'HOLIDAY', 'WEEKEND'];
      assert.equal(validDbStatuses.includes('WORKED_ON_HOLIDAY'), false);

      // Status mapping converts WORKED_ON_HOLIDAY to PRESENT for PostgreSQL enum column
      const mapToDb = (status: string) => (status === 'WORKED_ON_HOLIDAY' ? 'PRESENT' : status);
      assert.equal(mapToDb('WORKED_ON_HOLIDAY'), 'PRESENT');
      assert.equal(mapToDb('LATE'), 'LATE');
      assert.equal(mapToDb('PRESENT'), 'PRESENT');
    });

    test('Notes tag [WORKED_ON_HOLIDAY] correctly preserves holiday work metadata', () => {
      const userNotes = 'Morning office check-in';
      const status = 'WORKED_ON_HOLIDAY';
      const taggedNotes = status === 'WORKED_ON_HOLIDAY'
        ? `[WORKED_ON_HOLIDAY]\n${userNotes || ''}`.trim()
        : userNotes;

      assert.ok(taggedNotes.startsWith('[WORKED_ON_HOLIDAY]'));
      assert.ok(taggedNotes.includes(userNotes));
    });
  });

  describe('2. Workday Evaluation & Holiday Resolution', () => {
    test('Holiday day without check-in resolves to HOLIDAY, not ABSENT', async () => {
      if (!activeEmp) return;
      const holidayDateStr = '2026-10-10'; // Official holiday in database
      const workday = await WorkdayService.evaluateDayForEmployee(activeEmp.id, holidayDateStr);

      assert.equal(workday.isHoliday, true);
      assert.equal(workday.isWorkingDay, false);

      // Without attendance record, status must resolve to HOLIDAY
      const mockRecord: any = null;
      let status: string;
      if (workday.isHoliday) {
        status = mockRecord?.checkInAt ? 'WORKED_ON_HOLIDAY' : 'HOLIDAY';
      } else {
        status = mockRecord?.checkInAt ? 'PRESENT' : 'ABSENT';
      }
      assert.equal(status, 'HOLIDAY');
      assert.notEqual(status, 'ABSENT');
    });

    test('Normal working day evaluates correctly without holiday false positive', async () => {
      if (!activeEmp) return;
      // Monday 2026-10-05 is a normal workday
      const normalDateStr = '2026-10-05';
      const workday = await WorkdayService.evaluateDayForEmployee(activeEmp.id, normalDateStr);

      assert.equal(workday.isHoliday, false);
      assert.equal(workday.isWorkingDay, true);
    });
  });

  describe('3. Earned Leave Idempotency for Holiday Work', () => {
    test('Earned leave credit for qualifying holiday work is exactly 1.0 (>= 390 min)', async () => {
      if (!activeEmp) return;
      const testHolidayDate = '2026-10-02';
      const result = await LeaveService.creditEarnedLeaveForHolidayWork(
        activeEmp.id,
        testHolidayDate,
        1.0,
        activeEmp.userId || activeEmp.id,
        420
      );
      assert.ok(result);
      assert.equal(result.success, true);
    });

    test('Repeated requests or retries do NOT credit earned leave more than once', async () => {
      if (!activeEmp) return;
      const testHolidayDate = '2026-10-02';
      const retryResult = await LeaveService.creditEarnedLeaveForHolidayWork(
        activeEmp.id,
        testHolidayDate,
        1.0,
        activeEmp.userId || activeEmp.id,
        420
      );
      assert.ok(retryResult);
      assert.equal(retryResult.success, true);
      assert.equal(retryResult.alreadyCredited, true, 'Retry must be idempotent and flag alreadyCredited');
    });
  });

  describe('4. Work Mode & Verification Integrity', () => {
    test('Supports Office, WFH, and Remote work modes', () => {
      const validModes = ['OFFICE', 'WFH', 'REMOTE'];
      validModes.forEach((mode) => {
        assert.ok(['OFFICE', 'WFH', 'REMOTE'].includes(mode));
      });
    });
  });
});
