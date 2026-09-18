'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { leaveApi } from '@/lib/api';
import { LeaveRequest, LeaveType } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/utils';
import { Calendar, Plus, XCircle, CheckCircle2 } from 'lucide-react';

export default function LeavePage() {
  const [balances, setBalances] = useState<any[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [totalDays, setTotalDays] = useState(1);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [bal, reqs, types] = await Promise.all([
        leaveApi.getBalances(),
        leaveApi.listRequests(),
        leaveApi.getTypes(),
      ]);
      setBalances(bal || []);
      setRequests(reqs || []);
      setLeaveTypes(types || []);
      if (types && types.length > 0) setLeaveTypeId(types[0].id);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveTypeId || !startDate || !endDate || !reason) return;
    setError(null);
    setIsSubmitting(true);

    try {
      await leaveApi.request({
        leaveTypeId,
        startDate,
        endDate,
        totalDays: Number(totalDays),
        reason,
      });
      setIsModalOpen(false);
      setReason('');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to submit leave request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this pending leave request?')) return;
    try {
      await leaveApi.cancel(id);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel request');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Leave Management</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Check leave balances, apply for time off, and track approvals.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-1.5 shadow-sm text-xs">
          <Plus className="w-3.5 h-3.5" /> Request Leave
        </Button>
      </div>

      {/* Leave Balances Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {balances.map((b) => {
          const available = Number(b.allocatedDays) - Number(b.usedDays) - Number(b.pendingDays);
          return (
            <Card key={b.id} className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-600 uppercase tracking-wider">
                  {b.leaveType?.name}
                </span>
                <span className="text-2xl font-black text-neutral-900">{available}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-neutral-100 text-[11px] text-neutral-500 text-center">
                <div>
                  <span className="block font-bold text-neutral-800">{b.allocatedDays}</span>
                  <span>Allocated</span>
                </div>
                <div>
                  <span className="block font-bold text-neutral-800">{b.usedDays}</span>
                  <span>Used</span>
                </div>
                <div>
                  <span className="block font-bold text-neutral-800">{b.pendingDays}</span>
                  <span>Pending</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Leave Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Leave History & Requests</CardTitle>
          <CardDescription>All submitted leave applications and their current review status</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingState message="Loading leave history..." />
          ) : requests.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No leave requests found"
              description="You have not submitted any leave applications yet."
              actionLabel="Apply for Leave"
              onAction={() => setIsModalOpen(true)}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-semibold">{req.leaveType?.name || 'Leave'}</TableCell>
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
                    <TableCell className="text-xs text-neutral-500">{req.reviewComment || '—'}</TableCell>
                    <TableCell className="text-right">
                      {req.status === 'PENDING' && (
                        <Button
                          onClick={() => handleCancel(req.id)}
                          variant="ghost"
                          size="sm"
                          className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-7"
                        >
                          Cancel
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

      {/* Request Leave Modal */}
      <Dialog
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Apply for Leave"
        description="Submit a time off request for manager approval."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {error}
            </div>
          )}

          <Select
            label="Leave Type *"
            value={leaveTypeId}
            onChange={(e) => setLeaveTypeId(e.target.value)}
            options={leaveTypes.map((t) => ({ value: t.id, label: t.name }))}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start Date *"
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Input
              label="End Date *"
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <Input
            label="Total Days *"
            type="number"
            step="0.5"
            min="0.5"
            required
            value={totalDays}
            onChange={(e) => setTotalDays(parseFloat(e.target.value) || 1)}
          />

          <Textarea
            label="Reason for Leave *"
            placeholder="Brief reason for your time off..."
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Submit Request
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
