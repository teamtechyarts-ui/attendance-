'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { NotificationItem } from '@/types';
import { notificationsApi } from '@/lib/api';
import { soundManager } from '@/lib/sound';
import { useAuth } from './use-auth';

interface NotificationsContextValue {
  notifications: NotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  isError: boolean;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isError, setIsError] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(true);

  const prevUnreadCountRef = useRef<number>(0);
  const isInitialLoadRef = useRef<boolean>(true);

  // Initialize sound preference from localStorage
  useEffect(() => {
    setSoundEnabledState(soundManager.isSoundEnabled());
  }, []);

  const handleSetSoundEnabled = useCallback((enabled: boolean) => {
    soundManager.setSoundEnabled(enabled);
    setSoundEnabledState(enabled);
  }, []);

  // Fetch notifications & unread count from backend
  const fetchNotifications = useCallback(async (silent = false) => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }

    if (!silent) setIsLoading(true);
    setIsError(false);

    try {
      const [items, countRes] = await Promise.all([
        notificationsApi.list({ limit: 20 }),
        notificationsApi.getUnreadCount(),
      ]);

      const newItems = Array.isArray(items) ? items : [];
      const newCount = countRes?.unreadCount !== undefined ? countRes.unreadCount : newItems.filter((n) => !n.isRead).length;

      setNotifications(newItems);
      setUnreadCount(newCount);

      // Trigger notification sound if unread count increased after initial load
      if (!isInitialLoadRef.current && newCount > prevUnreadCountRef.current) {
        soundManager.playNotificationChime();
      }

      prevUnreadCountRef.current = newCount;
      isInitialLoadRef.current = false;
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Initial load when user signs in
  useEffect(() => {
    isInitialLoadRef.current = true;
    prevUnreadCountRef.current = 0;
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time SSE Stream & Smart Polling (runs in background, never blocks UI)
  useEffect(() => {
    if (!user?.id) return;

    let eventSource: EventSource | null = null;
    let pollInterval: NodeJS.Timeout | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isCancelled = false;
    let reconnectDelay = 5000; // Exponential backoff starting at 5s, max 30s

    const cleanupSSE = () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };

    const connectSSE = () => {
      if (isCancelled || !user) return;

      // Close any previous instance before creating a new one
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }

      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
        
        // Note: EventSource sends session cookies across origins when withCredentials: true
        const sseUrl = `${apiUrl}/api/notifications/stream`;
        eventSource = new EventSource(sseUrl, { withCredentials: true });

        eventSource.onopen = () => {
          // Reset reconnect delay on successful connection
          reconnectDelay = 5000;
        };

        eventSource.addEventListener('notification', (event: MessageEvent) => {
          try {
            const data: NotificationItem = JSON.parse(event.data);
            setNotifications((prev) => [data, ...prev.filter((n) => n.id !== data.id)]);
            setUnreadCount((prev) => prev + 1);
            soundManager.playNotificationChime();
          } catch {
            fetchNotifications(true);
          }
        });

        eventSource.onerror = () => {
          if (isCancelled) return;

          // Close faulted stream
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }

          // Gentle reconnect with exponential backoff (5s, 7.5s, 11s, max 30s)
          if (!reconnectTimeout) {
            reconnectTimeout = setTimeout(() => {
              reconnectTimeout = null;
              if (!isCancelled && user?.id) {
                reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
                connectSSE();
              }
            }, reconnectDelay);
          }
        };
      } catch {
        // SSE failure must never break authentication or crash the application
      }
    };

    connectSSE();

    // Smart background polling (every 30 seconds when tab is active and visible)
    const handlePoll = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications(true);
      }
    };

    pollInterval = setInterval(handlePoll, 30000);

    // Instant refresh when user tabs back into the window
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications(true);
      }
    };

    const handleFocus = () => {
      fetchNotifications(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      isCancelled = true;
      cleanupSSE();
      if (pollInterval) clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user?.id, fetchNotifications]);

  // Mark single notification as read
  const markAsRead = useCallback(async (id: string) => {
    // Optimistic frontend update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await notificationsApi.markRead(id);
    } catch {
      // Revert on failure
      fetchNotifications(true);
    }
  }, [fetchNotifications]);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    // Optimistic frontend update
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
    );
    setUnreadCount(0);

    try {
      await notificationsApi.markAllRead();
    } catch {
      // Revert on failure
      fetchNotifications(true);
    }
  }, [fetchNotifications]);

  // Delete notification
  const deleteNotification = useCallback(async (id: string) => {
    const target = notifications.find((n) => n.id === id);
    const wasUnread = target && !target.isRead;

    // Optimistic update
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (wasUnread) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    try {
      await notificationsApi.delete(id);
    } catch {
      fetchNotifications(true);
    }
  }, [notifications, fetchNotifications]);

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        isError,
        soundEnabled,
        setSoundEnabled: handleSetSoundEnabled,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        refresh: () => fetchNotifications(false),
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}
