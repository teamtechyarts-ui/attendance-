import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { AuthUser, AccessMode } from '../types/index.js';

export interface TokenPayload {
  userId: string;
  sessionId: string;
  role: string;
  accessMode: AccessMode;
}

export class SecurityUtil {
  /**
   * Hash password using Argon2id
   */
  public static async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MB
      timeCost: 3,
      parallelism: 1,
    });
  }

  /**
   * Verify password against Argon2id hash
   */
  public static async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Generate SHA-256 hash of a session token
   */
  public static hashSessionToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Generate a random crypto token
   */
  public static generateRandomToken(bytes: number = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  /**
   * Sign Access Token (24h default expiration for continuous workday session)
   */
  public static generateAccessToken(payload: TokenPayload, expiresIn: string = '24h'): string {
    return jwt.sign(payload, config.jwtAccessSecret, { expiresIn: expiresIn as any });
  }

  /**
   * Sign Refresh Token (7d expiration)
   */
  public static generateRefreshToken(payload: TokenPayload): string {
    return jwt.sign(payload, config.jwtRefreshSecret, { expiresIn: '7d' });
  }

  /**
   * Verify Access Token with optional expiration bypass for server-authoritative session evaluation
   */
  public static verifyAccessToken(token: string, options?: { ignoreExpiration?: boolean }): TokenPayload | null {
    try {
      return jwt.verify(token, config.jwtAccessSecret, {
        ignoreExpiration: options?.ignoreExpiration ?? false,
      }) as TokenPayload;
    } catch {
      return null;
    }
  }

  /**
   * Verify Refresh Token
   */
  public static verifyRefreshToken(token: string): TokenPayload | null {
    try {
      return jwt.verify(token, config.jwtRefreshSecret) as TokenPayload;
    } catch {
      return null;
    }
  }

  /**
   * Sign Password Reset Token (1 hour expiration)
   */
  public static generatePasswordResetToken(payload: { userId: string; email: string; pwdChangedAt?: string | null }): string {
    return jwt.sign(
      { ...payload, type: 'PASSWORD_RESET' },
      config.jwtAccessSecret,
      { expiresIn: '1h' }
    );
  }

  /**
   * Verify Password Reset Token
   */
  public static verifyPasswordResetToken(token: string): { userId: string; email: string; type: string; pwdChangedAt?: string | null; iat?: number; exp?: number } | null {
    try {
      const decoded: any = jwt.verify(token, config.jwtAccessSecret);
      if (decoded && decoded.type === 'PASSWORD_RESET' && decoded.userId) {
        return decoded;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Generate a cryptographically secure, high-entropy temporary password

   * Format: Upper + Lower + Number + Special char (e.g., Wo@7Kp92Lm!4)
   */
  public static generateTemporaryPassword(): string {
    const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowers = 'abcdefghijkmnpqrstuvwxyz';
    const numbers = '23456789';
    const specials = '!@#$%&*';

    const pick = (charset: string, count: number) => {
      const bytes = crypto.randomBytes(count);
      let res = '';
      for (let i = 0; i < count; i++) {
        res += charset[bytes[i] % charset.length];
      }
      return res;
    };

    return [
      pick(uppers, 2),
      pick(specials, 1),
      pick(numbers, 2),
      pick(lowers, 3),
      pick(uppers, 2),
      pick(specials, 1),
      pick(numbers, 1),
    ].join('');
  }
}


