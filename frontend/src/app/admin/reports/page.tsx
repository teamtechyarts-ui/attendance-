'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { reportsApi, employeesApi } from '@/lib/api';
import { DailyWorkReport, Employee } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/utils';
import { FileText, Check, Search } from 'lucide-react';

export default function AdminReportsPage() {
  const [reports, setReports] = useState<DailyWorkReport[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmp, setSelectedEmp] = useState('');
  const [reportDate, setReportDate] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadReports = useCallback(async () => {
    try {
      const [list, emps] = await Promise.all([
        reportsApi.list({
          employeeId: selectedEmp || undefined,
          reportDate: reportDate || undefined,
        }),
        employeesApi.list(),
      ]);
      setReports(list || []);
      setEmployees(emps || []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [selectedEmp, reportDate]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleReview = async (id: string) => {
    try {
      await reportsApi.review(id);
      loadReports();
    } catch (err: any) {
      alert(err.message || 'Failed to review report');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Daily Work Reports Compliance</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Track end-of-day submissions, blockers, and sign off on completed items.</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="w-full sm:w-64">
          <Input
            type="date"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
            className="h-9 text-xs"
          />
        </div>
        <div className="w-full sm:w-64">
          <Select
            value={selectedEmp}
            onChange={(e) => setSelectedEmp(e.target.value)}
            options={[
              { value: '', label: 'All Employees' },
              ...employees.map((e) => ({ value: e.id, label: e.displayName })),
            ]}
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingState message="Loading reports..." />
          ) : reports.length === 0 ? (
            <div className="p-8">
              <EmptyState icon={FileText} title="No reports found" description="No daily reports submitted for the chosen criteria." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Work Summary</TableHead>
                  <TableHead>Blockers</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((rep) => (
                  <TableRow key={rep.id}>
                    <TableCell>
                      <span className="font-bold text-xs text-neutral-900 block">{rep.employee?.displayName || 'Staff'}</span>
                      <span className="text-[10px] text-neutral-400 font-mono">{rep.employee?.employeeCode}</span>
                    </TableCell>
                    <TableCell className="font-semibold text-xs whitespace-nowrap">{formatDate(rep.reportDate)}</TableCell>
                    <TableCell className="text-xs text-neutral-800 font-medium max-w-md">{rep.description}</TableCell>
                    <TableCell className="text-xs text-neutral-500">{rep.blockers || 'None'}</TableCell>
                    <TableCell>
                      <Badge variant={rep.status === 'REVIEWED' ? 'success' : 'warning'}>
                        {rep.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {rep.status !== 'REVIEWED' && (
                        <Button
                          onClick={() => handleReview(rep.id)}
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                        >
                          <Check className="w-3 h-3" /> Mark Reviewed
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
