import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { RbacService } from '../src/services/rbac.service.js';
import { PERMISSION_REGISTRY, Permission } from '../src/types/rbac.js';
import { EmployeeService } from '../src/modules/employees/employee.service.js';
import { AuthUser } from '../src/types/index.js';
import { prisma } from '../src/plugins/prisma.js';
import { DbService } from '../src/services/db.service.js';

describe('RBAC (Role-Based Access Control) Authorization Test Suite', () => {
  let superAdminUser: AuthUser;
  let normalEmployeeUser: AuthUser;
  let testEmployeeId = '00000000-0000-0000-0000-000000000002';
  let testUserId = '00000000-0000-0000-0000-000000000003';

  before(async () => {
    let superAdminId = '00000000-0000-0000-0000-000000000001';
    let superAdminEmail = 'admin@teamstechyarts.com';

    try {
      const superAdminInDb = await DbService.query(
        async () => prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, include: { employee: true } }),
        async () => {
          const res = await DbService.restRequest<any[]>('/users?role=eq.SUPER_ADMIN&select=*,employee:employees(*)');
          return res?.[0] || null;
        }
      );

      if (superAdminInDb) {
        superAdminId = superAdminInDb.id;
        superAdminEmail = superAdminInDb.email;
      }

      const existingEmployees = await DbService.query(
        async () => prisma.employee.findMany({
          where: { user: { role: { not: 'SUPER_ADMIN' } } },
          include: { user: true, department: true },
          take: 2,
        }),
        async () => DbService.restRequest<any[]>('/employees?limit=2&select=*,user:users(*),department:departments(*)')
      );

      if (existingEmployees && existingEmployees.length > 0) {
        const firstEmp = existingEmployees.find((e: any) => e.user?.role !== 'SUPER_ADMIN') || existingEmployees[0];
        testEmployeeId = firstEmp.id;
        testUserId = firstEmp.userId || (firstEmp as any).user_id || testUserId;
      }
    } catch {
      // In offline / unit test mode, fallback to test IDs
    }

    superAdminUser = {
      id: superAdminId,
      email: superAdminEmail,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      appRole: 'SUPER_ADMIN',
      permissions: PERMISSION_REGISTRY.map((p) => p.id),
      scope: null,
    };

    normalEmployeeUser = {
      id: testUserId,
      email: 'pavan@teamstechyarts.com',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      employeeId: testEmployeeId,
      appRole: 'EMPLOYEE',
      permissions: [...RbacService.BASELINE_EMPLOYEE_PERMISSIONS],
      scope: null,
    };
  });

  // 1. Master Permissions Registry
  describe('1. Master Permissions Registry', () => {
    test('Registry contains all standardized permissions', () => {
      const permIds = PERMISSION_REGISTRY.map((p) => p.id);
      assert.ok(permIds.length >= 25, 'Registry must contain comprehensive permissions');

      // Verify core categories
      assert.ok(permIds.includes('TASK_CREATE'));
      assert.ok(permIds.includes('TASK_ASSIGN'));
      assert.ok(permIds.includes('PROJECT_CREATE'));
      assert.ok(permIds.includes('TEAM_MEMBER_ADD'));
      assert.ok(permIds.includes('WORK_VIEW'));
      assert.ok(permIds.includes('REPORT_VIEW'));
      assert.ok(permIds.includes('EMPLOYEE_CREATE'));
      assert.ok(permIds.includes('ATTENDANCE_VIEW'));
      assert.ok(permIds.includes('ATTENDANCE_MANAGE'));
      assert.ok(permIds.includes('LEAVE_VIEW'));
      assert.ok(permIds.includes('LEAVE_MANAGE'));
      assert.ok(permIds.includes('SETTINGS_MANAGE'));
      assert.ok(permIds.includes('ROLE_ASSIGN'));
      assert.ok(permIds.includes('AUDIT_VIEW'));
    });
  });

  // 2. Super Admin Privileges & Immutability
  describe('2. Super Admin Authorization & Protection', () => {
    test('Super Admin has universal permission access', () => {
      for (const p of PERMISSION_REGISTRY) {
        assert.strictEqual(
          RbacService.hasPermission(superAdminUser, p.id),
          true,
          `Super Admin should have permission: ${p.id}`
        );
      }
    });

    test('Super Admin bypasses all scope restrictions', async () => {
      assert.strictEqual(await RbacService.hasScopeAccess(superAdminUser, { projectId: 'non-existent-proj' }), true);
      assert.strictEqual(await RbacService.hasScopeAccess(superAdminUser, { departmentId: 'non-existent-dept' }), true);
      assert.strictEqual(await RbacService.hasScopeAccess(superAdminUser, { employeeId: 'any-emp-id' }), true);
    });

    test('Super Admin cannot be modified or downgraded via Limited Admin endpoints', async () => {
      // Find super admin record in DB
      const superAdminInDb = await DbService.query(
        async () => prisma.user.findFirst({
          where: { role: 'SUPER_ADMIN' },
          include: { employee: true },
        }),
        async () => {
          const res = await DbService.restRequest<any[]>('/users?role=eq.SUPER_ADMIN&select=*,employee:employees(*)');
          return res?.[0] || null;
        }
      );

      if (superAdminInDb && superAdminInDb.employee) {
        await assert.rejects(
          async () => {
            await RbacService.grantLimitedAdmin(
              superAdminUser.id,
              superAdminInDb.employee!.id,
              ['TASK_CREATE']
            );
          },
          (err: any) => {
            assert.strictEqual(err.statusCode, 400);
            assert.match(err.message, /Super Admin/i);
            return true;
          }
        );
      }
    });
  });

  // 3. Limited Admin Granting, Permissions & Revocation
  describe('3. Limited Admin Access Management', () => {
    test('Super Admin can grant Limited Admin access with specific permissions while preserving EMPLOYEE persona', async () => {
      const config = await RbacService.grantLimitedAdmin(
        superAdminUser.id,
        testEmployeeId,
        ['TASK_CREATE', 'TASK_ASSIGN', 'PROJECT_CREATE', 'TEAM_MEMBER_ADD'],
        { projects: ['proj-alpha-123'] },
        { ipAddress: '127.0.0.1' }
      );

      assert.strictEqual(config.role, 'LIMITED_ADMIN');
      assert.strictEqual(config.permissions.length, 4);
      assert.deepStrictEqual(config.scope.projects, ['proj-alpha-123']);

      // Verify user.role in DB remains EMPLOYEE
      const dbUser = await DbService.query(
        async () => prisma.user.findUnique({ where: { id: testUserId } }),
        async () => {
          const res = await DbService.restRequest<any[]>(`/users?id=eq.${testUserId}`);
          return res?.[0] || null;
        }
      );
      assert.strictEqual(dbUser?.role, 'EMPLOYEE', 'User database role must remain EMPLOYEE');

      // Verify authorization resolution returns baseline + granted permissions
      const auth = await RbacService.getUserAuthorization(testUserId);
      assert.strictEqual(auth.appRole, 'LIMITED_ADMIN');
      // Baseline permissions preserved
      assert.ok(auth.permissions.includes('TASK_VIEW'));
      assert.ok(auth.permissions.includes('ATTENDANCE_VIEW'));
      assert.ok(auth.permissions.includes('LEAVE_VIEW'));
      assert.ok(auth.permissions.includes('REPORT_VIEW'));
      // Granted permissions added
      assert.ok(auth.permissions.includes('TASK_CREATE'));
      assert.ok(auth.permissions.includes('TASK_ASSIGN'));
      assert.ok(auth.permissions.includes('PROJECT_CREATE'));
      assert.ok(auth.permissions.includes('TEAM_MEMBER_ADD'));
      // Ungranted permissions disallowed
      assert.strictEqual(auth.permissions.includes('ROLE_ASSIGN'), false);
      assert.strictEqual(auth.permissions.includes('ATTENDANCE_MANAGE'), false);
    });

    test('Limited Admin with scoped permissions enforces boundary checks and preserves self-service', async () => {
      const auth = await RbacService.getUserAuthorization(testUserId);
      const limitedAdminUser: AuthUser = {
        id: testUserId,
        email: 'test@example.com',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        employeeId: testEmployeeId,
        appRole: auth.appRole,
        permissions: auth.permissions,
        scope: auth.scope,
      };

      // Self-service access ALWAYS permitted
      assert.strictEqual(await RbacService.hasScopeAccess(limitedAdminUser, { employeeId: testEmployeeId }), true);

      // Allowed project
      assert.strictEqual(await RbacService.hasScopeAccess(limitedAdminUser, { projectId: 'proj-alpha-123' }), true);

      // Disallowed project
      assert.strictEqual(await RbacService.hasScopeAccess(limitedAdminUser, { projectId: 'proj-beta-999' }), false);
    });

    test('Super Admin can revoke Limited Admin access, returning user to standard Employee role', async () => {
      const revoked = await RbacService.revokeLimitedAdmin(
        superAdminUser.id,
        testEmployeeId,
        { ipAddress: '127.0.0.1' }
      );

      assert.strictEqual(revoked.success, true);

      // Verify authorization resolution returns standard EMPLOYEE role with baseline permissions
      const auth = await RbacService.getUserAuthorization(testUserId);
      assert.strictEqual(auth.appRole, 'EMPLOYEE');
      assert.ok(auth.permissions.includes('TASK_VIEW'));
      assert.ok(auth.permissions.includes('ATTENDANCE_VIEW'));
      assert.strictEqual(auth.permissions.includes('TASK_ASSIGN'), false);
      assert.strictEqual(auth.permissions.includes('PROJECT_CREATE'), false);

      // Verify user in database remains EMPLOYEE
      const dbUser = await DbService.query(
        async () => prisma.user.findUnique({ where: { id: testUserId } }),
        async () => {
          const res = await DbService.restRequest<any[]>(`/users?id=eq.${testUserId}`);
          return res?.[0] || null;
        }
      );
      assert.strictEqual(dbUser?.role, 'EMPLOYEE');
    });

    test('Action-Level Permission: Limited Admin without TASK_DELETE is blocked with 403 Forbidden', async () => {
      const userWithoutDelete: AuthUser = {
        id: testUserId,
        email: 'pavan@teamstechyarts.com',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        employeeId: testEmployeeId,
        appRole: 'LIMITED_ADMIN',
        permissions: ['TASK_VIEW', 'TASK_CREATE', 'TASK_ASSIGN', 'PROJECT_CREATE'],
        scope: null,
      };

      // Verify RbacService permission checks
      assert.strictEqual(RbacService.hasPermission(userWithoutDelete, 'TASK_CREATE'), true);
      assert.strictEqual(RbacService.hasPermission(userWithoutDelete, 'TASK_DELETE'), false);
      assert.strictEqual(RbacService.hasPermission(userWithoutDelete, 'ATTENDANCE_MANAGE'), false);
    });

    test('Single Account Model: Limited Admin retains normal employee baseline operations', async () => {
      const auth = await RbacService.getUserAuthorization(testUserId);
      // All baseline employee operations remain present
      for (const p of RbacService.BASELINE_EMPLOYEE_PERMISSIONS) {
        assert.ok(
          auth.permissions.includes(p),
          `Baseline employee permission ${p} must remain available`
        );
      }
    });
  });

  // 4. Safe Sequential Employee Code Generation
  describe('4. Employee ID Generation & Conflict Prevention', () => {
    test('generateNextEmployeeCode produces safe sequential EMPxxx format higher than all existing', async () => {
      const nextCode = await EmployeeService.generateNextEmployeeCode();
      assert.match(nextCode, /^EMP\d{3,}$/);

      // Fetch all existing employee codes
      const existing = await DbService.query(
        async () => prisma.employee.findMany({ select: { employeeCode: true } }),
        async () => DbService.restRequest<any[]>('/employees?select=employee_code')
      );
      for (const emp of existing || []) {
        const code = emp.employeeCode || emp.employee_code;
        if (code) {
          assert.notStrictEqual(
            nextCode,
            code,
            `Generated code ${nextCode} must not collide with existing ${code}`
          );
        }
      }
    });
  });

  // 5. Limited Admin Assignable Employees Scoping & Selection
  describe('5. Limited Admin Assignable Employees Scoping & Selection', () => {
    test('listAssignableEmployees returns only active employees and excludes Super Admin for limited admins', async () => {
      const limitedAdminUser: AuthUser = {
        id: testUserId,
        email: 'pavan@teamstechyarts.com',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        employeeId: testEmployeeId,
        appRole: 'LIMITED_ADMIN',
        permissions: ['PROJECT_CREATE', 'TASK_ASSIGN', 'TASK_CREATE'],
        scope: null,
      };

      const assignable = await EmployeeService.listAssignableEmployees(limitedAdminUser);
      assert.ok(Array.isArray(assignable), 'Assignable employees must be returned as an array');
      for (const emp of assignable) {
        assert.notStrictEqual(emp.employmentStatus, 'TERMINATED');
        assert.notStrictEqual(emp.employmentStatus, 'RESIGNED');
        if (emp.user) {
          assert.notStrictEqual(emp.user.status, 'INACTIVE');
          assert.notStrictEqual(emp.user.role, 'SUPER_ADMIN', 'Super Admin accounts must be excluded from assignable list');
        }
      }
    });
  });

  // 6. Strict Separation: Employee View (Personal Context) vs Limited Admin View (Administrative Context)
  describe('6. Employee View vs Limited Admin View Context Separation', () => {
    test('Employee View: Limited Admin in Employee View receives strictly own personal tasks', async () => {
      const limitedAdminUser: AuthUser = {
        id: testUserId,
        email: 'pavan@teamstechyarts.com',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        employeeId: testEmployeeId,
        appRole: 'LIMITED_ADMIN',
        permissions: ['TASK_CREATE', 'TASK_ASSIGN', 'TASK_VIEW', 'PROJECT_CREATE'],
        scope: null,
      };

      // When calling listTasks without adminView: true (Employee View)
      const personalTasks = await TaskService.listTasks({
        user: limitedAdminUser,
        adminView: false,
      });

      assert.ok(Array.isArray(personalTasks.items), 'Must return items array');
      for (const task of personalTasks.items) {
        assert.strictEqual(
          task.employeeId,
          testEmployeeId,
          'All tasks in Employee View must belong strictly to the authenticated employee'
        );
      }
    });

    test('Admin View: Limited Admin with TASK_ASSIGN can query administrative tasks when adminView is true', async () => {
      const limitedAdminUser: AuthUser = {
        id: testUserId,
        email: 'pavan@teamstechyarts.com',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        employeeId: testEmployeeId,
        appRole: 'LIMITED_ADMIN',
        permissions: ['TASK_CREATE', 'TASK_ASSIGN'],
        scope: null,
      };

      const adminTasks = await TaskService.listTasks({
        user: limitedAdminUser,
        adminView: true,
      });

      assert.ok(Array.isArray(adminTasks.items), 'Must return items array in Admin View');
    });

    test('Admin View: Limited Admin without task permissions is rejected with 403', async () => {
      const limitedAdminWithoutTaskPerm: AuthUser = {
        id: testUserId,
        email: 'pavan@teamstechyarts.com',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        employeeId: testEmployeeId,
        appRole: 'LIMITED_ADMIN',
        permissions: ['PROJECT_CREATE'],
        scope: null,
      };

      await assert.rejects(
        async () => {
          await TaskService.listTasks({
            user: limitedAdminWithoutTaskPerm,
            adminView: true,
          });
        },
        (err: any) => {
          return err.statusCode === 403;
        }
      );
    });

    test('Employee View: Projects list in personal context includes only projects where employee is a participant', async () => {
      const limitedAdminUser: AuthUser = {
        id: testUserId,
        email: 'pavan@teamstechyarts.com',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        employeeId: testEmployeeId,
        appRole: 'LIMITED_ADMIN',
        permissions: ['PROJECT_CREATE', 'PROJECT_VIEW'],
        scope: null,
      };

      const personalProjects = await ProjectService.listProjects(limitedAdminUser, {
        adminView: false,
      });

      for (const proj of personalProjects) {
        const isPart =
          proj.createdBy === limitedAdminUser.id ||
          proj.employeeId === limitedAdminUser.employeeId ||
          proj.members?.some((m) => m.employeeId === limitedAdminUser.employeeId);
        assert.ok(isPart, 'Projects in personal view must be projects the employee participates in');
      }
    });
  });
});

