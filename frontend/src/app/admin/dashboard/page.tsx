'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { attendanceApi, tasksApi } from '@/lib/api';
import { LiveEmployeeActivity, AdminDashboardMetrics, Task } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatSecondsToTime, formatTime, formatDate } from '@/lib/utils';
import {
  Users,
  Briefcase,
  Clock,
  Calendar,
  FileText,
  Search,
  Building2,
  Home,
  CheckCircle,
  AlertCircle,
  Play,
  ArrowRight,
  ArrowUpRight,
  UserX,
  Laptop,
  CalendarOff,
  RefreshCw,
  ExternalLink,
  Eye,
} from 'lucide-react';

type KPIFilterType = 'ALL' | 'WORKING' | 'WFH' | 'LEAVE' | 'NOT_MARKED' | 'TASKS';

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [activities, setActivities] = useState<LiveEmployeeActivity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeFilter, setActiveFilter] = useState<KPIFilterType>('ALL');
  const [search, setSearch] = useState<string>('');
  const [modalKPI, setModalKPI] = useState<KPIFilterType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      const [m, live, taskList] = await Promise.all([
        attendanceApi.getMetrics(),
        attendanceApi.getLiveOverview(),
        tasksApi.list({ adminView: true }).catch(() => []),
      ]);
      setMetrics(m);
      setActivities(Array.isArray(live) ? live : []);
      // Filter active tasks (TODO, IN_PROGRESS, PAUSED)
      const activeList = Array.isArray(taskList)
        ? taskList.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS' || t.status === 'PAUSED')
        : [];
      setTasks(activeList);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load admin dashboard data:', err);
      setError(err?.message || 'Failed to load administrative overview. Please retry.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    // Refresh live activity every 10 seconds
    const interval = setInterval(() => loadDashboard(false), 10000);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  // Live ticking milliseconds for running timers
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTimeMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Helper: Live elapsed duration calculation for active tasks (from task.timers)
  const calculateLiveTaskDuration = useCallback((task: any, nowMs: number): number => {
    const timers = task.timers || [];
    if (!timers || timers.length === 0) return task.totalDurationSeconds || 0;
    const activeT = timers.find((t: any) => t.isActive ?? t.is_active);
    if (!activeT) return task.totalDurationSeconds || 0;

    const priorClosed = timers
      .filter((t: any) => !(t.isActive ?? t.is_active))
      .reduce((acc: number, t: any) => acc + (t.durationSeconds ?? t.duration_seconds ?? 0), 0);
    const startedMs = new Date(activeT.startedAt || activeT.started_at).getTime();
    const runningSec = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
    return priorClosed + runningSec;
  }, []);

  // Helper: Live elapsed calculation for employee currentTask
  const calculateEmployeeLiveTaskElapsed = useCallback((currentTask: any, nowMs: number): number => {
    if (!currentTask) return 0;
    if (!currentTask.isActive || !currentTask.timerStartedAt) {
      return currentTask.totalDurationSeconds ?? currentTask.elapsedSeconds ?? 0;
    }
    const prior = currentTask.priorClosedDurationSeconds ?? 0;
    const startedMs = new Date(currentTask.timerStartedAt).getTime();
    const runningSec = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
    return prior + runningSec;
  }, []);

  // Filtered employees for the main live monitor based on activeFilter
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      const matchesSearch =
        act.name.toLowerCase().includes(search.toLowerCase()) ||
        act.employeeCode.toLowerCase().includes(search.toLowerCase()) ||
        (act.currentTask?.title && act.currentTask.title.toLowerCase().includes(search.toLowerCase())) ||
        (act.departmentName && act.departmentName.toLowerCase().includes(search.toLowerCase()));

      if (!matchesSearch) return false;

      if (activeFilter === 'WORKING') return Boolean(act.isCheckedIn);
      if (activeFilter === 'WFH') return act.workMode === 'WFH' && Boolean(act.checkInAt);
      if (activeFilter === 'LEAVE') return Boolean(act.isOnLeave || act.attendanceStatus === 'ON_LEAVE');
      if (activeFilter === 'NOT_MARKED') return act.attendanceStatus === 'NOT_MARKED' || act.attendanceStatus === 'ABSENT';

      return true;
    });
  }, [activities, activeFilter, search]);

  // Filtered tasks for TASKS view
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchesSearch =
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        (t.project?.name && t.project.name.toLowerCase().includes(search.toLowerCase())) ||
        (t.employee?.displayName && t.employee.displayName.toLowerCase().includes(search.toLowerCase())) ||
        (t.employee?.employeeCode && t.employee.employeeCode.toLowerCase().includes(search.toLowerCase()));
      return matchesSearch;
    });
  }, [tasks, search]);

  // Helper to open modal details for a specific KPI
  const handleOpenModal = (kpi: KPIFilterType) => {
    setModalKPI(kpi);
  };

  if (error && !metrics) {
    return (
      <div className="p-8 text-center bg-white border border-neutral-200 rounded-lg max-w-lg mx-auto my-12 shadow-sm space-y-4">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-neutral-900">Dashboard Failed to Load</h2>
        <p className="text-xs text-neutral-500">{error}</p>
        <Button onClick={() => loadDashboard(true)} size="sm" className="gap-2">
          <RefreshCw className="w-4 h-4" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Admin Operations Center</h1>
            {isRefreshing && <RefreshCw className="w-3.5 h-3.5 animate-spin text-neutral-400" />}
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Authoritative real-time staff status, attendance intelligence, and active workload tracking.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadDashboard(true)}
            disabled={isRefreshing}
            className="text-xs gap-1.5"
            title="Refresh dashboard data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Link href="/admin/employees">
            <Button size="sm" className="text-xs gap-1.5 shadow-sm">
              <Users className="w-3.5 h-3.5" /> Manage Employees
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Metrics Grid - All 6 cards are clickable navigation/filter controls */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 1. TOTAL STAFF */}
        <button
          type="button"
          onClick={() => setActiveFilter('ALL')}
          aria-label={`View all ${metrics?.totalEmployees || 0} active staff`}
          className={`text-left p-4 rounded-lg border transition-all relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-black ${
            activeFilter === 'ALL'
              ? 'bg-neutral-900 text-white border-neutral-900 shadow-md ring-1 ring-neutral-900'
              : 'bg-white hover:bg-neutral-50/80 border-neutral-200 hover:border-neutral-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider ${
                activeFilter === 'ALL' ? 'text-neutral-300' : 'text-neutral-500'
              }`}
            >
              Total Staff
            </span>
            <Users
              className={`w-3.5 h-3.5 ${
                activeFilter === 'ALL' ? 'text-neutral-300' : 'text-neutral-400 group-hover:text-black'
              }`}
            />
          </div>
          <span
            className={`text-2xl font-black block mt-1.5 tracking-tight ${
              activeFilter === 'ALL' ? 'text-white' : 'text-neutral-900'
            }`}
          >
            {metrics?.totalEmployees || 0}
          </span>
          <div className="mt-2 flex items-center justify-between text-[10px] font-medium">
            <span className={activeFilter === 'ALL' ? 'text-neutral-300' : 'text-neutral-400'}>
              Active operational
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                handleOpenModal('ALL');
              }}
              title="Open full table breakdown"
              className={`inline-flex items-center gap-0.5 hover:underline ${
                activeFilter === 'ALL' ? 'text-neutral-200' : 'text-neutral-600'
              }`}
            >
              Details <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
        </button>

        {/* 2. CURRENTLY WORKING */}
        <button
          type="button"
          onClick={() => setActiveFilter('WORKING')}
          aria-label={`View ${metrics?.currentlyWorking || 0} currently working staff`}
          className={`text-left p-4 rounded-lg border transition-all relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
            activeFilter === 'WORKING'
              ? 'bg-emerald-900 text-white border-emerald-900 shadow-md ring-1 ring-emerald-900'
              : 'bg-white hover:bg-emerald-50/30 border-neutral-200 hover:border-emerald-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider ${
                activeFilter === 'WORKING' ? 'text-emerald-200' : 'text-emerald-700'
              }`}
            >
              Currently Working
            </span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
          <span
            className={`text-2xl font-black block mt-1.5 tracking-tight ${
              activeFilter === 'WORKING' ? 'text-emerald-100' : 'text-emerald-700'
            }`}
          >
            {metrics?.currentlyWorking || 0}
          </span>
          <div className="mt-2 flex items-center justify-between text-[10px] font-medium">
            <span className={activeFilter === 'WORKING' ? 'text-emerald-200' : 'text-neutral-400'}>
              Active check-ins
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                handleOpenModal('WORKING');
              }}
              title="Open full table breakdown"
              className={`inline-flex items-center gap-0.5 hover:underline ${
                activeFilter === 'WORKING' ? 'text-emerald-200' : 'text-emerald-700'
              }`}
            >
              Details <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
        </button>

        {/* 3. WORK FROM HOME */}
        <button
          type="button"
          onClick={() => setActiveFilter('WFH')}
          aria-label={`View ${metrics?.wfhCount || 0} work from home staff`}
          className={`text-left p-4 rounded-lg border transition-all relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-black ${
            activeFilter === 'WFH'
              ? 'bg-neutral-900 text-white border-neutral-900 shadow-md ring-1 ring-neutral-900'
              : 'bg-white hover:bg-neutral-50/80 border-neutral-200 hover:border-neutral-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider ${
                activeFilter === 'WFH' ? 'text-neutral-300' : 'text-neutral-600'
              }`}
            >
              Work From Home
            </span>
            <Home
              className={`w-3.5 h-3.5 ${
                activeFilter === 'WFH' ? 'text-neutral-300' : 'text-neutral-400 group-hover:text-black'
              }`}
            />
          </div>
          <span
            className={`text-2xl font-black block mt-1.5 tracking-tight ${
              activeFilter === 'WFH' ? 'text-white' : 'text-neutral-900'
            }`}
          >
            {metrics?.wfhCount || 0}
          </span>
          <div className="mt-2 flex items-center justify-between text-[10px] font-medium">
            <span className={activeFilter === 'WFH' ? 'text-neutral-300' : 'text-neutral-400'}>
              Marked WFH today
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                handleOpenModal('WFH');
              }}
              title="Open full table breakdown"
              className={`inline-flex items-center gap-0.5 hover:underline ${
                activeFilter === 'WFH' ? 'text-neutral-200' : 'text-neutral-600'
              }`}
            >
              Details <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
        </button>

        {/* 4. ON LEAVE */}
        <button
          type="button"
          onClick={() => setActiveFilter('LEAVE')}
          aria-label={`View ${metrics?.onLeaveCount || 0} employees on leave`}
          className={`text-left p-4 rounded-lg border transition-all relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
            activeFilter === 'LEAVE'
              ? 'bg-amber-900 text-white border-amber-900 shadow-md ring-1 ring-amber-900'
              : 'bg-white hover:bg-amber-50/30 border-neutral-200 hover:border-amber-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider ${
                activeFilter === 'LEAVE' ? 'text-amber-200' : 'text-amber-700'
              }`}
            >
              On Leave
            </span>
            <CalendarOff
              className={`w-3.5 h-3.5 ${
                activeFilter === 'LEAVE' ? 'text-amber-200' : 'text-amber-500 group-hover:text-amber-700'
              }`}
            />
          </div>
          <span
            className={`text-2xl font-black block mt-1.5 tracking-tight ${
              activeFilter === 'LEAVE' ? 'text-amber-100' : 'text-amber-700'
            }`}
          >
            {metrics?.onLeaveCount || 0}
          </span>
          <div className="mt-2 flex items-center justify-between text-[10px] font-medium">
            <span className={activeFilter === 'LEAVE' ? 'text-amber-200' : 'text-neutral-400'}>
              Approved today
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                handleOpenModal('LEAVE');
              }}
              title="Open full table breakdown"
              className={`inline-flex items-center gap-0.5 hover:underline ${
                activeFilter === 'LEAVE' ? 'text-amber-200' : 'text-amber-700'
              }`}
            >
              Details <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
        </button>

        {/* 5. UNMARKED / ABSENT */}
        <button
          type="button"
          onClick={() => setActiveFilter('NOT_MARKED')}
          aria-label={`View ${metrics?.absentOrNotMarkedCount || 0} unmarked or absent staff`}
          className={`text-left p-4 rounded-lg border transition-all relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
            activeFilter === 'NOT_MARKED'
              ? 'bg-rose-900 text-white border-rose-900 shadow-md ring-1 ring-rose-900'
              : 'bg-white hover:bg-rose-50/30 border-neutral-200 hover:border-rose-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider ${
                activeFilter === 'NOT_MARKED' ? 'text-rose-200' : 'text-rose-700'
              }`}
            >
              Unmarked / Absent
            </span>
            <UserX
              className={`w-3.5 h-3.5 ${
                activeFilter === 'NOT_MARKED' ? 'text-rose-200' : 'text-rose-500 group-hover:text-rose-700'
              }`}
            />
          </div>
          <span
            className={`text-2xl font-black block mt-1.5 tracking-tight ${
              activeFilter === 'NOT_MARKED' ? 'text-rose-100' : 'text-rose-700'
            }`}
          >
            {metrics?.absentOrNotMarkedCount || 0}
          </span>
          <div className="mt-2 flex items-center justify-between text-[10px] font-medium">
            <span className={activeFilter === 'NOT_MARKED' ? 'text-rose-200' : 'text-neutral-400'}>
              Expected, no check-in
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                handleOpenModal('NOT_MARKED');
              }}
              title="Open full table breakdown"
              className={`inline-flex items-center gap-0.5 hover:underline ${
                activeFilter === 'NOT_MARKED' ? 'text-rose-200' : 'text-rose-700'
              }`}
            >
              Details <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
        </button>

        {/* 6. ACTIVE TASKS */}
        <button
          type="button"
          onClick={() => setActiveFilter('TASKS')}
          aria-label={`View ${metrics?.activeTasksCount || 0} active tasks`}
          className={`text-left p-4 rounded-lg border transition-all relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-black ${
            activeFilter === 'TASKS'
              ? 'bg-neutral-900 text-white border-neutral-900 shadow-md ring-1 ring-neutral-900'
              : 'bg-white hover:bg-neutral-50/80 border-neutral-200 hover:border-neutral-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider ${
                activeFilter === 'TASKS' ? 'text-neutral-300' : 'text-neutral-600'
              }`}
            >
              Active Tasks
            </span>
            <Briefcase
              className={`w-3.5 h-3.5 ${
                activeFilter === 'TASKS' ? 'text-neutral-300' : 'text-neutral-400 group-hover:text-black'
              }`}
            />
          </div>
          <span
            className={`text-2xl font-black block mt-1.5 tracking-tight ${
              activeFilter === 'TASKS' ? 'text-white' : 'text-neutral-900'
            }`}
          >
            {metrics?.activeTasksCount || 0}
          </span>
          <div className="mt-2 flex items-center justify-between text-[10px] font-medium">
            <span className={activeFilter === 'TASKS' ? 'text-neutral-300' : 'text-neutral-400'}>
              Todo / in progress
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                handleOpenModal('TASKS');
              }}
              title="Open full table breakdown"
              className={`inline-flex items-center gap-0.5 hover:underline ${
                activeFilter === 'TASKS' ? 'text-neutral-200' : 'text-neutral-600'
              }`}
            >
              Details <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
        </button>
      </div>

      {/* LIVE WORKSPACE & OPERATIONAL MONITOR */}
      <Card className="border-neutral-200 shadow-sm">
        <CardHeader className="pb-3 border-b border-neutral-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <CardTitle className="text-base font-bold">
                  {activeFilter === 'TASKS'
                    ? 'Active Organizational Tasks & Timers'
                    : 'Live Staff Operations & Attendance Monitor'}
                </CardTitle>
              </div>
              <CardDescription>
                {activeFilter === 'ALL' && `Showing all ${metrics?.totalEmployees || activities.length} active staff members.`}
                {activeFilter === 'WORKING' &&
                  `Showing ${metrics?.currentlyWorking || 0} staff currently checked-in and working.`}
                {activeFilter === 'WFH' &&
                  `Showing ${metrics?.wfhCount || 0} staff marked for Work From Home today.`}
                {activeFilter === 'LEAVE' &&
                  `Showing ${metrics?.onLeaveCount || 0} staff on approved leave today.`}
                {activeFilter === 'NOT_MARKED' &&
                  `Showing ${metrics?.absentOrNotMarkedCount || 0} expected staff with no attendance marked.`}
                {activeFilter === 'TASKS' &&
                  `Showing ${metrics?.activeTasksCount || tasks.length} active tasks across all projects.`}
              </CardDescription>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'ALL', label: `All Staff (${metrics?.totalEmployees || activities.length})` },
                { id: 'WORKING', label: `Working (${metrics?.currentlyWorking || 0})` },
                { id: 'WFH', label: `WFH (${metrics?.wfhCount || 0})` },
                { id: 'LEAVE', label: `On Leave (${metrics?.onLeaveCount || 0})` },
                { id: 'NOT_MARKED', label: `Unmarked (${metrics?.absentOrNotMarkedCount || 0})` },
                { id: 'TASKS', label: `Tasks (${metrics?.activeTasksCount || tasks.length})` },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id as KPIFilterType)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    activeFilter === f.id
                      ? 'bg-black text-white shadow-sm'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-400" />
              <Input
                placeholder={
                  activeFilter === 'TASKS'
                    ? 'Search task title, project, assignee...'
                    : 'Search employee name, code, department...'
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenModal(activeFilter)}
              className="text-xs gap-1.5 shrink-0"
            >
              <Eye className="w-3.5 h-3.5" /> Full Breakdown Table
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Active Tasks View */}
          {activeFilter === 'TASKS' ? (
            <div className="divide-y divide-neutral-100">
              {filteredTasks.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-500">
                  No active tasks matching your filter.
                </div>
              ) : (
                filteredTasks.map((task: any) => {
                  const isRunning = Boolean(task.activeTimer?.isActive || (task.timers && task.timers.some((t: any) => t.isActive ?? t.is_active)));
                  const liveDuration = calculateLiveTaskDuration(task, currentTimeMs);

                  return (
                    <div
                      key={task.id}
                      className="p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-neutral-50/50 transition-colors"
                    >
                      {/* Task Info */}
                      <div className="space-y-1 min-w-[260px] flex-1">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/tasks`}
                            className="text-sm font-bold text-neutral-900 hover:underline"
                          >
                            {task.title}
                          </Link>
                          {task.project?.name && (
                            <span className="text-[10px] font-semibold text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded">
                              {task.project.name}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-neutral-500">
                          <span>Assignee: <strong className="text-neutral-700">{task.employee?.displayName || 'Unassigned'}</strong></span>
                          <span>•</span>
                          <span>Priority: <strong className="text-neutral-700">{task.priority}</strong></span>
                        </div>
                      </div>

                      {/* Status & Timer */}
                      <div className="flex items-center gap-3 min-w-[180px]">
                        <Badge
                          variant={
                            task.status === 'IN_PROGRESS'
                              ? 'default'
                              : task.status === 'PAUSED'
                              ? 'warning'
                              : 'secondary'
                          }
                          className="text-xs uppercase"
                        >
                          {task.status}
                        </Badge>
                        {isRunning && (
                          <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                            <Clock className="w-3.5 h-3.5" />
                            Running
                          </div>
                        )}
                      </div>

                      {/* Worked Time */}
                      <div className="text-right min-w-[120px]">
                        <span className="text-[10px] uppercase font-bold text-neutral-400 block">Worked</span>
                        <span className="text-xs font-mono font-bold text-neutral-900">
                          {formatSecondsToTime(liveDuration)}
                        </span>
                      </div>

                      {/* Action Link */}
                      <div className="shrink-0">
                        <Link href="/admin/tasks">
                          <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                            View <ArrowRight className="w-3 h-3" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* Employee Activity View */
            <div className="divide-y divide-neutral-100">
              {isLoading && activities.length === 0 ? (
                <div className="space-y-4 p-5 animate-pulse">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center justify-between gap-4 py-2 border-b border-neutral-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-neutral-200"></div>
                        <div className="space-y-1.5">
                          <div className="h-4 bg-neutral-200 rounded w-32"></div>
                          <div className="h-3 bg-neutral-100 rounded w-24"></div>
                        </div>
                      </div>
                      <div className="h-6 bg-neutral-100 rounded w-28"></div>
                      <div className="h-6 bg-neutral-100 rounded w-36"></div>
                    </div>
                  ))}
                </div>
              ) : filteredActivities.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-500">
                  No matching employees found for this status.
                </div>
              ) : (
                filteredActivities.map((act) => {
                  const isCheckedIn = Boolean(act.isCheckedIn);
                  const isMarked = act.attendanceStatus !== 'NOT_MARKED' && act.attendanceStatus !== 'ABSENT';
                  const hasRunningTimer = Boolean(act.currentTask?.isActive);
                  const currentElapsed = calculateEmployeeLiveTaskElapsed(act.currentTask, currentTimeMs);

                  return (
                    <div
                      key={act.employeeId}
                      className="p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-neutral-50/50 transition-colors"
                    >
                      {/* Employee Info */}
                      <div className="flex items-center gap-3 min-w-[240px]">
                        <div className="w-10 h-10 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
                          {(act.displayName || act.name || 'E').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/admin/employees/${act.employeeId}`}
                              className="text-sm font-bold text-neutral-900 hover:underline"
                            >
                              {act.name || act.displayName || 'Employee'}
                            </Link>
                            <span className="text-[10px] font-mono font-semibold text-neutral-400">
                              {act.employeeCode || ''}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-500">
                            {act.designationName || 'Staff Member'}
                            {act.departmentName && ` • ${act.departmentName}`}
                          </p>
                        </div>
                      </div>

                      {/* Attendance & Check-In Details */}
                      <div className="flex flex-col gap-1 min-w-[180px]">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              isCheckedIn
                                ? 'success'
                                : act.attendanceStatus === 'ON_LEAVE'
                                ? 'warning'
                                : isMarked
                                ? 'secondary'
                                : 'danger'
                            }
                            className="text-xs"
                          >
                            ● {act.attendanceStatus === 'NOT_MARKED' ? 'Unmarked / Absent' : act.attendanceStatus}
                          </Badge>
                          {act.workMode && (
                            <span className="text-xs font-semibold text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded">
                              {act.workMode}
                            </span>
                          )}
                        </div>

                        {/* Timing Details */}
                        {act.checkInAt ? (
                          <div className="text-[11px] text-neutral-500 flex items-center gap-1.5">
                            <span>In: <strong className="text-neutral-700">{formatTime(act.checkInAt)}</strong></span>
                            {act.checkOutAt && (
                              <span>• Out: <strong className="text-neutral-700">{formatTime(act.checkOutAt)}</strong></span>
                            )}
                          </div>
                        ) : act.isOnLeave ? (
                          <span className="text-[11px] text-amber-700 font-medium">
                            {act.leaveDetails?.leaveType || 'Approved Leave'}
                          </span>
                        ) : (
                          <span className="text-[11px] text-neutral-400">Expected: 09:00 AM - 06:00 PM</span>
                        )}
                      </div>

                      {/* Current Active Task & Timer */}
                      <div className="flex-1 min-w-[220px] space-y-1">
                        {act.currentTask ? (
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] uppercase font-bold text-neutral-400">Task:</span>
                              <span className="text-xs font-bold text-neutral-900 truncate max-w-xs">
                                {act.currentTask.title}
                              </span>
                            </div>
                            {hasRunningTimer && (
                              <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-neutral-900 mt-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                                <Clock className="w-3.5 h-3.5 text-neutral-400" />
                                {formatSecondsToTime(currentElapsed)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-400 italic">No task currently active</span>
                        )}
                      </div>

                      {/* Quick Profile Link */}
                      <div className="shrink-0">
                        <Link href={`/admin/employees/${act.employeeId}`}>
                          <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                            Profile <ArrowRight className="w-3 h-3" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* FULL BREAKDOWN MODAL DIALOG FOR DRILL-DOWN */}
      <Dialog
        isOpen={modalKPI !== null}
        onClose={() => setModalKPI(null)}
        title={
          modalKPI === 'ALL'
            ? `Total Active Staff Breakdown (${activities.length})`
            : modalKPI === 'WORKING'
            ? `Currently Working Employees (${activities.filter((a) => a.isCheckedIn).length})`
            : modalKPI === 'WFH'
            ? `Work From Home Employees (${activities.filter((a) => a.workMode === 'WFH' && a.checkInAt).length})`
            : modalKPI === 'LEAVE'
            ? `Employees On Approved Leave (${activities.filter((a) => a.isOnLeave || a.attendanceStatus === 'ON_LEAVE').length})`
            : modalKPI === 'NOT_MARKED'
            ? `Unmarked / Absent Employees (${activities.filter((a) => a.attendanceStatus === 'NOT_MARKED' || a.attendanceStatus === 'ABSENT').length})`
            : `Active Tasks Breakdown (${tasks.length})`
        }
        description="Detailed administrative intelligence breakdown derived from authoritative backend state."
        className="max-w-4xl max-h-[85vh] overflow-y-auto"
      >
        <div className="space-y-4">
          {/* Active Tasks Modal Table */}
          {modalKPI === 'TASKS' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task Title</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Worked Time</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-6 text-xs text-neutral-500">
                      No active tasks currently found.
                    </TableCell>
                  </TableRow>
                ) : (
                  tasks.map((t: any) => {
                    const isRunning = Boolean(t.activeTimer?.isActive || (t.timers && t.timers.some((timer: any) => timer.isActive ?? timer.is_active)));
                    const liveDuration = calculateLiveTaskDuration(t, currentTimeMs);

                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-bold text-neutral-900">{t.title}</TableCell>
                        <TableCell>{t.project?.name || '—'}</TableCell>
                        <TableCell>{t.employee?.displayName || t.employee?.employeeCode || 'Unassigned'}</TableCell>
                        <TableCell>
                          <Badge variant={t.status === 'IN_PROGRESS' ? 'default' : 'secondary'} className="text-[10px]">
                            {t.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {t.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <span className={isRunning ? 'text-emerald-700 font-bold' : ''}>
                            {formatSecondsToTime(liveDuration)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href="/admin/tasks" onClick={() => setModalKPI(null)}>
                            <Button size="sm" variant="outline" className="h-7 text-xs">
                              View <ExternalLink className="w-3 h-3 ml-1" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          ) : (
            /* Staff Modal Table */
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department / Role</TableHead>
                  <TableHead>Today's Status</TableHead>
                  <TableHead>Work Mode</TableHead>
                  <TableHead>Check-In / Details</TableHead>
                  <TableHead>Current Task</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities
                  .filter((act) => {
                    if (modalKPI === 'WORKING') return Boolean(act.isCheckedIn);
                    if (modalKPI === 'WFH') return act.workMode === 'WFH' && Boolean(act.checkInAt);
                    if (modalKPI === 'LEAVE') return Boolean(act.isOnLeave || act.attendanceStatus === 'ON_LEAVE');
                    if (modalKPI === 'NOT_MARKED') return act.attendanceStatus === 'NOT_MARKED' || act.attendanceStatus === 'ABSENT';
                    return true;
                  })
                  .map((act) => (
                    <TableRow key={act.employeeId}>
                      <TableCell>
                        <div className="font-bold text-neutral-900">{act.displayName || act.name}</div>
                        <div className="text-[10px] font-mono text-neutral-400">{act.employeeCode}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-neutral-800">{act.designationName || '—'}</div>
                        <div className="text-[10px] text-neutral-500">{act.departmentName || '—'}</div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            act.isCheckedIn
                              ? 'success'
                              : act.attendanceStatus === 'ON_LEAVE'
                              ? 'warning'
                              : act.attendanceStatus !== 'NOT_MARKED' && act.attendanceStatus !== 'ABSENT'
                              ? 'secondary'
                              : 'danger'
                          }
                          className="text-[10px]"
                        >
                          {act.attendanceStatus === 'NOT_MARKED' ? 'Unmarked' : act.attendanceStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {act.workMode ? (
                          <span className="text-xs font-semibold text-neutral-700 bg-neutral-100 px-2 py-0.5 rounded">
                            {act.workMode}
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-neutral-600">
                        {act.checkInAt ? (
                          <div>
                            <div>In: {formatTime(act.checkInAt)}</div>
                            {act.checkOutAt && <div className="text-neutral-400">Out: {formatTime(act.checkOutAt)}</div>}
                          </div>
                        ) : act.isOnLeave ? (
                          <div className="text-amber-700 font-medium">
                            {act.leaveDetails?.leaveType || 'Approved Leave'}
                          </div>
                        ) : (
                          <div className="text-neutral-400">Not Checked In</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-neutral-800 max-w-[200px]">
                        {act.currentTask ? (
                          <div>
                            <span className="font-semibold truncate block">{act.currentTask.title}</span>
                            {act.currentTask.isActive && (
                              <span className="font-mono text-[10px] text-emerald-700 font-bold flex items-center gap-1 mt-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                                {formatSecondsToTime(calculateEmployeeLiveTaskElapsed(act.currentTask, currentTimeMs))}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-neutral-400 italic">None</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/admin/employees/${act.employeeId}`} onClick={() => setModalKPI(null)}>
                          <Button size="sm" variant="outline" className="h-7 text-xs">
                            Profile <ExternalLink className="w-3 h-3 ml-1" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}

          <div className="flex justify-end pt-2">
            <Button size="sm" variant="outline" onClick={() => setModalKPI(null)}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
