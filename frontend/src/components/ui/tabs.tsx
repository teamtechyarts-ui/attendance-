'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  tabs: { id: string; label: string; count?: number; icon?: React.ReactNode }[];
  className?: string;
}

export function Tabs({ value, onValueChange, tabs, className }: TabsProps) {
  return (
    <div className={cn('flex items-center gap-1 border-b border-neutral-200 pb-px overflow-x-auto', className)}>
      {tabs.map((tab) => {
        const isActive = tab.id === value;
        return (
          <button
            key={tab.id}
            onClick={() => onValueChange(tab.id)}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 select-none whitespace-nowrap',
              isActive
                ? 'border-black text-black'
                : 'border-transparent text-neutral-500 hover:text-neutral-900 hover:border-neutral-300'
            )}
          >
            {tab.icon && <span className="w-3.5 h-3.5">{tab.icon}</span>}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold',
                  isActive ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-600'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
