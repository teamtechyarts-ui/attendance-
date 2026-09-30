'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { hasPermission } from '@/lib/permissions';
import { attendanceApi } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatTime } from '@/lib/utils';
import { Clock, CheckCircle, RefreshCw, ShieldAlert } from 'lucide-react';

export default function LimitedAdminAttendancePage() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const canManageAttendance = useMemo(
    () => hasPermission(user, ['ATTENDANCE_MANAGE', 'ATTENDANCE_EDIT', 'MANAGE_ATTENDANCE']),
    [user]
  );

  const loadData = useCallback(async () => {
    try {
      const res = await attendanceApi.getLiveOverview();
      setActivities(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('Failed to load attendance:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!canManageAttendance) {
    return (
      <div className="p-8 border border-neutral-200 rounded-lg bg-white text-center">
        <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto mb-2" />
        <h2 className="text-base font-bold text-neutral-900">Access Restricted</h2>
        <p className="text-xs text-neutral-500 mt-1">
          You do not have permission to manage team attendance records (ATTENDANCE_MANAGE required).
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading attendance records..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">Attendance Administration</h1>
            <Badge variant="outline" className="text-[10px] bg-neutral-50 text-neutral-600">
              Limited Admin
            </Badge>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Real-time presence and attendance tracking for your assigned scope.
          </p>
        </div>

        <Button
          onClick={() => {
            setIsRefreshing(true);
            loadData();
          }}
          size="sm"
          variant="outline"
          disabled={isRefreshing}
          className="text-xs gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card className="border-neutral-200">
        <CardContent className="p-0">
          {activities.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No Attendance Records"
                description="No employee attendance records found for today within your scope."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-neutral-100 bg-neutral-50 text-[11px]">
                    <TableHead className="py-2.5 font-bold text-neutral-700">Employee</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Work Mode</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Check In</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Check Out</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700 text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activities.map((act) => (
                    <TableRow key={act.employeeId || act.id} className="border-b border-neutral-100 hover:bg-neutral-50/70 text-xs">
                      <TableCell className="py-2.5 font-semibold text-neutral-900">
                        {act.employeeName || act.displayName || 'Employee'}
                      </TableCell>
                      <TableCell className="py-2.5 text-neutral-600">
                        {act.workMode || 'OFFICE'}
                      </TableCell>
                      <TableCell className="py-2.5 font-mono text-neutral-700">
                        {act.checkInTime ? formatTime(act.checkInTime) : '—'}
                      </TableCell>
                      <TableCell className="py-2.5 font-mono text-neutral-700">
                        {act.checkOutTime ? formatTime(act.checkOutTime) : '—'}
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        <Badge
                          variant={act.status === 'WORKING' ? 'success' : 'secondary'}
                          className="text-[9px]"
                        >
                          {act.status || 'PRESENT'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
