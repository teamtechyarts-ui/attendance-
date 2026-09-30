'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { hasPermission } from '@/lib/permissions';
import { leaveApi } from '@/lib/api';
import { LeaveRequest } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/utils';
import { Calendar, Check, X, ShieldAlert } from 'lucide-react';

export default function LimitedAdminLeavePage() {
  const { user } = useAuth();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const canManageLeave = useMemo(
    () => hasPermission(user, ['LEAVE_MANAGE', 'LEAVE_APPROVE', 'MANAGE_LEAVE']),
    [user]
  );

  const loadData = useCallback(async () => {
    try {
      const res: any = await leaveApi.listRequests({ adminView: true });
      const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
      setLeaves(items);
    } catch (err) {
      console.error('Failed to load leaves:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdateStatus = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    setActionInProgress(id);
    try {
      await leaveApi.review(id, { status, reviewComment: status === 'REJECTED' ? 'Rejected by Limited Admin' : undefined });
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update leave request status');
    } finally {
      setActionInProgress(null);
    }
  };

  if (!canManageLeave) {
    return (
      <div className="p-8 border border-neutral-200 rounded-lg bg-white text-center">
        <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto mb-2" />
        <h2 className="text-base font-bold text-neutral-900">Access Restricted</h2>
        <p className="text-xs text-neutral-500 mt-1">
          You do not have permission to review or approve leave requests (LEAVE_MANAGE required).
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading leave requests..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">Leave Approvals</h1>
            <Badge variant="outline" className="text-[10px] bg-neutral-50 text-neutral-600">
              Limited Admin
            </Badge>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Review and action employee leave applications within your scope.
          </p>
        </div>
      </div>

      <Card className="border-neutral-200">
        <CardContent className="p-0">
          {leaves.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No Leave Requests"
                description="There are no pending or historical leave requests in your scope."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-neutral-100 bg-neutral-50 text-[11px]">
                    <TableHead className="py-2.5 font-bold text-neutral-700">Employee</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Type</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Dates</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Reason</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Status</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaves.map((l: any) => (
                    <TableRow key={l.id} className="border-b border-neutral-100 hover:bg-neutral-50/70 text-xs">
                      <TableCell className="py-2.5 font-semibold text-neutral-900">
                        {l.employee?.displayName || l.employee?.firstName || 'Employee'}
                      </TableCell>
                      <TableCell className="py-2.5 text-neutral-600">
                        {typeof l.leaveType === 'object' && l.leaveType ? l.leaveType.name : String(l.leaveType || 'LEAVE')}
                      </TableCell>
                      <TableCell className="py-2.5 text-neutral-700 font-mono text-[11px]">
                        {formatDate(l.startDate)} - {formatDate(l.endDate)}
                      </TableCell>
                      <TableCell className="py-2.5 text-neutral-500 max-w-[200px] truncate">
                        {l.reason || '—'}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Badge
                          variant={l.status === 'APPROVED' ? 'success' : l.status === 'REJECTED' ? 'danger' : 'warning'}
                          className="text-[9px]"
                        >
                          {l.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        {l.status === 'PENDING' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              disabled={actionInProgress === l.id}
                              onClick={() => handleUpdateStatus(l.id, 'APPROVED')}
                              className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white gap-1 px-2"
                            >
                              <Check className="w-3 h-3" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actionInProgress === l.id}
                              onClick={() => handleUpdateStatus(l.id, 'REJECTED')}
                              className="h-7 text-[11px] text-rose-600 border-rose-200 hover:bg-rose-50 gap-1 px-2"
                            >
                              <X className="w-3 h-3" />
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-neutral-400">Actioned</span>
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
    </div>
  );
}
