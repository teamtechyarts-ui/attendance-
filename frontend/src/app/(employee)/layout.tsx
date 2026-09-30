'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { LoadingState } from '@/components/ui/loading-state';

export default function EmployeeLayout({
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
        // Super Admin gets Super Admin View ONLY. Redirect away from Employee View.
        router.replace('/admin/dashboard');
      }
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <LoadingState message="Loading employee workspace..." />
      </div>
    );
  }

  if (isSuperAdmin(user)) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <LoadingState message="Super Admin: Redirecting to Admin View..." />
      </div>
    );
  }

  return <>{children}</>;
}
