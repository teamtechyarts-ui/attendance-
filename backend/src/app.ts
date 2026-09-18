import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { config } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';

// Import Routes
import { authRoutes } from './modules/auth/auth.routes.js';
import { employeeRoutes } from './modules/employees/employee.routes.js';
import { departmentRoutes } from './modules/departments/department.routes.js';
import { designationRoutes } from './modules/designations/designation.routes.js';
import { workScheduleRoutes } from './modules/work-schedules/work-schedule.routes.js';
import { attendanceRoutes } from './modules/attendance/attendance.routes.js';
import { taskRoutes } from './modules/tasks/task.routes.js';
import { projectRoutes } from './modules/projects/project.routes.js';
import { leaveRoutes } from './modules/leave/leave.routes.js';
import { reportRoutes } from './modules/reports/report.routes.js';
import { feedbackRoutes } from './modules/feedback/feedback.routes.js';
import { calendarRoutes } from './modules/calendar/calendar.routes.js';
import { digitalIdRoutes } from './modules/digital-id/digital-id.routes.js';
import { notificationRoutes } from './modules/notifications/notification.routes.js';
import { auditRoutes } from './modules/audit/audit.routes.js';
import { emailRoutes } from './modules/email/email.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: {
      level: config.nodeEnv === 'production' ? 'info' : 'debug',
      serializers: {
        req(req) {
          return {
            method: req.method,
            url: req.url,
            hostname: req.hostname,
            remoteAddress: req.ip,
          };
        },
      },
    },
    disableRequestLogging: config.nodeEnv === 'test',
  });

  // Handle empty JSON bodies gracefully without throwing 400
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body: string, done) => {
    if (!body || body.trim() === '') {
      done(null, {});
      return;
    }
    try {
      const json = JSON.parse(body);
      done(null, json);
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // Security Plugins
  await app.register(helmet, {
    contentSecurityPolicy: false, // Managed by reverse proxy / frontend
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow localhost dev and configured CORS origin
      if (!origin || origin.includes('localhost') || origin === config.corsOrigin) {
        cb(null, true);
        return;
      }
      cb(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(cookie, {
    secret: config.cookieSecret,
    hook: 'onRequest',
  });

  // In-Memory Rate Limiting with per-user keying for authenticated sessions
  await app.register(rateLimit, {
    max: config.nodeEnv === 'production' ? 120 : 3000,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      // If request has Bearer authorization token, key by user token prefix so each employee/session has their own bucket
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        return `auth_${authHeader.slice(7, 39)}`;
      }
      // If session cookie exists
      const sessionCookie = request.cookies?.workos_session;
      if (sessionCookie) {
        return `cookie_${sessionCookie.slice(0, 32)}`;
      }
      // Otherwise fallback to IP
      return request.ip;
    },
    errorResponseBuilder: (request, context) => {
      const err: any = new Error('Too many requests. Please try again shortly.');
      err.statusCode = (context as any).statusCode || (context.ban ? 403 : 429);
      err.code = 'RATE_LIMIT_EXCEEDED';
      err.details = {
        retryAfter: context.after,
        limit: context.max,
        ttl: context.ttl,
      };
      return err;
    },
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });

  await app.register(sensible);

  // Central Error Handler
  app.setErrorHandler(errorHandler);

  // Health Check Endpoint (Required by spec)
  app.get('/health', async (request, reply) => {
    return reply.send({
      success: true,
      message: 'API is healthy',
    });
  });

  // Register All Module Routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(employeeRoutes, { prefix: '/api/employees' });
  await app.register(departmentRoutes, { prefix: '/api/departments' });
  await app.register(designationRoutes, { prefix: '/api/designations' });
  await app.register(workScheduleRoutes, { prefix: '/api/work-schedules' });
  await app.register(attendanceRoutes, { prefix: '/api/attendance' });
  await app.register(taskRoutes, { prefix: '/api/tasks' });
  await app.register(projectRoutes, { prefix: '/api/projects' });
  await app.register(leaveRoutes, { prefix: '/api/leave' });
  await app.register(reportRoutes, { prefix: '/api/reports' });
  await app.register(feedbackRoutes, { prefix: '/api/feedback' });
  await app.register(calendarRoutes, { prefix: '/api/calendar' });
  await app.register(digitalIdRoutes, { prefix: '/api/digital-id' });
  await app.register(notificationRoutes, { prefix: '/api/notifications' });
  await app.register(auditRoutes, { prefix: '/api/audit' });
  await app.register(emailRoutes, { prefix: '/api/admin/email' });

  return app;
}

