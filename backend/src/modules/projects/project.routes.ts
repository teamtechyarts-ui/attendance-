import { FastifyInstance } from 'fastify';
import { ProjectController } from './project.controller.js';
import { authenticate, requireActiveAttendance } from '../../middleware/auth.js';

export async function projectRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireActiveAttendance);

  fastify.get('/', ProjectController.list);
  fastify.post('/', ProjectController.create);
  fastify.get('/:id', ProjectController.getById);
  fastify.put('/:id', ProjectController.update);
  fastify.patch('/:id', ProjectController.update);

  // Members routes
  fastify.get('/:id/members', ProjectController.getMembers);
  fastify.post('/:id/members', ProjectController.addMember);
  fastify.delete('/:id/members/:employeeId', ProjectController.removeMember);
  fastify.patch('/:id/members/:employeeId', ProjectController.updateMemberRole);

  // Tasks routes
  fastify.get('/:id/tasks', ProjectController.getTasks);
  fastify.post('/:id/tasks', ProjectController.createTask);
}
