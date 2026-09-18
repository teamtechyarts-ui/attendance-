import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';
import { SecurityUtil } from '../../utils/security.js';
import { DateTimeUtil } from '../../utils/datetime.js';
import { AuditService } from '../../services/audit.service.js';
import { EmailService } from '../../services/email.service.js';
import { config } from '../../config/env.js';
import { AuthUser, AccessMode, SessionInfo } from '../../types/index.js';
import { LoginInput, ChangePasswordInput } from '../../validation/index.js';

export class AuthService {
  /**
   * User Login with Attendance-Gated Access Evaluation
   */
  public static async login(
    input: LoginInput,
    clientInfo: { ipAddress?: string; userAgent?: string; deviceId?: string }
  ): Promise<{ accessToken: string; refreshToken: string; session: SessionInfo }> {
    const email = input.email.toLowerCase().trim();

    const user = await DbService.query(
      async () => {
        return await prisma.user.findUnique({
          where: { email },
          include: {
            employee: {
              include: {
                department: true,
                designation: true,
              },
            },
          },
        });
      },
      async () => {
        const users = await DbService.restRequest<any[]>(`/users?email=eq.${encodeURIComponent(email)}&select=*,employee:employees(*,department:departments(*),designation:designations(*))`);
        return users?.[0] || null;
      }
    );

    if (!user) {
      await AuditService.log({
        action: 'LOGIN_FAILED',
        description: `Failed login attempt for non-existent email: ${email}`,
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
      });
      const error: any = new Error('Invalid email or password');
      error.statusCode = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    // Check account lockout (enforced when accountLockoutEnabled is true)
    if (config.accountLockoutEnabled && user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const error: any = new Error('Account temporarily locked due to multiple failed login attempts. Try again in 15 minutes.');
      error.statusCode = 423;
      error.code = 'ACCOUNT_LOCKED';
      throw error;
    }

    if (user.status !== 'ACTIVE') {
      const error: any = new Error('Account is not active. Please contact administrator.');
      error.statusCode = 403;
      error.code = 'ACCOUNT_INACTIVE';
      throw error;
    }

    // Verify Password
    const isPasswordValid = await SecurityUtil.verifyPassword(input.password, user.passwordHash);
    if (!isPasswordValid) {
      const failedAttempts = (user.failedLoginAttempts || 0) + 1;
      const willLock = config.accountLockoutEnabled && failedAttempts >= 5;
      const lockedUntil = willLock ? DateTimeUtil.addMinutes(new Date(), 15) : null;

      await DbService.query(
        async () => {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: config.accountLockoutEnabled ? failedAttempts : 0,
              lockedUntil,
            },
          });
        },
        async () => {
          await DbService.restRequest(`/users?id=eq.${user.id}`, {
            method: 'PATCH',
            body: {
              failed_login_attempts: config.accountLockoutEnabled ? failedAttempts : 0,
              locked_until: lockedUntil ? lockedUntil.toISOString() : null,
            },
          });
        }
      );

      await AuditService.log({
        userId: user.id,
        employeeId: user.employee?.id,
        action: 'LOGIN_FAILED',
        description: `Failed login attempt (attempts: ${failedAttempts})`,
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
      });

      const error: any = new Error('Invalid email or password');
      error.statusCode = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }


    // Reset failed login attempts on success
    const now = new Date();
    await DbService.query(
      async () => {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: now,
          },
        });
      },
      async () => {
        await DbService.restRequest(`/users?id=eq.${user.id}`, {
          method: 'PATCH',
          body: {
            failed_login_attempts: 0,
            locked_until: null,
            last_login_at: now.toISOString(),
          },
        });
      }
    );

    // =========================================================================
    // CRITICAL ATTENDANCE-GATED SESSION ACCESS MODE EVALUATION
    // =========================================================================
    // 3. ACCESS MODE & FIRST LOGIN / ATTENDANCE EVALUATION
    // =========================================================================
    const todayStr = DateTimeUtil.getTodayDateString();
    let todayAttendance: any = null;
    const isFirstLogin = user.passwordChangedAt === null && user.role === 'EMPLOYEE';
    let accessMode: AccessMode = 'NORMAL';
    let attendanceRequired = false;
    let restrictedUntil: Date | null = null;

    let userEmployee = user.employee;
    if (Array.isArray(userEmployee)) {
      userEmployee = userEmployee[0] || null;
    }
    if (!userEmployee && user.id) {
      try {
        userEmployee = await DbService.query(
          async () => prisma.employee.findUnique({
            where: { userId: user.id },
            include: { department: true, designation: true },
          }),
          async () => {
            const emps = await DbService.restRequest<any[]>(`/employees?user_id=eq.${user.id}&select=*,department:departments(*),designation:designations(*)`);
            return emps?.[0] || null;
          }
        );
      } catch {}
    }
    const userEmployeeId = userEmployee?.id || null;

    if (isFirstLogin) {
      accessMode = 'FIRST_LOGIN_REQUIRED';
      attendanceRequired = false;
      restrictedUntil = null;
    } else if (userEmployeeId) {
      todayAttendance = await DbService.query(
        async () => {
          return await prisma.attendance.findUnique({
            where: {
              employeeId_attendanceDate: {
                employeeId: userEmployeeId,
                attendanceDate: new Date(todayStr),
              },
            },
          });
        },
        async () => {
          const res = await DbService.restRequest<any[]>(
            `/attendance?employee_id=eq.${userEmployeeId}&attendance_date=eq.${todayStr}`
          );
          return res?.[0] || null;
        }
      );

      // Check if employee has marked attendance today
      const hasMarkedAttendance = todayAttendance && todayAttendance.checkInAt;

      if (user.role === 'EMPLOYEE') {
        if (hasMarkedAttendance) {
          accessMode = 'NORMAL';
          attendanceRequired = false;
          restrictedUntil = null;
        } else {
          accessMode = 'RESTRICTED';
          attendanceRequired = true;
          restrictedUntil = DateTimeUtil.addMinutes(now, 15);
        }
      }
    }

    // Create session in PostgreSQL
    const rawSessionToken = SecurityUtil.generateRandomToken(32);
    const sessionTokenHash = SecurityUtil.hashSessionToken(rawSessionToken);
    const expiresAt = DateTimeUtil.addMinutes(now, 7 * 24 * 60); // 7 days

    const createdSession = await DbService.query(
      async () => {
        return await prisma.userSession.create({
          data: {
            userId: user.id,
            sessionTokenHash,
            accessMode,
            attendanceRequired,
            restrictedUntil,
            expiresAt,
            lastActivityAt: now,
            ipAddress: clientInfo.ipAddress || null,
            userAgent: clientInfo.userAgent || null,
            deviceId: clientInfo.deviceId || null,
          },
        });
      },
      async () => {
        const res = await DbService.restRequest<any[]>('/user_sessions', {
          method: 'POST',
          body: {
            user_id: user.id,
            session_token_hash: sessionTokenHash,
            access_mode: accessMode,
            attendance_required: attendanceRequired,
            restricted_until: restrictedUntil ? restrictedUntil.toISOString() : null,
            expires_at: expiresAt.toISOString(),
            last_activity_at: now.toISOString(),
            ip_address: clientInfo.ipAddress || null,
            user_agent: clientInfo.userAgent || null,
            device_id: clientInfo.deviceId || null,
          },
        });
        return res[0];
      }
    );

    const tokenPayload = {
      userId: user.id,
      sessionId: createdSession.id,
      role: user.role,
      accessMode,
    };

    const accessToken = SecurityUtil.generateAccessToken(tokenPayload);
    const refreshToken = SecurityUtil.generateRefreshToken(tokenPayload);

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role as any,
      status: user.status as any,
      employeeId: userEmployee?.id || null,
      employeeCode: userEmployee?.employeeCode || userEmployee?.employee_code || null,
      firstName: userEmployee?.firstName || userEmployee?.first_name || null,
      lastName: userEmployee?.lastName || userEmployee?.last_name || null,
      displayName: userEmployee?.displayName || userEmployee?.display_name || user.email.split('@')[0],
      profilePhotoUrl: userEmployee?.profilePhotoUrl || userEmployee?.profile_photo_url || null,
      departmentId: userEmployee?.departmentId || userEmployee?.department_id || null,
      designationId: userEmployee?.designationId || userEmployee?.designation_id || null,
      departmentName: userEmployee?.department?.name || null,
      designationName: userEmployee?.designation?.name || null,
      firstLoginRequired: isFirstLogin,
    };

    await AuditService.log({
      userId: user.id,
      employeeId: userEmployeeId || undefined,
      action: 'LOGIN',
      description: `User ${user.email} logged in (${accessMode} mode)`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
    });

    const sessionInfo: SessionInfo = {
      sessionId: createdSession.id,
      userId: user.id,
      accessMode,
      attendanceRequired,
      restrictedUntil: restrictedUntil ? restrictedUntil.toISOString() : null,
      expiresAt: expiresAt.toISOString(),
      user: authUser,
      firstLoginRequired: isFirstLogin,
      todayAttendance: todayAttendance
        ? {
            id: todayAttendance.id,
            employeeId: todayAttendance.employeeId || todayAttendance.employee_id,
            attendanceDate: todayStr,
            status: todayAttendance.status,
            workMode: todayAttendance.workMode || todayAttendance.work_mode,
            verificationMethod: todayAttendance.verificationMethod || todayAttendance.verification_method,
            checkInAt: todayAttendance.checkInAt || todayAttendance.check_in_at,
            checkOutAt: todayAttendance.checkOutAt || todayAttendance.check_out_at,
            totalWorkMinutes: todayAttendance.totalWorkMinutes || todayAttendance.total_work_minutes,
            createdAt: todayAttendance.createdAt || todayAttendance.created_at,
            updatedAt: todayAttendance.updatedAt || todayAttendance.updated_at,
          }
        : null,
    };


    return { accessToken, refreshToken, session: sessionInfo };
  }

  /**
   * User Logout
   */
  public static async logout(
    sessionId: string,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const now = new Date();
    await DbService.query(
      async () => {
        await prisma.userSession.update({
          where: { id: sessionId },
          data: { revokedAt: now },
        });
      },
      async () => {
        await DbService.restRequest(`/user_sessions?id=eq.${sessionId}`, {
          method: 'PATCH',
          body: { revoked_at: now.toISOString() },
        });
      }
    );

    await AuditService.log({
      userId: user.id,
      employeeId: user.employeeId,
      action: 'LOGOUT',
      description: `User ${user.email} logged out`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
    });
  }

  /**
   * Refresh Access Token & Re-evaluate Session Access Mode
   */
  public static async refresh(
    refreshTokenString: string,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ): Promise<{ accessToken: string; refreshToken: string; session: SessionInfo }> {
    const payload = SecurityUtil.verifyRefreshToken(refreshTokenString);
    if (!payload) {
      const error: any = new Error('Refresh token invalid or expired');
      error.statusCode = 401;
      error.code = 'REFRESH_TOKEN_EXPIRED';
      throw error;
    }

    const session = await DbService.query(
      async () => {
        return await prisma.userSession.findUnique({
          where: { id: payload.sessionId },
          include: {
            user: {
              include: {
                employee: {
                  include: {
                    department: true,
                    designation: true,
                  },
                },
              },
            },
          },
        });
      },
      async () => {
        const res = await DbService.restRequest<any[]>(
          `/user_sessions?id=eq.${payload.sessionId}&select=*,user:users(*,employee:employees(*,department:departments(*),designation:designations(*)))`
        );
        return res?.[0] || null;
      }
    );

    if (!session || session.revokedAt || new Date(session.expiresAt) < new Date()) {
      const error: any = new Error('Session is expired or revoked');
      error.statusCode = 401;
      error.code = 'SESSION_REVOKED';
      throw error;
    }

    const user = session.user;
    if (user.status !== 'ACTIVE') {
      const error: any = new Error('Account inactive');
      error.statusCode = 403;
      error.code = 'ACCOUNT_INACTIVE';
      throw error;
    }

    // Check if first login password change is required
    const isFirstLogin = user.passwordChangedAt === null && user.role === 'EMPLOYEE';
    let accessMode = session.accessMode as AccessMode;
    let attendanceRequired = session.attendanceRequired;
    let restrictedUntil = session.restrictedUntil ? new Date(session.restrictedUntil) : null;
    let todayAttendance: any = null;

    let userEmployee = user.employee;
    if (Array.isArray(userEmployee)) {
      userEmployee = userEmployee[0] || null;
    }
    if (!userEmployee && user.id) {
      try {
        userEmployee = await DbService.query(
          async () => prisma.employee.findUnique({
            where: { userId: user.id },
            include: { department: true, designation: true },
          }),
          async () => {
            const emps = await DbService.restRequest<any[]>(`/employees?user_id=eq.${user.id}&select=*,department:departments(*),designation:designations(*)`);
            return emps?.[0] || null;
          }
        );
      } catch {}
    }
    const userEmployeeId = userEmployee?.id || null;

    if (isFirstLogin) {
      accessMode = 'FIRST_LOGIN_REQUIRED';
      attendanceRequired = false;
      restrictedUntil = null;
    } else {
      // Re-check attendance state
      const todayStr = DateTimeUtil.getTodayDateString();

      if (userEmployeeId) {
        todayAttendance = await DbService.query(
          async () => {
            return await prisma.attendance.findUnique({
              where: {
                employeeId_attendanceDate: {
                  employeeId: userEmployeeId,
                  attendanceDate: new Date(todayStr),
                },
              },
            });
          },
          async () => {
            const res = await DbService.restRequest<any[]>(
              `/attendance?employee_id=eq.${userEmployeeId}&attendance_date=eq.${todayStr}`
            );
            return res?.[0] || null;
          }
        );

        if (todayAttendance && todayAttendance.checkInAt) {
          // Upgrade session mode to NORMAL if it was marked
          accessMode = 'NORMAL';
          attendanceRequired = false;
          restrictedUntil = null;
        }
      }
    }

    const now = new Date();
    await DbService.query(
      async () => {
        await prisma.userSession.update({
          where: { id: session.id },
          data: {
            accessMode,
            attendanceRequired,
            restrictedUntil,
            lastActivityAt: now,
          },
        });
      },
      async () => {
        await DbService.restRequest(`/user_sessions?id=eq.${session.id}`, {
          method: 'PATCH',
          body: {
            access_mode: accessMode,
            attendance_required: attendanceRequired,
            restricted_until: restrictedUntil ? restrictedUntil.toISOString() : null,
            last_activity_at: now.toISOString(),
          },
        });
      }
    );

    const tokenPayload = {
      userId: user.id,
      sessionId: session.id,
      role: user.role,
      accessMode,
    };

    const newAccessToken = SecurityUtil.generateAccessToken(tokenPayload);
    const newRefreshToken = SecurityUtil.generateRefreshToken(tokenPayload);

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role as any,
      status: user.status as any,
      employeeId: userEmployee?.id || null,
      employeeCode: userEmployee?.employeeCode || userEmployee?.employee_code || null,
      firstName: userEmployee?.firstName || userEmployee?.first_name || null,
      lastName: userEmployee?.lastName || userEmployee?.last_name || null,
      displayName: userEmployee?.displayName || userEmployee?.display_name || user.email.split('@')[0],
      profilePhotoUrl: userEmployee?.profilePhotoUrl || userEmployee?.profile_photo_url || null,
      departmentId: userEmployee?.departmentId || userEmployee?.department_id || null,
      designationId: userEmployee?.designationId || userEmployee?.designation_id || null,
      departmentName: userEmployee?.department?.name || null,
      designationName: userEmployee?.designation?.name || null,
      firstLoginRequired: isFirstLogin,
    };

    const sessionInfo: SessionInfo = {
      sessionId: session.id,
      userId: user.id,
      accessMode,
      attendanceRequired,
      restrictedUntil: restrictedUntil ? restrictedUntil.toISOString() : null,
      expiresAt: session.expiresAt.toISOString ? session.expiresAt.toISOString() : session.expiresAt,
      user: authUser,
      firstLoginRequired: isFirstLogin,
      todayAttendance: todayAttendance
        ? {
            id: todayAttendance.id,
            employeeId: todayAttendance.employeeId || todayAttendance.employee_id,
            attendanceDate: DateTimeUtil.getTodayDateString(),
            status: todayAttendance.status,
            workMode: todayAttendance.workMode || todayAttendance.work_mode,
            verificationMethod: todayAttendance.verificationMethod || todayAttendance.verification_method,
            checkInAt: todayAttendance.checkInAt || todayAttendance.check_in_at,
            checkOutAt: todayAttendance.checkOutAt || todayAttendance.check_out_at,
            totalWorkMinutes: todayAttendance.totalWorkMinutes || todayAttendance.total_work_minutes,
            createdAt: todayAttendance.createdAt || todayAttendance.created_at,
            updatedAt: todayAttendance.updatedAt || todayAttendance.updated_at,
          }
        : null,
    };

    return { accessToken: newAccessToken, refreshToken: newRefreshToken, session: sessionInfo };
  }

  /**
   * Get Current Session Details
   */
  public static async getMe(userId: string, sessionId: string): Promise<SessionInfo> {
    const session = await DbService.query(
      async () => {
        return await prisma.userSession.findUnique({
          where: { id: sessionId },
          include: {
            user: {
              include: {
                employee: {
                  include: {
                    department: true,
                    designation: true,
                  },
                },
              },
            },
          },
        });
      },
      async () => {
        const res = await DbService.restRequest<any[]>(
          `/user_sessions?id=eq.${sessionId}&select=*,user:users(*,employee:employees(*,department:departments(*),designation:designations(*)))`
        );
        return res?.[0] || null;
      }
    );

    if (!session) {
      const error: any = new Error('Session not found');
      error.statusCode = 404;
      throw error;
    }

    const user = session.user;
    const isFirstLogin = user.passwordChangedAt === null && user.role === 'EMPLOYEE';
    const todayStr = DateTimeUtil.getTodayDateString();
    let todayAttendance: any = null;

    let userEmployee = user.employee;
    if (Array.isArray(userEmployee)) {
      userEmployee = userEmployee[0] || null;
    }
    if (!userEmployee && user.id) {
      try {
        userEmployee = await DbService.query(
          async () => prisma.employee.findUnique({
            where: { userId: user.id },
            include: { department: true, designation: true },
          }),
          async () => {
            const emps = await DbService.restRequest<any[]>(`/employees?user_id=eq.${user.id}&select=*,department:departments(*),designation:designations(*)`);
            return emps?.[0] || null;
          }
        );
      } catch {}
    }
    const userEmployeeId = userEmployee?.id || null;

    if (userEmployeeId) {
      todayAttendance = await DbService.query(
        async () => {
          return await prisma.attendance.findUnique({
            where: {
              employeeId_attendanceDate: {
                employeeId: userEmployeeId,
                attendanceDate: new Date(todayStr),
              },
            },
          });
        },
        async () => {
          const res = await DbService.restRequest<any[]>(
            `/attendance?employee_id=eq.${userEmployeeId}&attendance_date=eq.${todayStr}`
          );
          return res?.[0] || null;
        }
      );
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role as any,
      status: user.status as any,
      employeeId: userEmployee?.id || null,
      employeeCode: userEmployee?.employeeCode || userEmployee?.employee_code || null,
      firstName: userEmployee?.firstName || userEmployee?.first_name || null,
      lastName: userEmployee?.lastName || userEmployee?.last_name || null,
      displayName: userEmployee?.displayName || userEmployee?.display_name || user.email.split('@')[0],
      profilePhotoUrl: userEmployee?.profilePhotoUrl || userEmployee?.profile_photo_url || null,
      departmentId: userEmployee?.departmentId || userEmployee?.department_id || null,
      designationId: userEmployee?.designationId || userEmployee?.designation_id || null,
      departmentName: userEmployee?.department?.name || null,
      designationName: userEmployee?.designation?.name || null,
      firstLoginRequired: isFirstLogin,
    };

    return {
      sessionId: session.id,
      userId: user.id,
      accessMode: isFirstLogin ? 'FIRST_LOGIN_REQUIRED' : (session.accessMode as AccessMode),
      attendanceRequired: isFirstLogin ? false : session.attendanceRequired,
      restrictedUntil: !isFirstLogin && session.restrictedUntil ? new Date(session.restrictedUntil).toISOString() : null,
      expiresAt: new Date(session.expiresAt).toISOString(),
      user: authUser,
      firstLoginRequired: isFirstLogin,
      todayAttendance: todayAttendance
        ? {
            id: todayAttendance.id,
            employeeId: todayAttendance.employeeId || todayAttendance.employee_id,
            attendanceDate: todayStr,
            status: todayAttendance.status,
            workMode: todayAttendance.workMode || todayAttendance.work_mode,
            verificationMethod: todayAttendance.verificationMethod || todayAttendance.verification_method,
            checkInAt: todayAttendance.checkInAt || todayAttendance.check_in_at,
            checkOutAt: todayAttendance.checkOutAt || todayAttendance.check_out_at,
            totalWorkMinutes: todayAttendance.totalWorkMinutes || todayAttendance.total_work_minutes,
            createdAt: todayAttendance.createdAt || todayAttendance.created_at,
            updatedAt: todayAttendance.updatedAt || todayAttendance.updated_at,
          }
        : null,
    };
  }

  /**
   * Change Password
   */
  public static async changePassword(
    userId: string,
    sessionId: string,
    input: ChangePasswordInput,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ): Promise<{ accessToken: string; refreshToken: string; session: SessionInfo }> {
    const user = await DbService.query(
      async () => prisma.user.findUnique({
        where: { id: userId },
        include: {
          employee: {
            include: {
              department: true,
              designation: true,
            },
          },
        },
      }),
      async () => {
        const res = await DbService.restRequest<any[]>(`/users?id=eq.${userId}&select=*,employee:employees(*,department:departments(*),designation:designations(*))`);
        return res?.[0] || null;
      }
    );

    if (!user) {
      const error: any = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    const isValid = await SecurityUtil.verifyPassword(input.currentPassword, user.passwordHash || user.password_hash);
    if (!isValid) {
      const error: any = new Error('Current password does not match');
      error.statusCode = 400;
      error.code = 'INVALID_CURRENT_PASSWORD';
      throw error;
    }

    const newHash = await SecurityUtil.hashPassword(input.newPassword);
    const now = new Date();
    const todayStr = DateTimeUtil.getTodayDateString();

    // Determine upgraded access mode after password change
    let upgradedAccessMode: AccessMode = 'NORMAL';
    let upgradedAttendanceRequired = false;
    let upgradedRestrictedUntil: Date | null = null;
    let todayAttendance: any = null;

    if (user.employee?.id) {
      todayAttendance = await DbService.query(
        async () => {
          return await prisma.attendance.findUnique({
            where: {
              employeeId_attendanceDate: {
                employeeId: user.employee.id,
                attendanceDate: new Date(todayStr),
              },
            },
          });
        },
        async () => {
          const res = await DbService.restRequest<any[]>(
            `/attendance?employee_id=eq.${user.employee.id}&attendance_date=eq.${todayStr}`
          );
          return res?.[0] || null;
        }
      );

      const hasMarkedAttendance = todayAttendance && todayAttendance.checkInAt;
      if (user.role === 'EMPLOYEE') {
        if (hasMarkedAttendance) {
          upgradedAccessMode = 'NORMAL';
          upgradedAttendanceRequired = false;
          upgradedRestrictedUntil = null;
        } else {
          upgradedAccessMode = 'RESTRICTED';
          upgradedAttendanceRequired = true;
          upgradedRestrictedUntil = DateTimeUtil.addMinutes(now, 15);
        }
      }
    }

    await DbService.query(
      async () => {
        await prisma.user.update({
          where: { id: userId },
          data: {
            passwordHash: newHash,
            passwordChangedAt: now,
          },
        });
        // Upgrade current session
        await prisma.userSession.update({
          where: { id: sessionId },
          data: {
            accessMode: upgradedAccessMode,
            attendanceRequired: upgradedAttendanceRequired,
            restrictedUntil: upgradedRestrictedUntil,
            lastActivityAt: now,
          },
        });
        // Invalidate other sessions
        await prisma.userSession.updateMany({
          where: {
            userId,
            id: { not: sessionId },
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
      },
      async () => {
        await DbService.restRequest(`/users?id=eq.${userId}`, {
          method: 'PATCH',
          body: {
            password_hash: newHash,
            password_changed_at: now.toISOString(),
          },
        });
        await DbService.restRequest(`/user_sessions?id=eq.${sessionId}`, {
          method: 'PATCH',
          body: {
            access_mode: upgradedAccessMode,
            attendance_required: upgradedAttendanceRequired,
            restricted_until: upgradedRestrictedUntil ? upgradedRestrictedUntil.toISOString() : null,
            last_activity_at: now.toISOString(),
          },
        });
      }
    );

    await AuditService.log({
      userId,
      employeeId: user.employee?.id,
      action: 'PASSWORD_CHANGED',
      description: 'User changed password and completed first-login password setup',
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
    });

    const tokenPayload = {
      userId: user.id,
      sessionId,
      role: user.role,
      accessMode: upgradedAccessMode,
    };

    const accessToken = SecurityUtil.generateAccessToken(tokenPayload);
    const refreshToken = SecurityUtil.generateRefreshToken(tokenPayload);

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role as any,
      status: user.status as any,
      employeeId: user.employee?.id || null,
      employeeCode: user.employee?.employeeCode || null,
      firstName: user.employee?.firstName || null,
      lastName: user.employee?.lastName || null,
      displayName: user.employee?.displayName || user.email.split('@')[0],
      profilePhotoUrl: user.employee?.profilePhotoUrl || null,
      departmentId: user.employee?.departmentId || null,
      designationId: user.employee?.designationId || null,
      departmentName: user.employee?.department?.name || null,
      designationName: user.employee?.designation?.name || null,
      firstLoginRequired: false,
    };

    const sessionInfo: SessionInfo = {
      sessionId,
      userId: user.id,
      accessMode: upgradedAccessMode,
      attendanceRequired: upgradedAttendanceRequired,
      restrictedUntil: upgradedRestrictedUntil ? upgradedRestrictedUntil.toISOString() : null,
      expiresAt: DateTimeUtil.addMinutes(now, 7 * 24 * 60).toISOString(),
      user: authUser,
      firstLoginRequired: false,
      todayAttendance: todayAttendance
        ? {
            id: todayAttendance.id,
            employeeId: todayAttendance.employeeId || todayAttendance.employee_id,
            attendanceDate: todayStr,
            status: todayAttendance.status,
            workMode: todayAttendance.workMode || todayAttendance.work_mode,
            verificationMethod: todayAttendance.verificationMethod || todayAttendance.verification_method,
            checkInAt: todayAttendance.checkInAt || todayAttendance.check_in_at,
            checkOutAt: todayAttendance.checkOutAt || todayAttendance.check_out_at,
            totalWorkMinutes: todayAttendance.totalWorkMinutes || todayAttendance.total_work_minutes,
            createdAt: todayAttendance.createdAt || todayAttendance.created_at,
            updatedAt: todayAttendance.updatedAt || todayAttendance.updated_at,
          }
        : null,
    };

    return { accessToken, refreshToken, session: sessionInfo };
  }

  /**
   * Forgot Password - Dispatches branded WorkOS reset email with secure short-lived token
   */
  public static async forgotPassword(email: string): Promise<void> {
    const safeEmail = email.toLowerCase().trim();
    const user = await DbService.query(
      async () => prisma.user.findUnique({
        where: { email: safeEmail },
        include: { employee: true },
      }),
      async () => {
        const res = await DbService.restRequest<any[]>(`/users?email=eq.${encodeURIComponent(safeEmail)}&select=*,employee:employees(*)`);
        return res?.[0] || null;
      }
    );

    if (user && user.status === 'ACTIVE') {
      const resetToken = SecurityUtil.generatePasswordResetToken({
        userId: user.id,
        email: user.email,
        pwdChangedAt: user.passwordChangedAt ? new Date(user.passwordChangedAt).toISOString() : null,
      });

      const userName = user.employee?.displayName || user.employee?.firstName || user.email.split('@')[0];
      const baseUrl = config.appWebUrl || config.corsOrigin || 'http://localhost:3000';
      const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

      await EmailService.sendPasswordReset(user.email, {
        userName,
        resetUrl,
        expiresInMinutes: 60,
      });
    }
  }

  /**
   * Reset Password - Verifies secure short-lived token and updates password
   */
  public static async resetPassword(
    input: { token: string; newPassword?: string; password?: string; confirmPassword?: string },
    clientInfo: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const targetPassword = input.newPassword || input.password;
    if (!targetPassword) {
      const error: any = new Error('New password is required');
      error.statusCode = 400;
      error.code = 'PASSWORD_REQUIRED';
      throw error;
    }

    if (input.confirmPassword && targetPassword !== input.confirmPassword) {
      const error: any = new Error('New password and confirm password do not match');
      error.statusCode = 400;
      error.code = 'PASSWORD_MISMATCH';
      throw error;
    }

    const decoded = SecurityUtil.verifyPasswordResetToken(input.token);
    if (!decoded) {
      const error: any = new Error('Invalid or expired password reset link. Please request a new one.');
      error.statusCode = 400;
      error.code = 'INVALID_RESET_TOKEN';
      throw error;
    }

    const user = await DbService.query(
      async () => prisma.user.findUnique({ where: { id: decoded.userId } }),
      async () => {
        const res = await DbService.restRequest<any[]>(`/users?id=eq.${decoded.userId}`);
        return res?.[0] || null;
      }
    );

    if (!user || user.status !== 'ACTIVE') {
      const error: any = new Error('User account not found or inactive.');
      error.statusCode = 400;
      error.code = 'INVALID_USER';
      throw error;
    }

    // Single-use token check: verify that password was not changed after token was issued
    const userPasswordChangedAt = user.passwordChangedAt || user.password_changed_at;
    if (userPasswordChangedAt) {
      const userTime = new Date(userPasswordChangedAt).getTime();
      const tokenIatTime = decoded.iat ? decoded.iat * 1000 : null;
      const tokenPwdTime = decoded.pwdChangedAt ? new Date(decoded.pwdChangedAt).getTime() : null;

      // If token was issued before the last password change, reject it
      if (tokenPwdTime !== null && tokenPwdTime < userTime) {
        const error: any = new Error('This password reset link has already been used. Please request a new one.');
        error.statusCode = 400;
        error.code = 'RESET_TOKEN_USED';
        throw error;
      } else if (tokenIatTime !== null && tokenIatTime < (userTime - 1000)) {
        const error: any = new Error('This password reset link has already been used. Please request a new one.');
        error.statusCode = 400;
        error.code = 'RESET_TOKEN_USED';
        throw error;
      }
    }

    const newHash = await SecurityUtil.hashPassword(targetPassword);
    const now = new Date();

    await DbService.query(
      async () => {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            passwordHash: newHash,
            passwordChangedAt: now,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });

        // Revoke all active sessions upon password reset
        await prisma.userSession.updateMany({
          where: {
            userId: user.id,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
      },
      async () => {
        await DbService.restRequest(`/users?id=eq.${user.id}`, {
          method: 'PATCH',
          body: {
            password_hash: newHash,
            password_changed_at: now.toISOString(),
            failed_login_attempts: 0,
            locked_until: null,
          },
        });
        await DbService.restRequest(`/user_sessions?user_id=eq.${user.id}&revoked_at=is.null`, {
          method: 'PATCH',
          body: {
            revoked_at: now.toISOString(),
          },
        });
      }
    );

    await AuditService.log({
      userId: user.id,
      action: 'PASSWORD_CHANGED',
      description: 'Password reset completed via email link',
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
    });
  }
}

