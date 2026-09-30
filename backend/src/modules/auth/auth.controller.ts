import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service.js';
import { loginSchema, changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from '../../validation/index.js';
import { config } from '../../config/env.js';

export class AuthController {
  public static async login(request: FastifyRequest, reply: FastifyReply) {
    const body = loginSchema.parse(request.body);
    const clientInfo = {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    };

    const result = await AuthService.login(body, clientInfo);

    const isProduction = config.nodeEnv === 'production';
    const cookieOptions = {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? ('none' as const) : ('lax' as const),
    };

    // Set HTTPOnly cookies
    reply.setCookie('access_token', result.accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60, // 15 minutes
    });

    reply.setCookie('refresh_token', result.refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return reply.send({
      success: true,
      data: result,
    });
  }

  public static async logout(request: FastifyRequest, reply: FastifyReply) {
    if (request.sessionId && request.user) {
      await AuthService.logout(request.sessionId, request.user, {
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });
    }

    const isProduction = config.nodeEnv === 'production';
    const cookieOptions = {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? ('none' as const) : ('lax' as const),
    };

    reply.clearCookie('access_token', cookieOptions);
    reply.clearCookie('refresh_token', cookieOptions);

    return reply.send({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  }

  public static async refresh(request: FastifyRequest, reply: FastifyReply) {
    let token = (request.body as any)?.refreshToken;
    if (!token && request.cookies?.refresh_token) {
      token = request.cookies.refresh_token;
    }

    if (!token) {
      return reply.status(401).send({
        success: false,
        error: { code: 'REFRESH_TOKEN_REQUIRED', message: 'Refresh token is required' },
      });
    }

    const result = await AuthService.refresh(token, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    const isProduction = config.nodeEnv === 'production';
    const cookieOptions = {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? ('none' as const) : ('lax' as const),
    };

    reply.setCookie('access_token', result.accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60,
    });

    reply.setCookie('refresh_token', result.refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.send({
      success: true,
      data: result,
    });
  }

  public static async getMe(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user || !request.sessionId) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    const result = await AuthService.getMe(request.user.id, request.sessionId, request.user, request.accessMode);
    return reply.send({
      success: true,
      data: result,
    });
  }

  public static async changePassword(request: FastifyRequest, reply: FastifyReply) {
    const body = changePasswordSchema.parse(request.body);
    const result = await AuthService.changePassword(request.user!.id, request.sessionId!, body, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({
      success: true,
      data: {
        message: 'Password updated successfully',
        ...result,
      },
    });
  }

  public static async forgotPassword(request: FastifyRequest, reply: FastifyReply) {
    const body = forgotPasswordSchema.parse(request.body);
    await AuthService.forgotPassword(body.email);

    return reply.send({
      success: true,
      data: { message: 'If an account exists for this email, password reset instructions have been sent.' },
    });
  }

  public static async resetPassword(request: FastifyRequest, reply: FastifyReply) {
    const body = resetPasswordSchema.parse(request.body);
    const clientInfo = {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    };

    await AuthService.resetPassword(body, clientInfo);

    return reply.send({
      success: true,
      data: { message: 'Password has been reset successfully. Please log in.' },
    });
  }
}

