'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useTaskTimer } from '@/hooks/use-task-timer';
import { attendanceApi, tasksApi, leaveApi, reportsApi } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { CheckInModal } from '@/components/attendance/check-in-modal';
import { formatSecondsToTime, formatDate, formatTime } from '@/lib/utils';
import {
  Briefcase,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  LogOut,
  Pause,
  Play,
  Plus,
  Square,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';

export default function EmployeeDashboard() {
  const { user, session, accessMode, todayAttendance, markAttendanceSuccess } = useAuth();
  const { activeTimer, elapsedSeconds, startTimer, pauseTimer, stopTimer, refreshTimer } = useTaskTimer();

  const [todayData, setTodayData] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<any[]>([]);
  const [todayReport, setTodayReport] = useState<any>(null);
  const [reportText, setReportText] = useState('');
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const isRestricted = accessMode === 'RESTRICTED' || session?.attendanceRequired;

  const loadData = useCallback(async () => {
    try {
      const [todayAtt, taskList, balances, report] = await Promise.all([
        attendanceApi.getToday().catch(() => null),
        tasksApi.list().catch(() => []),
        leaveApi.getBalances().catch(() => []),
        reportsApi.getToday().catch(() => null),
      ]);

      setTodayData(todayAtt);
      setTasks(taskList || []);
      setLeaveBalances(balances || []);
      setTodayReport(report);
      if (report?.description) setReportText(report.description);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCheckOut = async () => {
    try {
      const res = await attendanceApi.checkOut({});
      markAttendanceSuccess(res);
      await refreshTimer();
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to check out');
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportText.trim()) return;
    setIsSubmittingReport(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const res = await reportsApi.submit({
        reportDate: todayStr,
        description: reportText,
      });
      setTodayReport(res);
    } catch (err: any) {
      alert(err.message || 'Failed to submit report');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Loading your workspace..." />;
  }

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Top Greeting & Date Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">
            Welcome back, {user?.firstName || user?.displayName}
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">{currentDate}</p>
        </div>
        <div className="flex items-center gap-2">
          {todayAttendance?.checkInAt ? (
            <div className="flex items-center gap-2">
              <Badge variant="success" className="px-3 py-1 text-xs">
                ● {todayAttendance.workMode} · {formatTime(todayAttendance.checkInAt)}
              </Badge>
              {!todayAttendance.checkOutAt && (
                <Button onClick={handleCheckOut} variant="outline" size="sm" className="gap-1 text-xs">
                  <LogOut className="w-3.5 h-3.5" /> Check Out
                </Button>
              )}
            </div>
          ) : (
            <Button onClick={() => setIsCheckInOpen(true)} className="gap-1.5 shadow-sm text-xs">
              <Clock className="w-3.5 h-3.5" /> Mark Today&apos;s Attendance
            </Button>
          )}
        </div>
      </div>

      {/* Main Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Work Session & Active Task (Span 2) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Task & Timer Card */}
          <Card className="border-neutral-900 bg-black text-white shadow-md">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold tracking-wider uppercase text-neutral-400">
                  Current Work Focus
                </span>
                {activeTimer && activeTimer.isActive && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-neutral-800 text-emerald-400 text-xs font-mono">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    RECORDING
                  </span>
                )}
              </div>
              <CardTitle className="text-lg text-white font-bold mt-1">
                {activeTimer?.task?.title || tasks.find((t) => t.status === 'IN_PROGRESS')?.title || 'No active task selected'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-neutral-900 border border-neutral-800">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold block">
                    Session Duration
                  </span>
                  <span className="text-3xl sm:text-4xl font-mono font-black text-white tracking-widest">
                    {formatSecondsToTime(elapsedSeconds)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {activeTimer && activeTimer.isActive ? (
                    <>
                      <Button
                        onClick={() => pauseTimer(activeTimer.taskId)}
                        variant="secondary"
                        size="sm"
                        className="bg-neutral-800 text-white hover:bg-neutral-700 border-0 gap-1.5"
                      >
                        <Pause className="w-4 h-4" /> Pause
                      </Button>
                      <Button
                        onClick={() => stopTimer(activeTimer.taskId)}
                        size="sm"
                        className="bg-white text-black hover:bg-neutral-200 gap-1.5 font-bold"
                      >
                        <Square className="w-4 h-4" /> Complete
                      </Button>
                    </>
                  ) : (
                    <>
                      {tasks.length > 0 && (
                        <Button
                          onClick={() => startTimer(tasks[0].id)}
                          size="sm"
                          className="bg-white text-black hover:bg-neutral-200 gap-1.5 font-bold"
                        >
                          <Play className="w-4 h-4" /> Start Timer
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Today's Tasks Section */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle>My Tasks</CardTitle>
                <CardDescription>Tasks scheduled and assigned for you</CardDescription>
              </div>
              <Link href="/tasks">
                <Button variant="outline" size="sm" className="text-xs gap-1">
                  View All <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <EmptyState
                  icon={Briefcase}
                  title="No tasks assigned yet"
                  description="You can create self-tasks or ask your manager to assign items."
                />
              ) : (
                <div className="divide-y divide-neutral-100">
                  {tasks.slice(0, 5).map((task) => {
                    const isRunning = Boolean(activeTimer?.taskId === task.id && activeTimer?.isActive);
                    return (
                      <div key={task.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-neutral-900 truncate">
                              {task.title}
                            </span>
                            <Badge
                              variant={
                                task.priority === 'URGENT'
                                  ? 'danger'
                                  : task.priority === 'HIGH'
                                  ? 'warning'
                                  : 'secondary'
                              }
                              className="text-[10px]"
                            >
                              {task.priority}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-neutral-500 truncate">
                            {task.description || 'No description provided'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isRunning ? (
                            <Button
                              onClick={() => pauseTimer(task.id)}
                              size="sm"
                              variant="secondary"
                              className="h-8 text-xs gap-1"
                            >
                              <Pause className="w-3 h-3" /> Pause
                            </Button>
                          ) : (
                            <Button
                              onClick={() => startTimer(task.id)}
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs gap-1"
                            >
                              <Play className="w-3 h-3" /> Start
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Daily Report & Leave Summary */}
        <div className="space-y-6">
          {/* Concise Daily Work Report Widget */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Daily Work Report</CardTitle>
                {todayReport && (
                  <Badge variant="success" className="text-[10px]">
                    {todayReport.status}
                  </Badge>
                )}
              </div>
              <CardDescription>
                Brief summary of what you achieved today and any blockers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleReportSubmit} className="space-y-3">
                <textarea
                  className="w-full min-h-[90px] rounded-md border border-neutral-300 bg-white p-3 text-xs focus:ring-1 focus:ring-black focus:outline-none"
                  placeholder="e.g. Completed webhook integration and fixed authentication issue."
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                />
                <Button
                  type="submit"
                  size="sm"
                  isLoading={isSubmittingReport}
                  className="w-full text-xs font-semibold"
                >
                  <FileText className="w-3.5 h-3.5 mr-1" />
                  {todayReport ? 'Update Report' : 'Submit Today’s Report'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Leave Balances Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">Leave Balances</CardTitle>
              <Link href="/leave" className="text-xs font-semibold text-neutral-600 hover:text-black">
                Request Leave →
              </Link>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {leaveBalances.map((lb) => {
                  const available = Number(lb.allocatedDays) - Number(lb.usedDays) - Number(lb.pendingDays);
                  return (
                    <div key={lb.id} className="p-3 rounded-lg border border-neutral-200 bg-neutral-50/60 text-center">
                      <span className="text-[10px] font-bold uppercase text-neutral-500 block truncate">
                        {lb.leaveType?.name || 'Leave'}
                      </span>
                      <span className="text-xl font-extrabold text-neutral-900 block mt-1">
                        {available}
                      </span>
                      <span className="text-[10px] text-neutral-400">Available</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <CheckInModal
        isOpen={isCheckInOpen}
        onClose={() => setIsCheckInOpen(false)}
        onSuccess={loadData}
      />
    </div>
  );
}
