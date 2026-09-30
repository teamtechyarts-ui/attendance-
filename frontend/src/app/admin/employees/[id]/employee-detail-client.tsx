'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { employeesApi, attendanceApi, tasksApi, leaveApi, reportsApi, feedbackApi, rbacApi } from '@/lib/api';
import { Employee, Task, AttendanceRecord, LeaveRequest, DailyWorkReport, Feedback, LimitedAdminAssignment } from '@/types';
import { ManageAccessModal } from '@/components/admin/manage-access-modal';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { LoadingState } from '@/components/ui/loading-state';
import { formatDate, formatTime, formatSecondsToTime } from '@/lib/utils';
import { Dialog } from '@/components/ui/dialog';
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  Clock,
  FileText,
  MessageSquare,
  User,
  Shield,
  CreditCard,
  Mail,
  UserX,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  Lock,
  Unlock,
  Settings2,
} from 'lucide-react';

export default function EmployeeDetailClient() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [reports, setReports] = useState<DailyWorkReport[]>([]);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isResending, setIsResending] = useState(false);

  // Live ticking milliseconds for running timers
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTimeMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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

  // Deactivation state
  const [isDeactivateOpen, setIsDeactivateOpen] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  // Reactivation state
  const [isReactivateOpen, setIsReactivateOpen] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const [reactivateError, setReactivateError] = useState<string | null>(null);

  // RBAC Access Control State
  const [assignment, setAssignment] = useState<LimitedAdminAssignment | null>(null);
  const [isManageAccessOpen, setIsManageAccessOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [emp, att, tsk, lve, rep, fbk, assignRes] = await Promise.all([
        employeesApi.getById(id),
        attendanceApi.getHistory({ employeeId: id, adminView: true }),
        tasksApi.list({ employeeId: id, adminView: true }),
        leaveApi.listRequests({ employeeId: id, adminView: true }),
        reportsApi.list({ employeeId: id, adminView: true }),
        feedbackApi.list({ employeeId: id, adminView: true }),
        rbacApi.getAssignment(id).catch(() => null),
      ]);
      setEmployee(emp);
      setAttendances(att?.records || (Array.isArray(att) ? att : []));
      setTasks(tsk || []);
      setLeaveRequests(lve || []);
      setReports(rep || []);
      setFeedbacks(fbk || []);
      setAssignment(assignRes);
    } catch (err: any) {
      alert(err.message || 'Failed to load employee details');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) loadData();
  }, [id, loadData]);

  const handleResendOnboarding = async () => {
    if (!employee) return;
    if (!confirm(`Generate a new temporary password and send onboarding email to ${employee.email}?`)) return;
    setIsResending(true);
    try {
      const res = await employeesApi.resendOnboarding(employee.id);
      alert(res.message || `Onboarding credentials sent successfully to ${employee.email}`);
    } catch (err: any) {
      alert(err.message || 'Failed to resend onboarding email');
    } finally {
      setIsResending(false);
    }
  };

  const handleDeactivateConfirm = async () => {
    if (!employee || isDeactivating) return;
    setIsDeactivating(true);
    setDeactivateError(null);
    try {
      await employeesApi.deactivate(employee.id);
      router.push('/admin/employees');
    } catch (err: any) {
      setDeactivateError(err.message || 'Unable to deactivate employee. Please try again.');
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleReactivateConfirm = async () => {
    if (!employee || isReactivating) return;
    setIsReactivating(true);
    setReactivateError(null);
    try {
      await employeesApi.reactivate(employee.id);
      setIsReactivateOpen(false);
      await loadData();
    } catch (err: any) {
      setReactivateError(err.message || 'Unable to reactivate employee. Please try again.');
    } finally {
      setIsReactivating(false);
    }
  };

  const isTerminated =
    employee?.employmentStatus === 'TERMINATED' ||
    (employee as any)?.user?.status === 'INACTIVE';

  if (isLoading || !employee) {
    return <LoadingState message="Loading employee intelligence dossier..." />;
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: <User className="w-3.5 h-3.5" /> },
    { id: 'attendance', label: 'Attendance', count: attendances.length, icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'tasks', label: 'Tasks', count: tasks.length, icon: <Briefcase className="w-3.5 h-3.5" /> },
    { id: 'leave', label: 'Leave', count: leaveRequests.length, icon: <Calendar className="w-3.5 h-3.5" /> },
    { id: 'reports', label: 'Work Reports', count: reports.length, icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'feedback', label: 'Reviews', count: feedbacks.length, icon: <MessageSquare className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div className="flex items-center gap-3">
          <Link href="/admin/employees">
            <Button variant="outline" size="icon" className="h-8 w-8">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">{employee.displayName}</h1>
            <p className="text-xs text-neutral-500 font-mono">
              {employee.employeeCode} · {employee.department?.name || 'General'} · {employee.designation?.name || 'Staff'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {assignment?.isSuperAdmin ? (
            <Badge className="bg-indigo-600 text-white text-xs gap-1 py-1 px-2.5">
              <Shield className="w-3.5 h-3.5" /> Super Admin
            </Badge>
          ) : (
            <Button
              variant={assignment?.isLimitedAdmin ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setIsManageAccessOpen(true)}
              className="gap-1.5 text-xs"
            >
              <KeyRound className="w-3.5 h-3.5" />
              {assignment?.isLimitedAdmin ? 'Manage Limited Admin' : 'Grant Limited Admin'}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            isLoading={isResending}
            onClick={handleResendOnboarding}
            disabled={isTerminated || isResending}
            className="gap-1.5 text-xs disabled:opacity-40"
          >
            <Mail className="w-3.5 h-3.5" /> Resend Onboarding Email
          </Button>
          {isTerminated ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setIsReactivateOpen(true); setReactivateError(null); }}
              className="gap-1.5 text-xs text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 border-emerald-300"
            >
              <UserCheck className="w-3.5 h-3.5" /> Reactivate Employee
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setIsDeactivateOpen(true); setDeactivateError(null); }}
              className="gap-1.5 text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50"
            >
              <UserX className="w-3.5 h-3.5" /> Deactivate
            </Button>
          )}
        </div>
      </div>

      {/* Overview Card */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-xl">
              {(employee.displayName || employee.firstName || 'E').charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-neutral-900">{employee.displayName || employee.firstName || 'Employee'}</h2>
                <Badge variant={employee.employmentStatus === 'ACTIVE' ? 'success' : 'secondary'}>
                  {employee.employmentStatus}
                </Badge>
                {assignment?.isSuperAdmin ? (
                  <Badge className="bg-indigo-600 text-white text-[10px]">Super Admin</Badge>
                ) : assignment?.isLimitedAdmin ? (
                  <Badge variant="secondary" className="bg-sky-50 text-sky-700 border-sky-200 text-[10px]">Limited Admin</Badge>
                ) : null}
              </div>
              <p className="text-xs text-neutral-500 font-mono">{employee.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              ID Card: ID-{employee.employeeCode}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} tabs={tabs} />

      {/* Tab 1: Profile */}
      {activeTab === 'profile' && (
        <Card className="p-6 space-y-5">
          <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">Employee Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Full Name</span>
              <span className="font-semibold text-neutral-800">{employee.firstName} {employee.lastName}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Official Email</span>
              <span className="font-semibold text-neutral-800 font-mono">{employee.email}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Phone</span>
              <span className="font-semibold text-neutral-800">{employee.phone || '—'}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Joining Date</span>
              <span className="font-semibold text-neutral-800">{formatDate(employee.joiningDate)}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Department</span>
              <span className="font-semibold text-neutral-800">{employee.department?.name || '—'}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Designation</span>
              <span className="font-semibold text-neutral-800">{employee.designation?.name || '—'}</span>
            </div>
          </div>

          {/* Access Control & Permissions Section */}
          <div className="pt-4 border-t border-neutral-100 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-neutral-700" />
                Access Control & Administrative Privileges
              </h3>
              {!assignment?.isSuperAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsManageAccessOpen(true)}
                  className="text-xs h-7 gap-1"
                >
                  <Settings2 className="w-3 h-3" /> Configure Access
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs p-4 rounded-xl bg-neutral-50/80 border border-neutral-200">
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">System Role</span>
                <div className="mt-1">
                  {assignment?.isSuperAdmin ? (
                    <Badge className="bg-indigo-600 text-white text-[11px] font-bold">
                      <Shield className="w-3 h-3 mr-1" /> Super Administrator
                    </Badge>
                  ) : assignment?.isLimitedAdmin ? (
                    <Badge variant="secondary" className="bg-sky-50 text-sky-700 border-sky-200 text-[11px] font-bold">
                      <Unlock className="w-3 h-3 mr-1 text-sky-600" /> Limited Admin
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-neutral-600 text-[11px]">
                      Standard Employee
                    </Badge>
                  )}
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">Permissions</span>
                <span className="font-semibold text-neutral-800 block mt-1">
                  {assignment?.isSuperAdmin
                    ? 'Universal Access (All 32 Permissions)'
                    : assignment?.isLimitedAdmin && assignment.config
                    ? `${assignment.config.permissions.length} Granular Permissions Active`
                    : 'Standard Employee Workspace Privileges'}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">Administrative Scope</span>
                <span className="font-semibold text-neutral-800 block mt-1">
                  {assignment?.isSuperAdmin
                    ? 'Global (Unrestricted)'
                    : assignment?.isLimitedAdmin && assignment.config?.scope
                    ? `${assignment.config.scope.projectIds?.length ? `${assignment.config.scope.projectIds.length} Projects, ` : ''}${assignment.config.scope.departmentIds?.length ? `${assignment.config.scope.departmentIds.length} Depts` : 'Global'}`
                    : 'Self Workspace Only'}
                </span>
              </div>
            </div>
          </div>

          <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-wider pt-4 border-t border-neutral-100">
            Emergency Contact
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Contact Name</span>
              <span className="font-semibold text-neutral-800">{employee.emergencyContactName || '—'}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Phone</span>
              <span className="font-semibold text-neutral-800">{employee.emergencyContactPhone || '—'}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Relation</span>
              <span className="font-semibold text-neutral-800">{employee.emergencyContactRelation || '—'}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Tab 2: Attendance */}
      {activeTab === 'attendance' && (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Work Mode</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendances.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-xs text-neutral-500 py-6">
                    No attendance records found.
                  </TableCell>
                </TableRow>
              ) : (
                attendances.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-semibold">{formatDate(a.attendanceDate)}</TableCell>
                    <TableCell>
                      <Badge variant={a.status === 'PRESENT' ? 'success' : 'warning'}>{a.status}</Badge>
                    </TableCell>
                    <TableCell>{a.workMode}</TableCell>
                    <TableCell>{formatTime(a.checkInAt)}</TableCell>
                    <TableCell>{formatTime(a.checkOutAt)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {a.totalWorkMinutes ? `${Math.floor(a.totalWorkMinutes / 60)}h ${a.totalWorkMinutes % 60}m` : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Tab 3: Tasks */}
      {activeTab === 'tasks' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tasks.map((task: any) => {
            const isRunning = Boolean(task.activeTimer?.isActive || (task.timers && task.timers.some((t: any) => t.isActive ?? t.is_active)));
            const liveDuration = calculateLiveTaskDuration(task, currentTimeMs);

            return (
              <Card key={task.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={task.priority === 'URGENT' ? 'danger' : 'secondary'} className="text-[10px]">
                      {task.priority}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{task.status}</Badge>
                    {task.project?.name && (
                      <span className="text-[10px] font-semibold text-neutral-600 bg-neutral-100 px-1.5 py-0.5 rounded">
                        {task.project.name}
                      </span>
                    )}
                  </div>
                  {isRunning && (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      LIVE
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-bold text-neutral-900">{task.title}</h4>
                {task.description && <p className="text-xs text-neutral-500">{task.description}</p>}
                <div className="flex items-center justify-between pt-2 border-t border-neutral-100 text-xs">
                  <span className="text-[10px] uppercase font-bold text-neutral-400">Worked Time</span>
                  <span className={`font-mono font-bold ${isRunning ? 'text-emerald-700' : 'text-neutral-900'}`}>
                    {formatSecondsToTime(liveDuration)}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tab 4: Leave */}
      {activeTab === 'leave' && (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dates</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaveRequests.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-semibold text-xs">
                    {formatDate(l.startDate)} – {formatDate(l.endDate)}
                  </TableCell>
                  <TableCell className="font-bold text-xs">{l.totalDays}</TableCell>
                  <TableCell className="text-xs">{l.reason}</TableCell>
                  <TableCell>
                    <Badge variant={l.status === 'APPROVED' ? 'success' : 'warning'}>{l.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Tab 5: Reports */}
      {activeTab === 'reports' && (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Blockers</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-semibold text-xs">{formatDate(r.reportDate)}</TableCell>
                  <TableCell className="text-xs text-neutral-900 font-medium">{r.description}</TableCell>
                  <TableCell className="text-xs text-neutral-500">{r.blockers || 'None'}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === 'REVIEWED' ? 'success' : 'secondary'}>{r.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Tab 6: Feedback */}
      {activeTab === 'feedback' && (
        <div className="space-y-4">
          {feedbacks.map((f) => (
            <Card key={f.id} className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-600">
                  {f.period} Review (Score: {f.overallScore} / 5)
                </span>
                <span className="text-xs text-neutral-400 font-mono">
                  {formatDate(f.periodStart)} – {formatDate(f.periodEnd)}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                <div>
                  <span className="font-bold block">{f.productivityScore}</span>
                  <span className="text-neutral-400 text-[10px]">Productivity</span>
                </div>
                <div>
                  <span className="font-bold block">{f.qualityScore}</span>
                  <span className="text-neutral-400 text-[10px]">Quality</span>
                </div>
                <div>
                  <span className="font-bold block">{f.communicationScore}</span>
                  <span className="text-neutral-400 text-[10px]">Communication</span>
                </div>
                <div>
                  <span className="font-bold block">{f.ownershipScore}</span>
                  <span className="text-neutral-400 text-[10px]">Ownership</span>
                </div>
              </div>
              {f.strengths && <p className="text-xs text-neutral-700"><strong>Strengths:</strong> {f.strengths}</p>}
              {f.areasToImprove && <p className="text-xs text-neutral-700"><strong>Areas to Improve:</strong> {f.areasToImprove}</p>}
            </Card>
          ))}
        </div>
      )}

      {/* Deactivate Confirmation Dialog */}
      <Dialog
        isOpen={isDeactivateOpen}
        onClose={() => { if (!isDeactivating) { setIsDeactivateOpen(false); setDeactivateError(null); } }}
        title="Deactivate Employee?"
        description="This action will immediately revoke all access for this employee."
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 border border-neutral-200">
            <div className="w-10 h-10 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
              {(employee.displayName || employee.firstName || 'E').charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-sm text-neutral-900">
                {employee.displayName || `${employee.firstName} ${employee.lastName}`}
              </p>
              <p className="text-xs text-neutral-500 font-mono">{employee.email}</p>
            </div>
          </div>

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

          {deactivateError && (
            <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium">
              {deactivateError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setIsDeactivateOpen(false); setDeactivateError(null); }}
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
      </Dialog>

      {/* Reactivate Confirmation Dialog */}
      <Dialog
        isOpen={isReactivateOpen}
        onClose={() => { if (!isReactivating) { setIsReactivateOpen(false); setReactivateError(null); } }}
        title="Reactivate Employee?"
        description="After activation, this employee can log in, be added to new projects, and receive new work assignments."
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 border border-neutral-200">
            <div className="w-10 h-10 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
              {(employee.displayName || employee.firstName || 'E').charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-sm text-neutral-900">
                {employee.displayName || `${employee.firstName} ${employee.lastName}`}
              </p>
              <p className="text-xs text-neutral-500 font-mono">{employee.email}</p>
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
              onClick={() => { setIsReactivateOpen(false); setReactivateError(null); }}
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
      </Dialog>

      {/* Access Control Modal */}
      {employee && isManageAccessOpen && (
        <ManageAccessModal
          isOpen={isManageAccessOpen}
          onClose={() => setIsManageAccessOpen(false)}
          employee={{
            id: employee.id,
            displayName: employee.displayName || `${employee.firstName} ${employee.lastName}`,
            email: employee.email,
            employeeCode: employee.employeeCode,
            departmentName: employee.department?.name,
          }}
          onSuccess={() => {
            loadData();
          }}
        />
      )}
    </div>
  );
}
