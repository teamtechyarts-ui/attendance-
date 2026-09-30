import { FastifyInstance } from 'fastify';
import { TaskController } from './task.controller.js';
import { authenticate, requireActiveAttendance } from '../../middleware/auth.js';

export async function taskRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireActiveAttendance);

  fastify.get('/', TaskController.list);
  fastify.get('/summary', TaskController.getSummary);
  fastify.get('/timer/active', TaskController.getActiveTimer);
  fastify.get('/timer/running', TaskController.getActiveTimer);
  fastify.get('/:id', TaskController.getById);
  fastify.post('/', TaskController.create);
  fastify.put('/:id', TaskController.update);
  fastify.patch('/:id', TaskController.update);
  fastify.delete('/:id', TaskController.delete);

  // Comments routes
  fastify.get('/:id/comments', TaskController.listComments);
  fastify.post('/:id/comments', TaskController.addComment);

  // Mentions routes
  fastify.get('/:id/mentions', TaskController.listMentions);
  fastify.post('/:id/mentions', TaskController.addMention);

  // Timer actions
  fastify.post('/:id/timer/start', TaskController.startTimer);
  fastify.post('/:id/timer/pause', TaskController.pauseTimer);
  fastify.post('/:id/timer/stop', TaskController.stopTimer);
}
