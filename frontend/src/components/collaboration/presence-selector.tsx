'use client';

import React, { useState, useRef, useEffect } from 'react';
import { UserPresence, UserPresenceStatus } from '@/types';
import { PresenceBadge } from './presence-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, Edit2 } from 'lucide-react';

interface PresenceSelectorProps {
  presence: UserPresence | null;
  onStatusChange: (status: UserPresenceStatus, customStatusMessage?: string | null) => Promise<void>;
}

const STATUS_OPTIONS: { status: UserPresenceStatus; label: string; desc: string }[] = [
  { status: 'AVAILABLE', label: 'Available', desc: 'Ready to collaborate' },
  { status: 'BUSY', label: 'Busy', desc: 'In meetings or focused' },
  { status: 'DO_NOT_DISTURB', label: 'Do not disturb', desc: 'Only urgent alerts' },
  { status: 'AWAY', label: 'Appear away', desc: 'Temporarily stepped out' },
  { status: 'OFFLINE', label: 'Appear offline', desc: 'Invisible to others' },
];

export function PresenceSelector({ presence, onStatusChange }: PresenceSelectorProps) {
  const currentStatus = presence?.status || 'AVAILABLE';
  const [isOpen, setIsOpen] = useState(false);
  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const [customMessage, setCustomMessage] = useState(presence?.customStatusMessage || '');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsEditingMessage(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectStatus = async (status: UserPresenceStatus) => {
    await onStatusChange(status, customMessage || null);
    setIsOpen(false);
  };

  const handleSaveMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    await onStatusChange(currentStatus, customMessage.trim() || null);
    setIsEditingMessage(false);
  };

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Presence status"
        className="flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/80 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors focus:outline-none"
      >
        <PresenceBadge status={currentStatus} size="sm" />
        <span className="capitalize font-semibold text-neutral-800 dark:text-neutral-200">
          {currentStatus.toLowerCase().replace(/_/g, ' ')}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-2 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2 py-1 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
            Set Presence
          </div>
          <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />

          <div className="space-y-0.5">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.status}
                type="button"
                onClick={() => handleSelectStatus(opt.status)}
                className="w-full flex items-center justify-between p-2 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg text-left transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <PresenceBadge status={opt.status} size="md" />
                  <div>
                    <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      {opt.label}
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 font-normal">
                      {opt.desc}
                    </div>
                  </div>
                </div>
                {currentStatus === opt.status && (
                  <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                )}
              </button>
            ))}
          </div>

          <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />

          <div className="p-1">
            {isEditingMessage ? (
              <form onSubmit={handleSaveMessage} className="space-y-2">
                <Input
                  type="text"
                  placeholder="What's your status?"
                  value={customMessage}
                  maxLength={100}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  className="h-8 text-xs"
                  autoFocus
                />
                <div className="flex items-center justify-end gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => setIsEditingMessage(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" className="h-7 text-xs px-2">
                    Save
                  </Button>
                </div>
              </form>
            ) : (
              <div
                onClick={() => setIsEditingMessage(true)}
                className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400 p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              >
                <span className="truncate text-[11px]">
                  {presence?.customStatusMessage
                    ? `"${presence.customStatusMessage}"`
                    : 'Set custom status message...'}
                </span>
                <Edit2 className="h-3 w-3 shrink-0 ml-1 text-neutral-400" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
