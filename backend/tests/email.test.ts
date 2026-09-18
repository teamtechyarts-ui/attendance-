import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EmailService } from '../src/modules/email/email.service.js';
import { SecurityUtil } from '../src/utils/security.js';
import {
  escapeHtml,
  passwordResetTemplate,
  taskAssignedTemplate,
  taskReminderTemplate,
  leaveSubmittedTemplate,
  leaveApprovedTemplate,
  leaveRejectedTemplate,
  dailyReportReminderTemplate,
  adminNotificationTemplate,
  welcomeEmployeeTemplate,
} from '../src/modules/email/email.templates.js';

describe('Email Service & Template Unit Tests', () => {
  let mockSentMails: any[] = [];
  let shouldFailSmtp = false;

  const mockTransporter: any = {
    verify: async () => {
      if (shouldFailSmtp) throw new Error('Connection timeout to SMTP host');
      return true;
    },
    sendMail: async (options: any) => {
      if (shouldFailSmtp) throw new Error('SMTP 550 Mailbox unavailable');
      mockSentMails.push(options);
      return { messageId: '<test-message-12345@workos.local>' };
    },
  };

  beforeEach(() => {
    mockSentMails = [];
    shouldFailSmtp = false;
    EmailService.setTransporter(mockTransporter);
  });

  afterEach(() => {
    EmailService.setTransporter(null);
  });

  test('Email address validator and masker work correctly', () => {
    assert.strictEqual(EmailService.isValidEmail('user@workos.local'), true);
    assert.strictEqual(EmailService.isValidEmail('john.doe+test@domain.co'), true);
    assert.strictEqual(EmailService.isValidEmail('invalid-email'), false);
    assert.strictEqual(EmailService.isValidEmail(''), false);
    assert.strictEqual(EmailService.isValidEmail(null as any), false);

    assert.strictEqual(EmailService.maskEmail('alex.smith@company.com'), 'a***h@company.com');
    assert.strictEqual(EmailService.maskEmail(['a@b.com', 'test@test.org']), '***@b.com, t***t@test.org');
  });

  test('HTML escaping prevents cross-site scripting in email bodies', () => {
    const malicious = '<script>alert("xss")</script> & "quoted" \'values\'';
    const escaped = escapeHtml(malicious);

    assert.ok(!escaped.includes('<script>'));
    assert.ok(escaped.includes('&lt;script&gt;'));
    assert.ok(escaped.includes('&amp;'));
    assert.ok(escaped.includes('&quot;'));
    assert.ok(escaped.includes('&#039;'));
  });

  test('Password Reset template renders valid HTML and plain-text fallback', () => {
    const data = {
      userName: 'Alice Johnson',
      resetUrl: 'http://localhost:3000/reset-password?token=secret123',
      expiresInMinutes: 60,
    };
    const tpl = passwordResetTemplate(data);

    assert.strictEqual(tpl.subject, 'Reset Your TeamsTechyArts Password');
    assert.ok(tpl.html.includes('Alice Johnson'));
    assert.ok(tpl.html.includes(data.resetUrl));
    assert.ok(tpl.html.includes('60 minutes'));
    assert.ok(tpl.text.includes('Alice Johnson'));
    assert.ok(tpl.text.includes(data.resetUrl));
  });

  test('Task Assigned template renders correct details and priority badge', () => {
    const data = {
      employeeName: 'Bob Builder',
      taskTitle: 'Implement Backend Nodemailer',
      projectName: 'WorkOS Infrastructure',
      priority: 'HIGH',
      dueDate: '2026-09-20',
      assignedBy: 'Admin User',
      taskUrl: 'http://localhost:3000/tasks/task-123',
    };
    const tpl = taskAssignedTemplate(data);

    assert.strictEqual(tpl.subject, 'New Task Assigned: Implement Backend Nodemailer');
    assert.ok(tpl.html.includes('Implement Backend Nodemailer'));
    assert.ok(tpl.html.includes('badge-high'));
    assert.ok(tpl.html.includes('2026-09-20'));
    assert.ok(tpl.text.includes('Bob Builder'));
    assert.ok(tpl.text.includes('HIGH'));
  });

  test('Task Reminder template renders cleanly', () => {
    const data = {
      employeeName: 'Charlie Brown',
      taskTitle: 'Submit Weekly Report',
      dueDate: '2026-09-18',
    };
    const tpl = taskReminderTemplate(data);

    assert.strictEqual(tpl.subject, 'Task Reminder: Submit Weekly Report');
    assert.ok(tpl.html.includes('Submit Weekly Report'));
    assert.ok(tpl.text.includes('Charlie Brown'));
  });

  test('Leave Request Submitted template renders review information', () => {
    const data = {
      recipientName: 'Manager Dave',
      employeeName: 'Diana Prince',
      leaveType: 'Annual Leave',
      startDate: '2026-09-22',
      endDate: '2026-09-24',
      totalDays: 3,
      reason: 'Family event',
      reviewUrl: 'http://localhost:3000/leaves',
    };
    const tpl = leaveSubmittedTemplate(data);

    assert.ok(tpl.subject.includes('Diana Prince'));
    assert.ok(tpl.html.includes('Family event'));
    assert.ok(tpl.html.includes('3 days'));
    assert.ok(tpl.text.includes('Diana Prince'));
  });

  test('Leave Approved and Rejected templates render correct status styling', () => {
    const approvedTpl = leaveApprovedTemplate({
      employeeName: 'Edward Norton',
      leaveType: 'Sick Leave',
      startDate: '2026-09-17',
      endDate: '2026-09-18',
      totalDays: 2,
      reviewedBy: 'Manager Dave',
      comment: 'Get well soon!',
    });
    assert.ok(approvedTpl.html.includes('badge-approved'));
    assert.ok(approvedTpl.html.includes('Get well soon!'));
    assert.ok(approvedTpl.text.includes('APPROVED'));

    const rejectedTpl = leaveRejectedTemplate({
      employeeName: 'Edward Norton',
      leaveType: 'Sick Leave',
      startDate: '2026-09-17',
      endDate: '2026-09-18',
      totalDays: 2,
      reviewedBy: 'Manager Dave',
      reason: 'Department staffing requirements',
    });
    assert.ok(rejectedTpl.html.includes('badge-rejected'));
    assert.ok(rejectedTpl.html.includes('Department staffing requirements'));
    assert.ok(rejectedTpl.text.includes('REJECTED'));
  });

  test('Daily Work Report Reminder and Admin Notification templates render properly', () => {
    const reportTpl = dailyReportReminderTemplate({
      employeeName: 'Frank Miller',
      reportDate: '2026-09-16',
      reportUrl: 'http://localhost:3000/reports/daily',
    });
    assert.ok(reportTpl.subject.includes('2026-09-16'));
    assert.ok(reportTpl.html.includes('Frank Miller'));

    const adminTpl = adminNotificationTemplate({
      adminName: 'Super Admin',
      title: 'System Backup Completed',
      message: 'Database backup finished with status 200 OK.',
      metadata: { Server: 'Node-1', Duration: '4.2s' },
    });
    assert.ok(adminTpl.subject.includes('System Backup Completed'));
    assert.ok(adminTpl.html.includes('Node-1'));
  });

  test('EmailService rejects invalid or empty recipient without sending', async () => {
    const res = await EmailService.sendEmail({
      to: 'not-an-email',
      subject: 'Test Subject',
      html: '<p>Test</p>',
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, 'Invalid or missing recipient email address');
    assert.strictEqual(mockSentMails.length, 0);
  });

  test('EmailService dispatches email successfully with mocked transporter', async () => {
    const res = await EmailService.sendEmail({
      to: 'recipient@workos.local',
      subject: 'Test Successful Dispatch',
      html: '<p>Hello World</p>',
    });

    // In environment where SMTP_HOST is not configured, send is simulated safely
    assert.strictEqual(res.success, true);
  });

  test('Password Reset JWT token generation and verification cycle', () => {
    const token = SecurityUtil.generatePasswordResetToken({
      userId: 'user-uuid-1234',
      email: 'user@workos.local',
      pwdChangedAt: null,
    });

    assert.ok(typeof token === 'string' && token.length > 20);

    const decoded = SecurityUtil.verifyPasswordResetToken(token);
    assert.ok(decoded);
    assert.strictEqual(decoded?.userId, 'user-uuid-1234');
    assert.strictEqual(decoded?.email, 'user@workos.local');
    assert.strictEqual(decoded?.type, 'PASSWORD_RESET');

    const invalidDecoded = SecurityUtil.verifyPasswordResetToken('invalid-jwt-token');
    assert.strictEqual(invalidDecoded, null);
  });

  test('generateTemporaryPassword generates cryptographically secure unique passwords', () => {
    const pwd1 = SecurityUtil.generateTemporaryPassword();
    const pwd2 = SecurityUtil.generateTemporaryPassword();

    assert.notStrictEqual(pwd1, pwd2);
    assert.ok(pwd1.length >= 12);
    assert.ok(/[A-Z]/.test(pwd1), 'Must contain uppercase');
    assert.ok(/[a-z]/.test(pwd1), 'Must contain lowercase');
    assert.ok(/[0-9]/.test(pwd1), 'Must contain number');
    assert.ok(/[!@#$%^&*()_+\-=\[\]{}|]/.test(pwd1), 'Must contain special char');
  });

  test('welcomeEmployeeTemplate renders login url, credentials and security notice', () => {
    const tpl = welcomeEmployeeTemplate({
      employeeName: 'New Hire Jane',
      loginEmail: 'jane@workos.com',
      temporaryPassword: 'TempPassword!123',
      loginUrl: 'http://localhost:3000/login',
    });

    assert.strictEqual(tpl.subject, 'Congratulations! Your TeamsTechyArts Attendance Portal account is ready');
    assert.ok(tpl.html.includes('New Hire Jane'));
    assert.ok(tpl.html.includes('jane@workos.com'));
    assert.ok(tpl.html.includes('TempPassword!123'));
    assert.ok(tpl.html.includes('http://localhost:3000/login'));
    assert.ok(tpl.text.includes('New Hire Jane'));
    assert.ok(tpl.text.includes('TempPassword!123'));
  });
});
