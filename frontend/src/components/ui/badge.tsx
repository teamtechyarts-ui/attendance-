import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'danger' | 'info';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'bg-black text-white',
    secondary: 'bg-neutral-100 text-neutral-800 border border-neutral-200',
    outline: 'text-neutral-900 border border-neutral-300 bg-white',
    success: 'bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium',
    warning: 'bg-amber-50 text-amber-800 border border-amber-200 font-medium',
    danger: 'bg-rose-50 text-rose-800 border border-rose-200 font-medium',
    info: 'bg-blue-50 text-blue-800 border border-blue-200 font-medium',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider transition-colors',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
