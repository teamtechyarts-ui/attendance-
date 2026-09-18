import { FastifyReply, FastifyRequest } from 'fastify';
import { SecurityUtil, TokenPayload } from '../utils/security.js';
import { prisma } from '../plugins/prisma.js';
import { DbService } from '../services/db.service.js';
import { AuthUser, AccessMode } from '../types/index.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    sessionId?: string;
    accessMode?: AccessMode;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  let token: string | undefined;

  // 1. Extract from Authorization header
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // 2. Or extract from cookie
  if (!token && request.cookies?.access_token) {
    token = request.cookies.access_token;
  }

  if (!token) {
    return reply.status(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  const payload = SecurityUtil.verifyAccessToken(token);
  if (!payload) {
    return reply.status(401).send({
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'Access token expired or invalid' },
    });
  }

  // 3. Verify active session in PostgreSQL
  try {
    const session = await DbService.query(
      async () => {
        return await prisma.userSession.findUnique({
          where: { id: payload.sessionId },
          include: {
            user: {
              include: {
                employee: {
                  include: {
                    department: true,
                    designation: true,
                  },
                },
              },
            },
          },
        });
      },
      async () => {
        const sessions = await DbService.restRequest<any[]>(`/user_sessions?id=eq.${payload.sessionId}&select=*,user:users(*,employee:employees(*,department:departments(*),designation:designations(*)))`);
        return sessions?.[0] || null;
      }
    );

    const isRevoked = Boolean(session.revokedAt || session.revoked_at);
    const expiresAt = session.expiresAt || session.expires_at;
    const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;

    if (!session || isRevoked || isExpired) {
      return reply.status(401).send({
        success: false,
        error: { code: 'SESSION_INVALID', message: 'Session has expired or was revoked' },
      });
    }

    const userRecord = session.user;
    const userStatus = userRecord?.status;
    if (!userRecord || (userStatus && userStatus !== 'ACTIVE')) {
      return reply.status(403).send({
        success: false,
        error: { code: 'ACCOUNT_INACTIVE', message: 'Your account is inactive or suspended' },
      });
    }

    let employee = userRecord.employee;
    if (Array.isArray(employee)) {
      employee = employee[0] || null;
    }

    if (!employee && userRecord.id) {
      try {
        employee = await DbService.query(
          async () => prisma.employee.findUnique({
            where: { userId: userRecord.id },
            include: { department: true, designation: true },
          }),
          async () => {
            const emps = await DbService.restRequest<any[]>(`/employees?user_id=eq.${userRecord.id}&select=*,department:departments(*),designation:designations(*)`);
            return emps?.[0] || null;
          }
        );
      } catch {}
    }

    // Build standard AuthUser
    const authUser: AuthUser = {
      id: userRecord.id,
      email: userRecord.email,
      role: userRecord.role as any,
      status: userRecord.status as any,
      employeeId: employee?.id || null,
      employeeCode: employee?.employeeCode || employee?.employee_code || null,
      firstName: employee?.firstName || employee?.first_name || null,
      lastName: employee?.lastName || employee?.last_name || null,
      displayName: employee?.displayName || employee?.display_name || userRecord.email.split('@')[0],
      profilePhotoUrl: employee?.profilePhotoUrl || employee?.profile_photo_url || null,
      departmentId: employee?.departmentId || employee?.department_id || null,
      departmentName: employee?.department?.name || null,
      designationName: employee?.designation?.name || null,
      firstLoginRequired: (userRecord.passwordChangedAt !== undefined ? userRecord.passwordChangedAt : userRecord.password_changed_at) === null,
    };

    request.user = authUser;
    request.sessionId = session.id;
    request.accessMode = (session.accessMode || session.access_mode || 'NORMAL') as AccessMode;

    // Enforce FIRST_LOGIN_REQUIRED: Block normal routes until password is changed
    if (request.accessMode === 'FIRST_LOGIN_REQUIRED') {
      const url = request.url;
      const isPermitted =
        url.startsWith('/api/auth/change-password') ||
        url.startsWith('/api/auth/me') ||
        url.startsWith('/api/auth/logout') ||
        url.startsWith('/api/auth/refresh');

      if (!isPermitted) {
        return reply.status(403).send({
          success: false,
          error: {
            code: 'FIRST_LOGIN_CHANGE_PASSWORD_REQUIRED',
            message: 'You must change your initial temporary password before accessing the system.',
          },
        });
      }
    }
  } catch (err: any) {
    if (err.statusCode === 403 || err.statusCode === 401) {
      throw err;
    }
    console.error('[auth.ts authenticate error]:', err);
    request.log.error(err, 'Failed to authenticate session');
    return reply.status(500).send({
      success: false,
      error: { code: 'AUTH_ERROR', message: err.message || 'Authentication validation failed' },
    });
  }
}


/**
 * Attendance-gated access enforcement middleware
 * Enforces the critical rule: If access_mode is RESTRICTED and restricted_until expired -> reject
 * If RESTRICTED, allow ONLY attendance check-in, today status, me, logout.
 */
export async function requireActiveAttendance(request: FastifyRequest, reply: FastifyReply) {
  // Admins / Super Admins bypass attendance gating
  if (request.user?.role === 'SUPER_ADMIN' || request.user?.role === 'ADMIN') {
    return;
  }

  if (request.accessMode === 'RESTRICTED') {
    // Check if current URL is permitted in restricted mode
    const url = request.url;
    const isPermitted = 
      url.startsWith('/api/attendance/today') ||
      url.startsWith('/api/attendance/check-in') ||
      url.startsWith('/api/auth/me') ||
      url.startsWith('/api/auth/logout') ||
      url.startsWith('/api/digital-id/me');

    if (!isPermitted) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'ATTENDANCE_REQUIRED',
          message: 'Attendance must be marked before accessing this feature.',
        },
      });
    }
  }
}

/**
 * Role-based access control middleware helper
 */
export function requireRole(allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user || !allowedRoles.includes(request.user.role)) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
      });
    }
  };
}

