import { z } from 'zod';

// Auth Schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
  confirmPassword: z.string().optional(),
}).refine((data) => !data.confirmPassword || data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Employee Schemas
export const createEmployeeSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE']).default('EMPLOYEE'),

  employeeCode: z.string().min(2, 'Employee code is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  displayName: z.string().optional(),
  phone: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  designationId: z.string().uuid().optional().nullable(),
  managerId: z.string().uuid().optional().nullable(),
  joiningDate: z.string().optional().nullable(),
  employmentStatus: z.enum(['ACTIVE', 'ON_NOTICE', 'RESIGNED', 'TERMINATED']).default('ACTIVE'),
  workScheduleId: z.string().uuid().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  emergencyContactName: z.string().optional().nullable(),
  emergencyContactPhone: z.string().optional().nullable(),
  emergencyContactRelation: z.string().optional().nullable(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial().omit({ email: true, password: true });

export const updateSelfProfileSchema = z.object({
  displayName: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  emergencyContactName: z.string().optional().nullable(),
  emergencyContactPhone: z.string().optional().nullable(),
  emergencyContactRelation: z.string().optional().nullable(),
});

// Attendance Schemas
export const checkInSchema = z.object({
  workMode: z.enum(['OFFICE', 'WFH', 'REMOTE']).default('OFFICE'),
  verificationMethod: z.enum(['MANUAL', 'MOBILE', 'FACE', 'FACE_AND_LOCATION']).default('MANUAL'),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  deviceId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const checkOutSchema = z
  .object({
    latitude: z.number().optional().nullable(),
    longitude: z.number().optional().nullable(),
    notes: z.string().optional().nullable(),
    dailyWorkReport: z.string().optional(),
    report: z.string().optional(),
    description: z.string().optional(),
    blockers: z.string().max(1000).optional().nullable(),
  })
  .transform((data) => {
    const raw = data.dailyWorkReport ?? data.report ?? data.description ?? '';
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    return {
      ...data,
      dailyWorkReport: trimmed,
    };
  })
  .refine((data) => data.dailyWorkReport.length >= 100, {
    message: 'Daily work report is required (minimum 100 characters)',
    path: ['dailyWorkReport'],
  })
  .refine((data) => data.dailyWorkReport.length <= 10000, {
    message: 'Daily work report must not exceed 10000 characters',
    path: ['dailyWorkReport'],
  });

export const bulkDeleteNotificationsSchema = z.object({
  ids: z
    .array(z.string().uuid('Invalid notification ID'))
    .min(1, 'At least one notification ID is required')
    .max(100, 'Maximum 100 notifications can be deleted at once'),
});

// Project Schemas
export const projectMemberItemSchema = z.object({
  employeeId: z.string().uuid('Invalid employee ID'),
  projectRole: z.string().default('CONTRIBUTOR'),
});

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200),
  description: z.string().optional().nullable(),
  status: z.enum(['PLANNING', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD']).default('IN_PROGRESS'),
  employeeId: z.string().uuid().optional().nullable(),
  assignedDate: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  members: z.array(projectMemberItemSchema).optional(),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  completedAt: z.string().optional().nullable(),
});

export const addProjectMemberSchema = z.object({
  employeeId: z.string().uuid('Invalid employee ID'),
  projectRole: z.string().default('CONTRIBUTOR'),
});

export const updateProjectMemberSchema = z.object({
  projectRole: z.string().min(1, 'Project role is required'),
});

// Task Schemas
export const createTaskSchema = z.object({
  title: z.string().min(1, 'Task title is required').max(200),
  description: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  employeeId: z.string().uuid().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  assignedDate: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  estimatedMinutes: z.number().int().positive().optional().nullable(),
  reminderEnabled: z.boolean().default(false).optional(),
  reminderAt: z.string().optional().nullable(),
  mentionedEmployeeIds: z.array(z.string().uuid()).optional(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  status: z.enum(['TODO', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED', 'OVERDUE']).optional(),
  progressPercentage: z.number().min(0).max(100).optional(),
});

// Task Comment & Mention Schemas
export const createTaskCommentSchema = z.object({
  comment: z.string().min(1, 'Comment text is required'),
  mentionedEmployeeIds: z.array(z.string().uuid()).optional(),
});

export const createTaskMentionSchema = z.object({
  mentionedEmployeeId: z.string().uuid('Invalid employee ID'),
  context: z.enum(['TASK_DESCRIPTION', 'COMMENT']).default('COMMENT'),
  commentId: z.string().uuid().optional().nullable(),
});

// Task Timer Schemas
export const startTimerSchema = z.object({
  taskId: z.string().uuid('Invalid task ID'),
});

// Leave Schemas
export const createLeaveRequestSchema = z.object({
  leaveTypeId: z.string().uuid('Invalid leave type'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  totalDays: z.number().positive('Total days must be greater than 0'),
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
});

export const reviewLeaveRequestSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  reviewComment: z.string().optional().nullable(),
});

// Daily Work Report Schemas
export const createDailyReportSchema = z.object({
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  description: z.string().optional(),
  summary: z.string().optional(),
  challengesFaced: z.string().optional().nullable(),
  plansForTomorrow: z.string().optional().nullable(),
  blockers: z.string().max(500).optional().nullable(),
  status: z.enum(['DRAFT', 'SUBMITTED']).default('SUBMITTED').optional(),
  items: z.array(z.any()).optional(),
}).transform((data) => ({
  ...data,
  description: data.description || data.summary || 'Daily work report summary',
}));

// Feedback Schemas
export const createFeedbackSchema = z.object({
  employeeId: z.string().uuid('Invalid employee ID'),
  period: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  productivityScore: z.number().min(0).max(5),
  qualityScore: z.number().min(0).max(5),
  communicationScore: z.number().min(0).max(5),
  ownershipScore: z.number().min(0).max(5),
  overallScore: z.number().min(0).max(5),
  strengths: z.string().optional().nullable(),
  areasToImprove: z.string().optional().nullable(),
  comments: z.string().optional().nullable(),
  goals: z.string().optional().nullable(),
});

// Department & Designation Schemas
export const createDepartmentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true).optional(),
});
export const updateDepartmentSchema = createDepartmentSchema.partial();

export const createDesignationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true).optional(),
});
export const updateDesignationSchema = createDesignationSchema.partial();

// Work Schedule Schemas
export const createWorkScheduleSchema = z.object({
  name: z.string().min(1, 'Schedule name is required').max(100),
  monday: z.boolean().default(true),
  tuesday: z.boolean().default(true),
  wednesday: z.boolean().default(true),
  thursday: z.boolean().default(true),
  friday: z.boolean().default(true),
  saturday: z.boolean().default(false),
  sunday: z.boolean().default(false),
  workStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Start time must be HH:MM or HH:MM:SS').default('09:00:00'),
  workEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'End time must be HH:MM or HH:MM:SS').default('18:00:00'),
  breakMinutes: z.number().int().min(0).max(300).default(60),
  isDefault: z.boolean().default(false),
}).refine(
  (data) => data.monday || data.tuesday || data.wednesday || data.thursday || data.friday || data.saturday || data.sunday,
  {
    message: 'At least one working day must be selected',
    path: ['monday'],
  }
);

export const updateWorkScheduleSchema = z.object({
  name: z.string().min(1, 'Schedule name is required').max(100).optional(),
  monday: z.boolean().optional(),
  tuesday: z.boolean().optional(),
  wednesday: z.boolean().optional(),
  thursday: z.boolean().optional(),
  friday: z.boolean().optional(),
  saturday: z.boolean().optional(),
  sunday: z.boolean().optional(),
  workStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Start time must be HH:MM or HH:MM:SS').optional(),
  workEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'End time must be HH:MM or HH:MM:SS').optional(),
  breakMinutes: z.number().int().min(0).max(300).optional(),
  isDefault: z.boolean().optional(),
});

// Calendar Event Schema
export const createCalendarEventSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().nullable(),
  eventType: z.enum(['HOLIDAY', 'MEETING', 'TASK', 'REMINDER', 'OTHER']).default('OTHER'),
  visibility: z.enum(['EVERYONE', 'SPECIFIC']).default('SPECIFIC'),
  startAt: z.string(),
  endAt: z.string(),
  allDay: z.boolean().default(false),
  employeeId: z.string().uuid().optional().nullable(),
  attendeeIds: z.array(z.string().uuid()).optional(),
});

export const updateCalendarEventSchema = createCalendarEventSchema.partial();

// Export Type inference
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type CheckInInput = z.infer<typeof checkInSchema>;
export type CheckOutInput = z.infer<typeof checkOutSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type AddProjectMemberInput = z.infer<typeof addProjectMemberSchema>;
export type UpdateProjectMemberInput = z.infer<typeof updateProjectMemberSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CreateTaskCommentInput = z.infer<typeof createTaskCommentSchema>;
export type CreateTaskMentionInput = z.infer<typeof createTaskMentionSchema>;
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
export type CreateDailyReportInput = z.infer<typeof createDailyReportSchema>;
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type CreateDesignationInput = z.infer<typeof createDesignationSchema>;
export type UpdateDesignationInput = z.infer<typeof updateDesignationSchema>;
export type CreateWorkScheduleInput = z.infer<typeof createWorkScheduleSchema>;
export type UpdateWorkScheduleInput = z.infer<typeof updateWorkScheduleSchema>;
export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;
export type UpdateCalendarEventInput = z.infer<typeof updateCalendarEventSchema>;
export type BulkDeleteNotificationsInput = z.infer<typeof bulkDeleteNotificationsSchema>;
