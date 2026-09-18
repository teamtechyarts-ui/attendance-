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

