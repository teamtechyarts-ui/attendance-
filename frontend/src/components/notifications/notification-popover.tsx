'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/hooks/use-notifications';
import { NotificationItem } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Bell,
  CheckCheck,
  Check,
  Briefcase,
  Calendar,
  Clock,
  FolderKanban,
  ShieldAlert,
  Volume2,
  VolumeX,
  X,
  ExternalLink,
  Info,
  ChevronRight,
} from 'lucide-react';

function getNotificationIcon(type: string) {
  const norm = type.toUpperCase();
  if (norm.includes('TASK')) return Briefcase;
  if (norm.includes('PROJECT')) return FolderKanban;
  if (norm.includes('LEAVE') || norm.includes('CALENDAR')) return Calendar;
  if (norm.includes('ATTENDANCE') || norm.includes('CHECKOUT')) return Clock;
  if (norm.includes('ADMIN') || norm.includes('PERMISSION') || norm.includes('ROLE')) return ShieldAlert;
  return Info;
}

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172800) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function NotificationPopover() {
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    isLoading,
    isError,
    soundEnabled,
    setSoundEnabled,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking or tapping outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const handleNotificationClick = async (item: NotificationItem) => {
    if (!item.isRead) {
      await markAsRead(item.id);
    }
    setIsOpen(false);

    if (item.actionUrl) {
      try {
        router.push(item.actionUrl);
      } catch {
        router.push('/dashboard');
      }
    }
  };

  const displayedNotifications = filter === 'unread'
    ? notifications.filter((n) => !n.isRead)
    : notifications;

  return (
    <div className="relative inline-block" ref={popoverRef}>
      {/* Bell Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded-md text-neutral-600 hover:text-black hover:bg-neutral-100 transition-colors relative flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-1"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={isOpen}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-600 text-white font-bold text-[10px] leading-none shadow-sm animate-in zoom-in-75">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Content */}
      {isOpen && (
        <div className="fixed sm:absolute top-[3.75rem] sm:top-full left-3 right-3 sm:left-auto sm:right-0 sm:mt-2 w-auto sm:w-96 max-w-[calc(100vw-1.5rem)] sm:max-w-none mx-auto sm:mx-0 rounded-xl border border-neutral-200/90 bg-white shadow-2xl sm:shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-neutral-900">
          {/* Header */}
          <div className="p-3.5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-extrabold tracking-tight text-neutral-900">Notifications</h3>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold text-[10px]">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {/* Sound Toggle */}
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`p-1.5 rounded-md text-xs transition-colors flex items-center gap-1 ${
                  soundEnabled
                    ? 'text-neutral-700 hover:bg-neutral-200/70'
                    : 'text-neutral-400 hover:bg-neutral-200/70'
                }`}
                title={soundEnabled ? 'Sound: ON (click to mute)' : 'Sound: OFF (click to unmute)'}
                aria-label="Toggle notification sound"
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-neutral-700" /> : <VolumeX className="w-3.5 h-3.5 text-neutral-400" />}
              </button>

              {/* Mark All Read Button */}
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllAsRead()}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold text-neutral-700 hover:text-black hover:bg-neutral-200/70 transition-colors"
                >
                  <CheckCheck className="w-3 h-3" />
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-2 px-3.5 py-2 border-b border-neutral-100 bg-white text-[11px]">
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-md font-bold transition-colors ${
                filter === 'all'
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-2.5 py-1 rounded-md font-bold transition-colors ${
                filter === 'unread'
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Notification List Body */}
          <div className="max-h-[min(360px,calc(100vh-12rem))] sm:max-h-[360px] overflow-y-auto divide-y divide-neutral-100">
            {isLoading && notifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-5 h-5 border-2 border-neutral-300 border-t-black rounded-full animate-spin mx-auto" />
                <p className="text-xs text-neutral-500 font-medium">Loading notifications...</p>
              </div>
            ) : isError && notifications.length === 0 ? (
              <div className="p-6 text-center space-y-1 text-xs text-neutral-500">
                <p className="font-semibold text-neutral-800">Couldn't load notifications</p>
                <p className="text-[11px]">Check your connection and try again.</p>
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto">
                  <Bell className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-neutral-800">You're all caught up</h4>
                <p className="text-[11px] text-neutral-500 max-w-[200px] mx-auto">
                  {filter === 'unread' ? 'No unread notifications' : 'No new notifications right now'}
                </p>
              </div>
            ) : (
              displayedNotifications.map((item) => {
                const IconComponent = getNotificationIcon(item.type);
                return (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`p-3 sm:p-3.5 flex items-start gap-3 cursor-pointer transition-colors group relative ${
                      item.isRead
                        ? 'bg-white hover:bg-neutral-50/80 text-neutral-600'
                        : 'bg-neutral-50/90 hover:bg-neutral-100/80 text-neutral-900 font-medium'
                    }`}
                  >
                    {/* Context Icon */}
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        item.isRead
                          ? 'bg-neutral-100 text-neutral-500'
                          : 'bg-black text-white shadow-sm'
                      }`}
                    >
                      <IconComponent className="w-3.5 h-3.5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <p className={`text-xs truncate ${item.isRead ? 'font-semibold text-neutral-800' : 'font-bold text-neutral-950'}`}>
                          {item.title}
                        </p>
                        <span className="text-[10px] text-neutral-400 shrink-0 font-medium">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </div>

                      <p className="text-[11px] text-neutral-600 mt-0.5 line-clamp-2 leading-relaxed">
                        {item.message}
                      </p>
                    </div>

                    {/* Unread Accent Dot */}
                    {!item.isRead && (
                      <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0 self-center" />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 border-t border-neutral-100 bg-neutral-50/80 text-center">
            <Link
              href="/notifications"
              onClick={() => setIsOpen(false)}
              className="inline-flex items-center gap-1 text-xs font-bold text-neutral-800 hover:text-black transition-colors"
            >
              View all notifications <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
