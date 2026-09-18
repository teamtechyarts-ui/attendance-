'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { attendanceApi } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useTaskTimer } from '@/hooks/use-task-timer';
import { AttendanceRecord } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { LoadingState } from '@/components/ui/loading-state';
import { CheckInModal } from '@/components/attendance/check-in-modal';
import { formatDate, formatTime } from '@/lib/utils';
import { Clock, CheckCircle2, LogOut, Calendar, Building2, Home, Globe } from 'lucide-react';

export default function AttendancePage() {
  const { user, todayAttendance, markAttendanceSuccess } = useAuth();
  const { refreshTimer } = useTaskTimer();
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAttendance = useCallback(async () => {
    try {
      const records = await attendanceApi.getHistory();
      setHistory(records || []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  const handleCheckOut = async () => {
    try {
      const res = await attendanceApi.checkOut({});
      markAttendanceSuccess(res);
      await refreshTimer();
      fetchAttendance();
    } catch (err: any) {
      alert(err.message || 'Failed to check out');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Attendance Log</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Track your daily work check-ins, work modes, and attendance history.</p>
        </div>
        <div className="flex items-center gap-2">
          {!todayAttendance?.checkInAt ? (
            <Button onClick={() => setIsCheckInOpen(true)} className="gap-1.5 shadow-sm text-xs">
              <Clock className="w-3.5 h-3.5" /> Check In Today
            </Button>
          ) : (
            !todayAttendance.checkOutAt && (
              <Button onClick={handleCheckOut} variant="outline" className="gap-1.5 text-xs">
                <LogOut className="w-3.5 h-3.5" /> Check Out
              </Button>
            )
          )}
        </div>
      </div>

      {/* Today's Status Banner */}
      <Card className="border-neutral-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Today&apos;s Status</CardTitle>
          <CardDescription>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</CardDescription>
        </CardHeader>
        <CardContent>
          {todayAttendance?.checkInAt ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-lg bg-neutral-50 border border-neutral-200">
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">Status</span>
                <Badge variant="success" className="mt-1">
                  ● {todayAttendance.status}
                </Badge>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">Work Mode</span>
                <span className="text-sm font-bold text-neutral-900 mt-1 block">
                  {todayAttendance.workMode}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">Check In Time</span>
                <span className="text-sm font-bold text-neutral-900 mt-1 block">
                  {formatTime(todayAttendance.checkInAt)}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">Check Out Time</span>
                <span className="text-sm font-bold text-neutral-900 mt-1 block">
                  {todayAttendance.checkOutAt ? formatTime(todayAttendance.checkOutAt) : 'In Progress'}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-lg border border-dashed border-neutral-200 text-center space-y-3">
              <Clock className="w-8 h-8 text-neutral-400 mx-auto" />
              <div>
                <h4 className="text-sm font-bold text-neutral-900">Attendance not marked for today</h4>
                <p className="text-xs text-neutral-500 max-w-sm mx-auto mt-0.5">
                  Click check-in to start your work session and record your attendance.
                </p>
              </div>
              <Button onClick={() => setIsCheckInOpen(true)} size="sm">
                Check In Now
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attendance History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Monthly Attendance History</CardTitle>
          <CardDescription>Your verified check-in records for the current period</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState message="Loading attendance history..." />
          ) : history.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500">No attendance records found.</div>
          ) : (
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
                {history.map((rec) => (
                  <TableRow key={rec.id}>
                    <TableCell className="font-semibold">{formatDate(rec.attendanceDate)}</TableCell>
                    <TableCell>
                      <Badge variant={rec.status === 'PRESENT' ? 'success' : rec.status === 'LATE' ? 'warning' : 'secondary'}>
                        {rec.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{rec.workMode}</TableCell>
                    <TableCell>{formatTime(rec.checkInAt)}</TableCell>
                    <TableCell>{rec.checkOutAt ? formatTime(rec.checkOutAt) : '—'}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {rec.totalWorkMinutes ? `${Math.floor(rec.totalWorkMinutes / 60)}h ${rec.totalWorkMinutes % 60}m` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
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
