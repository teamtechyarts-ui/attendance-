'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { leaveApi, employeesApi, departmentsApi, designationsApi } from '@/lib/api';
import {
  LeaveRequest,
  LeaveType,
  LeavePolicyConfig,
  LeaveAllocationRecord,
  LeaveOrganizationSummary,
  Employee,
  Department,
  Designation,
} from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/utils';
import {
  Calendar,
  Check,
  X,
  Plus,
  Settings,
  Users,
  ShieldCheck,
  Layers,
  RotateCcw,
  Edit2,
  Trash2,
  Info,
} from 'lucide-react';

const MONTH_OPTIONS = [
  { value: 'ALL', label: 'Full Year' },
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

export default function AdminLeavePage() {
  const [activeTab, setActiveTab] = useState<'REQUESTS' | 'BALANCES' | 'ALLOCATIONS' | 'POLICIES'>('REQUESTS');

  // Master Data
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);

  // Period Filters
  const today = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(String(today.getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());

  // Requests Tab State
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [requestFilter, setRequestFilter] = useState<string>('PENDING');
  const [selectedEmpFilter, setSelectedEmpFilter] = useState<string>('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('');
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);

  // Review Modal State
  const [selectedReq, setSelectedReq] = useState<LeaveRequest | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  // Balances Tab State
  const [orgSummary, setOrgSummary] = useState<LeaveOrganizationSummary | null>(null);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);

  // Allocations Tab State
  const [allocations, setAllocations] = useState<LeaveAllocationRecord[]>([]);
  const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);
  const [editingAllocation, setEditingAllocation] = useState<LeaveAllocationRecord | null>(null);
  const [allocLeaveTypeId, setAllocLeaveTypeId] = useState('');
  const [allocYear, setAllocYear] = useState(today.getFullYear());
  const [allocMonth, setAllocMonth] = useState<string>(String(today.getMonth() + 1));
  const [allocTargetType, setAllocTargetType] = useState<'ALL' | 'EMPLOYEE' | 'EMPLOYEES' | 'DEPARTMENT' | 'DESIGNATION'>('ALL');
  const [allocSelectedEmpIds, setAllocSelectedEmpIds] = useState<string[]>([]);
  const [allocDeptId, setAllocDeptId] = useState('');
  const [allocDesigId, setAllocDesigId] = useState('');
  const [allocDays, setAllocDays] = useState(2);
  const [allocNotes, setAllocNotes] = useState('');
  const [isSavingAllocation, setIsSavingAllocation] = useState(false);

  // Policies Tab State
  const [policies, setPolicies] = useState<LeavePolicyConfig[]>([]);
  const [editingPolicy, setEditingPolicy] = useState<LeavePolicyConfig | null>(null);
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const [policyCycle, setPolicyCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [policyMonthly, setPolicyMonthly] = useState(2);
  const [policyAnnual, setPolicyAnnual] = useState(24);
  const [policyCarryForward, setPolicyCarryForward] = useState(false);
  const [policyMaxCarry, setPolicyMaxCarry] = useState(6);
  const [policyRequiresApproval, setPolicyRequiresApproval] = useState(true);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);

  const yearOptions = useMemo(() => {
    const currentYear = today.getFullYear();
    const years: { value: string; label: string }[] = [];
    for (let y = currentYear - 3; y <= currentYear + 3; y++) {
      years.push({ value: String(y), label: String(y) });
    }
    return years;
  }, [today]);

  // Load Master Data on Mount
  useEffect(() => {
    Promise.all([
      leaveApi.getTypes(true),
      employeesApi.list(),
      departmentsApi.list().catch(() => []),
      designationsApi.list().catch(() => []),
    ]).then(([types, emps, depts, desigs]) => {
      setLeaveTypes(types || []);
      setEmployees(emps || []);
      setDepartments(depts || []);
      setDesignations(desigs || []);
      if (types && types.length > 0) {
        setAllocLeaveTypeId(types[0].id);
      }
    }).catch(() => {});
  }, []);

  // Fetch Requests
  const fetchRequests = useCallback(async () => {
    setIsLoadingRequests(true);
    try {
      const monthParam = selectedMonth === 'ALL' ? undefined : parseInt(selectedMonth, 10);
      const list = await leaveApi.listRequests({
        status: requestFilter === 'ALL' ? undefined : (requestFilter as any),
        employeeId: selectedEmpFilter || undefined,
        leaveTypeId: selectedTypeFilter || undefined,
        month: monthParam,
        year: selectedYear,
        adminView: true,
      });
      setRequests(list || []);
    } catch {
      setRequests([]);
    } finally {
      setIsLoadingRequests(false);
    }
  }, [requestFilter, selectedEmpFilter, selectedTypeFilter, selectedMonth, selectedYear]);

  // Fetch Balances
  const fetchBalances = useCallback(async () => {
    setIsLoadingBalances(true);
    try {
      const monthParam = selectedMonth === 'ALL' ? null : parseInt(selectedMonth, 10);
      const summary = await leaveApi.getOrganizationSummary({
        year: selectedYear,
        month: monthParam,
      });
      setOrgSummary(summary || null);
    } catch {
      setOrgSummary(null);
    } finally {
      setIsLoadingBalances(false);
    }
  }, [selectedYear, selectedMonth]);

  // Fetch Allocations
  const fetchAllocations = useCallback(async () => {
    try {
      const monthParam = selectedMonth === 'ALL' ? undefined : parseInt(selectedMonth, 10);
      const list = await leaveApi.getAllocations({
        year: selectedYear,
        month: monthParam,
      });
      setAllocations(list || []);
    } catch {
      setAllocations([]);
    }
  }, [selectedYear, selectedMonth]);

  // Fetch Policies
  const fetchPolicies = useCallback(async () => {
    try {
      const list = await leaveApi.getPolicies();
      setPolicies(list || []);
    } catch {
      setPolicies([]);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'REQUESTS') fetchRequests();
    if (activeTab === 'BALANCES') fetchBalances();
    if (activeTab === 'ALLOCATIONS') fetchAllocations();
    if (activeTab === 'POLICIES') fetchPolicies();
  }, [activeTab, fetchRequests, fetchBalances, fetchAllocations, fetchPolicies]);

  // Review Handler
  const handleDecision = async (status: 'APPROVED' | 'REJECTED') => {
    if (!selectedReq) return;
    setIsReviewing(true);
    try {
      await leaveApi.review(selectedReq.id, {
        status,
        reviewComment: reviewComment || undefined,
      });
      setSelectedReq(null);
      setReviewComment('');
      fetchRequests();
    } catch (err: any) {
      alert(err.message || 'Failed to review request');
    } finally {
      setIsReviewing(false);
    }
  };

  // Save Allocation Handler
  const handleSaveAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocLeaveTypeId) return;
    setIsSavingAllocation(true);
    try {
      const monthVal = allocMonth === 'ALL' ? null : parseInt(allocMonth, 10);
      if (editingAllocation) {
        await leaveApi.updateAllocation(editingAllocation.id, {
          leaveTypeId: allocLeaveTypeId,
          year: allocYear,
          month: monthVal,
          targetType: allocTargetType,
          targetEmployeeIds: allocSelectedEmpIds,
          targetDepartmentId: allocDeptId || null,
          targetDesignationId: allocDesigId || null,
          allocatedDays: Number(allocDays),
          notes: allocNotes,
        });
      } else {
        await leaveApi.createAllocation({
          leaveTypeId: allocLeaveTypeId,
          year: allocYear,
          month: monthVal,
          targetType: allocTargetType,
          targetEmployeeIds: allocSelectedEmpIds,
          targetDepartmentId: allocDeptId || null,
          targetDesignationId: allocDesigId || null,
          allocatedDays: Number(allocDays),
          notes: allocNotes,
        });
      }
      setIsAllocationModalOpen(false);
      setEditingAllocation(null);
      fetchAllocations();
      fetchBalances();
    } catch (err: any) {
      alert(err.message || 'Failed to save allocation');
    } finally {
      setIsSavingAllocation(false);
    }
  };

  // Delete Allocation
  const handleDeleteAllocation = async (id: string) => {
    if (!confirm('Are you sure you want to delete this leave allocation rule?')) return;
    try {
      await leaveApi.deleteAllocation(id);
      fetchAllocations();
      fetchBalances();
    } catch (err: any) {
      alert(err.message || 'Failed to delete allocation');
    }
  };

  // Save Policy Handler
  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPolicy) return;
    setIsSavingPolicy(true);
    try {
      await leaveApi.updatePolicy(editingPolicy.leaveTypeId, {
        policyCycle,
        monthlyAllocation: Number(policyMonthly),
        annualAllocation: Number(policyAnnual),
        carryForward: policyCarryForward,
        maxCarryForward: Number(policyMaxCarry),
        requiresApproval: policyRequiresApproval,
      });
      setIsPolicyModalOpen(false);
      setEditingPolicy(null);
      fetchPolicies();
      fetchBalances();
    } catch (err: any) {
      alert(err.message || 'Failed to update leave policy');
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const selectedMonthLabel = useMemo(() => {
    if (selectedMonth === 'ALL') return `Full Year ${selectedYear}`;
    const found = MONTH_OPTIONS.find((m) => m.value === selectedMonth);
    return `${found?.label || 'Month'} ${selectedYear}`;
  }, [selectedMonth, selectedYear]);

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Leave Administration</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Manage leave applications, configure monthly & policy allocations, and inspect organization balances.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 bg-neutral-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('REQUESTS')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'REQUESTS' ? 'bg-white text-black shadow-sm' : 'text-neutral-600 hover:text-black'
            }`}
          >
            Leave Approvals
          </button>
          <button
            onClick={() => setActiveTab('BALANCES')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'BALANCES' ? 'bg-white text-black shadow-sm' : 'text-neutral-600 hover:text-black'
            }`}
          >
            Organization Balances
          </button>
          <button
            onClick={() => setActiveTab('ALLOCATIONS')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'ALLOCATIONS' ? 'bg-white text-black shadow-sm' : 'text-neutral-600 hover:text-black'
            }`}
          >
            Monthly Allocations
          </button>
          <button
            onClick={() => setActiveTab('POLICIES')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'POLICIES' ? 'bg-white text-black shadow-sm' : 'text-neutral-600 hover:text-black'
            }`}
          >
            Leave Policies
          </button>
        </div>
      </div>

      {/* Global Period Selector Bar (Used by Requests, Balances, and Allocations) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-lg border border-neutral-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-bold text-neutral-600">Period:</span>
          <div className="w-36">
            <Select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              options={MONTH_OPTIONS}
            />
          </div>

          <div className="w-28">
            <Select
              value={String(selectedYear)}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              options={yearOptions}
            />
          </div>

          {activeTab === 'REQUESTS' && (
            <>
              <div className="w-44">
                <Select
                  value={selectedEmpFilter}
                  onChange={(e) => setSelectedEmpFilter(e.target.value)}
                  options={[
                    { value: '', label: 'All Employees' },
                    ...employees.map((e) => ({ value: e.id, label: e.displayName })),
                  ]}
                />
              </div>

              <div className="w-40">
                <Select
                  value={selectedTypeFilter}
                  onChange={(e) => setSelectedTypeFilter(e.target.value)}
                  options={[
                    { value: '', label: 'All Leave Types' },
                    ...leaveTypes.map((t) => ({ value: t.id, label: t.name })),
                  ]}
                />
              </div>

              <div className="w-36">
                <Select
                  value={requestFilter}
                  onChange={(e) => setRequestFilter(e.target.value)}
                  options={[
                    { value: 'ALL', label: 'All Statuses' },
                    { value: 'PENDING', label: 'Pending' },
                    { value: 'APPROVED', label: 'Approved' },
                    { value: 'REJECTED', label: 'Rejected' },
                    { value: 'CANCELLED', label: 'Cancelled' },
                  ]}
                />
              </div>
            </>
          )}

          {(selectedMonth !== String(today.getMonth() + 1) || selectedYear !== today.getFullYear() || selectedEmpFilter || selectedTypeFilter || requestFilter !== 'PENDING') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedMonth(String(today.getMonth() + 1));
                setSelectedYear(today.getFullYear());
                setSelectedEmpFilter('');
                setSelectedTypeFilter('');
                setRequestFilter('PENDING');
              }}
              className="h-9 px-2.5 text-xs text-neutral-600 hover:text-neutral-900 gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </Button>
          )}
        </div>

        {activeTab === 'ALLOCATIONS' && (
          <Button
            onClick={() => {
              setEditingAllocation(null);
              setAllocDays(2);
              setAllocTargetType('ALL');
              setAllocSelectedEmpIds([]);
              setAllocNotes('');
              setIsAllocationModalOpen(true);
            }}
            className="gap-1.5 shadow-sm text-xs"
          >
            <Plus className="w-3.5 h-3.5" /> New Allocation Rule
          </Button>
        )}
      </div>

      {/* ========================================== */}
      {/* TAB 1: LEAVE REQUESTS & APPROVALS */}
      {/* ========================================== */}
      {activeTab === 'REQUESTS' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Leave Applications ({selectedMonthLabel})</CardTitle>
            <CardDescription>Review and approve employee time off requests.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingRequests && requests.length === 0 ? (
              <div className="space-y-3 p-5 animate-pulse">
                <div className="h-8 bg-neutral-100 rounded w-full"></div>
                <div className="h-8 bg-neutral-100 rounded w-full"></div>
                <div className="h-8 bg-neutral-100 rounded w-full"></div>
              </div>
            ) : requests.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={Calendar}
                  title="No leave requests"
                  description={`No leave requests matching current filters for ${selectedMonthLabel}.`}
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Leave Type</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Working Days</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell>
                        <span className="font-bold text-xs text-neutral-900 block">
                          {req.employee?.displayName || 'Staff'}
                        </span>
                        <span className="text-[10px] text-neutral-400 font-mono">
                          {req.employee?.employeeCode}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs font-semibold">{req.leaveType?.name}</TableCell>
                      <TableCell className="text-xs font-mono">
                        {formatDate(req.startDate)} – {formatDate(req.endDate)}
                      </TableCell>
                      <TableCell className="font-bold text-xs">{req.totalDays} d</TableCell>
                      <TableCell className="text-xs max-w-xs truncate">{req.reason}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            req.status === 'APPROVED'
                              ? 'success'
                              : req.status === 'REJECTED'
                              ? 'danger'
                              : req.status === 'PENDING'
                              ? 'warning'
                              : 'secondary'
                          }
                        >
                          {req.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {req.status === 'PENDING' ? (
                          <Button
                            onClick={() => setSelectedReq(req)}
                            size="sm"
                            className="h-7 text-xs gap-1"
                          >
                            Review
                          </Button>
                        ) : (
                          <span className="text-[11px] text-neutral-400">
                            {req.reviewComment || req.status}
                          </span>
                        )}
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
      {/* TAB 2: ORGANIZATION BALANCES */}
      {/* ========================================== */}
      {activeTab === 'BALANCES' && (
        <div className="space-y-6">
          {/* Org Summary Metrics */}
          {orgSummary?.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="p-4 bg-white border-neutral-200 shadow-sm text-center">
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">Active Staff</span>
                <span className="text-2xl font-black text-neutral-900 mt-1 block">
                  {orgSummary.summary.totalEmployees}
                </span>
                <span className="text-[10px] text-neutral-400">Employees</span>
              </Card>

              <Card className="p-4 bg-neutral-50 border-neutral-200 shadow-sm text-center">
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">Total Allocated</span>
                <span className="text-2xl font-black text-neutral-900 mt-1 block">
                  {orgSummary.summary.totalAllocated}
                </span>
                <span className="text-[10px] text-neutral-400">Days for {selectedMonthLabel}</span>
              </Card>

              <Card className="p-4 bg-purple-50/50 border-purple-100 shadow-sm text-center">
                <span className="text-[10px] uppercase font-bold text-purple-700 block">Total Used</span>
                <span className="text-2xl font-black text-purple-900 mt-1 block">
                  {orgSummary.summary.totalUsed}
                </span>
                <span className="text-[10px] text-purple-600">Approved Leave Days</span>
              </Card>

              <Card className="p-4 bg-emerald-50/50 border-emerald-100 shadow-sm text-center">
                <span className="text-[10px] uppercase font-bold text-emerald-700 block">Total Remaining</span>
                <span className="text-2xl font-black text-emerald-900 mt-1 block">
                  {orgSummary.summary.totalRemaining}
                </span>
                <span className="text-[10px] text-emerald-600">Available Days</span>
              </Card>
            </div>
          )}

          {/* Per-Employee Balances Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Employee Balances & Usage ({selectedMonthLabel})</CardTitle>
              <CardDescription>
                Calculated balance per employee for the selected period with full leave type breakdown.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingBalances ? (
                <div className="p-8">
                  <LoadingState message="Calculating organization leave balances..." />
                </div>
              ) : !orgSummary?.employees || orgSummary.employees.length === 0 ? (
                <div className="p-8">
                  <EmptyState icon={Users} title="No employee data" description="No active staff members found." />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Total Allocated</TableHead>
                      <TableHead>Total Used</TableHead>
                      <TableHead>Total Remaining</TableHead>
                      <TableHead>Breakdown by Leave Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orgSummary.employees.map((row) => (
                      <TableRow key={row.employee?.id}>
                        <TableCell>
                          <span className="font-bold text-xs text-neutral-900 block">
                            {row.employee?.displayName}
                          </span>
                          <span className="text-[10px] text-neutral-400 font-mono">
                            {row.employee?.employeeCode}
                          </span>
                        </TableCell>
                        <TableCell className="font-bold text-xs">{row.allocatedDays} d</TableCell>
                        <TableCell className="font-bold text-xs text-purple-700">{row.usedDays} d</TableCell>
                        <TableCell>
                          <Badge variant={row.remainingDays > 0 ? 'success' : 'secondary'} className="font-mono">
                            {row.remainingDays} d
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2 text-xs">
                            {row.typeBalances.map((tb) => (
                              <div
                                key={tb.leaveTypeId}
                                className="px-2 py-1 rounded bg-neutral-50 border border-neutral-200 text-[11px]"
                              >
                                <span className="font-semibold text-neutral-800">{tb.leaveTypeName}: </span>
                                <span className="text-neutral-500">Alloc: {tb.allocatedDays}</span> |{' '}
                                <span className="text-purple-600">Used: {tb.usedDays}</span> |{' '}
                                <span className="font-bold text-emerald-700">Rem: {tb.remainingDays}</span>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 3: MONTHLY ALLOCATIONS */}
      {/* ========================================== */}
      {activeTab === 'ALLOCATIONS' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Leave Allocation Rules ({selectedMonthLabel})</CardTitle>
            <CardDescription>
              Targeted monthly and annual leave allocation overrides (Specific Employee &gt; Department &gt; All Employees).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {allocations.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={Layers}
                  title="No custom allocations"
                  description={`No override allocation rules set for ${selectedMonthLabel}. Standard leave policy defaults will apply.`}
                  actionLabel="Add Allocation Rule"
                  onAction={() => {
                    setEditingAllocation(null);
                    setAllocDays(2);
                    setAllocTargetType('ALL');
                    setAllocSelectedEmpIds([]);
                    setAllocNotes('');
                    setIsAllocationModalOpen(true);
                  }}
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Leave Type</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Target Scope</TableHead>
                    <TableHead>Allocated Days</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allocations.map((alloc) => {
                    const lt = leaveTypes.find((t) => t.id === alloc.leaveTypeId);
                    const monthText = alloc.month
                      ? MONTH_OPTIONS.find((m) => m.value === String(alloc.month))?.label || `M${alloc.month}`
                      : 'Full Year';

                    let targetText = 'All Employees';
                    if (alloc.targetType === 'EMPLOYEE' || alloc.targetType === 'EMPLOYEES') {
                      const empNames = employees
                        .filter((e) => alloc.targetEmployeeIds?.includes(e.id))
                        .map((e) => e.displayName);
                      targetText = empNames.length > 0 ? empNames.join(', ') : 'Selected Staff';
                    } else if (alloc.targetType === 'DEPARTMENT') {
                      const dept = departments.find((d) => d.id === alloc.targetDepartmentId);
                      targetText = `Department: ${dept?.name || 'Assigned'}`;
                    } else if (alloc.targetType === 'DESIGNATION') {
                      const desig = designations.find((d) => d.id === alloc.targetDesignationId);
                      targetText = `Designation: ${desig?.name || 'Assigned'}`;
                    }

                    return (
                      <TableRow key={alloc.id}>
                        <TableCell className="font-semibold text-xs text-neutral-900">
                          {lt?.name || 'Leave Type'}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {monthText} {alloc.year}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-neutral-700">
                          <Badge variant="outline" className="bg-neutral-50 text-[10px]">
                            {alloc.targetType}
                          </Badge>{' '}
                          <span className="ml-1 text-neutral-800">{targetText}</span>
                        </TableCell>
                        <TableCell className="font-bold text-xs">{alloc.allocatedDays} d</TableCell>
                        <TableCell className="text-xs text-neutral-500">{alloc.notes || '—'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              onClick={() => {
                                setEditingAllocation(alloc);
                                setAllocLeaveTypeId(alloc.leaveTypeId);
                                setAllocYear(alloc.year);
                                setAllocMonth(alloc.month ? String(alloc.month) : 'ALL');
                                setAllocTargetType(alloc.targetType);
                                setAllocSelectedEmpIds(alloc.targetEmployeeIds || []);
                                setAllocDeptId(alloc.targetDepartmentId || '');
                                setAllocDesigId(alloc.targetDesignationId || '');
                                setAllocDays(alloc.allocatedDays);
                                setAllocNotes(alloc.notes || '');
                                setIsAllocationModalOpen(true);
                              }}
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              onClick={() => handleDeleteAllocation(alloc.id)}
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
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
      )}

      {/* ========================================== */}
      {/* TAB 4: LEAVE POLICIES */}
      {/* ========================================== */}
      {activeTab === 'POLICIES' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Leave Policy Configuration</CardTitle>
            <CardDescription>
              Configure default entitlement cycles (Monthly vs Annual) and carry-forward rules per leave type.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Leave Type</TableHead>
                  <TableHead>Policy Cycle</TableHead>
                  <TableHead>Monthly Entitlement</TableHead>
                  <TableHead>Annual Maximum</TableHead>
                  <TableHead>Carry Forward</TableHead>
                  <TableHead>Max Carry Forward</TableHead>
                  <TableHead>Approval Required</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((p) => {
                  const lt = leaveTypes.find((t) => t.id === p.leaveTypeId);
                  return (
                    <TableRow key={p.leaveTypeId}>
                      <TableCell className="font-semibold text-xs text-neutral-900">
                        {lt?.name || 'Leave Type'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={p.policyCycle === 'MONTHLY' ? 'outline' : 'secondary'}
                          className="font-mono text-[10px]"
                        >
                          {p.policyCycle}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-bold text-xs">{p.monthlyAllocation} d / mo</TableCell>
                      <TableCell className="font-bold text-xs">{p.annualAllocation} d / yr</TableCell>
                      <TableCell>
                        <Badge variant={p.carryForward ? 'success' : 'secondary'} className="text-[10px]">
                          {p.carryForward ? 'YES' : 'NO'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{p.carryForward ? `${p.maxCarryForward} d` : '—'}</TableCell>
                      <TableCell>
                        <Badge variant={p.requiresApproval ? 'warning' : 'secondary'} className="text-[10px]">
                          {p.requiresApproval ? 'REQUIRED' : 'AUTO'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          onClick={() => {
                            setEditingPolicy(p);
                            setPolicyCycle(p.policyCycle);
                            setPolicyMonthly(p.monthlyAllocation);
                            setPolicyAnnual(p.annualAllocation);
                            setPolicyCarryForward(p.carryForward);
                            setPolicyMaxCarry(p.maxCarryForward);
                            setPolicyRequiresApproval(p.requiresApproval);
                            setIsPolicyModalOpen(true);
                          }}
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                        >
                          <Settings className="w-3.5 h-3.5" /> Edit Policy
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Review Modal */}
      <Dialog
        isOpen={Boolean(selectedReq)}
        onClose={() => setSelectedReq(null)}
        title="Review Leave Application"
        description={`Applicant: ${selectedReq?.employee?.displayName} (${selectedReq?.totalDays} days of ${selectedReq?.leaveType?.name})`}
      >
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 space-y-2 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Requested Period</span>
              <span className="font-semibold text-neutral-800">
                {selectedReq && formatDate(selectedReq.startDate)} – {selectedReq && formatDate(selectedReq.endDate)}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Reason</span>
              <p className="text-neutral-700">{selectedReq?.reason}</p>
            </div>
          </div>

          <Textarea
            label="Reviewer Comments / Notes (Optional)"
            placeholder="Add comments explaining approval or reason for rejection..."
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDecision('REJECTED')}
              isLoading={isReviewing}
              className="text-rose-600 border-rose-200 hover:bg-rose-50"
            >
              <X className="w-4 h-4 mr-1" /> Reject Request
            </Button>
            <Button
              type="button"
              onClick={() => handleDecision('APPROVED')}
              isLoading={isReviewing}
              className="bg-black hover:bg-neutral-800"
            >
              <Check className="w-4 h-4 mr-1" /> Approve Request
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Leave Allocation Modal */}
      <Dialog
        isOpen={isAllocationModalOpen}
        onClose={() => setIsAllocationModalOpen(false)}
        title={editingAllocation ? 'Edit Leave Allocation' : 'Create Leave Allocation Rule'}
        description="Assign targeted monthly or annual leave entitlements to employees, departments, or all staff."
      >
        <form onSubmit={handleSaveAllocation} className="space-y-4">
          <Select
            label="Leave Type *"
            value={allocLeaveTypeId}
            onChange={(e) => setAllocLeaveTypeId(e.target.value)}
            options={leaveTypes.map((t) => ({ value: t.id, label: t.name }))}
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Month *"
              value={allocMonth}
              onChange={(e) => setAllocMonth(e.target.value)}
              options={MONTH_OPTIONS}
            />
            <Select
              label="Year *"
              value={String(allocYear)}
              onChange={(e) => setAllocYear(parseInt(e.target.value, 10))}
              options={yearOptions}
            />
          </div>

          <Select
            label="Target Scope *"
            value={allocTargetType}
            onChange={(e) => setAllocTargetType(e.target.value as any)}
            options={[
              { value: 'ALL', label: 'All Employees' },
              { value: 'EMPLOYEE', label: 'Specific Employee' },
              { value: 'DEPARTMENT', label: 'Department' },
              { value: 'DESIGNATION', label: 'Designation' },
            ]}
          />

          {allocTargetType === 'EMPLOYEE' && (
            <Select
              label="Select Employee *"
              value={allocSelectedEmpIds[0] || ''}
              onChange={(e) => setAllocSelectedEmpIds([e.target.value])}
              options={employees.map((e) => ({ value: e.id, label: `${e.displayName} (${e.employeeCode})` }))}
            />
          )}

          {allocTargetType === 'DEPARTMENT' && (
            <Select
              label="Select Department *"
              value={allocDeptId}
              onChange={(e) => setAllocDeptId(e.target.value)}
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
            />
          )}

          {allocTargetType === 'DESIGNATION' && (
            <Select
              label="Select Designation *"
              value={allocDesigId}
              onChange={(e) => setAllocDesigId(e.target.value)}
              options={designations.map((d) => ({ value: d.id, label: d.name }))}
            />
          )}

          <Input
            label="Allocated Days *"
            type="number"
            step="0.5"
            min="0"
            required
            value={allocDays}
            onChange={(e) => setAllocDays(parseFloat(e.target.value) || 0)}
          />

          <Textarea
            label="Notes / Rationale (Optional)"
            placeholder="e.g., Project crunch month, zero allocation..."
            value={allocNotes}
            onChange={(e) => setAllocNotes(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
            <Button type="button" variant="outline" onClick={() => setIsAllocationModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSavingAllocation}>
              Save Allocation Rule
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Leave Policy Modal */}
      <Dialog
        isOpen={isPolicyModalOpen}
        onClose={() => setIsPolicyModalOpen(false)}
        title="Configure Leave Policy"
        description="Set the entitlement cycle and carry-forward rules for this leave type."
      >
        <form onSubmit={handleSavePolicy} className="space-y-4">
          <Select
            label="Entitlement Policy Cycle *"
            value={policyCycle}
            onChange={(e) => setPolicyCycle(e.target.value as any)}
            options={[
              { value: 'MONTHLY', label: 'Monthly (e.g. 2 days/month)' },
              { value: 'ANNUAL', label: 'Annual (e.g. 24 days/year)' },
            ]}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Monthly Entitlement (Days) *"
              type="number"
              step="0.5"
              min="0"
              required
              value={policyMonthly}
              onChange={(e) => setPolicyMonthly(parseFloat(e.target.value) || 0)}
            />
            <Input
              label="Annual Maximum (Days) *"
              type="number"
              step="0.5"
              min="0"
              required
              value={policyAnnual}
              onChange={(e) => setPolicyAnnual(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="p-3 rounded-lg border border-neutral-200 bg-neutral-50 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-neutral-800">
              <input
                type="checkbox"
                checked={policyCarryForward}
                onChange={(e) => setPolicyCarryForward(e.target.checked)}
                className="rounded border-neutral-300 text-black focus:ring-black"
              />
              Allow Unused Entitlement Carry-Forward
            </label>

            {policyCarryForward && (
              <Input
                label="Maximum Carry-Forward Days"
                type="number"
                step="0.5"
                min="0"
                value={policyMaxCarry}
                onChange={(e) => setPolicyMaxCarry(parseFloat(e.target.value) || 0)}
              />
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-neutral-800">
            <input
              type="checkbox"
              checked={policyRequiresApproval}
              onChange={(e) => setPolicyRequiresApproval(e.target.checked)}
              className="rounded border-neutral-300 text-black focus:ring-black"
            />
            Require Manager / Admin Approval for Requests
          </label>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
            <Button type="button" variant="outline" onClick={() => setIsPolicyModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSavingPolicy}>
              Save Policy Configuration
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
