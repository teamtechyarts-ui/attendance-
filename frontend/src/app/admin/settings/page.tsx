'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { metadataApi, api, rbacApi } from '@/lib/api';
import { Department, Designation, WorkSchedule, AuditLog, LimitedAdminAssignment } from '@/types';
import { ManageAccessModal } from '@/components/admin/manage-access-modal';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatTime } from '@/lib/utils';
import {
  Shield,
  Plus,
  Building2,
  Briefcase,
  Clock,
  Pencil,
  Trash2,
  CheckCircle2,
  Search,
  Star,
  AlertTriangle,
  RotateCcw,
  KeyRound,
  Users,
  Lock,
  Unlock,
  Settings2,
} from 'lucide-react';

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState('rbac');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [adminAssignments, setAdminAssignments] = useState<LimitedAdminAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // RBAC Access Control Filters & Modal
  const [rbacSearch, setRbacSearch] = useState('');
  const [rbacRoleFilter, setRbacRoleFilter] = useState<'ALL' | 'SUPER_ADMIN' | 'LIMITED_ADMIN' | 'EMPLOYEE'>('ALL');
  const [managingAccessEmployee, setManagingAccessEmployee] = useState<{
    id: string;
    displayName: string;
    email: string;
    employeeCode?: string | null;
    departmentName?: string | null;
  } | null>(null);

  // Search & Status filters
  const [deptSearch, setDeptSearch] = useState('');
  const [deptStatusFilter, setDeptStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const [desigSearch, setDesigSearch] = useState('');
  const [desigStatusFilter, setDesigStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const [schedSearch, setSchedSearch] = useState('');

  // Department Modals & State
  const [isCreateDeptOpen, setIsCreateDeptOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deletingDept, setDeletingDept] = useState<Department | null>(null);
  const [deptFormName, setDeptFormName] = useState('');
  const [deptFormDesc, setDeptFormDesc] = useState('');
  const [deptFormActive, setDeptFormActive] = useState(true);
  const [isDeptSubmitting, setIsDeptSubmitting] = useState(false);

  // Designation Modals & State
  const [isCreateDesigOpen, setIsCreateDesigOpen] = useState(false);
  const [editingDesig, setEditingDesig] = useState<Designation | null>(null);
  const [deletingDesig, setDeletingDesig] = useState<Designation | null>(null);
  const [desigFormName, setDesigFormName] = useState('');
  const [desigFormDesc, setDesigFormDesc] = useState('');
  const [desigFormActive, setDesigFormActive] = useState(true);
  const [isDesigSubmitting, setIsDesigSubmitting] = useState(false);

  // Work Schedule Modals & State
  const [isCreateSchedOpen, setIsCreateSchedOpen] = useState(false);
  const [editingSched, setEditingSched] = useState<WorkSchedule | null>(null);
  const [deletingSched, setDeletingSched] = useState<WorkSchedule | null>(null);
  const [schedName, setSchedName] = useState('');
  const [schedStartTime, setSchedStartTime] = useState('09:00');
  const [schedEndTime, setSchedEndTime] = useState('18:00');
  const [schedBreakMins, setSchedBreakMins] = useState(60);
  const [schedDays, setSchedDays] = useState({
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: false,
    sunday: false,
  });
  const [schedIsDefault, setSchedIsDefault] = useState(false);
  const [isSchedSubmitting, setIsSchedSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [depts, desigs, scheds, logsRes, assignmentsRes] = await Promise.all([
        metadataApi.getDepartments({ includeInactive: true }).catch(() => []),
        metadataApi.getDesignations({ includeInactive: true }).catch(() => []),
        metadataApi.getWorkSchedules().catch(() => []),
        api.get('/api/audit').catch(() => []),
        rbacApi.getAssignments().catch(() => []),
      ]);
      setDepartments(depts || []);
      setDesignations(desigs || []);
      setSchedules(scheds || []);
      setAuditLogs(logsRes || []);
      setAdminAssignments(assignmentsRes || []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ==========================================
  // DEPARTMENT CRUD HANDLERS
  // ==========================================
  const openCreateDept = () => {
    setDeptFormName('');
    setDeptFormDesc('');
    setDeptFormActive(true);
    setIsCreateDeptOpen(true);
  };

  const openEditDept = (d: Department) => {
    setEditingDept(d);
    setDeptFormName(d.name);
    setDeptFormDesc(d.description || '');
    setDeptFormActive(d.isActive);
  };

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptFormName.trim()) return;
    setIsDeptSubmitting(true);
    try {
      if (editingDept) {
        await metadataApi.updateDepartment(editingDept.id, {
          name: deptFormName.trim(),
          description: deptFormDesc.trim() || null,
          isActive: deptFormActive,
        });
        setEditingDept(null);
      } else {
        await metadataApi.createDepartment({
          name: deptFormName.trim(),
          description: deptFormDesc.trim() || null,
          isActive: deptFormActive,
        });
        setIsCreateDeptOpen(false);
      }
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save department');
    } finally {
      setIsDeptSubmitting(false);
    }
  };

  const handleToggleDeptActive = async (d: Department) => {
    try {
      await metadataApi.updateDepartment(d.id, { isActive: !d.isActive });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update department status');
    }
  };

  const handleDeleteDept = async () => {
    if (!deletingDept) return;
    setIsDeptSubmitting(true);
    try {
      const res = await metadataApi.deleteDepartment(deletingDept.id);
      setDeletingDept(null);
      if (res?.message) {
        // notify if soft-deactivated
      }
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete department');
    } finally {
      setIsDeptSubmitting(false);
    }
  };

  // ==========================================
  // DESIGNATION CRUD HANDLERS
  // ==========================================
  const openCreateDesig = () => {
    setDesigFormName('');
    setDesigFormDesc('');
    setDesigFormActive(true);
    setIsCreateDesigOpen(true);
  };

  const openEditDesig = (d: Designation) => {
    setEditingDesig(d);
    setDesigFormName(d.name);
    setDesigFormDesc(d.description || '');
    setDesigFormActive(d.isActive);
  };

  const handleSaveDesig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desigFormName.trim()) return;
    setIsDesigSubmitting(true);
    try {
      if (editingDesig) {
        await metadataApi.updateDesignation(editingDesig.id, {
          name: desigFormName.trim(),
          description: desigFormDesc.trim() || null,
          isActive: desigFormActive,
        });
        setEditingDesig(null);
      } else {
        await metadataApi.createDesignation({
          name: desigFormName.trim(),
          description: desigFormDesc.trim() || null,
          isActive: desigFormActive,
        });
        setIsCreateDesigOpen(false);
      }
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save designation');
    } finally {
      setIsDesigSubmitting(false);
    }
  };

  const handleToggleDesigActive = async (d: Designation) => {
    try {
      await metadataApi.updateDesignation(d.id, { isActive: !d.isActive });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update designation status');
    }
  };

  const handleDeleteDesig = async () => {
    if (!deletingDesig) return;
    setIsDesigSubmitting(true);
    try {
      await metadataApi.deleteDesignation(deletingDesig.id);
      setDeletingDesig(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete designation');
    } finally {
      setIsDesigSubmitting(false);
    }
  };

  // ==========================================
  // WORK SCHEDULE CRUD HANDLERS
  // ==========================================
  const openCreateSched = () => {
    setSchedName('');
    setSchedStartTime('09:00');
    setSchedEndTime('18:00');
    setSchedBreakMins(60);
    setSchedDays({
      monday: true,
      tuesday: true,
      wednesday: true,
      thursday: true,
      friday: true,
      saturday: false,
      sunday: false,
    });
    setSchedIsDefault(schedules.length === 0);
    setIsCreateSchedOpen(true);
  };

  const openEditSched = (s: WorkSchedule) => {
    setEditingSched(s);
    setSchedName(s.name);
    // Format times to HH:MM for input fields
    setSchedStartTime(s.workStartTime ? s.workStartTime.substring(0, 5) : '09:00');
    setSchedEndTime(s.workEndTime ? s.workEndTime.substring(0, 5) : '18:00');
    setSchedBreakMins(s.breakMinutes ?? 60);
    setSchedDays({
      monday: s.monday,
      tuesday: s.tuesday,
      wednesday: s.wednesday,
      thursday: s.thursday,
      friday: s.friday,
      saturday: s.saturday,
      sunday: s.sunday,
    });
    setSchedIsDefault(Boolean(s.isDefault));
  };

  const handleSaveSched = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedName.trim()) return;

    const hasAtLeastOneDay = Object.values(schedDays).some(Boolean);
    if (!hasAtLeastOneDay) {
      alert('Please select at least one working day.');
      return;
    }

    setIsSchedSubmitting(true);
    try {
      const payload = {
        name: schedName.trim(),
        workStartTime: schedStartTime.length === 5 ? `${schedStartTime}:00` : schedStartTime,
        workEndTime: schedEndTime.length === 5 ? `${schedEndTime}:00` : schedEndTime,
        breakMinutes: Number(schedBreakMins) || 0,
        ...schedDays,
        isDefault: schedIsDefault,
      };

      if (editingSched) {
        await metadataApi.updateWorkSchedule(editingSched.id, payload);
        setEditingSched(null);
      } else {
        await metadataApi.createWorkSchedule(payload);
        setIsCreateSchedOpen(false);
      }
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save work schedule');
    } finally {
      setIsSchedSubmitting(false);
    }
  };

  const handleSetDefaultSched = async (s: WorkSchedule) => {
    if (s.isDefault) return;
    try {
      await metadataApi.updateWorkSchedule(s.id, { isDefault: true });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to set default schedule');
    }
  };

  const handleDeleteSched = async () => {
    if (!deletingSched) return;
    setIsSchedSubmitting(true);
    try {
      await metadataApi.deleteWorkSchedule(deletingSched.id);
      setDeletingSched(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete work schedule');
    } finally {
      setIsSchedSubmitting(false);
    }
  };

  // ==========================================
  // FILTERED DATA
  // ==========================================
  const filteredDepartments = useMemo(() => {
    return departments.filter((d) => {
      const matchesSearch =
        !deptSearch ||
        d.name.toLowerCase().includes(deptSearch.toLowerCase()) ||
        (d.description && d.description.toLowerCase().includes(deptSearch.toLowerCase()));
      const matchesStatus =
        deptStatusFilter === 'ALL' ||
        (deptStatusFilter === 'ACTIVE' && d.isActive) ||
        (deptStatusFilter === 'INACTIVE' && !d.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [departments, deptSearch, deptStatusFilter]);

  const filteredDesignations = useMemo(() => {
    return designations.filter((d) => {
      const matchesSearch =
        !desigSearch ||
        d.name.toLowerCase().includes(desigSearch.toLowerCase()) ||
        (d.description && d.description.toLowerCase().includes(desigSearch.toLowerCase()));
      const matchesStatus =
        desigStatusFilter === 'ALL' ||
        (desigStatusFilter === 'ACTIVE' && d.isActive) ||
        (desigStatusFilter === 'INACTIVE' && !d.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [designations, desigSearch, desigStatusFilter]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      if (!schedSearch) return true;
      return s.name.toLowerCase().includes(schedSearch.toLowerCase());
    });
  }, [schedules, schedSearch]);

  const filteredAssignments = useMemo(() => {
    return adminAssignments.filter((a) => {
      const q = rbacSearch.toLowerCase();
      const matchesSearch =
        !rbacSearch ||
        a.displayName.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        (a.employeeCode && a.employeeCode.toLowerCase().includes(q)) ||
        (a.departmentName && a.departmentName.toLowerCase().includes(q));

      const matchesRole =
        rbacRoleFilter === 'ALL' ||
        (rbacRoleFilter === 'SUPER_ADMIN' && a.isSuperAdmin) ||
        (rbacRoleFilter === 'LIMITED_ADMIN' && a.isLimitedAdmin) ||
        (rbacRoleFilter === 'EMPLOYEE' && !a.isSuperAdmin && !a.isLimitedAdmin);

      return matchesSearch && matchesRole;
    });
  }, [adminAssignments, rbacSearch, rbacRoleFilter]);

  const tabs = [
    { id: 'rbac', label: 'Roles & Permissions', count: adminAssignments.filter((a) => a.isLimitedAdmin || a.isSuperAdmin).length, icon: <KeyRound className="w-3.5 h-3.5" /> },
    { id: 'audit', label: 'Security Audit Logs', icon: <Shield className="w-3.5 h-3.5" /> },
    { id: 'departments', label: 'Departments', count: departments.length, icon: <Building2 className="w-3.5 h-3.5" /> },
    { id: 'designations', label: 'Designations', count: designations.length, icon: <Briefcase className="w-3.5 h-3.5" /> },
    { id: 'schedules', label: 'Work Schedules', count: schedules.length, icon: <Clock className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">System Settings & Master Data</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Manage organization departments, job designations, shift schedules, RBAC access control, and audit records.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} tabs={tabs} />

      {/* ========================================== */}
      {/* TAB 0: ROLES & PERMISSIONS (RBAC)         */}
      {/* ========================================== */}
      {activeTab === 'rbac' && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm">Role-Based Access Control (RBAC)</CardTitle>
              <CardDescription>
                Super Admin can grant granular Limited Admin privileges (Tasks, Projects, Teams, Work, Attendance, Leave, Reports) to senior employees.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs bg-neutral-50 font-mono">
                Active Admins: {adminAssignments.filter((a) => a.isLimitedAdmin || a.isSuperAdmin).length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2 pt-1 pb-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                <Input
                  placeholder="Search by employee name, email, employee code, or department..."
                  value={rbacSearch}
                  onChange={(e) => setRbacSearch(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>
              <Select
                value={rbacRoleFilter}
                onChange={(e) => setRbacRoleFilter(e.target.value as any)}
                options={[
                  { value: 'ALL', label: 'All Access Levels' },
                  { value: 'SUPER_ADMIN', label: 'Super Admins Only' },
                  { value: 'LIMITED_ADMIN', label: 'Limited Admins Only' },
                  { value: 'EMPLOYEE', label: 'Standard Employees' },
                ]}
                className="w-full sm:w-48 h-9 text-xs"
              />
            </div>

            {/* Table */}
            {isLoading ? (
              <LoadingState message="Loading access control assignments..." />
            ) : filteredAssignments.length === 0 ? (
              <EmptyState
                title="No users found"
                description={rbacSearch || rbacRoleFilter !== 'ALL' ? 'Try adjusting your search filters.' : 'No employees are registered in the directory.'}
              />
            ) : (
              <div className="border border-neutral-200 rounded-xl overflow-hidden shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Role & Access Level</TableHead>
                      <TableHead>Permissions Granted</TableHead>
                      <TableHead>Administrative Scope</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAssignments.map((assign) => (
                      <TableRow key={assign.userId} className="hover:bg-neutral-50/60 transition-colors">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-xs">
                              {(assign.displayName || 'E').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-xs text-neutral-900">{assign.displayName}</span>
                                {assign.employeeCode && (
                                  <Badge variant="outline" className="text-[10px] font-mono px-1 py-0">
                                    {assign.employeeCode}
                                  </Badge>
                                )}
                              </div>
                              <span className="text-[11px] text-neutral-500 block">
                                {assign.email} {assign.departmentName ? `• ${assign.departmentName}` : ''}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {assign.isSuperAdmin ? (
                            <Badge className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-semibold gap-1">
                              <Shield className="w-3 h-3" /> Super Admin
                            </Badge>
                          ) : assign.isLimitedAdmin ? (
                            <Badge variant="secondary" className="bg-sky-50 text-sky-700 border-sky-200 text-[10px] font-semibold gap-1">
                              <Unlock className="w-3 h-3 text-sky-600" /> Limited Admin
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-neutral-500 border-neutral-200 text-[10px]">
                              Standard Employee
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {assign.isSuperAdmin ? (
                            <span className="text-xs text-neutral-700 font-medium">Universal (All 32 Permissions)</span>
                          ) : assign.isLimitedAdmin && assign.config ? (
                            <div className="space-y-0.5">
                              <span className="text-xs font-bold text-emerald-700">
                                {assign.config.permissions.length} granular permissions
                              </span>
                              <p className="text-[10px] text-neutral-500 truncate max-w-xs">
                                {assign.config.permissions.slice(0, 4).join(', ')}
                                {assign.config.permissions.length > 4 ? ` +${assign.config.permissions.length - 4} more` : ''}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-neutral-400">Standard employee permissions</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {assign.isSuperAdmin ? (
                            <span className="text-xs text-neutral-600 font-medium">Global (All entities)</span>
                          ) : assign.isLimitedAdmin && assign.config?.scope ? (
                            <div className="text-xs text-neutral-700">
                              {assign.config.scope.projectIds?.length
                                ? `${assign.config.scope.projectIds.length} Projects`
                                : ''}
                              {assign.config.scope.departmentIds?.length
                                ? `${assign.config.scope.projectIds?.length ? ', ' : ''}${assign.config.scope.departmentIds.length} Depts`
                                : ''}
                              {!assign.config.scope.projectIds?.length && !assign.config.scope.departmentIds?.length
                                ? 'Global (All entities)'
                                : ''}
                            </div>
                          ) : assign.isLimitedAdmin ? (
                            <span className="text-xs text-neutral-600">Global (All entities)</span>
                          ) : (
                            <span className="text-xs text-neutral-400">Self only</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {assign.isSuperAdmin ? (
                            <Badge variant="outline" className="text-[10px] text-neutral-400 border-neutral-200">
                              <Lock className="w-2.5 h-2.5 mr-1" /> Protected
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant={assign.isLimitedAdmin ? 'primary' : 'outline'}
                              onClick={() =>
                                setManagingAccessEmployee({
                                  id: assign.employeeId || assign.userId,
                                  displayName: assign.displayName,
                                  email: assign.email,
                                  employeeCode: assign.employeeCode,
                                  departmentName: assign.departmentName,
                                })
                              }
                              className="text-xs gap-1.5 h-7"
                            >
                              <Settings2 className="w-3.5 h-3.5" />
                              {assign.isLimitedAdmin ? 'Manage Access' : 'Grant Limited Admin'}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ========================================== */}
      {/* TAB 1: AUDIT LOGS                          */}
      {/* ========================================== */}
      {activeTab === 'audit' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Administrative & Security Audit Logs</CardTitle>
            <CardDescription>Immutable trail of logins, permissions, check-ins, tasks, and system modifications.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <LoadingState message="Loading audit records..." />
            ) : auditLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-500">No audit records found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Actor / User</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {formatDate(log.createdAt)} {formatTime(log.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-semibold">
                        {log.user?.email || log.employee?.displayName || 'System'}
                      </TableCell>
                      <TableCell className="text-xs text-neutral-800 font-medium max-w-md truncate">
                        {log.description || '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-neutral-400">
                        {log.ipAddress || '127.0.0.1'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ========================================== */}
      {/* TAB 2: DEPARTMENTS CRUD                    */}
      {/* ========================================== */}
      {activeTab === 'departments' && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm">Departments</CardTitle>
              <CardDescription>Organization business units and functional groups</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={openCreateDept} size="sm" className="gap-1 text-xs">
                <Plus className="w-3.5 h-3.5" /> Add Department
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2 pt-1 pb-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                <Input
                  placeholder="Search departments..."
                  value={deptSearch}
                  onChange={(e) => setDeptSearch(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>
              <Select
                value={deptStatusFilter}
                onChange={(e) => setDeptStatusFilter(e.target.value as any)}
                options={[
                  { value: 'ALL', label: 'All Statuses' },
                  { value: 'ACTIVE', label: 'Active Only' },
                  { value: 'INACTIVE', label: 'Inactive Only' },
                ]}
                className="w-full sm:w-40 h-9 text-xs"
              />
            </div>

            {/* Table */}
            {isLoading ? (
              <LoadingState message="Loading departments..." />
            ) : filteredDepartments.length === 0 ? (
              <EmptyState
                title="No departments found"
                description={deptSearch || deptStatusFilter !== 'ALL' ? 'Try adjusting your search filters.' : 'Get started by creating your first department.'}
                actionLabel="Add Department"
                onAction={openCreateDept}
              />
            ) : (
              <div className="border border-neutral-200 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Department Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDepartments.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-bold text-xs">{d.name}</TableCell>
                        <TableCell className="text-xs text-neutral-500 max-w-sm truncate">
                          {d.description || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={d.isActive ? 'success' : 'secondary'}>
                            {d.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDept(d)}
                              className="h-7 px-2 text-xs text-neutral-700 hover:text-neutral-900"
                            >
                              <Pencil className="w-3 h-3 mr-1" /> Edit
                            </Button>
                            {d.isActive ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeletingDept(d)}
                                className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-3 h-3 mr-1" /> Delete
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleDeptActive(d)}
                                className="h-7 px-2 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              >
                                <RotateCcw className="w-3 h-3 mr-1" /> Reactivate
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ========================================== */}
      {/* TAB 3: DESIGNATIONS CRUD                   */}
      {/* ========================================== */}
      {activeTab === 'designations' && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm">Job Designations & Titles</CardTitle>
              <CardDescription>Role definitions and positions across departments</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={openCreateDesig} size="sm" className="gap-1 text-xs">
                <Plus className="w-3.5 h-3.5" /> Add Designation
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2 pt-1 pb-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                <Input
                  placeholder="Search designations..."
                  value={desigSearch}
                  onChange={(e) => setDesigSearch(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>
              <Select
                value={desigStatusFilter}
                onChange={(e) => setDesigStatusFilter(e.target.value as any)}
                options={[
                  { value: 'ALL', label: 'All Statuses' },
                  { value: 'ACTIVE', label: 'Active Only' },
                  { value: 'INACTIVE', label: 'Inactive Only' },
                ]}
                className="w-full sm:w-40 h-9 text-xs"
              />
            </div>

            {/* Table */}
            {isLoading ? (
              <LoadingState message="Loading designations..." />
            ) : filteredDesignations.length === 0 ? (
              <EmptyState
                title="No designations found"
                description={desigSearch || desigStatusFilter !== 'ALL' ? 'Try adjusting your search filters.' : 'Get started by creating your first job designation.'}
                actionLabel="Add Designation"
                onAction={openCreateDesig}
              />
            ) : (
              <div className="border border-neutral-200 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Designation Title</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDesignations.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-bold text-xs">{d.name}</TableCell>
                        <TableCell className="text-xs text-neutral-500 max-w-sm truncate">
                          {d.description || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={d.isActive ? 'success' : 'secondary'}>
                            {d.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDesig(d)}
                              className="h-7 px-2 text-xs text-neutral-700 hover:text-neutral-900"
                            >
                              <Pencil className="w-3 h-3 mr-1" /> Edit
                            </Button>
                            {d.isActive ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeletingDesig(d)}
                                className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-3 h-3 mr-1" /> Delete
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleDesigActive(d)}
                                className="h-7 px-2 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              >
                                <RotateCcw className="w-3 h-3 mr-1" /> Reactivate
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ========================================== */}
      {/* TAB 4: WORK SCHEDULES CRUD                 */}
      {/* ========================================== */}
      {activeTab === 'schedules' && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm">Standard Shift Schedules</CardTitle>
              <CardDescription>Configured shift start, end times, and working day definitions</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={openCreateSched} size="sm" className="gap-1 text-xs">
                <Plus className="w-3.5 h-3.5" /> Add Work Schedule
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2 pt-1 pb-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                <Input
                  placeholder="Search schedules by name..."
                  value={schedSearch}
                  onChange={(e) => setSchedSearch(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>
            </div>

            {/* Table */}
            {isLoading ? (
              <LoadingState message="Loading work schedules..." />
            ) : filteredSchedules.length === 0 ? (
              <EmptyState
                title="No work schedules found"
                description={schedSearch ? 'Try a different search query.' : 'Create standard work schedules to configure shifts.'}
                actionLabel="Add Work Schedule"
                onAction={openCreateSched}
              />
            ) : (
              <div className="border border-neutral-200 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Schedule Name</TableHead>
                      <TableHead>Shift Timing</TableHead>
                      <TableHead>Break</TableHead>
                      <TableHead>Working Days</TableHead>
                      <TableHead>Default</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSchedules.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-bold text-xs">{s.name}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {s.workStartTime?.substring(0, 5)} – {s.workEndTime?.substring(0, 5)}
                        </TableCell>
                        <TableCell className="text-xs">{s.breakMinutes} mins</TableCell>
                        <TableCell className="text-xs font-semibold">
                          {[
                            s.monday && 'Mon',
                            s.tuesday && 'Tue',
                            s.wednesday && 'Wed',
                            s.thursday && 'Thu',
                            s.friday && 'Fri',
                            s.saturday && 'Sat',
                            s.sunday && 'Sun',
                          ]
                            .filter(Boolean)
                            .join(', ')}
                        </TableCell>
                        <TableCell>
                          {s.isDefault ? (
                            <Badge variant="success" className="gap-1 text-[10px]">
                              <Star className="w-2.5 h-2.5 fill-emerald-500 text-emerald-500" /> Default
                            </Badge>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSetDefaultSched(s)}
                              className="h-6 px-2 text-[10px] text-neutral-400 hover:text-neutral-900"
                            >
                              Set Default
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditSched(s)}
                              className="h-7 px-2 text-xs text-neutral-700 hover:text-neutral-900"
                            >
                              <Pencil className="w-3 h-3 mr-1" /> Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeletingSched(s)}
                              disabled={Boolean(s.isDefault && schedules.length > 1)}
                              className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-30"
                              title={s.isDefault && schedules.length > 1 ? 'Default schedule cannot be deleted' : 'Delete schedule'}
                            >
                              <Trash2 className="w-3 h-3 mr-1" /> Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ========================================== */}
      {/* MODALS: DEPARTMENTS                        */}
      {/* ========================================== */}
      <Dialog
        isOpen={isCreateDeptOpen || Boolean(editingDept)}
        onClose={() => {
          setIsCreateDeptOpen(false);
          setEditingDept(null);
        }}
        title={editingDept ? 'Edit Department' : 'Create Department'}
      >
        <form onSubmit={handleSaveDept} className="space-y-4">
          <Input
            label="Department Name *"
            placeholder="e.g. Engineering & IT"
            required
            value={deptFormName}
            onChange={(e) => setDeptFormName(e.target.value)}
          />
          <Input
            label="Description"
            placeholder="Department responsibilities and function..."
            value={deptFormDesc}
            onChange={(e) => setDeptFormDesc(e.target.value)}
          />
          <Select
            label="Status"
            value={deptFormActive ? 'ACTIVE' : 'INACTIVE'}
            onChange={(e) => setDeptFormActive(e.target.value === 'ACTIVE')}
            options={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INACTIVE', label: 'Inactive' },
            ]}
          />
          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsCreateDeptOpen(false);
                setEditingDept(null);
              }}
              disabled={isDeptSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isDeptSubmitting}>
              {isDeptSubmitting ? 'Saving...' : editingDept ? 'Save Changes' : 'Create Department'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Department Confirmation Dialog */}
      <Dialog
        isOpen={Boolean(deletingDept)}
        onClose={() => setDeletingDept(null)}
        title="Delete Department"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-50 text-amber-900 rounded-lg text-xs border border-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Confirm Deletion</p>
              <p className="mt-1 text-neutral-600">
                Are you sure you want to delete department <strong>&quot;{deletingDept?.name}&quot;</strong>?
              </p>
              <p className="mt-1 text-[11px] text-neutral-500">
                If active employees are currently assigned to this department, it will be safely deactivated/archived to preserve historical data.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingDept(null)}
              disabled={isDeptSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleDeleteDept}
              disabled={isDeptSubmitting}
            >
              {isDeptSubmitting ? 'Deleting...' : 'Delete Department'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ========================================== */}
      {/* MODALS: DESIGNATIONS                       */}
      {/* ========================================== */}
      <Dialog
        isOpen={isCreateDesigOpen || Boolean(editingDesig)}
        onClose={() => {
          setIsCreateDesigOpen(false);
          setEditingDesig(null);
        }}
        title={editingDesig ? 'Edit Designation' : 'Create Designation'}
      >
        <form onSubmit={handleSaveDesig} className="space-y-4">
          <Input
            label="Designation Title *"
            placeholder="e.g. Senior Full Stack Engineer"
            required
            value={desigFormName}
            onChange={(e) => setDesigFormName(e.target.value)}
          />
          <Input
            label="Description"
            placeholder="Role expectations and scope..."
            value={desigFormDesc}
            onChange={(e) => setDesigFormDesc(e.target.value)}
          />
          <Select
            label="Status"
            value={desigFormActive ? 'ACTIVE' : 'INACTIVE'}
            onChange={(e) => setDesigFormActive(e.target.value === 'ACTIVE')}
            options={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INACTIVE', label: 'Inactive' },
            ]}
          />
          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsCreateDesigOpen(false);
                setEditingDesig(null);
              }}
              disabled={isDesigSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isDesigSubmitting}>
              {isDesigSubmitting ? 'Saving...' : editingDesig ? 'Save Changes' : 'Create Designation'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Designation Confirmation Dialog */}
      <Dialog
        isOpen={Boolean(deletingDesig)}
        onClose={() => setDeletingDesig(null)}
        title="Delete Designation"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-50 text-amber-900 rounded-lg text-xs border border-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Confirm Deletion</p>
              <p className="mt-1 text-neutral-600">
                Are you sure you want to delete designation <strong>&quot;{deletingDesig?.name}&quot;</strong>?
              </p>
              <p className="mt-1 text-[11px] text-neutral-500">
                If active employees are assigned to this designation, it will be safely deactivated/archived to preserve historical employee records.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingDesig(null)}
              disabled={isDesigSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleDeleteDesig}
              disabled={isDesigSubmitting}
            >
              {isDesigSubmitting ? 'Deleting...' : 'Delete Designation'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ========================================== */}
      {/* MODALS: WORK SCHEDULES                     */}
      {/* ========================================== */}
      <Dialog
        isOpen={isCreateSchedOpen || Boolean(editingSched)}
        onClose={() => {
          setIsCreateSchedOpen(false);
          setEditingSched(null);
        }}
        title={editingSched ? 'Edit Work Schedule' : 'Create Work Schedule'}
      >
        <form onSubmit={handleSaveSched} className="space-y-4">
          <Input
            label="Schedule Name *"
            placeholder="e.g. Standard Shift, Morning Shift"
            required
            value={schedName}
            onChange={(e) => setSchedName(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start Time *"
              type="time"
              required
              value={schedStartTime}
              onChange={(e) => setSchedStartTime(e.target.value)}
            />
            <Input
              label="End Time *"
              type="time"
              required
              value={schedEndTime}
              onChange={(e) => setSchedEndTime(e.target.value)}
            />
          </div>

          <Input
            label="Break Duration (Minutes)"
            type="number"
            min={0}
            max={300}
            value={schedBreakMins}
            onChange={(e) => setSchedBreakMins(Number(e.target.value))}
          />

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-2">
              Working Days *
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {[
                { key: 'monday', label: 'Mon' },
                { key: 'tuesday', label: 'Tue' },
                { key: 'wednesday', label: 'Wed' },
                { key: 'thursday', label: 'Thu' },
                { key: 'friday', label: 'Fri' },
                { key: 'saturday', label: 'Sat' },
                { key: 'sunday', label: 'Sun' },
              ].map((day) => {
                const isChecked = (schedDays as any)[day.key];
                return (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() =>
                      setSchedDays((prev) => ({ ...prev, [day.key]: !isChecked }))
                    }
                    className={`px-3 py-2 text-xs font-bold rounded-lg border text-center transition-all ${
                      isChecked
                        ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                        : 'bg-neutral-50 text-neutral-500 border-neutral-200 hover:bg-neutral-100'
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="schedIsDefault"
              checked={schedIsDefault}
              onChange={(e) => setSchedIsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 cursor-pointer"
            />
            <label htmlFor="schedIsDefault" className="text-xs font-medium text-neutral-800 cursor-pointer">
              Set as Default Schedule for New Employees
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsCreateSchedOpen(false);
                setEditingSched(null);
              }}
              disabled={isSchedSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSchedSubmitting}>
              {isSchedSubmitting ? 'Saving...' : editingSched ? 'Save Changes' : 'Create Schedule'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Work Schedule Confirmation Dialog */}
      <Dialog
        isOpen={Boolean(deletingSched)}
        onClose={() => setDeletingSched(null)}
        title="Delete Work Schedule"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 text-red-900 rounded-lg text-xs border border-red-200">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Confirm Deletion</p>
              <p className="mt-1 text-neutral-700">
                Are you sure you want to permanently delete work schedule <strong>&quot;{deletingSched?.name}&quot;</strong>?
              </p>
              <p className="mt-1 text-[11px] text-neutral-500">
                This schedule cannot be deleted if any employees are actively assigned to it.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingSched(null)}
              disabled={isSchedSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleDeleteSched}
              disabled={isSchedSubmitting}
            >
              {isSchedSubmitting ? 'Deleting...' : 'Delete Schedule'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* RBAC Access Control Modal */}
      {managingAccessEmployee && (
        <ManageAccessModal
          isOpen={Boolean(managingAccessEmployee)}
          onClose={() => setManagingAccessEmployee(null)}
          employee={managingAccessEmployee}
          onSuccess={() => {
            loadData();
          }}
        />
      )}
    </div>
  );
}
