import { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole } from '../types/index.js';

export function requireRoles(...allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
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

export function requireAdmin() {
  return requireRoles('SUPER_ADMIN', 'ADMIN');
}

export function requireManagerOrAdmin() {
  return requireRoles('SUPER_ADMIN', 'ADMIN', 'MANAGER');
}
