'use client';

import React from 'react';
import { useMeeting, useCall } from '@/hooks/use-collaboration';
import { Users, X, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function IncomingMeetingPrompt() {
  const { incomingMeeting, openMeetingLobby, dismissIncomingMeeting, meetingState } = useMeeting();
  const { callState } = useCall();

  // If already in meeting or in active 1:1 call, or no incoming meeting, do not render
  if (!incomingMeeting || incomingMeeting.isDismissed || meetingState !== 'IDLE' || callState !== 'IDLE') {
    return null;
  }

  const { meeting } = incomingMeeting;

  return (
    <div
      role="region"
      aria-label="Incoming Group Meeting Notification"
      className="fixed top-4 right-4 z-[130] max-w-md w-[calc(100vw-2rem)] bg-zinc-950 border border-zinc-800 text-white rounded-xl shadow-2xl p-4 animate-in slide-in-from-top-4 fade-in duration-300"
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-100 shrink-0">
          <Users className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-zinc-100 truncate">
              {meeting.title || 'Group Meeting'}
            </h4>
            <button
              type="button"
              onClick={dismissIncomingMeeting}
              className="text-zinc-400 hover:text-zinc-200 transition-colors p-1 -mr-1"
              title="Dismiss notification"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="text-xs text-zinc-400 mt-0.5">
            <span className="text-zinc-200 font-medium">{meeting.hostName}</span> started a meeting
          </p>

          <div className="mt-3 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => openMeetingLobby({ type: 'JOIN', conversationId: meeting.conversationId, meetingId: meeting.meetingId, title: meeting.title })}
              className="h-8 text-xs bg-white text-black hover:bg-zinc-200 font-semibold px-4 gap-1.5 shadow"
              aria-label="Join Meeting"
            >
              <Video className="h-3.5 w-3.5" />
              <span>Join Meeting</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={dismissIncomingMeeting}
              className="h-8 text-xs border-zinc-800 text-zinc-300 hover:bg-zinc-900"
              aria-label="Dismiss"
            >
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
