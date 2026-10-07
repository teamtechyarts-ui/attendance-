'use client';

import React from 'react';
import { UserPresenceStatus } from '@/types';

interface PresenceBadgeProps {
  status: UserPresenceStatus | string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export function PresenceBadge({
  status,
  size = 'md',
  showLabel = false,
  className = '',
}: PresenceBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'AVAILABLE':
        return {
          dotBg: 'bg-emerald-500',
          ringColor: 'ring-emerald-500/20',
          label: 'Available',
          textColor: 'text-emerald-700 dark:text-emerald-400',
          badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50',
        };
      case 'BUSY':
        return {
          dotBg: 'bg-rose-500',
          ringColor: 'ring-rose-500/20',
          label: 'Busy',
          textColor: 'text-rose-700 dark:text-rose-400',
          badgeBg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/50',
        };
      case 'DO_NOT_DISTURB':
        return {
          dotBg: 'bg-red-600',
          ringColor: 'ring-red-600/20',
          label: 'Do not disturb',
          textColor: 'text-red-700 dark:text-red-400',
          badgeBg: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/50',
        };
      case 'AWAY':
        return {
          dotBg: 'bg-amber-500',
          ringColor: 'ring-amber-500/20',
          label: 'Away',
          textColor: 'text-amber-700 dark:text-amber-400',
          badgeBg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/50',
        };
      case 'OFFLINE':
      default:
        return {
          dotBg: 'bg-zinc-400 dark:bg-zinc-500',
          ringColor: 'ring-zinc-400/20',
          label: 'Offline',
          textColor: 'text-zinc-600 dark:text-zinc-400',
          badgeBg: 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800',
        };
    }
  };

  const config = getStatusConfig();

  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-2.5 w-2.5',
    lg: 'h-3 w-3',
  };

  if (showLabel) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${config.badgeBg} ${config.textColor} ${className}`}
      >
        <span className={`rounded-full ${sizeClasses[size]} ${config.dotBg}`} />
        <span>{config.label}</span>
      </span>
    );
  }

  return (
    <span
      title={config.label}
      className={`relative inline-block rounded-full ${sizeClasses[size]} ${config.dotBg} ring-2 ring-white dark:ring-zinc-900 ${className}`}
    />
  );
}
