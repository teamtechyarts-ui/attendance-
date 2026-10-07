'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { hasPermission, isSuperAdmin } from '@/lib/permissions';
import { LoadingState } from '@/components/ui/loading-state';

export default function CollaborationLayout({
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
      } else if (!isSuperAdmin(user) && !hasPermission(user, 'CHAT_VIEW')) {
        router.replace('/dashboard');
      }
    }
  }, [user, isLoading, router]);

  if (isLoading && !user) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <LoadingState message="Loading collaboration workspace..." />
      </div>
    );
  }

  if (!user && !isLoading) {
    return null;
  }

  if (!isSuperAdmin(user) && !hasPermission(user, 'CHAT_VIEW')) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-center p-8">
        <div className="max-w-md space-y-2">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">Access Denied</h2>
          <p className="text-xs text-neutral-500">
            You do not have permission to view collaboration and chat.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
