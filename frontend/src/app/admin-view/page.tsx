'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { hasPermission, getPermittedAdminModules } from '@/lib/permissions';
import { tasksApi, projectsApi, attendanceApi, leaveApi, reportsApi } from '@/lib/api';
import { Task, Project, DailyWorkReport, LeaveRequest } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatSecondsToTime } from '@/lib/utils';
import {
  Briefcase,
  FolderKanban,
  Users,
  Clock,
  Calendar,
  FileText,
  UserCheck,
  Settings,
  Plus,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Timer,
  Play,
  Pause,
  ExternalLink,
  ShieldCheck,
  BarChart3,
} from 'lucide-react';

export default function LimitedAdminDashboard() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequest[]>([]);
  const [pendingReports, setPendingReports] = useState<DailyWorkReport[]>([]);
  const [liveAttendance, setLiveAttendance] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(Date.now());

  // Permission Checks
  const canTasks = useMemo(() => hasPermission(user, ['TASK_CREATE', 'TASK_UPDATE', 'TASK_ASSIGN', 'TASK_DELETE', 'WORK_MANAGE', 'WORK_VIEW_DASHBOARD']), [user]);
  const canProjects = useMemo(() => hasPermission(user, ['PROJECT_CREATE', 'PROJECT_UPDATE', 'PROJECT_EDIT', 'PROJECT_ASSIGN', 'PROJECT_DELETE']), [user]);
  const canTeam = useMemo(() => hasPermission(user, ['MANAGE_PROJECT_TEAM', 'TEAM_VIEW', 'TEAM_CREATE', 'TEAM_MEMBER_ADD']), [user]);
  const canAttendance = useMemo(() => hasPermission(user, ['ATTENDANCE_MANAGE', 'ATTENDANCE_EDIT', 'ATTENDANCE_EXPORT']), [user]);
  const canLeave = useMemo(() => hasPermission(user, ['LEAVE_MANAGE', 'LEAVE_APPROVE']), [user]);
  const canReports = useMemo(() => hasPermission(user, ['REPORTS_VIEW', 'REPORTS_APPROVE', 'REPORTS_EXPORT']), [user]);
  const canCreateTask = useMemo(() => hasPermission(user, 'TASK_CREATE'), [user]);
  const canCreateProject = useMemo(() => hasPermission(user, 'PROJECT_CREATE'), [user]);

  // Permitted modules
  const permittedModules = useMemo(() => getPermittedAdminModules(user), [user]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const promises: Promise<any>[] = [];

      if (canTasks) {
        promises.push(tasksApi.list({ adminView: true }).then((res) => setTasks(Array.isArray(res) ? res : [])).catch(() => []));
      }
      if (canProjects) {
        promises.push(projectsApi.list({ adminView: true }).then((res) => setProjects(Array.isArray(res) ? res : [])).catch(() => []));
      }
      if (canLeave) {
        promises.push(leaveApi.listRequests({ status: 'PENDING', adminView: true }).then((res: any) => {
          const list = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
          setPendingLeaves(list);
        }).catch(() => []));
      }
      if (canReports) {
        promises.push(reportsApi.list({ adminView: true }).then((res: any) => {
          const list = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
          setPendingReports(list.filter((r: any) => r.status === 'SUBMITTED'));
        }).catch(() => []));
      }
      if (canAttendance) {
        promises.push(attendanceApi.getLiveOverview().then((res) => setLiveAttendance(Array.isArray(res) ? res : [])).catch(() => []));
      }

      await Promise.all(promises);
    } catch (err) {
      console.error('Failed to load Limited Admin dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [canTasks, canProjects, canLeave, canReports, canAttendance]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Live ticking timer
  useEffect(() => {
    const timer = setInterval(() => setCurrentTimeMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute Task KPIs
  const activeTasks = useMemo(() => {
    return tasks.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS' || t.status === 'PAUSED');
  }, [tasks]);

  const runningTimerTasks = useMemo(() => {
    return tasks.filter((t: any) => t.activeTimer || (t.timers && Array.isArray(t.timers) && t.timers.some((tm: any) => tm.isActive)));
  }, [tasks]);

  const completedTasks = useMemo(() => {
    return tasks.filter((t) => t.status === 'COMPLETED');
  }, [tasks]);

  const overdueTasks = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return activeTasks.filter((t) => t.dueDate && t.dueDate < today);
  }, [activeTasks]);

  // Helper: Live elapsed duration calculation
  const calculateLiveTaskDuration = useCallback((task: any, nowMs: number): number => {
    const timers = task.timers || [];
    if (!timers || timers.length === 0) return task.totalDurationSeconds || 0;
    const activeT = timers.find((t: any) => t.isActive ?? t.is_active);
    if (!activeT) return task.totalDurationSeconds || 0;

    const priorClosed = timers
      .filter((t: any) => !(t.isActive ?? t.is_active))
      .reduce((acc: number, t: any) => acc + (t.durationSeconds ?? t.duration_seconds ?? 0), 0);
    const startedMs = new Date(activeT.startedAt || activeT.started_at).getTime();
    const liveSec = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
    return priorClosed + liveSec;
  }, []);

  if (isLoading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading administrative workspace..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Limited Admin</h1>
            <Badge variant="outline" className="bg-neutral-50 text-neutral-700 border-neutral-300 font-semibold text-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-neutral-600 mr-1" />
              {user?.permissions?.length || 0} Permissions Assigned
            </Badge>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Manage the areas assigned to you.
          </p>
        </div>

        {/* Quick Action Buttons based on explicit permissions */}
        <div className="flex items-center gap-2 flex-wrap">
          {canCreateTask && (
            <Link href="/admin-view/tasks?action=new">
              <Button size="sm" className="bg-neutral-900 hover:bg-black text-white text-xs gap-1.5 shadow-sm">
                <Plus className="w-3.5 h-3.5" />
                Create Task
              </Button>
            </Link>
          )}
          {canCreateProject && (
            <Link href="/admin-view/projects?action=new">
              <Button size="sm" variant="outline" className="text-xs gap-1.5 border-neutral-300 hover:bg-neutral-50">
                <FolderKanban className="w-3.5 h-3.5" />
                New Project
              </Button>
            </Link>
          )}
          <Link href="/dashboard">
            <Button size="sm" variant="ghost" className="text-xs text-neutral-600 hover:text-black">
              Switch to Employee View →
            </Button>
          </Link>
        </div>
      </div>

      {/* Permitted Modules Fast Links */}
      <div>
        <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Assigned Administrative Modules</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {permittedModules.filter((m) => m.id !== 'overview').map((mod) => (
            <Link key={mod.id} href={mod.href} className="group">
              <div className="p-3.5 rounded-lg border border-neutral-200 bg-white hover:border-neutral-900 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm text-neutral-900 group-hover:text-black">{mod.label}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-900 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <p className="text-[11px] text-neutral-500 line-clamp-2 leading-relaxed">{mod.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* KPI Cards Grid (Strictly displayed only for permitted capabilities) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {canTasks && (
          <>
            <Card className="border-neutral-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-500">Active Tasks</span>
                  <Briefcase className="w-4 h-4 text-neutral-600" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-neutral-900">{activeTasks.length}</span>
                  <span className="text-xs text-neutral-500">in progress or todo</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-neutral-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-500">Live Running Timers</span>
                  <Timer className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-emerald-600">{runningTimerTasks.length}</span>
                  <span className="text-xs text-neutral-500">actively tracked</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-neutral-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-500">Overdue Tasks</span>
                  <AlertCircle className="w-4 h-4 text-rose-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-rose-600">{overdueTasks.length}</span>
                  <span className="text-xs text-neutral-500">past due date</span>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {canProjects && (
          <Card className="border-neutral-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-500">Managed Projects</span>
                <FolderKanban className="w-4 h-4 text-neutral-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-neutral-900">{projects.length}</span>
                <span className="text-xs text-neutral-500">within scope</span>
              </div>
            </CardContent>
          </Card>
        )}

        {canLeave && (
          <Card className="border-neutral-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-500">Pending Leave Requests</span>
                <Calendar className="w-4 h-4 text-amber-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-amber-600">{pendingLeaves.length}</span>
                <span className="text-xs text-neutral-500">awaiting review</span>
              </div>
            </CardContent>
          </Card>
        )}

        {canReports && (
          <Card className="border-neutral-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-500">Pending Reports</span>
                <FileText className="w-4 h-4 text-blue-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-blue-600">{pendingReports.length}</span>
                <span className="text-xs text-neutral-500">to review</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Main Administrative Views Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Active Tasks & Projects within scope */}
        <div className="lg:col-span-2 space-y-6">
          {canTasks && (
            <Card className="border-neutral-200">
              <CardHeader className="p-4 pb-3 border-b border-neutral-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-neutral-900">Active Workload & Tasks</CardTitle>
                  <CardDescription className="text-xs text-neutral-500">Tasks assigned in your administrative purview</CardDescription>
                </div>
                <Link href="/admin-view/tasks">
                  <Button variant="ghost" size="sm" className="text-xs text-neutral-600 hover:text-black">
                    View All →
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                {activeTasks.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      title="No Active Tasks"
                      description="There are currently no open tasks assigned within your administrative scope."
                    />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-neutral-100 bg-neutral-50 text-[11px]">
                          <TableHead className="py-2 font-bold text-neutral-700">Task</TableHead>
                          <TableHead className="py-2 font-bold text-neutral-700">Assignee</TableHead>
                          <TableHead className="py-2 font-bold text-neutral-700">Status</TableHead>
                          <TableHead className="py-2 font-bold text-neutral-700">Time Tracked</TableHead>
                          <TableHead className="py-2 font-bold text-neutral-700 text-right">Due Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeTasks.slice(0, 6).map((t: any) => {
                          const isLive = t.activeTimer || (t.timers && Array.isArray(t.timers) && t.timers.some((tm: any) => tm.isActive));
                          const liveSec = calculateLiveTaskDuration(t, currentTimeMs);
                          return (
                            <TableRow key={t.id} className="border-b border-neutral-100 hover:bg-neutral-50/70 text-xs">
                              <TableCell className="py-2.5 font-semibold text-neutral-900 max-w-[200px] truncate">
                                <div>{t.title}</div>
                                {t.project && (
                                  <span className="text-[10px] text-neutral-400 font-normal">
                                    {t.project.name}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="py-2.5 text-neutral-600">
                                {t.employee?.displayName || t.employee?.firstName || 'Unassigned'}
                              </TableCell>
                              <TableCell className="py-2.5">
                                <Badge
                                  variant={
                                    t.status === 'IN_PROGRESS'
                                      ? 'info'
                                      : t.status === 'PAUSED'
                                      ? 'warning'
                                      : 'secondary'
                                  }
                                  className="text-[10px] font-semibold"
                                >
                                  {t.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-2.5 font-mono">
                                <div className="flex items-center gap-1.5">
                                  {isLive ? (
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                                  ) : (
                                    <Clock className="w-3 h-3 text-neutral-400" />
                                  )}
                                  <span className={isLive ? 'text-emerald-700 font-bold' : 'text-neutral-600'}>
                                    {formatSecondsToTime(liveSec)}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="py-2.5 text-right text-neutral-500 text-[11px]">
                                {t.dueDate ? formatDate(t.dueDate) : '—'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {canProjects && (
            <Card className="border-neutral-200">
              <CardHeader className="p-4 pb-3 border-b border-neutral-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-neutral-900">Project Portfolio</CardTitle>
                  <CardDescription className="text-xs text-neutral-500">Projects under your management</CardDescription>
                </div>
                <Link href="/admin-view/projects">
                  <Button variant="ghost" size="sm" className="text-xs text-neutral-600 hover:text-black">
                    View All →
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {projects.length === 0 ? (
                  <EmptyState
                    title="No Projects"
                    description="You are not currently assigned to manage any projects."
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {projects.slice(0, 4).map((p) => (
                      <div key={p.id} className="p-3 rounded-md border border-neutral-200 bg-neutral-50/50 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-xs text-neutral-900 truncate max-w-[150px]">{p.name}</span>
                            <Badge variant={p.status === 'COMPLETED' ? 'success' : 'info'} className="text-[9px]">
                              {p.status}
                            </Badge>
                          </div>
                          {p.description && (
                            <p className="text-[11px] text-neutral-500 line-clamp-2">{p.description}</p>
                          )}
                        </div>
                        <div className="mt-3 pt-2 border-t border-neutral-200 flex items-center justify-between text-[10px] text-neutral-500">
                          <span>{p.members?.length || 0} Members</span>
                          <span>{p.totalTasks || 0} Tasks ({p.completedTasks || 0} done)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Scope & Quick Overview */}
        <div className="space-y-6">
          {/* Scope Boundaries Information Card */}
          <Card className="border-neutral-200 bg-neutral-50/50">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-neutral-600" />
                Administrative Scope
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-1 space-y-2 text-xs">
              <p className="text-neutral-600">
                You have administrative access strictly for your assigned projects, team members, and departments.
              </p>
              <div className="pt-2 border-t border-neutral-200 space-y-1 text-[11px]">
                <div className="flex justify-between text-neutral-600">
                  <span>Project Scope:</span>
                  <span className="font-semibold text-neutral-900">
                    {user?.scope?.projects?.length ? `${user.scope.projects.length} Projects` : 'Assigned / Lead Projects'}
                  </span>
                </div>
                <div className="flex justify-between text-neutral-600">
                  <span>Department Scope:</span>
                  <span className="font-semibold text-neutral-900">
                    {user?.scope?.departments?.length ? `${user.scope.departments.length} Depts` : 'Primary Department'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pending Reviews or Team Overview */}
          {canTeam && (
            <Card className="border-neutral-200">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-neutral-700">Team Allocation</CardTitle>
                <Link href="/admin-view/team">
                  <Button variant="ghost" size="sm" className="text-[11px] h-7 px-2 text-neutral-600">
                    Manage →
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="p-4 pt-1 text-xs text-neutral-600">
                <p>Collaborate with and oversee members assigned to your projects and task workflows.</p>
              </CardContent>
            </Card>
          )}

          {canLeave && pendingLeaves.length > 0 && (
            <Card className="border-neutral-200 border-amber-200 bg-amber-50/30">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs font-bold text-amber-900">Pending Leave Approvals ({pendingLeaves.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1 text-xs text-neutral-600">
                <p className="mb-2">There are leave requests from your team waiting for your review.</p>
                <Link href="/admin-view/leave">
                  <Button size="sm" variant="outline" className="w-full text-xs bg-white text-amber-900 border-amber-300 hover:bg-amber-50">
                    Review Leaves
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
