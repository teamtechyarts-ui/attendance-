import { prisma } from '../plugins/prisma.js';
import { DbService } from './db.service.js';
import { AuditService } from './audit.service.js';
import { NotificationService } from '../modules/notifications/notification.service.js';
import { invalidateUserAuthSessions } from '../middleware/auth.js';
import {
  AppRole,
  Permission,
  AdminScope,
  LimitedAdminConfig,
  PERMISSION_REGISTRY,
  AuthUser,
} from '../types/index.js';

export class RbacService {
  private static readonly SETTING_PREFIX = 'rbac_limited_admin:';
  private static readonly authzCache = new Map<string, { data: any; cachedAt: number }>();
  private static readonly AUTHZ_CACHE_TTL_MS = 30_000; // 30 seconds

  public static invalidateUserAuthzCache(userId?: string) {
    if (userId) {
      RbacService.authzCache.delete(userId);
    } else {
      RbacService.authzCache.clear();
    }
  }

  public static readonly BASELINE_EMPLOYEE_PERMISSIONS: Permission[] = [
    'TASK_VIEW',
    'TASK_CREATE',
    'PROJECT_VIEW',
    'TEAM_VIEW',
    'WORK_VIEW',
    'REPORT_VIEW',
    'LEAVE_VIEW',
    'ATTENDANCE_VIEW',
  ];

  /**
   * Return master permissions registry grouped by domain with standardized key & category
   */
  public static getPermissionsRegistry() {
    return PERMISSION_REGISTRY.map((p) => ({
      id: p.id,
      key: p.id,
      label: p.label,
      group: p.group,
      category: p.group.toUpperCase(),
      description: p.description,
      isSensitive: p.isSensitive || false,
    }));
  }

  /**
   * Resolves effective authorization (AppRole, granted permissions, scoped access boundaries)
   */
  public static async getUserAuthorization(userId: string): Promise<{
    appRole: AppRole;
    permissions: Permission[];
    scope: AdminScope | null;
    config?: LimitedAdminConfig | null;
  }> {
    const now = Date.now();
    const cached = RbacService.authzCache.get(userId);
    if (cached && (now - cached.cachedAt) < RbacService.AUTHZ_CACHE_TTL_MS) {
      return cached.data;
    }

    const authz = await DbService.query(
      async () => {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, role: true, status: true },
        });

        if (!user || user.status !== 'ACTIVE') {
          return {
            appRole: 'EMPLOYEE',
            permissions: [],
            scope: null,
            config: null,
          };
        }

        // 1. Super Admin has unrestricted permissions and universal scope
        if (user.role === 'SUPER_ADMIN') {
          return {
            appRole: 'SUPER_ADMIN',
            permissions: PERMISSION_REGISTRY.map((p) => p.id),
            scope: null,
            config: null,
          };
        }

        // 2. Check for explicit Limited Admin configuration
        const setting = await prisma.systemSetting.findUnique({
          where: { settingKey: `${RbacService.SETTING_PREFIX}${userId}` },
        });

        if (setting && setting.settingValue) {
          const rawVal = setting.settingValue;
          const config = (typeof rawVal === 'string' ? JSON.parse(rawVal) : rawVal) as LimitedAdminConfig;
          if (config && Array.isArray(config.permissions)) {
            const effectivePermissions = Array.from(
              new Set([...RbacService.BASELINE_EMPLOYEE_PERMISSIONS, ...config.permissions])
            ) as Permission[];
            return {
              appRole: 'LIMITED_ADMIN',
              permissions: effectivePermissions,
              scope: config.scope || null,
              config,
            };
          }
        }

        // 3. Normal Employee baseline
        return {
          appRole: 'EMPLOYEE',
          permissions: [...RbacService.BASELINE_EMPLOYEE_PERMISSIONS],
          scope: null,
          config: null,
        };
      },
      async () => {
        // Fallback REST path
        const users = await DbService.restRequest<any[]>(`/users?id=eq.${userId}&select=id,role,status`);
        const user = users?.[0];
        if (!user || user.status !== 'ACTIVE') {
          return { appRole: 'EMPLOYEE', permissions: [], scope: null, config: null };
        }

        if (user.role === 'SUPER_ADMIN') {
          return {
            appRole: 'SUPER_ADMIN',
            permissions: PERMISSION_REGISTRY.map((p) => p.id),
            scope: null,
            config: null,
          };
        }

        const settings = await DbService.restRequest<any[]>(
          `/system_settings?setting_key=eq.${encodeURIComponent(`${RbacService.SETTING_PREFIX}${userId}`)}`
        );
        const rawVal = settings?.[0]?.settingValue ?? settings?.[0]?.setting_value;
        if (rawVal) {
          const config = (typeof rawVal === 'string' ? JSON.parse(rawVal) : rawVal) as LimitedAdminConfig;
          if (config && Array.isArray(config.permissions)) {
            const effectivePermissions = Array.from(
              new Set([...RbacService.BASELINE_EMPLOYEE_PERMISSIONS, ...config.permissions])
            ) as Permission[];
            return {
              appRole: 'LIMITED_ADMIN',
              permissions: effectivePermissions,
              scope: config.scope || null,
              config,
            };
          }
        }

        return {
          appRole: 'EMPLOYEE',
          permissions: [...RbacService.BASELINE_EMPLOYEE_PERMISSIONS],
          scope: null,
          config: null,
        };
      }
    );

    const result = authz as {
      appRole: AppRole;
      permissions: Permission[];
      scope: AdminScope | null;
      config?: LimitedAdminConfig | null;
    };
    RbacService.authzCache.set(userId, { data: result, cachedAt: Date.now() });
    return result;
  }

  /**
   * Check whether an authenticated user has a specific permission
   */
  public static hasPermission(user: AuthUser | undefined | null, permission: Permission): boolean {
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN' || user.appRole === 'SUPER_ADMIN') return true;
    if (!user.permissions || user.permissions.length === 0) return false;
    return user.permissions.includes(permission);
  }

  /**
   * Check object-level scope access for an entity (project, employee, department)
   */
  public static async hasScopeAccess(
    user: AuthUser,
    target: {
      projectId?: string | null;
      employeeId?: string | null;
      departmentId?: string | null;
    }
  ): Promise<boolean> {
    if (user.role === 'SUPER_ADMIN' || user.appRole === 'SUPER_ADMIN') {
      return true;
    }

    // Self-service access to own employee record / actions is ALWAYS permitted
    if (target.employeeId && target.employeeId === user.employeeId) {
      return true;
    }

    if (user.appRole !== 'LIMITED_ADMIN') {
      // Normal employee: can only access own employee profile and assigned projects
      if (target.employeeId && target.employeeId !== user.employeeId) {
        return false;
      }
      return true;
    }

    const scope = user.scope;
    // If scope is not configured or all sub-scopes are empty, defaults to unrestricted within granted permissions
    if (!scope) return true;

    // Check Project Scope
    if (target.projectId && Array.isArray(scope.projects) && scope.projects.length > 0) {
      if (!scope.projects.includes(target.projectId)) {
        return false;
      }
    }

    // Check Department Scope
    if (target.departmentId && Array.isArray(scope.departments) && scope.departments.length > 0) {
      if (!scope.departments.includes(target.departmentId)) {
        return false;
      }
    }

    // Check Employee Scope
    if (target.employeeId) {
      const allowedEmployees = Array.isArray(scope.employees) ? scope.employees : [];
      const allowedDepts = Array.isArray(scope.departments) ? scope.departments : [];
      const allowedProjects = Array.isArray(scope.projects) ? scope.projects : [];

      // If explicit employee scope is defined
      if (allowedEmployees.length > 0) {
        if (allowedEmployees.includes(target.employeeId)) return true;
      }

      // If department scope is defined, check target employee's department
      if (allowedDepts.length > 0) {
        const emp = await DbService.query(
          async () => prisma.employee.findUnique({ where: { id: target.employeeId! }, select: { departmentId: true } }),
          async () => {
            const res = await DbService.restRequest<any[]>(`/employees?id=eq.${target.employeeId}&select=department_id`);
            return res?.[0] ? { departmentId: res[0].department_id } : null;
          }
        );
        if (emp?.departmentId && allowedDepts.includes(emp.departmentId)) {
          return true;
        }
      }

      // If project scope is defined, check if target employee is member of an allowed project
      if (allowedProjects.length > 0) {
        const member = await DbService.query(
          async () =>
            prisma.projectMember.findFirst({
              where: { employeeId: target.employeeId!, projectId: { in: allowedProjects } },
            }),
          async () => {
            const res = await DbService.restRequest<any[]>(
              `/project_members?employee_id=eq.${target.employeeId}&project_id=in.(${allowedProjects.join(',')})&limit=1`
            );
            return res?.[0] || null;
          }
        );
        if (member) return true;
      }

      // If any scope was defined and none matched -> reject
      if (allowedEmployees.length > 0 || allowedDepts.length > 0 || allowedProjects.length > 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Super Admin: Grant or Update Limited Admin role with granular permissions and scoped boundaries
   */
  public static async grantLimitedAdmin(
    actorUserId: string,
    targetEmployeeId: string,
    permissions: Permission[],
    scope: AdminScope = {},
    clientInfo: { ipAddress?: string; userAgent?: string } = {}
  ): Promise<LimitedAdminConfig> {
    const actorAuth = await RbacService.getUserAuthorization(actorUserId);
    if (actorAuth.appRole !== 'SUPER_ADMIN') {
      const err: any = new Error('Only Super Admin can grant or configure Limited Admin access');
      err.statusCode = 403;
      err.code = 'SUPER_ADMIN_REQUIRED';
      throw err;
    }

    // 1. Fetch target employee and user
    const targetEmp = await DbService.query(
      async () =>
        prisma.employee.findFirst({
          where: { OR: [{ id: targetEmployeeId }, { userId: targetEmployeeId }] },
          include: { user: true, department: true, designation: true },
        }),
      async () => {
        const emps = await DbService.restRequest<any[]>(
          `/employees?or=(id.eq.${targetEmployeeId},user_id.eq.${targetEmployeeId})&select=*,user:users(*),department:departments(*),designation:designations(*)`
        );
        return emps?.[0] || null;
      }
    );

    if (!targetEmp || !targetEmp.user) {
      const err: any = new Error('Target employee or associated user account not found');
      err.statusCode = 404;
      err.code = 'EMPLOYEE_NOT_FOUND';
      throw err;
    }

    if (targetEmp.employmentStatus !== 'ACTIVE' || targetEmp.user.status !== 'ACTIVE') {
      const err: any = new Error('Cannot grant admin access to an inactive or deactivated employee');
      err.statusCode = 400;
      err.code = 'EMPLOYEE_INACTIVE';
      throw err;
    }

    // 2. Protect primary Super Admin accounts
    if (targetEmp.user.role === 'SUPER_ADMIN') {
      const err: any = new Error('Cannot modify or downgrade a Super Admin account through Limited Admin assignments');
      err.statusCode = 400;
      err.code = 'CANNOT_MODIFY_SUPER_ADMIN';
      throw err;
    }

    // 3. Filter and validate permissions
    const validPermIds = new Set(PERMISSION_REGISTRY.map((p) => p.id));
    const safePermissions = permissions.filter((p) => validPermIds.has(p));

    const now = new Date().toISOString();
    const config: LimitedAdminConfig = {
      userId: targetEmp.user.id,
      employeeId: targetEmp.id,
      role: 'LIMITED_ADMIN',
      permissions: safePermissions,
      scope: {
        departments: Array.isArray(scope.departments)
          ? scope.departments
          : Array.isArray((scope as any).departmentIds)
          ? (scope as any).departmentIds
          : [],
        projects: Array.isArray(scope.projects)
          ? scope.projects
          : Array.isArray((scope as any).projectIds)
          ? (scope as any).projectIds
          : [],
        employees: Array.isArray(scope.employees)
          ? scope.employees
          : Array.isArray((scope as any).employeeIds)
          ? (scope as any).employeeIds
          : [],
      },
      grantedBy: actorUserId,
      grantedAt: now,
      updatedAt: now,
    };

    const settingKey = `${RbacService.SETTING_PREFIX}${targetEmp.user.id}`;

    await DbService.query(
      async () => {
        await prisma.$transaction(async (tx) => {
          // Upsert Limited Admin config
          await tx.systemSetting.upsert({
            where: { settingKey },
            create: {
              settingKey,
              settingValue: config as any,
              description: `Limited Admin configuration for employee ${targetEmp.displayName || targetEmp.firstName}`,
              isPublic: false,
            },
            update: {
              settingValue: config as any,
              updatedAt: new Date(),
            },
          });

          // Ensure user.role remains EMPLOYEE
          if (targetEmp.user.role !== 'EMPLOYEE') {
            await tx.user.update({
              where: { id: targetEmp.user.id },
              data: { role: 'EMPLOYEE' },
            });
          }
        });
      },
      async () => {
        const existing = await DbService.restRequest<any[]>(
          `/system_settings?setting_key=eq.${encodeURIComponent(settingKey)}`
        );
        if (existing && existing.length > 0) {
          await DbService.restRequest(`/system_settings?setting_key=eq.${encodeURIComponent(settingKey)}`, {
            method: 'PATCH',
            body: {
              setting_value: config,
              description: `Limited Admin configuration for employee ${targetEmp.displayName || targetEmp.firstName}`,
              updated_at: now,
            },
          });
        } else {
          await DbService.restRequest('/system_settings', {
            method: 'POST',
            body: {
              setting_key: settingKey,
              setting_value: config,
              description: `Limited Admin configuration for employee ${targetEmp.displayName || targetEmp.firstName}`,
              is_public: false,
            },
          });
        }

        if (targetEmp.user.role !== 'EMPLOYEE') {
          await DbService.restRequest(`/users?id=eq.${targetEmp.user.id}`, {
            method: 'PATCH',
            body: { role: 'EMPLOYEE' },
          });
        }
      }
    );

    // Evict in-memory caches so subsequent requests immediately read updated permissions
    RbacService.invalidateUserAuthzCache(targetEmp.user.id);
    invalidateUserAuthSessions(targetEmp.user.id);

    // Audit Event
    await AuditService.log({
      userId: actorUserId,
      employeeId: targetEmp.id,
      action: 'ROLE_CHANGED',
      entityType: 'UserRole',
      entityId: targetEmp.user.id,
      description: `Granted LIMITED_ADMIN access to ${targetEmp.displayName || targetEmp.firstName} (${targetEmp.employeeCode}) with ${safePermissions.length} permissions`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
      metadata: {
        previousRole: targetEmp.user.role,
        newRole: 'LIMITED_ADMIN',
        permissions: safePermissions,
        scope: config.scope,
      },
    });

    // Notify employee of administrative access update
    NotificationService.createNotification({
      userId: targetEmp.user.id,
      type: 'ADMIN_PERMISSION_GRANTED',
      title: 'Admin Permissions Updated',
      message: `You have been granted Limited Admin permissions (${safePermissions.length} active permissions).`,
      actionUrl: '/admin-view',
      entityType: 'rbac',
      entityId: targetEmp.id,
      actorId: actorUserId,
    }).catch(() => {});

    return config;
  }

  /**
   * Super Admin: Revoke Limited Admin access and restore employee to normal EMPLOYEE role
   */
  public static async revokeLimitedAdmin(
    actorUserId: string,
    targetEmployeeId: string,
    clientInfo: { ipAddress?: string; userAgent?: string } = {}
  ): Promise<{ success: boolean; message: string }> {
    const actorAuth = await RbacService.getUserAuthorization(actorUserId);
    if (actorAuth.appRole !== 'SUPER_ADMIN') {
      const err: any = new Error('Only Super Admin can revoke Limited Admin access');
      err.statusCode = 403;
      err.code = 'SUPER_ADMIN_REQUIRED';
      throw err;
    }

    const targetEmp = await DbService.query(
      async () =>
        prisma.employee.findFirst({
          where: { OR: [{ id: targetEmployeeId }, { userId: targetEmployeeId }] },
          include: { user: true, department: true, designation: true },
        }),
      async () => {
        const emps = await DbService.restRequest<any[]>(
          `/employees?or=(id.eq.${targetEmployeeId},user_id.eq.${targetEmployeeId})&select=*,user:users(*),department:departments(*),designation:designations(*)`
        );
        return emps?.[0] || null;
      }
    );

    if (!targetEmp || !targetEmp.user) {
      const err: any = new Error('Target employee or user account not found');
      err.statusCode = 404;
      err.code = 'EMPLOYEE_NOT_FOUND';
      throw err;
    }

    if (targetEmp.user.role === 'SUPER_ADMIN') {
      const err: any = new Error('Cannot revoke or alter a Super Admin account');
      err.statusCode = 400;
      err.code = 'CANNOT_MODIFY_SUPER_ADMIN';
      throw err;
    }

    const settingKey = `${RbacService.SETTING_PREFIX}${targetEmp.user.id}`;

    await DbService.query(
      async () => {
        await prisma.$transaction(async (tx) => {
          // Remove Limited Admin configuration
          await tx.systemSetting.deleteMany({
            where: { settingKey },
          });

          // Restore role to EMPLOYEE
          await tx.user.update({
            where: { id: targetEmp.user.id },
            data: { role: 'EMPLOYEE' },
          });
        });
      },
      async () => {
        await DbService.restRequest(`/system_settings?setting_key=eq.${encodeURIComponent(settingKey)}`, {
          method: 'DELETE',
        });
        await DbService.restRequest(`/users?id=eq.${targetEmp.user.id}`, {
          method: 'PATCH',
          body: { role: 'EMPLOYEE' },
        });
      }
    );

    // Evict in-memory caches so subsequent requests immediately read restored permissions
    RbacService.invalidateUserAuthzCache(targetEmp.user.id);
    invalidateUserAuthSessions(targetEmp.user.id);

    // Audit Event
    await AuditService.log({
      userId: actorUserId,
      employeeId: targetEmp.id,
      action: 'ROLE_CHANGED',
      entityType: 'UserRole',
      entityId: targetEmp.user.id,
      description: `Revoked LIMITED_ADMIN access from ${targetEmp.displayName || targetEmp.firstName} (${targetEmp.employeeCode}). Restored to EMPLOYEE.`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
      metadata: {
        previousRole: 'LIMITED_ADMIN',
        newRole: 'EMPLOYEE',
      },
    });

    // Notify employee of administrative access revocation
    NotificationService.createNotification({
      userId: targetEmp.user.id,
      type: 'ADMIN_PERMISSION_REVOKED',
      title: 'Admin Access Removed',
      message: 'Your Limited Admin access has been revoked. Your role is now Employee.',
      actionUrl: '/dashboard',
      entityType: 'rbac',
      entityId: targetEmp.id,
      actorId: actorUserId,
    }).catch(() => {});

    return {
      success: true,
      message: `Limited Admin access successfully revoked for ${targetEmp.displayName || targetEmp.firstName}`,
    };
  }

  /**
   * Resolve specific employee's RBAC assignment state (Super Admin, Limited Admin, or default Employee)
   */
  public static async getEmployeeAssignment(targetEmployeeId: string): Promise<any> {
    const targetEmp = await DbService.query(
      async () =>
        prisma.employee.findFirst({
          where: { OR: [{ id: targetEmployeeId }, { userId: targetEmployeeId }] },
          include: {
            user: { select: { id: true, email: true, role: true, status: true } },
            department: true,
            designation: true,
          },
        }),
      async () => {
        const emps = await DbService.restRequest<any[]>(
          `/employees?or=(id.eq.${targetEmployeeId},user_id.eq.${targetEmployeeId})&select=*,user:users(*),department:departments(*),designation:designations(*)`
        );
        return emps?.[0] || null;
      }
    );

    if (!targetEmp || !targetEmp.user) {
      const err: any = new Error('Employee not found');
      err.statusCode = 404;
      err.code = 'EMPLOYEE_NOT_FOUND';
      throw err;
    }

    const userId = targetEmp.user.id;
    const employeeId = targetEmp.id;
    const employeeCode = targetEmp.employeeCode || targetEmp.employee_code || null;
    const displayName =
      targetEmp.displayName ||
      targetEmp.display_name ||
      `${targetEmp.firstName || targetEmp.first_name || ''} ${targetEmp.lastName || targetEmp.last_name || ''}`.trim() ||
      'Employee';
    const email = targetEmp.user.email || targetEmp.workEmail || targetEmp.work_email || '';
    const departmentName = targetEmp.department?.name || null;
    const designationName = targetEmp.designation?.name || null;
    const employmentStatus = targetEmp.employmentStatus || targetEmp.employment_status || 'ACTIVE';

    // 1. Super Admin
    if (targetEmp.user.role === 'SUPER_ADMIN') {
      return {
        userId,
        employeeId,
        employeeCode,
        displayName,
        email,
        departmentName,
        designationName,
        employmentStatus,
        appRole: 'SUPER_ADMIN' as AppRole,
        isSuperAdmin: true,
        isLimitedAdmin: false,
        config: null,
      };
    }

    // 2. Limited Admin
    const settingKey = `${RbacService.SETTING_PREFIX}${userId}`;
    const setting = await DbService.query(
      async () =>
        prisma.systemSetting.findUnique({
          where: { settingKey },
        }),
      async () => {
        const res = await DbService.restRequest<any[]>(
          `/system_settings?setting_key=eq.${encodeURIComponent(settingKey)}`
        );
        return res?.[0] || null;
      }
    );

    const rawVal = setting?.settingValue ?? setting?.setting_value;
    if (rawVal) {
      const config = (typeof rawVal === 'string' ? JSON.parse(rawVal) : rawVal) as LimitedAdminConfig;
      if (config && Array.isArray(config.permissions)) {
        return {
          userId,
          employeeId,
          employeeCode,
          displayName,
          email,
          departmentName,
          designationName,
          employmentStatus,
          appRole: 'LIMITED_ADMIN' as AppRole,
          isSuperAdmin: false,
          isLimitedAdmin: true,
          config,
        };
      }
    }

    // 3. Normal Employee baseline
    return {
      userId,
      employeeId,
      employeeCode,
      displayName,
      email,
      departmentName,
      designationName,
      employmentStatus,
      appRole: 'EMPLOYEE' as AppRole,
      isSuperAdmin: false,
      isLimitedAdmin: false,
      config: null,
    };
  }

  /**
   * List all active Limited Admin assignments with employee profiles
   */
  public static async listAdminAssignments(): Promise<any[]> {
    return DbService.query(
      async () => {
        const [settings, employees] = await Promise.all([
          prisma.systemSetting.findMany({
            where: { settingKey: { startsWith: RbacService.SETTING_PREFIX } },
            orderBy: { updatedAt: 'desc' },
          }),
          prisma.employee.findMany({
            where: { employmentStatus: 'ACTIVE' },
            include: {
              department: true,
              designation: true,
              user: { select: { id: true, email: true, role: true, status: true } },
            },
          }),
        ]);

        const empByUserId = new Map<string, any>();
        for (const emp of employees) {
          if (emp.userId) empByUserId.set(emp.userId, emp);
        }

        const results: any[] = [];
        for (const s of settings) {
          if (!s || !s.settingValue) continue;
          const config = (typeof s.settingValue === 'string' ? JSON.parse(s.settingValue) : s.settingValue) as LimitedAdminConfig;
          if (!config || !config.userId) continue;
          const emp = empByUserId.get(config.userId);
          results.push({
            userId: config.userId,
            employeeId: config.employeeId || emp?.id || null,
            employeeCode: emp?.employeeCode || null,
            displayName: emp?.displayName || (emp ? `${emp.firstName} ${emp.lastName || ''}`.trim() : 'Unknown'),
            email: emp?.user?.email || emp?.workEmail || '',
            departmentName: emp?.department?.name || null,
            designationName: emp?.designation?.name || null,
            employmentStatus: emp?.employmentStatus || 'ACTIVE',
            appRole: 'LIMITED_ADMIN',
            isSuperAdmin: false,
            isLimitedAdmin: true,
            config,
            employee: emp || null,
          });
        }
        return results;
      },
      async () => {
        const [settings, employees] = await Promise.all([
          DbService.restRequest<any[]>(
            `/system_settings?setting_key=like.${encodeURIComponent(RbacService.SETTING_PREFIX)}*`
          ),
          DbService.restRequest<any[]>(
            `/employees?employment_status=eq.ACTIVE&select=*,department:departments(*),designation:designations(*),user:users(*)`
          ),
        ]);

        const empByUserId = new Map<string, any>();
        for (const emp of employees || []) {
          const uId = emp.userId || emp.user_id;
          if (uId) empByUserId.set(uId, emp);
        }

        const results: any[] = [];
        for (const s of settings || []) {
          const rawVal = s.settingValue ?? s.setting_value;
          if (!rawVal) continue;
          const config = (typeof rawVal === 'string' ? JSON.parse(rawVal) : rawVal) as LimitedAdminConfig;
          if (!config || !config.userId) continue;
          const emp = empByUserId.get(config.userId);
          results.push({
            userId: config.userId,
            employeeId: config.employeeId || emp?.id || null,
            employeeCode: emp?.employeeCode || emp?.employee_code || null,
            displayName:
              emp?.displayName ||
              emp?.display_name ||
              (emp ? `${emp.firstName || emp.first_name || ''} ${emp.lastName || emp.last_name || ''}`.trim() : 'Unknown'),
            email: emp?.user?.email || emp?.workEmail || emp?.work_email || '',
            departmentName: emp?.department?.name || null,
            designationName: emp?.designation?.name || null,
            employmentStatus: emp?.employmentStatus || emp?.employment_status || 'ACTIVE',
            appRole: 'LIMITED_ADMIN',
            isSuperAdmin: false,
            isLimitedAdmin: true,
            config,
            employee: emp || null,
          });
        }
        return results;
      }
    );
  }
}

