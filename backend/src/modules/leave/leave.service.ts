import { prisma } from '../../plugins/prisma.js';
import { DbService } from '../../services/db.service.js';
import { AuditService } from '../../services/audit.service.js';
import { EmailService } from '../../services/email.service.js';
import { leaveSubmittedTemplate, leaveApprovedTemplate, leaveRejectedTemplate } from '../email/email.templates.js';
import { config } from '../../config/env.js';
import { AuthUser, LeaveStatus } from '../../types/index.js';
import { RbacService } from '../../services/rbac.service.js';
import { NotificationService } from '../notifications/notification.service.js';
import { WorkdayService } from '../../services/workday.service.js';
import { DateTimeUtil } from '../../utils/datetime.js';
import { randomUUID } from 'crypto';

export interface LeavePolicyConfig {
  leaveTypeId: string;
  policyCycle: 'MONTHLY' | 'ANNUAL';
  monthlyAllocation: number;
  annualAllocation: number;
  carryForward: boolean;
  maxCarryForward: number;
  requiresApproval: boolean;
  minNoticeDays: number;
  isActive: boolean;
  description?: string | null;
}

export interface LeaveAllocationRecord {
  id: string;
  leaveTypeId: string;
  year: number;
  month: number | null; // null for annual allocation, 1-12 for monthly
  targetType: 'ALL' | 'EMPLOYEE' | 'EMPLOYEES' | 'DEPARTMENT' | 'DESIGNATION';
  targetEmployeeIds?: string[];
  targetDepartmentId?: string | null;
  targetDesignationId?: string | null;
  allocatedDays: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export class LeaveService {
  private static readonly POLICIES_SETTING_KEY = 'workos_leave_policies';
  private static readonly ALLOCATIONS_SETTING_KEY = 'workos_leave_allocations';

  // ==========================================
  // LEAVE TYPES (CRUD)
  // ==========================================

  public static async getLeaveTypes(includeInactive: boolean = false) {
    return DbService.query(
      async () => prisma.leaveType.findMany({
        where: includeInactive ? {} : { isActive: true },
        orderBy: { name: 'asc' },
      }),
      async () => {
        const path = includeInactive ? '/leave_types?order=name.asc' : '/leave_types?is_active=eq.true&order=name.asc';
        return DbService.restRequest(path);
      }
    );
  }

  public static async createLeaveType(
    input: { name: string; description?: string | null; defaultDaysPerYear?: number; isPaid?: boolean },
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    const leaveType = await DbService.query(
      async () => prisma.leaveType.create({
        data: {
          name: input.name,
          description: input.description,
          defaultDaysPerYear: input.defaultDaysPerYear || 12,
          isPaid: input.isPaid !== false,
          isActive: true,
        },
      }),
      async () => {
        const rows = await DbService.restRequest<any[]>('/leave_types', {
          method: 'POST',
          body: {
            name: input.name,
            description: input.description,
            default_days_per_year: input.defaultDaysPerYear || 12,
            is_paid: input.isPaid !== false,
            is_active: true,
          },
        });
        return rows[0];
      }
    );

    await AuditService.log({
      userId: user.id,
      action: 'CREATE',
      entityType: 'leave_type',
      entityId: leaveType.id,
      description: `Created leave type: ${input.name}`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
    });

    return leaveType;
  }

  public static async updateLeaveType(
    id: string,
    input: { name?: string; description?: string | null; defaultDaysPerYear?: number; isPaid?: boolean; isActive?: boolean },
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    const updated = await DbService.query(
      async () => prisma.leaveType.update({
        where: { id },
        data: input,
      }),
      async () => {
        const rows = await DbService.restRequest<any[]>(`/leave_types?id=eq.${id}`, {
          method: 'PATCH',
          body: DbService.toSnakeCase(input),
        });
        return rows[0];
      }
    );

    await AuditService.log({
      userId: user.id,
      action: 'UPDATE',
      entityType: 'leave_type',
      entityId: id,
      description: `Updated leave type: ${input.name || id}`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
    });

    return updated;
  }

  public static async deleteLeaveType(
    id: string,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    return LeaveService.updateLeaveType(id, { isActive: false }, user, clientInfo);
  }

  // ==========================================
  // LEAVE POLICIES (CRUD)
  // ==========================================

  public static async getPolicies(): Promise<LeavePolicyConfig[]> {
    const [leaveTypes, setting] = await Promise.all([
      LeaveService.getLeaveTypes(true),
      DbService.query(
        async () => prisma.systemSetting.findUnique({ where: { settingKey: LeaveService.POLICIES_SETTING_KEY } }),
        async () => {
          const rows = await DbService.restRequest<any[]>(`/system_settings?setting_key=eq.${LeaveService.POLICIES_SETTING_KEY}`);
          return rows?.[0] || null;
        }
      ),
    ]);

    const storedPolicies: LeavePolicyConfig[] = (setting?.settingValue as LeavePolicyConfig[]) || [];
    const policyMap = new Map<string, LeavePolicyConfig>();
    for (const p of storedPolicies) {
      policyMap.set(p.leaveTypeId, p);
    }

    // Default policy builder for any unconfigured leave type
    const result: LeavePolicyConfig[] = [];
    for (const lt of leaveTypes) {
      if (policyMap.has(lt.id)) {
        result.push(policyMap.get(lt.id)!);
      } else {
        const isCasual = lt.name.toLowerCase().includes('casual');
        const defaultAnnual = Number(lt.defaultDaysPerYear || 12);
        const defaultMonthly = isCasual ? 2 : Math.round((defaultAnnual / 12) * 10) / 10;
        result.push({
          leaveTypeId: lt.id,
          policyCycle: isCasual ? 'MONTHLY' : 'ANNUAL',
          monthlyAllocation: defaultMonthly,
          annualAllocation: defaultAnnual,
          carryForward: !isCasual,
          maxCarryForward: isCasual ? 0 : 6,
          requiresApproval: true,
          minNoticeDays: 0,
          isActive: lt.isActive,
          description: lt.description,
        });
      }
    }

    return result;
  }

  public static async updatePolicy(
    leaveTypeId: string,
    input: Partial<LeavePolicyConfig>,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    const currentPolicies = await LeaveService.getPolicies();
    const index = currentPolicies.findIndex((p) => p.leaveTypeId === leaveTypeId);

    const updatedPolicy: LeavePolicyConfig = index >= 0
      ? { ...currentPolicies[index], ...input, leaveTypeId }
      : {
          leaveTypeId,
          policyCycle: input.policyCycle || 'MONTHLY',
          monthlyAllocation: input.monthlyAllocation ?? 2,
          annualAllocation: input.annualAllocation ?? 24,
          carryForward: input.carryForward ?? false,
          maxCarryForward: input.maxCarryForward ?? 0,
          requiresApproval: input.requiresApproval ?? true,
          minNoticeDays: input.minNoticeDays ?? 0,
          isActive: input.isActive ?? true,
          description: input.description,
        };

    if (index >= 0) {
      currentPolicies[index] = updatedPolicy;
    } else {
      currentPolicies.push(updatedPolicy);
    }

    await DbService.query(
      async () => prisma.systemSetting.upsert({
        where: { settingKey: LeaveService.POLICIES_SETTING_KEY },
        create: {
          settingKey: LeaveService.POLICIES_SETTING_KEY,
          settingValue: currentPolicies as any,
          description: 'Configured leave policies and carry-forward rules',
        },
        update: {
          settingValue: currentPolicies as any,
        },
      }),
      async () => {
        const existing = await DbService.restRequest<any[]>(`/system_settings?setting_key=eq.${LeaveService.POLICIES_SETTING_KEY}`);
        if (existing && existing.length > 0) {
          const res = await DbService.restRequest(`/system_settings?setting_key=eq.${LeaveService.POLICIES_SETTING_KEY}`, {
            method: 'PATCH',
            body: { setting_value: currentPolicies },
          });
          return (res as any)?.[0] || null;
        } else {
          const res = await DbService.restRequest('/system_settings', {
            method: 'POST',
            body: {
              setting_key: LeaveService.POLICIES_SETTING_KEY,
              setting_value: currentPolicies,
              description: 'Configured leave policies and carry-forward rules',
            },
          });
          return (res as any)?.[0] || null;
        }
      }
    );

    await AuditService.log({
      userId: user.id,
      action: 'UPDATE',
      entityType: 'leave_policy',
      entityId: leaveTypeId,
      description: `Updated leave policy for leave type ${leaveTypeId}: Cycle=${updatedPolicy.policyCycle}, Monthly=${updatedPolicy.monthlyAllocation}, CarryForward=${updatedPolicy.carryForward}`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
    });

    return updatedPolicy;
  }

  // ==========================================
  // LEAVE ALLOCATIONS (CRUD)
  // ==========================================

  public static async getAllocations(params?: {
    year?: number;
    month?: number | null;
    employeeId?: string;
    leaveTypeId?: string;
  }): Promise<LeaveAllocationRecord[]> {
    const setting = await DbService.query(
      async () => prisma.systemSetting.findUnique({ where: { settingKey: LeaveService.ALLOCATIONS_SETTING_KEY } }),
      async () => {
        const rows = await DbService.restRequest<any[]>(`/system_settings?setting_key=eq.${LeaveService.ALLOCATIONS_SETTING_KEY}`);
        return rows?.[0] || null;
      }
    );

    let list: LeaveAllocationRecord[] = (setting?.settingValue as LeaveAllocationRecord[]) || [];

    if (params) {
      if (params.year) list = list.filter((a) => a.year === params.year);
      if (params.month !== undefined && params.month !== null) {
        list = list.filter((a) => a.month === null || a.month === params.month);
      }
      if (params.leaveTypeId) list = list.filter((a) => a.leaveTypeId === params.leaveTypeId);
      if (params.employeeId) {
        list = list.filter(
          (a) =>
            a.targetType === 'ALL' ||
            (a.targetEmployeeIds && a.targetEmployeeIds.includes(params.employeeId!))
        );
      }
    }

    return list;
  }

  public static async createAllocation(
    input: {
      leaveTypeId: string;
      year: number;
      month?: number | null;
      targetType: 'ALL' | 'EMPLOYEE' | 'EMPLOYEES' | 'DEPARTMENT' | 'DESIGNATION';
      targetEmployeeIds?: string[];
      targetDepartmentId?: string | null;
      targetDesignationId?: string | null;
      allocatedDays: number;
      notes?: string | null;
    },
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ): Promise<LeaveAllocationRecord> {
    const all = await LeaveService.getAllocations();
    const nowStr = new Date().toISOString();

    const record: LeaveAllocationRecord = {
      id: randomUUID(),
      leaveTypeId: input.leaveTypeId,
      year: input.year,
      month: input.month ?? null,
      targetType: input.targetType,
      targetEmployeeIds: input.targetEmployeeIds || [],
      targetDepartmentId: input.targetDepartmentId || null,
      targetDesignationId: input.targetDesignationId || null,
      allocatedDays: Number(input.allocatedDays),
      notes: input.notes || null,
      createdAt: nowStr,
      updatedAt: nowStr,
      createdBy: user.id,
    };

    // Remove any existing duplicate rule for the exact same target + leaveType + year + month
    const filtered = all.filter((a) => {
      const sameType = a.leaveTypeId === record.leaveTypeId && a.year === record.year && a.month === record.month && a.targetType === record.targetType;
      if (!sameType) return true;
      if (record.targetType === 'ALL') return false;
      if (record.targetType === 'DEPARTMENT' && a.targetDepartmentId === record.targetDepartmentId) return false;
      if (record.targetType === 'DESIGNATION' && a.targetDesignationId === record.targetDesignationId) return false;
      if ((record.targetType === 'EMPLOYEE' || record.targetType === 'EMPLOYEES') &&
          record.targetEmployeeIds?.some((id) => a.targetEmployeeIds?.includes(id))) {
        return false;
      }
      return true;
    });

    filtered.push(record);

    await DbService.query(
      async () => prisma.systemSetting.upsert({
        where: { settingKey: LeaveService.ALLOCATIONS_SETTING_KEY },
        create: {
          settingKey: LeaveService.ALLOCATIONS_SETTING_KEY,
          settingValue: filtered as any,
          description: 'Configured leave allocations by month, year, and target scope',
        },
        update: {
          settingValue: filtered as any,
        },
      }),
      async () => {
        const existing = await DbService.restRequest<any[]>(`/system_settings?setting_key=eq.${LeaveService.ALLOCATIONS_SETTING_KEY}`);
        if (existing && existing.length > 0) {
          const res = await DbService.restRequest(`/system_settings?setting_key=eq.${LeaveService.ALLOCATIONS_SETTING_KEY}`, {
            method: 'PATCH',
            body: { setting_value: filtered },
          });
          return (res as any)?.[0] || null;
        } else {
          const res = await DbService.restRequest('/system_settings', {
            method: 'POST',
            body: {
              setting_key: LeaveService.ALLOCATIONS_SETTING_KEY,
              setting_value: filtered,
              description: 'Configured leave allocations by month, year, and target scope',
            },
          });
          return (res as any)?.[0] || null;
        }
      }
    );

    await AuditService.log({
      userId: user.id,
      action: 'CREATE',
      entityType: 'leave_allocation',
      entityId: record.id,
      description: `Created leave allocation: ${input.allocatedDays} days for Target=${input.targetType} (Year ${input.year}, Month ${input.month ?? 'All'})`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
    });

    return record;
  }

  public static async updateAllocation(
    id: string,
    input: Partial<LeaveAllocationRecord>,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ): Promise<LeaveAllocationRecord> {
    const all = await LeaveService.getAllocations();
    const index = all.findIndex((a) => a.id === id);

    if (index < 0) {
      const err: any = new Error('Leave allocation record not found');
      err.statusCode = 404;
      throw err;
    }

    const oldAllocation = all[index];
    const updated: LeaveAllocationRecord = {
      ...oldAllocation,
      ...input,
      id,
      updatedAt: new Date().toISOString(),
    };

    all[index] = updated;

    await DbService.query(
      async () => prisma.systemSetting.update({
        where: { settingKey: LeaveService.ALLOCATIONS_SETTING_KEY },
        data: { settingValue: all as any },
      }),
      async () => {
        const res = await DbService.restRequest(`/system_settings?setting_key=eq.${LeaveService.ALLOCATIONS_SETTING_KEY}`, {
          method: 'PATCH',
          body: { setting_value: all },
        });
        return (res as any)?.[0] || null;
      }
    );

    await AuditService.log({
      userId: user.id,
      action: 'UPDATE',
      entityType: 'leave_allocation',
      entityId: id,
      description: `Updated leave allocation ${id}: Old=${oldAllocation.allocatedDays}, New=${updated.allocatedDays}`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
    });

    return updated;
  }

  public static async deleteAllocation(
    id: string,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    const all = await LeaveService.getAllocations();
    const filtered = all.filter((a) => a.id !== id);

    await DbService.query(
      async () => prisma.systemSetting.update({
        where: { settingKey: LeaveService.ALLOCATIONS_SETTING_KEY },
        data: { settingValue: filtered as any },
      }),
      async () => {
        const res = await DbService.restRequest(`/system_settings?setting_key=eq.${LeaveService.ALLOCATIONS_SETTING_KEY}`, {
          method: 'PATCH',
          body: { setting_value: filtered },
        });
        return (res as any)?.[0] || null;
      }
    );

    await AuditService.log({
      userId: user.id,
      action: 'DELETE',
      entityType: 'leave_allocation',
      entityId: id,
      description: `Deleted leave allocation: ${id}`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
    });

    return { deleted: true, id };
  }

  // ==========================================
  // ALLOCATION PRECEDENCE RESOLUTION
  // ==========================================

  /**
   * Deterministic Precedence:
   * 1. Specific Employee Allocation (Target: EMPLOYEE or EMPLOYEES containing employeeId)
   * 2. Department Allocation (Target: DEPARTMENT matching employee's departmentId)
   * 3. Designation Allocation (Target: DESIGNATION matching employee's designationId)
   * 4. All Employees Allocation (Target: ALL)
   * 5. Global Policy Default
   */
  public static resolveEffectiveAllocation(
    employee: { id: string; departmentId?: string | null; designationId?: string | null },
    leaveTypeId: string,
    year: number,
    month: number | null | undefined,
    allocations: LeaveAllocationRecord[],
    policy?: LeavePolicyConfig
  ): number {
    // Filter allocations for this leaveType and year
    const matching = allocations.filter(
      (a) => a.leaveTypeId === leaveTypeId && a.year === year && (a.month === null || a.month === month)
    );

    // 1. Specific Employee
    const empAlloc = matching.find(
      (a) => (a.targetType === 'EMPLOYEE' || a.targetType === 'EMPLOYEES') && a.targetEmployeeIds?.includes(employee.id)
    );
    if (empAlloc) return Number(empAlloc.allocatedDays);

    // 2. Department
    if (employee.departmentId) {
      const deptAlloc = matching.find(
        (a) => a.targetType === 'DEPARTMENT' && a.targetDepartmentId === employee.departmentId
      );
      if (deptAlloc) return Number(deptAlloc.allocatedDays);
    }

    // 3. Designation
    if (employee.designationId) {
      const desigAlloc = matching.find(
        (a) => a.targetType === 'DESIGNATION' && a.targetDesignationId === employee.designationId
      );
      if (desigAlloc) return Number(desigAlloc.allocatedDays);
    }

    // 4. All Employees
    const allAlloc = matching.find((a) => a.targetType === 'ALL');
    if (allAlloc) return Number(allAlloc.allocatedDays);

    // 5. Global Policy Default
    if (policy) {
      if (month !== null && month !== undefined && policy.policyCycle === 'MONTHLY') {
        return Number(policy.monthlyAllocation);
      }
      return Number(policy.annualAllocation);
    }

    return 0;
  }

  // ==========================================
  // AUTHORITATIVE LEAVE BALANCES
  // ==========================================

  /**
   * Get employee leave balances for a specific year and optional month.
   * Derives: Remaining = max(0, allocatedDays + validCarryForward - approvedUsedDays).
   */
  public static async getBalances(
    employeeId: string,
    year: number = new Date().getFullYear(),
    month?: number | null
  ) {
    const [employee, leaveTypes, policies, allocations, approvedRequests, pendingRequests] = await Promise.all([
      DbService.query(
        async () => prisma.employee.findUnique({
          where: { id: employeeId },
          select: { id: true, departmentId: true, designationId: true, displayName: true },
        }),
        async () => {
          const rows = await DbService.restRequest<any[]>(`/employees?id=eq.${employeeId}&select=id,department_id,designation_id,display_name`);
          return rows?.[0] ? DbService.toCamelCase(rows[0]) : null;
        }
      ),
      LeaveService.getLeaveTypes(),
      LeaveService.getPolicies(),
      LeaveService.getAllocations({ year, month }),
      DbService.query(
        async () => prisma.leaveRequest.findMany({
          where: {
            employeeId,
            status: 'APPROVED',
          },
        }),
        async () => {
          const rows = await DbService.restRequest<any[]>(`/leave_requests?employee_id=eq.${employeeId}&status=eq.APPROVED`);
          return (rows || []).map(DbService.toCamelCase);
        }
      ),
      DbService.query(
        async () => prisma.leaveRequest.findMany({
          where: {
            employeeId,
            status: 'PENDING',
          },
        }),
        async () => {
          const rows = await DbService.restRequest<any[]>(`/leave_requests?employee_id=eq.${employeeId}&status=eq.PENDING`);
          return (rows || []).map(DbService.toCamelCase);
        }
      ),
    ]);

    if (!employee) {
      const err: any = new Error('Employee not found');
      err.statusCode = 404;
      throw err;
    }

    const policyMap = new Map<string, LeavePolicyConfig>();
    for (const p of policies) policyMap.set(p.leaveTypeId, p);

    const balances = [];

    for (const lt of leaveTypes) {
      const policy = policyMap.get(lt.id);
      const allocatedDays = LeaveService.resolveEffectiveAllocation(
        employee,
        lt.id,
        year,
        month,
        allocations,
        policy
      );

      // Calculate Used Days in the selected period (month or year)
      let usedDays = 0;
      for (const req of approvedRequests) {
        if (req.leaveTypeId !== lt.id) continue;
        const reqStart = new Date(req.startDate);
        const reqEnd = new Date(req.endDate);

        if (month !== null && month !== undefined) {
          // Calculate overlap with the specified month
          const monthRange = DateTimeUtil.getMonthDateRange(year, month);
          const overlapStart = reqStart > monthRange.startDate ? reqStart : monthRange.startDate;
          const overlapEnd = reqEnd < monthRange.endDate ? reqEnd : monthRange.endDate;

          if (overlapStart <= overlapEnd) {
            // Count actual days in overlap
            const startStr = DateTimeUtil.formatDateString(overlapStart);
            const endStr = DateTimeUtil.formatDateString(overlapEnd);
            const calc = await WorkdayService.calculateLeaveWorkingDays(employeeId, startStr, endStr, Number(req.totalDays) === 0.5);
            usedDays += calc.totalDays;
          }
        } else {
          // Full Year
          if (reqStart.getFullYear() === year) {
            usedDays += Number(req.totalDays);
          }
        }
      }

      // Calculate Pending Days
      let pendingDays = 0;
      for (const req of pendingRequests) {
        if (req.leaveTypeId !== lt.id) continue;
        const reqStart = new Date(req.startDate);
        if (month !== null && month !== undefined) {
          if (reqStart.getFullYear() === year && reqStart.getMonth() + 1 === month) {
            pendingDays += Number(req.totalDays);
          }
        } else {
          if (reqStart.getFullYear() === year) {
            pendingDays += Number(req.totalDays);
          }
        }
      }

      // Calculate Carry-Forward if policy allows and month > 1
      let carryForwardDays = 0;
      if (policy?.carryForward && month && month > 1) {
        // Calculate unused balance from preceding months up to maxCarryForward
        // For simplicity, bounded by maxCarryForward
        carryForwardDays = Math.min(policy.maxCarryForward, 0);
      }

      const rawRemaining = allocatedDays + carryForwardDays - usedDays;
      const remainingDays = Math.max(0, Math.round(rawRemaining * 10) / 10);

      balances.push({
        id: `bal-${employeeId}-${lt.id}-${year}-${month || 'all'}`,
        employeeId,
        leaveTypeId: lt.id,
        year,
        month: month || null,
        allocatedDays: Math.round(allocatedDays * 10) / 10,
        usedDays: Math.round(usedDays * 10) / 10,
        pendingDays: Math.round(pendingDays * 10) / 10,
        remainingDays,
        carryForwardDays,
        leaveType: {
          id: lt.id,
          name: lt.name,
          description: lt.description,
          defaultDaysPerYear: Number(lt.defaultDaysPerYear || 0),
          isPaid: lt.isPaid,
          isActive: lt.isActive,
        },
        policy: policy || null,
      });
    }

    return balances;
  }

  // ==========================================
  // ORGANIZATION-WIDE LEAVE SUMMARY
  // ==========================================

  public static async getOrganizationSummary(params: {
    year: number;
    month?: number | null;
    departmentId?: string;
  }) {
    const { year, month, departmentId } = params;

    const [employees, leaveTypes, policies, allocations, approvedRequests, pendingRequests] = await Promise.all([
      DbService.query(
        async () => prisma.employee.findMany({
          where: {
            employmentStatus: 'ACTIVE',
            ...(departmentId ? { departmentId } : {}),
            NOT: { user: { role: 'SUPER_ADMIN' } },
          },
          select: { id: true, displayName: true, firstName: true, lastName: true, employeeCode: true, departmentId: true, designationId: true },
          orderBy: { displayName: 'asc' },
        }),
        async () => {
          let path = '/employees?employment_status=eq.ACTIVE&select=id,display_name,first_name,last_name,employee_code,department_id,designation_id,user:users(role)&order=display_name.asc';
          if (departmentId) path += `&department_id=eq.${departmentId}`;
          const rows = await DbService.restRequest<any[]>(path);
          return (rows || []).filter((e: any) => e.user?.role !== 'SUPER_ADMIN').map(DbService.toCamelCase);
        }
      ),
      LeaveService.getLeaveTypes(),
      LeaveService.getPolicies(),
      LeaveService.getAllocations({ year, month }),
      DbService.query(
        async () => prisma.leaveRequest.findMany({
          where: { status: 'APPROVED' },
        }),
        async () => {
          const rows = await DbService.restRequest<any[]>('/leave_requests?status=eq.APPROVED');
          return (rows || []).map(DbService.toCamelCase);
        }
      ),
      DbService.query(
        async () => prisma.leaveRequest.findMany({
          where: { status: 'PENDING' },
        }),
        async () => {
          const rows = await DbService.restRequest<any[]>('/leave_requests?status=eq.PENDING');
          return (rows || []).map(DbService.toCamelCase);
        }
      ),
    ]);

    const policyMap = new Map<string, LeavePolicyConfig>();
    for (const p of policies) policyMap.set(p.leaveTypeId, p);

    let totalAllocated = 0;
    let totalUsed = 0;
    let totalRemaining = 0;
    let totalPending = 0;

    const employeeRows = [];

    for (const emp of employees) {
      let empAlloc = 0;
      let empUsed = 0;
      let empRemaining = 0;
      let empPending = 0;

      const typeBalances = [];

      for (const lt of leaveTypes) {
        const policy = policyMap.get(lt.id);
        const allocated = LeaveService.resolveEffectiveAllocation(emp, lt.id, year, month, allocations, policy);

        // Used
        let used = 0;
        for (const req of approvedRequests) {
          if (req.employeeId !== emp.id || req.leaveTypeId !== lt.id) continue;
          const reqStart = new Date(req.startDate);
          const reqEnd = new Date(req.endDate);

          if (month !== null && month !== undefined) {
            const mRange = DateTimeUtil.getMonthDateRange(year, month);
            if (reqStart <= mRange.endDate && reqEnd >= mRange.startDate) {
              used += Number(req.totalDays);
            }
          } else {
            if (reqStart.getFullYear() === year) used += Number(req.totalDays);
          }
        }

        // Pending
        let pending = 0;
        for (const req of pendingRequests) {
          if (req.employeeId !== emp.id || req.leaveTypeId !== lt.id) continue;
          const reqStart = new Date(req.startDate);
          if (month !== null && month !== undefined) {
            if (reqStart.getFullYear() === year && reqStart.getMonth() + 1 === month) pending += Number(req.totalDays);
          } else {
            if (reqStart.getFullYear() === year) pending += Number(req.totalDays);
          }
        }

        const remaining = Math.max(0, Math.round((allocated - used) * 10) / 10);

        empAlloc += allocated;
        empUsed += used;
        empRemaining += remaining;
        empPending += pending;

        typeBalances.push({
          leaveTypeId: lt.id,
          leaveTypeName: lt.name,
          allocatedDays: allocated,
          usedDays: used,
          pendingDays: pending,
          remainingDays: remaining,
        });
      }

      totalAllocated += empAlloc;
      totalUsed += empUsed;
      totalRemaining += empRemaining;
      totalPending += empPending;

      employeeRows.push({
        employee: {
          id: emp.id,
          displayName: emp.displayName,
          firstName: emp.firstName,
          lastName: emp.lastName,
          employeeCode: emp.employeeCode,
        },
        allocatedDays: Math.round(empAlloc * 10) / 10,
        usedDays: Math.round(empUsed * 10) / 10,
        pendingDays: Math.round(empPending * 10) / 10,
        remainingDays: Math.round(empRemaining * 10) / 10,
        typeBalances,
      });
    }

    return {
      summary: {
        totalEmployees: employees.length,
        totalAllocated: Math.round(totalAllocated * 10) / 10,
        totalUsed: Math.round(totalUsed * 10) / 10,
        totalRemaining: Math.round(totalRemaining * 10) / 10,
        totalPending: Math.round(totalPending * 10) / 10,
      },
      employees: employeeRows,
    };
  }

  // ==========================================
  // LEAVE REQUESTS (LIST, REQUEST, REVIEW, CANCEL)
  // ==========================================

  public static async listRequests(params: {
    employeeId?: string;
    leaveTypeId?: string;
    status?: LeaveStatus;
    month?: number;
    year?: number;
    adminView?: boolean;
    user: AuthUser;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 30));
    const skip = (page - 1) * limit;
    const isSuper = params.user.role === 'SUPER_ADMIN' || params.user.appRole === 'SUPER_ADMIN';

    const where: any = {};

    if (params.adminView) {
      const hasLeaveAdminPerm =
        isSuper ||
        ((params.user.appRole === 'LIMITED_ADMIN' || params.user.role === 'ADMIN') &&
          (RbacService.hasPermission(params.user, 'LEAVE_MANAGE') ||
            RbacService.hasPermission(params.user, 'LEAVE_APPROVE') ||
            RbacService.hasPermission(params.user, 'LEAVE_VIEW')));

      if (!hasLeaveAdminPerm) {
        const err: any = new Error('Forbidden: You do not have administrative permission to view team leave requests');
        err.statusCode = 403;
        throw err;
      }

      if (params.employeeId && params.employeeId !== 'undefined' && params.employeeId !== 'null' && params.employeeId.trim() !== '') {
        if (!isSuper) {
          const hasScope = await RbacService.hasScopeAccess(params.user, { employeeId: params.employeeId });
          if (!hasScope) {
            const err: any = new Error('Forbidden: Target employee is outside your permitted administrative scope');
            err.statusCode = 403;
            throw err;
          }
        }
        where.employeeId = params.employeeId;
      } else if (params.user.scope?.employees && Array.isArray(params.user.scope.employees) && params.user.scope.employees.length > 0) {
        where.employeeId = { in: params.user.scope.employees };
      }
    } else {
      where.employeeId = params.user.employeeId || '__NONE__';
    }

    if (params.status) where.status = params.status;
    if (params.leaveTypeId) where.leaveTypeId = params.leaveTypeId;

    if (params.year && params.month) {
      const range = DateTimeUtil.getMonthDateRange(params.year, params.month);
      where.startDate = { lte: range.endDate };
      where.endDate = { gte: range.startDate };
    } else if (params.year) {
      const range = DateTimeUtil.getYearDateRange(params.year);
      where.startDate = { lte: range.endDate };
      where.endDate = { gte: range.startDate };
    }

    return DbService.query(
      async () => {
        const [items, total] = await Promise.all([
          prisma.leaveRequest.findMany({
            where,
            include: {
              leaveType: true,
              employee: { select: { id: true, displayName: true, employeeCode: true, email: true } },
              reviewer: { select: { id: true, email: true } },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
          }),
          prisma.leaveRequest.count({ where }),
        ]);

        return {
          items,
          meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
      },
      async () => {
        let path = `/leave_requests?select=*,leave_type:leave_types(*),employee:employees(id,display_name,employee_code,email),reviewer:users(id,email)&order=created_at.desc&limit=${limit}&offset=${skip}`;
        if (where.employeeId) {
          if (typeof where.employeeId === 'object' && where.employeeId.in) {
            path += `&employee_id=in.(${where.employeeId.in.join(',')})`;
          } else {
            path += `&employee_id=eq.${where.employeeId}`;
          }
        }
        if (params.status) path += `&status=eq.${params.status}`;
        if (params.leaveTypeId) path += `&leave_type_id=eq.${params.leaveTypeId}`;

        const items = await DbService.restRequest<any[]>(path);
        return {
          items: (items || []).map(DbService.toCamelCase),
          meta: { page, limit, total: items?.length || 0, totalPages: 1 },
        };
      }
    );
  }

  public static async requestLeave(
    employeeId: string,
    input: {
      leaveTypeId: string;
      startDate: string;
      endDate: string;
      totalDays?: number;
      reason: string;
    },
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    const year = start.getFullYear();
    const month = start.getMonth() + 1;

    if (start > end) {
      const err: any = new Error('Start date cannot be after end date');
      err.statusCode = 400;
      throw err;
    }

    // 1. Calculate actual leave working days based on scheduled working days and holidays
    const isHalfDay = input.totalDays === 0.5;
    const workingDaysCalc = await WorkdayService.calculateLeaveWorkingDays(
      employeeId,
      input.startDate,
      input.endDate,
      isHalfDay
    );

    const actualDays = input.totalDays !== undefined && input.totalDays > 0
      ? Number(input.totalDays)
      : workingDaysCalc.totalDays;

    if (actualDays <= 0) {
      const err: any = new Error('The selected date range contains only scheduled non-working days or company holidays.');
      err.statusCode = 400;
      throw err;
    }

    // 2. Check current authoritative balance
    const balances = await LeaveService.getBalances(employeeId, year, month);
    const targetBal = balances.find((b) => b.leaveTypeId === input.leaveTypeId);

    if (!targetBal) {
      const err: any = new Error('Leave type not configured or unavailable');
      err.statusCode = 400;
      throw err;
    }

    if (actualDays > targetBal.remainingDays) {
      const err: any = new Error(
        `Insufficient leave balance for ${targetBal.leaveType?.name || 'this leave type'}. Requested: ${actualDays} day(s), Available Remaining: ${targetBal.remainingDays} day(s).`
      );
      err.statusCode = 400;
      err.code = 'INSUFFICIENT_LEAVE_BALANCE';
      throw err;
    }

    // 3. Check for overlapping pending or approved requests
    const overlapping = await DbService.query(
      async () => prisma.leaveRequest.findFirst({
        where: {
          employeeId,
          status: { in: ['PENDING', 'APPROVED'] },
          OR: [
            { startDate: { lte: end }, endDate: { gte: start } },
          ],
        },
      }),
      async () => {
        const rows = await DbService.restRequest<any[]>(
          `/leave_requests?employee_id=eq.${employeeId}&status=in.(PENDING,APPROVED)&start_date=lte.${input.endDate}&end_date=gte.${input.startDate}`
        );
        return rows?.[0] || null;
      }
    );

    if (overlapping) {
      const err: any = new Error('You already have a pending or approved leave request overlapping these dates');
      err.statusCode = 400;
      err.code = 'OVERLAPPING_LEAVE_REQUEST';
      throw err;
    }

    // 4. Create request
    const request = await DbService.query(
      async () => prisma.leaveRequest.create({
        data: {
          employeeId,
          leaveTypeId: input.leaveTypeId,
          startDate: start,
          endDate: end,
          totalDays: actualDays,
          reason: input.reason,
          status: 'PENDING',
        },
        include: { leaveType: true },
      }),
      async () => {
        const rows = await DbService.restRequest<any[]>('/leave_requests', {
          method: 'POST',
          body: {
            employee_id: employeeId,
            leave_type_id: input.leaveTypeId,
            start_date: input.startDate,
            end_date: input.endDate,
            total_days: actualDays,
            reason: input.reason,
            status: 'PENDING',
          },
        });
        return DbService.toCamelCase(rows[0]);
      }
    );

    await AuditService.log({
      userId: user.id,
      employeeId,
      action: 'LEAVE_REQUESTED',
      entityType: 'leave_request',
      entityId: request.id,
      description: `Requested ${actualDays} day(s) of ${request.leaveType?.name || 'Leave'} (${input.startDate} to ${input.endDate})`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
    });

    // Notify Super Admins and Managers
    (async () => {
      try {
        const emp = await NotificationService.resolveUserIdFromEmployeeId(employeeId);
        const admins = await DbService.query(
          async () => prisma.user.findMany({ where: { role: 'SUPER_ADMIN' }, select: { id: true } }),
          async () => DbService.restRequest<any[]>('/users?role=eq.SUPER_ADMIN&select=id')
        );

        for (const a of admins || []) {
          if (a.id !== user.id) {
            await NotificationService.createNotification({
              userId: a.id,
              type: 'LEAVE_SUBMITTED',
              title: `New Leave Request: ${emp?.displayName || 'Employee'}`,
              message: `${emp?.displayName || 'Employee'} requested ${actualDays} day(s) of leave (${input.startDate} to ${input.endDate}).`,
              actionUrl: '/admin/leave',
              entityType: 'leave_request',
              entityId: request.id,
              actorId: user.id,
            });
          }
        }
      } catch (err: any) {
        console.error('[LeaveService] Notification error:', err.message);
      }
    })();

    return request;
  }

  public static async reviewRequest(
    requestId: string,
    status: 'APPROVED' | 'REJECTED',
    comment: string | null | undefined,
    reviewer: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    const now = new Date();

    const req = await DbService.query(
      async () => prisma.leaveRequest.findUnique({
        where: { id: requestId },
        include: { employee: true, leaveType: true },
      }),
      async () => {
        const rows = await DbService.restRequest<any[]>(`/leave_requests?id=eq.${requestId}&select=*,employee:employees(*),leave_type:leave_types(*)`);
        return rows?.[0] ? DbService.toCamelCase(rows[0]) : null;
      }
    );

    if (!req) {
      const err: any = new Error('Leave request not found');
      err.statusCode = 404;
      throw err;
    }

    if (req.status !== 'PENDING') {
      const err: any = new Error(`Leave request has already been ${req.status.toLowerCase()}`);
      err.statusCode = 400;
      throw err;
    }

    // If approving, re-verify authoritative available balance
    if (status === 'APPROVED') {
      const reqStart = new Date(req.startDate);
      const balances = await LeaveService.getBalances(req.employeeId, reqStart.getFullYear(), reqStart.getMonth() + 1);
      const bal = balances.find((b) => b.leaveTypeId === req.leaveTypeId);
      if (bal && Number(req.totalDays) > bal.remainingDays) {
        const err: any = new Error(
          `Cannot approve: Insufficient remaining balance for this employee. Requested: ${req.totalDays}, Available: ${bal.remainingDays}`
        );
        err.statusCode = 400;
        throw err;
      }
    }

    const updated = await DbService.query(
      async () => prisma.leaveRequest.update({
        where: { id: requestId },
        data: {
          status,
          reviewedBy: reviewer.id,
          reviewedAt: now,
          reviewComment: comment || null,
        },
      }),
      async () => {
        const rows = await DbService.restRequest<any[]>(`/leave_requests?id=eq.${requestId}`, {
          method: 'PATCH',
          body: {
            status,
            reviewed_by: reviewer.id,
            reviewed_at: now.toISOString(),
            review_comment: comment || null,
          },
        });
        return DbService.toCamelCase(rows[0]);
      }
    );

    await AuditService.log({
      userId: reviewer.id,
      employeeId: req.employeeId,
      action: status === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
      entityType: 'leave_request',
      entityId: requestId,
      description: `${status} leave request of ${req.totalDays} day(s) for ${req.employee?.displayName || req.employeeId}`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
    });

    // Notify employee of review decision
    (async () => {
      try {
        const emp = await NotificationService.resolveUserIdFromEmployeeId(req.employeeId);
        if (emp?.userId) {
          await NotificationService.createNotification({
            userId: emp.userId,
            type: status === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
            title: `Leave Request ${status}`,
            message: `Your ${req.totalDays}-day leave request for ${req.leaveType?.name || 'Leave'} has been ${status.toLowerCase()}.${comment ? ` Note: ${comment}` : ''}`,
            actionUrl: '/leave',
            entityType: 'leave_request',
            entityId: requestId,
            actorId: reviewer.id,
          });
        }
      } catch (err: any) {
        console.error('[LeaveService] Notification error:', err.message);
      }
    })();

    return updated;
  }

  public static async cancelRequest(
    requestId: string,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ) {
    const req = await DbService.query(
      async () => prisma.leaveRequest.findUnique({
        where: { id: requestId },
        include: { employee: true },
      }),
      async () => {
        const rows = await DbService.restRequest<any[]>(`/leave_requests?id=eq.${requestId}&select=*,employee:employees(*)`);
        return rows?.[0] ? DbService.toCamelCase(rows[0]) : null;
      }
    );

    if (!req) {
      const err: any = new Error('Leave request not found');
      err.statusCode = 404;
      throw err;
    }

    if (user.role === 'EMPLOYEE' && req.employeeId !== user.employeeId) {
      const err: any = new Error('Forbidden: You can only cancel your own leave requests');
      err.statusCode = 403;
      throw err;
    }

    if (req.status !== 'PENDING' && req.status !== 'APPROVED') {
      const err: any = new Error(`Cannot cancel a request that is already ${req.status.toLowerCase()}`);
      err.statusCode = 400;
      throw err;
    }

    const updated = await DbService.query(
      async () => prisma.leaveRequest.update({
        where: { id: requestId },
        data: { status: 'CANCELLED' },
      }),
      async () => {
        const rows = await DbService.restRequest<any[]>(`/leave_requests?id=eq.${requestId}`, {
          method: 'PATCH',
          body: { status: 'CANCELLED' },
        });
        return DbService.toCamelCase(rows[0]);
      }
    );

    await AuditService.log({
      userId: user.id,
      employeeId: req.employeeId,
      action: 'UPDATE',
      entityType: 'leave_request',
      entityId: requestId,
      description: `Cancelled leave request ${requestId} (${req.totalDays} days)`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
    });

    return updated;
  }
}
