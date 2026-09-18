import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { config } from '../../config/env.js';
import { EmailService } from './email.service.js';

export async function emailRoutes(fastify: FastifyInstance) {
  // Admin-only diagnostics routes
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireRole(['SUPER_ADMIN', 'ADMIN']));

  /**
   * GET /api/admin/email/status
   * Safe status check: Shows configuration state without exposing secrets
   */
  fastify.get('/status', async (request: FastifyRequest, reply: FastifyReply) => {
    let maskedHost = '';
    if (config.smtpHost) {
      const parts = config.smtpHost.split('.');
      maskedHost = parts.length > 1 ? `***.${parts.slice(-2).join('.')}` : '***';
    }

    return reply.send({
      success: true,
      data: {
        emailEnabled: config.emailEnabled,
        smtpConfigured: Boolean(config.smtpHost),
        smtpHost: maskedHost || null,
        smtpPort: config.smtpPort,
        smtpSecure: config.smtpSecure,
        fromEmail: config.smtpFromEmail,
        fromName: config.smtpFromName,
      },
    });
  });

  /**
   * POST /api/admin/email/test
   * Safe development/diagnostic test: Sends a test email exclusively to the authenticated admin
   */
  fastify.post('/test', async (request: FastifyRequest, reply: FastifyReply) => {
    const adminEmail = request.user?.email;
    if (!adminEmail) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_ADMIN_EMAIL', message: 'Authenticated admin email is missing' },
      });
    }

    const testResult = await EmailService.sendEmail({
      to: adminEmail,
      subject: '[WorkOS] SMTP Diagnostic Test Email',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; color: #09090b;">
          <h2 style="margin-bottom: 12px;">WorkOS SMTP Test</h2>
          <p>This is a test email triggered by administrator <strong>${adminEmail}</strong>.</p>
          <p>If you received this message, the Fastify backend Nodemailer SMTP configuration is working properly.</p>
          <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 20px 0;" />
          <p style="font-size: 12px; color: #71717a;">Timestamp: ${new Date().toISOString()}</p>
        </div>
      `,
      text: `WorkOS SMTP Test\n\nThis is a test email triggered by administrator ${adminEmail}.\nTimestamp: ${new Date().toISOString()}`,
    });

    if (!testResult.success) {
      return reply.status(502).send({
        success: false,
        error: {
          code: 'EMAIL_SEND_FAILED',
          message: `Failed to dispatch test email: ${testResult.error || 'Unknown error'}`,
        },
      });
    }

    return reply.send({
      success: true,
      data: {
        message: testResult.skipped
          ? `Email service simulated send to ${adminEmail} (EMAIL_ENABLED=false or SMTP_HOST not set)`
          : `Test email dispatched successfully to ${adminEmail}`,
        messageId: testResult.messageId,
        skipped: testResult.skipped,
      },
    });
  });
}
