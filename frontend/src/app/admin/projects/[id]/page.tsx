'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { projectsApi, employeesApi, tasksApi } from '@/lib/api';
import { Project, ProjectMember, Task, Employee, ProjectRole, TaskPriority } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { Dialog } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatSecondsToTime } from '@/lib/utils';
import {
  ArrowLeft,
  Briefcase,
  Users,
  CheckCircle2,
  Clock,
  Timer,
  Plus,
  UserPlus,
  UserMinus,
  Shield,
  Layers,
  Calendar,
  AlertCircle,
  MessageSquare,
  AtSign,
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

export default function AdminProjectDetailPage({ params }: { params?: { id: string } }) {
  const routeParams = useParams() as { id?: string };
  const projectId = params?.id || routeParams?.id || '';
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [activeTab, setActiveTab] = useState('TASKS');
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isAssignTaskOpen, setIsAssignTaskOpen] = useState(false);
  const [isEditRoleOpen, setIsEditRoleOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<ProjectMember | null>(null);

  // Add Member form state
  const [addEmpId, setAddEmpId] = useState('');
  const [addRole, setAddRole] = useState<ProjectRole>('DEVELOPER');
  const [isSubmittingMember, setIsSubmittingMember] = useState(false);

  // Edit Role form state
  const [editRole, setEditRole] = useState<string>('DEVELOPER');
  const [isSubmittingEditRole, setIsSubmittingEditRole] = useState(false);

  // Assign Task form state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskAssigneeId, setTaskAssigneeId] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('MEDIUM');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskEstMinutes, setTaskEstMinutes] = useState('');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  // Comments / Mentions Modal
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [selectedMentionId, setSelectedMentionId] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  const loadProject = useCallback(async () => {
    try {
      const [projData, emps] = await Promise.all([
        projectsApi.getById(projectId),
        employeesApi.list(),
      ]);
      setProject(projData);
      setAllEmployees(emps || []);
      if (projData.members && projData.members.length > 0 && !taskAssigneeId) {
        const activeMembers = projData.members.filter((m: any) => {
          const status = m.employee?.employmentStatus || m.employee?.employment_status || 'ACTIVE';
          const userStatus = m.employee?.user?.status;
          return status === 'ACTIVE' && userStatus !== 'INACTIVE';
        });
        if (activeMembers.length > 0) {
          setTaskAssigneeId(activeMembers[0].employeeId);
        }
      }
    } catch (err: any) {
      console.error('[ProjectDetail] Failed to load project:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, taskAssigneeId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addEmpId) return;

    setIsSubmittingMember(true);
    try {
      await projectsApi.addMember(projectId, {
        employeeId: addEmpId,
        projectRole: addRole,
      });
      setIsAddMemberOpen(false);
      setAddEmpId('');
      loadProject();
    } catch (err: any) {
      alert(err.message || 'Failed to add member');
    } finally {
      setIsSubmittingMember(false);
    }
  };

  const handleRemoveMember = async (member: ProjectMember) => {
    const name = member.employee?.displayName || member.employee?.firstName || 'this member';
    if (!confirm(`Are you sure you want to remove ${name} from this project? Historical task records will remain intact.`)) {
      return;
    }

    try {
      await projectsApi.removeMember(projectId, member.employeeId);
      loadProject();
    } catch (err: any) {
      alert(err.message || 'Failed to remove member');
    }
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember || !editRole) return;

    setIsSubmittingEditRole(true);
    try {
      await projectsApi.updateMemberRole(projectId, selectedMember.employeeId, {
        projectRole: editRole,
      });
      setIsEditRoleOpen(false);
      setSelectedMember(null);
      loadProject();
    } catch (err: any) {
      alert(err.message || 'Failed to update member role');
    } finally {
      setIsSubmittingEditRole(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !taskAssigneeId) return;

    setIsSubmittingTask(true);
    try {
      await projectsApi.createTask(projectId, {
        title: taskTitle,
        description: taskDesc || null,
        employeeId: taskAssigneeId,
        priority: taskPriority,
        dueDate: taskDueDate || null,
        estimatedMinutes: taskEstMinutes ? parseInt(taskEstMinutes, 10) : null,
      });
      setIsAssignTaskOpen(false);
      setTaskTitle('');
      setTaskDesc('');
      loadProject();
    } catch (err: any) {
      alert(err.message || 'Failed to create task');
    } finally {
      setIsSubmittingTask(false);
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

  if (isLoading) {
    return <LoadingState message="Loading project workspace..." />;
  }

  if (!project) {
    return (
      <div className="space-y-4">
        <Link href="/admin/tasks" className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-black">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Works
        </Link>
        <EmptyState title="Project Not Found" description="The requested project does not exist or you do not have permission to view it." />
      </div>
    );
  }

  // Available employees to add as members (only ACTIVE employees and not currently in team)
  const currentMemberIds = new Set(project.members?.map((m) => m.employeeId) || []);
  const availableEmployees = allEmployees.filter(
    (e) =>
      !currentMemberIds.has(e.id) &&
      e.employmentStatus === 'ACTIVE' &&
      (e as any).user?.status !== 'INACTIVE'
  );

  const tabs = [
    { id: 'TASKS', label: `Project Tasks (${project.tasks?.length || 0})` },
    { id: 'TEAM', label: `Team Members (${project.members?.length || 0})` },
    { id: 'ANALYTICS', label: 'Time & Member Breakdown' },
  ];

  return (
    <div className="space-y-6">
      {/* Navigation Breadcrumb */}
      <div>
        <Link
          href="/admin/tasks"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-black transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Works & Projects
        </Link>
      </div>

      {/* Project Header Card */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-black tracking-tight text-neutral-900">{project.name}</h1>
              <Badge variant={project.status === 'COMPLETED' ? 'success' : project.status === 'ON_HOLD' ? 'warning' : 'default'}>
                {project.status.replace('_', ' ')}
              </Badge>
            </div>
            {project.description && (
              <p className="text-sm text-neutral-600 mt-2 max-w-3xl leading-relaxed">{project.description}</p>
            )}
            <div className="flex items-center gap-4 text-xs text-neutral-400 mt-3 flex-wrap">
              {project.startDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> Started: {formatDate(project.startDate)}
                </span>
              )}
              {project.dueDate && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Due: {formatDate(project.dueDate)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={() => setIsAddMemberOpen(true)} variant="outline" className="gap-1.5 shadow-sm text-xs">
              <UserPlus className="w-3.5 h-3.5" /> Add Team Member
            </Button>
            <Button onClick={() => setIsAssignTaskOpen(true)} className="gap-1.5 shadow-sm text-xs">
              <Plus className="w-3.5 h-3.5" /> New Task
            </Button>
          </div>
        </div>

        {/* Project KPI Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-neutral-100">
          <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-100">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Team Size</span>
            <div className="text-xl font-bold text-neutral-900 mt-0.5 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-neutral-500" />
              {project.members?.length || 0} Members
            </div>
            {(() => {
              const activeCount =
                project.members?.filter(
                  (m) =>
                    m.employee?.employmentStatus === 'ACTIVE' &&
                    (m.employee as any)?.user?.status !== 'INACTIVE'
                ).length || 0;
              const inactiveCount = (project.members?.length || 0) - activeCount;
              return inactiveCount > 0 ? (
                <div className="text-[10px] text-neutral-400 mt-0.5">
                  {activeCount} Active · {inactiveCount} Inactive
                </div>
              ) : null;
            })()}
          </div>

          <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-100">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Project Tasks</span>
            <div className="text-xl font-bold text-neutral-900 mt-0.5 flex items-center gap-1.5">
              <Briefcase className="w-4 h-4 text-neutral-500" />
              {project.completedTasks || 0} / {project.totalTasks || 0}
            </div>
          </div>

          <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-100">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Total Worked Time</span>
            <div className="text-xl font-bold text-neutral-900 mt-0.5 font-mono flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-blue-600" />
              {formatSecondsToTime(project.totalWorkedSeconds || 0)}
            </div>
          </div>

          <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-100">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Live Timers</span>
            <div className="text-xl font-bold text-emerald-600 mt-0.5 flex items-center gap-1.5">
              <Timer className="w-4 h-4 text-emerald-500" />
              {project.activeTimersCount || 0} Active
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} tabs={tabs} />

      {/* TAB 1: Tasks */}
      {activeTab === 'TASKS' && (
        <Card className="p-0 border-neutral-200 overflow-hidden">
          {(!project.tasks || project.tasks.length === 0) ? (
            <div className="p-8">
              <EmptyState
                title="No Tasks in this Project"
                description="Assign tasks to team members to start tracking worked time and progress."
                actionLabel="Create First Task"
                onAction={() => setIsAssignTaskOpen(true)}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-neutral-50/50">
                  <TableHead className="font-bold text-xs uppercase text-neutral-500">Task Title</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-neutral-500">Assignee</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-neutral-500">Priority</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-neutral-500">Status</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-neutral-500">Time Tracked</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-neutral-500 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.tasks.map((task: any) => {
                  const isRunning = task.activeTimer || (task.timers && task.timers.some((t: any) => t.isActive));
                  return (
                    <TableRow key={task.id} className="hover:bg-neutral-50/80 transition-colors">
                      <TableCell>
                        <div className="font-bold text-neutral-900 text-sm">{task.title}</div>
                        {task.description && (
                          <div className="text-xs text-neutral-500 truncate max-w-md mt-0.5">{task.description}</div>
                        )}
                        {task.dueDate && (
                          <div className="text-[11px] text-neutral-400 mt-1">Due: {formatDate(task.dueDate)}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-neutral-900 text-white font-bold flex items-center justify-center text-[10px]">
                            {task.employee?.displayName?.[0] || 'E'}
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-neutral-900">{task.employee?.displayName}</div>
                          </div>
                        </div>
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
                                : 'secondary'
                            }
                          >
                            {task.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono font-bold text-xs text-neutral-900">
                          {formatSecondsToTime(task.totalDurationSeconds || 0)}
                        </div>
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
      )}

      {/* TAB 2: Team Members */}
      {activeTab === 'TEAM' && (
        <Card className="p-0 border-neutral-200 overflow-hidden">
          {(!project.members || project.members.length === 0) ? (
            <div className="p-8">
              <EmptyState
                title="No Members in Project"
                description="Add employees to this project with specialized roles like Developer, Tester, Designer, or Lead."
                actionLabel="Add Member"
                onAction={() => setIsAddMemberOpen(true)}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-neutral-50/50">
                  <TableHead className="font-bold text-xs uppercase text-neutral-500">Employee</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-neutral-500">Project Role</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-neutral-500">Department</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-neutral-500">Designation</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-neutral-500">Joined On</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-neutral-500 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.members.map((member) => {
                  const isMemberTerminated =
                    member.employee?.employmentStatus === 'TERMINATED' ||
                    (member.employee as any)?.user?.status === 'INACTIVE';
                  return (
                    <TableRow key={member.id} className={isMemberTerminated ? 'opacity-60 bg-neutral-50/50 hover:bg-neutral-50/80 transition-colors' : 'hover:bg-neutral-50/80 transition-colors'}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-black text-white font-bold flex items-center justify-center text-xs">
                            {member.employee?.displayName?.[0] || 'E'}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-neutral-900 text-sm">
                                {member.employee?.displayName || `${member.employee?.firstName} ${member.employee?.lastName}`}
                              </span>
                              {isMemberTerminated && (
                                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                                  TERMINATED
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-neutral-400">{member.employee?.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.projectRole === 'LEAD' ? 'default' : 'secondary'}>
                          {member.projectRole}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-neutral-600">
                        {member.employee?.department?.name || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-neutral-600">
                        {member.employee?.designation?.name || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-neutral-400">
                        {formatDate(member.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedMember(member);
                              setEditRole(member.projectRole);
                              setIsEditRoleOpen(true);
                            }}
                            className="h-7 text-xs"
                          >
                            Change Role
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveMember(member)}
                            className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      {/* TAB 3: Time & Member Breakdown */}
      {activeTab === 'ANALYTICS' && (
        <Card className="p-6 border-neutral-200 bg-white">
          <h3 className="text-base font-bold text-neutral-900 mb-4">Employee Time Logged on Project</h3>
          {(!project.employeeBreakdown || project.employeeBreakdown.length === 0) ? (
            <EmptyState title="No Time Logged Yet" description="Worked time will appear here automatically as team members run timers on project tasks." />
          ) : (
            <div className="space-y-4">
              {project.employeeBreakdown.map((item) => {
                const totalSeconds = project.totalWorkedSeconds || 1;
                const percentage = Math.min(100, Math.round((item.totalWorkedSeconds / totalSeconds) * 100));

                return (
                  <div key={item.employeeId} className="p-4 bg-neutral-50 rounded-xl border border-neutral-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-neutral-900 text-white font-bold flex items-center justify-center text-xs">
                          {item.displayName[0]}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-neutral-900">{item.displayName}</div>
                          <div className="text-[11px] text-neutral-500">{item.taskCount} tasks assigned</div>
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

      {/* MODAL: Add Member */}
      <Dialog
        isOpen={isAddMemberOpen}
        onClose={() => setIsAddMemberOpen(false)}
        title="Add Team Member"
        description="Add an employee to this project with a specialized role."
      >
        <form onSubmit={handleAddMember} className="space-y-4">
          <Select
            label="Select Employee *"
            value={addEmpId}
            onChange={(e) => setAddEmpId(e.target.value)}
            options={[
              { value: '', label: '-- Choose Employee --' },
              ...availableEmployees.map((e) => ({
                value: e.id,
                label: `${e.displayName || e.firstName} (${e.department?.name || 'Staff'})`,
              })),
            ]}
          />

          <Select
            label="Project Role *"
            value={addRole}
            onChange={(e) => setAddRole(e.target.value as ProjectRole)}
            options={PROJECT_ROLES}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
            <Button type="button" variant="outline" onClick={() => setIsAddMemberOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmittingMember} disabled={!addEmpId}>
              Add to Team
            </Button>
          </div>
        </form>
      </Dialog>

      {/* MODAL: Edit Member Role */}
      <Dialog
        isOpen={isEditRoleOpen}
        onClose={() => setIsEditRoleOpen(false)}
        title="Change Project Role"
        description={`Update the role for ${selectedMember?.employee?.displayName || 'this member'}.`}
      >
        <form onSubmit={handleUpdateRole} className="space-y-4">
          <Select
            label="Project Role *"
            value={editRole}
            onChange={(e) => setEditRole(e.target.value)}
            options={PROJECT_ROLES}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
            <Button type="button" variant="outline" onClick={() => setIsEditRoleOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmittingEditRole}>
              Update Role
            </Button>
          </div>
        </form>
      </Dialog>

      {/* MODAL: Assign Task */}
      <Dialog
        isOpen={isAssignTaskOpen}
        onClose={() => setIsAssignTaskOpen(false)}
        title="Create Task Under Project"
        description="Assign a task to a project member with priority and deadlines."
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          <Input
            label="Task Title *"
            placeholder="e.g. Implement user authentication flow"
            required
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
          />

          <Select
            label="Assignee (Active Project Member) *"
            value={taskAssigneeId}
            onChange={(e) => setTaskAssigneeId(e.target.value)}
            options={[
              { value: '', label: '-- Choose Project Member --' },
              ...(project.members
                ?.filter((m) => {
                  const status = m.employee?.employmentStatus || (m.employee as any)?.employment_status || 'ACTIVE';
                  const userStatus = (m.employee as any)?.user?.status;
                  return status === 'ACTIVE' && userStatus !== 'INACTIVE';
                })
                .map((m) => ({
                  value: m.employeeId,
                  label: `${m.employee?.displayName || m.employee?.firstName || 'Team Member'} (${m.projectRole})`,
                })) || []),
            ]}
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
              label="Due Date"
              type="date"
              value={taskDueDate}
              onChange={(e) => setTaskDueDate(e.target.value)}
            />
          </div>

          <Input
            label="Estimated Time (Minutes)"
            type="number"
            placeholder="e.g. 120"
            value={taskEstMinutes}
            onChange={(e) => setTaskEstMinutes(e.target.value)}
          />

          <Textarea
            label="Task Description"
            placeholder="Detailed instructions or acceptance criteria..."
            value={taskDesc}
            onChange={(e) => setTaskDesc(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
            <Button type="button" variant="outline" onClick={() => setIsAssignTaskOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmittingTask} disabled={!taskTitle.trim() || !taskAssigneeId}>
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
              placeholder="Write a comment... (Type your feedback or updates)"
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
                  ...(project.members
                    ?.filter(
                      (m) =>
                        m.employee?.employmentStatus === 'ACTIVE' &&
                        (m.employee as any)?.user?.status !== 'INACTIVE'
                    )
                    .map((m) => ({
                      value: m.employeeId,
                      label: `@${m.employee?.displayName || m.employee?.firstName} (${m.projectRole})`,
                    })) || []),
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
