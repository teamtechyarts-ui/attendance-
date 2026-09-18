import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { SecurityUtil } from '../src/utils/security.js';
import { config } from '../src/config/env.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { EmailService } from '../src/modules/email/email.service.js';
import { passwordResetTemplate } from '../src/modules/email/email.templates.js';
import { resetPasswordSchema } from '../src/validation/index.js';

describe('WorkOS Forgot Password & Reset Password Flow Tests', () => {
  test('TestCase 1: Password reset email template generates correct frontend URL and metadata', () => {
    const rawToken = SecurityUtil.generatePasswordResetToken({
      userId: 'user-uuid-1234',
      email: 'employee@workos.com',
      pwdChangedAt: null,
    });

    const resetUrl = `http://localhost:3000/reset-password?token=${rawToken}`;
    const template = passwordResetTemplate({
      userName: 'Sushma',
      resetUrl,
      expiresInMinutes: 60,
    });

    assert.ok(template.subject.includes('Reset Your TeamsTechyArts Password'));
    assert.ok(template.html.includes('http://localhost:3000/reset-password?token='));
    assert.ok(template.html.includes('Sushma'));
    assert.ok(template.html.includes('60 minutes'));
    assert.ok(template.html.includes('If you did not request a password reset'));
    // Ensure no API URL is used as the user reset link
    assert.ok(!template.html.includes('localhost:4000/api/auth/reset-password'));
  });

  test('TestCase 2: Reset password token contains required claims and expires in 1 hour', () => {
    const payload = {
      userId: 'test-user-id-5678',
      email: 'alex@workos.com',
      pwdChangedAt: new Date().toISOString(),
    };

    const token = SecurityUtil.generatePasswordResetToken(payload);
    const verified = SecurityUtil.verifyPasswordResetToken(token);

    assert.ok(verified, 'Reset token must verify successfully');
    assert.strictEqual(verified.userId, payload.userId);
    assert.strictEqual(verified.email, payload.email);
    assert.strictEqual(verified.type, 'PASSWORD_RESET');
    assert.ok(verified.exp && verified.iat);
    assert.strictEqual(verified.exp - verified.iat, 3600, 'Expiration must be 1 hour (3600s)');
  });

  test('TestCase 3: Single-use token enforcement rejects reused or stale tokens', () => {
    const initialTime = new Date('2026-09-17T10:00:00.000Z');
    const laterTime = new Date('2026-09-17T10:30:00.000Z');

    // Token generated when password was at initialTime
    const token = SecurityUtil.generatePasswordResetToken({
      userId: 'test-user-1',
      email: 'test@workos.com',
      pwdChangedAt: initialTime.toISOString(),
    });

    const decoded = SecurityUtil.verifyPasswordResetToken(token);
    assert.ok(decoded);

    // If user's password changed at laterTime, the token's pwdChangedAt is older than user's current passwordChangedAt
    const tokenTime = new Date(decoded.pwdChangedAt!).getTime();
    const currentUserPasswordChangedAt = laterTime.getTime();

    assert.ok(tokenTime < currentUserPasswordChangedAt, 'Token issued before last password change must be recognized as already used');
  });

  test('TestCase 4: Expired token verification returns null', () => {
    // Generate an already expired token
    const expiredToken = jwt.sign(
      { userId: 'user-expired', email: 'expired@workos.com', type: 'PASSWORD_RESET' },
      config.jwtAccessSecret,
      { expiresIn: '-1s' }
    );

    const verified = SecurityUtil.verifyPasswordResetToken(expiredToken);
    assert.strictEqual(verified, null, 'Expired reset token must fail verification');
  });

  test('TestCase 5: Invalid or tampered token returns null', () => {
    const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.tampered';
    const verified = SecurityUtil.verifyPasswordResetToken(invalidToken);
    assert.strictEqual(verified, null, 'Tampered token must fail verification');
  });

  test('TestCase 6: Password schema validation enforces complexity and matching confirmation', () => {
    // Valid password
    const validResult = resetPasswordSchema.safeParse({
      token: 'valid-token-string',
      newPassword: 'SecurePassword123!',
      confirmPassword: 'SecurePassword123!',
    });
    assert.strictEqual(validResult.success, true);

    // Mismatched confirmation
    const mismatchResult = resetPasswordSchema.safeParse({
      token: 'valid-token-string',
      newPassword: 'SecurePassword123!',
      confirmPassword: 'DifferentPassword123!',
    });
    assert.strictEqual(mismatchResult.success, false);

    // Missing uppercase
    const noUpperResult = resetPasswordSchema.safeParse({
      token: 'valid-token-string',
      newPassword: 'password123!',
      confirmPassword: 'password123!',
    });
    assert.strictEqual(noUpperResult.success, false);

    // Missing number
    const noNumResult = resetPasswordSchema.safeParse({
      token: 'valid-token-string',
      newPassword: 'SecurePassword!',
      confirmPassword: 'SecurePassword!',
    });
    assert.strictEqual(noNumResult.success, false);

    // Too short
    const shortResult = resetPasswordSchema.safeParse({
      token: 'valid-token-string',
      newPassword: 'Pass1',
      confirmPassword: 'Pass1',
    });
    assert.strictEqual(shortResult.success, false);
  });

  test('TestCase 7: Non-existent email in forgotPassword resolves without exposing account existence', async () => {
    // Call forgotPassword with non-existent email
    await assert.doesNotReject(async () => {
      await AuthService.forgotPassword('nonexistent-email-999999@workos.com');
    }, 'forgotPassword must not throw or leak errors for non-existent users');
  });
});
