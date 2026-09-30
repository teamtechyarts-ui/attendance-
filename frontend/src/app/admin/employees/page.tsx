'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { employeesApi, metadataApi } from '@/lib/api';
import { Employee, Department, Designation } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/utils';
import { Users, Plus, Search, ArrowRight, Mail, CheckCircle2, AlertTriangle, UserX, UserCheck } from 'lucide-react';

export default function AdminEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Create form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [designationId, setDesignationId] = useState('');
  const [role, setRole] = useState<'EMPLOYEE' | 'MANAGER' | 'ADMIN'>('EMPLOYEE');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createdNotice, setCreatedNotice] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  // Deactivation state
  const [deactivateTarget, setDeactivateTarget] = useState<Employee | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Reactivation state
  const [reactivateTarget, setReactivateTarget] = useState<Employee | null>(null);
  const [isReactivating, setIsReactivating] = useState(false);
  const [reactivateError, setReactivateError] = useState<string | null>(null);

  const fetchEmployees = useCallback(async () => {
    try {
      const [list, depts, desigs] = await Promise.all([
        employeesApi.list({
          search: search || undefined,
          departmentId: deptFilter || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
        }),
        metadataApi.getDepartments(),
        metadataApi.getDesignations(),
      ]);
      setEmployees(list || []);
      setDepartments(depts || []);
      setDesignations(desigs || []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [search, deptFilter, statusFilter]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !email || !employeeCode) return;
    setError(null);
    setIsSubmitting(true);

    try {
      await employeesApi.create({
        firstName,
        lastName,
        email,
        employeeCode,
        departmentId: departmentId || null,
        designationId: designationId || null,
        role,
        employmentStatus: 'ACTIVE',
      });
      setIsCreateOpen(false);
      setFirstName('');
      setLastName('');
      const targetEmail = email;
      setEmail('');
      setEmployeeCode('');
      setCreatedNotice(`Employee created successfully. An onboarding email with temporary login credentials has been sent to ${targetEmail}.`);
      fetchEmployees();
    } catch (err: any) {
      setError(err.message || 'Failed to create employee');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOnboarding = async (employeeId: string, empEmail: string) => {
    if (!confirm(`Generate a new temporary password and send onboarding email to ${empEmail}?`)) return;
    setResendingId(employeeId);
    try {
      const res = await employeesApi.resendOnboarding(employeeId);
      alert(res.message || `Onboarding email resent successfully to ${empEmail}`);
    } catch (err: any) {
      alert(err.message || 'Failed to resend onboarding email');
    } finally {
      setResendingId(null);
    }
  };

  const handleDeactivateClick = (emp: Employee) => {
    setDeactivateTarget(emp);
    setDeactivateError(null);
  };

  const handleDeactivateCancel = () => {
    if (isDeactivating) return;
    setDeactivateTarget(null);
    setDeactivateError(null);
  };

  const handleDeactivateConfirm = async () => {
    if (!deactivateTarget || isDeactivating) return;
    setIsDeactivating(true);
    setDeactivateError(null);

    try {
      const result = await employeesApi.deactivate(deactivateTarget.id);
      setDeactivateTarget(null);
      const msg = result.message || `${deactivateTarget.displayName || deactivateTarget.firstName} has been deactivated.`;
      setSuccessNotice(msg);
      await fetchEmployees();
    } catch (err: any) {
      setDeactivateError(
        err.message ||
          'Unable to deactivate employee. Please try again.'
      );
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleReactivateClick = (emp: Employee) => {
    setReactivateTarget(emp);
    setReactivateError(null);
  };

  const handleReactivateCancel = () => {
    if (isReactivating) return;
    setReactivateTarget(null);
    setReactivateError(null);
  };

  const handleReactivateConfirm = async () => {
    if (!reactivateTarget || isReactivating) return;
    setIsReactivating(true);
    setReactivateError(null);

    try {
      const result = await employeesApi.reactivate(reactivateTarget.id);
      setReactivateTarget(null);
      const msg = result.message || `${reactivateTarget.displayName || reactivateTarget.firstName} has been reactivated.`;
      setSuccessNotice(msg);
      await fetchEmployees();
    } catch (err: any) {
      setReactivateError(
        err.message || 'Unable to reactivate employee. Please try again.'
      );
    } finally {
      setIsReactivating(false);
    }
  };

  const isResendDisabled = (emp: Employee) => {
    const userStatus = (emp as any).user?.status;
    const empStatus = emp.employmentStatus;
    return (
      empStatus === 'TERMINATED' ||
      userStatus === 'INACTIVE' ||
      resendingId === emp.id
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Employee Directory</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Manage employee accounts, roles, departments, and workspace access.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="gap-1.5 shadow-sm text-xs">
          <Plus className="w-3.5 h-3.5" /> Add Employee
        </Button>
      </div>

      {/* Success / Created Notification Banner */}
      {(createdNotice || successNotice) && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{createdNotice || successNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => { setCreatedNotice(null); setSuccessNotice(null); }}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold px-2 py-0.5 rounded"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-400" />
          <Input
            placeholder="Search by name, code, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
          <div className="w-full sm:w-48">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Employees' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Deactivated / Terminated' },
              ]}
            />
          </div>
          <div className="w-full sm:w-48">
            <Select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              options={[
                { value: '', label: 'All Departments' },
                ...departments.map((d) => ({ value: d.id, label: d.name })),
              ]}
            />
          </div>
        </div>
      </div>

      {/* Directory Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading && employees.length === 0 ? (
            <div className="space-y-3 p-5 animate-pulse">
              <div className="h-8 bg-neutral-100 rounded w-full"></div>
              <div className="h-8 bg-neutral-100 rounded w-full"></div>
              <div className="h-8 bg-neutral-100 rounded w-full"></div>
            </div>
          ) : employees.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={Users}
                title="No employees found"
                description={search ? 'No employees match your search query.' : 'Add your first employee to the system.'}
                actionLabel="Add Employee"
                onAction={() => setIsCreateOpen(true)}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((emp) => {
                  const isTerminated =
                    emp.employmentStatus === 'TERMINATED' ||
                    (emp as any).user?.status === 'INACTIVE';
                  return (
                    <TableRow key={emp.id} className={isTerminated ? 'opacity-60 bg-neutral-50/50' : undefined}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-xs">
                            {(emp.displayName || emp.firstName || 'E').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-neutral-900 block text-xs">{emp.displayName || emp.firstName || 'Employee'}</span>
                            <span className="text-[11px] text-neutral-400 font-mono">{emp.email || ''}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-bold">{emp.employeeCode}</TableCell>
                      <TableCell className="text-xs">{emp.department?.name || '—'}</TableCell>
                      <TableCell className="text-xs">{emp.designation?.name || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={emp.employmentStatus === 'ACTIVE' && (emp as any).user?.status !== 'INACTIVE' ? 'success' : 'secondary'}>
                          {emp.employmentStatus === 'ACTIVE' && (emp as any).user?.status !== 'INACTIVE' ? 'ACTIVE' : 'TERMINATED'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-neutral-500">{formatDate(emp.joiningDate)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            title={isTerminated ? 'Cannot resend email for inactive employee' : 'Resend Onboarding Email with Temporary Password'}
                            disabled={isResendDisabled(emp)}
                            onClick={() => handleResendOnboarding(emp.id, emp.email)}
                            className="h-7 text-xs gap-1 text-neutral-600 hover:text-black disabled:opacity-40"
                          >
                            <Mail className="w-3 h-3" />
                            <span className="hidden md:inline">Resend Email</span>
                          </Button>
                          <Link href={`/admin/employees/${emp.id}`}>
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                              View <ArrowRight className="w-3 h-3" />
                            </Button>
                          </Link>
                          {isTerminated ? (
                            <Button
                              variant="outline"
                              size="sm"
                              title="Reactivate Employee"
                              onClick={() => handleReactivateClick(emp)}
                              className="h-7 text-xs gap-1 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 border-emerald-300"
                            >
                              <UserCheck className="w-3 h-3" />
                              <span className="hidden md:inline">Reactivate</span>
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Deactivate Employee"
                              onClick={() => handleDeactivateClick(emp)}
                              className="h-7 text-xs gap-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                            >
                              <UserX className="w-3 h-3" />
                              <span className="hidden md:inline">Deactivate</span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Employee Modal */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Add New Employee"
        description="Creates an authentication account, employee profile, leave balances, and ID badge atomically."
      >
        <form onSubmit={handleCreateEmployee} className="space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium">
              {error}
            </div>
          )}

          <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-xs text-neutral-600 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-neutral-800">
              <Mail className="w-3.5 h-3.5 text-neutral-700" />
              <span>Automated Onboarding Email</span>
            </div>
            <p className="text-[11px] text-neutral-500">
              A secure temporary password will be generated automatically and dispatched to the employee's work email address. The employee will be required to update their password on first login.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="First Name *"
              placeholder="e.g. John"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <Input
              label="Last Name *"
              placeholder="e.g. Doe"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Work Email *"
              type="email"
              placeholder="john.doe@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Employee Code *"
              placeholder="e.g. EMP102"
              required
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
            />
          </div>

          <div>
            <Select
              label="System Role"
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              options={[
                { value: 'EMPLOYEE', label: 'Employee' },
                { value: 'MANAGER', label: 'Manager' },
                { value: 'ADMIN', label: 'Admin' },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Department"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              options={[
                { value: '', label: 'Select Department' },
                ...departments.map((d) => ({ value: d.id, label: d.name })),
              ]}
            />
            <Select
              label="Designation"
              value={designationId}
              onChange={(e) => setDesignationId(e.target.value)}
              options={[
                { value: '', label: 'Select Designation' },
                ...designations.map((d) => ({ value: d.id, label: d.name })),
              ]}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Create Employee Profile
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Deactivate Confirmation Dialog */}
      <Dialog
        isOpen={!!deactivateTarget}
        onClose={handleDeactivateCancel}
        title="Deactivate Employee?"
        description="This action will immediately revoke all access for this employee."
      >
        {deactivateTarget && (
          <div className="space-y-4">
            {/* Employee info */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 border border-neutral-200">
              <div className="w-10 h-10 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
                {(deactivateTarget.displayName || deactivateTarget.firstName || 'E').charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-sm text-neutral-900">
                  {deactivateTarget.displayName || `${deactivateTarget.firstName} ${deactivateTarget.lastName}`}
                </p>
                <p className="text-xs text-neutral-500 font-mono">{deactivateTarget.email}</p>
              </div>
            </div>

            {/* Warning */}
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>What will happen:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-amber-700 pl-1">
                <li>Employee will no longer be able to log in to TeamsTechyArts</li>
                <li>All active sessions will be immediately revoked</li>
                <li>Any running task timer will be safely stopped</li>
                <li>Historical attendance, tasks, leave, and reports will be preserved</li>
              </ul>
            </div>

            {/* Error */}
            {deactivateError && (
              <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium">
                {deactivateError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <Button
                type="button"
                variant="outline"
                onClick={handleDeactivateCancel}
                disabled={isDeactivating}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleDeactivateConfirm}
                isLoading={isDeactivating}
                className="bg-rose-600 hover:bg-rose-700 text-white border-rose-600 hover:border-rose-700"
              >
                {isDeactivating ? 'Deactivating...' : 'Deactivate Employee'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Reactivate Confirmation Dialog */}
      <Dialog
        isOpen={!!reactivateTarget}
        onClose={handleReactivateCancel}
        title="Reactivate Employee?"
        description="After activation, this employee can log in, be added to new projects, and receive new work assignments."
      >
        {reactivateTarget && (
          <div className="space-y-4">
            {/* Employee info */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 border border-neutral-200">
              <div className="w-10 h-10 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
                {(reactivateTarget.displayName || reactivateTarget.firstName || 'E').charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-sm text-neutral-900">
                  {reactivateTarget.displayName || `${reactivateTarget.firstName} ${reactivateTarget.lastName}`}
                </p>
                <p className="text-xs text-neutral-500 font-mono">{reactivateTarget.email}</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>What will happen upon reactivation:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-emerald-700 pl-1">
                <li>Employee account status will be restored to ACTIVE</li>
                <li>Employee will be able to log in to TeamsTechyArts again</li>
                <li>Employee can be added to new projects and project teams</li>
                <li>Employee can be assigned new tasks and calendar events</li>
              </ul>
            </div>

            {reactivateError && (
              <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium">
                {reactivateError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <Button
                type="button"
                variant="outline"
                onClick={handleReactivateCancel}
                disabled={isReactivating}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleReactivateConfirm}
                isLoading={isReactivating}
                className="bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 hover:border-emerald-700"
              >
                {isReactivating ? 'Reactivating...' : 'Reactivate Employee'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
