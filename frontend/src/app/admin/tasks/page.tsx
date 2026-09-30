'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { tasksApi, employeesApi, projectsApi } from '@/lib/api';
import { Task, Employee, TaskPriority, Project, ProjectStatus, ProjectRole } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatTime, formatSecondsToTime } from '@/lib/utils';
import {
  Briefcase,
  Plus,
  Search,
  Clock,
  CheckCircle2,
  Timer,
  Users,
  FolderPlus,
  Layers,
  ArrowRight,
  TrendingUp,
  MessageSquare,
  AtSign,
  UserPlus,
} from 'lucide-react';

const PROJECT_ROLES: { value: ProjectRole; label: string }[] = [
  { value: 'LEAD', label: 'Project Lead' },
  { value: 'DEVELOPER', label: 'Developer' },
  { value: 'DESIGNER', label: 'Designer' },
  { value: 'TESTER', label: 'Tester / QA' },
  { value: 'MANAGER', label: 'Project Manager' },
  { value: 'DEVOPS', label: 'DevOps / Infra' },
  { value: 'CONTRIBUTOR', label: 'Contributor' },
  { value: 'OTHER', label: 'Other' },
];

const PERIOD_OPTIONS = [
  { value: 'ALL_TIME', label: 'All Time' },
  { value: 'TODAY', label: 'Today' },
  { value: 'YESTERDAY', label: 'Yesterday' },
  { value: 'THIS_WEEK', label: 'This Week' },
  { value: 'LAST_WEEK', label: 'Last Week' },
  { value: 'THIS_MONTH', label: 'This Month' },
  { value: 'LAST_MONTH', label: 'Last Month' },
  { value: 'CUSTOM', label: 'Custom Range' },
];

export default function AdminWorksPage() {
  const [activeTab, setActiveTab] = useState('TASKS');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [selectedEmp, setSelectedEmp] = useState('');
  const [period, setPeriod] = useState<string>('ALL_TIME');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [appliedCustomFrom, setAppliedCustomFrom] = useState<string>('');
  const [appliedCustomTo, setAppliedCustomTo] = useState<string>('');
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(Date.now());
  const [isLoading, setIsLoading] = useState(true);

  // Sorting state (Default: Created Date DESC)
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // Modals
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);

  // Comments / Mentions Modal
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [selectedMentionId, setSelectedMentionId] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Assign Task Form state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [targetEmpId, setTargetEmpId] = useState('');
  const [taskProjId, setTaskProjId] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('MEDIUM');
  const [taskAssignedDate, setTaskAssignedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskEstMinutes, setTaskEstMinutes] = useState('');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  // Create Project Form state with Team Members
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [projectLeadId, setProjectLeadId] = useState('');
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>('IN_PROGRESS');
  const [projectAssignedDate, setProjectAssignedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [projectDueDate, setProjectDueDate] = useState('');
  const [selectedTeamMemberIds, setSelectedTeamMemberIds] = useState<{ employeeId: string; projectRole: ProjectRole }[]>([]);
  const [isSubmittingProject, setIsSubmittingProject] = useState(false);

  // 1-second continuous tick for live running timers
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const sumParams: Record<string, any> = {};
      if (selectedEmp && selectedEmp !== 'undefined' && selectedEmp !== 'null' && selectedEmp.trim() !== '') {
        sumParams.employeeId = selectedEmp;
      }
      if (period && period !== 'ALL_TIME') {
        sumParams.period = period;
        if (period === 'CUSTOM' && appliedCustomFrom && appliedCustomTo) {
          sumParams.startDate = appliedCustomFrom;
          sumParams.endDate = appliedCustomTo;
        }
      }

      const tasksPromise = tasksApi.list({
        adminView: true,
        search: search || undefined,
        ...(selectedEmp ? { employeeId: selectedEmp } : {}),
        sortBy,
        sortOrder,
      }).catch((e) => {
        console.error('[AdminWorksPage] tasksApi.list failed:', e);
        return [];
      });

      const empsPromise = employeesApi.listAssignable().catch(() => employeesApi.list());
      const sumPromise = tasksApi.getSummary(sumParams).catch(() => null);
      const projPromise = projectsApi.list({
        adminView: true,
        search: search || undefined,
        ...(selectedEmp ? { employeeId: selectedEmp } : {}),
      }).catch(() => []);

      const taskList = await tasksPromise;
      setTasks(taskList || []);
      setIsLoading(false);

      const [emps, sumData, projList] = await Promise.all([empsPromise, sumPromise, projPromise]);
      const validEmps = (emps || []).filter(
        (e: any) => e.employmentStatus === 'ACTIVE' && e.user?.role !== 'SUPER_ADMIN'
      );
      setEmployees(validEmps);
      if (sumData) setSummary(sumData);
      if (projList) setProjects(projList);
      if (validEmps.length > 0) {
        setTargetEmpId((prev) => prev || validEmps[0].id);
      }
    } catch (err) {
      console.error('[AdminWorksPage] Failed to load data:', err);
      setIsLoading(false);
    }
  }, [search, selectedEmp, period, appliedCustomFrom, appliedCustomTo, sortBy, sortOrder]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Periodic polling every 30s to keep backend sync
  useEffect(() => {
    const pollInterval = setInterval(() => {
      loadData();
    }, 30000);
    return () => clearInterval(pollInterval);
  }, [loadData]);

  const handleAssignTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !targetEmpId) return;

    if (taskAssignedDate && taskDueDate && new Date(taskDueDate) < new Date(taskAssignedDate)) {
      alert('Due date must be on or after assigned date');
      return;
    }

    setIsSubmittingTask(true);
    try {
      if (taskProjId) {
        await projectsApi.createTask(taskProjId, {
          title: taskTitle,
          description: taskDesc || null,
          employeeId: targetEmpId,
          priority: taskPriority,
          assignedDate: taskAssignedDate || null,
          startDate: taskAssignedDate || null,
          dueDate: taskDueDate || null,
          estimatedMinutes: taskEstMinutes ? parseInt(taskEstMinutes, 10) : null,
        });
      } else {
        await tasksApi.create({
          title: taskTitle,
          description: taskDesc || null,
          employeeId: targetEmpId,
          priority: taskPriority,
          assignedDate: taskAssignedDate || null,
          startDate: taskAssignedDate || null,
          dueDate: taskDueDate || null,
          estimatedMinutes: taskEstMinutes ? parseInt(taskEstMinutes, 10) : null,
        });
      }
      setIsAssignOpen(false);
      setTaskTitle('');
      setTaskDesc('');
      setTaskProjId('');
      setTaskDueDate('');
      setTaskAssignedDate(new Date().toISOString().split('T')[0]);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to assign task');
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    if (projectAssignedDate && projectDueDate && new Date(projectDueDate) < new Date(projectAssignedDate)) {
      alert('Due date must be on or after assigned date');
      return;
    }

    setIsSubmittingProject(true);
    try {
      const members = [...selectedTeamMemberIds];
      if (projectLeadId && !members.some((m) => m.employeeId === projectLeadId)) {
        members.unshift({ employeeId: projectLeadId, projectRole: 'LEAD' });
      }

      await projectsApi.create({
        name: projectName,
        description: projectDesc || null,
        employeeId: projectLeadId || null,
        status: projectStatus,
        assignedDate: projectAssignedDate || null,
        startDate: projectAssignedDate || null,
        dueDate: projectDueDate || null,
        members,
      });
      setIsCreateProjectOpen(false);
      setProjectName('');
      setProjectDesc('');
      setProjectLeadId('');
      setProjectDueDate('');
      setProjectAssignedDate(new Date().toISOString().split('T')[0]);
      setSelectedTeamMemberIds([]);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to create project');
    } finally {
      setIsSubmittingProject(false);
    }
  };

  const toggleTeamMember = (employeeId: string, role: ProjectRole = 'DEVELOPER') => {
    setSelectedTeamMemberIds((prev) => {
      const exists = prev.some((m) => m.employeeId === employeeId);
      if (exists) {
        return prev.filter((m) => m.employeeId !== employeeId);
      } else {
        return [...prev, { employeeId, projectRole: role }];
      }
    });
  };

  const updateSelectedRole = (employeeId: string, role: ProjectRole) => {
    setSelectedTeamMemberIds((prev) =>
      prev.map((m) => (m.employeeId === employeeId ? { ...m, projectRole: role } : m))
    );
  };

  const openTaskComments = async (task: Task) => {
    setSelectedTask(task);
    try {
      const comms = await tasksApi.getComments(task.id);
      setComments(comms || []);
    } catch {
      setComments([]);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !newComment.trim()) return;

    setIsSubmittingComment(true);
    try {
      const added = await tasksApi.addComment(selectedTask.id, {
        comment: newComment,
        mentionedEmployeeIds: selectedMentionId ? [selectedMentionId] : undefined,
      });
      setComments((prev) => [...prev, added]);
      setNewComment('');
      setSelectedMentionId('');
    } catch (err: any) {
      alert(err.message || 'Failed to post comment');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Helper: Live elapsed duration calculation for active tasks
  const calculateLiveTaskDuration = (task: any, nowMs: number): number => {
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
  };

  const getWorkedTimeTitle = (p: string) => {
    switch (p) {
      case 'TODAY':
        return 'Worked Today';
      case 'YESTERDAY':
        return 'Worked Yesterday';
      case 'THIS_WEEK':
        return 'Worked This Week';
      case 'LAST_WEEK':
        return 'Worked Last Week';
      case 'THIS_MONTH':
        return 'Worked This Month';
      case 'LAST_MONTH':
        return 'Worked Last Month';
      case 'CUSTOM':
        return 'Worked in Range';
      default:
        return 'Total Worked Time';
    }
  };

  // Filter only ACTIVE employees for new work assignment / project creation
  const activeEmployees = employees.filter(
    (e) =>
      e.employmentStatus === 'ACTIVE' &&
      (e as any).user?.status !== 'INACTIVE' &&
      (e as any).user?.role !== 'SUPER_ADMIN'
  );

  // If a project is selected in Assign Task modal, limit assignee options to that project's active members
  const selectedProjObj = projects.find((p) => p.id === taskProjId);
  const assigneeOptions =
    selectedProjObj && selectedProjObj.members && selectedProjObj.members.length > 0
      ? selectedProjObj.members
          .filter(
            (m) =>
              m.employee?.employmentStatus === 'ACTIVE' &&
              (m.employee as any)?.user?.status !== 'INACTIVE' &&
              (m.employee as any)?.user?.role !== 'SUPER_ADMIN'
          )
          .map((m) => ({
            value: m.employeeId,
            label: `${m.employee?.displayName || m.employee?.firstName} (${m.projectRole})`,
          }))
      : activeEmployees.map((e) => ({
          value: e.id,
          label: `${e.displayName || e.firstName} (${e.department?.name || 'Staff'})`,
        }));

  const tabs = [
    { id: 'TASKS', label: `Tasks (${tasks.length})` },
    { id: 'PROJECTS', label: `Projects (${projects.length})` },
    { id: 'TEAM', label: 'Team Time Breakdown' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Work & Project Management</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Manage projects, project teams, assign tasks, and monitor server-authoritative worked time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setIsCreateProjectOpen(true)} variant="outline" className="gap-1.5 shadow-sm text-xs">
            <FolderPlus className="w-3.5 h-3.5" /> New Project
          </Button>
          <Button onClick={() => setIsAssignOpen(true)} className="gap-1.5 shadow-sm text-xs">
            <Plus className="w-3.5 h-3.5" /> Assign Task
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-4 bg-white border-neutral-200">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-500 font-medium">Total Tasks</span>
              <Briefcase className="w-4 h-4 text-neutral-400" />
            </div>
            <div className="text-xl font-extrabold text-neutral-900 mt-1">{summary.totalTasks ?? tasks.length}</div>
            <div className="text-[11px] text-neutral-400 mt-0.5">{projects.length} active projects</div>
          </Card>

          <Card className="p-4 bg-white border-neutral-200">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-500 font-medium">Active Timers</span>
              <Timer className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-xl font-extrabold text-emerald-600 mt-1 flex items-center gap-1.5">
              {summary.activeTimersCount > 0 && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />}
              {summary.activeTimersCount ?? 0}
            </div>
            <div className="text-[11px] text-neutral-400 mt-0.5">Running right now</div>
          </Card>

          <Card className="p-4 bg-white border-neutral-200">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-500 font-medium">{getWorkedTimeTitle(period)}</span>
              <Clock className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-xl font-extrabold text-neutral-900 mt-1 font-mono">
              {formatSecondsToTime(summary.totalWorkedSeconds ?? 0)}
            </div>
            <div className="text-[11px] text-neutral-400 mt-0.5">
              ({summary.totalWorkedHours ?? 0} hrs logged)
              {period !== 'ALL_TIME' && summary.allTimeWorkedHours !== undefined && (
                <span className="block text-[10px] text-neutral-500 mt-0.5 font-medium">
                  Lifetime: {summary.allTimeWorkedHours} hrs
                </span>
              )}
            </div>
          </Card>

          <Card className="p-4 bg-white border-neutral-200">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-500 font-medium">Completed Tasks</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl font-extrabold text-neutral-900 mt-1">{summary.completedTasks ?? 0}</div>
            <div className="text-[11px] text-neutral-400 mt-0.5">Fully finalized</div>
          </Card>
        </div>
      )}

      {/* Tabs & Period / Employee / Search Filter Bar */}
      <div className="space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <Tabs value={activeTab} onValueChange={setActiveTab} tabs={tabs} />
          
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-48">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-400" />
              <Input
                placeholder="Search work..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
            <div className="w-full sm:w-40">
              <Select
                value={period}
                onChange={(e) => {
                  setPeriod(e.target.value);
                  if (e.target.value !== 'CUSTOM') {
                    setCustomFrom('');
                    setCustomTo('');
                    setAppliedCustomFrom('');
                    setAppliedCustomTo('');
                  }
                }}
                options={PERIOD_OPTIONS}
              />
            </div>
            <div className="w-full sm:w-44">
              <Select
                value={selectedEmp}
                onChange={(e) => setSelectedEmp(e.target.value)}
                options={[
                  { value: '', label: 'All Employees' },
                  ...employees.map((e) => ({ value: e.id, label: e.displayName })),
                ]}
              />
            </div>
          </div>
        </div>

        {/* Custom Date Range Picker when CUSTOM is selected */}
        {period === 'CUSTOM' && (
          <div className="flex flex-wrap items-center gap-2 p-3 bg-white rounded-lg border border-neutral-200 shadow-sm text-xs animate-in fade-in">
            <span className="font-bold text-neutral-700">Custom Period:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-500 font-medium">From:</span>
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 text-xs w-36"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-neutral-500 font-medium">To:</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 text-xs w-36"
              />
            </div>
            <Button
              size="sm"
              onClick={() => {
                if (customFrom && customTo) {
                  setAppliedCustomFrom(customFrom);
                  setAppliedCustomTo(customTo);
                }
              }}
              disabled={!customFrom || !customTo}
              className="h-8 text-xs px-3 font-semibold"
            >
              Apply
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCustomFrom('');
                setCustomTo('');
                setAppliedCustomFrom('');
                setAppliedCustomTo('');
                setPeriod('ALL_TIME');
              }}
              className="h-8 text-xs px-2.5"
            >
              Clear
            </Button>
          </div>
        )}
      </div>

      {activeTab === 'TASKS' ? (
        /* TAB 1: Tasks Table */
        <Card className="p-0 border-neutral-200 overflow-hidden">
          {isLoading && tasks.length === 0 ? (
            <div className="space-y-3 p-5 animate-pulse">
              <div className="h-8 bg-neutral-100 rounded w-full"></div>
              <div className="h-8 bg-neutral-100 rounded w-full"></div>
              <div className="h-8 bg-neutral-100 rounded w-full"></div>
            </div>
          ) : tasks.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No Tasks Found"
                description="Assign tasks to employees or create new work items."
                actionLabel="Assign First Task"
                onAction={() => setIsAssignOpen(true)}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-neutral-50/50">
                  <TableHead className="font-bold text-xs uppercase text-neutral-500">Task</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-neutral-500">Assignee</TableHead>
                  <TableHead
                    onClick={() => handleSort('createdAt')}
                    className="font-bold text-xs uppercase text-neutral-700 hover:text-black cursor-pointer select-none transition-colors"
                    title="Click to toggle sorting by Created Date (Newest / Oldest)"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Created</span>
                      {sortBy === 'createdAt' ? (
                        sortOrder === 'desc' ? (
                          <span className="inline-flex items-center text-black font-extrabold text-xs" title="Newest first">↓</span>
                        ) : (
                          <span className="inline-flex items-center text-black font-extrabold text-xs" title="Oldest first">↑</span>
                        )
                      ) : (
                        <span className="text-neutral-400 text-xs opacity-60">↕</span>
                      )}
                    </div>
                  </TableHead>
                  <TableHead className="font-bold text-xs uppercase text-neutral-500">Assigned</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-neutral-500">Due</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-neutral-500">Priority</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-neutral-500">Status</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-neutral-500">Time Tracked</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-neutral-500 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task: any) => {
                  const isRunning = Boolean(task.activeTimer || (task.timers && task.timers.some((t: any) => t.isActive ?? t.is_active)));
                  const isPaused = !isRunning && (task.status === 'PAUSED' || (task.totalDurationSeconds && task.totalDurationSeconds > 0 && task.status !== 'COMPLETED'));
                  const liveDuration = isRunning ? calculateLiveTaskDuration(task, currentTimeMs) : (task.totalDurationSeconds || 0);

                  return (
                    <TableRow key={task.id} className="hover:bg-neutral-50/80 transition-colors">
                      <TableCell>
                        <div className="font-bold text-neutral-900 text-sm flex items-center gap-2">
                          {task.title}
                          {task.project && (
                            <Link
                              href={`/admin/projects/${task.project.id}`}
                              className="text-[10px] font-semibold px-1.5 py-0.5 bg-neutral-100 text-neutral-700 hover:bg-neutral-200 rounded border border-neutral-200"
                            >
                              📁 {task.project.name}
                            </Link>
                          )}
                        </div>
                        {task.description && (
                          <div className="text-xs text-neutral-500 truncate max-w-md mt-0.5">{task.description}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-neutral-900 text-white font-bold flex items-center justify-center text-[10px]">
                            {(task.employee?.displayName || task.employee?.display_name || 'Staff')[0]}
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-neutral-900">
                              {task.employee?.displayName || task.employee?.display_name || 'Staff'}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-neutral-700 whitespace-nowrap">
                        <div className="font-medium text-neutral-900">{formatDate(task.createdAt)}</div>
                        <div className="text-[10px] text-neutral-400 font-mono">
                          {formatTime(task.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-neutral-700 whitespace-nowrap">
                        {task.assignedDate || task.startDate ? formatDate(task.assignedDate || task.startDate) : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-neutral-700 whitespace-nowrap">
                        {task.dueDate ? formatDate(task.dueDate) : 'No due date'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            task.priority === 'URGENT'
                              ? 'danger'
                              : task.priority === 'HIGH'
                              ? 'warning'
                              : 'default'
                          }
                        >
                          {task.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {isRunning && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />}
                          <Badge
                            variant={
                              task.status === 'COMPLETED'
                                ? 'success'
                                : task.status === 'IN_PROGRESS'
                                ? 'default'
                                : task.status === 'PAUSED'
                                ? 'warning'
                                : 'secondary'
                            }
                          >
                            {task.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        {isRunning ? (
                          <div className="flex items-center gap-1.5 font-mono font-bold text-xs text-emerald-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>{formatSecondsToTime(liveDuration)}</span>
                            <span className="text-[10px] font-sans font-bold tracking-wider text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200">
                              LIVE
                            </span>
                          </div>
                        ) : isPaused ? (
                          <div className="flex items-center gap-1.5 font-mono font-bold text-xs text-neutral-900">
                            <span>{formatSecondsToTime(liveDuration)}</span>
                            <span className="text-[10px] font-sans font-bold tracking-wider text-amber-700 bg-amber-50 px-1 py-0.5 rounded border border-amber-200">
                              PAUSED
                            </span>
                          </div>
                        ) : (
                          <div className="font-mono font-bold text-xs text-neutral-900">
                            {formatSecondsToTime(liveDuration)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openTaskComments(task)}
                          className="gap-1 text-xs text-neutral-600 hover:text-black"
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> Comments
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      ) : activeTab === 'PROJECTS' ? (
        /* TAB 2: Projects Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.length === 0 ? (
            <div className="col-span-full">
              <EmptyState
                title="No Projects Found"
                description="Organize your workforce into projects and track time hierarchically."
                actionLabel="Create Project"
                onAction={() => setIsCreateProjectOpen(true)}
              />
            </div>
          ) : (
            projects.map((proj) => {
              const totalSec = proj.totalWorkedSeconds || 0;
              return (
                <Card key={proj.id} className="p-5 border-neutral-200 hover:border-black transition-colors flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant={proj.status === 'COMPLETED' ? 'success' : proj.status === 'ON_HOLD' ? 'warning' : 'default'}>
                        {proj.status.replace('_', ' ')}
                      </Badge>
                      <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-neutral-900">
                        <Clock className="w-3.5 h-3.5 text-blue-500" />
                        {formatSecondsToTime(totalSec)}
                      </div>
                    </div>

                    <h3 className="font-extrabold text-base text-neutral-900 line-clamp-1">{proj.name}</h3>
                    {proj.description && (
                      <p className="text-xs text-neutral-500 mt-1 line-clamp-2 leading-relaxed">{proj.description}</p>
                    )}

                    {/* Team Members List */}
                    <div className="mt-4 pt-3 border-t border-neutral-100">
                      <div className="flex items-center justify-between text-xs text-neutral-500 mb-2 font-semibold">
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" /> Team ({proj.members?.length || 0})
                        </span>
                        <span>{proj.completedTasks || 0} / {proj.totalTasks || 0} Tasks</span>
                      </div>

                      {/* Team Avatars */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {proj.members && proj.members.length > 0 ? (
                          proj.members.slice(0, 5).map((m) => (
                            <div
                              key={m.id}
                              title={`${m.employee?.displayName || 'Member'} (${m.projectRole})`}
                              className="px-2 py-0.5 rounded-full bg-neutral-100 text-[10px] font-bold text-neutral-800 border border-neutral-200"
                            >
                              {m.employee?.displayName?.[0] || 'E'} • {m.projectRole}
                            </div>
                          ))
                        ) : (
                          <span className="text-[11px] text-neutral-400 italic">No members assigned</span>
                        )}
                        {proj.members && proj.members.length > 5 && (
                          <span className="text-[10px] font-bold text-neutral-400">+{proj.members.length - 5} more</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-neutral-100 flex items-center justify-between">
                    <div className="flex flex-col gap-0.5 text-[11px] text-neutral-500">
                      <span>Assigned: {proj.assignedDate || proj.startDate ? formatDate(proj.assignedDate || proj.startDate) : '—'}</span>
                      <span>Due: {proj.dueDate ? formatDate(proj.dueDate) : 'No due date'}</span>
                    </div>
                    <Link href={`/admin/projects/${proj.id}`}>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                        Workspace <ArrowRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      ) : (
        /* TAB 3: Team Time Breakdown */
        <Card className="p-6 border-neutral-200 bg-white">
          <h3 className="text-base font-bold text-neutral-900 mb-4">Employee Work Time Aggregates</h3>
          {(!summary?.employeeBreakdown || summary.employeeBreakdown.length === 0) ? (
            <EmptyState title="No Time Data" description="Time tracking data will appear here once employees run timers." />
          ) : (
            <div className="space-y-4">
              {summary.employeeBreakdown.map((item: any) => {
                const totalSeconds = summary.totalWorkedSeconds || 1;
                const percentage = Math.min(100, Math.round((item.totalWorkedSeconds / totalSeconds) * 100));

                return (
                  <div key={item.employee?.id || item.employeeId} className="p-4 bg-neutral-50 rounded-xl border border-neutral-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-neutral-900 text-white font-bold flex items-center justify-center text-xs">
                          {(item.employee?.displayName || item.displayName || 'E')[0]}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-neutral-900">
                            {item.employee?.displayName || item.displayName}
                          </div>
                          <div className="text-[11px] text-neutral-500">{item.taskCount} tasks worked on</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono font-bold text-neutral-900">
                          {formatSecondsToTime(item.totalWorkedSeconds)}
                        </div>
                        <div className="text-[11px] text-neutral-500">{item.totalWorkedHours} hrs ({percentage}%)</div>
                      </div>
                    </div>
                    <div className="w-full bg-neutral-200 h-1.5 rounded-full mt-3 overflow-hidden">
                      <div className="bg-black h-full rounded-full transition-all duration-300" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* MODAL: Assign Task */}
      <Dialog
        isOpen={isAssignOpen}
        onClose={() => setIsAssignOpen(false)}
        title="Assign New Task"
        description="Assign a task to an employee or link it to a project."
      >
        <form onSubmit={handleAssignTask} className="space-y-4">
          <Input
            label="Task Title *"
            placeholder="e.g. Design homepage wireframes"
            required
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
          />

          <Select
            label="Project (Optional)"
            value={taskProjId}
            onChange={(e) => setTaskProjId(e.target.value)}
            options={[
              { value: '', label: '-- No Project (Standalone) --' },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />

          <Select
            label="Assignee *"
            value={targetEmpId}
            onChange={(e) => setTargetEmpId(e.target.value)}
            options={assigneeOptions}
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Priority"
              value={taskPriority}
              onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
              options={[
                { value: 'LOW', label: 'Low' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'HIGH', label: 'High' },
                { value: 'URGENT', label: 'Urgent' },
              ]}
            />
            <Input
              label="Estimated Time (Minutes)"
              type="number"
              placeholder="e.g. 90"
              value={taskEstMinutes}
              onChange={(e) => setTaskEstMinutes(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Assigned Date *"
              type="date"
              value={taskAssignedDate}
              onChange={(e) => setTaskAssignedDate(e.target.value)}
              required
            />
            <Input
              label="Due Date"
              type="date"
              value={taskDueDate}
              min={taskAssignedDate || undefined}
              onChange={(e) => setTaskDueDate(e.target.value)}
            />
          </div>

          <Textarea
            label="Task Description"
            placeholder="Detailed requirements, links, or notes..."
            value={taskDesc}
            onChange={(e) => setTaskDesc(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
            <Button type="button" variant="outline" onClick={() => setIsAssignOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmittingTask} disabled={!taskTitle.trim() || !targetEmpId}>
              Assign Task
            </Button>
          </div>
        </form>
      </Dialog>

      {/* MODAL: Create Project with Team Members */}
      <Dialog
        isOpen={isCreateProjectOpen}
        onClose={() => setIsCreateProjectOpen(false)}
        title="Create New Project"
        description="Create a project and assemble the team with specific roles."
      >
        <form onSubmit={handleCreateProject} className="space-y-4">
          <Input
            label="Project Name *"
            placeholder="e.g. WorkOS Mobile Application"
            required
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />

          <Select
            label="Project Lead (Primary Contact)"
            value={projectLeadId}
            onChange={(e) => setProjectLeadId(e.target.value)}
            options={[
              { value: '', label: '-- None / Unassigned --' },
              ...activeEmployees.map((e) => ({ value: e.id, label: `${e.displayName} (${e.department?.name || 'Staff'})` })),
            ]}
          />

          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Project Status"
              value={projectStatus}
              onChange={(e) => setProjectStatus(e.target.value as ProjectStatus)}
              options={[
                { value: 'PLANNING', label: 'Planning' },
                { value: 'IN_PROGRESS', label: 'In Progress' },
                { value: 'ON_HOLD', label: 'On Hold' },
                { value: 'COMPLETED', label: 'Completed' },
              ]}
            />
            <Input
              label="Assigned Date *"
              type="date"
              value={projectAssignedDate}
              onChange={(e) => setProjectAssignedDate(e.target.value)}
              required
            />
            <Input
              label="Due Date"
              type="date"
              value={projectDueDate}
              min={projectAssignedDate || undefined}
              onChange={(e) => setProjectDueDate(e.target.value)}
            />
          </div>

          <Textarea
            label="Project Description"
            placeholder="Project goals, scopes, deliverables..."
            value={projectDesc}
            onChange={(e) => setProjectDesc(e.target.value)}
          />

          {/* Team Members Multi-Select */}
          <div className="space-y-2 pt-2 border-t border-neutral-100">
            <label className="text-xs font-bold text-neutral-800 flex items-center justify-between">
              <span>Assemble Project Team (Active Employees Only)</span>
              <span className="text-neutral-400 font-normal">{selectedTeamMemberIds.length} members selected</span>
            </label>
            <div className="max-h-48 overflow-y-auto space-y-2 p-2 bg-neutral-50 rounded-lg border border-neutral-200">
              {activeEmployees.map((emp) => {
                const isSelected = selectedTeamMemberIds.some((m) => m.employeeId === emp.id);
                const currentRole = selectedTeamMemberIds.find((m) => m.employeeId === emp.id)?.projectRole || 'DEVELOPER';

                return (
                  <div
                    key={emp.id}
                    className={`flex items-center justify-between p-2 rounded-md border text-xs transition-colors ${
                      isSelected ? 'bg-white border-neutral-900 shadow-xs' : 'bg-transparent border-neutral-200 opacity-70'
                    }`}
                  >
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTeamMember(emp.id)}
                        className="rounded border-neutral-300 text-black focus:ring-0 cursor-pointer"
                      />
                      <span className="font-semibold text-neutral-900">{emp.displayName}</span>
                      <span className="text-[10px] text-neutral-400">({emp.department?.name || 'Staff'})</span>
                    </label>

                    {isSelected && (
                      <select
                        value={currentRole}
                        onChange={(e) => updateSelectedRole(emp.id, e.target.value as ProjectRole)}
                        className="text-[11px] font-medium py-0.5 px-2 rounded border border-neutral-200 bg-white"
                      >
                        {PROJECT_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
            <Button type="button" variant="outline" onClick={() => setIsCreateProjectOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmittingProject} disabled={!projectName.trim()}>
              Create Project
            </Button>
          </div>
        </form>
      </Dialog>

      {/* MODAL: Task Comments & Mentions */}
      <Dialog
        isOpen={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        title={`Comments & Mentions: ${selectedTask?.title}`}
        description="Collaborate with team members on this task."
      >
        <div className="space-y-4">
          <div className="max-h-64 overflow-y-auto space-y-2.5 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
            {comments.length === 0 ? (
              <p className="text-xs text-neutral-400 text-center py-4">No comments yet. Write the first comment below!</p>
            ) : (
              comments.map((c: any) => (
                <div key={c.id} className="p-2.5 bg-white rounded border border-neutral-200 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-neutral-900">{c.user?.email || 'User'}</span>
                    <span className="text-[10px] text-neutral-400">{formatDate(c.createdAt)}</span>
                  </div>
                  <p className="text-neutral-700 whitespace-pre-wrap">{c.comment}</p>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleAddComment} className="space-y-3">
            <Textarea
              placeholder="Write a comment or feedback..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              required
            />

            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500 flex items-center gap-1 font-medium">
                <AtSign className="w-3.5 h-3.5" /> Mention:
              </span>
              <Select
                value={selectedMentionId}
                onChange={(e) => setSelectedMentionId(e.target.value)}
                options={[
                  { value: '', label: 'None' },
                  ...activeEmployees.map((e) => ({
                    value: e.id,
                    label: `@${e.displayName} (${e.department?.name || 'Staff'})`,
                  })),
                ]}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setSelectedTask(null)}>
                Close
              </Button>
              <Button type="submit" isLoading={isSubmittingComment} disabled={!newComment.trim()}>
                Post Comment
              </Button>
            </div>
          </form>
        </div>
      </Dialog>
    </div>
  );
}
