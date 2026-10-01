import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { AttendanceService } from '../src/modules/attendance/attendance.service.js';
import { CalendarService } from '../src/modules/calendar/calendar.service.js';
import { WorkdayService } from '../src/services/workday.service.js';
import { DateTimeUtil } from '../src/utils/datetime.js';
import { DbService } from '../src/services/db.service.js';
import { prisma } from '../src/plugins/prisma.js';

describe('Date & Attendance Non-Future / Holiday Shift Test Suite', () => {
  const todayStr = DateTimeUtil.getTodayDateString();
  const [currYearStr, currMonthStr] = todayStr.split('-');
  const currYear = parseInt(currYearStr, 10);
  const currMonth = parseInt(currMonthStr, 10);

  let testAdminUser: any;
  let testEmployeeId: string;

  before(async () => {
    // Resolve an active employee and admin user
    const emps = await DbService.query(
      () => prisma.employee.findMany({ where: { employmentStatus: 'ACTIVE' }, include: { user: true } }),
      () => DbService.restRequest<any[]>('/employees?employment_status=eq.ACTIVE&select=*,user:users(*)')
    );

    assert.ok(emps.length > 0, 'Must have at least 1 active employee');
    testEmployeeId = emps[0].id;
    testAdminUser = {
      id: emps[0].userId || emps[0].user_id,
      email: emps[0].email,
      role: 'SUPER_ADMIN',
      employeeId: emps[0].id,
    };
  });

  describe('Part 1 & 2: Current Month Attendance stops at business today', () => {
    test('Current month history returns records <= todayStr and NO future dates', async () => {
      const result = await AttendanceService.getHistory({
        employeeId: testEmployeeId,
        year: currYear,
        month: currMonth,
      });

      assert.ok(Array.isArray(result.records), 'Should return records array');
      assert.ok(result.records.length > 0, 'Current month should have at least 1 day up to today');

      for (const rec of result.records) {
        assert.ok(rec.attendanceDate <= todayStr, `Record date ${rec.attendanceDate} must be <= today ${todayStr}`);
        assert.notStrictEqual(rec.status, 'UPCOMING', `Status must never be UPCOMING for ${rec.attendanceDate}`);
      }

      console.log(`[PASS] Current month attendance records returned: ${result.records.length} (Max date: ${result.records[0]?.attendanceDate}, Today: ${todayStr})`);
    });

    test('Super Admin view for current month returns records <= todayStr', async () => {
      const result = await AttendanceService.getHistory({
        adminView: true,
        year: currYear,
        month: currMonth,
      });

      assert.ok(Array.isArray(result.records));
      for (const rec of result.records) {
        assert.ok(rec.attendanceDate <= todayStr, `Admin record date ${rec.attendanceDate} must be <= today ${todayStr}`);
        assert.notStrictEqual(rec.status, 'UPCOMING', `Admin status must never be UPCOMING`);
      }

      console.log(`[PASS] Admin view current month records: ${result.records.length} (All dates <= ${todayStr})`);
    });
  });

  describe('Part 2: Past and Future Month Behavior', () => {
    test('Past completed month returns complete historical month', async () => {
      const pastMonth = currMonth === 1 ? 12 : currMonth - 1;
      const pastYear = currMonth === 1 ? currYear - 1 : currYear;
      const expectedDays = DateTimeUtil.getDaysInMonth(pastYear, pastMonth);

      const result = await AttendanceService.getHistory({
        employeeId: testEmployeeId,
        year: pastYear,
        month: pastMonth,
      });

      assert.ok(Array.isArray(result.records));
      assert.strictEqual(result.records.length, expectedDays, `Past month should return all ${expectedDays} calendar days`);

      for (const rec of result.records) {
        assert.notStrictEqual(rec.status, 'UPCOMING', 'Past month records must never be UPCOMING');
      }

      console.log(`[PASS] Past month (${pastYear}-${pastMonth}) returned full ${result.records.length} days`);
    });

    test('Future month returns empty records array and zero summary', async () => {
      const futureMonth = currMonth === 12 ? 1 : currMonth + 1;
      const futureYear = currMonth === 12 ? currYear + 1 : currYear;

      const result = await AttendanceService.getHistory({
        employeeId: testEmployeeId,
        year: futureYear,
        month: futureMonth,
      });

      assert.ok(Array.isArray(result.records));
      assert.strictEqual(result.records.length, 0, 'Future month should return 0 records');
      assert.strictEqual(result.summary.totalDays, 0, 'Future month totalDays summary should be 0');
      assert.strictEqual(result.summary.workingDays, 0, 'Future month workingDays summary should be 0');

      console.log(`[PASS] Future month (${futureYear}-${futureMonth}) returned 0 records and 0 summary`);
    });

    test('Future specific date returns empty records', async () => {
      const result = await AttendanceService.getHistory({
        employeeId: testEmployeeId,
        date: '2029-10-01',
      });

      assert.strictEqual(result.records.length, 0, 'Future date should return 0 records');
    });
  });

  describe('Part 5 to 13: Holiday Creation and Exact Date-Only Preservation', () => {
    const testCases = [
      { date: '2026-11-10', name: 'Test Holiday Nov 10' },
      { date: '2026-11-01', name: 'Test Holiday Nov 1' },
      { date: '2026-11-30', name: 'Test Holiday Nov 30' },
      { date: '2027-01-01', name: 'Test Holiday Jan 1' },
      { date: '2026-12-31', name: 'Test Holiday Dec 31' },
    ];

    for (const tc of testCases) {
      test(`Holiday created for ${tc.date} preserves exact date ${tc.date}`, async () => {
        const created = await CalendarService.createEvent(
          {
            title: tc.name,
            eventType: 'HOLIDAY',
            visibility: 'EVERYONE',
            startAt: `${tc.date}T00:00:00.000Z`,
            endAt: `${tc.date}T23:59:59.999Z`,
            allDay: true,
          },
          testAdminUser
        );

        assert.ok(created?.id, 'Holiday event should be created');

        // Verify WorkdayService evaluation recognizes this holiday on EXACT date
        const evalResult = await WorkdayService.evaluateDayForEmployee(testEmployeeId, tc.date);
        assert.strictEqual(evalResult.isHoliday, true, `WorkdayService must recognize ${tc.date} as HOLIDAY`);
        assert.strictEqual(evalResult.holidayName, tc.name, `Holiday name must match on ${tc.date}`);

        // Verify adjacent days are NOT recognized as holiday
        const prevDay = DateTimeUtil.formatDateString(new Date(new Date(tc.date).getTime() - 86400000));
        const nextDay = DateTimeUtil.formatDateString(new Date(new Date(tc.date).getTime() + 86400000));

        const prevEval = await WorkdayService.evaluateDayForEmployee(testEmployeeId, prevDay);
        assert.strictEqual(prevEval.isHoliday, false, `Previous day ${prevDay} must NOT be a holiday`);

        const nextEval = await WorkdayService.evaluateDayForEmployee(testEmployeeId, nextDay);
        assert.strictEqual(nextEval.isHoliday, false, `Next day ${nextDay} must NOT be a holiday`);

        // Clean up created test holiday
        await CalendarService.deleteEvent(created.id, testAdminUser);

        console.log(`[PASS] Holiday ${tc.date} evaluated accurately without 1-day shift`);
      });
    }
  });

  describe('Part 17: Performance Benchmark', () => {
    test('Attendance history executes in < 1 second', async () => {
      const startTime = Date.now();
      await AttendanceService.getHistory({
        adminView: true,
        year: currYear,
        month: currMonth,
      });
      const elapsedMs = Date.now() - startTime;
      assert.ok(elapsedMs < 1000, `getHistory took ${elapsedMs}ms, should be < 1000ms`);
      console.log(`[PASS] Attendance history execution time: ${elapsedMs}ms (< 1000ms target)`);
    });
  });
});
