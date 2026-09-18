'use client';

import React, { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { attendanceApi } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { Building2, Home, Globe, CheckCircle2 } from 'lucide-react';
import { WorkMode } from '@/types';

export interface CheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CheckInModal({ isOpen, onClose, onSuccess }: CheckInModalProps) {
  const { markAttendanceSuccess } = useAuth();
  const [workMode, setWorkMode] = useState<WorkMode>('OFFICE');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Optional geolocation
      let lat: number | undefined;
      let lng: number | undefined;

      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          // Geolocation optional in manual mode
        }
      }

      const record = await attendanceApi.checkIn({
        workMode,
        verificationMethod: 'MANUAL',
        latitude: lat,
        longitude: lng,
        notes: notes || null,
      });

      markAttendanceSuccess(record);
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to check in. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Mark Today's Attendance"
      description="Start your work session and unlock full workspace access."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-neutral-700 mb-2">Work Mode</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'OFFICE', label: 'Office', icon: Building2 },
              { id: 'WFH', label: 'WFH', icon: Home },
              { id: 'REMOTE', label: 'Remote', icon: Globe },
            ].map((mode) => {
              const Icon = mode.icon;
              const isSelected = workMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setWorkMode(mode.id as WorkMode)}
                  className={`flex flex-col items-center justify-center p-3 rounded-lg border text-xs font-semibold transition-all ${
                    isSelected
                      ? 'border-black bg-neutral-900 text-white shadow-sm'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  <Icon className="w-5 h-5 mb-1.5" />
                  {mode.label}
                </button>
              );
            })}
          </div>
        </div>

        <Textarea
          label="Notes / Location Details (Optional)"
          placeholder="e.g., Working from Bangalore office 4th floor"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading} className="gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Confirm Check-In
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
