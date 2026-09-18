import {
  PasswordResetTemplateData,
  TaskAssignedTemplateData,
  TaskReminderTemplateData,
  LeaveSubmittedTemplateData,
  LeaveApprovedTemplateData,
  LeaveRejectedTemplateData,
  DailyReportReminderTemplateData,
  AdminNotificationTemplateData,
  WelcomeEmployeeTemplateData,
} from './email.types.js';


/**
 * Escape unsafe characters for HTML inclusion to prevent injection
 */
export function escapeHtml(str?: string | number | boolean | null): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


/**
 * Base layout for WorkOS branded emails
 * Clean, modern, high-contrast monochrome design system (no glassmorphism, no excessive gradients)
 */
function renderBaseLayout({
  title,
  preheader,
  contentHtml,
}: {
  title: string;
  preheader?: string;
  contentHtml: string;
}): string {
  const currentYear = new Date().getFullYear();
  const safeTitle = escapeHtml(title);
  const safePreheader = preheader ? escapeHtml(preheader) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${safeTitle}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #09090b;
      -webkit-font-smoothing: antialiased;
    }
    table {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    .wrapper {
      width: 100%;
      background-color: #f4f4f5;
      padding: 40px 16px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border: 1px solid #e4e4e7;
      border-radius: 8px;
      overflow: hidden;
    }
    .header {
      background-color: #09090b;
      padding: 24px 32px;
      text-align: left;
    }
    .brand {
      color: #ffffff;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
      text-decoration: none;
    }
    .body-content {
      padding: 32px;
      color: #18181b;
      font-size: 15px;
      line-height: 1.6;
    }
    h1 {
      font-size: 20px;
      font-weight: 700;
      color: #09090b;
      margin: 0 0 16px 0;
      letter-spacing: -0.01em;
    }
    p {
      margin: 0 0 16px 0;
      color: #3f3f46;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-urgent { background-color: #fee2e2; color: #991b1b; }
    .badge-high { background-color: #ffedd5; color: #9a3412; }
    .badge-medium { background-color: #fef3c7; color: #92400e; }
    .badge-low { background-color: #f4f4f5; color: #3f3f46; }
    .badge-approved { background-color: #dcfce7; color: #166534; }
    .badge-rejected { background-color: #fee2e2; color: #991b1b; }
    .badge-pending { background-color: #fef3c7; color: #92400e; }
    .card {
      background-color: #fafafa;
      border: 1px solid #e4e4e7;
      border-radius: 6px;
      padding: 20px;
      margin: 20px 0;
    }
    .card-row {
      display: flex;
      margin-bottom: 8px;
      font-size: 14px;
    }
    .card-row:last-child {
      margin-bottom: 0;
    }
    .card-label {
      width: 120px;
      font-weight: 600;
      color: #71717a;
    }
    .card-value {
      flex: 1;
      color: #09090b;
      font-weight: 500;
    }
    .button-container {
      margin: 28px 0 12px 0;
      text-align: left;
    }
    .btn {
      display: inline-block;
      background-color: #09090b;
      color: #ffffff !important;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 14px;
      text-align: center;
    }
    .footer {
      background-color: #fafafa;
      border-top: 1px solid #e4e4e7;
      padding: 24px 32px;
      text-align: center;
      font-size: 12px;
      color: #71717a;
      line-height: 1.5;
    }
    .footer a {
      color: #71717a;
      text-decoration: underline;
    }
    @media only screen and (max-width: 600px) {
      .body-content { padding: 24px 16px; }
      .header { padding: 20px 16px; }
      .footer { padding: 20px 16px; }
      .card-row { flex-direction: column; }
      .card-label { width: 100%; margin-bottom: 2px; }
    }
  </style>
</head>
<body>
  ${safePreheader ? `<div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${safePreheader}</div>` : ''}
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <span class="brand">TeamsTechyArts</span>
      </div>
      <div class="body-content">
        ${contentHtml}
      </div>
      <div class="footer">
        <p style="margin-bottom: 6px;">TeamsTechyArts Employee Work Management System</p>
        <p style="margin-bottom: 0;">This is an automated operational notification. Please do not reply directly to this email.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * 1. Password Reset Template
 */
export function passwordResetTemplate(data: PasswordResetTemplateData): { html: string; text: string; subject: string } {
  const subject = 'Reset Your TeamsTechyArts Password';
  const expiresText = data.expiresInMinutes ? `${data.expiresInMinutes} minutes` : '60 minutes';

  const contentHtml = `
    <h1>Password Reset Request</h1>
    <p>Hello ${escapeHtml(data.userName)},</p>
    <p>We received a request to reset the password for your TeamsTechyArts account. Click the button below to proceed with setting a new password.</p>
    
    <div class="button-container">
      <a href="${escapeHtml(data.resetUrl)}" class="btn" target="_blank">Reset Password</a>
    </div>

    <div class="card">
      <div class="card-row">
        <span class="card-label">Link Expiry:</span>
        <span class="card-value">${expiresText}</span>
      </div>
      <div class="card-row">
        <span class="card-label">Security Note:</span>
        <span class="card-value">If you did not request a password reset, you can safely ignore this email. Your account remains secure.</span>
      </div>
    </div>

    <p style="font-size: 13px; color: #71717a; margin-top: 24px;">
      If the button above does not work, copy and paste this link into your browser:<br/>
      <a href="${escapeHtml(data.resetUrl)}" style="color: #09090b; word-break: break-all;">${escapeHtml(data.resetUrl)}</a>
    </p>
  `;

  const text = `Hello ${data.userName},

We received a request to reset your TeamsTechyArts password.
To reset your password, visit the following link (valid for ${expiresText}):
${data.resetUrl}

If you did not make this request, please ignore this email.

TeamsTechyArts Employee Work Management System`;

  return {
    subject,
    html: renderBaseLayout({ title: subject, preheader: 'Reset your TeamsTechyArts password', contentHtml }),
    text,
  };
}

/**
 * 2. Task Assigned Template
 */
export function taskAssignedTemplate(data: TaskAssignedTemplateData): { html: string; text: string; subject: string } {
  const subject = `New Task Assigned: ${data.taskTitle}`;
  const priorityClass = `badge-${data.priority.toLowerCase()}`;

  const contentHtml = `
    <h1>New Task Assigned</h1>
    <p>Hello ${escapeHtml(data.employeeName)},</p>
    <p>A new task has been assigned to you in TeamsTechyArts.</p>

    <div class="card">
      <div class="card-row">
        <span class="card-label">Task Title:</span>
        <span class="card-value"><strong>${escapeHtml(data.taskTitle)}</strong></span>
      </div>
      ${data.projectName ? `
      <div class="card-row">
        <span class="card-label">Project:</span>
        <span class="card-value">${escapeHtml(data.projectName)}</span>
      </div>` : ''}
      <div class="card-row">
        <span class="card-label">Priority:</span>
        <span class="card-value"><span class="badge ${priorityClass}">${escapeHtml(data.priority)}</span></span>
      </div>
      ${data.dueDate ? `
      <div class="card-row">
        <span class="card-label">Due Date:</span>
        <span class="card-value">${escapeHtml(data.dueDate)}</span>
      </div>` : ''}
      <div class="card-row">
        <span class="card-label">Assigned By:</span>
        <span class="card-value">${escapeHtml(data.assignedBy)}</span>
      </div>
    </div>

    ${data.taskUrl ? `
    <div class="button-container">
      <a href="${escapeHtml(data.taskUrl)}" class="btn" target="_blank">View Task in TeamsTechyArts</a>
    </div>` : ''}
  `;

  const text = `Hello ${data.employeeName},

A new task has been assigned to you:
- Task: ${data.taskTitle}
${data.projectName ? `- Project: ${data.projectName}\n` : ''}- Priority: ${data.priority}
${data.dueDate ? `- Due Date: ${data.dueDate}\n` : ''}- Assigned By: ${data.assignedBy}
${data.taskUrl ? `\nView task: ${data.taskUrl}` : ''}

TeamsTechyArts Employee Work Management System`;

  return {
    subject,
    html: renderBaseLayout({ title: subject, preheader: `New task assigned: ${data.taskTitle}`, contentHtml }),
    text,
  };
}

/**
 * 3. Task Reminder Template
 */
export function taskReminderTemplate(data: TaskReminderTemplateData): { html: string; text: string; subject: string } {
  const subject = `Task Reminder: ${data.taskTitle}`;

  const contentHtml = `
    <h1>Task Reminder</h1>
    <p>Hello ${escapeHtml(data.employeeName)},</p>
    <p>This is an automated reminder regarding an upcoming task deadline.</p>

    <div class="card">
      <div class="card-row">
        <span class="card-label">Task:</span>
        <span class="card-value"><strong>${escapeHtml(data.taskTitle)}</strong></span>
      </div>
      <div class="card-row">
        <span class="card-label">Due Date:</span>
        <span class="card-value"><strong>${escapeHtml(data.dueDate)}</strong></span>
      </div>
      ${data.priority ? `
      <div class="card-row">
        <span class="card-label">Priority:</span>
        <span class="card-value">${escapeHtml(data.priority)}</span>
      </div>` : ''}
    </div>

    ${data.taskUrl ? `
    <div class="button-container">
      <a href="${escapeHtml(data.taskUrl)}" class="btn" target="_blank">Open Task</a>
    </div>` : ''}
  `;

  const text = `Hello ${data.employeeName},

This is a reminder for your task:
- Task: ${data.taskTitle}
- Due Date: ${data.dueDate}
${data.priority ? `- Priority: ${data.priority}\n` : ''}${data.taskUrl ? `\nOpen task: ${data.taskUrl}` : ''}

WorkOS Employee Work Management System`;

  return {
    subject,
    html: renderBaseLayout({ title: subject, preheader: `Task reminder: ${data.taskTitle}`, contentHtml }),
    text,
  };
}

/**
 * 4. Leave Request Submitted Template (for Manager/Admin)
 */
export function leaveSubmittedTemplate(data: LeaveSubmittedTemplateData): { html: string; text: string; subject: string } {
  const subject = `New Leave Request: ${data.employeeName} (${data.leaveType})`;

  const contentHtml = `
    <h1>New Leave Request Submitted</h1>
    <p>Hello ${escapeHtml(data.recipientName)},</p>
    <p><strong>${escapeHtml(data.employeeName)}</strong> has submitted a new leave request requiring review.</p>

    <div class="card">
      <div class="card-row">
        <span class="card-label">Employee:</span>
        <span class="card-value">${escapeHtml(data.employeeName)}</span>
      </div>
      <div class="card-row">
        <span class="card-label">Leave Type:</span>
        <span class="card-value">${escapeHtml(data.leaveType)}</span>
      </div>
      <div class="card-row">
        <span class="card-label">Duration:</span>
        <span class="card-value">${escapeHtml(data.startDate)} to ${escapeHtml(data.endDate)} (${escapeHtml(data.totalDays)} day${Number(data.totalDays) === 1 ? '' : 's'})</span>
      </div>
      <div class="card-row">
        <span class="card-label">Reason:</span>
        <span class="card-value">${escapeHtml(data.reason)}</span>
      </div>
    </div>

    ${data.reviewUrl ? `
    <div class="button-container">
      <a href="${escapeHtml(data.reviewUrl)}" class="btn" target="_blank">Review Leave Request</a>
    </div>` : ''}
  `;

  const text = `Hello ${data.recipientName},

${data.employeeName} has submitted a leave request:
- Leave Type: ${data.leaveType}
- Duration: ${data.startDate} to ${data.endDate} (${data.totalDays} days)
- Reason: ${data.reason}
${data.reviewUrl ? `\nReview here: ${data.reviewUrl}` : ''}

WorkOS Employee Work Management System`;

  return {
    subject,
    html: renderBaseLayout({ title: subject, preheader: `Leave request submitted by ${data.employeeName}`, contentHtml }),
    text,
  };
}

/**
 * 5. Leave Approved Template
 */
export function leaveApprovedTemplate(data: LeaveApprovedTemplateData): { html: string; text: string; subject: string } {
  const subject = `Leave Request Approved: ${data.leaveType}`;

  const contentHtml = `
    <h1>Leave Request Approved</h1>
    <p>Hello ${escapeHtml(data.employeeName)},</p>
    <p>Good news! Your leave request has been approved.</p>

    <div class="card">
      <div class="card-row">
        <span class="card-label">Status:</span>
        <span class="card-value"><span class="badge badge-approved">APPROVED</span></span>
      </div>
      <div class="card-row">
        <span class="card-label">Leave Type:</span>
        <span class="card-value">${escapeHtml(data.leaveType)}</span>
      </div>
      <div class="card-row">
        <span class="card-label">Period:</span>
        <span class="card-value">${escapeHtml(data.startDate)} to ${escapeHtml(data.endDate)} (${escapeHtml(data.totalDays)} days)</span>
      </div>
      ${data.reviewedBy ? `
      <div class="card-row">
        <span class="card-label">Approved By:</span>
        <span class="card-value">${escapeHtml(data.reviewedBy)}</span>
      </div>` : ''}
      ${data.comment ? `
      <div class="card-row">
        <span class="card-label">Review Note:</span>
        <span class="card-value">${escapeHtml(data.comment)}</span>
      </div>` : ''}
    </div>
  `;

  const text = `Hello ${data.employeeName},

Your leave request has been APPROVED.
- Leave Type: ${data.leaveType}
- Period: ${data.startDate} to ${data.endDate} (${data.totalDays} days)
${data.reviewedBy ? `- Approved By: ${data.reviewedBy}\n` : ''}${data.comment ? `- Note: ${data.comment}\n` : ''}
WorkOS Employee Work Management System`;

  return {
    subject,
    html: renderBaseLayout({ title: subject, preheader: `Leave request approved: ${data.leaveType}`, contentHtml }),
    text,
  };
}

/**
 * 6. Leave Rejected Template
 */
export function leaveRejectedTemplate(data: LeaveRejectedTemplateData): { html: string; text: string; subject: string } {
  const subject = `Leave Request Update: ${data.leaveType}`;

  const contentHtml = `
    <h1>Leave Request Update</h1>
    <p>Hello ${escapeHtml(data.employeeName)},</p>
    <p>Your leave request has been reviewed and declined.</p>

    <div class="card">
      <div class="card-row">
        <span class="card-label">Status:</span>
        <span class="card-value"><span class="badge badge-rejected">REJECTED</span></span>
      </div>
      <div class="card-row">
        <span class="card-label">Leave Type:</span>
        <span class="card-value">${escapeHtml(data.leaveType)}</span>
      </div>
      <div class="card-row">
        <span class="card-label">Period:</span>
        <span class="card-value">${escapeHtml(data.startDate)} to ${escapeHtml(data.endDate)} (${escapeHtml(data.totalDays)} days)</span>
      </div>
      ${data.reviewedBy ? `
      <div class="card-row">
        <span class="card-label">Reviewed By:</span>
        <span class="card-value">${escapeHtml(data.reviewedBy)}</span>
      </div>` : ''}
      ${data.reason ? `
      <div class="card-row">
        <span class="card-label">Reason:</span>
        <span class="card-value">${escapeHtml(data.reason)}</span>
      </div>` : ''}
    </div>
  `;

  const text = `Hello ${data.employeeName},

Your leave request has been REJECTED.
- Leave Type: ${data.leaveType}
- Period: ${data.startDate} to ${data.endDate} (${data.totalDays} days)
${data.reviewedBy ? `- Reviewed By: ${data.reviewedBy}\n` : ''}${data.reason ? `- Reason: ${data.reason}\n` : ''}
WorkOS Employee Work Management System`;

  return {
    subject,
    html: renderBaseLayout({ title: subject, preheader: `Leave request rejected: ${data.leaveType}`, contentHtml }),
    text,
  };
}

/**
 * 7. Daily Work Report Reminder Template
 */
export function dailyReportReminderTemplate(data: DailyReportReminderTemplateData): { html: string; text: string; subject: string } {
  const subject = `Daily Work Report Reminder - ${data.reportDate}`;

  const contentHtml = `
    <h1>Daily Work Report Reminder</h1>
    <p>Hello ${escapeHtml(data.employeeName)},</p>
    <p>This is a friendly reminder to submit your Daily Work Report for <strong>${escapeHtml(data.reportDate)}</strong> before logging off.</p>

    ${data.reportUrl ? `
    <div class="button-container">
      <a href="${escapeHtml(data.reportUrl)}" class="btn" target="_blank">Submit Daily Report</a>
    </div>` : ''}
  `;

  const text = `Hello ${data.employeeName},

This is a reminder to submit your Daily Work Report for ${data.reportDate}.
${data.reportUrl ? `Submit here: ${data.reportUrl}\n` : ''}
WorkOS Employee Work Management System`;

  return {
    subject,
    html: renderBaseLayout({ title: subject, preheader: `Daily report reminder for ${data.reportDate}`, contentHtml }),
    text,
  };
}

/**
 * 8. Admin Notification Template
 */
export function adminNotificationTemplate(data: AdminNotificationTemplateData): { html: string; text: string; subject: string } {
  const subject = `[WorkOS Alert] ${data.title}`;

  let metadataRows = '';
  if (data.metadata) {
    metadataRows = Object.entries(data.metadata)
      .map(
        ([key, val]) => `
      <div class="card-row">
        <span class="card-label">${escapeHtml(key)}:</span>
        <span class="card-value">${escapeHtml(val)}</span>
      </div>`
      )
      .join('');
  }

  const contentHtml = `
    <h1>Admin Notification</h1>
    <p>Hello ${escapeHtml(data.adminName)},</p>
    <p>${escapeHtml(data.message)}</p>

    ${metadataRows ? `<div class="card">${metadataRows}</div>` : ''}

    ${data.actionUrl ? `
    <div class="button-container">
      <a href="${escapeHtml(data.actionUrl)}" class="btn" target="_blank">View Details</a>
    </div>` : ''}
  `;

  const text = `Hello ${data.adminName},

${data.message}
${data.metadata ? JSON.stringify(data.metadata, null, 2) : ''}
${data.actionUrl ? `View details: ${data.actionUrl}\n` : ''}
WorkOS Employee Work Management System`;

  return {
    subject,
    html: renderBaseLayout({ title: subject, preheader: data.title, contentHtml }),
    text,
  };
}

/**
 * 9. Welcome Employee / Account Created Template
 */
export function welcomeEmployeeTemplate(data: WelcomeEmployeeTemplateData): { html: string; text: string; subject: string } {
  const subject = 'Congratulations! Your TeamsTechyArts Attendance Portal account is ready';
  const userEmail = data.loginEmail || data.email || '';

  const contentHtml = `
    <h1>Congratulations! Your TeamsTechyArts Attendance Portal account is ready</h1>
    <p>Hello <strong>${escapeHtml(data.employeeName)}</strong>,</p>
    <p>Welcome to TeamsTechyArts. Your official employee account has been created by your administrator. You can now log in to the portal using your credentials below.</p>

    <div class="card">
      <div class="card-row">
        <span class="card-label">Login Email:</span>
        <span class="card-value"><strong>${escapeHtml(userEmail)}</strong></span>
      </div>
      <div class="card-row">
        <span class="card-label">Temporary Password:</span>
        <span class="card-value" style="font-family: monospace; font-size: 15px; font-weight: 700; color: #09090b; background-color: #e4e4e7; padding: 2px 8px; border-radius: 4px;">${escapeHtml(data.temporaryPassword)}</span>
      </div>
      ${data.employeeCode ? `
      <div class="card-row">
        <span class="card-label">Employee Code:</span>
        <span class="card-value">${escapeHtml(data.employeeCode)}</span>
      </div>` : ''}
      ${data.departmentName ? `
      <div class="card-row">
        <span class="card-label">Department:</span>
        <span class="card-value">${escapeHtml(data.departmentName)}</span>
      </div>` : ''}
      ${data.designationName ? `
      <div class="card-row">
        <span class="card-label">Designation:</span>
        <span class="card-value">${escapeHtml(data.designationName)}</span>
      </div>` : ''}
    </div>

    <div class="card" style="background-color: #fffbeb; border-color: #fde68a;">
      <div style="font-size: 13px; color: #92400e; line-height: 1.5;">
        <strong>⚠️ Mandatory Security Notice:</strong><br/>
        For your security, you will be required to change this temporary password immediately upon your first login before you can access portal features.
      </div>
    </div>

    <div class="button-container">
      <a href="${escapeHtml(data.loginUrl)}" class="btn" target="_blank">Log In to TeamsTechyArts</a>
    </div>

    <p style="font-size: 13px; color: #71717a; margin-top: 24px;">
      Direct Login URL: <a href="${escapeHtml(data.loginUrl)}" style="color: #09090b; word-break: break-all;">${escapeHtml(data.loginUrl)}</a>
    </p>
  `;

  const text = `Congratulations ${data.employeeName}! Your TeamsTechyArts Attendance Portal account is ready.

Welcome to TeamsTechyArts. Your account details:
- Login Email: ${userEmail}
- Temporary Password: ${data.temporaryPassword}
${data.employeeCode ? `- Employee Code: ${data.employeeCode}\n` : ''}${data.departmentName ? `- Department: ${data.departmentName}\n` : ''}${data.designationName ? `- Designation: ${data.designationName}\n` : ''}
MANDATORY SECURITY NOTICE:
You will be required to change your temporary password immediately upon your first login.

Log in here:
${data.loginUrl}

TeamsTechyArts Employee Work Management System`;

  return {
    subject,
    html: renderBaseLayout({ title: subject, preheader: 'Your TeamsTechyArts account has been created', contentHtml }),
    text,
  };
}

