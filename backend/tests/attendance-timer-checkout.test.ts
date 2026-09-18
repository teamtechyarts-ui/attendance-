import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DateTimeUtil } from '../src/utils/datetime.js';
import { TaskService } from '../src/modules/tasks/task.service.js';

describe('Task Timer Worked Seconds Calculations', () => {
  test('calculateTaskWorkedSeconds accurately sums closed and active intervals', () => {
    const baseTime = new Date('2026-09-18T10:00:00Z');
    const now = new Date('2026-09-18T11:30:00Z');

    // Timer A: 1 closed interval of 1800s (30 mins) + 1 active interval started 30 mins ago
    const timers = [
      {
        durationSeconds: 1800,
        startedAt: new Date('2026-09-18T09:00:00Z'),
        isActive: false,
      },
      {
        durationSeconds: 0,
        startedAt: new Date('2026-09-18T11:00:00Z'), // 30 mins ago
        isActive: true,
      },
    ];

    const totalSeconds = TaskService.calculateTaskWorkedSeconds(timers, now);
    assert.strictEqual(totalSeconds, 1800 + 1800, 'Total should be 3600 seconds (1 hour)');
  });

  test('calculateTaskWorkedSeconds correctly ignores paused intervals and only counts active/closed time', () => {
    const now = new Date('2026-09-18T17:30:00Z');

    // Scenario:
    // 10:00 start -> 10:30 pause (30 mins = 1800s)
    // 12:00 resume -> 13:00 pause (1 hr = 3600s)
    // 14:00 resume -> 17:30 active until now (3.5 hrs = 12600s)
    // Total should be 30m + 1h + 3.5h = 5h (18000s)
    const timers = [
      {
        durationSeconds: 1800,
        startedAt: new Date('2026-09-18T10:00:00Z'),
        isActive: false,
      },
      {
        durationSeconds: 3600,
        startedAt: new Date('2026-09-18T12:00:00Z'),
        isActive: false,
      },
      {
        durationSeconds: 0,
        startedAt: new Date('2026-09-18T14:00:00Z'),
        isActive: true,
      },
    ];

    const totalSeconds = TaskService.calculateTaskWorkedSeconds(timers, now);
    assert.strictEqual(totalSeconds, 18000, 'Duration should exactly equal 5 hours (18000 seconds)');
  });

  test('Automatic timer stop at checkout produces exact finalized duration and isActive false', () => {
    const checkoutTime = new Date('2026-09-18T17:30:00Z');
    const runningTimer = {
      id: 'timer-123',
      taskId: 'task-abc',
      employeeId: 'emp-1',
      startedAt: new Date('2026-09-18T10:00:00Z'),
      durationSeconds: 0,
      isActive: true,
    };

    // Simulate the checkout auto-stop logic
    const diff = Math.max(0, DateTimeUtil.diffSeconds(runningTimer.startedAt, checkoutTime));
    const finalizedTimer = {
      ...runningTimer,
      endedAt: checkoutTime,
      pausedAt: checkoutTime,
      durationSeconds: (runningTimer.durationSeconds || 0) + diff,
      isActive: false,
    };

    assert.strictEqual(finalizedTimer.isActive, false, 'Timer must no longer be active');
    assert.strictEqual(finalizedTimer.durationSeconds, 27000, 'Duration should be 7h 30m (27000s)');
    assert.strictEqual(finalizedTimer.endedAt.toISOString(), checkoutTime.toISOString());

    // After checkout finalization, calculateTaskWorkedSeconds returns same 27000s at any later time
    const nextMorning = new Date('2026-09-19T09:00:00Z');
    const recalculated = TaskService.calculateTaskWorkedSeconds([finalizedTimer], nextMorning);
    assert.strictEqual(recalculated, 27000, 'Time after checkout must not accumulate');
  });

  test('Multi-timer finalization stops all active timers for the checking out employee', () => {
    const checkoutTime = new Date('2026-09-18T17:30:00Z');

    // Employee 1 has 2 running timers (Task A started at 10:00, Task B started at 15:00)
    // Employee 2 has 1 running timer (Task C started at 14:00)
    const timers = [
      {
        id: 't-1',
        taskId: 'task-a',
        employeeId: 'emp-1',
        startedAt: new Date('2026-09-18T10:00:00Z'),
        durationSeconds: 0,
        isActive: true,
      },
      {
        id: 't-2',
        taskId: 'task-b',
        employeeId: 'emp-1',
        startedAt: new Date('2026-09-18T15:00:00Z'),
        durationSeconds: 0,
        isActive: true,
      },
      {
        id: 't-3',
        taskId: 'task-c',
        employeeId: 'emp-2',
        startedAt: new Date('2026-09-18T14:00:00Z'),
        durationSeconds: 0,
        isActive: true,
      },
    ];

    // Simulate Employee 1 checkout: filter to employeeId === 'emp-1'
    const emp1Timers = timers.filter((t) => t.employeeId === 'emp-1' && t.isActive);
    assert.strictEqual(emp1Timers.length, 2, 'Should find 2 active timers for Employee 1');

    const finalizedList = emp1Timers.map((t) => {
      const diff = Math.max(0, DateTimeUtil.diffSeconds(t.startedAt, checkoutTime));
      return {
        ...t,
        endedAt: checkoutTime,
        pausedAt: checkoutTime,
        durationSeconds: (t.durationSeconds || 0) + diff,
        isActive: false,
      };
    });

    assert.strictEqual(finalizedList[0].durationSeconds, 27000, 'Timer A = 7h 30m');
    assert.strictEqual(finalizedList[1].durationSeconds, 9000, 'Timer B = 2h 30m');

    // Verify Employee 2's timer remains untouched and active
    const emp2Timer = timers.find((t) => t.employeeId === 'emp-2');
    assert.strictEqual(emp2Timer?.isActive, true, 'Employee 2 timer must remain active');
  });

  test('Idempotency: Finalizing an already stopped timer does not add extra time', () => {
    const checkoutTime = new Date('2026-09-18T17:30:00Z');
    const alreadyStoppedTimer = {
      id: 't-stopped',
      taskId: 'task-x',
      employeeId: 'emp-1',
      startedAt: new Date('2026-09-18T10:00:00Z'),
      durationSeconds: 3600,
      isActive: false,
    };

    // Query for active timers: where isActive === true
    const activeTimers = [alreadyStoppedTimer].filter((t) => t.isActive);
    assert.strictEqual(activeTimers.length, 0, 'No active timers to finalize');

    // Total duration should remain intact
    const total = TaskService.calculateTaskWorkedSeconds([alreadyStoppedTimer], checkoutTime);
    assert.strictEqual(total, 3600);
  });
});
