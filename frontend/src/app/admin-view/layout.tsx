'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { isSuperAdmin, isLimitedAdmin } from '@/lib/permissions';
import { LoadingState } from '@/components/ui/loading-state';

export default function LimitedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace('/login');
      } else if (isSuperAdmin(user)) {
        // Super Admin uses Super Admin View ONLY
        router.replace('/admin/dashboard');
      } else if (!isLimitedAdmin(user)) {
        // Normal employee with zero admin permissions cannot access /admin-view
        router.replace('/dashboard');
      }
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <LoadingState message="Verifying administrative credentials..." />
      </div>
    );
  }

  if (isSuperAdmin(user)) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <LoadingState message="Redirecting to Super Admin View..." />
      </div>
    );
  }

  if (!isLimitedAdmin(user)) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <LoadingState message="Redirecting to employee dashboard..." />
      </div>
    );
  }

  return (
    <div className="w-full animate-in fade-in">
      {children}
    </div>
  );
}
