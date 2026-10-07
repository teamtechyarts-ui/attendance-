'use client';

import React, { useEffect, useRef } from 'react';
import { useCall } from '@/hooks/use-collaboration';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  AlertCircle,
  Loader2,
} from 'lucide-react';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const mm = mins.toString().padStart(2, '0');
  const ss = secs.toString().padStart(2, '0');
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs.toString().padStart(2, '0')}:${remMins.toString().padStart(2, '0')}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function CallOverlay() {
  const {
    callState,
    activeCall,
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    callDuration,
    callError,
    screenShareState,
    screenStream,
    screenSharerUserId,
    screenSharerName,
    screenShareError,
    isSharingScreen,
    acceptCall,
    rejectCall,
    cancelCall,
    endCall,
    toggleMute,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
  } = useCall();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // Attach local stream to local video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, callState]);

  // Attach screen stream to screen video element
  useEffect(() => {
    if (screenVideoRef.current && screenStream) {
      screenVideoRef.current.srcObject = screenStream;
    }
  }, [screenStream, isSharingScreen]);

  // Attach remote stream to remote video / audio elements
  useEffect(() => {
    if (remoteStream) {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
      }
    }
  }, [remoteStream, callState]);

  if (callState === 'IDLE') return null;

  const isVideo = activeCall?.callType === 'VIDEO';
  const otherName = activeCall?.isInitiator
    ? (activeCall.otherUserName || 'Colleague')
    : (activeCall?.callerName || activeCall?.otherUserName || 'Colleague');
  const otherAvatar = activeCall?.isInitiator
    ? (activeCall.otherUserAvatar || null)
    : (activeCall?.callerAvatar || activeCall?.otherUserAvatar || null);
  const initials = otherName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // ==========================================
  // Mode A: INCOMING CALL PROMPT
  // ==========================================
  if (callState === 'INCOMING_RINGING') {
    return (
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 text-white shadow-2xl p-6 flex flex-col items-center text-center space-y-5 animate-in zoom-in-95 duration-200">
          {/* Avatar with Ringing Animation */}
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
            {otherAvatar ? (
              <img
                src={otherAvatar}
                alt={otherName}
                className="relative h-20 w-20 rounded-full object-cover border-2 border-emerald-500 shadow-md"
              />
            ) : (
              <div className="relative h-20 w-20 rounded-full bg-zinc-800 border-2 border-emerald-500 flex items-center justify-center text-xl font-bold text-white shadow-md">
                {initials}
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow">
              {isVideo ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
            </div>
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-bold text-zinc-100">{otherName}</h3>
            <p className="text-xs font-medium text-emerald-400 flex items-center justify-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Incoming {isVideo ? 'video' : 'audio'} call…
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-4 w-full justify-center pt-2">
            <button
              type="button"
              onClick={rejectCall}
              className="flex-1 py-3 px-4 rounded-xl bg-red-600/90 hover:bg-red-600 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg"
              aria-label="Decline call"
            >
              <PhoneOff className="h-4 w-4" />
              <span>Decline</span>
            </button>

            <button
              type="button"
              onClick={acceptCall}
              className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg"
              aria-label="Accept call"
            >
              {isVideo ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
              <span>Accept</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // Mode B: OUTGOING & ACTIVE CALL OVERLAY
  // ==========================================
  const getStatusLabel = () => {
    switch (callState) {
      case 'OUTGOING_CALLING':
        return 'Calling…';
      case 'OUTGOING_RINGING':
        return 'Ringing…';
      case 'CONNECTING':
        return 'Connecting…';
      case 'CONNECTED':
        return formatDuration(callDuration);
      case 'ENDING':
      case 'ENDED':
        return 'Call ended';
      case 'REJECTED':
        return 'Call declined';
      case 'CANCELLED':
        return 'Call cancelled';
      case 'MISSED':
        return 'No answer';
      case 'FAILED':
        return callError || 'Connection failed';
      default:
        return '';
    }
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/75 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200">
      {/* Hidden audio element for remote audio track */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div className="w-full max-w-3xl h-[85vh] max-h-[640px] rounded-2xl bg-zinc-950 border border-zinc-800 text-white shadow-2xl flex flex-col overflow-hidden relative">
        {/* Top Header */}
        <div className="h-14 px-4 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {otherAvatar ? (
              <img
                src={otherAvatar}
                alt={otherName}
                className="h-8 w-8 rounded-full object-cover border border-zinc-700"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300">
                {initials}
              </div>
            )}
            <div>
              <h4 className="text-sm font-semibold text-zinc-100">{otherName}</h4>
              <p className="text-[11px] text-zinc-400 font-mono flex items-center gap-1.5">
                {callState === 'CONNECTED' && (
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
                {getStatusLabel()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-[10px] font-semibold tracking-wide uppercase text-zinc-300">
              {isVideo ? 'Video Call' : 'Audio Call'}
            </span>
          </div>
        </div>

        {/* Error Banner */}
        {(callError || screenShareError) && (
          <div className="bg-red-950/80 border-b border-red-800 px-4 py-2 text-xs text-red-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{callError || screenShareError}</span>
            </div>
          </div>
        )}

        {/* Screen Sharing Active Banner */}
        {callState === 'CONNECTED' && (isSharingScreen || (screenSharerUserId && !isSharingScreen)) && (
          <div className="bg-blue-950/80 border-b border-blue-800 px-4 py-2 text-xs text-blue-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-blue-400 animate-pulse" />
              <span className="font-semibold">
                {isSharingScreen ? "You're sharing your screen" : `${otherName} is sharing their screen`}
              </span>
            </div>
            {isSharingScreen && (
              <button
                type="button"
                onClick={stopScreenShare}
                className="px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-500 text-white text-[11px] font-semibold transition-colors"
              >
                Stop Sharing
              </button>
            )}
          </div>
        )}

        {/* Main Media Body */}
        <div className="flex-1 relative bg-zinc-950 flex items-center justify-center overflow-hidden">
          {/* If Local User is Sharing Screen */}
          {isSharingScreen && screenStream ? (
            <div className="w-full h-full relative flex items-center justify-center">
              <video
                ref={screenVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain bg-black"
              />

              {/* Picture-in-Picture Local Camera */}
              <div className="absolute bottom-4 right-4 w-32 h-24 sm:w-44 sm:h-32 rounded-xl overflow-hidden border-2 border-zinc-800 bg-zinc-900 shadow-2xl z-20">
                {isCameraOff ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-zinc-500 text-[10px] gap-1">
                    <VideoOff className="h-5 w-5" />
                    <span>Camera Off</span>
                  </div>
                ) : (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                )}
                {isMuted && (
                  <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-red-600 flex items-center justify-center text-white">
                    <MicOff className="h-3 w-3" />
                  </div>
                )}
              </div>
            </div>
          ) : isVideo || (screenSharerUserId && !isSharingScreen) ? (
            <div className="w-full h-full relative flex items-center justify-center">
              {/* Remote Video / Screen Stream */}
              {callState === 'CONNECTED' && remoteStream ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain bg-black"
                />
              ) : (
                <div className="flex flex-col items-center space-y-4">
                  <div className="relative">
                    {callState !== 'CONNECTED' && (
                      <div className="absolute inset-0 rounded-full bg-zinc-800 animate-ping opacity-50" />
                    )}
                    {otherAvatar ? (
                      <img
                        src={otherAvatar}
                        alt={otherName}
                        className="relative h-24 w-24 rounded-full object-cover border-2 border-zinc-700"
                      />
                    ) : (
                      <div className="relative h-24 w-24 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center text-2xl font-bold text-zinc-200">
                        {initials}
                      </div>
                    )}
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-semibold text-zinc-200">{otherName}</p>
                    <p className="text-xs text-zinc-400">{getStatusLabel()}</p>
                  </div>
                </div>
              )}

              {/* Local Video Stream Picture-in-Picture */}
              <div className="absolute bottom-4 right-4 w-32 h-24 sm:w-44 sm:h-32 rounded-xl overflow-hidden border-2 border-zinc-800 bg-zinc-900 shadow-2xl z-20">
                {isCameraOff ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-zinc-500 text-[10px] gap-1">
                    <VideoOff className="h-5 w-5" />
                    <span>Camera Off</span>
                  </div>
                ) : (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                )}
                {isMuted && (
                  <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-red-600 flex items-center justify-center text-white">
                    <MicOff className="h-3 w-3" />
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Audio Call View */
            <div className="flex flex-col items-center space-y-6">
              <div className="relative">
                {callState === 'CONNECTED' ? (
                  <div className="absolute -inset-2 rounded-full bg-emerald-500/20 animate-pulse" />
                ) : (
                  <div className="absolute inset-0 rounded-full bg-zinc-800 animate-ping opacity-40" />
                )}
                {otherAvatar ? (
                  <img
                    src={otherAvatar}
                    alt={otherName}
                    className="relative h-28 w-28 rounded-full object-cover border-2 border-zinc-700 shadow-xl"
                  />
                ) : (
                  <div className="relative h-28 w-28 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center text-3xl font-bold text-zinc-200 shadow-xl">
                    {initials}
                  </div>
                )}
              </div>

              <div className="text-center space-y-2">
                <h3 className="text-lg font-bold text-zinc-100">{otherName}</h3>
                <p className="text-sm font-mono text-zinc-400">{getStatusLabel()}</p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Controls Bar */}
        <div className="h-20 bg-zinc-900 border-t border-zinc-800 flex items-center justify-center gap-3 sm:gap-5 px-4 shrink-0">
          {/* Mute Button */}
          <button
            type="button"
            onClick={toggleMute}
            disabled={callState !== 'CONNECTED' && callState !== 'OUTGOING_CALLING' && callState !== 'OUTGOING_RINGING'}
            className={`h-12 w-12 rounded-full flex items-center justify-center transition-all disabled:opacity-40 shadow-md ${
              isMuted
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
            }`}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>

          {/* Camera Button (Video Call Only) */}
          {isVideo && (
            <button
              type="button"
              onClick={toggleCamera}
              disabled={callState !== 'CONNECTED' && callState !== 'OUTGOING_CALLING' && callState !== 'OUTGOING_RINGING'}
              className={`h-12 w-12 rounded-full flex items-center justify-center transition-all disabled:opacity-40 shadow-md ${
                isCameraOff
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
              }`}
              title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
              aria-label={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
            >
              {isCameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
            </button>
          )}

          {/* Share Screen Button */}
          <button
            type="button"
            onClick={isSharingScreen ? stopScreenShare : startScreenShare}
            disabled={callState !== 'CONNECTED'}
            className={`h-12 w-12 rounded-full flex items-center justify-center transition-all disabled:opacity-40 shadow-md ${
              isSharingScreen
                ? 'bg-blue-600 text-white hover:bg-blue-500'
                : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
            }`}
            title={isSharingScreen ? 'Stop sharing screen' : 'Share screen'}
            aria-label={isSharingScreen ? 'Stop sharing screen' : 'Share screen'}
          >
            {isSharingScreen ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
          </button>

          {/* End / Cancel / Close Call Button */}
          {activeCall?.isInitiator && (callState === 'OUTGOING_CALLING' || callState === 'OUTGOING_RINGING') ? (
            <button
              type="button"
              onClick={cancelCall}
              className="h-12 px-6 rounded-full bg-red-600 hover:bg-red-500 text-white font-semibold text-xs flex items-center gap-2 transition-transform active:scale-95 shadow-lg"
              title="Cancel call"
              aria-label="Cancel call"
            >
              <PhoneOff className="h-5 w-5" />
              <span>Cancel</span>
            </button>
          ) : callState === 'FAILED' || callState === 'REJECTED' || callState === 'CANCELLED' || callState === 'MISSED' || callState === 'ENDED' ? (
            <button
              type="button"
              onClick={endCall}
              className="h-12 px-6 rounded-full bg-zinc-700 hover:bg-zinc-600 text-white font-semibold text-xs flex items-center gap-2 transition-transform active:scale-95 shadow-lg"
              title="Close call"
              aria-label="Close call"
            >
              <PhoneOff className="h-5 w-5" />
              <span>Close</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={endCall}
              className="h-12 px-6 rounded-full bg-red-600 hover:bg-red-500 text-white font-semibold text-xs flex items-center gap-2 transition-transform active:scale-95 shadow-lg"
              title="End call"
              aria-label="End call"
            >
              <PhoneOff className="h-5 w-5" />
              <span>End</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
