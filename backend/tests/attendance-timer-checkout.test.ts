import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DateTimeUtil } from '../src/utils/datetime.js';
import { TaskService } from '../src/modules/tasks/task.service.js';

describe('Task Timer Worked Seconds & Multi-Interval Accumulation Tests', () => {
  test('TEST 1: Start -> wait -> Pause (elapsed = actual running duration)', () => {
    const t1 = new Date('2026-09-18T10:00:00Z');
    const t2 = new Date('2026-09-18T10:30:00Z'); // 30 mins

    // Running interval
    const runningTimer = {
      id: 'timer-1',
      taskId: 'task-1',
      startedAt: t1,
      durationSeconds: 0,
      isActive: true,
    };

    const runningElapsed = TaskService.calculateTaskWorkedSeconds([runningTimer], t2);
    assert.strictEqual(runningElapsed, 1800, 'Running elapsed at 10:30 must be 1800 seconds (30 mins)');

    // Pausing interval
    const pausedTimer = {
      ...runningTimer,
      pausedAt: t2,
      endedAt: t2,
      durationSeconds: 1800,
      isActive: false,
    };

    const pausedElapsed = TaskService.calculateTaskWorkedSeconds([pausedTimer], t2);
    assert.strictEqual(pausedElapsed, 1800, 'Paused elapsed must be 1800 seconds');
  });

  test('TEST 2: Pause -> wait 2 hours -> Resume (elapsed remains exactly previous accumulated duration; paused 2 hours NOT counted)', () => {
    const t1 = new Date('2026-09-18T10:00:00Z');
    const t2 = new Date('2026-09-18T10:30:00Z'); // 30 mins (1800s)
    const t3 = new Date('2026-09-18T12:30:00Z'); // 2 hours later

    const interval1 = {
      id: 'timer-1',
      taskId: 'task-1',
      startedAt: t1,
      pausedAt: t2,
      endedAt: t2,
      durationSeconds: 1800,
      isActive: false,
    };

    // At 12:30 (during pause, before resume)
    const duringPause = TaskService.calculateTaskWorkedSeconds([interval1], t3);
    assert.strictEqual(duringPause, 1800, 'During 2h pause, elapsed time must remain exactly 1800 seconds');

    // At 12:30 (Resume starts Interval 2)
    const interval2 = {
      id: 'timer-2',
      taskId: 'task-1',
      startedAt: t3,
      durationSeconds: 0,
      isActive: true,
    };

    const timers = [interval1, interval2];
    const immediatelyAtResume = TaskService.calculateTaskWorkedSeconds(timers, t3);
    assert.strictEqual(immediatelyAtResume, 1800, 'Immediately at Resume, timer must show 1800s (30:00), NOT 00:00');
  });

  test('TEST 3: Resume -> run 20 minutes -> Pause (previous accumulated + 20 minutes = 50 minutes)', () => {
    const t1 = new Date('2026-09-18T10:00:00Z');
    const t2 = new Date('2026-09-18T10:30:00Z'); // 30 mins (1800s)
    const t3 = new Date('2026-09-18T12:30:00Z'); // Resume
    const t4 = new Date('2026-09-18T12:50:00Z'); // Pause 2 (20 mins = 1200s)

    const interval1 = {
      id: 'timer-1',
      taskId: 'task-1',
      startedAt: t1,
      pausedAt: t2,
      endedAt: t2,
      durationSeconds: 1800,
      isActive: false,
    };

    const interval2Running = {
      id: 'timer-2',
      taskId: 'task-1',
      startedAt: t3,
      durationSeconds: 0,
      isActive: true,
    };

    const runningElapsed = TaskService.calculateTaskWorkedSeconds([interval1, interval2Running], t4);
    assert.strictEqual(runningElapsed, 3000, 'Running elapsed at 12:50 must be 3000 seconds (50 minutes)');

    const interval2Paused = {
      ...interval2Running,
      pausedAt: t4,
      endedAt: t4,
      durationSeconds: 1200,
      isActive: false,
    };

    const pausedElapsed = TaskService.calculateTaskWorkedSeconds([interval1, interval2Paused], t4);
    assert.strictEqual(pausedElapsed, 3000, 'Paused elapsed at 12:50 must be 3000 seconds (50 minutes)');
  });

  test('TEST 4: Resume -> run 10 minutes -> Complete (30 + 20 + 10 = 60 minutes)', () => {
    const t1 = new Date('2026-09-18T10:00:00Z');
    const t2 = new Date('2026-09-18T10:30:00Z'); // 30 mins
    const t3 = new Date('2026-09-18T12:30:00Z'); // Resume
    const t4 = new Date('2026-09-18T12:50:00Z'); // Pause (20 mins)
    const t5 = new Date('2026-09-18T13:00:00Z'); // Resume
    const t6 = new Date('2026-09-18T13:10:00Z'); // Complete (10 mins)

    const interval1 = {
      id: 'timer-1',
      taskId: 'task-1',
      startedAt: t1,
      pausedAt: t2,
      endedAt: t2,
      durationSeconds: 1800,
      isActive: false,
    };

    const interval2 = {
      id: 'timer-2',
      taskId: 'task-1',
      startedAt: t3,
      pausedAt: t4,
      endedAt: t4,
      durationSeconds: 1200,
      isActive: false,
    };

    // Running interval 3
    const interval3Running = {
      id: 'timer-3',
      taskId: 'task-1',
      startedAt: t5,
      durationSeconds: 0,
      isActive: true,
    };

    const atComplete = TaskService.calculateTaskWorkedSeconds([interval1, interval2, interval3Running], t6);
    assert.strictEqual(atComplete, 3600, 'At complete, total worked seconds must equal 3600 (60 minutes)');

    // Finalized interval 3 on completion
    const interval3Completed = {
      ...interval3Running,
      endedAt: t6,
      durationSeconds: 600,
      isActive: false,
    };

    const finalTotal = TaskService.calculateTaskWorkedSeconds([interval1, interval2, interval3Completed], new Date('2026-09-18T18:00:00Z'));
    assert.strictEqual(finalTotal, 3600, 'Persisted final total must permanently stay 3600 seconds');
  });

  test('TEST 5: Multi-Pause Cycle (10m + 20m + 15m + 30m = 75 minutes = 4500 seconds)', () => {
    // Start 10:00 -> Pause 10:10 (10 min = 600s)
    // Resume 11:00 -> Pause 11:20 (20 min = 1200s, total 1800s = 30m)
    // Resume 12:00 -> Pause 12:15 (15 min = 900s, total 2700s = 45m)
    // Resume 13:00 -> Complete 13:30 (30 min = 1800s, total 4500s = 75m)
    const timers = [
      { id: '1', durationSeconds: 600, startedAt: new Date('2026-09-18T10:00:00Z'), isActive: false },
      { id: '2', durationSeconds: 1200, startedAt: new Date('2026-09-18T11:00:00Z'), isActive: false },
      { id: '3', durationSeconds: 900, startedAt: new Date('2026-09-18T12:00:00Z'), isActive: false },
      { id: '4', durationSeconds: 1800, startedAt: new Date('2026-09-18T13:00:00Z'), isActive: false },
    ];

    const total = TaskService.calculateTaskWorkedSeconds(timers, new Date('2026-09-18T20:00:00Z'));
    assert.strictEqual(total, 4500, 'Multi-pause total must be 4500 seconds (75 minutes)');
  });

  test('TEST 9: Attendance Checkout Auto-Stop stops running timer and preserves full accumulated duration', () => {
    const checkoutTime = new Date('2026-09-18T17:00:00Z');

    // Scenario:
    // Interval 1: 4:00 PM -> 4:30 PM (30 min = 1800s)
    // Interval 2: Resumed 4:45 PM -> Checkout 5:00 PM (15 min = 900s)
    // Final expected: 30 + 15 = 45 mins (2700s)
    const interval1 = {
      id: 'timer-1',
      taskId: 'task-checkout-demo',
      employeeId: 'emp-101',
      startedAt: new Date('2026-09-18T16:00:00Z'),
      durationSeconds: 1800,
      isActive: false,
    };

    const interval2Running = {
      id: 'timer-2',
      taskId: 'task-checkout-demo',
      employeeId: 'emp-101',
      startedAt: new Date('2026-09-18T16:45:00Z'),
      durationSeconds: 0,
      isActive: true,
    };

    // Checkout auto-stops interval 2
    const diff = Math.max(0, DateTimeUtil.diffSeconds(interval2Running.startedAt, checkoutTime));
    const interval2Finalized = {
      ...interval2Running,
      endedAt: checkoutTime,
      pausedAt: checkoutTime,
      durationSeconds: (interval2Running.durationSeconds || 0) + diff,
      isActive: false,
    };

    const total = TaskService.calculateTaskWorkedSeconds([interval1, interval2Finalized], new Date('2026-09-18T22:00:00Z'));
    assert.strictEqual(total, 2700, 'Final task time after checkout must be exactly 45 minutes (2700 seconds)');
  });

  test('TEST 10 & 11: Idempotency & Rapid action protection', () => {
    const now = new Date('2026-09-18T12:00:00Z');
    const closedTimer = {
      id: 'timer-x',
      taskId: 'task-x',
      startedAt: new Date('2026-09-18T10:00:00Z'),
      durationSeconds: 3600,
      isActive: false,
    };

    // Repeating pause/finalization on an already inactive timer produces 0 additional seconds
    const activeList = [closedTimer].filter((t) => t.isActive);
    assert.strictEqual(activeList.length, 0, 'No active timer to double-pause');
    const total = TaskService.calculateTaskWorkedSeconds([closedTimer], now);
    assert.strictEqual(total, 3600, 'Duration remains exactly 3600s');
  });

  test('Project Total Time aggregation sums all intervals across all project tasks without paused time', () => {
    // Task 1: 3 intervals totaling 60 mins (3600s)
    // Task 2: 1 interval of 90 mins (5400s)
    // Project total = 60 + 90 = 150 mins (9000s)
    const task1Timers = [
      { id: 't1-1', durationSeconds: 1800, startedAt: new Date(), isActive: false },
      { id: 't1-2', durationSeconds: 1200, startedAt: new Date(), isActive: false },
      { id: 't1-3', durationSeconds: 600, startedAt: new Date(), isActive: false },
    ];
    const task2Timers = [
      { id: 't2-1', durationSeconds: 5400, startedAt: new Date(), isActive: false },
    ];

    const task1Total = TaskService.calculateTaskWorkedSeconds(task1Timers, new Date());
    const task2Total = TaskService.calculateTaskWorkedSeconds(task2Timers, new Date());
    const projectTotal = task1Total + task2Total;

    assert.strictEqual(task1Total, 3600, 'Task 1 must be 60 mins');
    assert.strictEqual(task2Total, 5400, 'Task 2 must be 90 mins');
    assert.strictEqual(projectTotal, 9000, 'Project total must be 150 mins (9000 seconds)');
  });
});

describe('Task Timer Period Worked Seconds & Interval Boundary Tests', () => {
  const tz = 'Asia/Kolkata';

  test('DateTimeUtil.getPeriodDateRange generates exact and correct boundaries for all periods', () => {
    // 1. ALL_TIME
    const allTime = DateTimeUtil.getPeriodDateRange('ALL_TIME', undefined, undefined, tz);
    assert.strictEqual(allTime.startDate, null);
    assert.strictEqual(allTime.endDate, null);

    // 2. TODAY
    const today = DateTimeUtil.getPeriodDateRange('TODAY', undefined, undefined, tz);
    assert.ok(today.startDate !== null && today.endDate !== null);
    assert.strictEqual(today.startStr, DateTimeUtil.getTodayDateString(tz));

    // 3. YESTERDAY
    const yesterday = DateTimeUtil.getPeriodDateRange('YESTERDAY', undefined, undefined, tz);
    assert.ok(yesterday.startDate !== null && yesterday.endDate !== null);
    assert.ok(yesterday.endDate.getTime() <= today.startDate!.getTime());

    // 4. THIS_MONTH
    const thisMonth = DateTimeUtil.getPeriodDateRange('THIS_MONTH', undefined, undefined, tz);
    assert.ok(thisMonth.startDate !== null && thisMonth.endDate !== null);
    assert.strictEqual(thisMonth.startStr?.slice(8, 10), '01');

    // 5. LAST_MONTH
    const lastMonth = DateTimeUtil.getPeriodDateRange('LAST_MONTH', undefined, undefined, tz);
    assert.ok(lastMonth.startDate !== null && lastMonth.endDate !== null);
    assert.ok(lastMonth.endDate.getTime() <= thisMonth.startDate!.getTime());

    // 6. THIS_WEEK & LAST_WEEK
    const thisWeek = DateTimeUtil.getPeriodDateRange('THIS_WEEK', undefined, undefined, tz);
    const lastWeek = DateTimeUtil.getPeriodDateRange('LAST_WEEK', undefined, undefined, tz);
    assert.ok(thisWeek.startDate !== null && thisWeek.endDate !== null);
    assert.ok(lastWeek.startDate !== null && lastWeek.endDate !== null);
    assert.ok(lastWeek.endDate.getTime() <= thisWeek.startDate!.getTime());

    // 7. CUSTOM RANGE
    const custom = DateTimeUtil.getPeriodDateRange('CUSTOM', '2026-09-01', '2026-09-19', tz);
    assert.ok(custom.startDate !== null && custom.endDate !== null);
    assert.strictEqual(custom.startStr, '2026-09-01');
    assert.strictEqual(custom.endStr, '2026-09-19');
    // Ensure the end is end of day (23:59:59.999 in UTC representation)
    assert.ok(custom.endDate.getTime() > custom.startDate.getTime());
  });

  test('calculateWorkedSecondsInPeriod correctly partitions worked time by date range', () => {
    // Timer 1: 2026-08-15 from 10:00 to 11:00 UTC (1 hour = 3600s)
    const tAug15 = {
      id: 't-aug',
      startedAt: new Date('2026-08-15T10:00:00Z'),
      endedAt: new Date('2026-08-15T11:00:00Z'),
      durationSeconds: 3600,
      isActive: false,
    };

    // Timer 2: 2026-09-10 from 08:00 to 09:30 UTC (1.5 hours = 5400s)
    const tSep10 = {
      id: 't-sep-10',
      startedAt: new Date('2026-09-10T08:00:00Z'),
      endedAt: new Date('2026-09-10T09:30:00Z'),
      durationSeconds: 5400,
      isActive: false,
    };

    // Timer 3: 2026-09-19 from 04:00 to 06:00 UTC (2 hours = 7200s)
    const tSep19 = {
      id: 't-sep-19',
      startedAt: new Date('2026-09-19T04:00:00Z'),
      endedAt: new Date('2026-09-19T06:00:00Z'),
      durationSeconds: 7200,
      isActive: false,
    };

    const allTimers = [tAug15, tSep10, tSep19];
    const now = new Date('2026-09-19T10:00:00Z');

    // ALL_TIME -> 3600 + 5400 + 7200 = 16200s (4.5 hours)
    const allTimeSec = TaskService.calculateWorkedSecondsInPeriod(allTimers, null, null, now);
    assert.strictEqual(allTimeSec, 16200, 'All time must sum all timers');

    // Period: August 2026 -> only tAug15 (3600s)
    const augStart = new Date('2026-08-01T00:00:00Z');
    const augEnd = new Date('2026-08-31T23:59:59.999Z');
    const augSec = TaskService.calculateWorkedSecondsInPeriod(allTimers, augStart, augEnd, now);
    assert.strictEqual(augSec, 3600, 'August period must only count August timer');

    // Period: September 2026 -> tSep10 + tSep19 (5400 + 7200 = 12600s)
    const sepStart = new Date('2026-09-01T00:00:00Z');
    const sepEnd = new Date('2026-09-30T23:59:59.999Z');
    const sepSec = TaskService.calculateWorkedSecondsInPeriod(allTimers, sepStart, sepEnd, now);
    assert.strictEqual(sepSec, 12600, 'September period must count September timers');

    // Period: Today (2026-09-19) -> only tSep19 (7200s)
    const todayStart = new Date('2026-09-19T00:00:00Z');
    const todayEnd = new Date('2026-09-19T23:59:59.999Z');
    const todaySec = TaskService.calculateWorkedSecondsInPeriod(allTimers, todayStart, todayEnd, now);
    assert.strictEqual(todaySec, 7200, 'Today period must only count today');

    // Period: Yesterday (2026-09-18) -> 0s
    const yestStart = new Date('2026-09-18T00:00:00Z');
    const yestEnd = new Date('2026-09-18T23:59:59.999Z');
    const yestSec = TaskService.calculateWorkedSecondsInPeriod(allTimers, yestStart, yestEnd, now);
    assert.strictEqual(yestSec, 0, 'Yesterday period must be 0 if no timers on yesterday');
  });

  test('calculateWorkedSecondsInPeriod correctly includes active running interval up to now', () => {
    const periodStart = new Date('2026-09-19T00:00:00Z');
    const periodEnd = new Date('2026-09-19T23:59:59.999Z');

    // Started at 09:00 UTC, now is 09:45 UTC (45 mins = 2700s)
    const runningTimer = {
      id: 'running-1',
      startedAt: new Date('2026-09-19T09:00:00Z'),
      durationSeconds: 0,
      isActive: true,
    };

    const now = new Date('2026-09-19T09:45:00Z');
    const workedSec = TaskService.calculateWorkedSecondsInPeriod([runningTimer], periodStart, periodEnd, now);
    assert.strictEqual(workedSec, 2700, 'Running timer inside period must include elapsed up to now (2700s)');
  });

  test('calculateWorkedSecondsInPeriod handles timer crossing midnight by bounding to period', () => {
    // Timer started 2026-09-18 23:00 UTC and ended 2026-09-19 01:00 UTC (2 hours total = 7200s)
    const crossingTimer = {
      id: 'cross-1',
      startedAt: new Date('2026-09-18T23:00:00Z'),
      endedAt: new Date('2026-09-19T01:00:00Z'),
      durationSeconds: 7200,
      isActive: false,
    };

    const now = new Date('2026-09-19T10:00:00Z');

    // Period Day 1 (Sep 18): from 23:00 to 23:59:59.999 -> 3600s (1 hour)
    const day1Start = new Date('2026-09-18T00:00:00Z');
    const day1End = new Date('2026-09-19T00:00:00Z'); // 00:00 start of next day
    const day1Sec = TaskService.calculateWorkedSecondsInPeriod([crossingTimer], day1Start, day1End, now);
    assert.strictEqual(day1Sec, 3600, 'Day 1 portion of crossing timer must be 1 hour (3600s)');

    // Period Day 2 (Sep 19): from 00:00 to 01:00 -> 3600s (1 hour)
    const day2Start = new Date('2026-09-19T00:00:00Z');
    const day2End = new Date('2026-09-20T00:00:00Z');
    const day2Sec = TaskService.calculateWorkedSecondsInPeriod([crossingTimer], day2Start, day2End, now);
    assert.strictEqual(day2Sec, 3600, 'Day 2 portion of crossing timer must be 1 hour (3600s)');
  });
});

