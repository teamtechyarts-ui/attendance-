import { AuthUser, Permission, AppRole } from '@/types';

/**
 * Baseline permissions that every standard employee has for self-service operations.
 */
export const BASELINE_EMPLOYEE_PERMISSIONS: Permission[] = [
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
 * Checks if the user is a Super Admin.
 */
export function isSuperAdmin(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'SUPER_ADMIN' || user.appRole === 'SUPER_ADMIN';
}

/**
 * Checks if an authenticated employee has at least one active administrative permission.
 * DOES NOT rely solely on user.role === 'LIMITED_ADMIN'.
 */
export function isLimitedAdmin(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return false;

  if (user.appRole === 'LIMITED_ADMIN') return true;

  if (!user.permissions || !Array.isArray(user.permissions)) return false;

  // Check if user has any permission beyond the baseline self-service employee permissions
  const adminPerms = user.permissions.filter(
    (p) => !BASELINE_EMPLOYEE_PERMISSIONS.includes(p)
  );

  return adminPerms.length > 0;
}

/**
 * Check if the user has a specific permission or any of the specified permissions.
 */
export function hasPermission(
  user: AuthUser | null | undefined,
  permission: Permission | Permission[] | string | string[]
): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;

  const userPerms = new Set<string>((user.permissions || []) as string[]);
  const checkList = Array.isArray(permission) ? permission : [permission];

  return checkList.some((p) => userPerms.has(p));
}

/**
 * Check if user has ALL of the specified permissions.
 */
export function hasAllPermissions(
  user: AuthUser | null | undefined,
  permissions: (Permission | string)[]
): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;

  const userPerms = new Set<string>((user.permissions || []) as string[]);
  return permissions.every((p) => userPerms.has(p));
}

export interface NavModule {
  id: string;
  label: string;
  href: string;
  iconName: string;
  description: string;
}

/**
 * Returns the list of administrative modules available to the user in the Limited Admin View.
 * Only modules for which the employee has explicit permissions are included.
 */
export function getPermittedAdminModules(user: AuthUser | null | undefined): NavModule[] {
  if (!user) return [];

  // Super admin has all modules
  const isSuper = isSuperAdmin(user);
  const perms = new Set<string>((user.permissions || []) as string[]);

  const modules: NavModule[] = [
    // Overview is always available in Limited Admin view
    {
      id: 'overview',
      label: 'Overview',
      href: '/admin-view',
      iconName: 'BarChart2',
      description: 'Administrative overview and workload summary',
    },
  ];

  // Tasks module
  if (
    isSuper ||
    perms.has('TASK_CREATE') ||
    perms.has('TASK_UPDATE') ||
    perms.has('TASK_EDIT') ||
    perms.has('TASK_ASSIGN') ||
    perms.has('TASK_DELETE') ||
    perms.has('WORK_MANAGE') ||
    perms.has('WORK_VIEW_DASHBOARD')
  ) {
    modules.push({
      id: 'tasks',
      label: 'Tasks',
      href: '/admin-view/tasks',
      iconName: 'Briefcase',
      description: 'Manage and assign tasks within permitted scope',
    });
  }

  // Projects module
  if (
    isSuper ||
    perms.has('PROJECT_CREATE') ||
    perms.has('PROJECT_UPDATE') ||
    perms.has('PROJECT_EDIT') ||
    perms.has('PROJECT_ASSIGN') ||
    perms.has('PROJECT_DELETE') ||
    perms.has('PROJECT_ARCHIVE')
  ) {
    modules.push({
      id: 'projects',
      label: 'Projects',
      href: '/admin-view/projects',
      iconName: 'FolderKanban',
      description: 'Manage project portfolios, deadlines, and members',
    });
  }

  // Team module
  if (
    isSuper ||
    perms.has('MANAGE_PROJECT_TEAM') ||
    perms.has('TEAM_VIEW') ||
    perms.has('TEAM_CREATE') ||
    perms.has('TEAM_UPDATE') ||
    perms.has('TEAM_MEMBER_ADD') ||
    perms.has('TEAM_MEMBER_REMOVE')
  ) {
    modules.push({
      id: 'team',
      label: 'Team',
      href: '/admin-view/team',
      iconName: 'Users',
      description: 'Manage team composition and project allocations',
    });
  }

  // Attendance module
  if (
    isSuper ||
    perms.has('ATTENDANCE_MANAGE') ||
    perms.has('ATTENDANCE_EDIT') ||
    perms.has('ATTENDANCE_EXPORT') ||
    perms.has('MANAGE_ATTENDANCE')
  ) {
    modules.push({
      id: 'attendance',
      label: 'Attendance',
      href: '/admin-view/attendance',
      iconName: 'Clock',
      description: 'Review and manage team attendance records',
    });
  }

  // Leave module
  if (
    isSuper ||
    perms.has('LEAVE_MANAGE') ||
    perms.has('LEAVE_APPROVE') ||
    perms.has('MANAGE_LEAVE')
  ) {
    modules.push({
      id: 'leave',
      label: 'Leave',
      href: '/admin-view/leave',
      iconName: 'Calendar',
      description: 'Approve or reject leave requests in your scope',
    });
  }

  // Reports module
  if (
    isSuper ||
    perms.has('REPORTS_VIEW') ||
    perms.has('REPORTS_APPROVE') ||
    perms.has('REPORTS_EXPORT') ||
    perms.has('VIEW_REPORTS')
  ) {
    modules.push({
      id: 'reports',
      label: 'Reports',
      href: '/admin-view/reports',
      iconName: 'FileText',
      description: 'Review employee daily work reports and performance',
    });
  }

  // Employees module
  if (
    isSuper ||
    perms.has('EMPLOYEE_VIEW') ||
    perms.has('EMPLOYEE_CREATE') ||
    perms.has('EMPLOYEE_UPDATE') ||
    perms.has('EMPLOYEE_EDIT') ||
    perms.has('EMPLOYEE_DEACTIVATE') ||
    perms.has('MANAGE_EMPLOYEES')
  ) {
    modules.push({
      id: 'employees',
      label: 'People',
      href: '/admin-view/employees',
      iconName: 'UserCheck',
      description: 'View employee directory within permitted scope',
    });
  }

  // Settings module
  if (
    isSuper ||
    perms.has('SETTINGS_VIEW') ||
    perms.has('SETTINGS_MANAGE') ||
    perms.has('SETTINGS_EDIT') ||
    perms.has('SYSTEM_SETTINGS') ||
    perms.has('ROLE_VIEW') ||
    perms.has('ROLE_ASSIGN') ||
    perms.has('PERMISSION_VIEW') ||
    perms.has('PERMISSION_ASSIGN') ||
    perms.has('MANAGE_RBAC') ||
    perms.has('SECURITY_MANAGE_ROLES')
  ) {
    modules.push({
      id: 'settings',
      label: 'Settings',
      href: '/admin-view/settings',
      iconName: 'Settings',
      description: 'Access authorized configuration and security policies',
    });
  }

  return modules;
}
