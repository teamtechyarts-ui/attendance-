'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/hooks/use-notifications';
import { NotificationItem } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  CheckSquare,
  Square,
  AlertCircle,
  X,
  Loader2,
  RefreshCw,
  Search,
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

interface NotificationsViewProps {
  isAdminView?: boolean;
}

export function NotificationsView({ isAdminView = false }: NotificationsViewProps) {
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
    deleteNotification,
    bulkDeleteNotifications,
    deleteAllNotifications,
    refresh,
  } = useNotifications();

  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal & operation states
  const [notificationToDelete, setNotificationToDelete] = useState<NotificationItem | null>(null);
  const [isDeletingSingle, setIsDeletingSingle] = useState(false);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filter and search logic
  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (filter === 'unread' && n.isRead) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (n.title || '').toLowerCase().includes(q);
        const matchMsg = (n.message || '').toLowerCase().includes(q);
        const matchType = (n.type || '').toLowerCase().includes(q);
        if (!matchTitle && !matchMsg && !matchType) return false;
      }
      return true;
    });
  }, [notifications, filter, searchQuery]);

  const visibleIds = useMemo(() => filteredNotifications.map((n) => n.id), [filteredNotifications]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));

  // Selection handlers
  const handleSelectAllToggle = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of visibleIds) {
          next.delete(id);
        }
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of visibleIds) {
          next.add(id);
        }
        return next;
      });
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Notification click handler
  const handleNotificationClick = async (item: NotificationItem) => {
    if (!item.isRead) {
      await markAsRead(item.id);
    }
    if (item.actionUrl) {
      try {
        router.push(item.actionUrl);
      } catch {
        router.push(isAdminView ? '/admin/dashboard' : '/dashboard');
      }
    }
  };

  // Manual refresh handler
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    setActionFeedback(null);
    try {
      await refresh();
      setActionFeedback({ type: 'success', message: 'Notifications updated' });
      setTimeout(() => setActionFeedback(null), 2500);
    } catch {
      setActionFeedback({ type: 'error', message: 'Failed to refresh notifications' });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Single deletion with confirmation modal
  const handleConfirmSingleDelete = async () => {
    if (!notificationToDelete) return;
    setIsDeletingSingle(true);
    setActionFeedback(null);

    const targetId = notificationToDelete.id;
    try {
      await deleteNotification(targetId);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
      setNotificationToDelete(null);
      setActionFeedback({ type: 'success', message: 'Notification deleted successfully' });
      setTimeout(() => setActionFeedback(null), 3000);
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err?.message || 'Failed to delete notification' });
    } finally {
      setIsDeletingSingle(false);
    }
  };

  // Bulk deletion handler
  const handleConfirmBulkDelete = async () => {
    const idsToDelete = Array.from(selectedIds);
    if (idsToDelete.length === 0) return;

    setIsDeletingBulk(true);
    setActionFeedback(null);
    try {
      const res = await bulkDeleteNotifications(idsToDelete);
      setSelectedIds(new Set());
      setIsBulkDeleteModalOpen(false);
      setActionFeedback({
        type: 'success',
        message: `Successfully deleted ${res.deletedCount} notification(s)`,
      });
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: err?.message || 'Failed to delete selected notifications',
      });
    } finally {
      setIsDeletingBulk(false);
    }
  };

  // Delete all handler
  const handleConfirmDeleteAll = async () => {
    setIsDeletingAll(true);
    setActionFeedback(null);
    try {
      const res = await deleteAllNotifications();
      setSelectedIds(new Set());
      setIsDeleteAllModalOpen(false);
      setActionFeedback({
        type: 'success',
        message: `Successfully deleted all notifications (${res.deletedCount || 'all'} removed)`,
      });
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: err?.message || 'Failed to delete all notifications',
      });
    } finally {
      setIsDeletingAll(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">
              {isAdminView ? 'Admin Notifications' : 'Notifications'}
            </h1>
            {unreadCount > 0 && (
              <Badge variant="danger" className="text-xs px-2 py-0.5">
                {unreadCount} Unread
              </Badge>
            )}
            <Badge variant="outline" className="text-xs px-2 py-0.5 text-neutral-600 bg-neutral-50">
              {notifications.length} Total
            </Badge>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            {isAdminView
              ? 'Stay updated on administrative actions, team assignments, checkouts, attendance flags, and system events.'
              : 'Stay updated on task assignments, project changes, attendance alerts, and leave approvals.'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Refresh Button */}
          <Button
            onClick={handleManualRefresh}
            variant="outline"
            size="sm"
            disabled={isRefreshing || isLoading}
            className="gap-1.5 text-xs h-9"
            title="Refresh notifications"
            aria-label="Refresh notifications"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>

          {/* Sound Toggle */}
          <Button
            onClick={() => setSoundEnabled(!soundEnabled)}
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-9"
            title={soundEnabled ? 'Notification sound enabled (click to mute)' : 'Notification sound muted (click to enable)'}
            aria-label="Toggle notification sound"
          >
            {soundEnabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-neutral-700" />
                <span className="hidden sm:inline">Sound ON</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-neutral-400" />
                <span className="hidden sm:inline">Sound OFF</span>
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
              <CheckCheck className="w-3.5 h-3.5 text-neutral-700" />
              <span>Mark All Read</span>
            </Button>
          )}

          {/* Delete All Notifications */}
          {notifications.length > 0 && (
            <Button
              onClick={() => setIsDeleteAllModalOpen(true)}
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-9 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Delete All</span>
            </Button>
          )}
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between gap-2 shadow-sm transition-all animate-in fade-in ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{actionFeedback.message}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="p-1 hover:bg-black/5 rounded text-neutral-500 hover:text-black"
            aria-label="Dismiss feedback"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter, Search, and Bulk Actions Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
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
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search notifications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 h-8 pl-8 pr-7 rounded-md border border-neutral-200 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-black placeholder:text-neutral-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-neutral-400 hover:text-neutral-700"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Bulk Selection Bar */}
        {filteredNotifications.length > 0 && (
          <div className="bg-neutral-50 border border-neutral-200/90 rounded-lg p-2.5 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={handleSelectAllToggle}
                className="flex items-center gap-2 font-semibold text-neutral-700 hover:text-black transition-colors focus:outline-none"
                aria-label={allVisibleSelected ? 'Deselect all visible' : 'Select all visible'}
              >
                {allVisibleSelected ? (
                  <CheckSquare className="w-4 h-4 text-black" />
                ) : someVisibleSelected ? (
                  <div className="w-4 h-4 rounded border border-black bg-black flex items-center justify-center text-white">
                    <span className="w-2 h-0.5 bg-white block" />
                  </div>
                ) : (
                  <Square className="w-4 h-4 text-neutral-400" />
                )}
                <span>Select All ({filteredNotifications.length})</span>
              </button>

              {selectedIds.size > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-800 font-bold text-[11px]">
                  {selectedIds.size} selected
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <>
                  <Button
                    onClick={() => setSelectedIds(new Set())}
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-neutral-600 hover:text-black"
                  >
                    Deselect All
                  </Button>
                  <Button
                    onClick={() => setIsBulkDeleteModalOpen(true)}
                    variant="danger"
                    size="sm"
                    className="h-8 text-xs gap-1.5 shadow-sm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Selected ({selectedIds.size})
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Notifications Card List */}
      <Card className="border border-neutral-200 shadow-sm overflow-hidden bg-white">
        <CardContent className="p-0">
          {/* Loading Skeletons State */}
          {isLoading && notifications.length === 0 ? (
            <div className="divide-y divide-neutral-100 p-2">
              {[1, 2, 3, 4, 5].map((idx) => (
                <div key={idx} className="p-4 flex items-start gap-4 animate-pulse">
                  <div className="w-4 h-4 rounded bg-neutral-200 mt-1 shrink-0" />
                  <div className="w-9 h-9 rounded-xl bg-neutral-200 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-3.5 bg-neutral-200 rounded w-1/4" />
                      <div className="h-3 bg-neutral-200 rounded w-16" />
                    </div>
                    <div className="h-3 bg-neutral-200 rounded w-3/4" />
                    <div className="h-2.5 bg-neutral-200 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError && notifications.length === 0 ? (
            /* Error State with Retry Button */
            <div className="p-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-neutral-900">Failed to load notifications</h3>
                <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                  We were unable to reach the notification server. Please verify your network connection and retry.
                </p>
              </div>
              <Button
                onClick={() => refresh()}
                size="sm"
                variant="outline"
                className="gap-2 text-xs font-semibold"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Loading
              </Button>
            </div>
          ) : filteredNotifications.length === 0 ? (
            /* Empty State */
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
            /* Populated Notification Items */
            <div className="divide-y divide-neutral-100">
              {filteredNotifications.map((item) => {
                const IconComponent = getNotificationIcon(item.type);
                const isSelected = selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`p-4 flex items-start justify-between gap-3.5 transition-colors group ${
                      isSelected
                        ? 'bg-neutral-100/90'
                        : item.isRead
                        ? 'bg-white hover:bg-neutral-50/70'
                        : 'bg-neutral-50/80 hover:bg-neutral-100/70'
                    }`}
                  >
                    {/* Item Checkbox */}
                    <button
                      onClick={(e) => handleToggleSelect(item.id, e)}
                      className="mt-1 p-1 -m-1 text-neutral-400 hover:text-neutral-900 focus:outline-none shrink-0"
                      aria-label={isSelected ? `Deselect ${item.title}` : `Select ${item.title}`}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-black" />
                      ) : (
                        <Square className="w-4 h-4 text-neutral-300 group-hover:text-neutral-500" />
                      )}
                    </button>

                    {/* Notification Content Body */}
                    <div
                      onClick={() => handleNotificationClick(item)}
                      className="flex items-start gap-3.5 flex-1 cursor-pointer min-w-0"
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
                            <span className="w-2 h-2 rounded-full bg-rose-600" title="Unread notification" />
                          )}
                        </div>

                        <p className="text-xs text-neutral-600 leading-relaxed">
                          {item.message}
                        </p>

                        <div className="flex items-center gap-3 pt-1 text-[11px] text-neutral-400">
                          <span>
                            {formatDate(item.createdAt)} at {formatTime(item.createdAt)} ({formatRelativeTime(item.createdAt)})
                          </span>
                          {item.actionUrl && (
                            <span className="inline-flex items-center gap-1 text-neutral-600 group-hover:text-black font-semibold text-[11px]">
                              Open item <ExternalLink className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Row Item Actions */}
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
                          aria-label="Mark notification as read"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          setNotificationToDelete(item);
                        }}
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-neutral-400 hover:text-rose-600 hover:bg-rose-50"
                        title="Delete notification"
                        aria-label="Delete notification"
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

      {/* Single Delete Confirmation Modal */}
      {notificationToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-neutral-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900">Delete Notification?</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Single item deletion</p>
              </div>
            </div>

            <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-200/80">
              <p className="text-xs font-bold text-neutral-900">{notificationToDelete.title}</p>
              <p className="text-[11px] text-neutral-600 mt-1 line-clamp-2">{notificationToDelete.message}</p>
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed">
              Are you sure you want to delete this notification? It will be permanently removed from your notifications.
            </p>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-neutral-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setNotificationToDelete(null)}
                disabled={isDeletingSingle}
                className="text-xs h-9"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmSingleDelete}
                disabled={isDeletingSingle}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-9 gap-1.5"
              >
                {isDeletingSingle ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-neutral-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900">
                  Delete {selectedIds.size} Selected Notification(s)?
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">Bulk deletion confirmation</p>
              </div>
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed">
              Delete {selectedIds.size} selected notifications? This action cannot be undone and will permanently remove them from your notification history.
            </p>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-neutral-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                disabled={isDeletingBulk}
                className="text-xs h-9"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmBulkDelete}
                disabled={isDeletingBulk}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-9 gap-1.5"
              >
                {isDeletingBulk ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" /> Delete {selectedIds.size} Notifications
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Confirmation Modal */}
      {isDeleteAllModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-neutral-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900">Delete All Notifications?</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Complete clear confirmation</p>
              </div>
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed">
              Are you sure you want to delete all notifications in your notification center? This will permanently remove all notifications for your account across all pages and categories. This action cannot be undone.
            </p>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-neutral-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDeleteAllModalOpen(false)}
                disabled={isDeletingAll}
                className="text-xs h-9"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmDeleteAll}
                disabled={isDeletingAll}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-9 gap-1.5"
              >
                {isDeletingAll ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting All...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" /> Confirm Delete All
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
