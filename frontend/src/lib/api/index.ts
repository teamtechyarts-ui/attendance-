import { api } from './client';
export { api } from './client';

import {
  SessionInfo,
  Employee,
  Task,
  AttendanceRecord,
  AttendanceSummary,
  AttendanceHistoryResponse,
  LeaveRequest,
  LeaveType,
  LeavePolicyConfig,
  LeaveAllocationRecord,
  EmployeeLeaveBalance,
  LeaveOrganizationSummary,
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
  Permission,
  AdminScope,
  PermissionDefinition,
  LimitedAdminAssignment,
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
  listAssignable: (params?: { departmentId?: string; search?: string; projectId?: string }) => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '' && v !== 'undefined' && v !== 'null') {
          cleanParams[k] = String(v);
        }
      }
    }
    const query = new URLSearchParams(cleanParams).toString();
    return api.get<Employee[]>(`/api/employees/assignable${query ? `?${query}` : ''}`);
  },
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
  getNextCode: () => api.get<{ nextEmployeeCode: string }>('/api/employees/next-code'),
  updateMe: (data: any) => api.put<Employee>('/api/employees/me', data),
  updateSelfProfile: (data: any) => api.put<Employee>('/api/employees/me/profile', data),
  uploadProfilePhoto: (data: { image: string }) =>
    api.post<{ profilePhotoUrl: string; employee: Employee }>('/api/employees/me/profile-photo', data),
  deleteProfilePhoto: () =>
    api.delete<{ success: boolean; employee: Employee }>('/api/employees/me/profile-photo'),
  updateJoiningDate: (id: string, joiningDate: string | null) =>
    api.patch<Employee>(`/api/employees/${id}/joining-date`, { joiningDate }),
};

export const attendanceApi = {
  getToday: () => api.get<{ record: AttendanceRecord | null; workday: any; date: string }>('/api/attendance/today'),
  checkIn: (data: CheckInInput) => api.post<AttendanceRecord>('/api/attendance/check-in', data),
  checkOut: (data: CheckOutInput) => api.post<AttendanceRecord>('/api/attendance/check-out', data),
  confirmOvertime: () => api.post<{ success: boolean; overtimeConfirmed: boolean; date: string }>('/api/attendance/confirm-overtime'),
  getHistory: async (params?: { year?: number; month?: number; employeeId?: string; date?: string; status?: string; adminView?: boolean }) => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '' && v !== 'undefined' && v !== 'null') {
          cleanParams[k] = String(v);
        }
      }
    }
    const query = new URLSearchParams(cleanParams).toString();
    const res = await api.get<any>(`/api/attendance/history${query ? `?${query}` : ''}`);
    // Support both { records, summary } and legacy array format
    if (res && Array.isArray(res.records)) {
      return res as { records: AttendanceRecord[]; summary: any };
    }
    if (Array.isArray(res)) {
      return { records: res as AttendanceRecord[], summary: null };
    }
    return { records: [], summary: null };
  },
  getLiveOverview: () => api.get<LiveEmployeeActivity[]>('/api/attendance/live-overview'),
  getMetrics: () => api.get<AdminDashboardMetrics>('/api/attendance/metrics'),
};

export const projectsApi = {
  list: (params?: { search?: string; status?: string; employeeId?: string; adminView?: boolean }) => {
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
  delete: (id: string) => api.delete<{ deleted: boolean; id: string }>(`/api/tasks/${id}`),
  getComments: (id: string) => api.get<TaskComment[]>(`/api/tasks/${id}/comments`),
  listComments: (id: string) => api.get<TaskComment[]>(`/api/tasks/${id}/comments`),
  addComment: (id: string, data: { content?: string; comment?: string; mentionedEmployeeIds?: string[]; mentionEmployeeIds?: string[] }) =>
    api.post<TaskComment>(`/api/tasks/${id}/comments`, {
      content: data.content || data.comment || '',
      mentionEmployeeIds: data.mentionEmployeeIds || data.mentionedEmployeeIds || [],
    }),
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
  getTypes: (all?: boolean) => api.get<LeaveType[]>(`/api/leave/types${all ? '?all=true' : ''}`),
  createType: (data: { name: string; description?: string; defaultDaysPerYear?: number; isPaid?: boolean }) =>
    api.post<LeaveType>('/api/leave/types', data),
  updateType: (id: string, data: Partial<LeaveType>) => api.put<LeaveType>(`/api/leave/types/${id}`, data),
  deleteType: (id: string) => api.delete<void>(`/api/leave/types/${id}`),

  getPolicies: () => api.get<LeavePolicyConfig[]>('/api/leave/policies'),
  updatePolicy: (leaveTypeId: string, data: Partial<LeavePolicyConfig>) =>
    api.put<LeavePolicyConfig>(`/api/leave/policies/${leaveTypeId}`, data),

  getAllocations: (params?: { year?: number; month?: number | null; employeeId?: string; leaveTypeId?: string }) => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') cleanParams[k] = String(v);
      }
    }
    const query = new URLSearchParams(cleanParams).toString();
    return api.get<LeaveAllocationRecord[]>(`/api/leave/allocations${query ? `?${query}` : ''}`);
  },
  createAllocation: (data: any) => api.post<LeaveAllocationRecord>('/api/leave/allocations', data),
  updateAllocation: (id: string, data: any) => api.put<LeaveAllocationRecord>(`/api/leave/allocations/${id}`, data),
  deleteAllocation: (id: string) => api.delete<{ deleted: boolean; id: string }>(`/api/leave/allocations/${id}`),

  getBalances: (params?: { employeeId?: string; year?: number; month?: number | null; adminView?: boolean }) => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') cleanParams[k] = String(v);
      }
    }
    const query = new URLSearchParams(cleanParams).toString();
    return api.get<EmployeeLeaveBalance[]>(`/api/leave/balances${query ? `?${query}` : ''}`);
  },
  getOrganizationSummary: (params?: { year?: number; month?: number | null; departmentId?: string }) => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') cleanParams[k] = String(v);
      }
    }
    const query = new URLSearchParams(cleanParams).toString();
    return api.get<LeaveOrganizationSummary>(`/api/leave/organization-summary${query ? `?${query}` : ''}`);
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
  list: (params?: { page?: number; limit?: number; unreadOnly?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.unreadOnly) searchParams.set('unreadOnly', 'true');
    const qs = searchParams.toString();
    return api.get<NotificationItem[]>(`/api/notifications${qs ? `?${qs}` : ''}`);
  },
  getUnreadCount: () => api.get<{ unreadCount: number }>('/api/notifications/unread-count'),
  markRead: (id: string) => api.patch<NotificationItem>(`/api/notifications/${id}/read`),
  markAllRead: () => api.post<{ message: string; count: number }>('/api/notifications/read-all'),
  delete: (id: string) => api.delete<{ message: string }>(`/api/notifications/${id}`),
  bulkDelete: async (ids: string[]) => {
    try {
      return await api.delete<{ message: string; deletedCount: number; deletedIds: string[] }>('/api/notifications/bulk', {
        body: JSON.stringify({ ids }),
      });
    } catch (err: any) {
      if (err.status === 400 || err.status === 405 || err.status === 404) {
        return await api.post<{ message: string; deletedCount: number; deletedIds: string[] }>('/api/notifications/bulk-delete', { ids });
      }
      throw err;
    }
  },
  deleteAll: async () => {
    try {
      return await api.delete<{ message: string; deletedCount: number }>('/api/notifications/all');
    } catch (err: any) {
      if (err.status === 405 || err.status === 404) {
        return await api.post<{ message: string; deletedCount: number }>('/api/notifications/delete-all');
      }
      throw err;
    }
  },
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

export const departmentsApi = {
  list: (params?: { includeInactive?: boolean }) => metadataApi.getDepartments(params),
  create: (data: { name: string; description?: string | null; isActive?: boolean }) => metadataApi.createDepartment(data),
  update: (id: string, data: { name?: string; description?: string | null; isActive?: boolean }) => metadataApi.updateDepartment(id, data),
  delete: (id: string) => metadataApi.deleteDepartment(id),
};

export const designationsApi = {
  list: (params?: { includeInactive?: boolean }) => metadataApi.getDesignations(params),
  create: (data: { name: string; description?: string | null; isActive?: boolean }) => metadataApi.createDesignation(data),
  update: (id: string, data: { name?: string; description?: string | null; isActive?: boolean }) => metadataApi.updateDesignation(id, data),
  delete: (id: string) => metadataApi.deleteDesignation(id),
};


export const rbacApi = {
  getPermissions: () => api.get<PermissionDefinition[]>('/api/rbac/permissions'),
  getAssignments: () => api.get<LimitedAdminAssignment[]>('/api/rbac/assignments'),
  getAssignment: (employeeId: string) => api.get<LimitedAdminAssignment>(`/api/rbac/assignments/${employeeId}`),
  grantAssignment: (
    employeeId: string,
    data: { permissions: Permission[]; scope?: AdminScope | null; notes?: string | null }
  ) => api.post<LimitedAdminAssignment>(`/api/rbac/assignments/${employeeId}`, data),
  revokeAssignment: (employeeId: string) =>
    api.delete<{ message: string }>(`/api/rbac/assignments/${employeeId}`),
};

export const collaborationApi = {
  getPeopleDirectory: (params?: { search?: string; departmentId?: string }) => {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.departmentId) query.append('departmentId', params.departmentId);
    const qs = query.toString();
    return api.get<{ people: import('@/types').PeopleDirectoryItem[] }>(`/api/collaboration/people${qs ? `?${qs}` : ''}`);
  },
  getPresence: () => api.get<{ presence: import('@/types').UserPresence }>('/api/collaboration/presence'),
  setPresenceStatus: (data: { status: import('@/types').UserPresenceStatus; customStatusMessage?: string | null }) =>
    api.post<{ presence: import('@/types').UserPresence }>('/api/collaboration/presence/status', data),
  getConversations: () =>
    api.get<{ conversations: import('@/types').Conversation[] }>('/api/collaboration/conversations'),
  getOrCreateDirectConversation: (targetUserId: string) =>
    api.post<{ conversation: import('@/types').Conversation }>('/api/collaboration/conversations/direct', { targetUserId }),
  createGroupConversation: (data: { title: string; description?: string | null; memberUserIds: string[] }) =>
    api.post<{ conversation: import('@/types').Conversation }>('/api/collaboration/conversations/group', data),
  getConversationById: (id: string) =>
    api.get<{ conversation: import('@/types').Conversation }>(`/api/collaboration/conversations/${id}`),
  getConversationMessages: (id: string, params?: { cursor?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.cursor) query.append('cursor', params.cursor);
    if (params?.limit) query.append('limit', params.limit.toString());
    const qs = query.toString();
    return api.get<{ messages: import('@/types').Message[]; nextCursor: string | null }>(
      `/api/collaboration/conversations/${id}/messages${qs ? `?${qs}` : ''}`
    );
  },
  sendMessage: (conversationId: string, data: { body: string; replyToMessageId?: string | null }) =>
    api.post<{ message: import('@/types').Message }>(`/api/collaboration/conversations/${conversationId}/messages`, data),
  editMessage: (messageId: string, data: { body: string }) =>
    api.patch<{ message: import('@/types').Message }>(`/api/collaboration/messages/${messageId}`, data),
  deleteMessage: (messageId: string) =>
    api.delete<{ success: boolean; messageId: string }>(`/api/collaboration/messages/${messageId}`),
  toggleReaction: (messageId: string, reaction: string) =>
    api.post<{ success: boolean; reactions: import('@/types').MessageReaction[] }>(
      `/api/collaboration/messages/${messageId}/reactions`,
      { reaction }
    ),
  markConversationAsRead: (conversationId: string) =>
    api.post<{ success: boolean; conversationId: string }>(`/api/collaboration/conversations/${conversationId}/read`, {}),
  addGroupMember: (conversationId: string, targetUserId: string) =>
    api.post<{ success: boolean }>(`/api/collaboration/conversations/${conversationId}/members`, { targetUserId }),
  removeGroupMember: (conversationId: string, targetUserId: string) =>
    api.delete<{ success: boolean }>(`/api/collaboration/conversations/${conversationId}/members/${targetUserId}`),
  leaveGroupConversation: (conversationId: string) =>
    api.post<{ success: boolean }>(`/api/collaboration/conversations/${conversationId}/leave`, {}),
  getActiveMeeting: (conversationId: string) =>
    api.get<{ meeting: import('@/types').PublicMeetingState | null }>(`/api/collaboration/conversations/${conversationId}/meeting`),
  getMeetingById: (meetingId: string) =>
    api.get<{ meeting: import('@/types').PublicMeetingState }>(`/api/collaboration/meetings/${meetingId}`),
};



