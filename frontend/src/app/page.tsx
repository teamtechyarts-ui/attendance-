'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { LoadingState } from '@/components/ui/loading-state';

export default function HomePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace('/login');
      } else if (user.role === 'SUPER_ADMIN' || user.appRole === 'SUPER_ADMIN') {
        router.replace('/admin/dashboard');
      } else {
        router.replace('/dashboard');
      }
    }
  }, [user, isLoading, router]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <LoadingState message="Connecting to workspace..." />
    </div>
  );
}
