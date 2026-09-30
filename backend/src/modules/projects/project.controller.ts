import { FastifyReply, FastifyRequest } from 'fastify';
import { ProjectService } from './project.service.js';
import {
  createProjectSchema,
  updateProjectSchema,
  createTaskSchema,
  addProjectMemberSchema,
  updateProjectMemberSchema,
} from '../../validation/index.js';

export class ProjectController {
  public static async list(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;
    const employeeId =
      query?.employeeId && query.employeeId !== 'undefined' && query.employeeId !== 'null' && query.employeeId.trim() !== ''
        ? query.employeeId
        : undefined;

    const projects = await ProjectService.listProjects(request.user!, {
      search: query?.search,
      status: query?.status,
      employeeId,
      adminView: query?.adminView === 'true' || query?.adminView === true,
    });

    return reply.send({
      success: true,
      data: projects,
    });
  }

  public static async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const project = await ProjectService.getProjectById(id, request.user!);
    return reply.send({
      success: true,
      data: project,
    });
  }

  public static async create(request: FastifyRequest, reply: FastifyReply) {
    const body = createProjectSchema.parse(request.body);
    const project = await ProjectService.createProject(body, request.user!, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({
      success: true,
      data: project,
    });
  }

  public static async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = updateProjectSchema.parse(request.body);
    const project = await ProjectService.updateProject(id, body, request.user!, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({
      success: true,
      data: project,
    });
  }

  public static async getMembers(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const members = await ProjectService.getProjectMembers(id, request.user!);
    return reply.send({
      success: true,
      data: members,
    });
  }

  public static async addMember(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = addProjectMemberSchema.parse(request.body);
    const member = await ProjectService.addMember(id, body, request.user!, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({
      success: true,
      data: member,
    });
  }

  public static async removeMember(request: FastifyRequest, reply: FastifyReply) {
    const { id, employeeId } = request.params as { id: string; employeeId: string };
    const result = await ProjectService.removeMember(id, employeeId, request.user!, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({
      success: true,
      data: result,
    });
  }

  public static async updateMemberRole(request: FastifyRequest, reply: FastifyReply) {
    const { id, employeeId } = request.params as { id: string; employeeId: string };
    const body = updateProjectMemberSchema.parse(request.body);
    const member = await ProjectService.updateMemberRole(id, employeeId, body, request.user!, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({
      success: true,
      data: member,
    });
  }

  public static async getTasks(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const tasks = await ProjectService.getProjectTasks(id, request.user!);
    return reply.send({
      success: true,
      data: tasks,
    });
  }

  public static async createTask(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = createTaskSchema.parse(request.body);
    const task = await ProjectService.createTaskUnderProject(id, body, request.user!, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({
      success: true,
      data: task,
    });
  }
}
