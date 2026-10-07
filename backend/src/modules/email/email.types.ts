export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  notificationId?: string;
  userId?: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  skipped?: boolean;
}

export interface PasswordResetTemplateData {
  userName: string;
  resetUrl: string;
  expiresInMinutes?: number;
}

export interface TaskAssignedTemplateData {
  employeeName: string;
  taskTitle: string;
  projectName?: string;
  priority: string;
  dueDate?: string;
  assignedBy: string;
  taskUrl?: string;
}

export interface TaskReminderTemplateData {
  employeeName: string;
  taskTitle: string;
  priority?: string;
  dueDate: string;
  taskUrl?: string;
}

export interface LeaveSubmittedTemplateData {
  recipientName: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number | string;
  reason: string;
  reviewUrl?: string;
}

export interface LeaveApprovedTemplateData {
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number | string;
  reviewedBy?: string;
  comment?: string;
}

export interface LeaveRejectedTemplateData {
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number | string;
  reviewedBy?: string;
  reason?: string;
}

export interface DailyReportReminderTemplateData {
  employeeName: string;
  reportDate: string;
  reportUrl?: string;
}

export interface AdminNotificationTemplateData {
  adminName: string;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface WelcomeEmployeeTemplateData {
  employeeName: string;
  email?: string;
  loginEmail?: string;
  temporaryPassword: string;
  loginUrl: string;
  employeeCode?: string;
  role?: string;
  departmentName?: string;
  designationName?: string;
}

export interface CheckInReminderTemplateData {
  employeeName: string;
  scheduledTime: string;
  date: string;
  quote: string;
  quoteAuthor?: string;
  attendanceUrl?: string;
}

export interface CheckOutReminderTemplateData {
  employeeName: string;
  scheduledCheckoutTime: string;
  date: string;
  attendanceUrl?: string;
}

export interface EightHourCheckoutReminderTemplateData {
  employeeName: string;
  workedDuration: string;
  date: string;
  overtimeUrl?: string;
  attendanceUrl?: string;
}

export interface ThirtyMinuteCheckoutReminderTemplateData {
  employeeName: string;
  workedDuration: string;
  overtimeUrl?: string;
  attendanceUrl?: string;
}

export interface TomorrowHolidayTemplateData {
  employeeName: string;
  holidayName: string;
  holidayDate: string;
  description?: string;
}

export interface TaskDeadlineTemplateData {
  employeeName: string;
  taskTitle: string;
  projectName?: string;
  dueDate: string;
  priority?: string;
  timeRemaining?: string;
  taskUrl?: string;
}

export interface ScheduledTaskTemplateData {
  employeeName: string;
  taskTitle: string;
  projectName?: string;
  scheduledTime: string;
  priority?: string;
  taskUrl?: string;
}

export interface LongRunningTimerTemplateData {
  employeeName: string;
  taskTitle: string;
  projectName?: string;
  startedAt: string;
  elapsedMinutes: number | string;
  taskUrl?: string;
}


