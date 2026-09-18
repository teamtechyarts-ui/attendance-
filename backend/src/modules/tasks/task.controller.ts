import { FastifyReply, FastifyRequest } from 'fastify';
import { TaskService } from './task.service.js';
import {
  createTaskSchema,
  updateTaskSchema,
  createTaskCommentSchema,
  createTaskMentionSchema,
} from '../../validation/index.js';

export class TaskController {
  public static async list(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;
    const result = await TaskService.listTasks({
      employeeId: query.employeeId,
      projectId: query.projectId,
      status: query.status,
      priority: query.priority,
      search: query.search,
      user: request.user!,
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
    });

    return reply.send({
      success: true,
      data: result.items,
      meta: result.meta,
    });
  }

  public static async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const task = await TaskService.getTaskById(id, request.user!);
    return reply.send({
      success: true,
      data: task,
    });
  }

  public static async create(request: FastifyRequest, reply: FastifyReply) {
    const body = createTaskSchema.parse(request.body);
    const task = await TaskService.createTask(body, request.user!, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({
      success: true,
      data: task,
    });
  }

  public static async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = updateTaskSchema.parse(request.body);
    const task = await TaskService.updateTask(id, body, request.user!, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({
      success: true,
      data: task,
    });
  }

  public static async addComment(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = createTaskCommentSchema.parse(request.body);
    const comment = await TaskService.addComment(id, body, request.user!, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({
      success: true,
      data: comment,
    });
  }

  public static async listComments(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const comments = await TaskService.listComments(id, request.user!);
    return reply.send({
      success: true,
      data: comments,
    });
  }

  public static async addMention(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = createTaskMentionSchema.parse(request.body);
    const mention = await TaskService.addMention(id, body, request.user!, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({
      success: true,
      data: mention,
    });
  }

  public static async listMentions(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const mentions = await TaskService.listMentions(id, request.user!);
    return reply.send({
      success: true,
      data: mentions,
    });
  }

  public static async startTimer(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    if (!request.user?.employeeId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Employee profile required' },
      });
    }

    const result = await TaskService.startTimer(id, request.user.employeeId, request.user, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({
      success: true,
      data: result,
    });
  }

  public static async pauseTimer(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    if (!request.user?.employeeId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Employee profile required' },
      });
    }

    const result = await TaskService.pauseTimer(id, request.user.employeeId, request.user, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({
      success: true,
      data: result,
    });
  }

  public static async stopTimer(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    if (!request.user?.employeeId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EMPLOYEE_PROFILE_REQUIRED', message: 'Employee profile required' },
      });
    }

    const result = await TaskService.stopTimer(id, request.user.employeeId, request.user, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({
      success: true,
      data: result,
    });
  }

  public static async getActiveTimer(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user?.employeeId) {
      return reply.send({ success: true, data: null });
    }

    const activeTimer = await TaskService.getActiveTimer(request.user.employeeId);
    return reply.send({
      success: true,
      data: activeTimer,
    });
  }

  public static async getSummary(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;
    const summary = await TaskService.getTimeSummary(request.user!, {
      employeeId: query?.employeeId,
    });
    return reply.send({
      success: true,
      data: summary,
    });
  }
}
