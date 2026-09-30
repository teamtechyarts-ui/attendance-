'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { reportsApi } from '@/lib/api';
import { DailyWorkReport } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/utils';
import { FileText, Send, CheckCircle2 } from 'lucide-react';

export default function ReportsPage() {
  const [reports, setReports] = useState<DailyWorkReport[]>([]);
  const [todayReport, setTodayReport] = useState<DailyWorkReport | null>(null);
  const [description, setDescription] = useState('');
  const [blockers, setBlockers] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadReports = useCallback(async () => {
    try {
      const [list, today] = await Promise.all([
        reportsApi.list(),
        reportsApi.getToday(),
      ]);
      setReports(list || []);
      setTodayReport(today);
      if (today) {
        setDescription(today.description);
        if (today.blockers) setBlockers(today.blockers);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    setIsSubmitting(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      await reportsApi.submit({
        reportDate: todayStr,
        description,
        blockers: blockers || null,
      });
      loadReports();
    } catch (err: any) {
      alert(err.message || 'Failed to submit report');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Daily Work Reports</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Submit concise end-of-day summaries of achievements and blockers.</p>
        </div>
      </div>

      {/* Submit Form Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {todayReport ? 'Today’s Work Report' : 'Submit Today’s Work Report'}
            </CardTitle>
            {todayReport && (
              <Badge variant={todayReport.status === 'REVIEWED' ? 'success' : 'warning'}>
                {todayReport.status}
              </Badge>
            )}
          </div>
          <CardDescription>
            Keep your update brief and focused on key milestones (e.g., &quot;Completed API routes & verified tests&quot;).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Textarea
              label="Work Summary *"
              placeholder="What did you work on today?"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <Textarea
              label="Blockers / Dependencies (Optional)"
              placeholder="Any impediments or items needing review?"
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
            />

            <div className="flex justify-end">
              <Button type="submit" isLoading={isSubmitting} className="gap-2 text-xs">
                <Send className="w-3.5 h-3.5" />
                {todayReport ? 'Update Report' : 'Submit Work Report'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Reports History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Previous Work Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && reports.length === 0 ? (
            <div className="space-y-3 p-4 animate-pulse">
              <div className="h-8 bg-neutral-100 rounded w-full"></div>
              <div className="h-8 bg-neutral-100 rounded w-full"></div>
              <div className="h-8 bg-neutral-100 rounded w-full"></div>
            </div>
          ) : reports.length === 0 ? (
            <EmptyState icon={FileText} title="No reports yet" description="Your daily work reports will be listed here." />
          ) : (
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
                {reports.map((rep) => (
                  <TableRow key={rep.id}>
                    <TableCell className="font-semibold text-xs whitespace-nowrap">{formatDate(rep.reportDate)}</TableCell>
                    <TableCell className="text-xs text-neutral-800 font-medium max-w-md">{rep.description}</TableCell>
                    <TableCell className="text-xs text-neutral-500">{rep.blockers || 'None'}</TableCell>
                    <TableCell>
                      <Badge variant={rep.status === 'REVIEWED' ? 'success' : 'secondary'}>
                        {rep.status}
                      </Badge>
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
