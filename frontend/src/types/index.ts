// Enums matching Supabase Postgres Schema
export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING';
export type GenderType = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';
export type EmploymentStatus = 'ACTIVE' | 'ON_NOTICE' | 'RESIGNED' | 'TERMINATED';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LATE' | 'ON_LEAVE' | 'HOLIDAY' | 'WEEKEND' | 'LEAVE' | 'OFF' | 'UPCOMING';
export type WorkMode = 'OFFICE' | 'WFH' | 'REMOTE';
export type AttendanceVerification = 'MANUAL' | 'MOBILE' | 'FACE' | 'FACE_AND_LOCATION';
export type TaskSource = 'ADMIN' | 'MANAGER' | 'SELF';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'OVERDUE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type ReportStatus = 'DRAFT' | 'SUBMITTED' | 'REVIEWED';
export type FeedbackPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type CalendarEventType = 'HOLIDAY' | 'MEETING' | 'TASK' | 'REMINDER' | 'OTHER';
export type NotificationType = 'TASK' | 'TASK_REMINDER' | 'ATTENDANCE' | 'LEAVE' | 'FEEDBACK' | 'REPORT' | 'SYSTEM';
export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'PUSH';
export type AuditAction = 
  | 'CREATE' 
  | 'UPDATE' 
  | 'DELETE' 
  | 'LOGIN' 
  | 'LOGOUT' 
  | 'LOGIN_FAILED' 
  | 'PASSWORD_CHANGED' 
  | 'ROLE_CHANGED' 
  | 'ATTENDANCE_CHECK_IN' 
  | 'ATTENDANCE_CHECK_OUT' 
  | 'LEAVE_REQUESTED' 
  | 'LEAVE_APPROVED' 
  | 'LEAVE_REJECTED' 
  | 'TASK_STARTED' 
  | 'TASK_PAUSED' 
  | 'TASK_COMPLETED' 
  | 'FEEDBACK_CREATED' 
  | 'REPORT_SUBMITTED' 
  | 'SESSION_REVOKED';

// Session Access Mode for Attendance-Gated Access and First Login
export type AccessMode = 'NORMAL' | 'RESTRICTED' | 'FIRST_LOGIN_REQUIRED';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  employeeId?: string | null;
  employeeCode?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  profilePhotoUrl?: string | null;
  departmentId?: string | null;
  designationId?: string | null;
  departmentName?: string | null;
  designationName?: string | null;
  firstLoginRequired?: boolean;
  appRole?: AppRole;
  permissions?: Permission[];
  scope?: AdminScope | null;
}

export interface SessionInfo {
  sessionId: string;
  userId: string;
  accessMode: AccessMode;
  attendanceRequired: boolean;
  restrictedUntil: string | null; // ISO string
  expiresAt: string; // ISO string
  user: AuthUser;
  todayAttendance?: AttendanceRecord | null;
  firstLoginRequired?: boolean;
}


export interface Department {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Designation {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkSchedule {
  id: string;
  name: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  workStartTime: string; // HH:mm:ss
  workEndTime: string;   // HH:mm:ss
  breakMinutes: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Employee {
  id: string;
  userId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone?: string | null;
  dateOfBirth?: string | null;
  gender?: GenderType | null;
  profilePhotoUrl?: string | null;
  departmentId?: string | null;
  designationId?: string | null;
  managerId?: string | null;
  joiningDate?: string | null;
  employmentStatus: EmploymentStatus;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
  createdAt: string;
  updatedAt: string;
  // Relations
  department?: Department | null;
  designation?: Designation | null;
  manager?: Partial<Employee> | null;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  attendanceDate: string; // YYYY-MM-DD
  status: AttendanceStatus;
  workMode: WorkMode;
  verificationMethod: AttendanceVerification;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  totalWorkMinutes?: number | null;
  isWorkingDay?: boolean;
  holidayName?: string | null;
  leaveType?: string | null;
  leaveReason?: string | null;
  notes?: string | null;
  isDerived?: boolean;
  checkInLatitude?: number | null;
  checkInLongitude?: number | null;
  checkOutLatitude?: number | null;
  checkOutLongitude?: number | null;
  deviceId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  employee?: Partial<Employee> | null;
}

export interface AttendanceSummary {
  totalDays: number;
  workingDays: number;
  present: number;
  late: number;
  halfDay: number;
  absent: number;
  leave: number;
  holidays: number;
  offDays: number;
}

export interface AttendanceHistoryResponse {
  records: AttendanceRecord[];
  summary: AttendanceSummary;
}

export type ProjectStatus = 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD';
export type ProjectRole = 'LEAD' | 'DEVELOPER' | 'DESIGNER' | 'TESTER' | 'MANAGER' | 'DEVOPS' | 'CONTRIBUTOR' | 'OTHER';
export type CalendarEventVisibility = 'EVERYONE' | 'SPECIFIC';

export interface ProjectMember {
  id: string;
  projectId: string;
  employeeId: string;
  projectRole: ProjectRole | string;
  addedBy: string;
  createdAt: string;
  employee?: Partial<Employee> | null;
}

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  createdBy: string;
  employeeId?: string | null;
  assignedDate?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  members?: ProjectMember[];
  // Computed / aggregated
  totalTasks?: number;
  completedTasks?: number;
  activeTimersCount?: number;
  totalWorkedSeconds?: number;
  totalWorkedMinutes?: number;
  totalWorkedHours?: number;
  tasks?: Task[];
  creator?: { id: string; email: string; displayName?: string } | null;
  employee?: Partial<Employee> | null;
  employeeBreakdown?: {
    employeeId: string;
    displayName: string;
    totalWorkedSeconds: number;
    totalWorkedMinutes: number;
    totalWorkedHours: number;
    taskCount: number;
  }[];
}

export interface CreateProjectInput {
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  employeeId?: string | null;
  assignedDate?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  members?: { employeeId: string; projectRole?: ProjectRole | string }[];
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
  employeeId?: string | null;
  assignedDate?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  members?: { employeeId: string; projectRole?: ProjectRole | string }[];
}

export interface TaskMention {
  id: string;
  taskId: string;
  mentionedEmployeeId: string;
  mentionedBy: string;
  context: 'TASK_DESCRIPTION' | 'COMMENT';
  commentId?: string | null;
  createdAt: string;
  mentionedEmployee?: Partial<Employee> | null;
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; email: string; displayName?: string; role: UserRole } | null;
  employee?: Partial<Employee> | null;
  mentions?: TaskMention[];
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  projectId?: string | null;
  employeeId: string;
  createdBy: string;
  source: TaskSource;
  status: TaskStatus;
  priority: TaskPriority;
  assignedDate?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  estimatedMinutes?: number | null;
  completedAt?: string | null;
  progressPercentage: number;
  reminderEnabled: boolean;
  reminderAt?: string | null;
  googleCalendarEventId?: string | null;
  createdAt: string;
  updatedAt: string;
  // Computed / Related
  employee?: Partial<Employee> | null;
  activeTimer?: TaskTimer | null;
  totalDurationSeconds?: number;
  totalWorkMinutes?: number;
  project?: Partial<Project> | null;
  mentions?: TaskMention[];
  comments?: TaskComment[];
}

export interface TaskTimer {
  id: string;
  taskId: string;
  employeeId: string;
  startedAt: string;
  pausedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
  isActive: boolean;
  createdAt: string;
  task?: Partial<Task> | null;
}

export interface LeaveType {
  id: string;
  name: string;
  description?: string | null;
  defaultDaysPerYear: number;
  isPaid: boolean;
  isActive: boolean;
}

export interface LeavePolicyConfig {
  leaveTypeId: string;
  policyCycle: 'MONTHLY' | 'ANNUAL';
  monthlyAllocation: number;
  annualAllocation: number;
  carryForward: boolean;
  maxCarryForward: number;
  requiresApproval: boolean;
  minNoticeDays: number;
  isActive: boolean;
  description?: string | null;
}

export interface LeaveAllocationRecord {
  id: string;
  leaveTypeId: string;
  year: number;
  month: number | null;
  targetType: 'ALL' | 'EMPLOYEE' | 'EMPLOYEES' | 'DEPARTMENT' | 'DESIGNATION';
  targetEmployeeIds?: string[];
  targetDepartmentId?: string | null;
  targetDesignationId?: string | null;
  allocatedDays: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface EmployeeLeaveBalance {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  month?: number | null;
  allocatedDays: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
  carryForwardDays?: number;
  leaveType?: LeaveType | null;
  policy?: LeavePolicyConfig | null;
}

export interface LeaveOrganizationSummary {
  summary: {
    totalEmployees: number;
    totalAllocated: number;
    totalUsed: number;
    totalRemaining: number;
    totalPending: number;
  };
  employees: {
    employee: Partial<Employee>;
    allocatedDays: number;
    usedDays: number;
    pendingDays: number;
    remainingDays: number;
    typeBalances: {
      leaveTypeId: string;
      leaveTypeName: string;
      allocatedDays: number;
      usedDays: number;
      pendingDays: number;
      remainingDays: number;
    }[];
  }[];
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: LeaveStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewComment?: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: Partial<Employee> | null;
  leaveType?: LeaveType | null;
}

export interface DailyWorkReport {
  id: string;
  employeeId: string;
  reportDate: string;
  description: string;
  blockers?: string | null;
  status: ReportStatus;
  submittedAt?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: Partial<Employee> | null;
}

export interface Feedback {
  id: string;
  employeeId: string;
  reviewerId: string;
  period: FeedbackPeriod;
  periodStart: string;
  periodEnd: string;
  productivityScore: number;
  qualityScore: number;
  communicationScore: number;
  ownershipScore: number;
  overallScore: number;
  strengths?: string | null;
  areasToImprove?: string | null;
  comments?: string | null;
  goals?: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: Partial<Employee> | null;
  reviewer?: { email: string; id: string } | null;
}

export interface CalendarEventAttendee {
  id: string;
  eventId: string;
  employeeId: string;
  createdAt: string;
  employee?: Partial<Employee> | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  eventType: CalendarEventType;
  visibility?: CalendarEventVisibility | string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  createdBy: string;
  employeeId?: string | null;
  googleCalendarEventId?: string | null;
  createdAt: string;
  updatedAt: string;
  attendees?: CalendarEventAttendee[];
}

export interface DigitalIdCard {
  id: string;
  employeeId: string;
  cardNumber: string;
  verificationToken: string;
  issuedAt: string;
  expiresAt?: string | null;
  isActive: boolean;
  employee?: Employee | null;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: NotificationType | string;
  title: string;
  message: string;
  actionUrl?: string | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    unreadCount: number;
  };
}

export interface AuditLog {
  id: string;
  userId?: string | null;
  employeeId?: string | null;
  action: AuditAction;
  entityType?: string | null;
  entityId?: string | null;
  description?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

// API Standard Response Formats
export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Admin Dashboard Live Activity View
export interface LiveEmployeeActivity {
  employeeId: string;
  employeeCode: string;
  name: string;
  displayName: string;
  profilePhotoUrl?: string | null;
  departmentName?: string | null;
  designationName?: string | null;
  attendanceStatus: AttendanceStatus | 'NOT_MARKED';
  isCheckedIn?: boolean;
  workMode?: WorkMode | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  isOnLeave?: boolean;
  leaveDetails?: {
    leaveType?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  } | null;
  currentTask?: {
    id: string;
    title: string;
    priority: TaskPriority;
    status: TaskStatus;
    timerStartedAt?: string | null;
    priorClosedDurationSeconds?: number;
    totalDurationSeconds?: number;
    elapsedSeconds: number;
    isActive: boolean;
    projectName?: string | null;
  } | null;
  activeTaskCount: number;
}

export interface AdminDashboardMetrics {
  totalEmployees: number;
  currentlyWorking: number;
  wfhCount: number;
  onLeaveCount: number;
  absentOrNotMarkedCount: number;
  activeTasksCount: number;
  completedTasksCount: number;
  overdueTasksCount: number;
  pendingLeaveRequestsCount: number;
  reportsSubmittedCount: number;
  reportsMissingCount: number;
}

// ==========================================
// ROLE-BASED ACCESS CONTROL (RBAC) SYSTEM
// ==========================================

export type AppRole = 'SUPER_ADMIN' | 'LIMITED_ADMIN' | 'EMPLOYEE';

export type PermissionCategory = 
  | 'TASKS' 
  | 'PROJECTS' 
  | 'TEAMS' 
  | 'WORK' 
  | 'REPORTS' 
  | 'EMPLOYEES' 
  | 'ATTENDANCE' 
  | 'LEAVE' 
  | 'SETTINGS' 
  | 'SECURITY';

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
  // Security & RBAC
  | 'ROLE_VIEW'
  | 'ROLE_ASSIGN'
  | 'PERMISSION_VIEW'
  | 'PERMISSION_ASSIGN'
  | 'AUDIT_VIEW'
  | 'SECURITY_AUDIT'
  | 'SECURITY_MANAGE_ROLES';

export interface AdminScope {
  departments?: string[];
  projects?: string[];
  employees?: string[];
  departmentIds?: string[];
  projectIds?: string[];
  employeeIds?: string[];
}

export interface LimitedAdminConfig {
  grantedBy: string;
  grantedAt: string;
  updatedAt: string;
  permissions: Permission[];
  scope?: AdminScope | null;
  notes?: string | null;
}

export interface PermissionDefinition {
  key: Permission;
  label: string;
  description: string;
  category: PermissionCategory;
  isSensitive?: boolean;
}

export interface LimitedAdminAssignment {
  userId: string;
  employeeId?: string | null;
  employeeCode?: string | null;
  displayName: string;
  email: string;
  departmentName?: string | null;
  designationName?: string | null;
  employmentStatus: string;
  appRole: AppRole;
  isSuperAdmin: boolean;
  isLimitedAdmin: boolean;
  config: LimitedAdminConfig | null;
}
