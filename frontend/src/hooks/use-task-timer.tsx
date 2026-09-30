'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { tasksApi } from '@/lib/api';
import { Task } from '@/types';

export interface ActiveTimerState {
  id?: string;
  taskId: string;
  startedAt?: string;
  durationSeconds: number;
  priorClosedDurationSeconds?: number;
  currentElapsedSeconds?: number;
  isActive: boolean;
  status: 'RUNNING' | 'PAUSED' | 'IDLE';
  task?: Task;
}

export interface TaskTimerContextType {
  activeTimer: ActiveTimerState | null;
  elapsedSeconds: number;
  isLoading: boolean;
  isOperating: boolean;
  error: string | null;
  startTimer: (taskId: string) => Promise<any>;
  pauseTimer: (taskId: string) => Promise<any>;
  stopTimer: (taskId: string) => Promise<any>;
  setPausedTimer: (task: Task) => void;
  refreshTimer: () => Promise<void>;
}

const TaskTimerContext = createContext<TaskTimerContextType | undefined>(undefined);

export function TaskTimerProvider({ children }: { children: ReactNode }) {
  const [activeTimer, setActiveTimer] = useState<ActiveTimerState | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOperating, setIsOperating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const calculateCurrentElapsed = useCallback((timer: ActiveTimerState | null): number => {
    if (!timer) return 0;
    if (!timer.isActive || timer.status === 'PAUSED') {
      return timer.durationSeconds ?? (timer.priorClosedDurationSeconds ?? 0);
    }
    const base = timer.priorClosedDurationSeconds ?? 0;
    if (!timer.startedAt) return base;
    const started = new Date(timer.startedAt).getTime();
    const now = Date.now();
    const diff = Math.max(0, Math.floor((now - started) / 1000));
    return base + diff;
  }, []);

  const fetchActiveTimer = useCallback(async () => {
    if (typeof window !== 'undefined' && !localStorage.getItem('workos_access_token')) {
      setIsLoading(false);
      return;
    }
    try {
      const data = await tasksApi.getActiveTimer();
      if (data && data.isActive) {
        const state: ActiveTimerState = {
          ...data,
          status: 'RUNNING',
          priorClosedDurationSeconds: data.priorClosedDurationSeconds ?? 0,
        };
        setActiveTimer(state);
        setElapsedSeconds(calculateCurrentElapsed(state));
      } else {
        // If server reports no active running timer, do NOT wipe activeTimer if user has a paused session
        setActiveTimer((prev) => {
          if (prev && !prev.isActive && prev.status === 'PAUSED') {
            return prev;
          }
          return null;
        });
      }
    } catch (err: any) {
      // Preserve existing timer state on temporary network or rate limit errors
    } finally {
      setIsLoading(false);
    }
  }, [calculateCurrentElapsed]);

  useEffect(() => {
    fetchActiveTimer();
  }, [fetchActiveTimer]);

  // Periodic polling every 30s
  useEffect(() => {
    const pollInterval = setInterval(() => {
      fetchActiveTimer();
    }, 30000);
    return () => clearInterval(pollInterval);
  }, [fetchActiveTimer]);

  // Handle visibility change / tab focus to sync authoritative time without resetting paused duration
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (activeTimer && activeTimer.isActive) {
          setElapsedSeconds(calculateCurrentElapsed(activeTimer));
        }
        fetchActiveTimer();
      }
    };

    const handleFocus = () => {
      if (activeTimer && activeTimer.isActive) {
        setElapsedSeconds(calculateCurrentElapsed(activeTimer));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [activeTimer, calculateCurrentElapsed, fetchActiveTimer]);

  // Accurate interval tick only when RUNNING
  useEffect(() => {
    if (!activeTimer || !activeTimer.isActive || activeTimer.status !== 'RUNNING') return;

    setElapsedSeconds(calculateCurrentElapsed(activeTimer));

    const interval = setInterval(() => {
      setElapsedSeconds(calculateCurrentElapsed(activeTimer));
    }, 1000);

    return () => clearInterval(interval);
  }, [activeTimer, calculateCurrentElapsed]);

  const setPausedTimer = useCallback((task: Task) => {
    setActiveTimer((current) => {
      if (current && current.isActive) return current;
      const duration = task.totalDurationSeconds || 0;
      return {
        id: '',
        taskId: task.id,
        startedAt: '',
        durationSeconds: duration,
        priorClosedDurationSeconds: duration,
        currentElapsedSeconds: duration,
        isActive: false,
        status: 'PAUSED',
        task,
      };
    });
    setElapsedSeconds((current) => {
      if (activeTimer && activeTimer.isActive) return current;
      return task.totalDurationSeconds || 0;
    });
  }, [activeTimer]);

  const startTimer = async (taskId: string) => {
    if (isOperating) return null;
    setIsOperating(true);
    setError(null);
    try {
      const res = await tasksApi.startTimer(taskId);
      if (res && res.timer) {
        const prior = res.timer.priorClosedDurationSeconds ?? 0;
        const newTimerState: ActiveTimerState = {
          ...res.timer,
          priorClosedDurationSeconds: prior,
          isActive: true,
          status: 'RUNNING',
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
      const totalDur = res?.task?.totalDurationSeconds ?? (activeTimer ? elapsedSeconds : 0);
      const pausedState: ActiveTimerState = {
        id: activeTimer?.id,
        taskId,
        startedAt: activeTimer?.startedAt,
        durationSeconds: totalDur,
        priorClosedDurationSeconds: totalDur,
        currentElapsedSeconds: totalDur,
        isActive: false,
        status: 'PAUSED',
        task: res?.task || activeTimer?.task,
      };
      setActiveTimer(pausedState);
      setElapsedSeconds(totalDur);
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

  return (
    <TaskTimerContext.Provider
      value={{
        activeTimer,
        elapsedSeconds,
        isLoading,
        isOperating,
        error,
        startTimer,
        pauseTimer,
        stopTimer,
        setPausedTimer,
        refreshTimer: fetchActiveTimer,
      }}
    >
      {children}
    </TaskTimerContext.Provider>
  );
}

export function useTaskTimer(): TaskTimerContextType {
  const context = useContext(TaskTimerContext);
  if (!context) {
    return {
      activeTimer: null,
      elapsedSeconds: 0,
      isLoading: false,
      isOperating: false,
      error: null,
      startTimer: async () => null,
      pauseTimer: async () => null,
      stopTimer: async () => null,
      setPausedTimer: () => {},
      refreshTimer: async () => {},
    };
  }
  return context;
}
