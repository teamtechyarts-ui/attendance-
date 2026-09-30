'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/hooks/use-notifications';
import { NotificationItem } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatTime } from '@/lib/utils';
import {
  Bell,
  CheckCheck,
  Check,
  Trash2,
  Volume2,
  VolumeX,
  Briefcase,
  Calendar,
  Clock,
  FolderKanban,
  ShieldAlert,
  Info,
  ExternalLink,
} from 'lucide-react';

function getNotificationIcon(type: string) {
  const norm = (type || '').toUpperCase();
  if (norm.includes('TASK')) return Briefcase;
  if (norm.includes('PROJECT')) return FolderKanban;
  if (norm.includes('LEAVE') || norm.includes('CALENDAR')) return Calendar;
  if (norm.includes('ATTENDANCE') || norm.includes('CHECKOUT')) return Clock;
  if (norm.includes('ADMIN') || norm.includes('PERMISSION') || norm.includes('ROLE')) return ShieldAlert;
  return Info;
}

export default function NotificationsPage() {
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    isLoading,
    soundEnabled,
    setSoundEnabled,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const handleNotificationClick = async (item: NotificationItem) => {
    if (!item.isRead) {
      await markAsRead(item.id);
    }
    if (item.actionUrl) {
      try {
        router.push(item.actionUrl);
      } catch {
        router.push('/dashboard');
      }
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'unread' && n.isRead) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = n.title.toLowerCase().includes(q);
      const matchMsg = n.message.toLowerCase().includes(q);
      const matchType = (n.type || '').toLowerCase().includes(q);
      if (!matchTitle && !matchMsg && !matchType) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">Notifications</h1>
            {unreadCount > 0 && (
              <Badge variant="danger" className="text-xs px-2 py-0.5">
                {unreadCount} Unread
              </Badge>
            )}
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Stay updated on task assignments, project changes, attendance alerts, and leave approvals.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Sound Toggle */}
          <Button
            onClick={() => setSoundEnabled(!soundEnabled)}
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-9"
            title={soundEnabled ? 'Notification sound enabled (click to mute)' : 'Notification sound muted (click to enable)'}
          >
            {soundEnabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-neutral-700" /> Sound ON
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-neutral-400" /> Sound OFF
              </>
            )}
          </Button>

          {/* Mark All Read */}
          {unreadCount > 0 && (
            <Button
              onClick={() => markAllAsRead()}
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-9 bg-white hover:bg-neutral-50"
            >
              <CheckCheck className="w-3.5 h-3.5 text-neutral-700" /> Mark All as Read
            </Button>
          )}
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
              filter === 'all'
                ? 'bg-neutral-900 text-white'
                : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
              filter === 'unread'
                ? 'bg-neutral-900 text-white'
                : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Search notifications..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 h-8 px-3 rounded-md border border-neutral-200 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-black"
          />
        </div>
      </div>

      {/* Notifications Card List */}
      <Card className="border border-neutral-200 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-0">
          {isLoading && notifications.length === 0 ? (
            <LoadingState message="Loading notifications..." />
          ) : filteredNotifications.length === 0 ? (
            <div className="p-12 text-center">
              <EmptyState
                icon={Bell}
                title="You're all caught up"
                description={
                  filter === 'unread'
                    ? 'No unread notifications at this time.'
                    : searchQuery
                    ? 'No notifications matched your search query.'
                    : 'No notifications or operational alerts at this time.'
                }
              />
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {filteredNotifications.map((item) => {
                const IconComponent = getNotificationIcon(item.type);
                return (
                  <div
                    key={item.id}
                    className={`p-4 flex items-start justify-between gap-4 transition-colors group ${
                      item.isRead
                        ? 'bg-white hover:bg-neutral-50/70'
                        : 'bg-neutral-50/80 hover:bg-neutral-100/70'
                    }`}
                  >
                    <div
                      onClick={() => handleNotificationClick(item)}
                      className="flex items-start gap-3.5 flex-1 cursor-pointer"
                    >
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          item.isRead
                            ? 'bg-neutral-100 text-neutral-500'
                            : 'bg-neutral-900 text-white shadow-sm'
                        }`}
                      >
                        <IconComponent className="w-4 h-4" />
                      </div>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4
                            className={`text-xs ${
                              item.isRead ? 'font-semibold text-neutral-800' : 'font-bold text-neutral-950'
                            }`}
                          >
                            {item.title}
                          </h4>
                          <Badge variant="secondary" className="text-[10px] font-mono uppercase px-1.5 py-0">
                            {item.type}
                          </Badge>
                          {!item.isRead && (
                            <span className="w-2 h-2 rounded-full bg-rose-600" />
                          )}
                        </div>

                        <p className="text-xs text-neutral-600 leading-relaxed">
                          {item.message}
                        </p>

                        <div className="flex items-center gap-3 pt-1 text-[11px] text-neutral-400">
                          <span>
                            {formatDate(item.createdAt)} at {formatTime(item.createdAt)}
                          </span>
                          {item.actionUrl && (
                            <span className="inline-flex items-center gap-1 text-neutral-600 group-hover:text-black font-semibold text-[11px]">
                              Open item <ExternalLink className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 self-center">
                      {!item.isRead && (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(item.id);
                          }}
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs text-neutral-700 hover:text-black hover:bg-neutral-200/60"
                          title="Mark as read"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(item.id);
                        }}
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-neutral-400 hover:text-rose-600 hover:bg-rose-50"
                        title="Delete notification"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
