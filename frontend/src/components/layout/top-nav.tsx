'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useTaskTimer } from '@/hooks/use-task-timer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckInModal } from '@/components/attendance/check-in-modal';
import { NotificationPopover } from '@/components/notifications/notification-popover';
import { formatSecondsToTime } from '@/lib/utils';
import { isSuperAdmin, isLimitedAdmin, getPermittedAdminModules } from '@/lib/permissions';
import { useCollaboration } from '@/hooks/use-collaboration';
import { PresenceSelector } from '@/components/collaboration/presence-selector';
import {
  Briefcase,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  Pause,
  Play,
  Square,
  User,
  Users,
  X,
  CreditCard,
  Settings,
  Bell,
  BarChart2,
  FolderKanban,
  UserCheck,
  ShieldAlert,
  ArrowRight,
  Check,
  LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  Home,
  Briefcase,
  Calendar,
  Clock,
  FileText,
  CreditCard,
  Settings,
  BarChart2,
  FolderKanban,
  Users,
  UserCheck,
  MessageSquare,
};

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, accessMode, todayAttendance, isAttendanceLoading, isAttendanceResolved, logout } = useAuth();
  const { activeTimer, elapsedSeconds, startTimer, pauseTimer, stopTimer } = useTaskTimer();
  const { presence, setUserStatus, totalUnreadCount } = useCollaboration();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const isPublicRoute = pathname === '/login' || pathname === '/forgot-password' || pathname === '/reset-password';
  if (isPublicRoute) return null;

  const superAdmin = isSuperAdmin(user);
  const limitedAdmin = isLimitedAdmin(user);

  const isInAdminView = pathname.startsWith('/admin-view');
  const isInSuperAdminView = pathname.startsWith('/admin') && !isInAdminView;
  const isInEmployeeView = !isInAdminView && !isInSuperAdminView;

  // Base Employee Navigation (Includes People and Chat)
  const baseEmployeeNav = [
    { label: 'Home', href: '/dashboard', icon: Home },
    { label: 'People', href: '/people', icon: Users },
    { label: 'Chat', href: '/chat', icon: MessageSquare, badge: totalUnreadCount },
    { label: 'Tasks', href: '/tasks', icon: Briefcase },
    { label: 'Calendar', href: '/calendar', icon: Calendar },
    { label: 'Attendance', href: '/attendance', icon: Clock },
    { label: 'Leave', href: '/leave', icon: Calendar },
    { label: 'Reports', href: '/reports', icon: FileText },
    { label: 'ID Card', href: '/id-card', icon: CreditCard },
  ];

  // Super Admin Navigation
  const superAdminNav = [
    { label: 'Overview', href: '/admin/dashboard', icon: BarChart2 },
    { label: 'People', href: '/admin/employees', icon: Users },
    { label: 'Chat', href: '/chat', icon: MessageSquare, badge: totalUnreadCount },
    { label: 'Work', href: '/admin/tasks', icon: Briefcase },
    { label: 'Attendance', href: '/admin/attendance', icon: Clock },
    { label: 'Leave', href: '/admin/leave', icon: Calendar },
    { label: 'Reviews', href: '/admin/feedback', icon: MessageSquare },
    { label: 'Reports', href: '/admin/reports', icon: FileText },
    { label: 'Calendar', href: '/admin/calendar', icon: Calendar },
    { label: 'Settings', href: '/admin/settings', icon: Settings },
  ];

  // Limited Admin Navigation (Dynamic based on permissions)
  const permittedModules = getPermittedAdminModules(user);
  const limitedAdminNav = [
    ...permittedModules.map((mod) => ({
      label: mod.label,
      href: mod.href,
      icon: ICON_MAP[mod.iconName] || Briefcase,
      badge: 0,
    })),
    { label: 'Chat', href: '/chat', icon: MessageSquare, badge: totalUnreadCount },
  ];

  let navItems = baseEmployeeNav;
  let logoHref = '/dashboard';

  if (superAdmin || isInSuperAdminView) {
    navItems = superAdminNav;
    logoHref = '/admin/dashboard';
  } else if (limitedAdmin && isInAdminView) {
    navItems = limitedAdminNav;
    logoHref = '/admin-view';
  }

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="w-full max-w-[1600px] 2xl:max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          {/* Logo & Desktop Nav */}
          <div className="flex items-center gap-8">
            <Link href={logoHref} className="flex items-center gap-2.5">
              <img
                src="/images/logo.png"
                alt="TeamsTechyArts"
                className="h-7 w-auto object-contain"
              />
              <span className="font-extrabold text-sm tracking-tight text-neutral-900">
                Teams<span className="text-neutral-400 font-normal">TechyArts</span>
              </span>
              {isInAdminView && (
                <Badge variant="secondary" className="hidden md:inline-flex text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-neutral-100 text-neutral-800 border-neutral-300">
                  Limited Admin
                </Badge>
              )}
            </Link>

            {/* Desktop Nav Items */}
            <nav className="hidden lg:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isExactRoot = item.href === '/dashboard' || item.href === '/admin/dashboard' || item.href === '/admin-view';
                const isActive = isExactRoot ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/');
                const badge = (item as any).badge || 0;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold tracking-tight transition-colors relative ${
                      isActive
                        ? 'bg-neutral-100 text-black font-bold'
                        : 'text-neutral-600 hover:text-black hover:bg-neutral-50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {item.label}
                    {badge > 0 && (
                      <span className="h-4 min-w-[16px] px-1 rounded-full bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center">
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live Presence Status Selector */}
            <div className="hidden sm:block">
              <PresenceSelector presence={presence} onStatusChange={setUserStatus} />
            </div>

            {/* Live Task Timer Bar (Works seamlessly across all views) */}
            {activeTimer && activeTimer.taskId && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-900 text-white text-xs border border-neutral-800 shadow-sm animate-in fade-in">
                {activeTimer.isActive ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                )}
                <span className="font-mono font-bold tracking-wider">{formatSecondsToTime(elapsedSeconds)}</span>
                <span className="text-neutral-400 text-[11px] max-w-[120px] truncate">{activeTimer.task?.title || 'Task Timer'}</span>
                <div className="flex items-center gap-1 ml-1 pl-1 border-l border-neutral-700">
                  {activeTimer.isActive ? (
                    <button
                      onClick={() => pauseTimer(activeTimer.taskId)}
                      aria-label="Pause Timer"
                      className="p-1 hover:text-amber-400 transition-colors"
                    >
                      <Pause className="w-3 h-3" />
                    </button>
                  ) : (
                    <button
                      onClick={() => startTimer(activeTimer.taskId)}
                      aria-label="Resume Timer"
                      className="p-1 hover:text-emerald-400 transition-colors"
                    >
                      <Play className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={() => stopTimer(activeTimer.taskId)}
                    aria-label="Complete Task"
                    className="p-1 hover:text-emerald-400 transition-colors"
                  >
                    <Square className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {/* Attendance Quick Badge for Employee / Limited Admin */}
            {!superAdmin && !isInSuperAdminView && isAttendanceResolved && (
              <>
                {todayAttendance && todayAttendance.checkInAt ? (
                  <Badge variant="success" className="hidden sm:inline-flex gap-1 text-[11px] font-semibold">
                    <CheckCircle className="w-3 h-3" />
                    {todayAttendance.workMode}
                  </Badge>
                ) : (
                  <Button
                    onClick={() => setIsCheckInOpen(true)}
                    size="sm"
                    className="hidden sm:inline-flex text-xs h-8 bg-neutral-900 hover:bg-black text-white gap-1"
                  >
                    <Clock className="w-3 h-3" />
                    Check In
                  </Button>
                )}
              </>
            )}

            {/* Notifications Popover */}
            <NotificationPopover />

            {/* User Profile & Menu */}
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 p-1 rounded-md hover:bg-neutral-100 transition-colors"
                aria-label="User menu"
              >
                <div className="w-7 h-7 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-xs">
                  {user?.displayName ? (
                    user.displayName.charAt(0).toUpperCase()
                  ) : (
                    <User className="w-3.5 h-3.5 text-neutral-300" />
                  )}
                </div>
                <span className="hidden md:inline text-xs font-semibold text-neutral-800 tracking-tight">
                  {user?.displayName || user?.email || 'Account'}
                </span>
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-md border border-neutral-200 bg-white p-1.5 shadow-lg z-50 text-xs animate-in fade-in zoom-in-95">
                  <div className="px-3 py-2 border-b border-neutral-100">
                    <p className="font-bold text-neutral-900 truncate">{user?.displayName || 'User'}</p>
                    <p className="text-neutral-500 text-[11px] truncate">{user?.email || ''}</p>
                    <Badge variant="secondary" className="mt-1.5 text-[10px] font-bold">
                      {superAdmin ? 'SUPER ADMIN' : limitedAdmin ? 'LIMITED ADMIN' : 'EMPLOYEE'}
                    </Badge>
                  </div>

                  <div className="py-1">
                    {/* My Profile */}
                    <Link
                      href="/profile"
                      onClick={() => setIsUserMenuOpen(false)}
                      className="flex items-center justify-between px-3 py-2 rounded text-neutral-700 hover:bg-neutral-100 hover:text-black transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-neutral-500" />
                        <span>My Profile</span>
                      </div>
                    </Link>

                    {/* Employee View: Available for Normal Employee and Limited Admin ONLY (Super Admin never gets Employee View) */}
                    {!superAdmin && (
                      <Link
                        href="/dashboard"
                        onClick={() => setIsUserMenuOpen(false)}
                        className={`flex items-center justify-between px-3 py-2 rounded transition-colors ${
                          isInEmployeeView
                            ? 'bg-neutral-100 text-neutral-900 font-semibold'
                            : 'text-neutral-700 hover:bg-neutral-100 hover:text-black'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Home className="w-3.5 h-3.5 text-neutral-500" />
                          <span>Employee View</span>
                        </div>
                        {isInEmployeeView ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                        ) : (
                          <ArrowRight className="w-3 h-3 text-neutral-400" />
                        )}
                      </Link>
                    )}

                    {/* Limited Admin View: Available ONLY for Limited Admin (Never for Super Admin or normal Employee) */}
                    {!superAdmin && limitedAdmin && (
                      <Link
                        href="/admin-view"
                        onClick={() => setIsUserMenuOpen(false)}
                        className={`flex items-center justify-between px-3 py-2 rounded transition-colors ${
                          isInAdminView
                            ? 'bg-neutral-100 text-neutral-900 font-semibold'
                            : 'text-neutral-700 hover:bg-neutral-100 hover:text-black'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <BarChart2 className="w-3.5 h-3.5 text-neutral-500" />
                          <span>Limited Admin View</span>
                        </div>
                        {isInAdminView ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                        ) : (
                          <ArrowRight className="w-3 h-3 text-neutral-400" />
                        )}
                      </Link>
                    )}

                    {/* Super Admin Dashboard Link: Available ONLY for Super Admin */}
                    {superAdmin && (
                      <Link
                        href="/admin/dashboard"
                        onClick={() => setIsUserMenuOpen(false)}
                        className={`flex items-center justify-between px-3 py-2 rounded transition-colors ${
                          isInSuperAdminView
                            ? 'bg-neutral-100 text-neutral-900 font-semibold'
                            : 'text-neutral-700 hover:bg-neutral-100 hover:text-black'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <BarChart2 className="w-3.5 h-3.5 text-neutral-500" />
                          <span>Super Admin View</span>
                        </div>
                        {isInSuperAdminView ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                        ) : (
                          <ArrowRight className="w-3 h-3 text-neutral-400" />
                        )}
                      </Link>
                    )}
                  </div>

                  <div className="pt-1 border-t border-neutral-100">
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        logout();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 rounded text-rose-600 hover:bg-rose-50 transition-colors font-semibold"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 rounded-md text-neutral-600 hover:text-black hover:bg-neutral-100"
              aria-label="Toggle Navigation"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-neutral-200 bg-white px-4 py-3 space-y-2 animate-in slide-in-from-top-2">
            <div className="pb-2 border-b border-neutral-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-500">Your Presence</span>
              <PresenceSelector presence={presence} onStatusChange={setUserStatus} />
            </div>

            <div className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== '/dashboard' && item.href !== '/admin/dashboard' && item.href !== '/admin-view' && pathname.startsWith(item.href));
                const badge = (item as any).badge || 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-md text-xs font-semibold ${
                      isActive ? 'bg-black text-white' : 'text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </div>
                    {badge > 0 && (
                      <span className={`h-4 min-w-[16px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                        isActive ? 'bg-white text-black' : 'bg-neutral-900 text-white'
                      }`}>
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
            {!superAdmin && !isInSuperAdminView && isAttendanceResolved && !todayAttendance?.checkInAt && (
              <div className="pt-2">
                <Button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setIsCheckInOpen(true);
                  }}
                  className="w-full text-xs"
                >
                  <Clock className="w-3.5 h-3.5 mr-1" />
                  Mark Attendance
                </Button>
              </div>
            )}
          </div>
        )}
      </header>

      <CheckInModal isOpen={isCheckInOpen} onClose={() => setIsCheckInOpen(false)} />
    </>
  );
}
