import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../../config/env.js';
import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';
import {
  SendEmailOptions,
  EmailSendResult,
  PasswordResetTemplateData,
  TaskAssignedTemplateData,
  TaskReminderTemplateData,
  LeaveSubmittedTemplateData,
  LeaveApprovedTemplateData,
  LeaveRejectedTemplateData,
  DailyReportReminderTemplateData,
  AdminNotificationTemplateData,
  WelcomeEmployeeTemplateData,
  CheckInReminderTemplateData,
  CheckOutReminderTemplateData,
  EightHourCheckoutReminderTemplateData,
  ThirtyMinuteCheckoutReminderTemplateData,
  TomorrowHolidayTemplateData,
  TaskDeadlineTemplateData,
  ScheduledTaskTemplateData,
  LongRunningTimerTemplateData,
} from './email.types.js';
import {
  passwordResetTemplate,
  taskAssignedTemplate,
  taskReminderTemplate,
  leaveSubmittedTemplate,
  leaveApprovedTemplate,
  leaveRejectedTemplate,
  dailyReportReminderTemplate,
  adminNotificationTemplate,
  welcomeEmployeeTemplate,
  checkInReminderTemplate,
  checkOutReminderTemplate,
  eightHourCheckoutReminderTemplate,
  thirtyMinuteCheckoutReminderTemplate,
  tomorrowHolidayTemplate,
  taskDeadlineTemplate,
  scheduledTaskTemplate,
  longRunningTimerTemplate,
} from './email.templates.js';


export class EmailService {
  private static transporterInstance: Transporter | null = null;
  private static isInitialized = false;

  /**
   * Helper to validate email addresses
   */
  public static isValidEmail(email: string): boolean {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  /**
   * Mask email address for privacy-compliant logging
   */
  public static maskEmail(email: string | string[]): string {
    const mask = (addr: string) => {
      const parts = addr.trim().split('@');
      if (parts.length !== 2) return '***';
      const name = parts[0];
      const domain = parts[1];
      const maskedName = name.length > 2 ? `${name[0]}***${name[name.length - 1]}` : '***';
      return `${maskedName}@${domain}`;
    };

    if (Array.isArray(email)) {
      return email.map(mask).join(', ');
    }
    return mask(email);
  }

  /**
   * Get or create singleton Nodemailer transporter
   */
  public static getTransporter(): Transporter {
    if (!this.transporterInstance) {
      const transportConfig: any = {
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
      };

      if (config.smtpUser && config.smtpPassword) {
        transportConfig.auth = {
          user: config.smtpUser,
          pass: config.smtpPassword,
        };
      }

      this.transporterInstance = nodemailer.createTransport(transportConfig);
    }
    return this.transporterInstance;
  }

  /**
   * Override transporter (useful for unit tests and mocks)
   */
  public static setTransporter(transporter: Transporter | null): void {
    this.transporterInstance = transporter;
  }

  /**
   * Startup verification and SMTP diagnostics
   */
  public static async init(): Promise<{ success: boolean; message: string }> {
    if (this.isInitialized) {
      return { success: true, message: 'Email service already initialized' };
    }

    if (!config.emailEnabled) {
      console.log('ℹ️  [EmailService] Email delivery is disabled (EMAIL_ENABLED=false or SMTP_HOST not configured)');
      this.isInitialized = true;
      return { success: true, message: 'Email service disabled' };
    }

    try {
      const transporter = this.getTransporter();
      await transporter.verify();
      console.log(`✉️  [EmailService] SMTP connection verified successfully (${config.smtpHost}:${config.smtpPort})`);
      this.isInitialized = true;
      return { success: true, message: 'SMTP connection verified successfully' };
    } catch (err: any) {
      // Resilient startup: Do not crash application, log the configuration issue clearly without leaking secrets
      console.warn(`⚠️  [EmailService] SMTP verification failed on startup: ${err.message}. The service will attempt sending on-demand.`);
      this.isInitialized = true;
      return { success: false, message: `SMTP verification failed: ${err.message}` };
    }
  }

  /**
   * Send a general email
   */
  public static async sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
    const rawRecipients = Array.isArray(options.to) ? options.to : [options.to];
    const validRecipients = rawRecipients.map((r) => r.trim()).filter((r) => this.isValidEmail(r));

    if (validRecipients.length === 0) {
      console.warn(`⚠️  [EmailService] [email.send.failed] No valid recipient email address provided`);
      if (options.notificationId) {
        await this.recordDelivery({
          notificationId: options.notificationId,
          delivered: false,
          failed: true,
          failureReason: 'Invalid or missing recipient email address',
        });
      }
      return { success: false, error: 'Invalid or missing recipient email address' };
    }

    const maskedRecipients = this.maskEmail(validRecipients);

    // If email is globally disabled or SMTP is unconfigured, log and simulate
    if (!config.emailEnabled || !config.smtpHost) {
      console.log(`[EmailService] [email.send.skipped] (Disabled/Simulated) To: ${maskedRecipients} | Subject: "${options.subject}"`);
      if (options.notificationId) {
        await this.recordDelivery({
          notificationId: options.notificationId,
          delivered: true,
          deliveredAt: new Date(),
          failed: false,
        });
      }
      return { success: true, skipped: true };
    }

    console.log(`[EmailService] [email.send.started] To: ${maskedRecipients} | Subject: "${options.subject}"`);

    try {
      const transporter = this.getTransporter();
      const info = await transporter.sendMail({
        from: `"${config.smtpFromName}" <${config.smtpFromEmail}>`,
        to: validRecipients,
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo,
        cc: options.cc,
        bcc: options.bcc,
      });

      console.log(`[EmailService] [email.send.success] MessageID: ${info.messageId} | To: ${maskedRecipients}`);

      if (options.notificationId) {
        await this.recordDelivery({
          notificationId: options.notificationId,
          delivered: true,
          deliveredAt: new Date(),
          failed: false,
        });
      }

      return { success: true, messageId: info.messageId };
    } catch (err: any) {
      console.error(`[EmailService] [email.send.failed] To: ${maskedRecipients} | Error: ${err.message}`);

      if (options.notificationId) {
        await this.recordDelivery({
          notificationId: options.notificationId,
          delivered: false,
          failed: true,
          failureReason: err.message || 'SMTP delivery failed',
        });
      }

      return { success: false, error: err.message };
    }
  }

  /**
   * Helper: Record email delivery status in database
   */
  private static async recordDelivery(params: {
    notificationId: string;
    delivered: boolean;
    deliveredAt?: Date | null;
    failed: boolean;
    failureReason?: string | null;
  }): Promise<void> {
    try {
      await DbService.query(
        async () => {
          return await prisma.notificationDelivery.create({
            data: {
              notificationId: params.notificationId,
              channel: 'EMAIL',
              delivered: params.delivered,
              deliveredAt: params.deliveredAt || null,
              failed: params.failed,
              failureReason: params.failureReason || null,
            },
          });
        },
        async () => {
          return await DbService.restRequest('/notification_deliveries', {
            method: 'POST',
            body: {
              notification_id: params.notificationId,
              channel: 'EMAIL',
              delivered: params.delivered,
              delivered_at: params.deliveredAt ? params.deliveredAt.toISOString() : null,
              failed: params.failed,
              failure_reason: params.failureReason || null,
            },
          });
        }
      );
    } catch (dbErr: any) {
      console.error(`[EmailService] Failed to record notification delivery:`, dbErr.message);
    }
  }

  /**
   * Helper to create in-app notification and dispatch email in background
   */
  public static async createAndNotify(params: {
    userId: string;
    type: any;
    title: string;
    message: string;
    actionUrl?: string;
    email?: {
      to: string;
      subject: string;
      html: string;
      text?: string;
    };
  }): Promise<any> {
    const { NotificationService } = await import('../notifications/notification.service.js');
    return await NotificationService.createNotification({
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      actionUrl: params.actionUrl,
      email: params.email,
    });
  }

  // ==========================================
  // TEMPLATE-SPECIFIC METHODS
  // ==========================================

  /**
   * Password Reset Email
   */
  public static async sendPasswordReset(
    to: string,
    data: PasswordResetTemplateData
  ): Promise<EmailSendResult> {
    const template = passwordResetTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Task Assigned Email
   */
  public static async sendTaskAssigned(
    to: string,
    data: TaskAssignedTemplateData,
    options?: { notificationId?: string; userId?: string }
  ): Promise<EmailSendResult> {
    const template = taskAssignedTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      notificationId: options?.notificationId,
      userId: options?.userId,
    });
  }

  /**
   * Task Reminder Email
   */
  public static async sendTaskReminder(
    to: string,
    data: TaskReminderTemplateData,
    options?: { notificationId?: string; userId?: string }
  ): Promise<EmailSendResult> {
    const template = taskReminderTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      notificationId: options?.notificationId,
      userId: options?.userId,
    });
  }

  /**
   * Leave Submitted Notification Email (for Reviewers)
   */
  public static async sendLeaveSubmitted(
    to: string,
    data: LeaveSubmittedTemplateData,
    options?: { notificationId?: string; userId?: string }
  ): Promise<EmailSendResult> {
    const template = leaveSubmittedTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      notificationId: options?.notificationId,
      userId: options?.userId,
    });
  }

  /**
   * Leave Approved Notification Email (for Employee)
   */
  public static async sendLeaveApproved(
    to: string,
    data: LeaveApprovedTemplateData,
    options?: { notificationId?: string; userId?: string }
  ): Promise<EmailSendResult> {
    const template = leaveApprovedTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      notificationId: options?.notificationId,
      userId: options?.userId,
    });
  }

  /**
   * Leave Rejected Notification Email (for Employee)
   */
  public static async sendLeaveRejected(
    to: string,
    data: LeaveRejectedTemplateData,
    options?: { notificationId?: string; userId?: string }
  ): Promise<EmailSendResult> {
    const template = leaveRejectedTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      notificationId: options?.notificationId,
      userId: options?.userId,
    });
  }

  /**
   * Daily Work Report Reminder Email
   */
  public static async sendDailyReportReminder(
    to: string,
    data: DailyReportReminderTemplateData,
    options?: { notificationId?: string; userId?: string }
  ): Promise<EmailSendResult> {
    const template = dailyReportReminderTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      notificationId: options?.notificationId,
      userId: options?.userId,
    });
  }

  /**
   * Admin Notification / System Alert Email
   */
  public static async sendAdminNotification(
    to: string,
    data: AdminNotificationTemplateData,
    options?: { notificationId?: string; userId?: string }
  ): Promise<EmailSendResult> {
    const template = adminNotificationTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      notificationId: options?.notificationId,
      userId: options?.userId,
    });
  }

  /**
   * Welcome Employee / Account Created Email
   */
  public static async sendWelcomeEmployee(
    to: string,
    data: WelcomeEmployeeTemplateData,
    options?: { notificationId?: string; userId?: string }
  ): Promise<EmailSendResult> {
    const template = welcomeEmployeeTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      notificationId: options?.notificationId,
      userId: options?.userId,
    });
  }

  /**
   * Daily Check-in Reminder Email
   */
  public static async sendCheckInReminder(
    to: string,
    data: CheckInReminderTemplateData,
    options?: { notificationId?: string; userId?: string }
  ): Promise<EmailSendResult> {
    const template = checkInReminderTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      notificationId: options?.notificationId,
      userId: options?.userId,
    });
  }

  /**
   * Scheduled Checkout Reminder Email
   */
  public static async sendCheckOutReminder(
    to: string,
    data: CheckOutReminderTemplateData,
    options?: { notificationId?: string; userId?: string }
  ): Promise<EmailSendResult> {
    const template = checkOutReminderTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      notificationId: options?.notificationId,
      userId: options?.userId,
    });
  }

  /**
   * 8-Hour Checkout Reminder Email
   */
  public static async sendEightHourCheckoutReminder(
    to: string,
    data: EightHourCheckoutReminderTemplateData,
    options?: { notificationId?: string; userId?: string }
  ): Promise<EmailSendResult> {
    const template = eightHourCheckoutReminderTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      notificationId: options?.notificationId,
      userId: options?.userId,
    });
  }

  /**
   * 30-Minute Repeated Checkout Reminder Email
   */
  public static async sendThirtyMinuteCheckoutReminder(
    to: string,
    data: ThirtyMinuteCheckoutReminderTemplateData,
    options?: { notificationId?: string; userId?: string }
  ): Promise<EmailSendResult> {
    const template = thirtyMinuteCheckoutReminderTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      notificationId: options?.notificationId,
      userId: options?.userId,
    });
  }

  /**
   * Tomorrow is Holiday Notification Email
   */
  public static async sendTomorrowHoliday(
    to: string,
    data: TomorrowHolidayTemplateData,
    options?: { notificationId?: string; userId?: string }
  ): Promise<EmailSendResult> {
    const template = tomorrowHolidayTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      notificationId: options?.notificationId,
      userId: options?.userId,
    });
  }

  /**
   * Task Deadline Approaching Email
   */
  public static async sendTaskDeadlineReminder(
    to: string,
    data: TaskDeadlineTemplateData,
    options?: { notificationId?: string; userId?: string }
  ): Promise<EmailSendResult> {
    const template = taskDeadlineTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      notificationId: options?.notificationId,
      userId: options?.userId,
    });
  }

  /**
   * Scheduled Task Reminder Email
   */
  public static async sendScheduledTaskReminder(
    to: string,
    data: ScheduledTaskTemplateData,
    options?: { notificationId?: string; userId?: string }
  ): Promise<EmailSendResult> {
    const template = scheduledTaskTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      notificationId: options?.notificationId,
      userId: options?.userId,
    });
  }

  /**
   * Long-Running Timer Warning Email
   */
  public static async sendLongRunningTimerWarning(
    to: string,
    data: LongRunningTimerTemplateData,
    options?: { notificationId?: string; userId?: string }
  ): Promise<EmailSendResult> {
    const template = longRunningTimerTemplate(data);
    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      notificationId: options?.notificationId,
      userId: options?.userId,
    });
  }

  /**
   * Legacy method support for backward compatibility with existing services
   */
  public static async sendLeaveDecision(
    to: string,
    status: string,
    reason?: string
  ): Promise<boolean> {
    if (status === 'APPROVED') {
      const res = await this.sendLeaveApproved(to, {
        employeeName: 'Employee',
        leaveType: 'Leave Request',
        startDate: 'Scheduled Period',
        endDate: '',
        totalDays: '',
        comment: reason,
      });
      return res.success;
    } else {
      const res = await this.sendLeaveRejected(to, {
        employeeName: 'Employee',
        leaveType: 'Leave Request',
        startDate: 'Scheduled Period',
        endDate: '',
        totalDays: '',
        reason,
      });
      return res.success;
    }
  }
}

