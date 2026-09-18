import { api } from './client';
export { api } from './client';

import {
  SessionInfo,
  Employee,
  Task,
  AttendanceRecord,
  LeaveRequest,
  LeaveType,
  DailyWorkReport,
  Feedback,
  CalendarEvent,
  DigitalIdCard,
  NotificationItem,
  LiveEmployeeActivity,
  AdminDashboardMetrics,
  Department,
  Designation,
  WorkSchedule,
  Project,
  ProjectMember,
  TaskComment,
  TaskMention,
} from '@/types';
import {
  LoginInput,
  ChangePasswordInput,
  ResetPasswordInput,
  CreateEmployeeInput,
  UpdateEmployeeInput,
  CheckInInput,
  CheckOutInput,
  CreateTaskInput,
  UpdateTaskInput,
  CreateProjectInput,
  UpdateProjectInput,
  CreateLeaveRequestInput,
  CreateDailyReportInput,
  CreateFeedbackInput,
} from '@/validation';

export const authApi = {
  login: (data: LoginInput) => api.post<{ accessToken: string; refreshToken: string; session: SessionInfo }>('/api/auth/login', data),
  logout: () => api.post('/api/auth/logout'),
  getMe: () => api.get<SessionInfo>('/api/auth/me'),
  refresh: () => api.post<{ accessToken: string; refreshToken: string; session: SessionInfo }>('/api/auth/refresh'),
  changePassword: (data: ChangePasswordInput) => api.post('/api/auth/change-password', data),
  forgotPassword: (email: string) => api.post('/api/auth/forgot-password', { email }),
  resetPassword: (data: ResetPasswordInput) => api.post('/api/auth/reset-password', data),
};

export const employeesApi = {
  list: (params?: { departmentId?: string; search?: string; status?: string }) => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '' && v !== 'undefined' && v !== 'null') {
          cleanParams[k] = String(v);
        }
      }
    }
    const query = new URLSearchParams(cleanParams).toString();
    return api.get<Employee[]>(`/api/employees${query ? `?${query}` : ''}`);
  },
  getById: (id: string) => api.get<Employee>(`/api/employees/${id}`),
  create: (data: CreateEmployeeInput) => api.post<Employee>('/api/employees', data),
  update: (id: string, data: UpdateEmployeeInput) => api.put<Employee>(`/api/employees/${id}`, data),
  delete: (id: string) => api.delete<void>(`/api/employees/${id}`),
  deactivate: (id: string) => api.delete<{ deactivated: boolean; message: string }>(`/api/employees/${id}`),
  reactivate: (id: string) => api.post<{ reactivated: boolean; message: string }>(`/api/employees/${id}/reactivate`),
  resendOnboarding: (id: string) => api.post<{ message: string; emailSent: boolean }>(`/api/employees/${id}/resend-onboarding`),
  getMe: () => api.get<Employee>('/api/employees/me'),
  updateMe: (data: any) => api.put<Employee>('/api/employees/me', data),
  updateSelfProfile: (data: any) => api.put<Employee>('/api/employees/me/profile', data),
};

export const attendanceApi = {
  getToday: () => api.get<{ record: AttendanceRecord | null; workday: any; date: string }>('/api/attendance/today'),
  checkIn: (data: CheckInInput) => api.post<AttendanceRecord>('/api/attendance/check-in', data),
  checkOut: (data: CheckOutInput) => api.post<AttendanceRecord>('/api/attendance/check-out', data),
  getHistory: (params?: { year?: number; month?: number; employeeId?: string }) => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '' && v !== 'undefined' && v !== 'null') {
          cleanParams[k] = String(v);
        }
      }
    }
    const query = new URLSearchParams(cleanParams).toString();
    return api.get<AttendanceRecord[]>(`/api/attendance/history${query ? `?${query}` : ''}`);
  },
  getLiveOverview: () => api.get<LiveEmployeeActivity[]>('/api/attendance/live-overview'),
  getMetrics: () => api.get<AdminDashboardMetrics>('/api/attendance/metrics'),
};

export const projectsApi = {
  list: (params?: { search?: string; status?: string; employeeId?: string }) => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '' && v !== 'undefined' && v !== 'null') {
          cleanParams[k] = String(v);
        }
      }
    }
    const query = new URLSearchParams(cleanParams).toString();
    return api.get<Project[]>(`/api/projects${query ? `?${query}` : ''}`);
  },
  getById: (id: string) => api.get<Project>(`/api/projects/${id}`),
  create: (data: CreateProjectInput) => api.post<Project>('/api/projects', data),
  update: (id: string, data: UpdateProjectInput) => api.put<Project>(`/api/projects/${id}`, data),
  getMembers: (id: string) => api.get<ProjectMember[]>(`/api/projects/${id}/members`),
  addMember: (id: string, data: { employeeId: string; projectRole?: string }) =>
    api.post<ProjectMember>(`/api/projects/${id}/members`, data),
  removeMember: (id: string, employeeId: string) =>
    api.delete<{ success: boolean; message: string }>(`/api/projects/${id}/members/${employeeId}`),
  updateMemberRole: (id: string, employeeId: string, data: { projectRole: string }) =>
    api.patch<ProjectMember>(`/api/projects/${id}/members/${employeeId}`, data),
  getTasks: (id: string) => api.get<Task[]>(`/api/projects/${id}/tasks`),
  createTask: (projectId: string, data: CreateTaskInput) =>
    api.post<Task>(`/api/projects/${projectId}/tasks`, data),
};

export const tasksApi = {
  list: (params?: Record<string, any>) => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '' && v !== 'undefined' && v !== 'null') {
          cleanParams[k] = String(v);
        }
      }
    }
    const query = new URLSearchParams(cleanParams).toString();
    return api.get<Task[]>(`/api/tasks${query ? `?${query}` : ''}`);
  },
  getById: (id: string) => api.get<Task>(`/api/tasks/${id}`),
  create: (data: CreateTaskInput) => api.post<Task>('/api/tasks', data),
  update: (id: string, data: UpdateTaskInput) => api.put<Task>(`/api/tasks/${id}`, data),
  getComments: (id: string) => api.get<TaskComment[]>(`/api/tasks/${id}/comments`),
  addComment: (id: string, data: { comment: string; mentionedEmployeeIds?: string[] }) =>
    api.post<TaskComment>(`/api/tasks/${id}/comments`, data),
  getMentions: (id: string) => api.get<TaskMention[]>(`/api/tasks/${id}/mentions`),
  addMention: (id: string, data: { mentionedEmployeeId: string; context?: string }) =>
    api.post<TaskMention>(`/api/tasks/${id}/mentions`, data),
  startTimer: (id: string) => api.post<{ timer: any; task: Task }>(`/api/tasks/${id}/timer/start`),
  pauseTimer: (id: string) => api.post<{ timer: any; task: Task }>(`/api/tasks/${id}/timer/pause`),
  stopTimer: (id: string) => api.post<{ task: Task }>(`/api/tasks/${id}/timer/stop`),
  getActiveTimer: () => api.get<any>('/api/tasks/timer/active'),
  getSummary: (params?: { employeeId?: string }) => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '' && v !== 'undefined' && v !== 'null') {
          cleanParams[k] = String(v);
        }
      }
    }
    const query = new URLSearchParams(cleanParams).toString();
    return api.get<any>(`/api/tasks/summary${query ? `?${query}` : ''}`);
  },
};

export const leaveApi = {
  getTypes: () => api.get<LeaveType[]>('/api/leave/types'),
  getBalances: (params?: { employeeId?: string; year?: number }) => {
    const query = new URLSearchParams(params as any).toString();
    return api.get<any[]>(`/api/leave/balances${query ? `?${query}` : ''}`);
  },
  listRequests: (params?: Record<string, any>) => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') cleanParams[k] = String(v);
      }
    }
    const query = new URLSearchParams(cleanParams).toString();
    return api.get<LeaveRequest[]>(`/api/leave/requests${query ? `?${query}` : ''}`);
  },
  request: (data: CreateLeaveRequestInput) => api.post<LeaveRequest>('/api/leave/requests', data),
  review: (id: string, data: { status: 'APPROVED' | 'REJECTED'; reviewComment?: string }) =>
    api.put<LeaveRequest>(`/api/leave/requests/${id}/review`, data),
  cancel: (id: string) => api.delete<LeaveRequest>(`/api/leave/requests/${id}/cancel`),
};

export const reportsApi = {
  getToday: () => api.get<DailyWorkReport | null>('/api/reports/today'),
  list: (params?: Record<string, any>) => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') cleanParams[k] = String(v);
      }
    }
    const query = new URLSearchParams(cleanParams).toString();
    return api.get<DailyWorkReport[]>(`/api/reports${query ? `?${query}` : ''}`);
  },
  submit: (data: CreateDailyReportInput) => api.post<DailyWorkReport>('/api/reports', data),
  review: (id: string) => api.put<DailyWorkReport>(`/api/reports/${id}/review`),
};

export const feedbackApi = {
  list: (params?: Record<string, any>) => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') cleanParams[k] = String(v);
      }
    }
    const query = new URLSearchParams(cleanParams).toString();
    return api.get<Feedback[]>(`/api/feedback${query ? `?${query}` : ''}`);
  },
  create: (data: CreateFeedbackInput) => api.post<Feedback>('/api/feedback', data),
};

export const calendarApi = {
  getEvents: (params?: { year?: number; month?: number; employeeId?: string }) => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '' && v !== 'undefined' && v !== 'null') {
          cleanParams[k] = String(v);
        }
      }
    }
    const query = new URLSearchParams(cleanParams).toString();
    return api.get<{ holidays: any[]; events: CalendarEvent[]; leaves: any[]; attendances: any[]; tasks: Task[] }>(
      `/api/calendar/events${query ? `?${query}` : ''}`
    );
  },
  createEvent: (data: any) => api.post<CalendarEvent>('/api/calendar/events', data),
  updateEvent: (id: string, data: any) => api.patch<CalendarEvent>(`/api/calendar/events/${id}`, data),
  deleteEvent: (id: string) => api.delete<{ success: boolean; message: string }>(`/api/calendar/events/${id}`),
};

export const digitalIdApi = {
  getMyCard: () => api.get<DigitalIdCard>('/api/digital-id/me'),
  verifyPublicToken: (token: string) => api.get<any>(`/api/digital-id/verify/${token}`),
};

export const notificationsApi = {
  list: () => api.get<NotificationItem[]>('/api/notifications'),
  markRead: (id: string) => api.patch<NotificationItem>(`/api/notifications/${id}/read`),
  markAllRead: () => api.post('/api/notifications/read-all'),
};

export const metadataApi = {
  getDepartments: (params?: { includeInactive?: boolean }) =>
    api.get<Department[]>(`/api/departments${params?.includeInactive ? '?includeInactive=true' : ''}`),
  createDepartment: (data: { name: string; description?: string | null; isActive?: boolean }) =>
    api.post<Department>('/api/departments', data),
  updateDepartment: (id: string, data: { name?: string; description?: string | null; isActive?: boolean }) =>
    api.patch<Department>(`/api/departments/${id}`, data),
  deleteDepartment: (id: string) =>
    api.delete<{ message: string; data?: Department; deactivated?: boolean }>(`/api/departments/${id}`),

  getDesignations: (params?: { includeInactive?: boolean }) =>
    api.get<Designation[]>(`/api/designations${params?.includeInactive ? '?includeInactive=true' : ''}`),
  createDesignation: (data: { name: string; description?: string | null; isActive?: boolean }) =>
    api.post<Designation>('/api/designations', data),
  updateDesignation: (id: string, data: { name?: string; description?: string | null; isActive?: boolean }) =>
    api.patch<Designation>(`/api/designations/${id}`, data),
  deleteDesignation: (id: string) =>
    api.delete<{ message: string; data?: Designation; deactivated?: boolean }>(`/api/designations/${id}`),

  getWorkSchedules: () => api.get<WorkSchedule[]>('/api/work-schedules'),
  createWorkSchedule: (data: any) => api.post<WorkSchedule>('/api/work-schedules', data),
  updateWorkSchedule: (id: string, data: any) => api.patch<WorkSchedule>(`/api/work-schedules/${id}`, data),
  deleteWorkSchedule: (id: string) =>
    api.delete<{ message: string; data?: WorkSchedule }>(`/api/work-schedules/${id}`),
};
