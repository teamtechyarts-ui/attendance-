'use client';

import { useState, useEffect, useCallback } from 'react';
import { tasksApi } from '@/lib/api';
import { Task } from '@/types';

export interface ActiveTimerState {
  id: string;
  taskId: string;
  startedAt: string;
  durationSeconds: number;
  priorClosedDurationSeconds?: number;
  currentElapsedSeconds?: number;
  isActive: boolean;
  task?: Task;
}

export function useTaskTimer() {
  const [activeTimer, setActiveTimer] = useState<ActiveTimerState | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOperating, setIsOperating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const calculateCurrentElapsed = (timer: ActiveTimerState): number => {
    if (!timer || !timer.isActive) return timer?.durationSeconds || 0;
    const base = timer.priorClosedDurationSeconds ?? 0;
    const started = new Date(timer.startedAt).getTime();
    const now = Date.now();
    const diff = Math.max(0, Math.floor((now - started) / 1000));
    return base + diff;
  };

  const fetchActiveTimer = useCallback(async () => {
    try {
      const data = await tasksApi.getActiveTimer();
      if (data && data.isActive) {
        const state: ActiveTimerState = {
          ...data,
          priorClosedDurationSeconds: data.priorClosedDurationSeconds ?? 0,
        };
        setActiveTimer(state);
        setElapsedSeconds(calculateCurrentElapsed(state));
      } else {
        setActiveTimer(null);
        setElapsedSeconds(0);
      }
    } catch (err: any) {
      // If error is 429 (rate limit) or temporary, preserve existing active timer state rather than clearing it
      if (err?.status !== 429 && err?.statusCode !== 429) {
        setActiveTimer(null);
        setElapsedSeconds(0);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveTimer();
  }, [fetchActiveTimer]);

  // Accurate interval tick
  useEffect(() => {
    if (!activeTimer || !activeTimer.isActive) return;

    // Immediately update
    setElapsedSeconds(calculateCurrentElapsed(activeTimer));

    const interval = setInterval(() => {
      setElapsedSeconds(calculateCurrentElapsed(activeTimer));
    }, 1000);

    return () => clearInterval(interval);
  }, [activeTimer]);

  const startTimer = async (taskId: string) => {
    if (isOperating) return null;
    setIsOperating(true);
    setError(null);
    try {
      const res = await tasksApi.startTimer(taskId);
      if (res && res.timer) {
        const totalDuration = res.task?.totalDurationSeconds || 0;
        const currentTimerDur = res.timer.durationSeconds || 0;
        const prior = Math.max(0, totalDuration - currentTimerDur);

        const newTimerState: ActiveTimerState = {
          ...res.timer,
          priorClosedDurationSeconds: prior,
          task: res.task,
        };
        setActiveTimer(newTimerState);
        setElapsedSeconds(calculateCurrentElapsed(newTimerState));
      }
      return res;
    } catch (err: any) {
      const msg = err.message || 'Failed to start timer';
      setError(msg);
      console.error('[useTaskTimer] startTimer failed:', msg);
      return null;
    } finally {
      setIsOperating(false);
    }
  };

  const pauseTimer = async (taskId: string) => {
    if (isOperating) return null;
    setIsOperating(true);
    setError(null);
    try {
      const res = await tasksApi.pauseTimer(taskId);
      setActiveTimer(null);
      setElapsedSeconds(0);
      return res;
    } catch (err: any) {
      const msg = err.message || 'Failed to pause timer';
      setError(msg);
      console.error('[useTaskTimer] pauseTimer failed:', msg);
      return null;
    } finally {
      setIsOperating(false);
    }
  };

  const stopTimer = async (taskId: string) => {
    if (isOperating) return null;
    setIsOperating(true);
    setError(null);
    try {
      const res = await tasksApi.stopTimer(taskId);
      setActiveTimer(null);
      setElapsedSeconds(0);
      return res;
    } catch (err: any) {
      const msg = err.message || 'Failed to stop timer';
      setError(msg);
      console.error('[useTaskTimer] stopTimer failed:', msg);
      return null;
    } finally {
      setIsOperating(false);
    }
  };

  return {
    activeTimer,
    elapsedSeconds,
    isLoading,
    isOperating,
    error,
    startTimer,
    pauseTimer,
    stopTimer,
    refreshTimer: fetchActiveTimer,
  };
}
