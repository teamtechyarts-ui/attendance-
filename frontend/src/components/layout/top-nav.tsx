'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useTaskTimer } from '@/hooks/use-task-timer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckInModal } from '@/components/attendance/check-in-modal';
import { formatSecondsToTime } from '@/lib/utils';
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
} from 'lucide-react';

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, accessMode, todayAttendance, logout } = useAuth();
  const { activeTimer, elapsedSeconds, pauseTimer, stopTimer } = useTaskTimer();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  if (!user) return null;

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  // Navigation Items
  const employeeNav = [
    { label: 'Home', href: '/dashboard', icon: Home },
    { label: 'Tasks', href: '/tasks', icon: Briefcase },
    { label: 'Calendar', href: '/calendar', icon: Calendar },
    { label: 'Attendance', href: '/attendance', icon: Clock },
    { label: 'Leave', href: '/leave', icon: Calendar },
    { label: 'Reports', href: '/reports', icon: FileText },
    { label: 'ID Card', href: '/id-card', icon: CreditCard },
  ];

  const adminNav = [
    { label: 'Overview', href: '/admin/dashboard', icon: BarChart2 },
    { label: 'People', href: '/admin/employees', icon: Users },
    { label: 'Work', href: '/admin/tasks', icon: Briefcase },
    { label: 'Attendance', href: '/admin/attendance', icon: Clock },
    { label: 'Leave', href: '/admin/leave', icon: Calendar },
    { label: 'Reviews', href: '/admin/feedback', icon: MessageSquare },
    { label: 'Reports', href: '/admin/reports', icon: FileText },
    { label: 'Calendar', href: '/admin/calendar', icon: Calendar },
    { label: 'Settings', href: '/admin/settings', icon: Settings },
  ];

  const navItems = isAdmin ? adminNav : employeeNav;

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          {/* Logo & Desktop Nav */}
          <div className="flex items-center gap-8">
            <Link href={isAdmin ? '/admin/dashboard' : '/dashboard'} className="flex items-center gap-2.5">
              <img
                src="/images/logo.png"
                alt="TeamsTechyArts"
                className="h-7 w-auto object-contain"
              />
              <span className="font-extrabold text-sm tracking-tight text-neutral-900">
                Teams<span className="text-neutral-400 font-normal">TechyArts</span>
              </span>
            </Link>

            {/* Desktop Nav Items */}
            <nav className="hidden lg:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== '/dashboard' && item.href !== '/admin/dashboard' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold tracking-tight transition-colors ${
                      isActive
                        ? 'bg-neutral-100 text-black font-bold'
                        : 'text-neutral-600 hover:text-black hover:bg-neutral-50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-3">
            {/* Live Task Timer Bar (if active) */}
            {activeTimer && activeTimer.isActive && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-900 text-white text-xs border border-neutral-800 shadow-sm animate-in fade-in">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="font-mono font-bold tracking-wider">{formatSecondsToTime(elapsedSeconds)}</span>
                <span className="text-neutral-400 text-[11px] max-w-[120px] truncate">{activeTimer.task?.title || 'Task Timer'}</span>
                <div className="flex items-center gap-1 ml-1 pl-1 border-l border-neutral-700">
                  <button
                    onClick={() => pauseTimer(activeTimer.taskId)}
                    aria-label="Pause Timer"
                    className="p-1 hover:text-amber-400 transition-colors"
                  >
                    <Pause className="w-3 h-3" />
                  </button>
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

            {/* Attendance Quick Badge */}
            {!isAdmin && (
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

            {/* Notifications link */}
            <Link
              href="/notifications"
              className="p-1.5 rounded-md text-neutral-600 hover:text-black hover:bg-neutral-100 transition-colors relative"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
            </Link>

            {/* User Profile & Menu */}
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 p-1 rounded-md hover:bg-neutral-100 transition-colors"
                aria-label="User menu"
              >
                <div className="w-7 h-7 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-xs">
                  {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                </div>
                <span className="hidden md:inline text-xs font-semibold text-neutral-800 tracking-tight">
                  {user.displayName || user.email}
                </span>
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-md border border-neutral-200 bg-white p-1.5 shadow-lg z-50 text-xs">
                  <div className="px-3 py-2 border-b border-neutral-100">
                    <p className="font-bold text-neutral-900 truncate">{user.displayName}</p>
                    <p className="text-neutral-500 text-[11px] truncate">{user.email}</p>
                    <Badge variant="secondary" className="mt-1.5 text-[10px]">
                      {user.role}
                    </Badge>
                  </div>
                  <div className="py-1">
                    <Link
                      href="/profile"
                      onClick={() => setIsUserMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded text-neutral-700 hover:bg-neutral-100 hover:text-black transition-colors"
                    >
                      <User className="w-3.5 h-3.5" />
                      My Profile
                    </Link>
                    {isAdmin ? (
                      <Link
                        href="/dashboard"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded text-neutral-700 hover:bg-neutral-100 hover:text-black transition-colors"
                      >
                        <Home className="w-3.5 h-3.5" />
                        Employee View
                      </Link>
                    ) : null}
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
          <div className="lg:hidden border-t border-neutral-200 bg-white px-4 py-3 space-y-1 animate-in slide-in-from-top-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-semibold ${
                    isActive ? 'bg-black text-white' : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
            {!isAdmin && !todayAttendance?.checkInAt && (
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
