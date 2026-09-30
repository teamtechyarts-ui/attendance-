'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { isSuperAdmin, isLimitedAdmin } from '@/lib/permissions';
import { LoadingState } from '@/components/ui/loading-state';

export default function SuperAdminLayout({
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
      } else if (!isSuperAdmin(user)) {
        if (isLimitedAdmin(user)) {
          router.replace('/admin-view');
        } else {
          router.replace('/dashboard');
        }
      }
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <LoadingState message="Verifying Super Admin access..." />
      </div>
    );
  }

  if (!isSuperAdmin(user)) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <LoadingState message="Redirecting to your authorized view..." />
      </div>
    );
  }

  return <>{children}</>;
}
