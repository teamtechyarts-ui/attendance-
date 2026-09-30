'use client';

import React, { useState, useEffect } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/ui/loading-state';
import { rbacApi, metadataApi, projectsApi } from '@/lib/api';
import {
  Permission,
  PermissionDefinition,
  PermissionCategory,
  LimitedAdminAssignment,
  Department,
  Project,
} from '@/types';
import {
  Shield,
  CheckSquare,
  Square,
  AlertTriangle,
  FolderKanban,
  CheckCircle2,
  Lock,
  Layers,
  Sparkles,
} from 'lucide-react';

interface ManageAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: {
    id: string;
    displayName: string;
    email: string;
    employeeCode?: string | null;
    departmentName?: string | null;
  } | null;
  onSuccess: () => void;
}

const CATEGORY_LABELS: Record<PermissionCategory, { label: string; icon: string }> = {
  TASKS: { label: 'Tasks & Assignment', icon: 'CheckSquare' },
  PROJECTS: { label: 'Projects & Workspaces', icon: 'FolderKanban' },
  TEAMS: { label: 'Team Members', icon: 'Users' },
  WORK: { label: 'Work & Live Timers', icon: 'Clock' },
  REPORTS: { label: 'Work Reports', icon: 'FileText' },
  EMPLOYEES: { label: 'Employee Directory', icon: 'UserCheck' },
  ATTENDANCE: { label: 'Attendance Management', icon: 'Calendar' },
  LEAVE: { label: 'Leave Requests', icon: 'Palmtree' },
  SETTINGS: { label: 'System Settings', icon: 'Sliders' },
  SECURITY: { label: 'Security & Audit', icon: 'Shield' },
};

// Module-level in-memory cache for static master metadata across modal invocations
let cachedPermissions: PermissionDefinition[] | null = null;
let cachedDepartments: Department[] | null = null;
let cachedProjects: Project[] | null = null;

export function ManageAccessModal({ isOpen, onClose, employee, onSuccess }: ManageAccessModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [permissionsList, setPermissionsList] = useState<PermissionDefinition[]>(() => cachedPermissions || []);
  const [assignment, setAssignment] = useState<LimitedAdminAssignment | null>(null);
  const [departments, setDepartments] = useState<Department[]>(() => cachedDepartments || []);
  const [projects, setProjects] = useState<Project[]>(() => cachedProjects || []);

  // Selected Permissions
  const [selectedPermissions, setSelectedPermissions] = useState<Set<Permission>>(new Set());

  // Scope state
  const [scopeMode, setScopeMode] = useState<'GLOBAL' | 'SCOPED'>('GLOBAL');
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [adminNotes, setAdminNotes] = useState<string>('');

  const employeeId = employee?.id;

  useEffect(() => {
    if (!isOpen || !employeeId) return;

    let mounted = true;
    setIsLoading(true);
    setError(null);

    const loadMeta = async () => {
      try {
        const [perms, assign, depts, projs] = await Promise.all([
          cachedPermissions ? Promise.resolve(cachedPermissions) : rbacApi.getPermissions().catch(() => []),
          rbacApi.getAssignment(employeeId),
          cachedDepartments ? Promise.resolve(cachedDepartments) : metadataApi.getDepartments().catch(() => []),
          cachedProjects ? Promise.resolve(cachedProjects) : projectsApi.list().catch(() => []),
        ]);

        const normalizedPerms: PermissionDefinition[] = (perms || []).map((p: any) => ({
          key: (p.key || p.id) as Permission,
          label: p.label,
          description: p.description,
          category: ((p.category || p.group || 'TASKS') as string).toUpperCase() as PermissionCategory,
          isSensitive: p.isSensitive || false,
        }));

        if (!mounted) return;

        if (normalizedPerms.length > 0) {
          cachedPermissions = normalizedPerms;
          setPermissionsList(normalizedPerms);
        }
        if (depts && depts.length > 0) {
          cachedDepartments = depts;
          setDepartments(depts);
        }
        if (projs && projs.length > 0) {
          cachedProjects = projs;
          setProjects(projs);
        }

        setAssignment(assign);

        if (assign?.config) {
          const granted = new Set<Permission>((assign.config.permissions || []) as Permission[]);
          setSelectedPermissions(granted);
          const sc = assign.config.scope;
          const deptIds = (sc?.departments || (sc as any)?.departmentIds || []) as string[];
          const projIds = (sc?.projects || (sc as any)?.projectIds || []) as string[];
          const empIds = (sc?.employees || (sc as any)?.employeeIds || []) as string[];

          if (sc && (deptIds.length > 0 || projIds.length > 0 || empIds.length > 0)) {
            setScopeMode('SCOPED');
            setSelectedDepartmentIds(deptIds);
            setSelectedProjectIds(projIds);
          } else {
            setScopeMode('GLOBAL');
            setSelectedDepartmentIds([]);
            setSelectedProjectIds([]);
          }
          setAdminNotes(assign.config.notes || (assign.config as any)?.description || '');
        } else {
          // Default: start empty
          setSelectedPermissions(new Set());
          setScopeMode('GLOBAL');
          setSelectedDepartmentIds([]);
          setSelectedProjectIds([]);
          setAdminNotes('');
        }
      } catch (err: any) {
        if (!mounted) return;
        setError(err.message || 'Failed to load permissions and assignment data.');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadMeta();

    return () => {
      mounted = false;
    };
  }, [isOpen, employeeId]);

  if (!isOpen || !employee) return null;

  const isSuperAdmin = assignment?.isSuperAdmin;

  const togglePermission = (perm: Permission) => {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) {
        next.delete(perm);
      } else {
        next.add(perm);
      }
      return next;
    });
  };

  const toggleCategory = (cat: PermissionCategory) => {
    const catPerms = permissionsList.filter((p) => p.category === cat).map((p) => p.key);
    const allSelected = catPerms.every((p) => selectedPermissions.has(p));

    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      for (const p of catPerms) {
        if (allSelected) {
          next.delete(p);
        } else {
          next.add(p);
        }
      }
      return next;
    });
  };

  // Presets
  const applyPreset = (type: 'PM' | 'HR' | 'ALL' | 'CLEAR') => {
    if (type === 'CLEAR') {
      setSelectedPermissions(new Set());
      return;
    }
    if (type === 'ALL') {
      setSelectedPermissions(new Set(permissionsList.map((p) => p.key)));
      return;
    }
    if (type === 'PM') {
      const pmKeys: Permission[] = [
        'TASK_VIEW',
        'TASK_CREATE',
        'TASK_UPDATE',
        'TASK_ASSIGN',
        'TASK_CLOSE',
        'PROJECT_VIEW',
        'PROJECT_CREATE',
        'PROJECT_UPDATE',
        'PROJECT_ASSIGN',
        'TEAM_VIEW',
        'TEAM_MEMBER_ADD',
        'TEAM_MEMBER_REMOVE',
        'WORK_VIEW',
        'WORK_MANAGE',
      ];
      setSelectedPermissions(new Set(pmKeys));
      return;
    }
    if (type === 'HR') {
      const hrKeys: Permission[] = [
        'EMPLOYEE_VIEW',
        'EMPLOYEE_CREATE',
        'EMPLOYEE_UPDATE',
        'ATTENDANCE_VIEW',
        'ATTENDANCE_MANAGE',
        'LEAVE_VIEW',
        'LEAVE_MANAGE',
        'REPORT_VIEW',
      ];
      setSelectedPermissions(new Set(hrKeys));
      return;
    }
  };

  const handleSave = async () => {
    if (selectedPermissions.size === 0) {
      setError('Please select at least one permission to grant Limited Admin access, or click Revoke Access.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const scope =
        scopeMode === 'SCOPED'
          ? {
              departmentIds: selectedDepartmentIds.length > 0 ? selectedDepartmentIds : undefined,
              projectIds: selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
            }
          : null;

      await rbacApi.grantAssignment(employee.id, {
        permissions: Array.from(selectedPermissions),
        scope,
        notes: adminNotes.trim() || null,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save access permissions');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async () => {
    if (!confirm(`Are you sure you want to revoke all administrative access for ${employee.displayName}? They will return to standard Employee role.`)) {
      return;
    }

    setIsRevoking(true);
    setError(null);

    try {
      await rbacApi.revokeAssignment(employee.id);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke admin access');
    } finally {
      setIsRevoking(false);
    }
  };

  // Group permissions by category
  const categories = Array.from(new Set(permissionsList.map((p) => p.category))) as PermissionCategory[];

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Role & Permission Access Control"
      className="max-w-3xl"
    >
      <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
        {/* Employee Header Banner */}
        <div className="p-4 rounded-xl bg-neutral-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold text-base text-white border border-white/20">
              {(employee.displayName || 'E').charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">{employee.displayName}</span>
                {employee.employeeCode && (
                  <Badge variant="outline" className="text-[10px] text-white/80 border-white/20 font-mono">
                    {employee.employeeCode}
                  </Badge>
                )}
                {isSuperAdmin ? (
                  <Badge variant="default" className="bg-indigo-600 text-white text-[10px]">
                    Super Admin
                  </Badge>
                ) : assignment?.isLimitedAdmin ? (
                  <Badge variant="secondary" className="bg-sky-500/20 text-sky-300 border-sky-400/30 text-[10px]">
                    Limited Admin
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-white/60 border-white/20 text-[10px]">
                    Employee
                  </Badge>
                )}
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                {employee.email} {employee.departmentName ? `• ${employee.departmentName}` : ''}
              </p>
            </div>
          </div>

          <div className="text-right text-xs">
            <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">Active Permissions</span>
            <span className="font-mono font-bold text-sm text-emerald-400">
              {isSuperAdmin ? 'Universal (All 32)' : `${selectedPermissions.size} / ${permissionsList.length}`}
            </span>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isLoading ? (
          <LoadingState message="Loading permissions matrix..." />
        ) : isSuperAdmin ? (
          <div className="p-8 text-center rounded-xl bg-neutral-50 border border-neutral-200 space-y-3">
            <Shield className="w-12 h-12 text-indigo-600 mx-auto" />
            <h4 className="font-bold text-neutral-900 text-sm">Protected Primary Super Administrator</h4>
            <p className="text-xs text-neutral-500 max-w-md mx-auto leading-relaxed">
              This account holds permanent Super Admin status and bypasses all scoping constraints.
              Super Admin credentials cannot be downgraded or restricted through Limited Admin controls.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Quick Presets Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-neutral-50 border border-neutral-200">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Quick Role Presets:</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset('PM')}
                  className="text-xs h-7 px-2.5"
                >
                  Project Lead
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset('HR')}
                  className="text-xs h-7 px-2.5"
                >
                  HR & Attendance
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset('ALL')}
                  className="text-xs h-7 px-2.5"
                >
                  Select All
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => applyPreset('CLEAR')}
                  className="text-xs h-7 px-2.5 text-rose-600 hover:text-rose-700"
                >
                  Clear All
                </Button>
              </div>
            </div>

            {/* Granular Permissions by Category */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-700">
                  Granular Permissions Matrix
                </h4>
                <span className="text-[11px] text-neutral-400">
                  Toggle individual privileges or entire modules
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {categories.map((cat) => {
                  const catPerms = permissionsList.filter((p) => p.category === cat);
                  const selectedCount = catPerms.filter((p) => selectedPermissions.has(p.key)).length;
                  const isAllSelected = selectedCount === catPerms.length;
                  const meta = CATEGORY_LABELS[cat] || { label: cat, icon: 'Shield' };

                  return (
                    <div
                      key={cat}
                      className="rounded-xl border border-neutral-200/90 bg-white p-3.5 space-y-2.5 shadow-sm hover:border-neutral-300 transition-colors"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                        <button
                          type="button"
                          onClick={() => toggleCategory(cat)}
                          className="flex items-center gap-2 text-left group"
                        >
                          <span className="font-bold text-xs text-neutral-900 group-hover:text-black">
                            {meta.label}
                          </span>
                          <Badge
                            variant={selectedCount > 0 ? (isAllSelected ? 'default' : 'secondary') : 'outline'}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {selectedCount}/{catPerms.length}
                          </Badge>
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleCategory(cat)}
                          className="text-[10px] text-neutral-500 hover:text-neutral-900 font-medium"
                        >
                          {isAllSelected ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {catPerms.map((perm) => {
                          const checked = selectedPermissions.has(perm.key);
                          return (
                            <label
                              key={perm.key}
                              className={`flex items-start gap-2.5 p-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                                checked ? 'bg-neutral-50 text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50/50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePermission(perm.key)}
                                className="mt-0.5 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-xs text-neutral-800">{perm.label}</span>
                                  {perm.isSensitive && (
                                    <Badge variant="outline" className="text-[9px] px-1 text-amber-700 border-amber-300 bg-amber-50">
                                      High Priv
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[11px] text-neutral-500 leading-snug mt-0.5">{perm.description}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Scope Constraints */}
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-neutral-600" />
                    Administrative Scope & Boundaries
                  </h4>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    Restrict the Limited Admin to specific departments or projects (IDOR protected).
                  </p>
                </div>
                <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-neutral-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setScopeMode('GLOBAL')}
                    className={`px-2.5 py-1 rounded-md font-medium text-xs transition-colors ${
                      scopeMode === 'GLOBAL' ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    Global (All)
                  </button>
                  <button
                    type="button"
                    onClick={() => setScopeMode('SCOPED')}
                    className={`px-2.5 py-1 rounded-md font-medium text-xs transition-colors ${
                      scopeMode === 'SCOPED' ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    Scoped (Restricted)
                  </button>
                </div>
              </div>

              {scopeMode === 'SCOPED' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-neutral-200 text-xs">
                  {/* Departments scope */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-700 block">
                      Allowed Departments ({selectedDepartmentIds.length} selected)
                    </label>
                    <div className="max-h-36 overflow-y-auto space-y-1 p-2 rounded-lg bg-white border border-neutral-200">
                      {departments.length === 0 ? (
                        <div className="text-neutral-400 text-[11px] p-2">No departments available</div>
                      ) : (
                        departments.map((d) => (
                          <label key={d.id} className="flex items-center gap-2 p-1 hover:bg-neutral-50 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedDepartmentIds.includes(d.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedDepartmentIds([...selectedDepartmentIds, d.id]);
                                } else {
                                  setSelectedDepartmentIds(selectedDepartmentIds.filter((id) => id !== d.id));
                                }
                              }}
                              className="rounded border-neutral-300"
                            />
                            <span className="text-xs text-neutral-800">{d.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Projects scope */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-700 block">
                      Allowed Projects ({selectedProjectIds.length} selected)
                    </label>
                    <div className="max-h-36 overflow-y-auto space-y-1 p-2 rounded-lg bg-white border border-neutral-200">
                      {projects.length === 0 ? (
                        <div className="text-neutral-400 text-[11px] p-2">No projects available</div>
                      ) : (
                        projects.map((p) => (
                          <label key={p.id} className="flex items-center gap-2 p-1 hover:bg-neutral-50 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedProjectIds.includes(p.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedProjectIds([...selectedProjectIds, p.id]);
                                } else {
                                  setSelectedProjectIds(selectedProjectIds.filter((id) => id !== p.id));
                                }
                              }}
                              className="rounded border-neutral-300"
                            />
                            <span className="text-xs text-neutral-800 truncate">{p.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Optional Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-700 block">
                Administrative Grant Reason / Notes (Audited)
              </label>
              <input
                type="text"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="e.g. Granted Senior Team Lead access for engineering tasks & projects"
                className="w-full text-xs px-3 py-2 rounded-lg border border-neutral-300 bg-white focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>
          </div>
        )}

        {/* Modal Action Footer */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-2 pt-4 border-t border-neutral-200">
          <div>
            {!isSuperAdmin && assignment?.isLimitedAdmin && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRevoke}
                isLoading={isRevoking}
                className="text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50"
              >
                Revoke Admin Privileges
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            {!isSuperAdmin && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleSave}
                isLoading={isSubmitting}
                className="text-xs gap-1.5 bg-neutral-900 hover:bg-black text-white"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Save & Update Permissions
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
