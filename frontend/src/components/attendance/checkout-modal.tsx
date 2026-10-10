'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  LogOut,
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';
import { attendanceApi } from '@/lib/api';
import { AttendanceRecord } from '@/types';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (record: AttendanceRecord) => void;
  activeTimerRunning?: boolean;
  activeTaskTitle?: string | null;
  initialReportText?: string;
}

export function CheckoutModal({
  isOpen,
  onClose,
  onSuccess,
  activeTimerRunning = false,
  activeTaskTitle = null,
  initialReportText = '',
}: CheckoutModalProps) {
  const [reportText, setReportText] = useState(initialReportText);
  const [blockers, setBlockers] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const trimmedReport = reportText.trim();
  const trimmedLength = trimmedReport.length;
  const isReportValid = trimmedLength >= 100;
  const charactersRemaining = Math.max(0, 100 - trimmedLength);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReportValid || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await attendanceApi.checkOut({
        dailyWorkReport: trimmedReport,
        blockers: blockers.trim() || undefined,
      });

      onSuccess(res);
      onClose();
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Failed to complete checkout. Please ensure your report meets all requirements and try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 border border-neutral-200 text-neutral-900 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-neutral-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center shrink-0 shadow-sm">
              <LogOut className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-neutral-900">Attendance Checkout</h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Submit your mandatory daily work report to check out
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Active Timer Warning if Running */}
        {activeTimerRunning && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3 text-xs">
            <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold text-amber-900">Active Task Timer Detected</p>
              <p className="text-amber-700 leading-relaxed">
                Your active timer for {activeTaskTitle ? `"${activeTaskTitle}"` : 'the current task'} will be automatically stopped and logged upon checkout.
              </p>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Checkout Failed</p>
              <p className="mt-0.5 leading-relaxed">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Daily Work Report Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="dailyWorkReport" className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-neutral-600" />
                Daily Work Report <span className="text-rose-600">*</span>
              </label>
              <span
                className={`text-[11px] font-mono font-bold ${
                  isReportValid ? 'text-emerald-600' : 'text-neutral-500'
                }`}
              >
                {trimmedLength} / 100 characters minimum
              </span>
            </div>

            <textarea
              id="dailyWorkReport"
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              placeholder="Describe tasks completed, key milestones reached, code committed, meetings attended, or progress made today..."
              rows={5}
              disabled={isSubmitting}
              className={`w-full p-3 rounded-xl border text-xs leading-relaxed transition-all focus:outline-none focus:ring-2 ${
                isReportValid
                  ? 'border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20'
                  : trimmedLength > 0
                  ? 'border-amber-300 focus:border-amber-500 focus:ring-amber-500/20'
                  : 'border-neutral-200 focus:border-black focus:ring-black/10'
              }`}
            />

            {/* Validation Feedback */}
            <div className="flex items-center justify-between text-[11px] pt-0.5">
              <p className="text-neutral-500">
                Daily work report is required (minimum 100 characters).
              </p>
              {!isReportValid ? (
                <span className="text-amber-700 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {charactersRemaining} more needed
                </span>
              ) : (
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Requirement met
                </span>
              )}
            </div>
          </div>

          {/* Optional Blockers Field */}
          <div className="space-y-1.5">
            <label htmlFor="reportBlockers" className="text-xs font-bold text-neutral-700">
              Blockers / Challenges (Optional)
            </label>
            <input
              id="reportBlockers"
              type="text"
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              placeholder="Any dependencies or blockers needing managerial attention..."
              disabled={isSubmitting}
              className="w-full h-9 px-3 rounded-xl border border-neutral-200 text-xs focus:outline-none focus:border-black focus:ring-2 focus:ring-black/10"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              className="text-xs h-9"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!isReportValid || isSubmitting}
              className={`text-xs h-9 gap-1.5 shadow-sm transition-all ${
                isReportValid
                  ? 'bg-neutral-900 hover:bg-black text-white'
                  : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting Report & Checking Out...
                </>
              ) : (
                <>
                  <LogOut className="w-3.5 h-3.5" /> Submit Report & Check Out
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
