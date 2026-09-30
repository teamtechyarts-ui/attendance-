import { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole, Permission, AuthUser } from '../types/index.js';
import { RbacService } from '../services/rbac.service.js';

export function requireRoles(...allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.method === 'OPTIONS') {
      return;
    }

    if (!request.user) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    if (request.user.role === 'SUPER_ADMIN' || request.user.appRole === 'SUPER_ADMIN') {
      return;
    }

    if (!allowedRoles.includes(request.user.role)) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to perform this action',
        },
      });
    }
  };
}

export function requireSuperAdmin() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.method === 'OPTIONS') {
      return;
    }

    if (!request.user) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    if (request.user.role !== 'SUPER_ADMIN' && request.user.appRole !== 'SUPER_ADMIN') {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'SUPER_ADMIN_REQUIRED',
          message: 'This administrative operation requires Super Admin privileges',
        },
      });
    }
  };
}

export function requireAdmin() {
  return requirePermission('SETTINGS_MANAGE');
}

export function requireManagerOrAdmin() {
  return requireRoles('SUPER_ADMIN', 'ADMIN', 'MANAGER');
}

/**
 * Granular Permission & Object-Level Scope Enforcement Guard
 */
export function requirePermission(
  permission: Permission,
  scopeChecker?: (request: FastifyRequest) => Promise<boolean>
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.method === 'OPTIONS') {
      return;
    }

    const user = request.user;
    if (!user) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    // 1. Super Admin has universal access
    if (user.role === 'SUPER_ADMIN' || user.appRole === 'SUPER_ADMIN') {
      return;
    }

    // 2. Limited Admin permission check
    if (user.appRole === 'LIMITED_ADMIN') {
      const hasPerm = RbacService.hasPermission(user, permission);
      if (!hasPerm) {
        return reply.status(403).send({
          success: false,
          error: {
            code: 'FORBIDDEN_PERMISSION',
            message: `You lack the required permission: ${permission}`,
          },
        });
      }

      // 3. Object-level scope check if provided
      if (scopeChecker) {
        const inScope = await scopeChecker(request);
        if (!inScope) {
          return reply.status(403).send({
            success: false,
            error: {
              code: 'FORBIDDEN_SCOPE',
              message: 'Target entity is outside your authorized administrative scope',
            },
          });
        }
      }

      return;
    }

    // 4. Normal Employee: baseline permissions for self only
    const baselineEmployeePermissions: Permission[] = [
      'TASK_VIEW',
      'PROJECT_VIEW',
      'TEAM_VIEW',
      'WORK_VIEW',
      'REPORT_VIEW',
      'LEAVE_VIEW',
      'ATTENDANCE_VIEW',
    ];

    if (!baselineEmployeePermissions.includes(permission)) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'This operation requires administrative privileges',
        },
      });
    }
  };
}
