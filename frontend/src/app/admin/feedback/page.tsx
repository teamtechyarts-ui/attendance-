'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { feedbackApi, employeesApi } from '@/lib/api';
import { Feedback, Employee, FeedbackPeriod } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/utils';
import { MessageSquare, Plus, Star } from 'lucide-react';

export default function AdminFeedbackPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [targetEmpId, setTargetEmpId] = useState('');
  const [period, setPeriod] = useState<FeedbackPeriod>('WEEKLY');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [productivity, setProductivity] = useState(4.5);
  const [quality, setQuality] = useState(4.5);
  const [communication, setCommunication] = useState(4.5);
  const [ownership, setOwnership] = useState(4.5);
  const [strengths, setStrengths] = useState('');
  const [areasToImprove, setAreasToImprove] = useState('');
  const [goals, setGoals] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [list, emps] = await Promise.all([feedbackApi.list(), employeesApi.list()]);
      setFeedbacks(list || []);
      setEmployees(emps || []);
      if (emps && emps.length > 0 && !targetEmpId) setTargetEmpId(emps[0].id);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [targetEmpId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetEmpId || !periodStart || !periodEnd) return;

    setIsSubmitting(true);
    const overall = parseFloat(((productivity + quality + communication + ownership) / 4).toFixed(1));

    try {
      await feedbackApi.create({
        employeeId: targetEmpId,
        period,
        periodStart,
        periodEnd,
        productivityScore: productivity,
        qualityScore: quality,
        communicationScore: communication,
        ownershipScore: ownership,
        overallScore: overall,
        strengths: strengths || null,
        areasToImprove: areasToImprove || null,
        goals: goals || null,
      });
      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to submit review');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Performance Reviews & Feedback</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Submit Daily, Weekly, and Monthly 0-5 performance evaluations and goals.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-1.5 shadow-sm text-xs">
          <Plus className="w-3.5 h-3.5" /> Submit Review
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading ? (
          <div className="col-span-2"><LoadingState message="Loading performance reviews..." /></div>
        ) : feedbacks.length === 0 ? (
          <div className="col-span-2">
            <EmptyState
              icon={MessageSquare}
              title="No reviews recorded"
              description="Submit a performance review for any team member."
              actionLabel="Submit Review"
              onAction={() => setIsModalOpen(true)}
            />
          </div>
        ) : (
          feedbacks.map((f) => (
            <Card key={f.id} className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">{f.employee?.displayName || 'Employee'}</h3>
                  <p className="text-[11px] text-neutral-400 font-mono">
                    {formatDate(f.periodStart)} – {formatDate(f.periodEnd)}
                  </p>
                </div>
                <div className="flex items-center gap-1 bg-black text-white px-2.5 py-1 rounded text-xs font-mono font-bold">
                  <Star className="w-3.5 h-3.5 fill-white" />
                  {f.overallScore} / 5.0
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center text-xs p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                <div>
                  <span className="font-bold block text-neutral-900">{f.productivityScore}</span>
                  <span className="text-neutral-400 text-[10px]">Productivity</span>
                </div>
                <div>
                  <span className="font-bold block text-neutral-900">{f.qualityScore}</span>
                  <span className="text-neutral-400 text-[10px]">Quality</span>
                </div>
                <div>
                  <span className="font-bold block text-neutral-900">{f.communicationScore}</span>
                  <span className="text-neutral-400 text-[10px]">Comm</span>
                </div>
                <div>
                  <span className="font-bold block text-neutral-900">{f.ownershipScore}</span>
                  <span className="text-neutral-400 text-[10px]">Ownership</span>
                </div>
              </div>

              {f.strengths && (
                <div className="text-xs">
                  <strong className="text-neutral-800">Strengths: </strong>
                  <span className="text-neutral-600">{f.strengths}</span>
                </div>
              )}
              {f.areasToImprove && (
                <div className="text-xs">
                  <strong className="text-neutral-800">Areas for Growth: </strong>
                  <span className="text-neutral-600">{f.areasToImprove}</span>
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      {/* Submit Review Modal */}
      <Dialog
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Submit Performance Review"
        description="Rate employee performance on 0-5 metric scales with qualitative goals."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Employee *"
              value={targetEmpId}
              onChange={(e) => setTargetEmpId(e.target.value)}
              options={employees.map((e) => ({ value: e.id, label: e.displayName }))}
            />
            <Select
              label="Period Type"
              value={period}
              onChange={(e) => setPeriod(e.target.value as FeedbackPeriod)}
              options={[
                { value: 'DAILY', label: 'Daily' },
                { value: 'WEEKLY', label: 'Weekly' },
                { value: 'MONTHLY', label: 'Monthly' },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Period Start Date *"
              type="date"
              required
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
            <Input
              label="Period End Date *"
              type="date"
              required
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Input
              label="Productivity (0-5)"
              type="number"
              step="0.1"
              min="0"
              max="5"
              value={productivity}
              onChange={(e) => setProductivity(parseFloat(e.target.value) || 0)}
            />
            <Input
              label="Quality (0-5)"
              type="number"
              step="0.1"
              min="0"
              max="5"
              value={quality}
              onChange={(e) => setQuality(parseFloat(e.target.value) || 0)}
            />
            <Input
              label="Comm (0-5)"
              type="number"
              step="0.1"
              min="0"
              max="5"
              value={communication}
              onChange={(e) => setCommunication(parseFloat(e.target.value) || 0)}
            />
            <Input
              label="Ownership (0-5)"
              type="number"
              step="0.1"
              min="0"
              max="5"
              value={ownership}
              onChange={(e) => setOwnership(parseFloat(e.target.value) || 0)}
            />
          </div>

          <Textarea
            label="Key Strengths"
            placeholder="What did the employee excel at?"
            value={strengths}
            onChange={(e) => setStrengths(e.target.value)}
          />

          <Textarea
            label="Areas to Improve"
            placeholder="Growth opportunities and feedback..."
            value={areasToImprove}
            onChange={(e) => setAreasToImprove(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Submit Evaluation
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
