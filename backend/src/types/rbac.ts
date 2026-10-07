export type AppRole = 'SUPER_ADMIN' | 'LIMITED_ADMIN' | 'EMPLOYEE';

export type Permission =
  // Tasks
  | 'TASK_VIEW'
  | 'TASK_CREATE'
  | 'TASK_UPDATE'
  | 'TASK_EDIT'
  | 'TASK_ASSIGN'
  | 'TASK_COMPLETE'
  | 'TASK_CLOSE'
  | 'TASK_DELETE'
  // Projects
  | 'PROJECT_VIEW'
  | 'PROJECT_CREATE'
  | 'PROJECT_UPDATE'
  | 'PROJECT_EDIT'
  | 'PROJECT_ASSIGN'
  | 'PROJECT_DELETE'
  | 'PROJECT_ARCHIVE'
  // Teams
  | 'TEAM_VIEW'
  | 'TEAM_CREATE'
  | 'TEAM_UPDATE'
  | 'TEAM_MEMBER_ADD'
  | 'TEAM_MEMBER_REMOVE'
  // Work
  | 'WORK_VIEW'
  | 'WORK_MANAGE'
  | 'WORK_VIEW_DASHBOARD'
  | 'WORK_VIEW_TIMERS'
  | 'WORK_EXPORT'
  // Reports
  | 'REPORT_VIEW'
  | 'REPORTS_VIEW'
  | 'REPORTS_APPROVE'
  | 'REPORTS_EXPORT'
  // Employees
  | 'EMPLOYEE_VIEW'
  | 'EMPLOYEE_CREATE'
  | 'EMPLOYEE_UPDATE'
  | 'EMPLOYEE_EDIT'
  | 'EMPLOYEE_DEACTIVATE'
  // Attendance
  | 'ATTENDANCE_VIEW'
  | 'ATTENDANCE_MANAGE'
  | 'ATTENDANCE_EDIT'
  | 'ATTENDANCE_EXPORT'
  // Leave
  | 'LEAVE_VIEW'
  | 'LEAVE_MANAGE'
  | 'LEAVE_APPROVE'
  // Settings
  | 'SETTINGS_VIEW'
  | 'SETTINGS_MANAGE'
  | 'SETTINGS_EDIT'
  // Collaboration & Chat
  | 'CHAT_VIEW'
  | 'CHAT_CREATE_DIRECT'
  | 'CHAT_CREATE_GROUP'
  | 'CHAT_MANAGE_GROUP'
  | 'CHAT_SEND_MESSAGE'
  | 'CHAT_DELETE_MESSAGE'
  | 'CHAT_MANAGE_REACTIONS'
  | 'CHAT_START_MEETING'
  | 'CHAT_SHARE_SCREEN'
  | 'CHAT_MANAGE_MEETING'
  // Security & RBAC
  | 'ROLE_VIEW'
  | 'ROLE_ASSIGN'
  | 'PERMISSION_VIEW'
  | 'PERMISSION_ASSIGN'
  | 'AUDIT_VIEW'
  | 'SECURITY_AUDIT'
  | 'SECURITY_MANAGE_ROLES';

export interface AdminScope {
  departments?: string[]; // department IDs
  projects?: string[]; // project IDs
  employees?: string[]; // employee IDs
}

export interface LimitedAdminConfig {
  userId: string;
  employeeId: string;
  role: 'LIMITED_ADMIN';
  permissions: Permission[];
  scope: AdminScope;
  grantedBy: string;
  grantedAt: string;
  updatedAt: string;
}

export interface PermissionDefinition {
  id: Permission;
  label: string;
  group: 'Tasks' | 'Projects' | 'Teams' | 'Work' | 'Reports' | 'Employees' | 'Attendance' | 'Leave' | 'Settings' | 'Collaboration' | 'Security';
  description: string;
  isSensitive?: boolean;
}

export const PERMISSION_REGISTRY: PermissionDefinition[] = [
  // Tasks
  { id: 'TASK_VIEW', label: 'View Tasks', group: 'Tasks', description: 'View tasks within permitted scope' },
  { id: 'TASK_CREATE', label: 'Create Tasks', group: 'Tasks', description: 'Create new tasks within permitted projects' },
  { id: 'TASK_ASSIGN', label: 'Assign Tasks', group: 'Tasks', description: 'Assign tasks to permitted team members' },
  { id: 'TASK_UPDATE', label: 'Update Tasks', group: 'Tasks', description: 'Edit task details, deadlines, and priorities' },
  { id: 'TASK_COMPLETE', label: 'Complete Tasks', group: 'Tasks', description: 'Mark tasks as completed or reviewed' },
  { id: 'TASK_DELETE', label: 'Delete Tasks', group: 'Tasks', description: 'Delete tasks within permitted projects' },

  // Projects
  { id: 'PROJECT_VIEW', label: 'View Projects', group: 'Projects', description: 'View assigned and permitted projects' },
  { id: 'PROJECT_CREATE', label: 'Create Projects', group: 'Projects', description: 'Create new projects and project workspaces' },
  { id: 'PROJECT_UPDATE', label: 'Update Projects', group: 'Projects', description: 'Update project settings and metadata' },
  { id: 'PROJECT_ASSIGN', label: 'Assign Projects', group: 'Projects', description: 'Assign employees to project teams' },
  { id: 'PROJECT_DELETE', label: 'Delete Projects', group: 'Projects', description: 'Delete projects within permitted scope' },

  // Teams / Members
  { id: 'TEAM_VIEW', label: 'View Team', group: 'Teams', description: 'View assigned team members and staff list' },
  { id: 'TEAM_CREATE', label: 'Create Team Groups', group: 'Teams', description: 'Create and organize team groups' },
  { id: 'TEAM_UPDATE', label: 'Update Team Groups', group: 'Teams', description: 'Update team group metadata' },
  { id: 'TEAM_MEMBER_ADD', label: 'Add Team Members', group: 'Teams', description: 'Add permitted employees to project teams' },
  { id: 'TEAM_MEMBER_REMOVE', label: 'Remove Team Members', group: 'Teams', description: 'Remove members from project teams' },

  // Work Overview
  { id: 'WORK_VIEW', label: 'View Team Work', group: 'Work', description: 'View work dashboard and time summaries for team' },
  { id: 'WORK_MANAGE', label: 'Manage Team Work', group: 'Work', description: 'Manage workload and priorities across team' },

  // Reports
  { id: 'REPORT_VIEW', label: 'View Work Reports', group: 'Reports', description: 'View daily work reports submitted by team' },

  // Employees
  { id: 'EMPLOYEE_VIEW', label: 'View Staff List', group: 'Employees', description: 'View employee directory within permitted scope' },
  { id: 'EMPLOYEE_CREATE', label: 'Create Employees', group: 'Employees', description: 'Onboard new staff members' },
  { id: 'EMPLOYEE_UPDATE', label: 'Update Employees', group: 'Employees', description: 'Update employee profiles within scope' },
  { id: 'EMPLOYEE_DEACTIVATE', label: 'Deactivate Employees', group: 'Employees', description: 'Deactivate staff accounts' },

  // Attendance
  { id: 'ATTENDANCE_VIEW', label: 'View Attendance', group: 'Attendance', description: 'View attendance records for permitted team' },
  { id: 'ATTENDANCE_MANAGE', label: 'Manage Attendance', group: 'Attendance', description: 'Adjust or verify team attendance' },

  // Leave
  { id: 'LEAVE_VIEW', label: 'View Leave Requests', group: 'Leave', description: 'View leave requests submitted by team' },
  { id: 'LEAVE_MANAGE', label: 'Review Leave Requests', group: 'Leave', description: 'Approve or reject leave requests for team' },

  // Settings & Master Data
  { id: 'SETTINGS_VIEW', label: 'View Settings', group: 'Settings', description: 'View organizational settings' },
  { id: 'SETTINGS_MANAGE', label: 'Manage Settings', group: 'Settings', description: 'Modify departments, designations, schedules' },

  // Collaboration & Chat
  { id: 'CHAT_VIEW', label: 'Access Chat & Directory', group: 'Collaboration', description: 'View People directory and chat conversations' },
  { id: 'CHAT_CREATE_DIRECT', label: 'Start Direct Chats', group: 'Collaboration', description: 'Start 1:1 direct messaging conversations' },
  { id: 'CHAT_CREATE_GROUP', label: 'Create Group Chats', group: 'Collaboration', description: 'Create and organize group channels' },
  { id: 'CHAT_MANAGE_GROUP', label: 'Manage Group Members', group: 'Collaboration', description: 'Add or remove members and rename groups' },
  { id: 'CHAT_SEND_MESSAGE', label: 'Send Chat Messages', group: 'Collaboration', description: 'Send messages, replies, and reactions' },
  { id: 'CHAT_DELETE_MESSAGE', label: 'Moderate Chat Messages', group: 'Collaboration', description: 'Delete messages for moderation' },
  { id: 'CHAT_MANAGE_REACTIONS', label: 'Manage Reactions', group: 'Collaboration', description: 'Add and remove emoji reactions' },
  { id: 'CHAT_START_MEETING', label: 'Start Group Meetings', group: 'Collaboration', description: 'Start and host group meetings in group chats' },
  { id: 'CHAT_SHARE_SCREEN', label: 'Share Screen', group: 'Collaboration', description: 'Share screen in calls and meetings' },
  { id: 'CHAT_MANAGE_MEETING', label: 'Manage Meeting Participants', group: 'Collaboration', description: 'Mute or remove participants in hosted meetings' },

  // Security & RBAC (Protected - Super Admin only)
  { id: 'ROLE_VIEW', label: 'View Roles', group: 'Security', description: 'View role assignments' },
  { id: 'ROLE_ASSIGN', label: 'Manage Roles & Access', group: 'Security', description: 'Grant or revoke Limited Admin access' },
  { id: 'PERMISSION_VIEW', label: 'View Permissions Registry', group: 'Security', description: 'View system permissions' },
  { id: 'PERMISSION_ASSIGN', label: 'Assign Permissions', group: 'Security', description: 'Configure granular permissions' },
  { id: 'AUDIT_VIEW', label: 'View Audit Logs', group: 'Security', description: 'View administrative audit logs' },
];
