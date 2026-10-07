'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMeeting, useCollaboration } from '@/hooks/use-collaboration';
import { useAuth } from '@/hooks/use-auth';
import { collaborationApi } from '@/lib/api';
import { Message, MeetingParticipantInfo } from '@/types';
import { resolveMessagePreview } from '@/lib/collaboration-utils';
import {
  Users,
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Monitor,
  MonitorOff,
  Crown,
  AlertCircle,
  Loader2,
  X,
  Check,
  Shield,
  WifiOff,
  MessageSquare,
  Send,
  Volume2,
  VolumeX,
  UserX,
  Settings2,
  MoreVertical,
  Activity,
  Wifi,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

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

// Dedicated Remote Participant Video Tile for Group Meeting Stage Grid
function RemoteParticipantGridTile({
  participant,
  stream,
  isHostUser,
  isActiveSpeaker,
  onMute,
  onRemove,
  selectedMenuId,
  setSelectedMenuId,
}: {
  participant: MeetingParticipantInfo;
  stream?: MediaStream;
  isHostUser: boolean;
  isActiveSpeaker: boolean;
  onMute: (userId: string) => void;
  onRemove: (userId: string) => void;
  selectedMenuId: string | null;
  setSelectedMenuId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream, participant.isCameraOff]);

  const hasVideo = Boolean(!participant.isCameraOff && stream);

  return (
    <div
      className={`rounded-xl overflow-hidden bg-zinc-900 border relative flex items-center justify-center shadow-lg transition-all min-h-[160px] ${
        isActiveSpeaker
          ? 'border-emerald-500 ring-2 ring-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
          : 'border-zinc-800'
      }`}
    >
      {/* Remote Video element - always rendered when stream exists so audio plays even if video track is disabled */}
      {stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover ${hasVideo ? 'block' : 'hidden'}`}
        />
      )}

      {!hasVideo && (
        <div className="flex flex-col items-center space-y-2 select-none">
          <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200 font-bold text-xl sm:text-2xl shadow-md">
            {participant.displayName.charAt(0).toUpperCase()}
          </div>
          <span className="text-[11px] font-medium text-zinc-400">
            {participant.isCameraOff ? 'Camera Off' : 'Connecting video…'}
          </span>
        </div>
      )}

      {/* Tile Bottom Bar with Host Moderation Menu */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800/80 select-none">
        <div className="flex items-center gap-1.5 truncate">
          <span className="font-semibold text-zinc-100 truncate">{participant.displayName}</span>
          {participant.role === 'HOST' && (
            <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Host
            </span>
          )}
          {participant.isScreenSharing && (
            <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-0.5">
              <Monitor className="h-2.5 w-2.5" /> Sharing
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {participant.isMuted ? (
            <span className="p-1 rounded bg-red-500/20 text-red-400" title="Muted">
              <MicOff className="h-3.5 w-3.5" />
            </span>
          ) : (
            <span className="p-1 rounded bg-emerald-500/20 text-emerald-400" title="Microphone Active">
              <Mic className="h-3.5 w-3.5" />
            </span>
          )}

          {/* Host Moderation Controls on Tile */}
          {isHostUser && (
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setSelectedMenuId((prev) => (prev === participant.userId ? null : participant.userId))
                }
                className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                aria-label={`Participant actions for ${participant.displayName}`}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>

              {selectedMenuId === participant.userId && (
                <div className="absolute right-0 bottom-full mb-1 w-40 rounded-lg bg-zinc-900 border border-zinc-700 shadow-2xl p-1 z-20 space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      onMute(participant.userId);
                      setSelectedMenuId(null);
                    }}
                    className="w-full text-left px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 rounded flex items-center gap-2"
                  >
                    <MicOff className="h-3.5 w-3.5 text-red-400" />
                    <span>Mute Participant</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onRemove(participant.userId);
                      setSelectedMenuId(null);
                    }}
                    className="w-full text-left px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-950/50 rounded flex items-center gap-2"
                  >
                    <UserX className="h-3.5 w-3.5" />
                    <span>Remove Participant</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Dedicated Remote Participant Video Tile for Horizontal Screen Share Strip
function RemoteParticipantStripTile({
  participant,
  stream,
  isActiveSpeaker,
}: {
  participant: MeetingParticipantInfo;
  stream?: MediaStream;
  isActiveSpeaker: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream, participant.isCameraOff]);

  const hasVideo = Boolean(!participant.isCameraOff && stream);

  return (
    <div
      className={`h-full aspect-video min-w-[140px] rounded-lg overflow-hidden bg-zinc-900 border relative flex items-center justify-center shrink-0 transition-all ${
        isActiveSpeaker ? 'border-emerald-500 ring-2 ring-emerald-500/50' : 'border-zinc-800'
      }`}
    >
      {stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover ${hasVideo ? 'block' : 'hidden'}`}
        />
      )}

      {!hasVideo && (
        <div className="h-9 w-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 font-bold text-xs">
          {participant.displayName.charAt(0).toUpperCase()}
        </div>
      )}

      <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-[10px] bg-black/70 px-1.5 py-0.5 rounded backdrop-blur-sm">
        <span className="truncate max-w-[80px] font-medium text-zinc-200">{participant.displayName}</span>
        {participant.isMuted ? (
          <MicOff className="h-3 w-3 text-red-400 shrink-0" />
        ) : (
          <Mic className="h-3 w-3 text-emerald-400 shrink-0" />
        )}
      </div>
    </div>
  );
}

// Dedicated Remote Screen Share Video Component
function RemoteScreenVideo({
  stream,
  sharerName,
}: {
  stream?: MediaStream;
  sharerName?: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasLiveVideoTrack, setHasLiveVideoTrack] = useState<boolean>(() => {
    return Boolean(stream && stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled));
  });

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !stream) return;

    el.srcObject = stream;
    el.play().catch((err) => console.log('[SCREEN VIDEO] Play pending/autoplay:', err?.message));

    const checkTrackState = () => {
      const live = stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled);
      setHasLiveVideoTrack(live);
      if (el && el.srcObject !== stream) {
        el.srcObject = stream;
      }
      el?.play().catch(() => {});
    };

    checkTrackState();

    stream.addEventListener('addtrack', checkTrackState);
    stream.addEventListener('removetrack', checkTrackState);
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener('unmute', checkTrackState);
      track.addEventListener('mute', checkTrackState);
      track.addEventListener('ended', checkTrackState);
    });

    return () => {
      stream.removeEventListener('addtrack', checkTrackState);
      stream.removeEventListener('removetrack', checkTrackState);
      stream.getVideoTracks().forEach((track) => {
        track.removeEventListener('unmute', checkTrackState);
        track.removeEventListener('mute', checkTrackState);
        track.removeEventListener('ended', checkTrackState);
      });
    };
  }, [stream]);

  const showVideo = hasLiveVideoTrack || Boolean(stream && stream.getVideoTracks().length > 0);

  return (
    <div className="w-full h-full relative flex items-center justify-center bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-contain bg-black ${showVideo ? 'block' : 'hidden'}`}
      />
      {!showVideo && (
        <div className="flex flex-col items-center space-y-3 text-center p-4">
          <div className="h-16 w-16 rounded-2xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-blue-400 shadow-lg">
            <Monitor className="h-8 w-8 animate-pulse" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-zinc-100">
              {sharerName || 'Presenter'} is sharing their screen
            </h4>
            <p className="text-xs text-zinc-400">Receiving display stream over WebRTC</p>
          </div>
        </div>
      )}
      {showVideo && (
        <div className="absolute top-3 left-3 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800 text-xs text-zinc-200 flex items-center gap-2 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span>{sharerName || 'Presenter'}&apos;s Screen</span>
        </div>
      )}
    </div>
  );
}

export function MeetingOverlay() {
  const { user } = useAuth();
  const {
    meetingState,
    activeMeeting,
    incomingMeeting,
    lobbyTarget,
    meetingLocalStream,
    remoteMeetingStreams,
    isMeetingMuted,
    isMeetingCameraOff,
    meetingDuration,
    meetingError,
    connectionStatus,
    isConnected,
    screenShareState,
    screenStream,
    screenSharerUserId,
    screenSharerName,
    screenShareError,
    isSharingScreen,
    cancelMeetingLobby,
    startMeeting,
    joinMeeting,
    leaveMeeting,
    endMeeting,
    hostMuteParticipant,
    hostRemoveParticipant,
    toggleMeetingMute,
    toggleMeetingCamera,
    startScreenShare,
    stopScreenShare,
  } = useMeeting();

  const { incomingMessage } = useCollaboration();

  // Active side panel: 'none' | 'participants' | 'chat'
  const [activeSidePanel, setActiveSidePanel] = useState<'none' | 'participants' | 'chat'>('none');

  // Active speaker detection
  const [activeSpeakerUserId, setActiveSpeakerUserId] = useState<string | null>(null);

  // Pre-join Lobby Local States
  const [lobbyMuted, setLobbyMuted] = useState(false);
  const [lobbyCameraOff, setLobbyCameraOff] = useState(false);
  const [availableAudioInputs, setAvailableAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [availableVideoInputs, setAvailableVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>('');
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string>('');
  const [lobbyStream, setLobbyStream] = useState<MediaStream | null>(null);
  const [lobbyMicLevel, setLobbyMicLevel] = useState<number>(0);
  const [lobbyError, setLobbyError] = useState<string | null>(null);

  // In-meeting Chat states
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInputText, setChatInputText] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Host Action Menu Target
  const [selectedParticipantMenu, setSelectedParticipantMenu] = useState<string | null>(null);

  // Media Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const lobbyVideoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // ==========================================
  // 1. Pre-Join Lobby Device Enumeration & Preview
  // ==========================================
  const setupLobbyDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioIns = devices.filter((d) => d.kind === 'audioinput');
      const videoIns = devices.filter((d) => d.kind === 'videoinput');

      setAvailableAudioInputs(audioIns);
      setAvailableVideoInputs(videoIns);

      if (audioIns.length > 0 && !selectedAudioDeviceId) {
        setSelectedAudioDeviceId(audioIns[0].deviceId);
      }
      if (videoIns.length > 0 && !selectedVideoDeviceId) {
        setSelectedVideoDeviceId(videoIns[0].deviceId);
      }
    } catch (e) {
      console.warn('[MEETING LOBBY] enumerateDevices error:', e);
    }
  }, [selectedAudioDeviceId, selectedVideoDeviceId]);

  const startLobbyPreview = useCallback(async () => {
    if (meetingState !== 'LOBBY') return;

    // Stop existing preview stream
    if (lobbyStream) {
      lobbyStream.getTracks().forEach((t) => t.stop());
    }

    try {
      setLobbyError(null);
      const audioConstraint: MediaTrackConstraints | boolean = selectedAudioDeviceId
        ? { deviceId: { exact: selectedAudioDeviceId } }
        : true;
      const videoConstraint: MediaTrackConstraints | boolean = selectedVideoDeviceId
        ? { deviceId: { exact: selectedVideoDeviceId } }
        : true;

      let stream: MediaStream;
      if (!lobbyCameraOff) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraint,
          video: videoConstraint,
        });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraint,
          video: false,
        });
      }

      // Handle mute state on preview stream
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !lobbyMuted;
      });

      setLobbyStream(stream);

      // Attach to lobby video
      if (lobbyVideoRef.current) {
        lobbyVideoRef.current.srcObject = stream;
      }

      // Setup Web Audio Analyser for VU Meter
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateVolume = () => {
            if (analyserRef.current) {
              analyserRef.current.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
              }
              const avg = sum / dataArray.length;
              // Normalize 0-100
              const normalized = Math.min(100, Math.round((avg / 128) * 100));
              setLobbyMicLevel(lobbyMuted ? 0 : normalized);
            }
            animationFrameRef.current = requestAnimationFrame(updateVolume);
          };
          updateVolume();
        }
      } catch (e) {
        console.warn('[MEETING LOBBY] AudioContext error:', e);
      }
    } catch (err: any) {
      console.warn('[MEETING LOBBY] getUserMedia preview failed:', err);
      if (err.name === 'NotAllowedError') {
        setLobbyError('Camera and microphone permission was denied. Please allow access in browser settings.');
      } else if (err.name === 'NotFoundError') {
        setLobbyError('Requested camera or microphone device was not found.');
      } else {
        setLobbyError('Unable to preview media devices. You can still join with camera/mic off.');
      }
    }
  }, [meetingState, lobbyCameraOff, lobbyMuted, selectedAudioDeviceId, selectedVideoDeviceId]);

  // Trigger preview on lobby state
  useEffect(() => {
    if (meetingState === 'LOBBY') {
      setupLobbyDevices();
      startLobbyPreview();
    } else {
      // Clean up lobby preview stream
      if (lobbyStream) {
        lobbyStream.getTracks().forEach((t) => t.stop());
        setLobbyStream(null);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    }
  }, [meetingState, setupLobbyDevices, startLobbyPreview]);

  // ==========================================
  // 2. Active Meeting Stream Attachments
  // ==========================================
  useEffect(() => {
    if (localVideoRef.current && meetingLocalStream) {
      localVideoRef.current.srcObject = meetingLocalStream;
    }
  }, [meetingLocalStream, isMeetingCameraOff, meetingState]);

  useEffect(() => {
    if (screenVideoRef.current && screenStream) {
      screenVideoRef.current.srcObject = screenStream;
    }
  }, [screenStream, isSharingScreen]);

  // ==========================================
  // 3. Active Speaker Audio Detection (In-Meeting)
  // ==========================================
  useEffect(() => {
    if (meetingState !== 'ACTIVE' || !meetingLocalStream || isMeetingMuted) {
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(meetingLocalStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let animId: number;

      const checkSpeech = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        if (avg > 25 && user?.id) {
          setActiveSpeakerUserId(user.id);
        } else if (activeSpeakerUserId === user?.id && avg <= 15) {
          setActiveSpeakerUserId(null);
        }
        animId = requestAnimationFrame(checkSpeech);
      };

      checkSpeech();

      return () => {
        cancelAnimationFrame(animId);
        audioCtx.close().catch(() => {});
      };
    } catch {}
  }, [meetingState, meetingLocalStream, isMeetingMuted, user?.id, activeSpeakerUserId]);

  // ==========================================
  // 4. In-Meeting Group Chat Integration
  // ==========================================
  const conversationId = activeMeeting?.conversationId || lobbyTarget?.conversationId;

  const loadChatMessages = useCallback(async () => {
    if (!conversationId) return;
    try {
      const res = await collaborationApi.getConversationMessages(conversationId, { limit: 50 });
      if (res?.messages) {
        setChatMessages(res.messages.slice().reverse());
      }
    } catch {}
  }, [conversationId]);

  useEffect(() => {
    if (activeSidePanel === 'chat' && conversationId) {
      loadChatMessages();
    }
  }, [activeSidePanel, conversationId, loadChatMessages]);

  useEffect(() => {
    if (incomingMessage && incomingMessage.conversationId === conversationId) {
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === incomingMessage.message.id)) return prev;
        return [...prev, incomingMessage.message];
      });
      setTimeout(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    }
  }, [incomingMessage, conversationId]);

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInputText.trim() || !conversationId || isSendingChat) return;

    const text = chatInputText.trim();
    setChatInputText('');
    setIsSendingChat(true);

    try {
      const res = await collaborationApi.sendMessage(conversationId, { body: text });
      if (res?.message) {
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === res.message.id)) return prev;
          return [...prev, res.message];
        });
        setTimeout(() => {
          chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      }
    } catch (err) {
      console.warn('[MEETING CHAT] Failed to send message:', err);
    } finally {
      setIsSendingChat(false);
    }
  };

  // Join Handler from Lobby
  const handleJoinFromLobby = async () => {
    if (!lobbyTarget) return;

    const preferences = {
      isMuted: lobbyMuted,
      isCameraOff: lobbyCameraOff,
      audioDeviceId: selectedAudioDeviceId,
      videoDeviceId: selectedVideoDeviceId,
    };

    if (lobbyTarget.type === 'START') {
      await startMeeting(lobbyTarget.conversationId, lobbyTarget.title, preferences);
    } else {
      await joinMeeting(lobbyTarget.meetingId!, lobbyTarget.conversationId, preferences);
    }
  };

  if (meetingState === 'IDLE') return null;

  const isHost = activeMeeting?.hostUserId === user?.id;
  const participants = activeMeeting?.participants || [];
  const activeParticipants = participants.filter((p) => p.status !== 'LEFT');
  const meetingTitle = activeMeeting?.title || lobbyTarget?.title || 'Group Meeting';

  // ==========================================
  // MODE 1: PRE-JOIN LOBBY SCREEN (Phase 2D)
  // ==========================================
  if (meetingState === 'LOBBY' && lobbyTarget) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Pre-join lobby for ${meetingTitle}`}
        className="fixed inset-0 z-[140] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200"
      >
        <div className="w-full max-w-2xl rounded-2xl bg-zinc-950 border border-zinc-800 text-white shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-400" />
                {meetingTitle}
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {lobbyTarget.type === 'START' ? 'Ready to start meeting?' : 'Ready to join meeting?'}
              </p>
            </div>
            <button
              type="button"
              onClick={cancelMeetingLobby}
              aria-label="Close lobby"
              className="h-8 w-8 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Lobby Body */}
          <div className="p-4 sm:p-6 space-y-6">
            {/* Camera Preview Area */}
            <div className="relative w-full aspect-video max-h-[280px] rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-inner">
              {!lobbyCameraOff && lobbyStream ? (
                <video
                  ref={lobbyVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover -scale-x-100"
                />
              ) : (
                <div className="flex flex-col items-center justify-center space-y-2 text-zinc-500">
                  <div className="h-16 w-16 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 font-bold text-xl">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <span className="text-xs font-medium text-zinc-400">Camera is turned off</span>
                </div>
              )}

              {/* Live VU Meter overlay */}
              <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-sm border border-zinc-700/60 px-2.5 py-1 rounded-md flex items-center gap-2 text-xs">
                {lobbyMuted ? (
                  <MicOff className="h-3.5 w-3.5 text-red-400" />
                ) : (
                  <Mic className="h-3.5 w-3.5 text-emerald-400" />
                )}
                <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-75"
                    style={{ width: `${lobbyMicLevel}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Quick Preference Buttons */}
            <div className="flex items-center justify-center gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLobbyMuted((prev) => !prev)}
                className={`h-11 px-4 gap-2 rounded-xl border font-medium text-xs transition-colors ${
                  lobbyMuted
                    ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-200 hover:bg-zinc-800'
                }`}
                aria-label={lobbyMuted ? 'Turn microphone on' : 'Turn microphone off'}
              >
                {lobbyMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-emerald-400" />}
                <span>{lobbyMuted ? 'Mic Off' : 'Mic On'}</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setLobbyCameraOff((prev) => !prev)}
                className={`h-11 px-4 gap-2 rounded-xl border font-medium text-xs transition-colors ${
                  lobbyCameraOff
                    ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-200 hover:bg-zinc-800'
                }`}
                aria-label={lobbyCameraOff ? 'Turn camera on' : 'Turn camera off'}
              >
                {lobbyCameraOff ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4 text-emerald-400" />}
                <span>{lobbyCameraOff ? 'Camera Off' : 'Camera On'}</span>
              </Button>
            </div>

            {/* Device Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 block mb-1.5">
                  Microphone Device
                </label>
                <select
                  value={selectedAudioDeviceId}
                  onChange={(e) => setSelectedAudioDeviceId(e.target.value)}
                  className="w-full h-9 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
                  aria-label="Select microphone"
                >
                  {availableAudioInputs.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `Microphone ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-400 block mb-1.5">
                  Camera Device
                </label>
                <select
                  value={selectedVideoDeviceId}
                  onChange={(e) => setSelectedVideoDeviceId(e.target.value)}
                  className="w-full h-9 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
                  aria-label="Select camera"
                >
                  {availableVideoInputs.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Lobby Error Notice */}
            {lobbyError && (
              <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                  <span>{lobbyError}</span>
                </div>
                <button
                  type="button"
                  onClick={startLobbyPreview}
                  className="px-2 py-1 rounded bg-amber-900/60 hover:bg-amber-900 text-[11px] font-semibold text-amber-100 transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 bg-zinc-900/60 border-t border-zinc-800 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={cancelMeetingLobby}
              className="text-xs text-zinc-400 hover:text-white"
            >
              Cancel
            </Button>

            <Button
              type="button"
              onClick={handleJoinFromLobby}
              className="h-10 px-6 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-950/40 transition-all"
            >
              {lobbyTarget.type === 'START' ? 'Start Meeting' : 'Join Meeting'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // MODE 2: CONNECTING / STARTING SPINNER OVERLAY
  // ==========================================
  if (meetingState === 'STARTING' || meetingState === 'JOINING') {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Connecting to group meeting"
        className="fixed inset-0 z-[140] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
      >
        <div className="w-full max-w-md rounded-2xl bg-zinc-950 border border-zinc-800 text-white shadow-2xl p-8 flex flex-col items-center text-center space-y-6">
          <div className="h-16 w-16 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white relative">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-bold text-zinc-100">{meetingTitle}</h3>
            <p className="text-xs text-zinc-400">
              {meetingState === 'STARTING' ? 'Starting meeting…' : 'Joining meeting…'}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={leaveMeeting}
            className="border-zinc-800 text-zinc-300 hover:bg-zinc-900 text-xs"
            aria-label="Cancel connection"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ==========================================
  // MODE 3: ACTIVE / RECONNECTING MEETING WINDOW
  // ==========================================
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${meetingTitle} - Group Meeting`}
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/85 backdrop-blur-md p-1 sm:p-4 animate-in fade-in duration-200"
    >
      <div className="w-full max-w-6xl h-[92vh] max-h-[850px] rounded-2xl bg-zinc-950 border border-zinc-800 text-white shadow-2xl flex flex-col overflow-hidden relative">
        {/* Top Header */}
        <header className="h-14 px-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200 shrink-0">
              <Users className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-100 truncate">{meetingTitle}</h3>
                {isHost && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 border border-amber-500/30 text-amber-300 shrink-0">
                    Host
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono">
                {meetingState === 'ACTIVE' && (
                  <>
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{formatDuration(meetingDuration)}</span>
                  </>
                )}
                {meetingState === 'RECONNECTING' && (
                  <span className="text-amber-400 flex items-center gap-1 font-semibold animate-pulse">
                    <Loader2 className="h-3 w-3 animate-spin" /> Reconnecting…
                  </span>
                )}
                {meetingState === 'ENDED' && <span className="text-red-400">Meeting ended</span>}
                <span className="text-zinc-600">•</span>
                <span>{activeParticipants.length} {activeParticipants.length === 1 ? 'participant' : 'participants'}</span>
              </div>
            </div>
          </div>

          {/* Connection Quality & Side Panel Toggles */}
          <div className="flex items-center gap-2">
            {/* Connection Quality Indicator */}
            <div
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] font-medium text-zinc-300"
              title={isConnected ? 'Connection: Excellent' : 'Connection: Reconnecting'}
            >
              {isConnected ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span>Excellent</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-amber-300">Reconnecting…</span>
                </>
              )}
            </div>

            {/* Chat Drawer Toggle */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setActiveSidePanel((prev) => (prev === 'chat' ? 'none' : 'chat'))}
              className={`h-8 px-2.5 sm:px-3 text-xs gap-1.5 rounded-lg border transition-colors ${
                activeSidePanel === 'chat'
                  ? 'bg-zinc-800 border-zinc-700 text-white'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
              title="Toggle meeting chat"
              aria-label="Toggle meeting chat"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Chat</span>
            </Button>

            {/* Participants Drawer Toggle */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setActiveSidePanel((prev) => (prev === 'participants' ? 'none' : 'participants'))}
              className={`h-8 px-2.5 sm:px-3 text-xs gap-1.5 rounded-lg border transition-colors ${
                activeSidePanel === 'participants'
                  ? 'bg-zinc-800 border-zinc-700 text-white'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
              title="Toggle participants list"
              aria-label="Toggle participants list"
            >
              <Users className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Participants</span>
              <span className="h-4 px-1.5 rounded-full bg-zinc-700 text-[10px] font-mono flex items-center justify-center">
                {activeParticipants.length}
              </span>
            </Button>
          </div>
        </header>

        {/* Error Alert */}
        {(meetingError || screenShareError) && (
          <div className="bg-red-950/90 border-b border-red-800 px-4 py-2 text-xs text-red-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{meetingError || screenShareError}</span>
            </div>
            <button
              type="button"
              onClick={() => {}}
              className="text-zinc-400 hover:text-white"
              aria-label="Dismiss alert"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Screen Sharing Active Banner */}
        {meetingState === 'ACTIVE' && (isSharingScreen || activeMeeting?.activeScreenShare || screenSharerUserId) && (
          <div className="bg-blue-950/80 border-b border-blue-800 px-4 py-2 text-xs text-blue-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-blue-400 animate-pulse" />
              <span className="font-semibold">
                {isSharingScreen
                  ? "You're sharing your screen"
                  : `${activeMeeting?.activeScreenShare?.displayName || screenSharerName || 'A participant'} is sharing their screen`}
              </span>
            </div>
            {isSharingScreen && (
              <button
                type="button"
                onClick={stopScreenShare}
                className="px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-500 text-white text-[11px] font-semibold transition-colors shadow"
              >
                Stop Sharing
              </button>
            )}
          </div>
        )}

        {/* Meeting Body */}
        <div className="flex-1 relative bg-zinc-950 flex overflow-hidden">
          {/* Main Stage */}
          <main
            tabIndex={0}
            aria-label="Meeting participant stage"
            className="flex-1 p-2 sm:p-4 overflow-y-auto flex flex-col items-center justify-center focus:outline-none"
          >
            {/* Screen Share Focused Layout */}
            {isSharingScreen || activeMeeting?.activeScreenShare || screenSharerUserId ? (
              <div className="w-full h-full flex flex-col gap-3">
                {/* Large Shared Screen View */}
                <div className="flex-1 min-h-[220px] rounded-xl overflow-hidden bg-black border border-zinc-800 relative flex items-center justify-center shadow-2xl">
                  {isSharingScreen && screenStream ? (
                    <video
                      ref={screenVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-contain bg-black"
                    />
                  ) : (
                    <RemoteScreenVideo
                      stream={
                        remoteMeetingStreams[
                          activeMeeting?.activeScreenShare?.userId || screenSharerUserId || ''
                        ] || undefined
                      }
                      sharerName={
                        activeMeeting?.activeScreenShare?.displayName ||
                        screenSharerName ||
                        'Presenter'
                      }
                    />
                  )}
                </div>

                {/* Compact Horizontal Participant Strip */}
                <div className="h-28 shrink-0 flex items-center gap-2.5 overflow-x-auto pb-1 px-1">
                  {/* Current User Tile */}
                  <div
                    className={`h-full aspect-video min-w-[140px] rounded-lg overflow-hidden bg-zinc-900 border relative flex items-center justify-center shrink-0 transition-all ${
                      activeSpeakerUserId === user?.id
                        ? 'border-emerald-500 ring-2 ring-emerald-500/50'
                        : 'border-zinc-800'
                    }`}
                  >
                    {!isMeetingCameraOff && meetingLocalStream ? (
                      <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover -scale-x-100"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 font-bold text-xs">
                        {user?.email?.charAt(0).toUpperCase() || 'U'}
                      </div>
                    )}
                    <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-[10px] bg-black/70 px-1.5 py-0.5 rounded backdrop-blur-sm">
                      <span className="truncate max-w-[80px] font-medium text-zinc-200">You</span>
                      {isMeetingMuted ? (
                        <MicOff className="h-3 w-3 text-red-400 shrink-0" />
                      ) : (
                        <Mic className="h-3 w-3 text-emerald-400 shrink-0" />
                      )}
                    </div>
                  </div>

                  {/* Remote Participants */}
                  {activeParticipants
                    .filter((p) => p.userId !== user?.id)
                    .map((p) => (
                      <RemoteParticipantStripTile
                        key={p.userId}
                        participant={p}
                        stream={remoteMeetingStreams[p.userId]}
                        isActiveSpeaker={activeSpeakerUserId === p.userId}
                      />
                    ))}
                </div>
              </div>
            ) : (
              /* Normal Dynamic Participant Grid Layout */
              <div
                className={`w-full h-full grid gap-3 ${
                  activeParticipants.length <= 1
                    ? 'grid-cols-1'
                    : activeParticipants.length === 2
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : activeParticipants.length <= 4
                    ? 'grid-cols-2'
                    : 'grid-cols-2 sm:grid-cols-3'
                }`}
              >
                {/* 1. Self Tile */}
                <div
                  className={`rounded-xl overflow-hidden bg-zinc-900 border relative flex items-center justify-center shadow-lg transition-all min-h-[160px] ${
                    activeSpeakerUserId === user?.id
                      ? 'border-emerald-500 ring-2 ring-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                      : 'border-zinc-800'
                  }`}
                >
                  {!isMeetingCameraOff && meetingLocalStream ? (
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover -scale-x-100"
                    />
                  ) : (
                    <div className="flex flex-col items-center space-y-2 select-none">
                      <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200 font-bold text-xl sm:text-2xl shadow-md">
                        {user?.email?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <span className="text-[11px] font-medium text-zinc-400">Camera Off</span>
                    </div>
                  )}

                  {/* Tile Bottom Bar */}
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800/80 select-none">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-semibold text-zinc-100 truncate">
                        {user?.displayName || (user?.role === 'SUPER_ADMIN' ? 'Super Admin' : user?.email?.split('@')[0])}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">(You)</span>
                      {isHost && (
                        <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Host
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isMeetingMuted ? (
                        <span className="p-1 rounded bg-red-500/20 text-red-400" title="Muted">
                          <MicOff className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <span className="p-1 rounded bg-emerald-500/20 text-emerald-400" title="Active Microphone">
                          <Mic className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Remote Participants Tiles */}
                {activeParticipants
                  .filter((p) => p.userId !== user?.id)
                  .map((p) => (
                    <RemoteParticipantGridTile
                      key={p.userId}
                      participant={p}
                      stream={remoteMeetingStreams[p.userId]}
                      isHostUser={isHost}
                      isActiveSpeaker={activeSpeakerUserId === p.userId}
                      onMute={hostMuteParticipant}
                      onRemove={(uid) => hostRemoveParticipant(uid, 'Removed by meeting host')}
                      selectedMenuId={selectedParticipantMenu}
                      setSelectedMenuId={setSelectedParticipantMenu}
                    />
                  ))}
              </div>
            )}
          </main>

          {/* SIDE PANEL: PARTICIPANTS OR CHAT */}
          {activeSidePanel !== 'none' && (
            <aside className="w-80 border-l border-zinc-800 bg-zinc-900/95 flex flex-col shrink-0 animate-in slide-in-from-right-2 duration-150">
              {/* Panel Tabs */}
              <div className="h-11 border-b border-zinc-800 flex items-center justify-between px-3">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveSidePanel('participants')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                      activeSidePanel === 'participants'
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Participants ({activeParticipants.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSidePanel('chat')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                      activeSidePanel === 'chat'
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Chat
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSidePanel('none')}
                  className="h-6 w-6 rounded text-zinc-400 hover:text-white flex items-center justify-center"
                  aria-label="Close side panel"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* TAB 1: PARTICIPANTS LIST WITH HOST MODERATION */}
              {activeSidePanel === 'participants' && (
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {activeParticipants.map((p) => {
                    const isSelf = p.userId === user?.id;
                    return (
                      <div
                        key={p.userId}
                        className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-7 w-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-semibold text-zinc-300 text-[11px] shrink-0">
                            {p.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-zinc-200 truncate">{p.displayName}</span>
                              {isSelf && <span className="text-[10px] text-zinc-400">(You)</span>}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                              {p.role === 'HOST' ? (
                                <span className="text-amber-400 font-semibold">HOST</span>
                              ) : (
                                <span>Participant</span>
                              )}
                              {p.isScreenSharing && <span className="text-blue-400">🖥 Sharing</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {p.isMuted ? (
                            <span className="text-red-400" title="Muted">
                              <MicOff className="h-3.5 w-3.5" />
                            </span>
                          ) : (
                            <span className="text-emerald-400" title="Unmuted">
                              <Mic className="h-3.5 w-3.5" />
                            </span>
                          )}

                          {/* Host Control Actions */}
                          {isHost && !isSelf && (
                            <div className="flex items-center gap-1 ml-1 pl-1 border-l border-zinc-800">
                              <button
                                type="button"
                                onClick={() => hostMuteParticipant(p.userId)}
                                className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                                title="Mute participant"
                                aria-label={`Mute ${p.displayName}`}
                              >
                                <MicOff className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => hostRemoveParticipant(p.userId, 'Removed by meeting host')}
                                className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                                title="Remove participant"
                                aria-label={`Remove ${p.displayName}`}
                              >
                                <UserX className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* TAB 2: IN-MEETING CHAT (PHASE 2D) */}
              {activeSidePanel === 'chat' && (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {chatMessages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-4 text-zinc-500 space-y-1">
                        <MessageSquare className="h-8 w-8 text-zinc-600 mb-1" />
                        <p className="text-xs font-semibold text-zinc-400">No meeting messages yet</p>
                        <p className="text-[11px]">Chat with everyone in this group meeting</p>
                      </div>
                    ) : (
                      chatMessages.map((msg) => {
                        const isMyMsg = msg.senderUserId === user?.id;
                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${isMyMsg ? 'items-end' : 'items-start'}`}
                          >
                            <span className="text-[10px] text-zinc-400 mb-0.5 px-1">
                              {msg.sender?.displayName || (isMyMsg ? 'You' : 'Member')}
                            </span>
                            <div
                              className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                                isMyMsg
                                  ? 'bg-emerald-600 text-white rounded-br-none'
                                  : 'bg-zinc-800 text-zinc-100 rounded-bl-none'
                              }`}
                            >
                              {resolveMessagePreview(msg)}
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={chatBottomRef} />
                  </div>

                  {/* Chat Input Form */}
                  <form
                    onSubmit={handleSendChatMessage}
                    className="p-2.5 border-t border-zinc-800 bg-zinc-950/80 flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={chatInputText}
                      onChange={(e) => setChatInputText(e.target.value)}
                      placeholder="Type a message…"
                      className="flex-1 h-9 bg-zinc-900 border border-zinc-800 rounded-lg px-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                      aria-label="Meeting chat message input"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!chatInputText.trim() || isSendingChat}
                      className="h-9 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg"
                      aria-label="Send message"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </form>
                </div>
              )}
            </aside>
          )}
        </div>

        {/* BOTTOM TOOLBAR CONTROLS */}
        <footer className="h-16 px-4 bg-zinc-900/95 border-t border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {/* Microphone Toggle */}
            <Button
              type="button"
              variant="outline"
              onClick={toggleMeetingMute}
              className={`h-10 px-3.5 rounded-xl border text-xs gap-2 font-medium transition-colors ${
                isMeetingMuted
                  ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700'
              }`}
              title={isMeetingMuted ? 'Unmute microphone' : 'Mute microphone'}
              aria-label={isMeetingMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMeetingMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-emerald-400" />}
              <span className="hidden sm:inline">{isMeetingMuted ? 'Unmute' : 'Mute'}</span>
            </Button>

            {/* Camera Toggle */}
            <Button
              type="button"
              variant="outline"
              onClick={toggleMeetingCamera}
              className={`h-10 px-3.5 rounded-xl border text-xs gap-2 font-medium transition-colors ${
                isMeetingCameraOff
                  ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700'
              }`}
              title={isMeetingCameraOff ? 'Turn on camera' : 'Turn off camera'}
              aria-label={isMeetingCameraOff ? 'Turn on camera' : 'Turn off camera'}
            >
              {isMeetingCameraOff ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4 text-emerald-400" />}
              <span className="hidden sm:inline">{isMeetingCameraOff ? 'Start Video' : 'Stop Video'}</span>
            </Button>

            {/* Screen Share Toggle */}
            <Button
              type="button"
              variant="outline"
              onClick={isSharingScreen ? stopScreenShare : startScreenShare}
              disabled={screenShareState === 'STARTING' || screenShareState === 'STOPPING'}
              className={`h-10 px-3.5 rounded-xl border text-xs gap-2 font-medium transition-colors ${
                isSharingScreen
                  ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-500'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700'
              }`}
              title={isSharingScreen ? 'Stop screen share' : 'Share your screen'}
              aria-label={isSharingScreen ? 'Stop screen share' : 'Share your screen'}
            >
              {isSharingScreen ? <MonitorOff className="h-4 w-4" /> : <Monitor className="h-4 w-4 text-blue-400" />}
              <span className="hidden sm:inline">{isSharingScreen ? 'Stop Share' : 'Share Screen'}</span>
            </Button>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Host End Meeting Button */}
            {isHost && (
              <Button
                type="button"
                variant="outline"
                onClick={endMeeting}
                className="h-10 px-4 rounded-xl border border-red-800 bg-red-950/40 text-red-300 hover:bg-red-900/60 text-xs font-semibold gap-1.5 transition-colors"
                title="End meeting for everyone"
                aria-label="End meeting for everyone"
              >
                <Shield className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">End Meeting</span>
              </Button>
            )}

            {/* Leave Meeting Button */}
            <Button
              type="button"
              onClick={leaveMeeting}
              className="h-10 px-5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold gap-2 shadow-lg shadow-red-950/40 transition-colors"
              title="Leave meeting"
              aria-label="Leave meeting"
            >
              <PhoneOff className="h-4 w-4" />
              <span>Leave</span>
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
