'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { attendanceApi } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useTaskTimer } from '@/hooks/use-task-timer';
import { AttendanceRecord, AttendanceSummary } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { CheckInModal } from '@/components/attendance/check-in-modal';
import { formatDate, formatTime } from '@/lib/utils';
import {
  Clock,
  LogOut,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plane,
  Palmtree,
  Coffee,
  RotateCcw,
} from 'lucide-react';

const MONTH_OPTIONS = [
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

const STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'PRESENT', label: 'Present' },
  { value: 'LATE', label: 'Late' },
  { value: 'HALF_DAY', label: 'Half Day' },
  { value: 'WORKED_ON_HOLIDAY', label: 'Holiday Worked' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'LEAVE', label: 'Leave' },
  { value: 'HOLIDAY', label: 'Holiday' },
  { value: 'OFF', label: 'Off / Weekend' },
];

export default function AttendancePage() {
  const { user, todayAttendance, isAttendanceLoading, isAttendanceResolved, markAttendanceSuccess } = useAuth();
  const { activeTimer, refreshTimer } = useTaskTimer();

  const today = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [isTimerCheckoutModalOpen, setIsTimerCheckoutModalOpen] = useState(false);
  const [isOvertimeConfirmed, setIsOvertimeConfirmed] = useState(false);
  const [isOvertimeSubmitting, setIsOvertimeSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const yearOptions = useMemo(() => {
    const currentYear = today.getFullYear();
    const years: { value: string; label: string }[] = [];
    for (let y = currentYear - 3; y <= currentYear + 3; y++) {
      years.push({ value: String(y), label: String(y) });
    }
    return years;
  }, [today]);

  const activeRequestIdRef = React.useRef(0);

  const fetchAttendance = useCallback(async () => {
    const currentRequestId = ++activeRequestIdRef.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await attendanceApi.getHistory({
        month: selectedMonth,
        year: selectedYear,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      });

      if (currentRequestId === activeRequestIdRef.current) {
        setHistory(res.records || []);
        if (res.summary) {
          setSummary(res.summary);
        }
      }
    } catch (err: any) {
      if (currentRequestId === activeRequestIdRef.current) {
        setErrorMessage(err?.message || 'Failed to load attendance records');
        setHistory([]);
        setSummary(null);
      }
    } finally {
      if (currentRequestId === activeRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [selectedMonth, selectedYear, statusFilter]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  const executeCheckOut = async () => {
    try {
      const res = await attendanceApi.checkOut({});
      markAttendanceSuccess(res);
      await refreshTimer();
      setIsTimerCheckoutModalOpen(false);
      fetchAttendance();
    } catch (err: any) {
      alert(err.message || 'Failed to check out');
    }
  };

  const handleCheckOutClick = () => {
    if (activeTimer?.isActive && activeTimer?.taskId) {
      setIsTimerCheckoutModalOpen(true);
    } else {
      executeCheckOut();
    }
  };

  const handleConfirmOvertime = async () => {
    setIsOvertimeSubmitting(true);
    try {
      await attendanceApi.confirmOvertime();
      setIsOvertimeConfirmed(true);
    } catch (err: any) {
      alert(err.message || 'Failed to confirm overtime');
    } finally {
      setIsOvertimeSubmitting(false);
    }
  };

  const handleResetFilters = () => {
    setSelectedMonth(today.getMonth() + 1);
    setSelectedYear(today.getFullYear());
    setStatusFilter('ALL');
  };

  const isFilterCustom =
    selectedMonth !== today.getMonth() + 1 ||
    selectedYear !== today.getFullYear() ||
    statusFilter !== 'ALL';

  const getStatusBadge = (rec: AttendanceRecord) => {
    const st = rec.status;
    if (st === 'PRESENT') {
      return <Badge variant="success">● PRESENT</Badge>;
    }
    if (st === 'LATE') {
      return <Badge variant="warning">● LATE</Badge>;
    }
    if (st === 'HALF_DAY') {
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200">● HALF DAY</Badge>;
    }
    if (st === 'WORKED_ON_HOLIDAY') {
      return <Badge className="bg-emerald-600 text-white border-emerald-700 shadow-sm font-semibold">★ HOLIDAY WORKED (+EL)</Badge>;
    }
    if (st === 'ABSENT') {
      return <Badge variant="danger">● ABSENT</Badge>;
    }
    if (st === 'LEAVE' || st === 'ON_LEAVE') {
      return <Badge className="bg-purple-100 text-purple-800 border-purple-200">● LEAVE</Badge>;
    }
    if (st === 'HOLIDAY') {
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">● HOLIDAY</Badge>;
    }
    if (st === 'OFF' || st === 'WEEKEND') {
      return <Badge variant="secondary">OFF</Badge>;
    }
    if (st === 'UPCOMING') {
      return <Badge variant="outline" className="text-neutral-400">UPCOMING</Badge>;
    }
    return <Badge variant="secondary">{st}</Badge>;
  };

  // Check if currently working 8+ hours today
  const isWorkingLongHours = useMemo(() => {
    if (!todayAttendance?.checkInAt || todayAttendance.checkOutAt) return false;
    const checkInTime = new Date(todayAttendance.checkInAt).getTime();
    const elapsedMinutes = (Date.now() - checkInTime) / (1000 * 60);
    return elapsedMinutes >= 480;
  }, [todayAttendance]);

  return (
    <div className="space-y-6">
      {/* Overtime Prompt Banner if working >= 8h */}
      {isWorkingLongHours && !isOvertimeConfirmed && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-900">Overtime Verification Required</p>
              <p className="text-xs text-amber-700">
                You have reached 8+ hours of work today. Are you intentionally working overtime or did you forget to check out?
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={handleConfirmOvertime}
              disabled={isOvertimeSubmitting}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-8"
            >
              Continue as Overtime
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCheckOutClick}
              className="text-xs h-8 border-amber-300 text-amber-900 hover:bg-amber-100"
            >
              Check Out Now
            </Button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Attendance Log</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Authoritative monthly working calendar, verified check-ins, leaves, and absences.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isAttendanceResolved || isAttendanceLoading ? (
            <div className="h-8 w-32 rounded-md bg-neutral-200/80 animate-pulse" />
          ) : !todayAttendance?.checkInAt ? (
            <Button onClick={() => setIsCheckInOpen(true)} className="gap-1.5 shadow-sm text-xs">
              <Clock className="w-3.5 h-3.5" /> Check In Today
            </Button>
          ) : (
            !todayAttendance.checkOutAt && (
              <Button onClick={handleCheckOutClick} variant="outline" className="gap-1.5 text-xs">
                <LogOut className="w-3.5 h-3.5" /> Check Out
              </Button>
            )
          )}
        </div>
      </div>

      {/* Timer Checkout Modal Confirmation */}
      {isTimerCheckoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900">Task Timer Still Running</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Active timer detected</p>
              </div>
            </div>
            <p className="text-sm text-neutral-600">
              A task timer is currently running. Checking out will automatically stop the active timer and save your worked time to the task history.
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <Button variant="outline" size="sm" onClick={() => setIsTimerCheckoutModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={executeCheckOut} className="bg-neutral-900 text-white">
                Check Out & Stop Timer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <Card className="p-3 bg-white border-neutral-200 shadow-sm text-center">
            <span className="text-[10px] uppercase font-bold text-neutral-400 block">Working Days</span>
            <span className="text-xl font-black text-neutral-900 mt-0.5 block">{summary.workingDays}</span>
            <span className="text-[10px] text-neutral-400">Scheduled</span>
          </Card>

          <Card className="p-3 bg-emerald-50/50 border-emerald-100 shadow-sm text-center">
            <span className="text-[10px] uppercase font-bold text-emerald-700 block">Present</span>
            <span className="text-xl font-black text-emerald-900 mt-0.5 block">{summary.present}</span>
            <span className="text-[10px] text-emerald-600">On Time</span>
          </Card>

          <Card className="p-3 bg-amber-50/50 border-amber-100 shadow-sm text-center">
            <span className="text-[10px] uppercase font-bold text-amber-700 block">Late</span>
            <span className="text-xl font-black text-amber-900 mt-0.5 block">{summary.late}</span>
            <span className="text-[10px] text-amber-600">Grace Exceeded</span>
          </Card>

          <Card className="p-3 bg-blue-50/50 border-blue-100 shadow-sm text-center">
            <span className="text-[10px] uppercase font-bold text-blue-700 block">Half Day</span>
            <span className="text-xl font-black text-blue-900 mt-0.5 block">{summary.halfDay}</span>
            <span className="text-[10px] text-blue-600">Partial Work</span>
          </Card>

          <Card className="p-3 bg-rose-50/50 border-rose-100 shadow-sm text-center">
            <span className="text-[10px] uppercase font-bold text-rose-700 block">Absent</span>
            <span className="text-xl font-black text-rose-900 mt-0.5 block">{summary.absent}</span>
            <span className="text-[10px] text-rose-600">Unapproved</span>
          </Card>

          <Card className="p-3 bg-purple-50/50 border-purple-100 shadow-sm text-center">
            <span className="text-[10px] uppercase font-bold text-purple-700 block">Leave</span>
            <span className="text-xl font-black text-purple-900 mt-0.5 block">{summary.leave}</span>
            <span className="text-[10px] text-purple-600">Approved</span>
          </Card>

          <Card className="p-3 bg-teal-50/50 border-teal-100 shadow-sm text-center">
            <span className="text-[10px] uppercase font-bold text-teal-700 block">Holidays</span>
            <span className="text-xl font-black text-teal-900 mt-0.5 block">{summary.holidays}</span>
            <span className="text-[10px] text-teal-600">Company</span>
          </Card>

          <Card className="p-3 bg-neutral-50 border-neutral-200 shadow-sm text-center">
            <span className="text-[10px] uppercase font-bold text-neutral-500 block">Off Days</span>
            <span className="text-xl font-black text-neutral-700 mt-0.5 block">{summary.offDays}</span>
            <span className="text-[10px] text-neutral-400">Weekends</span>
          </Card>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-lg border border-neutral-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="w-36">
            <Select
              value={String(selectedMonth)}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
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

          <div className="w-40">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={STATUS_FILTER_OPTIONS}
            />
          </div>

          {isFilterCustom && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="h-9 px-2.5 text-xs text-neutral-600 hover:text-neutral-900 gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </Button>
          )}
        </div>

        <div className="text-xs text-neutral-500 font-medium">
          Showing <span className="font-bold text-neutral-900">{history.length}</span> calendar day records
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between gap-3 text-rose-800 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => fetchAttendance()} className="h-7 text-xs bg-white">
            <RotateCcw className="w-3 h-3 mr-1" /> Retry
          </Button>
        </div>
      )}

      {/* Attendance History Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8">
              <LoadingState message="Calculating attendance calendar..." />
            </div>
          ) : errorMessage ? (
            <div className="p-8">
              <EmptyState
                icon={AlertTriangle}
                title="Unable to load attendance"
                description={errorMessage}
                actionLabel="Retry"
                onAction={() => fetchAttendance()}
              />
            </div>
          ) : history.length === 0 ? (

            <div className="p-8">
              <EmptyState
                icon={Calendar}
                title="No attendance records found"
                description="No records found matching your selected filter criteria."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Work Mode</TableHead>
                  <TableHead>Check In</TableHead>
                  <TableHead>Check Out</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Notes / Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((rec) => {
                  const dayName = new Date(rec.attendanceDate + 'T12:00:00Z').toLocaleDateString('en-US', {
                    weekday: 'short',
                  });

                  return (
                    <TableRow
                      key={rec.id}
                      className={
                        rec.status === 'ABSENT'
                          ? 'bg-rose-50/30 hover:bg-rose-50/50'
                          : rec.status === 'LEAVE'
                          ? 'bg-purple-50/20 hover:bg-purple-50/40'
                          : rec.status === 'HOLIDAY'
                          ? 'bg-emerald-50/20 hover:bg-emerald-50/40'
                          : ''
                      }
                    >
                      <TableCell className="font-semibold text-neutral-900 text-xs">
                        {formatDate(rec.attendanceDate)}
                      </TableCell>
                      <TableCell className="text-xs text-neutral-500 font-mono">{dayName}</TableCell>
                      <TableCell>{getStatusBadge(rec)}</TableCell>
                      <TableCell className="text-xs font-medium text-neutral-700">
                        {rec.checkInAt ? rec.workMode : '—'}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {rec.checkInAt ? formatTime(rec.checkInAt) : '—'}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {rec.checkOutAt ? formatTime(rec.checkOutAt) : rec.checkInAt ? 'In Progress' : '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {rec.totalWorkMinutes
                          ? `${Math.floor(rec.totalWorkMinutes / 60)}h ${rec.totalWorkMinutes % 60}m`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-neutral-500">
                        {rec.holidayName ? (
                          <span className="text-emerald-700 font-medium">Holiday: {rec.holidayName}</span>
                        ) : rec.leaveType ? (
                          <span className="text-purple-700 font-medium">
                            Approved {rec.leaveType} {rec.leaveReason ? `(${rec.leaveReason})` : ''}
                          </span>
                        ) : rec.status === 'OFF' ? (
                          <span className="text-neutral-400">Scheduled Off</span>
                        ) : rec.status === 'ABSENT' ? (
                          <span className="text-rose-600 font-medium">No check-in recorded</span>
                        ) : rec.notes ? (
                          rec.notes
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CheckInModal
        isOpen={isCheckInOpen}
        onClose={() => setIsCheckInOpen(false)}
        onSuccess={() => {
          fetchAttendance();
        }}
      />
    </div>
  );
}
