import { randomUUID } from 'crypto';
import { AuthUser, Project, CreateProjectInput, UpdateProjectInput, Task, ProjectRole, ProjectMember } from '../../types/index.js';
import { CreateTaskInput, AddProjectMemberInput, UpdateProjectMemberInput } from '../../validation/index.js';
import { DbService } from '../../services/db.service.js';
import { TaskService } from '../tasks/task.service.js';
import { EmployeeService } from '../employees/employee.service.js';
import { AuditService } from '../../services/audit.service.js';
import { prisma } from '../../plugins/prisma.js';

interface StoredProjectMember {
  id: string;
  projectId: string;
  employeeId: string;
  projectRole: ProjectRole | string;
  addedBy: string;
  createdAt: string;
}

interface StoredProject {
  id: string;
  name: string;
  description: string | null;
  status: 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD';
  createdBy: string;
  employeeId: string | null;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  members: StoredProjectMember[];
  taskIds?: string[];
}

const SETTING_KEY = 'workos_projects';

export class ProjectService {
  /**
   * Helper to retrieve all stored projects
   */
  private static async getStoredProjects(): Promise<StoredProject[]> {
    return DbService.query(
      async () => {
        try {
          const setting = await prisma.systemSetting.findUnique({
            where: { settingKey: SETTING_KEY },
          });
          if (!setting || !setting.settingValue) return [];
          return (setting.settingValue as any) || [];
        } catch {
          const settings = await DbService.restRequest<any[]>(
            `/system_settings?setting_key=eq.${SETTING_KEY}`
          );
          if (!settings || settings.length === 0 || !settings[0].settingValue) return [];
          return (settings[0].settingValue as any) || [];
        }
      },
      async () => {
        const settings = await DbService.restRequest<any[]>(
          `/system_settings?setting_key=eq.${SETTING_KEY}`
        );
        if (!settings || settings.length === 0 || !settings[0].settingValue) return [];
        return (settings[0].settingValue as any) || [];
      }
    );
  }

  /**
   * Helper to persist stored projects
   */
  private static async saveStoredProjects(projects: StoredProject[]): Promise<void> {
    const now = new Date();
    return DbService.query(
      async () => {
        try {
          await prisma.systemSetting.upsert({
            where: { settingKey: SETTING_KEY },
            create: {
              settingKey: SETTING_KEY,
              settingValue: projects as any,
              description: 'WorkOS Project registry and task linkages',
              isPublic: false,
            },
            update: {
              settingValue: projects as any,
              updatedAt: now,
            },
          });
        } catch {
          const existing = await DbService.restRequest<any[]>(
            `/system_settings?setting_key=eq.${SETTING_KEY}`
          );
          if (existing && existing.length > 0) {
            await DbService.restRequest(`/system_settings?id=eq.${existing[0].id}`, {
              method: 'PATCH',
              body: {
                setting_value: projects,
                updated_at: now.toISOString(),
              },
            });
          } else {
            await DbService.restRequest('/system_settings', {
              method: 'POST',
              body: {
                setting_key: SETTING_KEY,
                setting_value: projects,
                description: 'WorkOS Project registry and task linkages',
                is_public: false,
              },
            });
          }
        }
      },
      async () => {
        const existing = await DbService.restRequest<any[]>(
          `/system_settings?setting_key=eq.${SETTING_KEY}`
        );
        if (existing && existing.length > 0) {
          await DbService.restRequest(`/system_settings?id=eq.${existing[0].id}`, {
            method: 'PATCH',
            body: {
              setting_value: projects,
              updated_at: now.toISOString(),
            },
          });
        } else {
          await DbService.restRequest('/system_settings', {
            method: 'POST',
            body: {
              setting_key: SETTING_KEY,
              setting_value: projects,
              description: 'WorkOS Project registry and task linkages',
              is_public: false,
            },
          });
        }
      }
    );
  }

  /**
   * Helper: Check if user has management access to a project
   */
  public static isProjectManager(project: StoredProject, user: AuthUser): boolean {
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'MANAGER') {
      return true;
    }
    if (project.createdBy === user.id) {
      return true;
    }
    if (user.employeeId && project.members && Array.isArray(project.members)) {
      const member = project.members.find((m) => m.employeeId === user.employeeId);
      if (member && (member.projectRole === 'LEAD' || member.projectRole === 'MANAGER')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Helper: Check if user is a member/participant of the project
   */
  public static isProjectParticipant(project: StoredProject, user: AuthUser): boolean {
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'MANAGER') {
      return true;
    }
    if (project.createdBy === user.id) {
      return true;
    }
    if (user.employeeId && project.employeeId === user.employeeId) {
      return true;
    }
    if (user.employeeId && project.members && Array.isArray(project.members)) {
      if (project.members.some((m) => m.employeeId === user.employeeId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * List Projects with Time Aggregations and Member info
   */
  public static async listProjects(
    user: AuthUser,
    params: { search?: string; status?: string; employeeId?: string } = {}
  ): Promise<Project[]> {
    const projects = await ProjectService.getStoredProjects();

    // Fetch all relevant tasks with timers and employees
    const allTasksResult = await TaskService.listTasks({
      user: { ...user, role: 'SUPER_ADMIN' },
      limit: 500,
    });
    const allTasks = allTasksResult.items || [];

    // Fetch employee directory for hydrating member details
    const employees = await DbService.query(
      async () => {
        try {
          return await prisma.employee.findMany({
            include: { department: true, designation: true, user: true },
          });
        } catch {
          return await DbService.restRequest<any[]>('/employees?select=*,department:departments(*),designation:designations(*),user:users(*)');
        }
      },
      async () => {
        return await DbService.restRequest<any[]>('/employees?select=*,department:departments(*),designation:designations(*),user:users(*)');
      }
    );

    const empById = new Map<string, any>();
    for (const e of employees || []) {
      empById.set(e.id, e);
    }

    const result: Project[] = [];

    for (const proj of projects) {
      const isStaff = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'MANAGER';
      const isParticipant = ProjectService.isProjectParticipant(proj, user);

      // Find tasks belonging to this project
      const projTasks = allTasks.filter((t: any) => {
        if (t.projectId === proj.id) return true;
        if (proj.taskIds && proj.taskIds.includes(t.id)) return true;
        if (t.description && t.description.includes(`[Project: ${proj.id}]`)) return true;
        return false;
      });

      const isTaskAssignee = user.employeeId && projTasks.some((t: any) => t.employeeId === user.employeeId);

      // Authorization filter
      if (!isStaff && !isParticipant && !isTaskAssignee) {
        continue;
      }

      // Status filter
      if (params.status && params.status !== 'ALL' && proj.status !== params.status) {
        continue;
      }

      // Search filter
      if (params.search && params.search.trim() !== '') {
        const q = params.search.toLowerCase().trim();
        const matchName = proj.name.toLowerCase().includes(q);
        const matchDesc = proj.description?.toLowerCase().includes(q);
        if (!matchName && !matchDesc) continue;
      }

      // Specific employee filter
      if (params.employeeId && params.employeeId !== 'undefined' && params.employeeId !== 'null' && params.employeeId.trim() !== '') {
        const matchesMember = proj.members?.some((m) => m.employeeId === params.employeeId);
        const matchesTask = proj.employeeId === params.employeeId || projTasks.some((t: any) => t.employeeId === params.employeeId);
        if (!matchesMember && !matchesTask) continue;
      }

      // Aggregate task worked times
      let projectWorkedSeconds = 0;
      let completedCount = 0;
      let activeTimersCount = 0;
      const employeeMap: Record<string, { employeeId: string; displayName: string; totalWorkedSeconds: number; taskCount: number }> = {};

      // Initialize with project members
      for (const m of proj.members || []) {
        const emp = empById.get(m.employeeId);
        const name = emp?.displayName || emp?.firstName || 'Team Member';
        employeeMap[m.employeeId] = {
          employeeId: m.employeeId,
          displayName: name,
          totalWorkedSeconds: 0,
          taskCount: 0,
        };
      }

      for (const t of projTasks) {
        const taskDuration = t.totalDurationSeconds || 0;
        projectWorkedSeconds += taskDuration;
        if (t.status === 'COMPLETED') completedCount++;
        if (t.activeTimer || (t.timers && t.timers.some((tm: any) => tm.isActive))) activeTimersCount++;

        const empId = t.employeeId;
        const emp = empById.get(empId) || t.employee;
        const empName = emp?.displayName || emp?.firstName || 'Assigned Employee';
        if (!employeeMap[empId]) {
          employeeMap[empId] = {
            employeeId: empId,
            displayName: empName,
            totalWorkedSeconds: 0,
            taskCount: 0,
          };
        }
        employeeMap[empId].totalWorkedSeconds += taskDuration;
        employeeMap[empId].taskCount++;
      }

      const totalWorkedMinutes = Math.floor(projectWorkedSeconds / 60);
      const totalWorkedHours = parseFloat((projectWorkedSeconds / 3600).toFixed(2));

      // Hydrate members
      const hydratedMembers: ProjectMember[] = (proj.members || []).map((m) => {
        const emp = empById.get(m.employeeId);
        const userObj = emp?.user ? (Array.isArray(emp.user) ? emp.user[0] : emp.user) : undefined;
        return {
          id: m.id,
          projectId: m.projectId,
          employeeId: m.employeeId,
          projectRole: m.projectRole as ProjectRole,
          addedBy: m.addedBy,
          createdAt: m.createdAt,
          employee: emp
            ? {
                id: emp.id,
                displayName: emp.displayName || emp.display_name,
                firstName: emp.firstName || emp.first_name,
                lastName: emp.lastName || emp.last_name,
                email: emp.email,
                employmentStatus: emp.employmentStatus || emp.employment_status || 'ACTIVE',
                profilePhotoUrl: emp.profilePhotoUrl || emp.profile_photo_url,
                department: emp.department,
                designation: emp.designation,
                user: userObj,
              }
            : null,
        };
      });

      result.push({
        ...proj,
        members: hydratedMembers,
        totalTasks: projTasks.length,
        completedTasks: completedCount,
        activeTimersCount,
        totalWorkedSeconds: projectWorkedSeconds,
        totalWorkedMinutes,
        totalWorkedHours,
        employeeBreakdown: Object.values(employeeMap).map((e) => ({
          ...e,
          totalWorkedMinutes: Math.floor(e.totalWorkedSeconds / 60),
          totalWorkedHours: parseFloat((e.totalWorkedSeconds / 3600).toFixed(2)),
        })),
      });
    }

    return result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /**
   * Get Project by ID with full tasks, timer analytics, and members
   */
  public static async getProjectById(id: string, user: AuthUser): Promise<Project> {
    const projects = await ProjectService.getStoredProjects();
    const proj = projects.find((p) => p.id === id);

    if (!proj) {
      const err: any = new Error('Project not found');
      err.statusCode = 404;
      throw err;
    }

    const allTasksResult = await TaskService.listTasks({
      user: { ...user, role: 'SUPER_ADMIN' },
      limit: 500,
    });
    const allTasks = allTasksResult.items || [];

    const projTasks = allTasks.filter((t: any) => {
      if (t.projectId === proj.id) return true;
      if (proj.taskIds && proj.taskIds.includes(t.id)) return true;
      if (t.description && t.description.includes(`[Project: ${proj.id}]`)) return true;
      return false;
    });

    const isStaff = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'MANAGER';
    const isParticipant = ProjectService.isProjectParticipant(proj, user);
    const isTaskAssignee = user.employeeId && projTasks.some((t: any) => t.employeeId === user.employeeId);

    if (!isStaff && !isParticipant && !isTaskAssignee) {
      const err: any = new Error('Forbidden');
      err.statusCode = 403;
      throw err;
    }

    const employees = await DbService.query(
      async () => {
        try {
          return await prisma.employee.findMany({
            include: { department: true, designation: true, user: true },
          });
        } catch {
          return await DbService.restRequest<any[]>('/employees?select=*,department:departments(*),designation:designations(*),user:users(*)');
        }
      },
      async () => {
        return await DbService.restRequest<any[]>('/employees?select=*,department:departments(*),designation:designations(*),user:users(*)');
      }
    );

    const empById = new Map<string, any>();
    for (const e of employees || []) {
      empById.set(e.id, e);
    }

    let projectWorkedSeconds = 0;
    let completedCount = 0;
    let activeTimersCount = 0;
    const employeeMap: Record<string, { employeeId: string; displayName: string; totalWorkedSeconds: number; taskCount: number }> = {};

    for (const m of proj.members || []) {
      const emp = empById.get(m.employeeId);
      const name = emp?.displayName || emp?.firstName || 'Team Member';
      employeeMap[m.employeeId] = {
        employeeId: m.employeeId,
        displayName: name,
        totalWorkedSeconds: 0,
        taskCount: 0,
      };
    }

    for (const t of projTasks) {
      const taskDuration = t.totalDurationSeconds || 0;
      projectWorkedSeconds += taskDuration;
      if (t.status === 'COMPLETED') completedCount++;
      if (t.activeTimer || (t.timers && t.timers.some((tm: any) => tm.isActive))) activeTimersCount++;

      const empId = t.employeeId;
      const emp = empById.get(empId) || t.employee;
      const empName = emp?.displayName || emp?.firstName || 'Assigned Employee';
      if (!employeeMap[empId]) {
        employeeMap[empId] = {
          employeeId: empId,
          displayName: empName,
          totalWorkedSeconds: 0,
          taskCount: 0,
        };
      }
      employeeMap[empId].totalWorkedSeconds += taskDuration;
      employeeMap[empId].taskCount++;
    }

    const totalWorkedMinutes = Math.floor(projectWorkedSeconds / 60);
    const totalWorkedHours = parseFloat((projectWorkedSeconds / 3600).toFixed(2));

    const hydratedMembers: ProjectMember[] = (proj.members || []).map((m) => {
      const emp = empById.get(m.employeeId);
      const userObj = emp?.user ? (Array.isArray(emp.user) ? emp.user[0] : emp.user) : undefined;
      return {
        id: m.id,
        projectId: m.projectId,
        employeeId: m.employeeId,
        projectRole: m.projectRole as ProjectRole,
        addedBy: m.addedBy,
        createdAt: m.createdAt,
        employee: emp
          ? {
              id: emp.id,
              displayName: emp.displayName || emp.display_name,
              firstName: emp.firstName || emp.first_name,
              lastName: emp.lastName || emp.last_name,
              email: emp.email,
              employmentStatus: emp.employmentStatus || emp.employment_status || 'ACTIVE',
              profilePhotoUrl: emp.profilePhotoUrl || emp.profile_photo_url,
              department: emp.department,
              designation: emp.designation,
              user: userObj,
            }
          : null,
      };
    });

    return {
      ...proj,
      members: hydratedMembers,
      tasks: projTasks.map((t: any) => ({
        ...t,
        projectId: proj.id,
        project: { id: proj.id, name: proj.name, status: proj.status },
      })),
      totalTasks: projTasks.length,
      completedTasks: completedCount,
      activeTimersCount,
      totalWorkedSeconds: projectWorkedSeconds,
      totalWorkedMinutes,
      totalWorkedHours,
      employeeBreakdown: Object.values(employeeMap).map((e) => ({
        ...e,
        totalWorkedMinutes: Math.floor(e.totalWorkedSeconds / 60),
        totalWorkedHours: parseFloat((e.totalWorkedSeconds / 3600).toFixed(2)),
      })),
    };
  }

  /**
   * Create New Project with Team Members
   */
  public static async createProject(
    input: CreateProjectInput,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ): Promise<Project> {
    const isStaff = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'MANAGER';
    if (!isStaff) {
      const err: any = new Error('Only admins and managers can create projects');
      err.statusCode = 403;
      throw err;
    }

    // Validate employee eligibility for all new project members
    const memberEmpIds = new Set<string>();
    if (input.members && Array.isArray(input.members)) {
      for (const m of input.members) {
        if (m.employeeId) memberEmpIds.add(m.employeeId);
      }
    }
    if (input.employeeId) memberEmpIds.add(input.employeeId);

    for (const empId of memberEmpIds) {
      const { exists, isEligible } = await EmployeeService.getEmployeeEligibility(empId);
      if (!exists) {
        const err: any = new Error(`Employee ${empId} not found`);
        err.statusCode = 404;
        err.code = 'EMPLOYEE_NOT_FOUND';
        throw err;
      }
      if (!isEligible) {
        const err: any = new Error('Only active employees can be added to a new project.');
        err.statusCode = 400;
        err.code = 'EMPLOYEE_NOT_ACTIVE';
        throw err;
      }
    }

    const projects = await ProjectService.getStoredProjects();
    const projectId = randomUUID();
    const now = new Date().toISOString();

    const members: StoredProjectMember[] = [];

    if (input.members && Array.isArray(input.members) && input.members.length > 0) {
      for (const m of input.members) {
        if (m.employeeId && !members.some((existing) => existing.employeeId === m.employeeId)) {
          members.push({
            id: randomUUID(),
            projectId,
            employeeId: m.employeeId,
            projectRole: m.projectRole || 'CONTRIBUTOR',
            addedBy: user.id,
            createdAt: now,
          });
        }
      }
    } else if (input.employeeId) {
      members.push({
        id: randomUUID(),
        projectId,
        employeeId: input.employeeId,
        projectRole: 'LEAD',
        addedBy: user.id,
        createdAt: now,
      });
    }

    const newProject: StoredProject = {
      id: projectId,
      name: input.name.trim(),
      description: input.description || null,
      status: input.status || 'IN_PROGRESS',
      createdBy: user.id,
      employeeId: input.employeeId || null,
      startDate: input.startDate || now.split('T')[0],
      dueDate: input.dueDate || null,
      completedAt: input.status === 'COMPLETED' ? now : null,
      createdAt: now,
      updatedAt: now,
      members,
      taskIds: [],
    };

    projects.unshift(newProject);
    await ProjectService.saveStoredProjects(projects);

    await AuditService.log({
      userId: user.id,
      employeeId: user.employeeId || undefined,
      action: 'CREATE',
      entityType: 'project',
      entityId: newProject.id,
      description: `Created project "${newProject.name}" with ${members.length} members`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
    });

    return await ProjectService.getProjectById(newProject.id, user);
  }

  /**
   * Update Project
   */
  public static async updateProject(
    id: string,
    input: UpdateProjectInput,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ): Promise<Project> {
    const projects = await ProjectService.getStoredProjects();
    const index = projects.findIndex((p) => p.id === id);

    if (index === -1) {
      const err: any = new Error('Project not found');
      err.statusCode = 404;
      throw err;
    }

    const existing = projects[index];
    if (!ProjectService.isProjectManager(existing, user)) {
      const err: any = new Error('Forbidden: Only admins and project managers can edit project details');
      err.statusCode = 403;
      throw err;
    }

    const now = new Date().toISOString();
    let completedAt = existing.completedAt;
    if (input.status === 'COMPLETED' && existing.status !== 'COMPLETED') {
      completedAt = now;
    } else if (input.status && input.status !== 'COMPLETED') {
      completedAt = null;
    }

    let updatedMembers = existing.members || [];
    if (input.members && Array.isArray(input.members)) {
      for (const m of input.members) {
        if (m.employeeId) {
          const memIdx = updatedMembers.findIndex((existingM) => existingM.employeeId === m.employeeId);
          if (memIdx !== -1) {
            updatedMembers[memIdx].projectRole = m.projectRole || updatedMembers[memIdx].projectRole;
          } else {
            updatedMembers.push({
              id: randomUUID(),
              projectId: id,
              employeeId: m.employeeId,
              projectRole: m.projectRole || 'CONTRIBUTOR',
              addedBy: user.id,
              createdAt: now,
            });
          }
        }
      }
    }

    const updated: StoredProject = {
      ...existing,
      name: input.name ? input.name.trim() : existing.name,
      description: input.description !== undefined ? input.description : existing.description,
      status: input.status || existing.status,
      employeeId: input.employeeId !== undefined ? input.employeeId : existing.employeeId,
      startDate: input.startDate !== undefined ? input.startDate : existing.startDate,
      dueDate: input.dueDate !== undefined ? input.dueDate : existing.dueDate,
      completedAt,
      members: updatedMembers,
      updatedAt: now,
    };

    projects[index] = updated;
    await ProjectService.saveStoredProjects(projects);

    await AuditService.log({
      userId: user.id,
      employeeId: user.employeeId || undefined,
      action: 'UPDATE',
      entityType: 'project',
      entityId: id,
      description: `Updated project "${updated.name}"`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
    });

    return await ProjectService.getProjectById(id, user);
  }

  /**
   * List Project Members
   */
  public static async getProjectMembers(projectId: string, user: AuthUser): Promise<ProjectMember[]> {
    const project = await ProjectService.getProjectById(projectId, user);
    return project.members || [];
  }

  /**
   * Add Member to Project
   */
  public static async addMember(
    projectId: string,
    input: AddProjectMemberInput,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ): Promise<ProjectMember> {
    const projects = await ProjectService.getStoredProjects();
    const index = projects.findIndex((p) => p.id === projectId);

    if (index === -1) {
      const err: any = new Error('Project not found');
      err.statusCode = 404;
      throw err;
    }

    const project = projects[index];
    if (!ProjectService.isProjectManager(project, user)) {
      const err: any = new Error('Forbidden: Only project leads or admins can manage team members');
      err.statusCode = 403;
      throw err;
    }

    // 1. Verify target employee exists and is active
    const { exists, isEligible, employee: targetEmp } = await EmployeeService.getEmployeeEligibility(input.employeeId);
    if (!exists) {
      const err: any = new Error('Employee not found');
      err.statusCode = 404;
      err.code = 'EMPLOYEE_NOT_FOUND';
      throw err;
    }
    if (!isEligible) {
      const err: any = new Error('Only active employees can be added to a project team.');
      err.statusCode = 400;
      err.code = 'EMPLOYEE_NOT_ACTIVE';
      throw err;
    }

    if (!project.members) project.members = [];

    // 2. Prevent duplicate project memberships
    const existingMemIdx = project.members.findIndex((m) => m.employeeId === input.employeeId);
    if (existingMemIdx !== -1) {
      const err: any = new Error('Employee is already a member of this project.');
      err.statusCode = 409;
      err.code = 'ALREADY_PROJECT_MEMBER';
      throw err;
    }

    const now = new Date().toISOString();
    const memberItem: StoredProjectMember = {
      id: randomUUID(),
      projectId,
      employeeId: input.employeeId,
      projectRole: input.projectRole || 'CONTRIBUTOR',
      addedBy: user.id,
      createdAt: now,
    };
    project.members.push(memberItem);

    project.updatedAt = now;
    projects[index] = project;
    await ProjectService.saveStoredProjects(projects);

    await AuditService.log({
      userId: user.id,
      employeeId: user.employeeId || undefined,
      action: 'CREATE',
      entityType: 'project_member',
      entityId: memberItem.id,
      description: `Added member ${input.employeeId} (${input.projectRole}) to project "${project.name}"`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
    });

    const fullProj = await ProjectService.getProjectById(projectId, user);
    return fullProj.members?.find((m) => m.employeeId === input.employeeId) || (memberItem as any);
  }

  /**
   * Remove Member from Project
   */
  public static async removeMember(
    projectId: string,
    employeeId: string,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ): Promise<{ success: true; message: string }> {
    const projects = await ProjectService.getStoredProjects();
    const index = projects.findIndex((p) => p.id === projectId);

    if (index === -1) {
      const err: any = new Error('Project not found');
      err.statusCode = 404;
      throw err;
    }

    const project = projects[index];
    if (!ProjectService.isProjectManager(project, user)) {
      const err: any = new Error('Forbidden: Only project leads or admins can manage team members');
      err.statusCode = 403;
      throw err;
    }

    if (project.members) {
      project.members = project.members.filter((m) => m.employeeId !== employeeId);
      project.updatedAt = new Date().toISOString();
      projects[index] = project;
      await ProjectService.saveStoredProjects(projects);
    }

    await AuditService.log({
      userId: user.id,
      employeeId: user.employeeId || undefined,
      action: 'DELETE',
      entityType: 'project_member',
      entityId: `${projectId}:${employeeId}`,
      description: `Removed member ${employeeId} from project "${project.name}"`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
    });

    return { success: true, message: 'Member removed from project successfully' };
  }

  /**
   * Update Member Role in Project
   */
  public static async updateMemberRole(
    projectId: string,
    employeeId: string,
    input: UpdateProjectMemberInput,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ): Promise<ProjectMember> {
    const projects = await ProjectService.getStoredProjects();
    const index = projects.findIndex((p) => p.id === projectId);

    if (index === -1) {
      const err: any = new Error('Project not found');
      err.statusCode = 404;
      throw err;
    }

    const project = projects[index];
    if (!ProjectService.isProjectManager(project, user)) {
      const err: any = new Error('Forbidden: Only project leads or admins can update team member roles');
      err.statusCode = 403;
      throw err;
    }

    if (!project.members) project.members = [];
    const memIdx = project.members.findIndex((m) => m.employeeId === employeeId);
    if (memIdx === -1) {
      const err: any = new Error('Member not found in project');
      err.statusCode = 404;
      throw err;
    }

    project.members[memIdx].projectRole = input.projectRole;
    project.updatedAt = new Date().toISOString();
    projects[index] = project;
    await ProjectService.saveStoredProjects(projects);

    await AuditService.log({
      userId: user.id,
      employeeId: user.employeeId || undefined,
      action: 'UPDATE',
      entityType: 'project_member',
      entityId: project.members[memIdx].id,
      description: `Updated role of member ${employeeId} to "${input.projectRole}" in project "${project.name}"`,
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
    });

    const fullProj = await ProjectService.getProjectById(projectId, user);
    return fullProj.members?.find((m) => m.employeeId === employeeId)!;
  }

  /**
   * List Project Tasks
   */
  public static async getProjectTasks(projectId: string, user: AuthUser): Promise<Task[]> {
    const project = await ProjectService.getProjectById(projectId, user);
    return project.tasks || [];
  }

  /**
   * Create Task under a specific Project
   */
  public static async createTaskUnderProject(
    projectId: string,
    input: CreateTaskInput,
    user: AuthUser,
    clientInfo: { ipAddress?: string; userAgent?: string }
  ): Promise<Task> {
    const projects = await ProjectService.getStoredProjects();
    const index = projects.findIndex((p) => p.id === projectId);

    if (index === -1) {
      const err: any = new Error('Project not found');
      err.statusCode = 404;
      throw err;
    }

    const project = projects[index];
    if (project.status === 'COMPLETED') {
      const err: any = new Error('Cannot add tasks to a completed project');
      err.statusCode = 409;
      throw err;
    }

    const isParticipant = ProjectService.isProjectParticipant(project, user);
    if (!isParticipant) {
      const err: any = new Error('Forbidden: You must be a project member to create tasks under this project');
      err.statusCode = 403;
      throw err;
    }

    let targetEmployeeId = input.employeeId;
    if (!targetEmployeeId) {
      targetEmployeeId = user.employeeId || undefined;
    }

    if (!targetEmployeeId) {
      const err: any = new Error('Assignee employee ID is required');
      err.statusCode = 400;
      throw err;
    }

    // Verify assignee is a current member of the project
    const isProjectMember = (project.members && project.members.some((m) => m.employeeId === targetEmployeeId)) || project.employeeId === targetEmployeeId;
    if (!isProjectMember) {
      const err: any = new Error('The selected employee is not a member of this project.');
      err.statusCode = 400;
      err.code = 'ASSIGNEE_NOT_PROJECT_MEMBER';
      throw err;
    }

    // Verify assignee is active
    const { exists: assigneeExists, isEligible: assigneeEligible } = await EmployeeService.getEmployeeEligibility(targetEmployeeId);
    if (!assigneeExists) {
      const err: any = new Error('Assignee employee not found');
      err.statusCode = 404;
      err.code = 'EMPLOYEE_NOT_FOUND';
      throw err;
    }
    if (!assigneeEligible) {
      const err: any = new Error('Only active employees can be assigned new tasks.');
      err.statusCode = 400;
      err.code = 'EMPLOYEE_NOT_ACTIVE';
      throw err;
    }

    // Embed tag in description for permanent linkage
    const tag = `[Project: ${projectId}]`;
    const cleanDesc = input.description ? `${input.description}\n${tag}` : tag;

    const task = await TaskService.createTask(
      {
        ...input,
        description: cleanDesc,
        employeeId: targetEmployeeId,
      },
      user,
      clientInfo
    );

    if (!project.taskIds) project.taskIds = [];
    if (!project.taskIds.includes(task.id)) {
      project.taskIds.push(task.id);
    }
    project.updatedAt = new Date().toISOString();
    projects[index] = project;
    await ProjectService.saveStoredProjects(projects);

    return {
      ...task,
      projectId,
      project: { id: project.id, name: project.name, status: project.status as any },
    };
  }
}
