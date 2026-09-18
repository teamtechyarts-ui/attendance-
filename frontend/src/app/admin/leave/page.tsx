'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { leaveApi } from '@/lib/api';
import { LeaveRequest } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/utils';
import { Calendar, Check, X, MessageSquare } from 'lucide-react';

export default function AdminLeavePage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [filter, setFilter] = useState<string>('PENDING');
  const [isLoading, setIsLoading] = useState(true);

  // Review modal state
  const [selectedReq, setSelectedReq] = useState<LeaveRequest | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      const list = await leaveApi.listRequests({
        status: filter === 'ALL' ? undefined : (filter as any),
      });
      setRequests(list || []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleDecision = async (status: 'APPROVED' | 'REJECTED') => {
    if (!selectedReq) return;
    setIsReviewing(true);
    try {
      await leaveApi.review(selectedReq.id, {
        status,
        reviewComment: reviewComment || undefined,
      });
      setSelectedReq(null);
      setReviewComment('');
      fetchRequests();
    } catch (err: any) {
      alert(err.message || 'Failed to review request');
    } finally {
      setIsReviewing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Leave Approvals</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Review staff time off applications and deduct leave balances atomically.</p>
        </div>

        <div className="flex items-center gap-1.5 bg-neutral-100 p-1 rounded-lg">
          {['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                filter === f ? 'bg-white text-black shadow-sm' : 'text-neutral-600 hover:text-black'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingState message="Loading requests..." />
          ) : requests.length === 0 ? (
            <div className="p-8">
              <EmptyState icon={Calendar} title="No leave requests" description="No requests matching current filter." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Leave Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell>
                      <span className="font-bold text-xs text-neutral-900 block">{req.employee?.displayName || 'Staff'}</span>
                      <span className="text-[10px] text-neutral-400 font-mono">{req.employee?.employeeCode}</span>
                    </TableCell>
                    <TableCell className="text-xs font-semibold">{req.leaveType?.name}</TableCell>
                    <TableCell className="text-xs font-mono">
                      {formatDate(req.startDate)} – {formatDate(req.endDate)}
                    </TableCell>
                    <TableCell className="font-bold text-xs">{req.totalDays}</TableCell>
                    <TableCell className="text-xs max-w-xs truncate">{req.reason}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          req.status === 'APPROVED'
                            ? 'success'
                            : req.status === 'REJECTED'
                            ? 'danger'
                            : req.status === 'PENDING'
                            ? 'warning'
                            : 'secondary'
                        }
                      >
                        {req.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {req.status === 'PENDING' ? (
                        <Button
                          onClick={() => setSelectedReq(req)}
                          size="sm"
                          className="h-7 text-xs gap-1"
                        >
                          Review Request
                        </Button>
                      ) : (
                        <span className="text-[11px] text-neutral-400">{req.reviewComment || 'Reviewed'}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Review Modal */}
      <Dialog
        isOpen={Boolean(selectedReq)}
        onClose={() => setSelectedReq(null)}
        title="Review Leave Application"
        description={`Applicant: ${selectedReq?.employee?.displayName} (${selectedReq?.totalDays} days of ${selectedReq?.leaveType?.name})`}
      >
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 space-y-2 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Requested Period</span>
              <span className="font-semibold text-neutral-800">
                {selectedReq && formatDate(selectedReq.startDate)} – {selectedReq && formatDate(selectedReq.endDate)}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Reason</span>
              <p className="text-neutral-700">{selectedReq?.reason}</p>
            </div>
          </div>

          <Textarea
            label="Reviewer Comments / Notes (Optional)"
            placeholder="Add comments explaining approval or reason for rejection..."
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDecision('REJECTED')}
              isLoading={isReviewing}
              className="text-rose-600 border-rose-200 hover:bg-rose-50"
            >
              <X className="w-4 h-4 mr-1" /> Reject Request
            </Button>
            <Button
              type="button"
              onClick={() => handleDecision('APPROVED')}
              isLoading={isReviewing}
              className="bg-black hover:bg-neutral-800"
            >
              <Check className="w-4 h-4 mr-1" /> Approve Request
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
