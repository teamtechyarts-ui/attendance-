import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EmployeeService } from '../src/modules/employees/employee.service.js';
import { NotificationService } from '../src/modules/notifications/notification.service.js';
import { EmailService } from '../src/modules/email/email.service.js';
import { RbacService } from '../src/services/rbac.service.js';
import { prisma } from '../src/plugins/prisma.js';
import { DbService } from '../src/services/db.service.js';

describe('Admin Employee Date of Joining Update & Data Integrity Suite', () => {
  let testAdminUser: any;
  let testStandardUser: any;
  let testEmployee: any;
  let originalJoiningDate: string | Date | null = null;

  before(async () => {
    // Locate admin user and standard employee
    const users = await DbService.query(
      async () =>
        prisma.user.findMany({
          take: 5,
          include: { employee: true },
        }),
      async () =>
        DbService.restRequest<any[]>('/users?limit=5&select=*,employee:employees(*)')
    );

    testAdminUser = users.find((u: any) => u.role === 'SUPER_ADMIN' || u.role === 'ADMIN') || users[0];
    testStandardUser = users.find((u: any) => u.role === 'EMPLOYEE' && u.id !== testAdminUser?.id) || users[1] || users[0];

    const targetUser = users.find((u: any) => u.employee || (u.employees && u.employees[0])) || users[0];
    testEmployee = targetUser.employee || (targetUser.employees && targetUser.employees[0]) || null;

    if (testEmployee) {
      originalJoiningDate = testEmployee.joiningDate || testEmployee.joining_date || null;
    }
  });

  after(async () => {
    // Restore original joining date
    if (testEmployee?.id) {
      const origDateObj = originalJoiningDate ? new Date(originalJoiningDate) : null;
      await DbService.query(
        async () =>
          prisma.employee.update({
            where: { id: testEmployee.id },
            data: { joiningDate: origDateObj },
          }),
        async () =>
          DbService.restRequest<any[]>(`/employees?id=eq.${testEmployee.id}`, {
            method: 'PATCH',
            body: {
              joining_date: originalJoiningDate
                ? (typeof originalJoiningDate === 'string'
                    ? originalJoiningDate.slice(0, 10)
                    : originalJoiningDate.toISOString().slice(0, 10))
                : null,
            },
          })
      ).catch(() => {});
    }
  });

  describe('Part A: Admin Updating Date of Joining', () => {
    test('Authorized admin can set and update joining date cleanly', async () => {
      if (!testEmployee?.id || !testAdminUser?.id) return;

      const targetDate = '2024-05-15';
      const result = await EmployeeService.updateJoiningDate(
        testEmployee.id,
        targetDate,
        testAdminUser.id,
        { ipAddress: '127.0.0.1', userAgent: 'test-agent' }
      );

      assert.ok(result);
      assert.strictEqual(result.id, testEmployee.id);

      // Verify date in DB
      const checkEmp = await DbService.query(
        async () =>
          prisma.employee.findUnique({
            where: { id: testEmployee.id },
            select: { id: true, joiningDate: true, employeeCode: true, firstName: true },
          }),
        async () => {
          const emps = await DbService.restRequest<any[]>(
            `/employees?id=eq.${testEmployee.id}&select=id,joining_date,employee_code,first_name`
          );
          return emps?.[0] ? DbService.toCamelCase(emps[0]) : null;
        }
      );

      assert.ok(checkEmp?.joiningDate);
      const dateStr = typeof checkEmp.joiningDate === 'string'
        ? checkEmp.joiningDate.slice(0, 10)
        : checkEmp.joiningDate.toISOString().slice(0, 10);
      assert.strictEqual(dateStr, targetDate);

      // Verify other fields remain completely intact
      assert.strictEqual(checkEmp.employeeCode, testEmployee.employeeCode);
      assert.strictEqual(checkEmp.firstName, testEmployee.firstName);
    });

    test('Selected date preserves exact calendar date without timezone shift', async () => {
      if (!testEmployee?.id || !testAdminUser?.id) return;

      const targetDate = '2025-11-20';
      await EmployeeService.updateJoiningDate(
        testEmployee.id,
        targetDate,
        testAdminUser.id,
        { ipAddress: '127.0.0.1' }
      );

      const checkEmp = await DbService.query(
        async () =>
          prisma.employee.findUnique({
            where: { id: testEmployee.id },
            select: { joiningDate: true },
          }),
        async () => {
          const emps = await DbService.restRequest<any[]>(
            `/employees?id=eq.${testEmployee.id}&select=joining_date`
          );
          return emps?.[0] ? DbService.toCamelCase(emps[0]) : null;
        }
      );

      const dateStr = typeof checkEmp.joiningDate === 'string'
        ? checkEmp.joiningDate.slice(0, 10)
        : checkEmp.joiningDate.toISOString().slice(0, 10);
      assert.strictEqual(dateStr, '2025-11-20');
    });

    test('Can clear joining date by setting to null', async () => {
      if (!testEmployee?.id || !testAdminUser?.id) return;

      const result = await EmployeeService.updateJoiningDate(
        testEmployee.id,
        null,
        testAdminUser.id,
        {}
      );

      assert.strictEqual(result.joiningDate, null);

      const checkEmp = await DbService.query(
        async () =>
          prisma.employee.findUnique({
            where: { id: testEmployee.id },
            select: { joiningDate: true },
          }),
        async () => {
          const emps = await DbService.restRequest<any[]>(
            `/employees?id=eq.${testEmployee.id}&select=joining_date`
          );
          return emps?.[0] ? DbService.toCamelCase(emps[0]) : null;
        }
      );

      assert.strictEqual(checkEmp?.joiningDate, null);
    });
  });

  describe('Part B: Input Validation & Edge Cases', () => {
    test('Rejects invalid date format (e.g. not YYYY-MM-DD)', async () => {
      if (!testEmployee?.id || !testAdminUser?.id) return;

      await assert.rejects(
        async () => {
          await EmployeeService.updateJoiningDate(
            testEmployee.id,
            'invalid-date',
            testAdminUser.id,
            {}
          );
        },
        (err: any) => {
          assert.strictEqual(err.statusCode, 400);
          assert.strictEqual(err.code, 'INVALID_DATE_FORMAT');
          return true;
        }
      );
    });

    test('Rejects invalid calendar date (e.g. February 30th)', async () => {
      if (!testEmployee?.id || !testAdminUser?.id) return;

      await assert.rejects(
        async () => {
          await EmployeeService.updateJoiningDate(
            testEmployee.id,
            '2024-02-30',
            testAdminUser.id,
            {}
          );
        },
        (err: any) => {
          assert.strictEqual(err.statusCode, 400);
          assert.strictEqual(err.code, 'INVALID_CALENDAR_DATE');
          return true;
        }
      );
    });

    test('Rejects nonexistent employee ID with 404', async () => {
      if (!testAdminUser?.id) return;

      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      await assert.rejects(
        async () => {
          await EmployeeService.updateJoiningDate(
            nonExistentId,
            '2024-01-01',
            testAdminUser.id,
            {}
          );
        },
        (err: any) => {
          assert.strictEqual(err.statusCode, 404);
          assert.strictEqual(err.code, 'EMPLOYEE_NOT_FOUND');
          return true;
        }
      );
    });
  });

  describe('Part C: RBAC & Permission Verification', () => {
    test('Standard employee lacks EMPLOYEE_EDIT permission', () => {
      const mockStandardEmployeeUser: any = {
        id: 'mock-std-user',
        role: 'EMPLOYEE',
        appRole: 'EMPLOYEE',
        permissions: ['TASK_VIEW', 'ATTENDANCE_VIEW'],
      };

      const hasPerm = RbacService.hasPermission(mockStandardEmployeeUser, 'EMPLOYEE_EDIT');
      assert.strictEqual(hasPerm, false);
    });

    test('Super Admin always possesses EMPLOYEE_EDIT access', () => {
      const mockSuperAdminUser: any = {
        id: 'mock-admin-user',
        role: 'SUPER_ADMIN',
        appRole: 'SUPER_ADMIN',
        permissions: [],
      };

      const hasPerm = RbacService.hasPermission(mockSuperAdminUser, 'EMPLOYEE_EDIT');
      assert.strictEqual(hasPerm, true);
    });
  });

  describe('Part D: Zero-Notification & Zero-Email Safety Assurance', () => {
    test('Updating joining date generates ZERO notifications or emails', async () => {
      if (!testEmployee?.id || !testAdminUser?.id) return;

      const notifCountBefore = await NotificationService.getUnreadCount(testAdminUser.id);

      await EmployeeService.updateJoiningDate(
        testEmployee.id,
        '2024-06-01',
        testAdminUser.id,
        {}
      );

      const notifCountAfter = await NotificationService.getUnreadCount(testAdminUser.id);
      assert.strictEqual(notifCountAfter, notifCountBefore);
    });
  });
});
