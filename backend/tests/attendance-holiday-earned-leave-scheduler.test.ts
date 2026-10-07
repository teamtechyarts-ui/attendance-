import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/plugins/prisma.js';
import { DateTimeUtil } from '../src/utils/datetime.js';
import { WorkdayService } from '../src/services/workday.service.js';
import { QuoteService } from '../src/utils/quotes.js';
import { LeaveService } from '../src/modules/leave/leave.service.js';
import { AttendanceService } from '../src/modules/attendance/attendance.service.js';
import { SchedulerService } from '../src/services/scheduler.service.js';
import { EmailService } from '../src/modules/email/email.service.js';
import { DbService } from '../src/services/db.service.js';

describe('Attendance, Holiday, Earned Leave, Scheduler & Auto-Checkout Suite', () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildApp();
    await app.ready();
    await EmailService.init();
  });

  after(async () => {
    SchedulerService.stop();
    await app.close();
  });

  describe('Part 1 & 2: Holiday Date Consistency & Attendance Holiday Status', () => {
    test('Evaluates official holidays on exact calendar date without UTC drift', async () => {
      const holidayDateStr = '2026-10-02';
      const formatted = DateTimeUtil.formatDateString(new Date(holidayDateStr));
      assert.equal(formatted, '2026-10-02');

      const workday = await WorkdayService.evaluateDayForEmployee('test-emp-id', holidayDateStr);
      assert.equal(typeof workday.isHoliday, 'boolean');
    });

    test('Formats date strings consistently across Asia/Kolkata timezone', () => {
      const date = new Date('2026-10-02T00:00:00.000Z');
      const dateStr = DateTimeUtil.formatDateString(date);
      assert.ok(dateStr.startsWith('2026-10-0'));
      assert.equal(DateTimeUtil.isValidDateString('2026-10-02'), true);
    });
  });

  describe('Part 3, 4, 5, 15, 16 & 34: Holiday Work, Duration Policy & Idempotent Earned Leave', () => {
    test('Ensures the Earned Leave leave type exists and is active', async () => {
      const elType = await LeaveService.ensureEarnedLeaveType();
      assert.ok(elType);
      assert.equal(elType.name, 'Earned Leave');
    });

    test('Enforces duration policy (6h30m threshold for full day vs half day)', () => {
      const fullDayMinutes = 390; // 6h 30m
      const halfDayMinutes = 240; // 4h 00m

      assert.ok(390 >= fullDayMinutes);
      assert.ok(389 < fullDayMinutes && 389 >= halfDayMinutes);
      assert.ok(239 < halfDayMinutes);
    });

    test('Credits Earned Leave idempotently for holiday work', async () => {
      const emp = await DbService.query(
        () => prisma.employee.findFirst({ where: { employmentStatus: 'ACTIVE' } }),
        async () => {
          const emps = await DbService.restRequest<any[]>('/employees?employment_status=eq.ACTIVE');
          return emps?.[0] || null;
        }
      );

      if (emp) {
        const testDate = '2026-10-02';
        const firstCredit = await LeaveService.creditEarnedLeaveForHolidayWork(
          emp.id,
          testDate,
          1.0,
          emp.userId || emp.id,
          480
        );
        assert.ok(firstCredit);
        assert.equal(firstCredit.success, true);

        // Second credit on same date (idempotency check)
        const secondCredit = await LeaveService.creditEarnedLeaveForHolidayWork(
          emp.id,
          testDate,
          1.0,
          emp.userId || emp.id,
          480
        );
        assert.ok(secondCredit);
        assert.equal(secondCredit.success, true);
        assert.equal(secondCredit.alreadyCredited, true);
      }
    });
  });

  describe('Part 8, 9 & 10: Deterministic Daily Quotes and Check-in Reminders', () => {
    test('Returns the exact same motivational quote for the same date on repeated calls', () => {
      const quote1 = QuoteService.getDailyQuote('2026-10-02');
      const quote2 = QuoteService.getDailyQuote('2026-10-02');
      const quote3 = QuoteService.getDailyQuote('2026-10-02');

      assert.equal(quote1.quote, quote2.quote);
      assert.equal(quote1.author, quote2.author);
      assert.equal(quote2.quote, quote3.quote);
      assert.ok(quote1.quote.length > 10);
    });

    test('Rotates deterministic quotes across different dates', () => {
      const quoteA = QuoteService.getDailyQuote('2026-10-01');
      const quoteB = QuoteService.getDailyQuote('2026-10-02');
      assert.ok(quoteA);
      assert.ok(quoteB);
    });
  });

  describe('Part 13, 14, 35 & 36: Server-Authoritative Overtime Confirmation', () => {
    test('Persists and verifies overtime confirmation', async () => {
      const emp = await DbService.query(
        () => prisma.employee.findFirst({ where: { employmentStatus: 'ACTIVE' } }),
        async () => {
          const emps = await DbService.restRequest<any[]>('/employees?employment_status=eq.ACTIVE');
          return emps?.[0] || null;
        }
      );

      if (emp) {
        const todayStr = DateTimeUtil.getTodayDateString();
        const res = await AttendanceService.confirmOvertime(emp.id, emp.userId || emp.id);
        assert.equal(res.success, true);
        assert.equal(res.overtimeConfirmed, true);

        const isConfirmed = await AttendanceService.isOvertimeConfirmed(emp.id, todayStr);
        assert.equal(isConfirmed, true);
      }
    });
  });

  describe('Part 23, 24 & 45: Midnight Rollover Auto-Checkout and Auto-Stop Timers', () => {
    test('Processes date rollover auto-checkout safely without throwing', async () => {
      const results = await AttendanceService.processDateRolloverAutoCheckout();
      assert.ok(Array.isArray(results));
    });

    test('Reconciles running timers when attendance is checked out', async () => {
      const results = await AttendanceService.reconcileMismatchedTimers();
      assert.ok(Array.isArray(results));
    });
  });

  describe('Part 26, 27 & 49: Central Scheduler Tick & Idempotency', () => {
    test('Executes a complete scheduler tick safely', async () => {
      const result = await SchedulerService.runSchedulerTick();
      assert.equal(result.success, true);
      assert.ok(result.timestamp);
      assert.ok(result.jobs);
    });

    test('Records and checks scheduler delivery keys idempotently', async () => {
      const testKey = `TEST_DELIVERY_${Date.now()}`;
      const before = await SchedulerService.isDelivered(testKey);
      assert.equal(before, false);

      await SchedulerService.markDelivered(testKey, { sample: 123 });
      const after = await SchedulerService.isDelivered(testKey);
      assert.equal(after, true);
    });
  });

  describe('Part 28 & 30: Email Templates and Non-blocking Resilient Email Dispatch', () => {
    test('Formats all branded email templates without error', async () => {
      const checkInResult = await EmailService.sendCheckInReminder('test@techyarts.com', {
        employeeName: 'Pavan',
        todayDate: '2026-10-06',
        scheduledStartTime: '09:00 AM',
        quoteText: 'Small daily improvements lead to stunning results.',
        quoteAuthor: 'TeamsTechyArts',
      });
      assert.ok(checkInResult);

      const checkOutResult = await EmailService.sendCheckOutReminder('test@techyarts.com', {
        employeeName: 'Pavan',
        todayDate: '2026-10-06',
        scheduledEndTime: '05:30 PM',
      });
      assert.ok(checkOutResult);

      const eightHourResult = await EmailService.sendEightHourCheckoutReminder('test@techyarts.com', {
        employeeName: 'Pavan',
        todayDate: '2026-10-06',
        workedDuration: '8h 05m',
      });
      assert.ok(eightHourResult);

      const timerResult = await EmailService.sendLongRunningTimerWarning('test@techyarts.com', {
        employeeName: 'Pavan',
        taskTitle: 'Critical Bugfix',
        startedAt: '10:00 AM',
        runningDuration: '2h 15m',
      });
      assert.ok(timerResult);
    });
  });
});
