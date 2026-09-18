# WorkOS Attendance & Server-Side Timer Gating

## 1. Attendance Lifecycle

```
[Employee Login]
       │
       ▼
[AccessMode: RESTRICTED]
(15-minute grace window active)
       │
       ├─► [User Marks Check-In via POST /api/attendance/check-in]
       │         │
       │         ▼
       │   [Record Created: status=PRESENT/LATE, checkInTime=NOW]
       │   [Session Upgraded: AccessMode='NORMAL']
       │   [Full Platform Unlocked]
       │
       │   (During the Workday)
       │   [Start Task Timers, Work on Projects, Submit Reports]
       │         │
       │         ▼
       └─► [User Marks Check-Out via POST /api/attendance/check-out]
                 │
                 ▼
           [1. Find All Active Task Timers for Employee]
           [2. Stop Active Timers & Finalize Worked Seconds]
           [3. Calculate Total Attendance Worked Minutes]
           [4. Record Attendance Check-Out Time & Status]
```

---

## 2. Attendance-Gated Access Window

- When an employee signs in, their session starts in `RESTRICTED` mode unless today's attendance has already been recorded.
- The employee has a **15-minute window** to check in.
- While in `RESTRICTED` mode, the top banner alerts the employee with a live countdown timer.
- All non-essential API endpoints reject requests with `403 Forbidden` (`attendanceRequired: true`), ensuring employees record their check-in before working on tasks.

---

## 3. Shift Timings & Late Detection

- Shift schedules are determined by the employee's assigned **Work Schedule** (or the organization default schedule).
- Each schedule defines:
  - `shiftStartTime` (e.g. `09:30`)
  - `shiftEndTime` (e.g. `18:30`)
  - `gracePeriodMinutes` (e.g. `15` minutes)
  - `breakDurationMinutes` (e.g. `60` minutes)
  - Working day flags (`monday` through `sunday`).
- If an employee checks in after `shiftStartTime + gracePeriodMinutes`, the attendance status is automatically marked as **`LATE`** while still recording the check-in time.

---

## 4. Automatic Active Timer Termination on Checkout

### The Business Rule
> **An employee must NEVER have an active task timer continuing after their attendance checkout.**

When `POST /api/attendance/check-out` is called:
1. Fastify backend opens a Prisma transaction.
2. The server queries all `task_timer_sessions` for the user where `endedAt IS NULL` (or status is `RUNNING`).
3. For each active timer session:
   - Sets `endedAt = NOW`.
   - Calculates duration = `(endedAt - startedAt) - pausedDurationSeconds`.
   - Adds duration to the parent `Task.totalWorkedSeconds`.
   - Sets `Task.status = 'PAUSED'` (or 'TODO'/'IN_PROGRESS').
4. Finalizes the attendance record with `checkOutTime = NOW` and calculates `totalWorkingMinutes`.
5. Emits audit log events for timer stops and checkout completion.
