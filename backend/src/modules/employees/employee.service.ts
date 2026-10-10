import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';
import { SecurityUtil } from '../../utils/security.js';
import { AuditService } from '../../services/audit.service.js';
import { EmailService } from '../../services/email.service.js';
import { config } from '../../config/env.js';
import { CreateEmployeeInput, UpdateEmployeeInput } from '../../validation/index.js';
import { AuthUser } from '../../types/index.js';
import { RbacService } from '../../services/rbac.service.js';
import { StorageService } from '../../services/storage.service.js';
import { invalidateUserAuthSessions } from '../../middleware/auth.js';
export class EmployeeService {
  /**
   * Resolve employee record by user ID
   */
  public static async resolveEmployeeByUserId(userId: string) {
    if (!userId) return null;
    return DbService.query(
      async () => prisma.employee.findUnique({ where: { userId } }),
      async () => {
        const emps = await DbService.restRequest<any[]>(`/employees?user_id=eq.${userId}`);
        return emps?.[0] || null;
      }
    );
  }

  /**
   * Centralized Business Rule:
   * Determine whether an employee is currently active and eligible for new work
   * (e.g. new projects, project teams, task assignments, calendar events, mentions).
   */
  public static isEmployeeEligibleForNewWork(employee: {
    employmentStatus?: string | null;
    user?: { status?: string | null } | null;
  } | null | undefined): boolean {
    if (!employee) return false;
    
    // Check employment status
    const empStatus = (employee.employmentStatus || '').toUpperCase();
    if (empStatus === 'TERMINATED' || empStatus === 'RESIGNED') {
      return false;
    }

    // Check user account status if present
    if (employee.user) {
      const userStatus = (employee.user.status || '').toUpperCase();
      if (userStatus === 'INACTIVE' || userStatus === 'SUSPENDED') {
        return false;
      }
    }

    return true;
  }

  /**
   * Helper to fetch employee and check their eligibility for new work
   */
  public static async getEmployeeEligibility(employeeId: string): Promise<{ exists: boolean; isEligible: boolean; employee: any | null }> {
    const employee = await DbService.query(
      async () =>
        prisma.employee.findUnique({
          where: { id: employeeId },
          include: { user: { select: { id: true, email: true, status: true, role: true } } },
        }),
      async () => {
        const emps = await DbService.restRequest<any[]>(
          `/employees?id=eq.${employeeId}&select=*,user:users(id,email,status,role)`
        );
        return emps?.[0] || null;
      }
    );

    if (!employee) {
      return { exists: false, isEligible: false, employee: null };
    }

    const isEligible = EmployeeService.isEmployeeEligibleForNewWork(employee);
    return { exists: true, isEligible, employee };
  }

  /**
   * List Employees with search, filtering, and pagination.
   * ACTIVE employees are ALWAYS listed first, followed by DEACTIVATED/TERMINATED employees.
   */
  public static async listEmployees(params: {
    search?: string;
    departmentId?: string;
    designationId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    return DbService.query(
      async () => {
        const where: any = {
          NOT: { user: { role: 'SUPER_ADMIN' } },
        };
        if (params.departmentId) where.departmentId = params.departmentId;
        if (params.designationId) where.designationId = params.designationId;

        const normStatus = (params.status || '').toLowerCase();
        if (normStatus === 'active') {
          where.employmentStatus = 'ACTIVE';
        } else if (normStatus === 'inactive' || normStatus === 'terminated' || normStatus === 'deactivated') {
          where.OR = [
            { employmentStatus: { in: ['TERMINATED', 'RESIGNED'] } },
            { user: { status: 'INACTIVE' } },
          ];
        } else if (params.status && normStatus !== 'all') {
          where.employmentStatus = params.status;
        }

        if (params.search) {
          where.OR = [
            { firstName: { contains: params.search, mode: 'insensitive' } },
            { lastName: { contains: params.search, mode: 'insensitive' } },
            { displayName: { contains: params.search, mode: 'insensitive' } },
            { employeeCode: { contains: params.search, mode: 'insensitive' } },
            { email: { contains: params.search, mode: 'insensitive' } },
          ];
        }

        const [items, total] = await Promise.all([
          prisma.employee.findMany({
            where,
            include: {
              department: true,
              designation: true,
              manager: {
                select: { id: true, displayName: true, firstName: true, lastName: true },
              },
              user: {
                select: { id: true, email: true, role: true, status: true, lastLoginAt: true },
              },
            },
            orderBy: [{ employmentStatus: 'asc' }, { displayName: 'asc' }, { createdAt: 'desc' }],
            skip,
            take: limit,
          }),
          prisma.employee.count({ where }),
        ]);

        const validItems = items.filter((e) => e.user?.role !== 'SUPER_ADMIN');
        const sorted = [...validItems].sort((a, b) => {
          const aActive = EmployeeService.isEmployeeEligibleForNewWork(a) ? 0 : 1;
          const bActive = EmployeeService.isEmployeeEligibleForNewWork(b) ? 0 : 1;
          if (aActive !== bActive) return aActive - bActive;
          const nameA = a.displayName || `${a.firstName || ''} ${a.lastName || ''}`.trim();
          const nameB = b.displayName || `${b.firstName || ''} ${b.lastName || ''}`.trim();
          return nameA.localeCompare(nameB);
        });

        return {
          items: sorted,
          meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        };
      },
      async () => {
        let path = `/employees?select=*,department:departments(*),designation:designations(*),user:users(id,email,role,status,last_login_at)&order=employment_status.asc,display_name.asc&limit=${limit}&offset=${skip}`;
        if (params.departmentId) path += `&department_id=eq.${params.departmentId}`;
        if (params.designationId) path += `&designation_id=eq.${params.designationId}`;
        
        const normStatus = (params.status || '').toLowerCase();
        if (normStatus === 'active') {
          path += `&employment_status=eq.ACTIVE`;
        } else if (normStatus === 'inactive' || normStatus === 'terminated' || normStatus === 'deactivated') {
          path += `&employment_status=in.(TERMINATED,RESIGNED)`;
        } else if (params.status && normStatus !== 'all') {
          path += `&employment_status=eq.${params.status}`;
        }

        const rawItems = await DbService.restRequest<any[]>(path);
        const filtered = (rawItems || []).filter((e) => e.user?.role !== 'SUPER_ADMIN');
        const sorted = [...filtered].sort((a, b) => {
          const aActive = EmployeeService.isEmployeeEligibleForNewWork(a) ? 0 : 1;
          const bActive = EmployeeService.isEmployeeEligibleForNewWork(b) ? 0 : 1;
          if (aActive !== bActive) return aActive - bActive;
          const nameA = a.displayName || `${a.firstName || ''} ${a.lastName || ''}`.trim();
          const nameB = b.displayName || `${b.firstName || ''} ${b.lastName || ''}`.trim();
          return nameA.localeCompare(nameB);
        });

        return {
          items: sorted,
          meta: { page, limit, total: sorted.length, totalPages: 1 },
        };
      }
    );
  }

  /**
   * List active, eligible employees within the authenticated user's administrative scope.
   * Excludes Super Admins (unless caller is Super Admin) and deactivated/terminated employees.
   */
  public static async listAssignableEmployees(
    user: AuthUser,
    params: { search?: string; departmentId?: string; projectId?: string } = {}
  ) {
    return DbService.query(
      async () => {
        const where: any = {
          employmentStatus: 'ACTIVE',
          NOT: { user: { role: 'SUPER_ADMIN' } },
        };

        if (params.departmentId) {
          where.departmentId = params.departmentId;
        }

        if (params.search && params.search.trim()) {
          where.OR = [
            { firstName: { contains: params.search, mode: 'insensitive' } },
            { lastName: { contains: params.search, mode: 'insensitive' } },
            { displayName: { contains: params.search, mode: 'insensitive' } },
            { employeeCode: { contains: params.search, mode: 'insensitive' } },
            { email: { contains: params.search, mode: 'insensitive' } },
          ];
        }

        const employees = await prisma.employee.findMany({
          where,
          include: {
            department: true,
            designation: true,
            user: {
              select: { id: true, email: true, role: true, status: true },
            },
          },
          orderBy: [{ displayName: 'asc' }],
        });

        // Filter eligible active employees and check user scope
        const scopedList = [];
        for (const emp of employees) {
          // Check user status
          if (emp.user && emp.user.status !== 'ACTIVE') {
            continue;
          }
          // Super Admin accounts must NEVER be returned as assignable employees
          if (emp.user?.role === 'SUPER_ADMIN') {
            continue;
          }

          const inScope = await RbacService.hasScopeAccess(user, {
            employeeId: emp.id,
            departmentId: emp.departmentId,
          });
          if (inScope) {
            scopedList.push(emp);
          }
        }

        return scopedList;
      },
      async () => {
        const employees = await DbService.restRequest<any[]>(
          `/employees?employment_status=eq.ACTIVE&select=*,department:departments(*),designation:designations(*),user:users(id,email,role,status)`
        );
        const filtered = (employees || []).filter((emp) => {
          const uStatus = emp.user?.status || 'ACTIVE';
          const uRole = emp.user?.role || 'EMPLOYEE';
          if (uStatus !== 'ACTIVE') return false;
          if (uRole === 'SUPER_ADMIN') return false;
          return true;
        });

        const scopedList = [];
        for (const emp of filtered) {
          const inScope = await RbacService.hasScopeAccess(user, {
            employeeId: emp.id,
            departmentId: emp.departmentId || emp.department_id,
          });
          if (inScope) {
            scopedList.push(emp);
          }
        }
        return scopedList;
      }
    );
  }

  /**
   * Get Employee by ID with comprehensive profile, schedules, and leaves
   */
  public static async getEmployeeById(id: string) {
    return DbService.query(
      async () => {
        const emp = await prisma.employee.findUnique({
          where: { id },
          include: {
            department: true,
            designation: true,
            manager: true,
            user: { select: { id: true, email: true, role: true, status: true, lastLoginAt: true } },
            leaveBalances: { include: { leaveType: true } },
            digitalIdCard: true,
            workSchedules: { include: { schedule: true }, orderBy: { effectiveFrom: 'desc' }, take: 1 },
          },
        });
        if (!emp) {
          const err: any = new Error('Employee not found');
          err.statusCode = 404;
          throw err;
        }
        return emp;
      },
      async () => {
        const emps = await DbService.restRequest<any[]>(
          `/employees?id=eq.${id}&select=*,department:departments(*),designation:designations(*),manager:employees(*),user:users(*),digital_id_card:digital_id_cards(*),leave_balances:employee_leave_balances(*,leave_type:leave_types(*))`
        );
        if (!emps || emps.length === 0) {
          const err: any = new Error('Employee not found');
          err.statusCode = 404;
          throw err;
        }
        return emps[0];
      }
    );
  }

  /**
   * Create Employee (Creates User + Employee + Leave Balances + Digital ID Card atomically)
   */
  /**
   * Create Employee (Creates User + Employee + Leave Balances + Digital ID Card atomically, and sends onboarding email)
   */
  public static async createEmployee(
    input: CreateEmployeeInput,
    actorUserId: string,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    const email = input.email.toLowerCase().trim();
    const displayName = input.displayName || `${input.firstName} ${input.lastName}`.trim();
    const employeeCode = input.employeeCode.toUpperCase().trim();

    // 1. Check for existing user with this email
    const existingUser = await DbService.query(
      async () => prisma.user.findUnique({ where: { email } }),
      async () => {
        const users = await DbService.restRequest<any[]>(`/users?email=eq.${encodeURIComponent(email)}`);
        return users?.[0] || null;
      }
    );

    if (existingUser) {
      const err: any = new Error('An account with this email address already exists');
      err.statusCode = 400;
      err.code = 'EMAIL_ALREADY_EXISTS';
      throw err;
    }

    // 2. Check for duplicate employee code
    const existingCode = await DbService.query(
      async () => prisma.employee.findUnique({ where: { employeeCode } }),
      async () => {
        const emps = await DbService.restRequest<any[]>(`/employees?employee_code=eq.${encodeURIComponent(employeeCode)}`);
        return emps?.[0] || null;
      }
    );

    if (existingCode) {
      const err: any = new Error('An employee with this employee code already exists');
      err.statusCode = 400;
      err.code = 'EMPLOYEE_CODE_ALREADY_EXISTS';
      throw err;
    }

    // 3. Generate secure temporary password & Argon2id hash
    const tempPassword = input.password || SecurityUtil.generateTemporaryPassword();
    const passwordHash = await SecurityUtil.hashPassword(tempPassword);

    const employee = await DbService.query(
      async () => {
        return await prisma.$transaction(async (tx) => {
          // 1. Create User with passwordChangedAt = null (FIRST_LOGIN_REQUIRED = true)
          const user = await tx.user.create({
            data: {
              email,
              passwordHash,
              role: input.role || 'EMPLOYEE',
              status: 'ACTIVE',
              passwordChangedAt: null,
            },
          });

          // 2. Create Employee Profile
          const emp = await tx.employee.create({
            data: {
              userId: user.id,
              employeeCode,
              firstName: input.firstName,
              lastName: input.lastName,
              displayName,
              email,
              phone: input.phone || null,
              dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
              gender: input.gender as any,
              departmentId: input.departmentId || null,
              designationId: input.designationId || null,
              managerId: input.managerId || null,
              joiningDate: input.joiningDate ? new Date(input.joiningDate) : new Date(),
              employmentStatus: input.employmentStatus || 'ACTIVE',
              addressLine1: input.addressLine1 || null,
              addressLine2: input.addressLine2 || null,
              city: input.city || null,
              state: input.state || null,
              country: input.country || null,
              postalCode: input.postalCode || null,
              emergencyContactName: input.emergencyContactName || null,
              emergencyContactPhone: input.emergencyContactPhone || null,
              emergencyContactRelation: input.emergencyContactRelation || null,
            },
            include: {
              department: true,
              designation: true,
            },
          });

          // 3. Create Digital ID Card
          await tx.digitalIdCard.create({
            data: {
              employeeId: emp.id,
              cardNumber: `ID-${employeeCode}`,
              isActive: true,
            },
          });

          // 4. Initialize Leave Balances for all active leave types
          const currentYear = new Date().getFullYear();
          const leaveTypes = await tx.leaveType.findMany({ where: { isActive: true } });
          for (const lt of leaveTypes) {
            await tx.employeeLeaveBalance.create({
              data: {
                employeeId: emp.id,
                leaveTypeId: lt.id,
                year: currentYear,
                allocatedDays: lt.defaultDaysPerYear,
                usedDays: 0,
                pendingDays: 0,
              },
            });
          }

          // 5. Assign Work Schedule if specified
          if (input.workScheduleId) {
            await tx.employeeWorkSchedule.create({
              data: {
                employeeId: emp.id,
                scheduleId: input.workScheduleId,
                effectiveFrom: new Date(),
              },
            });
          }

          await AuditService.log({
            userId: actorUserId,
            employeeId: emp.id,
            action: 'CREATE',
            entityType: 'employee',
            entityId: emp.id,
            description: `Created employee ${emp.displayName} (${emp.employeeCode}) with temporary password`,
            ipAddress: clientInfo.ipAddress,
            userAgent: clientInfo.userAgent,
          });

          return emp;
        });
      },
      async () => {
        // REST Fallback creation
        const users = await DbService.restRequest<any[]>('/users', {
          method: 'POST',
          body: {
            email,
            password_hash: passwordHash,
            role: input.role || 'EMPLOYEE',
            status: 'ACTIVE',
            password_changed_at: null,
          },
        });
        const user = users[0];

        const emps = await DbService.restRequest<any[]>('/employees', {
          method: 'POST',
          body: {
            user_id: user.id,
            employee_code: employeeCode,
            first_name: input.firstName,
            last_name: input.lastName,
            display_name: displayName,
            email,
            phone: input.phone || null,
            department_id: input.departmentId || null,
            designation_id: input.designationId || null,
            manager_id: input.managerId || null,
            employment_status: input.employmentStatus || 'ACTIVE',
          },
        });
        const emp = emps[0];

        await DbService.restRequest('/digital_id_cards', {
          method: 'POST',
          body: {
            employee_id: emp.id,
            card_number: `ID-${employeeCode}`,
            is_active: true,
          },
        });

        return emp;
      }
    );

    // 4. Outside transaction: Send Onboarding Email with temporary password
    EmailService.sendWelcomeEmployee(employee.email, {
      employeeName: employee.displayName,
      email: employee.email,
      temporaryPassword: tempPassword,
      loginUrl: `${config.appWebUrl}/login`,
      employeeCode: employee.employeeCode,
      role: input.role || 'EMPLOYEE',
      departmentName: employee.department?.name,
      designationName: employee.designation?.name,
    }).catch((err) => {
      console.error(`[EmployeeService] Failed to send welcome email to ${employee.email}:`, err.message);
    });

    return employee;
  }

  /**
   * Resend Onboarding Email with new temporary password
   */
  public static async resendOnboardingEmail(
    employeeId: string,
    actorUserId: string,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    const employee = await DbService.query(
      async () => {
        return await prisma.employee.findUnique({
          where: { id: employeeId },
          include: {
            user: true,
            department: true,
            designation: true,
          },
        });
      },
      async () => {
        const emps = await DbService.restRequest<any[]>(
          `/employees?id=eq.${employeeId}&select=*,user:users(*),department:departments(*),designation:designations(*)`
        );
        return emps?.[0] || null;
      }
    );

    if (!employee || !employee.user) {
      const err: any = new Error('Employee or user record not found');
      err.statusCode = 404;
      err.code = 'EMPLOYEE_NOT_FOUND';
      throw err;
    }

    // Block resend for deactivated employees
    if (employee.user.status === 'INACTIVE') {
      const err: any = new Error('Cannot resend onboarding email for a deactivated employee account');
      err.statusCode = 400;
      err.code = 'EMPLOYEE_INACTIVE';
      throw err;
    }

    if (employee.user.passwordChangedAt !== null) {
      const err: any = new Error('Employee has already completed their first login and password setup.');
      err.statusCode = 400;
      err.code = 'PASSWORD_ALREADY_SET';
      throw err;
    }

    // Generate fresh temporary password and hash
    const newTempPassword = SecurityUtil.generateTemporaryPassword();
    const newHash = await SecurityUtil.hashPassword(newTempPassword);

    await DbService.query(
      async () => {
        await prisma.user.update({
          where: { id: employee.user.id },
          data: {
            passwordHash: newHash,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });
      },
      async () => {
        await DbService.restRequest(`/users?id=eq.${employee.user.id}`, {
          method: 'PATCH',
          body: {
            password_hash: newHash,
            failed_login_attempts: 0,
            locked_until: null,
          },
        });
      }
    );

    // Send onboarding email
    const emailResult = await EmailService.sendWelcomeEmployee(employee.email, {
      employeeName: employee.displayName,
      email: employee.email,
      temporaryPassword: newTempPassword,
      loginUrl: `${config.appWebUrl}/login`,
      employeeCode: employee.employeeCode,
      role: employee.user.role,
      departmentName: employee.department?.name,
      designationName: employee.designation?.name,
    });

    await AuditService.log({
      userId: actorUserId,
      employeeId: employee.id,
      action: 'UPDATE',
      entityType: 'employee',
      entityId: employee.id,
      description: `Resent onboarding email with new temporary password to ${employee.email}`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
    });

    return {
      success: true,
      message: `New temporary login credentials have been sent to ${employee.email}`,
      emailSent: emailResult.success,
    };
  }


  /**
   * Update Employee
   */
  public static async updateEmployee(
    id: string,
    input: UpdateEmployeeInput,
    actorUserId: string,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    return DbService.query(
      async () => {
        const data: any = { ...input };
        delete data.workScheduleId;

        if (input.dateOfBirth) data.dateOfBirth = new Date(input.dateOfBirth);
        if (input.joiningDate !== undefined) {
          if (input.joiningDate === null || input.joiningDate === '') {
            data.joiningDate = null;
          } else {
            const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.joiningDate);
            if (match) {
              data.joiningDate = new Date(Date.UTC(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10), 12, 0, 0));
            } else {
              data.joiningDate = new Date(input.joiningDate);
            }
          }
        }

        const updated = await prisma.employee.update({
          where: { id },
          data,
          include: { department: true, designation: true },
        });

        await AuditService.log({
          userId: actorUserId,
          employeeId: id,
          action: 'UPDATE',
          entityType: 'employee',
          entityId: id,
          description: `Updated employee profile for ${updated.displayName}`,
          ipAddress: clientInfo.ipAddress,
          userAgent: clientInfo.userAgent,
        });

        return DbService.toCamelCase(updated);
      },
      async () => {
        const restBody: any = { ...input };
        if (input.joiningDate !== undefined) {
          restBody.joining_date = input.joiningDate ? input.joiningDate.slice(0, 10) : null;
          delete restBody.joiningDate;
        }
        const updated = await DbService.restRequest(`/employees?id=eq.${id}`, {
          method: 'PATCH',
          body: restBody,
        });
        return updated?.[0] ? DbService.toCamelCase(updated[0]) : null;
      }
    );
  }

  /**
   * Update Joining Date for an employee
   */
  public static async updateJoiningDate(
    employeeId: string,
    joiningDate: string | null | undefined,
    actorUserId: string,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    // 1. Fetch current employee
    const currentEmp = await DbService.query(
      async () =>
        prisma.employee.findUnique({
          where: { id: employeeId },
          select: { id: true, displayName: true, joiningDate: true },
        }),
      async () => {
        const emps = await DbService.restRequest<any[]>(
          `/employees?id=eq.${employeeId}&select=id,display_name,joining_date`
        );
        return emps?.[0] ? DbService.toCamelCase(emps[0]) : null;
      }
    );

    if (!currentEmp) {
      const err: any = new Error('Employee not found');
      err.statusCode = 404;
      err.code = 'EMPLOYEE_NOT_FOUND';
      throw err;
    }

    let parsedDate: Date | null = null;
    let formattedDateStr: string | null = null;

    if (joiningDate !== null && joiningDate !== undefined && String(joiningDate).trim() !== '') {
      const trimmed = String(joiningDate).trim();
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
      if (!match) {
        const err: any = new Error('Invalid date format. Expected YYYY-MM-DD');
        err.statusCode = 400;
        err.code = 'INVALID_DATE_FORMAT';
        throw err;
      }
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);

      if (year < 1950 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
        const err: any = new Error('Invalid date values for year, month, or day');
        err.statusCode = 400;
        err.code = 'INVALID_DATE_VALUES';
        throw err;
      }

      // Check valid calendar day (e.g. leap years, days in month)
      const testD = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      if (testD.getUTCFullYear() !== year || testD.getUTCMonth() !== month - 1 || testD.getUTCDate() !== day) {
        const err: any = new Error('Invalid calendar date');
        err.statusCode = 400;
        err.code = 'INVALID_CALENDAR_DATE';
        throw err;
      }

      parsedDate = testD;
      formattedDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    const prevDateStr = currentEmp.joiningDate
      ? (currentEmp.joiningDate instanceof Date
          ? currentEmp.joiningDate.toISOString().slice(0, 10)
          : String(currentEmp.joiningDate).slice(0, 10))
      : 'Not set';

    // 2. Update employee joining date only
    const updated = await DbService.query(
      async () => {
        return await prisma.employee.update({
          where: { id: employeeId },
          data: { joiningDate: parsedDate },
          include: { department: true, designation: true },
        });
      },
      async () => {
        const res = await DbService.restRequest<any[]>(`/employees?id=eq.${employeeId}`, {
          method: 'PATCH',
          body: { joining_date: formattedDateStr },
        });
        return res?.[0] ? DbService.toCamelCase(res[0]) : null;
      }
    );

    // 3. Audit log
    await AuditService.log({
      userId: actorUserId,
      employeeId,
      action: 'UPDATE',
      entityType: 'employee',
      entityId: employeeId,
      description: `Updated joining date for ${currentEmp.displayName} from ${prevDateStr} to ${formattedDateStr || 'Not set'}`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
      metadata: {
        field: 'joiningDate',
        previousValue: prevDateStr,
        newValue: formattedDateStr || null,
      },
    });

    return DbService.toCamelCase(updated);
  }

  /**
   * Deactivate Employee (Safe Soft Delete)
   *
   * Sets user.status = INACTIVE and employee.employmentStatus = TERMINATED.
   * Revokes all active sessions immediately.
   * Closes any running task timer with actual elapsed duration.
   * Creates an audit log entry.
   * Does NOT delete any historical records.
   */
  public static async deactivateEmployee(
    employeeId: string,
    actorUserId: string,
    actorEmployeeId: string | null,
    actorRole: string,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    // 1. Fetch employee + user
    const employee = await DbService.query(
      async () =>
        prisma.employee.findUnique({
          where: { id: employeeId },
          include: { user: true },
        }),
      async () => {
        const emps = await DbService.restRequest<any[]>(
          `/employees?id=eq.${employeeId}&select=*,user:users(*)`
        );
        return emps?.[0] || null;
      }
    );

    if (!employee || !employee.user) {
      const err: any = new Error('Employee not found');
      err.statusCode = 404;
      err.code = 'EMPLOYEE_NOT_FOUND';
      throw err;
    }

    // 2. Self-deactivation protection
    if (actorEmployeeId && actorEmployeeId === employeeId) {
      const err: any = new Error('You cannot deactivate your own account');
      err.statusCode = 400;
      err.code = 'SELF_DEACTIVATION_FORBIDDEN';
      throw err;
    }

    // 3. Protect SUPER_ADMIN from being deactivated by ADMIN
    if (employee.user.role === 'SUPER_ADMIN' && actorRole === 'ADMIN') {
      const err: any = new Error('Admins cannot deactivate a Super Admin account');
      err.statusCode = 403;
      err.code = 'CANNOT_DEACTIVATE_SUPER_ADMIN';
      throw err;
    }

    // 4. Idempotency: already inactive
    if (employee.user.status === 'INACTIVE') {
      return { alreadyInactive: true, deactivated: false };
    }

    const now = new Date();
    const userId = employee.user.id;

    await DbService.query(
      async () => {
        await prisma.$transaction(async (tx) => {
          // a) Mark user inactive
          await tx.user.update({
            where: { id: userId },
            data: { status: 'INACTIVE' },
          });

          // b) Mark employee as terminated
          await tx.employee.update({
            where: { id: employeeId },
            data: { employmentStatus: 'TERMINATED' },
          });

          // c) Revoke all active sessions
          await tx.userSession.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: now },
          });

          // d) Close any running task timer with actual elapsed duration
          const activeTimer = await tx.taskTimer.findFirst({
            where: { employeeId, isActive: true },
            orderBy: { startedAt: 'desc' },
          });

          if (activeTimer) {
            const elapsedSeconds = Math.max(
              0,
              Math.floor((now.getTime() - new Date(activeTimer.startedAt).getTime()) / 1000)
            );
            await tx.taskTimer.update({
              where: { id: activeTimer.id },
              data: {
                endedAt: now,
                pausedAt: now,
                durationSeconds: (activeTimer.durationSeconds || 0) + elapsedSeconds,
                isActive: false,
              },
            });
            // Leave task status as-is (PAUSED) — don't auto-complete
            await tx.task.update({
              where: { id: activeTimer.taskId },
              data: { status: 'PAUSED' },
            });
          }
        });
      },
      async () => {
        // REST fallback
        await DbService.restRequest(`/users?id=eq.${userId}`, {
          method: 'PATCH',
          body: { status: 'INACTIVE' },
        });
        await DbService.restRequest(`/employees?id=eq.${employeeId}`, {
          method: 'PATCH',
          body: { employment_status: 'TERMINATED' },
        });
        await DbService.restRequest(`/user_sessions?user_id=eq.${userId}&revoked_at=is.null`, {
          method: 'PATCH',
          body: { revoked_at: now.toISOString() },
        });

        // Close active timer if any
        const activeTimers = await DbService.restRequest<any[]>(
          `/task_timers?employee_id=eq.${employeeId}&is_active=eq.true`
        );
        for (const t of activeTimers || []) {
          const startedAt = t.startedAt || t.started_at;
          const elapsed = Math.max(
            0,
            Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000)
          );
          await DbService.restRequest(`/task_timers?id=eq.${t.id}`, {
            method: 'PATCH',
            body: {
              ended_at: now.toISOString(),
              paused_at: now.toISOString(),
              duration_seconds: (t.durationSeconds || t.duration_seconds || 0) + elapsed,
              is_active: false,
            },
          });
          const taskId = t.taskId || t.task_id;
          if (taskId) {
            await DbService.restRequest(`/tasks?id=eq.${taskId}`, {
              method: 'PATCH',
              body: { status: 'PAUSED' },
            });
          }
        }
      }
    );

    // 5. Audit log
    await AuditService.log({
      userId: actorUserId,
      employeeId: employee.id,
      action: 'DELETE',
      entityType: 'employee',
      entityId: employee.id,
      description: `Deactivated employee ${employee.displayName} (${employee.employeeCode}) — account set to INACTIVE, employment status set to TERMINATED, all sessions revoked`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
      metadata: {
        targetUserId: userId,
        targetEmployeeCode: employee.employeeCode,
        deactivatedBy: actorUserId,
      },
    });

    return { alreadyInactive: false, deactivated: true };
  }

  /**
   * Reactivate an inactive / terminated employee
   */
  public static async reactivateEmployee(
    employeeId: string,
    actorUserId: string,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    const employee = await DbService.query(
      async () =>
        prisma.employee.findUnique({
          where: { id: employeeId },
          include: { user: true },
        }),
      async () => {
        const emps = await DbService.restRequest<any[]>(
          `/employees?id=eq.${employeeId}&select=*,user:users(*)`
        );
        return emps?.[0] || null;
      }
    );

    if (!employee || !employee.user) {
      const err: any = new Error('Employee not found');
      err.statusCode = 404;
      err.code = 'EMPLOYEE_NOT_FOUND';
      throw err;
    }

    const userId = employee.user.id;

    await DbService.query(
      async () => {
        await prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: userId },
            data: { status: 'ACTIVE' },
          });
          await tx.employee.update({
            where: { id: employeeId },
            data: { employmentStatus: 'ACTIVE' },
          });
        });
      },
      async () => {
        await DbService.restRequest(`/users?id=eq.${userId}`, {
          method: 'PATCH',
          body: { status: 'ACTIVE' },
        });
        await DbService.restRequest(`/employees?id=eq.${employeeId}`, {
          method: 'PATCH',
          body: { employment_status: 'ACTIVE' },
        });
      }
    );

    await AuditService.log({
      userId: actorUserId,
      employeeId: employee.id,
      action: 'UPDATE',
      entityType: 'employee',
      entityId: employee.id,
      description: `Reactivated employee ${employee.displayName} (${employee.employeeCode}) — account set to ACTIVE, employment status set to ACTIVE`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
      metadata: {
        targetUserId: userId,
        targetEmployeeCode: employee.employeeCode,
        reactivatedBy: actorUserId,
      },
    });

    return { reactivated: true, message: 'Employee reactivated successfully' };
  }

  /**
   * Update Self Profile
   */
  public static async updateSelfProfile(
    employeeId: string,
    data: {
      displayName?: string;
      phone?: string | null;
      addressLine1?: string | null;
      addressLine2?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
      emergencyContactRelation?: string | null;
    }
  ) {
    return DbService.query(
      async () => {
        return await prisma.employee.update({
          where: { id: employeeId },
          data,
        });
      },
      async () => {
        const res = await DbService.restRequest(`/employees?id=eq.${employeeId}`, {
          method: 'PATCH',
          body: data,
        });
        return res[0];
      }
    );
  }

  /**
   * Upload & Compress Profile Photo for authenticated employee
   */
  public static async uploadProfilePhoto(
    employeeId: string,
    userId: string,
    imageData: string | Buffer
  ): Promise<{ profilePhotoUrl: string; employee: any }> {
    // 1. Validate image format, size, and magic bytes
    const validation = StorageService.validateAndParseImage(imageData);
    if (!validation.valid) {
      const err: any = new Error(validation.error || 'Invalid image file');
      err.statusCode = 400;
      err.code = 'INVALID_IMAGE';
      throw err;
    }

    // 2. Fetch current employee to know previous photo URL (to delete old photo after replacement)
    const currentEmp = await DbService.query(
      async () => prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, profilePhotoUrl: true } }),
      async () => {
        const emps = await DbService.restRequest<any[]>(`/employees?id=eq.${employeeId}&select=id,profile_photo_url`);
        return emps?.[0] || null;
      }
    );

    if (!currentEmp) {
      const err: any = new Error('Employee record not found');
      err.statusCode = 404;
      err.code = 'EMPLOYEE_NOT_FOUND';
      throw err;
    }

    const previousPhotoUrl = currentEmp.profilePhotoUrl || (currentEmp as any).profile_photo_url;

    // 3. Upload new photo to Supabase Storage
    const publicUrl = await StorageService.uploadProfilePhoto(
      employeeId,
      validation.buffer,
      validation.mimeType,
      validation.extension
    );

    // 4. Update employee record in database
    const updatedEmployee = await DbService.query(
      async () => {
        return await prisma.employee.update({
          where: { id: employeeId },
          data: { profilePhotoUrl: publicUrl },
          include: { department: true, designation: true },
        });
      },
      async () => {
        const res = await DbService.restRequest<any[]>(`/employees?id=eq.${employeeId}`, {
          method: 'PATCH',
          body: { profile_photo_url: publicUrl },
        });
        return res?.[0] || null;
      }
    );

    // 5. Invalidate auth session cache so subsequent getMe() calls reflect the new photo immediately
    invalidateUserAuthSessions(userId);

    // 6. Clean up old image from storage only AFTER DB update succeeds
    if (previousPhotoUrl && previousPhotoUrl !== publicUrl) {
      StorageService.deleteFileByUrl(previousPhotoUrl).catch(() => {});
    }

    return {
      profilePhotoUrl: publicUrl,
      employee: DbService.toCamelCase(updatedEmployee),
    };
  }

  /**
   * Delete Profile Photo for authenticated employee
   */
  public static async deleteProfilePhoto(
    employeeId: string,
    userId: string
  ): Promise<{ success: boolean; employee: any }> {
    const currentEmp = await DbService.query(
      async () => prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, profilePhotoUrl: true } }),
      async () => {
        const emps = await DbService.restRequest<any[]>(`/employees?id=eq.${employeeId}&select=id,profile_photo_url`);
        return emps?.[0] || null;
      }
    );

    if (!currentEmp) {
      const err: any = new Error('Employee record not found');
      err.statusCode = 404;
      err.code = 'EMPLOYEE_NOT_FOUND';
      throw err;
    }

    const previousPhotoUrl = currentEmp.profilePhotoUrl || (currentEmp as any).profile_photo_url;

    const updatedEmployee = await DbService.query(
      async () => {
        return await prisma.employee.update({
          where: { id: employeeId },
          data: { profilePhotoUrl: null },
          include: { department: true, designation: true },
        });
      },
      async () => {
        const res = await DbService.restRequest<any[]>(`/employees?id=eq.${employeeId}`, {
          method: 'PATCH',
          body: { profile_photo_url: null },
        });
        return res?.[0] || null;
      }
    );

    invalidateUserAuthSessions(userId);

    if (previousPhotoUrl) {
      StorageService.deleteFileByUrl(previousPhotoUrl).catch(() => {});
    }

    return {
      success: true,
      employee: DbService.toCamelCase(updatedEmployee),
    };
  }

  /**
   * Generates the next sequential unique Employee Code (e.g. EMP006)
   * Finds the highest numeric suffix in existing employee records to guarantee no collisions or reuse.
   */
  public static async generateNextEmployeeCode(): Promise<string> {
    const employees = await DbService.query(
      async () => prisma.employee.findMany({ select: { employeeCode: true } }),
      async () => {
        const raw = await DbService.restRequest<any[]>('/employees?select=employee_code');
        return (raw || []).map((e: any) => ({ employeeCode: e.employee_code || e.employeeCode || '' }));
      }
    );

    let maxNum = 0;
    for (const emp of employees || []) {
      const code = (emp.employeeCode || (emp as any).employee_code || '').trim();
      const match = code.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }

    const nextNum = maxNum + 1;
    const formatted = `EMP${String(nextNum).padStart(3, '0')}`;
    return formatted;
  }
}
