'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { tasksApi, projectsApi, employeesApi } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useTaskTimer } from '@/hooks/use-task-timer';
import { Task, TaskPriority, TaskStatus, Project, ProjectStatus, Employee } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { formatSecondsToTime, formatDate } from '@/lib/utils';
import {
  Briefcase,
  Plus,
  Play,
  Pause,
  Square,
  Clock,
  CheckCircle2,
  Search,
  FolderPlus,
  Layers,
  ArrowRight,
  Timer,
  Users,
  MessageSquare,
  AtSign,
  AlertCircle,
} from 'lucide-react';

export default function TasksPage() {
  const { user } = useAuth();
  const { activeTimer, elapsedSeconds, startTimer, pauseTimer, stopTimer } = useTaskTimer();
  const [viewMode, setViewMode] = useState<'TASKS' | 'PROJECTS'>('TASKS');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Sorting state (Default: Created Date DESC)
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [selectedMentionId, setSelectedMentionId] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // New task form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedProjId, setSelectedProjId] = useState('');
  const [taskAssigneeId, setTaskAssigneeId] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [assignedDate, setAssignedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New project form state (Additive capability for Limited Admins / Super Admin)
  const canCreateProject = Boolean(user?.role === 'SUPER_ADMIN' || user?.permissions?.includes('PROJECT_CREATE'));
  const [isProjectCreateOpen, setIsProjectCreateOpen] = useState(false);
  const [projName, setProjName] = useState('');
  const [projDescription, setProjDescription] = useState('');
  const [projAssignedDate, setProjAssignedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [projDueDate, setProjDueDate] = useState('');
  const [isSubmittingProject, setIsSubmittingProject] = useState(false);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projName.trim()) return;
    setIsSubmittingProject(true);
    try {
      await projectsApi.create({
        name: projName,
        status: 'IN_PROGRESS',
        description: projDescription || undefined,
        assignedDate: projAssignedDate || undefined,
        startDate: projAssignedDate || undefined,
        dueDate: projDueDate || undefined,
      });
      setIsProjectCreateOpen(false);
      setProjName('');
      setProjDescription('');
      setProjAssignedDate(new Date().toISOString().split('T')[0]);
      setProjDueDate('');
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to create project');
    } finally {
      setIsSubmittingProject(false);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      // Fetch primary tasks list and secondary summary/projects concurrently
      const tasksPromise = tasksApi.list({
        search: search || undefined,
        status: filterStatus === 'ALL' ? undefined : filterStatus,
        sortBy,
        sortOrder,
      }).catch((e) => {
        console.error('[TasksPage] tasksApi.list failed:', e);
        return [];
      });

      const summaryPromise = tasksApi.getSummary().catch(() => null);
      const projectsPromise = projectsApi.list({
        search: search || undefined,
      }).catch(() => []);

      // Primary tasks resolution
      const taskData = await tasksPromise;
      setTasks(taskData || []);
      setIsLoading(false);

      // Secondary summary & projects resolution
      const [sumData, projData] = await Promise.all([summaryPromise, projectsPromise]);
      if (sumData) setSummary(sumData);
      if (projData) setProjects(projData);
    } catch (err) {
      console.error('[TasksPage] Error loading data:', err);
      setIsLoading(false);
    }
  }, [search, filterStatus, sortBy, sortOrder]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStartTimer = async (taskId: string) => {
    const res = await startTimer(taskId);
    if (res && res.task) {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id === taskId) {
            return {
              ...t,
              ...res.task,
              status: 'IN_PROGRESS',
            };
          }
          if (t.status === 'IN_PROGRESS') {
            return {
              ...t,
              status: 'PAUSED',
            };
          }
          return t;
        })
      );
    }
    fetchData();
  };

  const handlePauseTimer = async (taskId: string) => {
    const res = await pauseTimer(taskId);
    if (res && res.task) {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...res.task, status: 'PAUSED' } : t))
      );
    }
    fetchData();
  };

  const handleStopTimer = async (taskId: string) => {
    const res = await stopTimer(taskId);
    if (res && res.task) {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...res.task, status: 'COMPLETED' } : t))
      );
    }
    fetchData();
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (assignedDate && dueDate && new Date(dueDate) < new Date(assignedDate)) {
      alert('Due date must be on or after assigned date');
      return;
    }

    setIsSubmitting(true);
    try {
      if (selectedProjId) {
        await projectsApi.createTask(selectedProjId, {
          title,
          description: description || null,
          priority,
          employeeId: taskAssigneeId || undefined,
          assignedDate: assignedDate || null,
          startDate: assignedDate || null,
          dueDate: dueDate || null,
          estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes, 10) : null,
        });
      } else {
        await tasksApi.create({
          title,
          description: description || null,
          priority,
          assignedDate: assignedDate || null,
          startDate: assignedDate || null,
          dueDate: dueDate || null,
          estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes, 10) : null,
        });
      }

      setIsCreateOpen(false);
      setTitle('');
      setDescription('');
      setSelectedProjId('');
      setTaskAssigneeId('');
      setDueDate('');
      setAssignedDate(new Date().toISOString().split('T')[0]);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
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

  const selectedProjObj = projects.find((p) => p.id === selectedProjId);
  const assigneeOptions =
    selectedProjObj && selectedProjObj.members && selectedProjObj.members.length > 0
      ? selectedProjObj.members
          .filter((m) => {
            const status = m.employee?.employmentStatus || (m.employee as any)?.employment_status || 'ACTIVE';
            const userStatus = (m.employee as any)?.user?.status;
            return status === 'ACTIVE' && userStatus !== 'INACTIVE';
          })
          .map((m) => ({
            value: m.employeeId,
            label: `${m.employee?.displayName || m.employee?.firstName || 'Team Member'} (${m.projectRole})`,
          }))
      : [];

  const tabs = [
    { id: 'TASKS', label: `My Tasks (${tasks.length})` },
    { id: 'PROJECTS', label: `My Projects (${projects.length})` },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Work & Task Manager</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Organize work items, collaborate with project teammates, and track accurate worked time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreateProject && (
            <Button
              variant="outline"
              onClick={() => setIsProjectCreateOpen(true)}
              className="gap-1.5 shadow-sm text-xs border-neutral-300 hover:border-black"
            >
              <FolderPlus className="w-3.5 h-3.5" /> New Project
            </Button>
          )}
          <Button onClick={() => setIsCreateOpen(true)} className="gap-1.5 shadow-sm text-xs">
            <Plus className="w-3.5 h-3.5" /> New Task
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 bg-white border-neutral-200">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500 font-medium">My Tasks</span>
            <Briefcase className="w-4 h-4 text-neutral-400" />
          </div>
          <div className="text-xl font-extrabold text-neutral-900 mt-1">{summary?.totalTasks ?? tasks.length}</div>
          <div className="text-[11px] text-neutral-400 mt-0.5">{projects.length} connected projects</div>
        </Card>

        <Card className="p-4 bg-white border-neutral-200">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500 font-medium">Active Timer</span>
            <Timer className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-extrabold text-emerald-600 mt-1 flex items-center gap-1.5 font-mono">
            {activeTimer ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                {formatSecondsToTime(elapsedSeconds)}
              </>
            ) : (
              <span className="text-neutral-400 font-normal text-sm">No timer running</span>
            )}
          </div>
          <div className="text-[11px] text-neutral-400 mt-0.5">
            {activeTimer ? activeTimer.task?.title || 'Active task' : 'Idle'}
          </div>
        </Card>

        <Card className="p-4 bg-white border-neutral-200">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500 font-medium">Time Logged</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-extrabold text-neutral-900 mt-1 font-mono">
            {formatSecondsToTime(summary?.totalWorkedSeconds ?? 0)}
          </div>
          <div className="text-[11px] text-neutral-400 mt-0.5">({summary?.totalWorkedHours ?? 0} hrs total)</div>
        </Card>

        <Card className="p-4 bg-white border-neutral-200">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500 font-medium">Completed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-extrabold text-neutral-900 mt-1">{summary?.completedTasks ?? 0}</div>
          <div className="text-[11px] text-neutral-400 mt-0.5">Tasks completed</div>
        </Card>
      </div>

      {/* Tabs & Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} tabs={tabs} />

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-60">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-400" />
            <Input
              placeholder="Search work..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          {viewMode === 'TASKS' && (
            <>
              <div className="w-full sm:w-36">
                <Select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  options={[
                    { value: 'ALL', label: 'All Statuses' },
                    { value: 'TODO', label: 'To Do' },
                    { value: 'IN_PROGRESS', label: 'In Progress' },
                    { value: 'PAUSED', label: 'Paused' },
                    { value: 'COMPLETED', label: 'Completed' },
                  ]}
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                className="h-9 px-3 text-xs gap-1.5 whitespace-nowrap bg-white border-neutral-300 hover:border-black font-medium"
                title="Click to toggle sorting by Created Date (Newest / Oldest)"
              >
                <span>Created: {sortOrder === 'desc' ? 'Newest' : 'Oldest'}</span>
                <span className="font-extrabold text-xs">{sortOrder === 'desc' ? '↓' : '↑'}</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Loading state / Task View */}
      {isLoading && tasks.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5 border-neutral-200 bg-white animate-pulse min-h-[200px] flex flex-col justify-between">
              <div>
                <div className="h-4 bg-neutral-200 rounded w-1/3 mb-4"></div>
                <div className="h-5 bg-neutral-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-neutral-100 rounded w-full mb-2"></div>
                <div className="h-3 bg-neutral-100 rounded w-2/3"></div>
              </div>
              <div className="h-8 bg-neutral-100 rounded w-full mt-4"></div>
            </Card>
          ))}
        </div>
      ) : viewMode === 'TASKS' ? (
        /* TAB 1: Tasks List */
        tasks.length === 0 ? (
          <EmptyState
            title="No Tasks Found"
            description="Create your first task or collaborate under a project."
            actionLabel="Create Task"
            onAction={() => setIsCreateOpen(true)}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tasks.map((task) => {
              const isThisTimerRunning = activeTimer?.taskId === task.id;
              const workedSeconds = isThisTimerRunning
                ? elapsedSeconds
                : task.totalDurationSeconds || 0;

              return (
                <Card
                  key={task.id}
                  className={`p-5 flex flex-col justify-between border transition-all ${
                    isThisTimerRunning
                      ? 'border-emerald-500 bg-emerald-50/20 shadow-md ring-1 ring-emerald-500/30'
                      : 'border-neutral-200 bg-white hover:border-black'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge
                          variant={
                            task.status === 'COMPLETED'
                              ? 'success'
                              : task.status === 'IN_PROGRESS'
                              ? 'default'
                              : 'secondary'
                          }
                        >
                          {task.status.replace('_', ' ')}
                        </Badge>
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
                      </div>

                      <div className="font-mono text-xs font-bold text-neutral-900 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-blue-500" />
                        {formatSecondsToTime(workedSeconds)}
                      </div>
                    </div>

                    <h3 className="font-extrabold text-base text-neutral-900 line-clamp-1">{task.title}</h3>
                    {task.project && (
                      <div className="text-[11px] font-semibold text-neutral-600 mt-1 flex items-center gap-1">
                        📁 Project: <span className="text-neutral-900">{task.project.name}</span>
                      </div>
                    )}

                    {task.description && (
                      <p className="text-xs text-neutral-500 mt-2 line-clamp-2 leading-relaxed">{task.description}</p>
                    )}

                    <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-neutral-700 font-medium">Created: {formatDate(task.createdAt)}</span>
                        <span>Assigned: {task.assignedDate || task.startDate ? formatDate(task.assignedDate || task.startDate) : '—'}</span>
                        <span>Due: {task.dueDate ? formatDate(task.dueDate) : 'No due date'}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openTaskComments(task)}
                        className="h-6 text-[11px] gap-1 text-neutral-500 hover:text-black"
                      >
                        <MessageSquare className="w-3 h-3" /> Comments
                      </Button>
                    </div>
                  </div>

                  {/* Timer Actions */}
                  <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between gap-2">
                    {task.status === 'COMPLETED' ? (
                      <div className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Completed
                      </div>
                    ) : isThisTimerRunning ? (
                      <div className="flex items-center gap-2 w-full">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePauseTimer(task.id)}
                          className="flex-1 gap-1 text-xs"
                        >
                          <Pause className="w-3.5 h-3.5" /> Pause
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleStopTimer(task.id)}
                          className="flex-1 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700"
                        >
                          <Square className="w-3.5 h-3.5" /> Finish
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleStartTimer(task.id)}
                        className="w-full gap-1 text-xs"
                      >
                        <Play className="w-3.5 h-3.5" /> {task.status === 'PAUSED' || (task.totalDurationSeconds && task.totalDurationSeconds > 0) ? 'Resume Timer' : 'Start Timer'}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        /* TAB 2: Projects Grid */
        projects.length === 0 ? (
          <EmptyState
            title="No Projects Assigned"
            description="You are not currently assigned to any project team."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((proj) => {
              const myMembership = proj.members?.find((m) => m.employeeId === user?.employeeId);
              const myRole = myMembership?.projectRole || 'MEMBER';

              return (
                <Card key={proj.id} className="p-5 border-neutral-200 hover:border-black transition-colors flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={proj.status === 'COMPLETED' ? 'success' : proj.status === 'ON_HOLD' ? 'warning' : 'default'}>
                          {proj.status.replace('_', ' ')}
                        </Badge>
                        <Badge variant="secondary" className="font-semibold text-[10px] bg-neutral-100 text-neutral-800 border-neutral-200">
                          Role: {myRole}
                        </Badge>
                      </div>
                      <div className="font-mono text-xs font-bold text-neutral-900 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-blue-500" />
                        {formatSecondsToTime(proj.totalWorkedSeconds || 0)}
                      </div>
                    </div>

                    <h3 className="font-extrabold text-base text-neutral-900 line-clamp-1">{proj.name}</h3>
                    {proj.description && (
                      <p className="text-xs text-neutral-500 mt-1 line-clamp-2 leading-relaxed">{proj.description}</p>
                    )}

                  {/* Team Members */}
                  <div className="mt-4 pt-3 border-t border-neutral-100">
                    <div className="flex items-center justify-between text-xs text-neutral-500 mb-2 font-semibold">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" /> Team ({proj.members?.length || 0})
                      </span>
                      <span>{proj.completedTasks || 0} / {proj.totalTasks || 0} Tasks</span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {proj.members?.map((m) => (
                        <div
                          key={m.id}
                          className="px-2 py-0.5 rounded-full bg-neutral-100 text-[10px] font-bold text-neutral-800 border border-neutral-200"
                        >
                          {m.employee?.displayName?.[0] || 'E'} • {m.projectRole}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-neutral-100 flex items-center justify-between">
                  <div className="flex flex-col gap-0.5 text-[11px] text-neutral-500">
                    <span>Assigned: {proj.assignedDate || proj.startDate ? formatDate(proj.assignedDate || proj.startDate) : '—'}</span>
                    <span>Due: {proj.dueDate ? formatDate(proj.dueDate) : 'No due date'}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedProjId(proj.id);
                      setIsCreateOpen(true);
                    }}
                    className="h-7 text-xs gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Task
                  </Button>
                </div>
              </Card>
              );
            })}
          </div>
        )
      )}

      {/* MODAL: Create Task (Supports Project Selection & Assignee Selection) */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Task"
        description="Create a self task or assign work under a project team."
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          <Input
            label="Task Title *"
            placeholder="e.g. Test checkout page validation"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <Select
            label="Project (Optional)"
            value={selectedProjId}
            onChange={(e) => setSelectedProjId(e.target.value)}
            options={[
              { value: '', label: '-- Self Task (No Project) --' },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />

          {selectedProjId && assigneeOptions.length > 0 && (
            <Select
              label="Assignee (Project Member)"
              value={taskAssigneeId}
              onChange={(e) => setTaskAssigneeId(e.target.value)}
              options={[
                { value: '', label: '-- Myself --' },
                ...assigneeOptions,
              ]}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
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
              placeholder="e.g. 60"
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Assigned Date *"
              type="date"
              value={assignedDate}
              onChange={(e) => setAssignedDate(e.target.value)}
              required
            />
            <Input
              label="Due Date"
              type="date"
              value={dueDate}
              min={assignedDate || undefined}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <Textarea
            label="Task Description"
            placeholder="Details, bug description, or steps to reproduce..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting} disabled={!title.trim()}>
              Create Task
            </Button>
          </div>
        </form>
      </Dialog>

      {/* MODAL: Comments & Mentions */}
      <Dialog
        isOpen={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        title={`Task Comments: ${selectedTask?.title}`}
        description="Collaborate with teammates using @mentions on this task."
      >
        <div className="space-y-4">
          <div className="max-h-64 overflow-y-auto space-y-2.5 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
            {comments.length === 0 ? (
              <p className="text-xs text-neutral-400 text-center py-4">No comments yet. Start the conversation below!</p>
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
              placeholder="Write a comment or update..."
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
                  ...employees.map((e) => ({
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
      {/* MODAL: Create Project (Permitted for Limited Admins with PROJECT_CREATE) */}
      <Dialog
        isOpen={isProjectCreateOpen}
        onClose={() => setIsProjectCreateOpen(false)}
        title="Create New Project"
        description="Establish a new workspace project and collaborate with team members."
      >
        <form onSubmit={handleCreateProject} className="space-y-4">
          <Input
            label="Project Name *"
            placeholder="e.g. Mobile App Redesign"
            required
            value={projName}
            onChange={(e) => setProjName(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Assigned Date *"
              type="date"
              value={projAssignedDate}
              onChange={(e) => setProjAssignedDate(e.target.value)}
              required
            />
            <Input
              label="Target Due Date"
              type="date"
              value={projDueDate}
              min={projAssignedDate || undefined}
              onChange={(e) => setProjDueDate(e.target.value)}
            />
          </div>

          <Textarea
            label="Project Description"
            placeholder="Objectives, deliverables, and scope..."
            value={projDescription}
            onChange={(e) => setProjDescription(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
            <Button type="button" variant="outline" onClick={() => setIsProjectCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmittingProject} disabled={!projName.trim()}>
              Create Project
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
