'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { notificationsApi } from '@/lib/api';
import { NotificationItem } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatTime } from '@/lib/utils';
import { Bell, CheckCheck, Clock, CheckCircle } from 'lucide-react';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await notificationsApi.list();
      setNotifications(data || []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkRead = async (id: string) => {
    await notificationsApi.markRead(id);
    fetchNotifications();
  };

  const handleMarkAllRead = async () => {
    await notificationsApi.markAllRead();
    fetchNotifications();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Notifications</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Stay updated on task assignments, attendance reminders, and leave status.</p>
        </div>
        {notifications.some((n) => !n.isRead) && (
          <Button onClick={handleMarkAllRead} variant="outline" size="sm" className="gap-1.5 text-xs">
            <CheckCheck className="w-3.5 h-3.5" /> Mark All as Read
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingState message="Loading notifications..." />
          ) : notifications.length === 0 ? (
            <div className="p-8">
              <EmptyState icon={Bell} title="You're all caught up" description="No unread notifications or reminders at this time." />
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-4 flex items-start justify-between gap-4 transition-colors ${
                    n.isRead ? 'bg-white' : 'bg-neutral-50/80 font-medium'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-neutral-900">{n.title}</h4>
                      <Badge variant="secondary" className="text-[10px]">
                        {n.type}
                      </Badge>
                      {!n.isRead && <span className="w-2 h-2 rounded-full bg-black" />}
                    </div>
                    <p className="text-xs text-neutral-600">{n.message}</p>
                    <span className="text-[10px] text-neutral-400 block pt-1">
                      {formatDate(n.createdAt)} at {formatTime(n.createdAt)}
                    </span>
                  </div>

                  {!n.isRead && (
                    <Button
                      onClick={() => handleMarkRead(n.id)}
                      variant="ghost"
                      size="sm"
                      className="text-xs shrink-0"
                    >
                      Mark Read
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
