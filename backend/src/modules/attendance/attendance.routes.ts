import { FastifyInstance } from 'fastify';
import { AttendanceController } from './attendance.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requireAdmin, requireManagerOrAdmin } from '../../middleware/permissions.js';

export async function attendanceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // Employee attendance operations
  fastify.get('/today', AttendanceController.getToday);
  fastify.post('/check-in', AttendanceController.checkIn);
  fastify.post('/check-out', AttendanceController.checkOut);
  fastify.get('/history', AttendanceController.getHistory);

  // Admin Dashboard Live Operations
  fastify.get('/live-overview', { preHandler: [requireManagerOrAdmin()] }, AttendanceController.getLiveOverview);
  fastify.get('/metrics', { preHandler: [requireManagerOrAdmin()] }, AttendanceController.getMetrics);
}
