import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { AttendanceService } from '../src/modules/attendance/attendance.service.js';
import { LeaveService } from '../src/modules/leave/leave.service.js';
import { ReportService } from '../src/modules/reports/report.service.js';
import { FeedbackService } from '../src/modules/feedback/feedback.service.js';
import { AuthUser } from '../src/types/index.js';
import { PERMISSION_REGISTRY } from '../src/types/rbac.js';
import { prisma } from '../src/plugins/prisma.js';
import { DbService } from '../src/services/db.service.js';

describe('Admin Data Scope & Access Control Test Suite', () => {
  let superAdminUser: AuthUser;
  let normalEmployeeUser: AuthUser;
  let testEmployeeId: string;
  let superAdminEmployeeId: string;

  before(async () => {
    // Look up real super admin and employee from database
    const [superAdmin, employee] = await Promise.all([
      DbService.query(
        async () => prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, include: { employee: true } }),
        async () => {
          const res = await DbService.restRequest<any[]>('/users?role=eq.SUPER_ADMIN&select=*,employee:employees(*)');
          return res?.[0] || null;
        }
      ),
      DbService.query(
        async () => prisma.user.findFirst({ where: { role: 'EMPLOYEE', status: 'ACTIVE' }, include: { employee: true } }),
        async () => {
          const res = await DbService.restRequest<any[]>('/users?role=eq.EMPLOYEE&status=eq.ACTIVE&select=*,employee:employees(*)');
          return res?.[0] || null;
        }
      ),
    ]);

    superAdminEmployeeId = superAdmin?.employee?.id || '5c7c1036-097d-434b-b474-5f36664da9c7';
    testEmployeeId = employee?.employee?.id || '42c5067a-7b4f-4800-83d4-8bdfe8d54eae';

    superAdminUser = {
      id: superAdmin?.id || '2be7499c-34f2-4873-a8b1-f594711a8de6',
      email: superAdmin?.email || 'teamtechyarts@gmail.com',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      employeeId: superAdminEmployeeId,
      appRole: 'SUPER_ADMIN',
      permissions: PERMISSION_REGISTRY.map((p) => p.id),
      scope: null,
    };

    normalEmployeeUser = {
      id: employee?.id || 'c651fe23-beb3-4bfb-ab5f-ae9146091d8e',
      email: employee?.email || 'pavanamirishetty2001@gmail.com',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      employeeId: testEmployeeId,
      appRole: 'EMPLOYEE',
      permissions: ['TASK_VIEW', 'LEAVE_VIEW', 'ATTENDANCE_VIEW', 'REPORT_VIEW'],
      scope: null,
    };
  });

  // A. Super Admin Attendance Scope
  describe('A. Attendance Data Scope', () => {
    test('Super Admin querying organization attendance receives all records', async () => {
      // In controller, when adminView: true and user is Super Admin, employeeId is null
      const records = await AttendanceService.getHistory({ employeeId: null });
      assert.ok(Array.isArray(records), 'Attendance records must be an array');
      assert.ok(records.length > 0, 'Organization attendance records must not be empty');
      assert.ok(records.length >= 20, `Expected multiple records, found ${records.length}`);
    });

    test('Personal Employee attendance scope returns only records for that employee', async () => {
      const records = await AttendanceService.getHistory({ employeeId: testEmployeeId });
      assert.ok(Array.isArray(records), 'Records must be an array');
      // All returned records must belong to testEmployeeId
      for (const r of records) {
        assert.strictEqual(r.employeeId || (r as any).employee_id, testEmployeeId);
      }
    });

    test('Super Admin personal attendance (employeeId = superAdminEmployeeId) returns only super admin records', async () => {
      const records = await AttendanceService.getHistory({ employeeId: superAdminEmployeeId });
      assert.ok(Array.isArray(records));
      for (const r of records) {
        assert.strictEqual(r.employeeId || (r as any).employee_id, superAdminEmployeeId);
      }
    });
  });

  // B. Super Admin Leave Scope
  describe('B. Leave Data Scope', () => {
    test('Super Admin with adminView: true receives organization leave requests', async () => {
      const result = await LeaveService.listRequests({
        adminView: true,
        user: superAdminUser,
      });
      assert.ok(result.items, 'Result must contain items');
      assert.ok(result.items.length > 0, `Expected leave requests, found ${result.items.length}`);
    });

    test('Super Admin without adminView receives only personal leave requests', async () => {
      const result = await LeaveService.listRequests({
        adminView: false,
        user: superAdminUser,
      });
      assert.ok(result.items);
      // Super admin employee has 0 personal leave requests
      assert.strictEqual(result.items.length, 0);
    });

    test('Normal employee requesting adminView: true is rejected with 403 Forbidden', async () => {
      await assert.rejects(
        async () => {
          await LeaveService.listRequests({
            adminView: true,
            user: normalEmployeeUser,
          });
        },
        (err: any) => {
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });

    test('Normal employee without adminView receives only personal leave requests', async () => {
      const result = await LeaveService.listRequests({
        adminView: false,
        user: normalEmployeeUser,
      });
      assert.ok(result.items);
      for (const item of result.items) {
        assert.strictEqual(item.employeeId || (item as any).employee_id, testEmployeeId);
      }
    });
  });

  // C. Super Admin Reports Scope
  describe('C. Reports Data Scope', () => {
    test('Super Admin with adminView: true receives organization work reports', async () => {
      const result = await ReportService.listReports({
        adminView: true,
        user: superAdminUser,
      });
      assert.ok(result.items, 'Result must contain items');
      assert.ok(result.items.length > 0, `Expected reports, found ${result.items.length}`);
    });

    test('Super Admin without adminView receives only personal reports', async () => {
      const result = await ReportService.listReports({
        adminView: false,
        user: superAdminUser,
      });
      assert.ok(result.items);
      assert.strictEqual(result.items.length, 0);
    });

    test('Normal employee requesting adminView: true on reports is rejected with 403 Forbidden', async () => {
      await assert.rejects(
        async () => {
          await ReportService.listReports({
            adminView: true,
            user: normalEmployeeUser,
          });
        },
        (err: any) => {
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });
  });

  // D. Feedback / Reviews Scope
  describe('D. Feedback / Reviews Scope', () => {
    test('Normal employee requesting adminView: true on feedback is rejected with 403 Forbidden', async () => {
      await assert.rejects(
        async () => {
          await FeedbackService.listFeedback({
            adminView: true,
            user: normalEmployeeUser,
          });
        },
        (err: any) => {
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });

    test('Super Admin with adminView: true can list organization feedback', async () => {
      const result = await FeedbackService.listFeedback({
        adminView: true,
        user: superAdminUser,
      });
      assert.ok(Array.isArray(result.items));
    });
  });
});
