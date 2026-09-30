'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { hasPermission } from '@/lib/permissions';
import { reportsApi } from '@/lib/api';
import { DailyWorkReport } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/utils';
import { FileText, Check, ShieldAlert } from 'lucide-react';

export default function LimitedAdminReportsPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<DailyWorkReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const canReviewReports = useMemo(
    () => hasPermission(user, ['REPORTS_VIEW', 'REPORTS_APPROVE', 'VIEW_REPORTS', 'REPORT_VIEW']),
    [user]
  );

  const loadData = useCallback(async () => {
    try {
      const res: any = await reportsApi.list({ limit: 50, adminView: true });
      const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
      setReports(items);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!canReviewReports) {
    return (
      <div className="p-8 border border-neutral-200 rounded-lg bg-white text-center">
        <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto mb-2" />
        <h2 className="text-base font-bold text-neutral-900">Access Restricted</h2>
        <p className="text-xs text-neutral-500 mt-1">
          You do not have permission to view administrative reports (REPORTS_VIEW required).
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading daily reports..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">Reports Administration</h1>
            <Badge variant="outline" className="text-[10px] bg-neutral-50 text-neutral-600">
              Limited Admin
            </Badge>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Review daily work logs and submitted reports from team members in your scope.
          </p>
        </div>
      </div>

      <Card className="border-neutral-200">
        <CardContent className="p-0">
          {reports.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No Reports Found"
                description="No daily work reports submitted within your scope."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-neutral-100 bg-neutral-50 text-[11px]">
                    <TableHead className="py-2.5 font-bold text-neutral-700">Date</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Employee</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Work Completed</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700">Blockers</TableHead>
                    <TableHead className="py-2.5 font-bold text-neutral-700 text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((r) => (
                    <TableRow key={r.id} className="border-b border-neutral-100 hover:bg-neutral-50/70 text-xs">
                      <TableCell className="py-2.5 font-mono text-[11px] text-neutral-700">
                        {formatDate(r.reportDate)}
                      </TableCell>
                      <TableCell className="py-2.5 font-semibold text-neutral-900">
                        {r.employee?.displayName || r.employee?.firstName || 'Employee'}
                      </TableCell>
                      <TableCell className="py-2.5 text-neutral-700 max-w-[250px] truncate">
                        {r.description || '—'}
                      </TableCell>
                      <TableCell className="py-2.5 text-neutral-500 max-w-[150px] truncate">
                        {r.blockers || 'None'}
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        <Badge
                          variant={r.status === 'REVIEWED' ? 'success' : r.status === 'SUBMITTED' ? 'info' : 'secondary'}
                          className="text-[9px]"
                        >
                          {r.status}
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
