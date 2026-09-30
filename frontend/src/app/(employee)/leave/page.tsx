'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { leaveApi } from '@/lib/api';
import { LeaveRequest, LeaveType, EmployeeLeaveBalance } from '@/types';
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
import { Calendar, Plus, XCircle, CheckCircle2, RotateCcw, Info } from 'lucide-react';

const MONTH_OPTIONS = [
  { value: 'ALL', label: 'Full Year' },
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

export default function LeavePage() {
  const today = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(String(today.getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());

  const [balances, setBalances] = useState<EmployeeLeaveBalance[]>([]);
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

  const yearOptions = useMemo(() => {
    const currentYear = today.getFullYear();
    const years: { value: string; label: string }[] = [];
    for (let y = currentYear - 3; y <= currentYear + 3; y++) {
      years.push({ value: String(y), label: String(y) });
    }
    return years;
  }, [today]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const monthParam = selectedMonth === 'ALL' ? null : parseInt(selectedMonth, 10);
      const [bal, reqs, types] = await Promise.all([
        leaveApi.getBalances({
          year: selectedYear,
          month: monthParam,
        }),
        leaveApi.listRequests({
          year: selectedYear,
          month: monthParam || undefined,
        }),
        leaveApi.getTypes(),
      ]);

      setBalances(bal || []);
      setRequests(reqs || []);
      setLeaveTypes(types || []);
      if (types && types.length > 0 && !leaveTypeId) {
        setLeaveTypeId(types[0].id);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear, selectedMonth, leaveTypeId]);

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
      setStartDate('');
      setEndDate('');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to submit leave request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this leave request?')) return;
    try {
      await leaveApi.cancel(id);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel request');
    }
  };

  const selectedMonthLabel = useMemo(() => {
    if (selectedMonth === 'ALL') return `Full Year ${selectedYear}`;
    const found = MONTH_OPTIONS.find((m) => m.value === selectedMonth);
    return `${found?.label || 'Month'} ${selectedYear}`;
  }, [selectedMonth, selectedYear]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Leave Management</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Check monthly and annual leave balances, apply for time off, and track approved history.
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-1.5 shadow-sm text-xs">
          <Plus className="w-3.5 h-3.5" /> Request Leave
        </Button>
      </div>

      {/* Period Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-lg border border-neutral-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-bold text-neutral-600">Period:</span>
          <div className="w-36">
            <Select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              options={MONTH_OPTIONS}
            />
          </div>

          <div className="w-28">
            <Select
              value={String(selectedYear)}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              options={yearOptions}
            />
          </div>

          {(selectedMonth !== String(today.getMonth() + 1) || selectedYear !== today.getFullYear()) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedMonth(String(today.getMonth() + 1));
                setSelectedYear(today.getFullYear());
              }}
              className="h-9 px-2.5 text-xs text-neutral-600 hover:text-neutral-900 gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset to Current Month
            </Button>
          )}
        </div>

        <div className="text-xs text-neutral-500 font-medium">
          Showing balances for <span className="font-bold text-neutral-900">{selectedMonthLabel}</span>
        </div>
      </div>

      {/* Leave Balances Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">
            Leave Balances — {selectedMonthLabel}
          </h2>
          <span className="text-[11px] text-neutral-400">
            Authoritative allocation minus approved leaves
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {isLoading && balances.length === 0 ? (
            [1, 2, 3].map((i) => (
              <Card key={i} className="p-5 animate-pulse min-h-[120px]">
                <div className="h-4 bg-neutral-200 rounded w-1/2 mb-3"></div>
                <div className="h-8 bg-neutral-200 rounded w-1/4"></div>
              </Card>
            ))
          ) : balances.length === 0 ? (
            <div className="sm:col-span-3 p-6 text-center text-xs text-neutral-500 bg-white rounded-lg border border-neutral-200">
              No leave policies configured for this period.
            </div>
          ) : (
            balances.map((b) => (
              <Card
                key={b.id}
                className="p-5 border-neutral-200 bg-white shadow-sm hover:shadow transition-shadow relative overflow-hidden"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold text-neutral-800 uppercase tracking-wider block">
                      {b.leaveType?.name}
                    </span>
                    <span className="text-[10px] text-neutral-400 block mt-0.5">
                      {b.policy?.policyCycle === 'MONTHLY' ? 'Monthly Allocation' : 'Annual Policy'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-black text-neutral-900 block leading-none">
                      {b.remainingDays}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-emerald-600 block mt-1">
                      Remaining
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-neutral-100 text-[11px] text-center">
                  <div className="bg-neutral-50 py-1.5 px-1 rounded">
                    <span className="block font-black text-neutral-900 text-sm">{b.allocatedDays}</span>
                    <span className="text-neutral-500 text-[10px]">Allocated</span>
                  </div>
                  <div className="bg-neutral-50 py-1.5 px-1 rounded">
                    <span className="block font-black text-purple-700 text-sm">{b.usedDays}</span>
                    <span className="text-purple-600 text-[10px]">Used</span>
                  </div>
                  <div className="bg-neutral-50 py-1.5 px-1 rounded">
                    <span className="block font-black text-amber-700 text-sm">{b.pendingDays}</span>
                    <span className="text-amber-600 text-[10px]">Pending</span>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Leave Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Leave Applications & History</CardTitle>
          <CardDescription>
            All submitted time off applications for {selectedMonthLabel} and their approval status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && requests.length === 0 ? (
            <div className="space-y-3 p-4 animate-pulse">
              <div className="h-8 bg-neutral-100 rounded w-full"></div>
              <div className="h-8 bg-neutral-100 rounded w-full"></div>
              <div className="h-8 bg-neutral-100 rounded w-full"></div>
            </div>
          ) : requests.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No leave requests found"
              description={`You have no leave applications recorded for ${selectedMonthLabel}.`}
              actionLabel="Apply for Leave"
              onAction={() => setIsModalOpen(true)}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Working Days</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes / Review</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-semibold text-neutral-900 text-xs">
                      {req.leaveType?.name || 'Leave'}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {formatDate(req.startDate)} – {formatDate(req.endDate)}
                    </TableCell>
                    <TableCell className="font-bold text-xs">{req.totalDays} d</TableCell>
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
                    <TableCell className="text-xs text-neutral-500">
                      {req.reviewComment || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {(req.status === 'PENDING' || req.status === 'APPROVED') && (
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
        description="Submit a time off request. Working days are calculated excluding weekends and holidays."
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
              onChange={(e) => {
                setStartDate(e.target.value);
                if (!endDate || endDate < e.target.value) {
                  setEndDate(e.target.value);
                }
              }}
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
            label="Total Working Days *"
            type="number"
            step="0.5"
            min="0.5"
            required
            value={totalDays}
            onChange={(e) => setTotalDays(parseFloat(e.target.value) || 1)}
          />

          <Textarea
            label="Reason for Leave *"
            placeholder="State the purpose for your leave..."
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
