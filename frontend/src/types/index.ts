// Enums matching Supabase Postgres Schema
export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING';
export type GenderType = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';
export type EmploymentStatus = 'ACTIVE' | 'ON_NOTICE' | 'RESIGNED' | 'TERMINATED';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LATE' | 'ON_LEAVE' | 'HOLIDAY' | 'WEEKEND';
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
  notes?: string | null;
  checkInLatitude?: number | null;
  checkInLongitude?: number | null;
  checkOutLatitude?: number | null;
  checkOutLongitude?: number | null;
  deviceId?: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: Partial<Employee> | null;
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
  startDate?: string | null;
  dueDate?: string | null;
  members?: { employeeId: string; projectRole?: ProjectRole | string }[];
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
  employeeId?: string | null;
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

export interface EmployeeLeaveBalance {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  allocatedDays: number;
  usedDays: number;
  pendingDays: number;
  leaveType?: LeaveType | null;
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
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
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
