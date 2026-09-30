'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { CheckInModal } from './check-in-modal';
import { AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { formatSecondsToTime } from '@/lib/utils';

export function AttendanceBanner() {
  const { session, accessMode, user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  const isRestricted = (accessMode === 'RESTRICTED' || session?.attendanceRequired) && (user?.role !== 'SUPER_ADMIN' && user?.appRole !== 'SUPER_ADMIN');

  useEffect(() => {
    if (!isRestricted || !session?.restrictedUntil) return;

    const targetTime = new Date(session.restrictedUntil).getTime();

    const calculateRemaining = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((targetTime - now) / 1000));
      setRemainingSeconds(diff);
    };

    calculateRemaining();
    const interval = setInterval(calculateRemaining, 1000);
    return () => clearInterval(interval);
  }, [isRestricted, session?.restrictedUntil]);

  if (!isRestricted) return null;

  return (
    <>
      <div className="w-full bg-neutral-900 text-white border-b border-neutral-800 px-4 py-3 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-amber-400 shrink-0">
              <AlertCircle className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h4 className="text-sm font-semibold tracking-tight text-white flex items-center gap-2 justify-center sm:justify-start">
                ATTENDANCE REQUIRED
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-800 text-amber-300 font-mono text-xs">
                  <Clock className="w-3.5 h-3.5" />
                  {formatSecondsToTime(remainingSeconds)} remaining
                </span>
              </h4>
              <p className="text-xs text-neutral-400 mt-0.5">
                Your workspace is currently in restricted mode. Mark your attendance to unlock all features.
              </p>
            </div>
          </div>
          <Button
            onClick={() => setIsModalOpen(true)}
            size="sm"
            className="bg-white text-black hover:bg-neutral-200 shrink-0 gap-1.5 font-semibold text-xs"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Mark Attendance Now
          </Button>
        </div>
      </div>

      <CheckInModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
