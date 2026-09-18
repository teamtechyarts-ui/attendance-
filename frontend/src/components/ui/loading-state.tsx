import React from 'react';
import { cn } from '@/lib/utils';

export function LoadingState({ message = 'Loading...', className }: { message?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center p-12 text-center space-y-3', className)}>
      <div className="w-8 h-8 rounded-full border-2 border-neutral-200 border-t-black animate-spin" />
      <p className="text-xs text-neutral-500 font-medium">{message}</p>
    </div>
  );
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-neutral-100', className)} {...props} />;
}
