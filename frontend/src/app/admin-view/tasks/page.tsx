'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { hasPermission } from '@/lib/permissions';
import { tasksApi, employeesApi, projectsApi } from '@/lib/api';
import { Task, Employee, TaskPriority, Project, ProjectRole } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
  ArrowRight,
  TrendingUp,
  MessageSquare,
  AtSign,
  Trash2,
  Edit,
  ShieldAlert,
} from 'lucide-react';

export default function LimitedAdminTasksPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedEmp, setSelectedEmp] = useState('');
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  // Permission Checks
  const canCreateTask = useMemo(() => hasPermission(user, 'TASK_CREATE'), [user]);
  const canAssignTask = useMemo(() => hasPermission(user, 'TASK_ASSIGN'), [user]);
  const canDeleteTask = useMemo(() => hasPermission(user, 'TASK_DELETE'), [user]);
  const canUpdateTask = useMemo(() => hasPermission(user, ['TASK_UPDATE', 'TASK_EDIT']), [user]);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Comments / Mentions Modal
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [selectedMentionId, setSelectedMentionId] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Create / Assign Task Form
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [targetEmpId, setTargetEmpId] = useState('');
  const [taskProjId, setTaskProjId] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('MEDIUM');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskEstMinutes, setTaskEstMinutes] = useState('');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  // Open create modal if URL has ?action=new
  useEffect(() => {
    if (searchParams.get('action') === 'new' && canCreateTask) {
      setIsCreateOpen(true);
    }
  }, [searchParams, canCreateTask]);

  // 1-second continuous tick for live running timers
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [taskList, emps, projList] = await Promise.all([
        tasksApi.list({
          search: search || undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          adminView: true,
          ...(selectedEmp ? { employeeId: selectedEmp } : {}),
          sortBy,
          sortOrder,
        }),
        employeesApi.listAssignable().catch((err) => {
          console.warn('Could not load assignable employees:', err);
          return [];
        }),
        projectsApi.list({ adminView: true }).catch((err) => {
          console.warn('Could not load projects for tasks:', err);
          return [];
        }),
      ]);
      setTasks(Array.isArray(taskList) ? taskList : []);
      const validEmps = Array.isArray(emps) ? emps : [];
      setEmployees(validEmps);
      setProjects(Array.isArray(projList) ? projList : []);

      setTargetEmpId((prev) => {
        if (prev) return prev;
        if (!canAssignTask && user?.employeeId) {
          return user.employeeId;
        }
        return validEmps[0]?.id || user?.employeeId || '';
      });
    } catch (err: any) {
      console.error('Failed to load tasks data:', err);
      setLoadError(err.message || 'Unable to load tasks. Please verify your permissions and network connection.');
    } finally {
      setIsLoading(false);
    }
  }, [search, statusFilter, selectedEmp, canAssignTask, user?.employeeId, sortBy, sortOrder]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    // If user lacks TASK_ASSIGN, enforce assignment to self only
    const finalAssigneeId = canAssignTask ? (targetEmpId || user?.employeeId) : user?.employeeId;
    if (!finalAssigneeId) {
      alert('Assignee is required.');
      return;
    }

    setIsSubmittingTask(true);
    try {
      if (taskProjId) {
        await projectsApi.createTask(taskProjId, {
          title: taskTitle,
          description: taskDesc || null,
          employeeId: finalAssigneeId,
          priority: taskPriority,
          dueDate: taskDueDate || null,
          estimatedMinutes: taskEstMinutes ? parseInt(taskEstMinutes, 10) : null,
        });
      } else {
        await tasksApi.create({
          title: taskTitle,
          description: taskDesc || null,
          employeeId: finalAssigneeId,
          priority: taskPriority,
          dueDate: taskDueDate || null,
          estimatedMinutes: taskEstMinutes ? parseInt(taskEstMinutes, 10) : null,
        });
      }
      setIsCreateOpen(false);
      setTaskTitle('');
      setTaskDesc('');
      setTaskProjId('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to create task');
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!taskToDelete) return;
    setIsDeleting(true);
    try {
      await tasksApi.delete(taskToDelete.id);
      setIsDeleteOpen(false);
      setTaskToDelete(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete task. You may lack permission (TASK_DELETE required).');
    } finally {
      setIsDeleting(false);
    }
  };

  const openTaskComments = async (task: Task) => {
    setSelectedTask(task);
    try {
      const c = await tasksApi.listComments(task.id);
      setComments(c || []);
    } catch {
      setComments([]);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !newComment.trim()) return;
    setIsSubmittingComment(true);
    try {
      await tasksApi.addComment(selectedTask.id, {
        content: newComment.trim(),
        mentionEmployeeIds: selectedMentionId ? [selectedMentionId] : [],
      });
      setNewComment('');
      setSelectedMentionId('');
      const updated = await tasksApi.listComments(selectedTask.id);
      setComments(updated || []);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to add comment');
    } finally {
      setIsSubmittingComment(false);
    }
  };

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
        <LoadingState message="Loading tasks..." />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-12 max-w-lg mx-auto">
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="p-6 text-center space-y-4">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Unable to Load Tasks</h3>
              <p className="text-xs text-neutral-600 mt-1">{loadError}</p>
            </div>
            <Button
              onClick={() => loadData()}
              size="sm"
              className="bg-neutral-900 hover:bg-black text-white text-xs"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">Task Administration</h1>
            <Badge variant="outline" className="text-[10px] bg-neutral-50 text-neutral-600">
              Limited Admin
            </Badge>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Oversee, assign, and review tasks within your assigned projects and scope.
          </p>
        </div>

        {canCreateTask && (
          <Button
            onClick={() => setIsCreateOpen(true)}
            size="sm"
            className="bg-neutral-900 hover:bg-black text-white text-xs gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Task
          </Button>
        )}
      </div>

      {/* Filter Bar */}
      <Card className="border-neutral-200">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-neutral-400" />
              <Input
                placeholder="Search tasks by title, code or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-xs h-8"
              />
            </div>

            <div className="w-36">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs h-8"
              >
                <option value="ALL">All Statuses</option>
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="PAUSED">Paused</option>
                <option value="COMPLETED">Completed</option>
              </Select>
            </div>

            {employees.length > 0 && canAssignTask && (
              <div className="w-44">
                <Select
                  value={selectedEmp}
                  onChange={(e) => setSelectedEmp(e.target.value)}
                  className="text-xs h-8"
                >
                  <option value="">All Assignees</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.displayName || e.firstName} ({e.employeeCode})
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tasks Table */}
      <Card className="border-neutral-200">
        <CardContent className="p-0">
          {tasks.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No Tasks Found"
                description="No tasks match your current filter criteria or scope."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-neutral-100 bg-neutral-50 text-[11px]">
                    <TableHead className="py-2.5 font-bold text-neutral-700">Code</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Task Title</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Project</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Assignee</TableHead>
                    <TableHead
                      onClick={() => handleSort('createdAt')}
                      className="py-2.5 font-bold text-neutral-700 hover:text-black cursor-pointer select-none transition-colors"
                      title="Click to toggle sorting by Created Date (Newest / Oldest)"
                    >
                      <div className="flex items-center gap-1">
                        <span>Created</span>
                        {sortBy === 'createdAt' ? (
                          sortOrder === 'desc' ? (
                            <span className="text-black font-extrabold text-xs" title="Newest first">↓</span>
                          ) : (
                            <span className="text-black font-extrabold text-xs" title="Oldest first">↑</span>
                          )
                        ) : (
                          <span className="text-neutral-400 text-xs opacity-60">↕</span>
                        )}
                      </div>
                    </TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Priority</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Status</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Worked Time</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Due Date</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((t: any) => {
                    const isLive = t.activeTimer || (t.timers && Array.isArray(t.timers) && t.timers.some((tm: any) => tm.isActive));
                    const liveSec = calculateLiveTaskDuration(t, currentTimeMs);
                    return (
                      <TableRow key={t.id} className="border-b border-neutral-100 hover:bg-neutral-50/70 text-xs">
                        <TableCell className="py-2.5 font-mono text-[11px] font-bold text-neutral-600">
                          {t.taskCode || t.code || '—'}
                        </TableCell>
                        <TableCell className="py-2.5 font-semibold text-neutral-900 max-w-[220px] truncate">
                          {t.title}
                        </TableCell>
                        <TableCell className="py-2.5 text-neutral-600 text-[11px]">
                          {t.project?.name || '—'}
                        </TableCell>
                        <TableCell className="py-2.5 text-neutral-700">
                          {t.employee?.displayName || t.employee?.firstName || 'Unassigned'}
                        </TableCell>
                        <TableCell className="py-2.5 text-neutral-700 whitespace-nowrap">
                          <div className="font-medium text-neutral-900">{formatDate(t.createdAt)}</div>
                          <div className="text-[10px] text-neutral-400 font-mono">
                            {formatTime(t.createdAt)}
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <Badge
                            variant={
                              t.priority === 'URGENT'
                                ? 'danger'
                                : t.priority === 'HIGH'
                                ? 'warning'
                                : 'secondary'
                            }
                            className="text-[9px] font-semibold"
                          >
                            {t.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <Badge
                            variant={
                              t.status === 'COMPLETED'
                                ? 'success'
                                : t.status === 'IN_PROGRESS'
                                ? 'info'
                                : t.status === 'PAUSED'
                                ? 'warning'
                                : 'secondary'
                            }
                            className="text-[9px] font-semibold"
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
                        <TableCell className="py-2.5 text-neutral-500 text-[11px]">
                          {t.dueDate ? formatDate(t.dueDate) : '—'}
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openTaskComments(t)}
                              aria-label="Comments"
                              className="p-1 rounded text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                            {canDeleteTask && (
                              <button
                                onClick={() => {
                                  setTaskToDelete(t);
                                  setIsDeleteOpen(true);
                                }}
                                aria-label="Delete Task"
                                className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
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

      {/* Create Task Modal */}
      <Dialog title="Create & Assign Task" isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)}>
        <div className="p-5 max-w-lg w-full">
          <div className="mb-4">
            <h3 className="text-base font-bold text-neutral-900">Create & Assign Task</h3>
            <p className="text-xs text-neutral-500">
              Create a new task within your permitted projects and assign to team members.
            </p>
          </div>

          <form onSubmit={handleCreateTask} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Task Title *</label>
              <Input
                required
                placeholder="e.g. Implement authentication middleware"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                className="text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Description</label>
              <Textarea
                placeholder="Task details and acceptance criteria..."
                value={taskDesc}
                onChange={(e) => setTaskDesc(e.target.value)}
                rows={3}
                className="text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Project</label>
                <Select
                  value={taskProjId}
                  onChange={(e) => setTaskProjId(e.target.value)}
                  className="text-xs"
                >
                  <option value="">No Project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Assignee {canAssignTask ? '*' : '(Self)'}
                </label>
                {canAssignTask ? (
                  <Select
                    value={targetEmpId}
                    onChange={(e) => setTargetEmpId(e.target.value)}
                    className="text-xs"
                    required
                  >
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.displayName || e.firstName} ({e.employeeCode})
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    disabled
                    value={`${user?.displayName || 'Current User'} (Self)`}
                    className="text-xs bg-neutral-100 text-neutral-600"
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Priority</label>
                <Select
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                  className="text-xs"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </Select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Due Date</label>
                <Input
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Est. Minutes</label>
                <Input
                  type="number"
                  placeholder="60"
                  value={taskEstMinutes}
                  onChange={(e) => setTaskEstMinutes(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmittingTask}
                className="bg-neutral-900 hover:bg-black text-white text-xs"
              >
                {isSubmittingTask ? 'Creating...' : 'Create Task'}
              </Button>
            </div>
          </form>
        </div>
      </Dialog>

      {/* Delete Confirmation Modal (Available ONLY if user has TASK_DELETE) */}
      <Dialog title="Delete Task" isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)}>
        <div className="p-5 max-w-md w-full">
          <h3 className="text-base font-bold text-neutral-900 mb-2">Delete Task</h3>
          <p className="text-xs text-neutral-600 mb-4">
            Are you sure you want to delete task <span className="font-bold text-neutral-900">"{taskToDelete?.title}"</span>? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isDeleting}
              onClick={handleDeleteTask}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs"
            >
              {isDeleting ? 'Deleting...' : 'Confirm Delete'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Task Comments Modal */}
      <Dialog title="Comments & Mentions" isOpen={!!selectedTask} onClose={() => setSelectedTask(null)}>
        <div className="p-5 max-w-lg w-full max-h-[85vh] flex flex-col">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-neutral-900 truncate">{selectedTask?.title}</h3>
            <p className="text-[11px] text-neutral-500">Comments & Mentions</p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 mb-4 pr-1">
            {comments.length === 0 ? (
              <p className="text-xs text-neutral-400 py-4 text-center">No comments on this task yet.</p>
            ) : (
              comments.map((c: any) => (
                <div key={c.id} className="p-2.5 rounded bg-neutral-50 border border-neutral-100 text-xs">
                  <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-1">
                    <span className="font-semibold text-neutral-700">{c.authorName || 'Author'}</span>
                    <span>{formatDate(c.createdAt)}</span>
                  </div>
                  <p className="text-neutral-800">{c.content}</p>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleAddComment} className="space-y-2 border-t border-neutral-100 pt-3">
            <Textarea
              placeholder="Write a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={2}
              className="text-xs"
            />
            <div className="flex items-center justify-between">
              {employees.length > 0 && (
                <div className="w-48">
                  <Select
                    value={selectedMentionId}
                    onChange={(e) => setSelectedMentionId(e.target.value)}
                    className="text-[11px] h-7"
                  >
                    <option value="">@ Mention member...</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        @{e.displayName || e.firstName}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <Button
                type="submit"
                size="sm"
                disabled={isSubmittingComment || !newComment.trim()}
                className="text-xs h-7 ml-auto bg-neutral-900 text-white"
              >
                {isSubmittingComment ? 'Posting...' : 'Post Comment'}
              </Button>
            </div>
          </form>
        </div>
      </Dialog>
    </div>
  );
}
