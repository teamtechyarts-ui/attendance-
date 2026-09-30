import { prisma } from '../plugins/prisma.js';
import { config } from '../config/env.js';

// Resilient DB service that connects via Prisma or Supabase REST engine
export class DbService {
  private static useRestFallback = Boolean(
    !process.env.DATABASE_URL ||
    process.env.DATABASE_URL.includes(':password@') ||
    process.env.USE_REST_FALLBACK === 'true'
  );

  public static async query<T>(
    prismaFn: () => Promise<T>,
    restFallbackFn?: () => Promise<T>
  ): Promise<T> {
    if (DbService.useRestFallback && restFallbackFn) {
      return await restFallbackFn();
    }

    try {
      return await prismaFn();
    } catch (err: any) {
      // If it's a business logic or authorization error, never suppress it with a fallback
      if (err.statusCode || err.status || err.code === 'FORBIDDEN' || err.code === 'VALIDATION_ERROR') {
        throw err;
      }
      // If PostgreSQL connection error (e.g. invalid password / host unreachable in local dev)
      if (restFallbackFn) {
        DbService.useRestFallback = true;
        return await restFallbackFn();
      }
      throw err;
    }
  }

  public static toCamelCase<T = any>(obj: any): T {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) {
      return obj.map((item) => DbService.toCamelCase(item)) as unknown as T;
    }
    if (typeof obj === 'object' && !(obj instanceof Date) && !(obj instanceof RegExp)) {
      const camelized: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        const camelKey = key.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
        camelized[camelKey] = DbService.toCamelCase(value);
      }
      return camelized as T;
    }
    return obj;
  }

  public static toSnakeCase<T = any>(obj: any): T {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) {
      return obj.map((item) => DbService.toSnakeCase(item)) as unknown as T;
    }
    if (typeof obj === 'object' && !(obj instanceof Date) && !(obj instanceof RegExp)) {
      const snaked: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
        snaked[snakeKey] = DbService.toSnakeCase(value);
      }
      return snaked as T;
    }
    return obj;
  }

  public static async restRequest<T = any>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
      body?: any;
      headers?: Record<string, string>;
    } = {}
  ): Promise<T> {
    const url = `${config.supabaseUrl}/rest/v1${path}`;
    const method = options.method || 'GET';
    const headers: Record<string, string> = {
      apikey: config.supabaseSecretKey,
      Authorization: `Bearer ${config.supabaseSecretKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...options.headers,
    };

    const transformedBody = options.body !== undefined ? DbService.toSnakeCase(options.body) : undefined;

    const res = await fetch(url, {
      method,
      headers,
      body: transformedBody !== undefined ? JSON.stringify(transformedBody) : undefined,
    });

    if (!res.ok) {
      const errText = await res.text();
      let parsedErr: any;
      try {
        parsedErr = JSON.parse(errText);
      } catch {
        parsedErr = { message: errText };
      }

      let statusCode = res.status;
      let errorCode = parsedErr.code || (res.status === 404 ? 'NOT_FOUND' : 'DB_ERROR');

      if (parsedErr.code === '23505') {
        statusCode = 409;
        errorCode = 'CONFLICT';
      } else if (parsedErr.code === 'PGRST116' || res.status === 404) {
        statusCode = 404;
        errorCode = 'NOT_FOUND';
      } else if (parsedErr.code === '23503') {
        statusCode = 400;
        errorCode = 'FOREIGN_KEY_VIOLATION';
      }

      const error: any = new Error(parsedErr.message || `Supabase REST request failed with status ${res.status}`);
      error.statusCode = statusCode;
      error.status = statusCode;
      error.code = errorCode;
      error.details = parsedErr;
      throw error;
    }

    if (res.status === 204) {
      return [] as unknown as T;
    }

    const data = await res.json();
    return DbService.toCamelCase<T>(data);
  }
}

