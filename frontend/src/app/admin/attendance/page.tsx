'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { attendanceApi, employeesApi } from '@/lib/api';
import { AttendanceRecord, AttendanceSummary, Employee } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatTime } from '@/lib/utils';
import { Clock, RotateCcw, AlertCircle, Calendar, UserCheck, UserX } from 'lucide-react';

type DateFilterType = 'MONTH' | 'DATE' | 'YEAR' | 'ALL';

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
  { value: 'ABSENT', label: 'Absent' },
  { value: 'LEAVE', label: 'Leave' },
  { value: 'HOLIDAY', label: 'Holiday' },
  { value: 'OFF', label: 'Off / Weekend' },
];

export default function AdminAttendancePage() {
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmp, setSelectedEmp] = useState('');
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>('MONTH');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Authoritative date defaults
  const today = useMemo(() => new Date(), []);
  const todayDateStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(today);
  }, [today]);

  const [selectedDate, setSelectedDate] = useState(todayDateStr);
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dynamic Year Options
  const yearOptions = useMemo(() => {
    const currentYear = today.getFullYear();
    const years: { value: string; label: string }[] = [];
    for (let y = currentYear - 3; y <= currentYear + 3; y++) {
      years.push({ value: String(y), label: String(y) });
    }
    return years;
  }, [today]);

  // Load employee list on mount
  useEffect(() => {
    let isMounted = true;
    employeesApi
      .list()
      .then((emps) => {
        if (isMounted && emps) {
          setEmployees(emps);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const activeRequestIdRef = React.useRef(0);

  const loadAttendance = useCallback(async () => {
    const currentRequestId = ++activeRequestIdRef.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params: {
        adminView?: boolean;
        employeeId?: string;
        date?: string;
        month?: number;
        year?: number;
        status?: string;
      } = {
        adminView: true,
      };

      if (selectedEmp) {
        params.employeeId = selectedEmp;
      }

      if (dateFilterType === 'DATE') {
        if (selectedDate) params.date = selectedDate;
      } else if (dateFilterType === 'MONTH') {
        params.month = selectedMonth;
        params.year = selectedYear;
      } else if (dateFilterType === 'YEAR') {
        params.year = selectedYear;
      }

      if (statusFilter !== 'ALL') {
        params.status = statusFilter;
      }

      const res = await attendanceApi.getHistory(params);
      if (currentRequestId === activeRequestIdRef.current) {
        setAttendances(res.records || []);
        setSummary(res.summary || null);
      }
    } catch (err: any) {
      if (currentRequestId === activeRequestIdRef.current) {
        setErrorMessage(err.message || 'Failed to load attendance records');
        setAttendances([]);
        setSummary(null);
      }
    } finally {
      if (currentRequestId === activeRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [selectedEmp, dateFilterType, selectedDate, selectedMonth, selectedYear, statusFilter]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);


  const isFilterActive =
    selectedEmp !== '' ||
    dateFilterType !== 'MONTH' ||
    selectedMonth !== today.getMonth() + 1 ||
    selectedYear !== today.getFullYear() ||
    statusFilter !== 'ALL';

  const handleClearFilters = () => {
    setSelectedEmp('');
    setDateFilterType('MONTH');
    setSelectedDate(todayDateStr);
    setSelectedMonth(today.getMonth() + 1);
    setSelectedYear(today.getFullYear());
    setStatusFilter('ALL');
  };

  const getStatusBadge = (rec: AttendanceRecord) => {
    const st = rec.status;
    if (st === 'PRESENT') return <Badge variant="success">● PRESENT</Badge>;
    if (st === 'LATE') return <Badge variant="warning">● LATE</Badge>;
    if (st === 'HALF_DAY') return <Badge className="bg-blue-100 text-blue-800 border-blue-200">● HALF DAY</Badge>;
    if (st === 'ABSENT') return <Badge variant="danger">● ABSENT</Badge>;
    if (st === 'LEAVE' || st === 'ON_LEAVE') return <Badge className="bg-purple-100 text-purple-800 border-purple-200">● LEAVE</Badge>;
    if (st === 'HOLIDAY') return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">● HOLIDAY</Badge>;
    if (st === 'OFF' || st === 'WEEKEND') return <Badge variant="secondary">OFF</Badge>;
    if (st === 'UPCOMING') return <Badge variant="outline" className="text-neutral-400">UPCOMING</Badge>;
    return <Badge variant="secondary">{st}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Organization Attendance Sheet</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Complete working calendar audit with derived absences, approved leaves, holidays, and verified check-ins.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Employee Filter */}
          <div className="w-full sm:w-48">
            <Select
              value={selectedEmp}
              onChange={(e) => setSelectedEmp(e.target.value)}
              options={[
                { value: '', label: 'All Employees' },
                ...employees.map((e) => ({ value: e.id, label: e.displayName })),
              ]}
            />
          </div>

          {/* Date Mode Filter */}
          <div className="w-full sm:w-36">
            <Select
              value={dateFilterType}
              onChange={(e) => setDateFilterType(e.target.value as DateFilterType)}
              options={[
                { value: 'MONTH', label: 'Month' },
                { value: 'DATE', label: 'Specific Date' },
                { value: 'YEAR', label: 'Year' },
                { value: 'ALL', label: 'All Dates' },
              ]}
            />
          </div>

          {/* Specific Date Picker */}
          {dateFilterType === 'DATE' && (
            <div className="w-full sm:w-36">
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          )}

          {/* Month Selector */}
          {dateFilterType === 'MONTH' && (
            <>
              <div className="w-full sm:w-32">
                <Select
                  value={String(selectedMonth)}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                  options={MONTH_OPTIONS}
                />
              </div>
              <div className="w-full sm:w-24">
                <Select
                  value={String(selectedYear)}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                  options={yearOptions}
                />
              </div>
            </>
          )}

          {/* Year Selector */}
          {dateFilterType === 'YEAR' && (
            <div className="w-full sm:w-28">
              <Select
                value={String(selectedYear)}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                options={yearOptions}
              />
            </div>
          )}

          {/* Status Filter */}
          <div className="w-full sm:w-36">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={STATUS_FILTER_OPTIONS}
            />
          </div>

          {/* Clear Filters Button */}
          {isFilterActive && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearFilters}
              className="h-9 px-2.5 text-xs text-neutral-600 hover:text-neutral-900 gap-1.5 shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </Button>
          )}
        </div>
      </div>

      {/* Reconciled Summary Cards */}
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

      {/* Attendance Sheet Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading && attendances.length === 0 ? (
            <div className="space-y-3 p-5 animate-pulse">
              <div className="h-8 bg-neutral-100 rounded w-full"></div>
              <div className="h-8 bg-neutral-100 rounded w-full"></div>
              <div className="h-8 bg-neutral-100 rounded w-full"></div>
            </div>
          ) : errorMessage ? (
            <div className="p-8 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
              <div>
                <h4 className="text-sm font-bold text-neutral-900">Failed to load records</h4>
                <p className="text-xs text-neutral-500 mt-0.5">{errorMessage}</p>
              </div>
              <Button size="sm" variant="outline" onClick={loadAttendance}>
                Try Again
              </Button>
            </div>
          ) : attendances.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={Clock}
                title="No attendance records found"
                description="No attendance logs recorded for the selected filter."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Work Mode</TableHead>
                  <TableHead>Check In</TableHead>
                  <TableHead>Check Out</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Details / Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendances.map((rec) => {
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
                      <TableCell>
                        <div className="font-semibold text-neutral-900 text-xs">
                          {rec.employee?.displayName || (rec as any).employee?.first_name || 'Staff Member'}
                        </div>
                        <div className="text-[10px] text-neutral-400 font-mono">
                          {rec.employee?.employeeCode || (rec as any).employee?.employee_code || ''}
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold text-xs">{formatDate(rec.attendanceDate)}</TableCell>
                      <TableCell className="text-xs text-neutral-500 font-mono">{dayName}</TableCell>
                      <TableCell>{getStatusBadge(rec)}</TableCell>
                      <TableCell className="font-medium text-xs">
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
                          <span className="text-rose-600 font-medium">Absent (No check-in)</span>
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
    </div>
  );
}
