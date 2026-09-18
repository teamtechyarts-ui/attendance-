import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { ApiErrorResponse } from '../types/index.js';

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  const reqId = request.id;
  request.log.error({ err: error, reqId }, 'Request error occurred');

  // Handle Zod Validation Errors
  if (error instanceof ZodError || (error as any).name === 'ZodError') {
    const zodErr = (error as any);
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: zodErr.errors?.map((e: any) => ({
          path: e.path?.join('.'),
          message: e.message,
        })) || zodErr.message,
      },
    };
    return reply.status(400).send(response);
  }

  // Handle Fastify Validation Errors
  if (error.validation) {
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
        details: error.validation,
      },
    };
    return reply.status(400).send(response);
  }

  // Handle Rate Limiting Errors
  if (
    error.statusCode === 429 ||
    (error as any).status === 429 ||
    (error as any).code === 'FST_ERR_RATE_LIMIT_EXCEEDED' ||
    (error as any).code === 'RATE_LIMIT_EXCEEDED' ||
    (error as any).error?.code === 'RATE_LIMIT_EXCEEDED'
  ) {
    const details = (error as any).details || (error as any).error?.details || undefined;
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again shortly.',
        details,
      },
    };
    return reply.status(429).send(response);
  }

  // Handle Custom Application & HTTP Status Errors
  let statusCode = error.statusCode || (error as any).status || 500;
  const rawCode = (error as any).code;

  let code = rawCode;
  if (rawCode === 'P2002' || rawCode === '23505' || rawCode === 'CONFLICT' || statusCode === 409) {
    statusCode = 409;
    code = 'CONFLICT';
  } else if (rawCode === 'P2025' || rawCode === 'PGRST116' || statusCode === 404) {
    statusCode = 404;
    code = 'NOT_FOUND';
  } else if (rawCode === 'P2003' || rawCode === '23503') {
    statusCode = 400;
    code = 'FOREIGN_KEY_VIOLATION';
  } else if (!code || typeof code !== 'string') {
    code = statusCode === 400 ? 'BAD_REQUEST' : statusCode === 404 ? 'NOT_FOUND' : statusCode === 401 ? 'UNAUTHORIZED' : statusCode === 403 ? 'FORBIDDEN' : statusCode === 409 ? 'CONFLICT' : 'INTERNAL_SERVER_ERROR';
  }

  const response: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message: statusCode === 500 && process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred. Please try again later.' 
        : error.message,
      details: (error as any).details || undefined,
    },
  };

  return reply.status(statusCode).send(response);
}

