'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { hasPermission } from '@/lib/permissions';
import { projectsApi, employeesApi } from '@/lib/api';
import { Project, Employee, ProjectStatus, ProjectRole } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/utils';
import {
  FolderKanban,
  Plus,
  Search,
  Users,
  Clock,
  CheckCircle2,
  Calendar,
  Briefcase,
  Layers,
  ArrowRight,
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

export default function LimitedAdminProjectsPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();

  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Permission Checks
  const canCreateProject = useMemo(() => hasPermission(user, 'PROJECT_CREATE'), [user]);
  const canManageTeam = useMemo(() => hasPermission(user, ['MANAGE_PROJECT_TEAM', 'PROJECT_UPDATE', 'TEAM_MEMBER_ADD']), [user]);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Form state
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [projectLeadId, setProjectLeadId] = useState('');
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>('IN_PROGRESS');
  const [projectDueDate, setProjectDueDate] = useState('');
  const [selectedTeamMemberIds, setSelectedTeamMemberIds] = useState<{ employeeId: string; projectRole: ProjectRole }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (searchParams.get('action') === 'new' && canCreateProject) {
      setIsCreateOpen(true);
    }
  }, [searchParams, canCreateProject]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [projList, emps] = await Promise.all([
        projectsApi.list({
          search: search || undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          adminView: true,
        }),
        employeesApi.listAssignable().catch((err) => {
          console.warn('Could not load assignable employees:', err);
          return [];
        }),
      ]);
      setProjects(Array.isArray(projList) ? projList : []);
      const validEmps = Array.isArray(emps) ? emps : [];
      setEmployees(validEmps);
      setProjectLeadId((prev) => prev || user?.employeeId || (validEmps[0]?.id ?? ''));
    } catch (err: any) {
      console.error('Failed to load projects data:', err);
      setLoadError(err.message || 'Unable to load projects. Please verify your permissions and network connection.');
    } finally {
      setIsLoading(false);
    }
  }, [search, statusFilter, user?.employeeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    setIsSubmitting(true);
    try {
      const members = [...selectedTeamMemberIds];
      if (projectLeadId && !members.some((m) => m.employeeId === projectLeadId)) {
        members.unshift({ employeeId: projectLeadId, projectRole: 'LEAD' });
      }

      await projectsApi.create({
        name: projectName.trim(),
        description: projectDesc || null,
        employeeId: projectLeadId || null,
        status: projectStatus,
        dueDate: projectDueDate || null,
        members,
      });

      setIsCreateOpen(false);
      setProjectName('');
      setProjectDesc('');
      setSelectedTeamMemberIds([]);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to create project');
    } finally {
      setIsSubmitting(false);
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

  if (isLoading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading projects..." />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-12 max-w-lg mx-auto">
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="p-6 text-center space-y-4">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Unable to Load Projects</h3>
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
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">Project Administration</h1>
            <Badge variant="outline" className="text-[10px] bg-neutral-50 text-neutral-600">
              Limited Admin
            </Badge>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Oversee project timelines, deliverables, and team assignments within your scope.
          </p>
        </div>

        {canCreateProject && (
          <Button
            onClick={() => setIsCreateOpen(true)}
            size="sm"
            className="bg-neutral-900 hover:bg-black text-white text-xs gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            New Project
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
                placeholder="Search projects by name or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-xs h-8"
              />
            </div>

            <div className="w-40">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs h-8"
              >
                <option value="ALL">All Statuses</option>
                <option value="PLANNING">Planning</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="ON_HOLD">On Hold</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="p-8 border border-neutral-200 rounded-lg bg-white">
          <EmptyState
            title="No Projects Found"
            description="You do not have any projects assigned within your administrative scope."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <Card key={p.id} className="border-neutral-200 hover:border-neutral-900 transition-all flex flex-col justify-between">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-bold text-neutral-900 leading-tight">{p.name}</CardTitle>
                  <Badge
                    variant={p.status === 'COMPLETED' ? 'success' : p.status === 'IN_PROGRESS' ? 'info' : 'secondary'}
                    className="text-[10px] font-semibold shrink-0"
                  >
                    {p.status}
                  </Badge>
                </div>
                {p.description && (
                  <CardDescription className="text-xs text-neutral-500 line-clamp-2 mt-1">
                    {p.description}
                  </CardDescription>
                )}
              </CardHeader>

              <CardContent className="p-4 pt-2 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-neutral-100 text-neutral-600">
                  <div>
                    <span className="text-neutral-400 block text-[10px]">Tasks</span>
                    <span className="font-semibold text-neutral-900">{p.completedTasks || 0} / {p.totalTasks || 0} done</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[10px]">Hours Logged</span>
                    <span className="font-semibold text-neutral-900">{p.totalWorkedHours || 0} hrs</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 text-neutral-600">
                    <Users className="w-3.5 h-3.5 text-neutral-400" />
                    <span>{p.members?.length || 0} Members</span>
                  </div>

                  <Button
                    onClick={() => setSelectedProject(p)}
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2 text-neutral-700 hover:text-black"
                  >
                    View Details →
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      <Dialog title="Create New Project" isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)}>
        <div className="p-5 max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <div className="mb-4">
            <h3 className="text-base font-bold text-neutral-900">Create New Project</h3>
            <p className="text-xs text-neutral-500">
              Set up a project and assign initial team members within your authorized scope.
            </p>
          </div>

          <form onSubmit={handleCreateProject} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Project Name *</label>
              <Input
                required
                placeholder="e.g. WorkOS Mobile Client"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Description</label>
              <Textarea
                placeholder="Project objectives and scope..."
                value={projectDesc}
                onChange={(e) => setProjectDesc(e.target.value)}
                rows={2}
                className="text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Project Lead</label>
                <Select
                  value={projectLeadId}
                  onChange={(e) => setProjectLeadId(e.target.value)}
                  className="text-xs"
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.displayName || e.firstName} ({e.employeeCode})
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Status</label>
                <Select
                  value={projectStatus}
                  onChange={(e) => setProjectStatus(e.target.value as ProjectStatus)}
                  className="text-xs"
                >
                  <option value="PLANNING">Planning</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="ON_HOLD">On Hold</option>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Due Date</label>
              <Input
                type="date"
                value={projectDueDate}
                onChange={(e) => setProjectDueDate(e.target.value)}
                className="text-xs"
              />
            </div>

            {/* Team Members Selection */}
            {canManageTeam && (
              <div className="pt-2 border-t border-neutral-100">
                <label className="block text-xs font-semibold text-neutral-700 mb-2">Team Members</label>
                <div className="max-h-40 overflow-y-auto space-y-1.5 border border-neutral-200 rounded p-2 bg-neutral-50/50">
                  {employees.map((emp) => {
                    const selected = selectedTeamMemberIds.find((m) => m.employeeId === emp.id);
                    return (
                      <div key={emp.id} className="flex items-center justify-between text-xs py-1 px-1.5 hover:bg-white rounded">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={!!selected || projectLeadId === emp.id}
                            disabled={projectLeadId === emp.id}
                            onChange={() => toggleTeamMember(emp.id)}
                            className="rounded border-neutral-300"
                          />
                          <span className="font-medium text-neutral-800">
                            {emp.displayName || emp.firstName}
                          </span>
                        </label>

                        {selected && (
                          <div className="w-32">
                            <Select
                              value={selected.projectRole}
                              onChange={(e) => updateSelectedRole(emp.id, e.target.value as ProjectRole)}
                              className="text-[10px] h-6 py-0"
                            >
                              {PROJECT_ROLES.map((r) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                              ))}
                            </Select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
                disabled={isSubmitting}
                className="bg-neutral-900 hover:bg-black text-white text-xs"
              >
                {isSubmitting ? 'Creating...' : 'Create Project'}
              </Button>
            </div>
          </form>
        </div>
      </Dialog>

      {/* Project Details Modal */}
      <Dialog title="Project Details" isOpen={!!selectedProject} onClose={() => setSelectedProject(null)}>
        <div className="p-5 max-w-xl w-full max-h-[85vh] overflow-y-auto">
          {selectedProject && (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-neutral-900">{selectedProject.name}</h3>
                  <p className="text-xs text-neutral-500">{selectedProject.description || 'No description provided.'}</p>
                </div>
                <Badge variant={selectedProject.status === 'COMPLETED' ? 'success' : 'info'}>
                  {selectedProject.status}
                </Badge>
              </div>

              <div className="pt-2 border-t border-neutral-100">
                <h4 className="text-xs font-bold text-neutral-700 mb-2 uppercase tracking-wider">Team Members ({selectedProject.members?.length || 0})</h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {selectedProject.members?.map((m) => (
                    <div key={m.id} className="p-2 rounded bg-neutral-50 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-neutral-900">{m.employee?.displayName || m.employee?.firstName || 'Member'}</span>
                        <span className="text-[10px] text-neutral-500 block">{m.employee?.email}</span>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">
                        {m.projectRole}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-neutral-100">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedProject(null)}
                  className="text-xs"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
