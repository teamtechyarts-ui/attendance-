'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { useAuth } from '@/hooks/use-auth';
import { api, collaborationApi } from '@/lib/api';
import { soundManager } from '@/lib/sound';
import {
  Conversation,
  Message,
  MessageReaction,
  UserPresence,
  UserPresenceStatus,
  MeetingStatus,
  MeetingParticipantStatus,
  MeetingParticipantInfo,
  PublicMeetingState,
  MeetingState,
  ScreenShareState,
  ScreenShareInfo,
} from '@/types';

export type ConnectionStatus =
  | 'INITIALIZING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'DISCONNECTED';

export type CallState =
  | 'IDLE'
  | 'OUTGOING_CALLING'
  | 'OUTGOING_RINGING'
  | 'INCOMING_RINGING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'ENDING'
  | 'ENDED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'MISSED'
  | 'FAILED';

export interface ActiveCall {
  callId: string;
  conversationId: string;
  callerUserId: string;
  calleeUserId: string;
  callerName: string;
  callerAvatar?: string | null;
  otherUserName: string;
  otherUserAvatar?: string | null;
  callType: 'AUDIO' | 'VIDEO';
  isInitiator: boolean;
}

interface TypingIndicatorMap {
  [conversationId: string]: {
    [userId: string]: {
      displayName: string;
      timestamp: number;
    };
  };
}

interface CollaborationContextType {
  // Chat & Presence & Connection Lifecycle
  connectionStatus: ConnectionStatus;
  isConnected: boolean;
  isReady: boolean;
  presence: UserPresence | null;
  conversations: Conversation[];
  isLoadingConversations: boolean;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  setUserStatus: (status: UserPresenceStatus, customStatusMessage?: string | null) => Promise<void>;
  sendTyping: (conversationId: string, isTyping: boolean) => void;
  typingUsers: TypingIndicatorMap;
  incomingMessage: { conversationId: string; message: Message; timestamp: number } | null;
  incomingReaction: { conversationId: string; messageId: string; reactions: MessageReaction[] } | null;
  totalUnreadCount: number;
  refreshConversations: () => Promise<void>;

  // Calling (Phase 2A 1:1)
  callState: CallState;
  activeCall: ActiveCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  callDuration: number;
  callError: string | null;
  startCall: (params: {
    conversationId: string;
    targetUserId: string;
    targetUserName: string;
    targetUserAvatar?: string | null;
    callType: 'AUDIO' | 'VIDEO';
  }) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  cancelCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;

  // Group Meetings (Phase 2B)
  meetingState: MeetingState;
  activeMeeting: PublicMeetingState | null;
  incomingMeeting: { meeting: PublicMeetingState; isDismissed?: boolean } | null;
  lobbyTarget: { type: 'START' | 'JOIN'; conversationId: string; meetingId?: string; title?: string } | null;
  meetingLocalStream: MediaStream | null;
  remoteMeetingStreams: { [userId: string]: MediaStream };
  isMeetingMuted: boolean;
  isMeetingCameraOff: boolean;
  meetingDuration: number;
  meetingError: string | null;
  activeGroupMeetings: { [conversationId: string]: PublicMeetingState };
  openMeetingLobby: (target: { type: 'START' | 'JOIN'; conversationId: string; meetingId?: string; title?: string }) => void;
  cancelMeetingLobby: () => void;
  startMeeting: (conversationId: string, title?: string, preferences?: { isMuted?: boolean; isCameraOff?: boolean; audioDeviceId?: string; videoDeviceId?: string }) => Promise<void>;
  joinMeeting: (meetingId: string, conversationId?: string, preferences?: { isMuted?: boolean; isCameraOff?: boolean; audioDeviceId?: string; videoDeviceId?: string }) => Promise<void>;
  leaveMeeting: () => void;
  endMeeting: () => void;
  hostMuteParticipant: (targetUserId: string) => void;
  hostRemoveParticipant: (targetUserId: string, reason?: string) => void;
  toggleMeetingMute: () => void;
  toggleMeetingCamera: () => void;
  dismissIncomingMeeting: () => void;
  refreshActiveMeeting: (conversationId?: string) => Promise<void>;

  // Screen Sharing (Phase 2C)
  screenShareState: ScreenShareState;
  screenStream: MediaStream | null;
  screenSharerUserId: string | null;
  screenSharerName: string | null;
  screenShareError: string | null;
  isSharingScreen: boolean;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
}

const CollaborationContext = createContext<CollaborationContextType | null>(null);

function getMediaErrorMessage(err: any, isVideo: boolean): string {
  const name = err?.name || '';

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return isVideo
      ? 'Camera and microphone access was denied. Please allow access in your browser settings and try again.'
      : 'Microphone access was denied. Please allow access in your browser settings and try again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return isVideo
      ? 'No camera or microphone was found on your device.'
      : 'No microphone was found on your device.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return isVideo
      ? 'Your camera or microphone is currently in use by another application.'
      : 'Your microphone is currently in use by another application.';
  }
  if (name === 'SecurityError') {
    return 'Camera and microphone access is not available in this browser context.';
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return isVideo
      ? 'The requested camera or microphone is not supported by your device.'
      : 'The requested microphone is not supported by your device.';
  }
  return isVideo
    ? 'Camera and microphone access is required for video calls.'
    : 'Microphone access is required for audio calls.';
}

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const RINGING_TIMEOUT_MS = 30 * 1000; // 30 seconds
const HEARTBEAT_INTERVAL_MS = 25 * 1000; // 25 seconds

export function CollaborationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;

  // Connection Lifecycle state
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('INITIALIZING');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);

  // Chat & Presence state
  const [presence, setPresence] = useState<UserPresence | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('workos_user_presence_cache');
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return null;
  });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState<boolean>(true);
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<TypingIndicatorMap>({});
  const [incomingMessage, setIncomingMessage] = useState<{
    conversationId: string;
    message: Message;
    timestamp: number;
  } | null>(null);
  const [incomingReaction, setIncomingReaction] = useState<{
    conversationId: string;
    messageId: string;
    reactions: MessageReaction[];
  } | null>(null);

  // Calling state (1:1 Phase 2A)
  const [callState, setCallState] = useState<CallState>('IDLE');
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isCameraOff, setIsCameraOff] = useState<boolean>(false);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [callError, setCallError] = useState<string | null>(null);

  // Group Meetings state (Phase 2B)
  const [meetingState, setMeetingState] = useState<MeetingState>('IDLE');
  const [activeMeeting, setActiveMeeting] = useState<PublicMeetingState | null>(null);
  const [incomingMeeting, setIncomingMeeting] = useState<{ meeting: PublicMeetingState; isDismissed?: boolean } | null>(null);
  const [lobbyTarget, setLobbyTarget] = useState<{
    type: 'START' | 'JOIN';
    conversationId: string;
    meetingId?: string;
    title?: string;
  } | null>(null);
  const [meetingLocalStream, setMeetingLocalStream] = useState<MediaStream | null>(null);
  const [remoteMeetingStreams, setRemoteMeetingStreams] = useState<{ [userId: string]: MediaStream }>({});
  const [isMeetingMuted, setIsMeetingMuted] = useState<boolean>(false);
  const [isMeetingCameraOff, setIsMeetingCameraOff] = useState<boolean>(false);
  const [meetingDuration, setMeetingDuration] = useState<number>(0);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [activeGroupMeetings, setActiveGroupMeetings] = useState<{ [conversationId: string]: PublicMeetingState }>({});

  // Screen Sharing state (Phase 2C)
  const [screenShareState, setScreenShareState] = useState<ScreenShareState>('NOT_SHARING');
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [screenSharerUserId, setScreenSharerUserId] = useState<string | null>(null);
  const [screenSharerName, setScreenSharerName] = useState<string | null>(null);
  const [screenShareError, setScreenShareError] = useState<string | null>(null);

  // Synchronous State & Ref Helpers (prevents race conditions with WebSocket callbacks)
  const callStateRef = useRef<CallState>('IDLE');
  const activeCallRef = useRef<ActiveCall | null>(null);
  const meetingStateRef = useRef<MeetingState>('IDLE');
  const activeMeetingRef = useRef<PublicMeetingState | null>(null);
  const meetingLocalStreamRef = useRef<MediaStream | null>(null);
  const meetingPeersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteMeetingStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const pendingMeetingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenShareStateRef = useRef<ScreenShareState>('NOT_SHARING');
  const previousCameraStateRef = useRef<boolean>(false);
  const socketRef = useRef<WebSocket | null>(null);
  const socketInstanceIdRef = useRef<number>(0);
  const nextInstanceIdRef = useRef<number>(1);
  const isMountedRef = useRef<boolean>(true);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteOfferSdpRef = useRef<RTCSessionDescriptionInit | null>(null);
  const ringingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callDurationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const meetingDurationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const updateCallState = useCallback((newState: CallState) => {
    console.log(`[CALL DEBUG] [CLIENT] State transition: ${callStateRef.current} -> ${newState}`);
    callStateRef.current = newState;
    setCallState(newState);
  }, []);

  const updateActiveCall = useCallback((newCall: ActiveCall | null) => {
    activeCallRef.current = newCall;
    setActiveCall(newCall);
  }, []);

  const updateMeetingState = useCallback((newState: MeetingState) => {
    console.log(`[MEETING DEBUG] [CLIENT] Meeting State transition: ${meetingStateRef.current} -> ${newState}`);
    meetingStateRef.current = newState;
    setMeetingState(newState);
  }, []);

  const updateActiveMeeting = useCallback((newMeeting: PublicMeetingState | null) => {
    activeMeetingRef.current = newMeeting;
    setActiveMeeting(newMeeting);
  }, []);

  // Chat & presence refs
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const lastActiveTimestampRef = useRef<number>(Date.now());
  const isAutoAwayRef = useRef<boolean>(false);
  const lastTypingSentRef = useRef<number>(0);
  const activeConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  // Ice servers configuration
  const getIceServers = (): RTCIceServer[] => {
    const customIce = process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS;
    if (customIce) {
      try {
        return JSON.parse(customIce);
      } catch {}
    }
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ];
  };

  // Safe WebSocket send helper
  const sendWsMessage = useCallback((msg: { type: string; [key: string]: any }) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      try {
        socketRef.current.send(JSON.stringify(msg));
        console.log(`[COLLAB WS] Sent: ${msg.type}`);
      } catch (err) {
        console.error('[COLLAB WS] Send error:', err);
      }
    } else {
      console.warn('[COLLAB WS] Cannot send message, socket not open:', msg.type);
    }
  }, []);

  /**
   * Screen share cleanup method (Phase 2C)
   */
  const cleanupScreenShare = useCallback(() => {
    if (screenTrackRef.current) {
      screenTrackRef.current.onended = null;
      try {
        screenTrackRef.current.stop();
      } catch {}
      screenTrackRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      screenStreamRef.current = null;
    }
    setScreenStream(null);
    screenShareStateRef.current = 'NOT_SHARING';
    setScreenShareState('NOT_SHARING');
    setScreenSharerUserId(null);
    setScreenSharerName(null);
  }, []);

  /**
   * Central call cleanup method
   */
  const cleanupCall = useCallback((finalState: CallState = 'IDLE', errorMsg: string | null = null) => {
    console.log(`[CALL DEBUG] [CLIENT] cleanupCall finalState=${finalState} errorMsg=${errorMsg}`);
    // 1. Stop call sounds
    soundManager.stopIncomingCallRingtone();

    // 2. Clear timers
    if (ringingTimeoutRef.current) {
      clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = null;
    }
    if (callDurationIntervalRef.current) {
      clearInterval(callDurationIntervalRef.current);
      callDurationIntervalRef.current = null;
    }

    // 3. Clean screen sharing
    cleanupScreenShare();

    // 4. Stop all local media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      localStreamRef.current = null;
    }
    setLocalStream(null);

    // 5. Close RTCPeerConnection
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.onconnectionstatechange = null;
        peerConnectionRef.current.oniceconnectionstatechange = null;
        peerConnectionRef.current.close();
      } catch {}
      peerConnectionRef.current = null;
    }

    // 6. Clear streams & candidates
    remoteStreamRef.current = null;
    setRemoteStream(null);
    pendingIceCandidatesRef.current = [];
    remoteOfferSdpRef.current = null;

    // 7. Reset controls
    setIsMuted(false);
    setIsCameraOff(false);

    if (errorMsg) {
      setCallError(errorMsg);
    }

    if (finalState === 'IDLE') {
      updateCallState('IDLE');
      updateActiveCall(null);
      setCallDuration(0);
    } else {
      updateCallState(finalState);
      setTimeout(() => {
        updateCallState('IDLE');
        updateActiveCall(null);
        setCallDuration(0);
        setCallError(null);
      }, 3000);
    }
  }, [updateCallState, updateActiveCall, cleanupScreenShare]);

  // Duration timer start when CONNECTED
  useEffect(() => {
    if (callState === 'CONNECTED') {
      setCallDuration(0);
      callDurationIntervalRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (callDurationIntervalRef.current) {
        clearInterval(callDurationIntervalRef.current);
        callDurationIntervalRef.current = null;
      }
    }
    return () => {
      if (callDurationIntervalRef.current) {
        clearInterval(callDurationIntervalRef.current);
      }
    };
  }, [callState]);

  /**
   * Central meeting cleanup method (Phase 2B)
   */
  const cleanupMeeting = useCallback((finalState: MeetingState = 'IDLE', errorMsg: string | null = null) => {
    console.log(`[MEETING DEBUG] [CLIENT] cleanupMeeting finalState=${finalState} errorMsg=${errorMsg}`);

    if (meetingDurationIntervalRef.current) {
      clearInterval(meetingDurationIntervalRef.current);
      meetingDurationIntervalRef.current = null;
    }

    // Clean screen sharing
    cleanupScreenShare();

    // Close and teardown all mesh WebRTC peer connections
    meetingPeersRef.current.forEach((pc, peerId) => {
      try {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        pc.close();
      } catch (e) {
        console.warn(`[MEETING MESH] Error closing peer connection for ${peerId}:`, e);
      }
    });
    meetingPeersRef.current.clear();
    remoteMeetingStreamsRef.current.clear();
    setRemoteMeetingStreams({});
    pendingMeetingIceCandidatesRef.current.clear();

    if (meetingLocalStreamRef.current) {
      meetingLocalStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      meetingLocalStreamRef.current = null;
    }
    setMeetingLocalStream(null);

    setIsMeetingMuted(false);
    setIsMeetingCameraOff(false);

    if (errorMsg) {
      setMeetingError(errorMsg);
    }

    if (finalState === 'IDLE') {
      updateMeetingState('IDLE');
      updateActiveMeeting(null);
      setMeetingDuration(0);
    } else {
      updateMeetingState(finalState);
      setTimeout(() => {
        updateMeetingState('IDLE');
        updateActiveMeeting(null);
        setMeetingDuration(0);
        setMeetingError(null);
      }, 2500);
    }
  }, [updateMeetingState, updateActiveMeeting, cleanupScreenShare]);

  // Meeting duration timer when ACTIVE
  useEffect(() => {
    if (meetingState === 'ACTIVE') {
      setMeetingDuration(0);
      meetingDurationIntervalRef.current = setInterval(() => {
        setMeetingDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (meetingDurationIntervalRef.current) {
        clearInterval(meetingDurationIntervalRef.current);
        meetingDurationIntervalRef.current = null;
      }
    }
    return () => {
      if (meetingDurationIntervalRef.current) {
        clearInterval(meetingDurationIntervalRef.current);
      }
    };
  }, [meetingState]);

  // Open pre-join meeting lobby (Phase 2D)
  const openMeetingLobby = useCallback(
    (target: { type: 'START' | 'JOIN'; conversationId: string; meetingId?: string; title?: string }) => {
      setLobbyTarget(target);
      updateMeetingState('LOBBY');
      setMeetingError(null);
    },
    [updateMeetingState]
  );

  // Cancel pre-join meeting lobby
  const cancelMeetingLobby = useCallback(() => {
    setLobbyTarget(null);
    updateMeetingState('IDLE');
    setMeetingError(null);
  }, [updateMeetingState]);

  // Start group meeting (Phase 2B + 2D preferences)
  const startMeeting = useCallback(
    async (
      conversationId: string,
      title?: string,
      preferences?: { isMuted?: boolean; isCameraOff?: boolean; audioDeviceId?: string; videoDeviceId?: string }
    ) => {
      if (!user) return;

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        cleanupMeeting('FAILED', 'Collaboration connection is reconnecting. Please wait a moment.');
        return;
      }

      if (meetingStateRef.current !== 'IDLE' && meetingStateRef.current !== 'LOBBY') {
        console.warn('[MEETING DEBUG] Already in active call or meeting');
        return;
      }

      setLobbyTarget(null);
      updateMeetingState('STARTING');

      const shouldMute = Boolean(preferences?.isMuted);
      const shouldCameraOff = Boolean(preferences?.isCameraOff);

      const audioConstraints: MediaTrackConstraints | boolean = preferences?.audioDeviceId
        ? { deviceId: { exact: preferences.audioDeviceId } }
        : true;
      const videoConstraints: MediaTrackConstraints | boolean = preferences?.videoDeviceId
        ? { deviceId: { exact: preferences.videoDeviceId } }
        : true;

      // Acquire media stream according to preferences
      let stream: MediaStream | null = null;
      if (!shouldCameraOff) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: videoConstraints });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
          } catch (e: any) {
            console.error('[MEETING DEBUG] Media error in startMeeting:', e);
            cleanupMeeting('FAILED', getMediaErrorMessage(e, true));
            return;
          }
        }
      } else {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
        } catch (e: any) {
          console.error('[MEETING DEBUG] Media error in startMeeting:', e);
          cleanupMeeting('FAILED', getMediaErrorMessage(e, false));
          return;
        }
      }

      if (stream) {
        if (shouldMute) {
          stream.getAudioTracks().forEach((t) => {
            t.enabled = false;
          });
        }
        meetingLocalStreamRef.current = stream;
        setMeetingLocalStream(stream);
        setIsMeetingMuted(shouldMute);
        setIsMeetingCameraOff(shouldCameraOff);
      }

      sendWsMessage({
        type: 'MEETING_START',
        payload: {
          conversationId,
          title,
        },
      });
    },
    [user, cleanupMeeting, sendWsMessage, updateMeetingState]
  );

  // Join group meeting (Phase 2B + 2D preferences)
  const joinMeeting = useCallback(
    async (
      meetingId: string,
      conversationId?: string,
      preferences?: { isMuted?: boolean; isCameraOff?: boolean; audioDeviceId?: string; videoDeviceId?: string }
    ) => {
      if (!user) return;

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        cleanupMeeting('FAILED', 'Collaboration connection is reconnecting. Please wait a moment.');
        return;
      }

      if (meetingStateRef.current !== 'IDLE' && meetingStateRef.current !== 'LOBBY') {
        console.warn('[MEETING DEBUG] Already in active call or meeting');
        return;
      }

      setLobbyTarget(null);
      updateMeetingState('JOINING');
      setIncomingMeeting(null);

      const shouldMute = Boolean(preferences?.isMuted);
      const shouldCameraOff = Boolean(preferences?.isCameraOff);

      const audioConstraints: MediaTrackConstraints | boolean = preferences?.audioDeviceId
        ? { deviceId: { exact: preferences.audioDeviceId } }
        : true;
      const videoConstraints: MediaTrackConstraints | boolean = preferences?.videoDeviceId
        ? { deviceId: { exact: preferences.videoDeviceId } }
        : true;

      // Acquire media stream according to preferences
      let stream: MediaStream | null = null;
      if (!shouldCameraOff) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: videoConstraints });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
          } catch (e: any) {
            console.error('[MEETING DEBUG] Media error in joinMeeting:', e);
            cleanupMeeting('FAILED', getMediaErrorMessage(e, true));
            return;
          }
        }
      } else {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
        } catch (e: any) {
          console.error('[MEETING DEBUG] Media error in joinMeeting:', e);
          cleanupMeeting('FAILED', getMediaErrorMessage(e, false));
          return;
        }
      }

      if (stream) {
        if (shouldMute) {
          stream.getAudioTracks().forEach((t) => {
            t.enabled = false;
          });
        }
        meetingLocalStreamRef.current = stream;
        setMeetingLocalStream(stream);
        setIsMeetingMuted(shouldMute);
        setIsMeetingCameraOff(shouldCameraOff);
      }

      sendWsMessage({
        type: 'MEETING_JOIN',
        payload: {
          meetingId,
          conversationId,
          isMuted: shouldMute,
          isCameraOff: shouldCameraOff,
        },
      });
    },
    [user, cleanupMeeting, sendWsMessage, updateMeetingState]
  );

  // Leave active meeting (Phase 2B)
  const leaveMeeting = useCallback(() => {
    const current = activeMeetingRef.current;
    if (current) {
      sendWsMessage({
        type: 'MEETING_LEAVE',
        payload: { meetingId: current.meetingId },
      });
    }
    cleanupMeeting('IDLE');
  }, [cleanupMeeting, sendWsMessage]);

  // End active meeting for everyone (Host action - Phase 2B)
  const endMeeting = useCallback(() => {
    const current = activeMeetingRef.current;
    if (current) {
      sendWsMessage({
        type: 'MEETING_END',
        payload: { meetingId: current.meetingId },
      });
    }
    cleanupMeeting('ENDED');
  }, [cleanupMeeting, sendWsMessage]);

  // Host Mute Participant (Phase 2D)
  const hostMuteParticipant = useCallback(
    (targetUserId: string) => {
      const current = activeMeetingRef.current;
      if (current) {
        sendWsMessage({
          type: 'HOST_MUTE_PARTICIPANT',
          payload: {
            meetingId: current.meetingId,
            targetUserId,
          },
        });
      }
    },
    [sendWsMessage]
  );

  // Host Remove Participant (Phase 2D)
  const hostRemoveParticipant = useCallback(
    (targetUserId: string, reason?: string) => {
      const current = activeMeetingRef.current;
      if (current) {
        sendWsMessage({
          type: 'HOST_REMOVE_PARTICIPANT',
          payload: {
            meetingId: current.meetingId,
            targetUserId,
            reason,
          },
        });
      }
    },
    [sendWsMessage]
  );

  // Create and configure RTCPeerConnection for a remote meeting participant (Mesh WebRTC)
  const createMeetingPeerConnection = useCallback(
    (targetUserId: string): RTCPeerConnection => {
      const existing = meetingPeersRef.current.get(targetUserId);
      if (existing) {
        try {
          existing.onicecandidate = null;
          existing.ontrack = null;
          existing.onconnectionstatechange = null;
          existing.close();
        } catch {}
        meetingPeersRef.current.delete(targetUserId);
      }

      console.log(`[MEETING MESH] Initializing RTCPeerConnection for targetUserId=${targetUserId}`);
      const pc = new RTCPeerConnection({ iceServers: getIceServers() });
      meetingPeersRef.current.set(targetUserId, pc);

      if (meetingLocalStreamRef.current) {
        meetingLocalStreamRef.current.getTracks().forEach((track) => {
          try {
            if (track.kind === 'video' && screenShareStateRef.current === 'SHARING' && screenTrackRef.current) {
              pc.addTrack(screenTrackRef.current, screenStreamRef.current || meetingLocalStreamRef.current!);
            } else {
              pc.addTrack(track, meetingLocalStreamRef.current!);
            }
          } catch (e) {
            console.warn(`[MEETING MESH] addTrack error for ${targetUserId}:`, e);
          }
        });
      }

      pc.ontrack = (event) => {
        console.log(`[MEETING MESH] ontrack received stream from targetUserId=${targetUserId} tracks=${event.streams[0]?.getTracks().length}`);
        if (event.streams && event.streams[0]) {
          const stream = event.streams[0];
          remoteMeetingStreamsRef.current.set(targetUserId, stream);
          setRemoteMeetingStreams((prev) => ({
            ...prev,
            [targetUserId]: stream,
          }));
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && activeMeetingRef.current) {
          sendWsMessage({
            type: 'MEETING_PEER_ICE_CANDIDATE',
            payload: {
              meetingId: activeMeetingRef.current.meetingId,
              targetUserId,
              candidate: event.candidate,
            },
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`[MEETING MESH] connectionState with ${targetUserId}: ${pc.connectionState}`);
      };

      return pc;
    },
    [sendWsMessage]
  );

  // Toggle meeting mute
  const toggleMeetingMute = useCallback(() => {
    if (meetingLocalStreamRef.current) {
      const audioTracks = meetingLocalStreamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        const nextMuted = !isMeetingMuted;
        audioTracks.forEach((t) => {
          t.enabled = !nextMuted;
        });
        setIsMeetingMuted(nextMuted);

        if (activeMeetingRef.current) {
          sendWsMessage({
            type: 'MEETING_PARTICIPANT_UPDATE',
            payload: {
              meetingId: activeMeetingRef.current.meetingId,
              isMuted: nextMuted,
              isCameraOff: isMeetingCameraOff,
            },
          });
        }
      }
    }
  }, [isMeetingMuted, isMeetingCameraOff, sendWsMessage]);

  // Toggle meeting camera
  const toggleMeetingCamera = useCallback(() => {
    if (meetingLocalStreamRef.current) {
      const videoTracks = meetingLocalStreamRef.current.getVideoTracks();
      if (videoTracks.length > 0) {
        const nextOff = !isMeetingCameraOff;
        videoTracks.forEach((t) => {
          t.enabled = !nextOff;
        });
        setIsMeetingCameraOff(nextOff);

        if (activeMeetingRef.current) {
          sendWsMessage({
            type: 'MEETING_PARTICIPANT_UPDATE',
            payload: {
              meetingId: activeMeetingRef.current.meetingId,
              isMuted: isMeetingMuted,
              isCameraOff: nextOff,
            },
          });
        }
      }
    }
  }, [isMeetingCameraOff, isMeetingMuted, sendWsMessage]);

  // Dismiss incoming meeting prompt
  const dismissIncomingMeeting = useCallback(() => {
    setIncomingMeeting(null);
  }, []);

  // Refresh active meeting for a conversation
  const refreshActiveMeeting = useCallback(async (conversationId?: string) => {
    const targetConvId = conversationId || activeConversationIdRef.current;
    if (!targetConvId) return;

    try {
      const res = await collaborationApi.getActiveMeeting(targetConvId);
      if (res?.meeting && res.meeting.status === 'ACTIVE') {
        setActiveGroupMeetings((prev) => ({ ...prev, [targetConvId]: res.meeting! }));
      } else {
        setActiveGroupMeetings((prev) => {
          const next = { ...prev };
          delete next[targetConvId];
          return next;
        });
      }
    } catch {}
  }, []);

  // Stop active screen share (Phase 2C)
  const stopScreenShare = useCallback(() => {
    screenShareStateRef.current = 'STOPPING';
    setScreenShareState('STOPPING');

    // 1. Stop screen track
    if (screenTrackRef.current) {
      screenTrackRef.current.onended = null;
      try {
        screenTrackRef.current.stop();
      } catch {}
      screenTrackRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      screenStreamRef.current = null;
    }
    setScreenStream(null);

    // 2. Camera restoration for 1:1 call
    if (callStateRef.current === 'CONNECTED' && peerConnectionRef.current) {
      const senders = peerConnectionRef.current.getSenders();
      const videoSender = senders.find((s) => s.track?.kind === 'video' || !s.track);
      if (videoSender) {
        if (previousCameraStateRef.current && localStreamRef.current) {
          const cameraTrack = localStreamRef.current.getVideoTracks()[0];
          if (cameraTrack) {
            cameraTrack.enabled = true;
            videoSender.replaceTrack(cameraTrack).catch(() => {});
            setIsCameraOff(false);
          }
        } else {
          // Camera was OFF before sharing
          if (localStreamRef.current) {
            const cameraTrack = localStreamRef.current.getVideoTracks()[0];
            if (cameraTrack) {
              cameraTrack.enabled = false;
              videoSender.replaceTrack(cameraTrack).catch(() => {});
            }
          }
          setIsCameraOff(true);
        }
      }

      if (activeCallRef.current) {
        sendWsMessage({
          type: 'SCREEN_SHARE_STOP',
          payload: {
            callId: activeCallRef.current.callId,
            conversationId: activeCallRef.current.conversationId,
          },
        });
      }
    }

    // 3. Camera restoration for Group Meeting
    if (meetingStateRef.current === 'ACTIVE') {
      const cameraTrack = meetingLocalStreamRef.current?.getVideoTracks()[0];
      const shouldEnableCamera = previousCameraStateRef.current && !!cameraTrack;

      if (cameraTrack) {
        cameraTrack.enabled = shouldEnableCamera;
      }
      setIsMeetingCameraOff(!shouldEnableCamera);

      for (const [peerUserId, pc] of meetingPeersRef.current.entries()) {
        try {
          const senders = pc.getSenders();
          const videoSender = senders.find((s) => s.track?.kind === 'video' || !s.track);
          if (videoSender && cameraTrack) {
            videoSender.replaceTrack(cameraTrack).catch(() => {});
          }
        } catch (e) {
          console.error(`[SCREEN SHARE] Failed to restore camera track for meeting peer ${peerUserId}:`, e);
        }
      }

      if (activeMeetingRef.current) {
        sendWsMessage({
          type: 'SCREEN_SHARE_STOP',
          payload: {
            meetingId: activeMeetingRef.current.meetingId,
            conversationId: activeMeetingRef.current.conversationId,
          },
        });
      }
    }

    screenShareStateRef.current = 'NOT_SHARING';
    setScreenShareState('NOT_SHARING');
    setScreenSharerUserId(null);
    setScreenSharerName(null);
  }, [sendWsMessage]);

  // Start screen sharing (Phase 2C)
  const startScreenShare = useCallback(async () => {
    if (!user) return;

    // Check if in active call or meeting
    const isInCall = callStateRef.current === 'CONNECTED';
    const isInMeeting = meetingStateRef.current === 'ACTIVE';

    if (!isInCall && !isInMeeting) {
      console.warn('[SCREEN SHARE] Cannot share screen outside an active call or meeting');
      return;
    }

    if (screenShareStateRef.current === 'SHARING' || screenShareStateRef.current === 'STARTING') {
      console.warn('[SCREEN SHARE] Already sharing or starting screen share');
      return;
    }

    // Check single sharer rule
    if (isInCall) {
      if (screenSharerUserId && screenSharerUserId !== user.id) {
        setScreenShareError('Someone is already sharing their screen.');
        return;
      }
    }
    if (isInMeeting) {
      if (activeMeetingRef.current?.activeScreenShare && activeMeetingRef.current.activeScreenShare.userId !== user.id) {
        setScreenShareError('Someone is already sharing their screen.');
        return;
      }
    }

    // Preserve previous camera state
    if (isInCall) {
      previousCameraStateRef.current = !isCameraOff;
    } else if (isInMeeting) {
      previousCameraStateRef.current = !isMeetingCameraOff;
    }

    screenShareStateRef.current = 'STARTING';
    setScreenShareState('STARTING');
    setScreenShareError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
    } catch (err: any) {
      console.error('[SCREEN SHARE] getDisplayMedia error:', err);
      const name = err?.name || '';
      screenShareStateRef.current = 'NOT_SHARING';
      setScreenShareState('NOT_SHARING');

      if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'AbortError') {
        const isUserCancelled =
          err?.message?.toLowerCase().includes('cancel') ||
          err?.message?.toLowerCase().includes('denied by user') ||
          !err?.message;
        if (!isUserCancelled) {
          setScreenShareError('Screen sharing was cancelled or permission was denied.');
        }
        return;
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setScreenShareError('No screen or window was available to share.');
        return;
      }
      setScreenShareError('Screen sharing could not be started.');
      return;
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      setScreenShareError('No video track available from screen capture.');
      screenShareStateRef.current = 'NOT_SHARING';
      setScreenShareState('NOT_SHARING');
      return;
    }

    screenTrackRef.current = videoTrack;
    screenStreamRef.current = stream;
    setScreenStream(stream);

    // Attach native browser stop sharing event
    videoTrack.onended = () => {
      console.log('[SCREEN SHARE] Detected native browser stop sharing');
      stopScreenShare();
    };

    // 1:1 WebRTC Track Replacement
    if (isInCall && peerConnectionRef.current) {
      try {
        const senders = peerConnectionRef.current.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video') || senders.find((s) => !s.track);
        if (videoSender) {
          await videoSender.replaceTrack(videoTrack);
          console.log('[SCREEN SHARE] Replaced video sender track with screen track in RTCPeerConnection');
        } else {
          peerConnectionRef.current.addTrack(videoTrack, stream);
        }
      } catch (e) {
        console.error('[SCREEN SHARE] RTCPeerConnection track replacement error:', e);
      }

      if (activeCallRef.current) {
        sendWsMessage({
          type: 'SCREEN_SHARE_START',
          payload: {
            callId: activeCallRef.current.callId,
            conversationId: activeCallRef.current.conversationId,
          },
        });
      }
    }

    // Group Meeting Track Replacement for each mesh peer
    if (isInMeeting) {
      for (const [peerUserId, pc] of meetingPeersRef.current.entries()) {
        try {
          const senders = pc.getSenders();
          const videoSender = senders.find((s) => s.track && s.track.kind === 'video') || senders.find((s) => !s.track);
          if (videoSender) {
            await videoSender.replaceTrack(videoTrack);
            console.log(`[SCREEN SHARE] Replaced video sender track with screen track for meeting peer ${peerUserId}`);
          } else {
            pc.addTrack(videoTrack, stream);
          }
        } catch (e) {
          console.error(`[SCREEN SHARE] Failed to replace screen track for meeting peer ${peerUserId}:`, e);
        }
      }

      if (activeMeetingRef.current) {
        sendWsMessage({
          type: 'SCREEN_SHARE_START',
          payload: {
            meetingId: activeMeetingRef.current.meetingId,
            conversationId: activeMeetingRef.current.conversationId,
          },
        });
      }
    }

    screenShareStateRef.current = 'SHARING';
    setScreenShareState('SHARING');
    setScreenSharerUserId(user.id);
    const emp = (user as any)?.employee;
    const myDisplayName = emp?.firstName || emp?.lastName
      ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim()
      : (user as any)?.displayName || (user?.role === 'SUPER_ADMIN' ? 'Super Admin' : (user?.email?.split('@')[0] || 'You'));
    setScreenSharerName(myDisplayName);
  }, [user, isCameraOff, isMeetingCameraOff, sendWsMessage, screenSharerUserId, stopScreenShare]);

  // Start outgoing 1:1 Audio/Video Call with readiness guard and accurate caller name
  const startCall = useCallback(
    async ({
      conversationId,
      targetUserId,
      targetUserName,
      targetUserAvatar,
      callType,
    }: {
      conversationId: string;
      targetUserId: string;
      targetUserName: string;
      targetUserAvatar?: string | null;
      callType: 'AUDIO' | 'VIDEO';
    }) => {
      if (!user) return;

      // Ensure collaboration socket is genuinely connected
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.warn('[CALL DEBUG] [CLIENT] Cannot start call: WebSocket is not open');
        cleanupCall('FAILED', 'Collaboration connection is reconnecting. Please wait a moment.');
        return;
      }

      if (callStateRef.current !== 'IDLE') {
        console.warn('[CALL DEBUG] [CLIENT] Cannot start call: already in state', callStateRef.current);
        return;
      }

      const isVideo = callType === 'VIDEO';
      const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const emp = (user as any)?.employee;
      const callerName = emp?.firstName || emp?.lastName
        ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim()
        : (user as any)?.displayName || (user?.role === 'SUPER_ADMIN' ? 'Super Admin' : (user?.email?.split('@')[0] || 'You'));
      const callerAvatar = emp?.profilePhotoUrl || (user as any)?.profilePhotoUrl || null;

      const callInfo: ActiveCall = {
        callId,
        conversationId,
        callerUserId: user.id,
        calleeUserId: targetUserId,
        callerName,
        callerAvatar,
        otherUserName: targetUserName,
        otherUserAvatar: targetUserAvatar,
        callType,
        isInitiator: true,
      };

      updateActiveCall(callInfo);
      updateCallState('OUTGOING_CALLING');
      console.log('==================================================');
      console.log('[CALL DEBUG] [CALLER FRONTEND]');
      console.log(`[CALL] call event: CALL_INVITE (callId=${callId}, caller=${callerName}, target=${targetUserId})`);

      // 1. Acquire local media stream
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: isVideo,
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
      } catch (err: any) {
        console.error('[CALL DEBUG] [CLIENT] Media permission error in startCall:', err);
        const msg = getMediaErrorMessage(err, isVideo);
        cleanupCall('FAILED', msg);
        return;
      }

      // 2. Initialize RTCPeerConnection
      try {
        const pc = new RTCPeerConnection({ iceServers: getIceServers() });
        peerConnectionRef.current = pc;

        // Add local tracks to peer connection
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // Handle remote tracks
        pc.ontrack = (event) => {
          console.log('[CALL DEBUG] [CLIENT] Caller ontrack received streams:', event.streams.length);
          if (event.streams && event.streams[0]) {
            remoteStreamRef.current = event.streams[0];
            setRemoteStream(event.streams[0]);
          }
        };

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            console.log('[CALL DEBUG] [CLIENT] Caller generated ICE candidate');
            sendWsMessage({
              type: 'CALL_ICE_CANDIDATE',
              payload: {
                callId,
                conversationId,
                candidate: event.candidate,
              },
            });
          }
        };

        // Handle connection state changes
        pc.onconnectionstatechange = () => {
          console.log('[CALL DEBUG] [CLIENT] Caller connectionState:', pc.connectionState);
          if (pc.connectionState === 'connected') {
            soundManager.stopIncomingCallRingtone();
            if (ringingTimeoutRef.current) {
              clearTimeout(ringingTimeoutRef.current);
              ringingTimeoutRef.current = null;
            }
            updateCallState('CONNECTED');
          } else if (pc.connectionState === 'failed') {
            cleanupCall('FAILED', 'Call connection failed.');
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log('[CALL DEBUG] [CLIENT] Caller iceConnectionState:', pc.iceConnectionState);
          if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            soundManager.stopIncomingCallRingtone();
            if (ringingTimeoutRef.current) {
              clearTimeout(ringingTimeoutRef.current);
              ringingTimeoutRef.current = null;
            }
            updateCallState('CONNECTED');
          }
        };

        // 3. Create SDP offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log('[CALL DEBUG] [CLIENT] Caller created and set local SDP offer');

        // 4. Send call invite (including offer SDP and accurate callerName) through WebSocket
        sendWsMessage({
          type: 'CALL_INVITE',
          payload: {
            callId,
            conversationId,
            callType,
            callerName,
            callerAvatar,
            sdp: offer,
          },
        });

        // 5. Send explicit CALL_OFFER for redundancy
        sendWsMessage({
          type: 'CALL_OFFER',
          payload: {
            callId,
            conversationId,
            sdp: offer,
          },
        });

        // 6. 30s ringing timeout
        ringingTimeoutRef.current = setTimeout(() => {
          if (callStateRef.current === 'OUTGOING_CALLING' || callStateRef.current === 'OUTGOING_RINGING') {
            console.log('[CALL DEBUG] [CLIENT] Outgoing call 30s timeout reached, cancelling');
            sendWsMessage({
              type: 'CALL_CANCEL',
              payload: { callId, conversationId },
            });
            cleanupCall('MISSED', 'No answer from recipient.');
          }
        }, RINGING_TIMEOUT_MS);
      } catch (err: any) {
        console.error('[CALL DEBUG] [CLIENT] PeerConnection init error:', err);
        cleanupCall('FAILED', err?.message || 'Failed to establish call.');
      }
    },
    [user, cleanupCall, updateActiveCall, updateCallState, sendWsMessage]
  );

  // Accept incoming call
  const acceptCall = useCallback(async () => {
    const currentCall = activeCallRef.current;
    if (!currentCall || !user) {
      console.warn('[CALL DEBUG] [CLIENT] acceptCall invoked without activeCall or user');
      return;
    }

    console.log('[CALL DEBUG] [CLIENT] acceptCall invoked for callId=', currentCall.callId);

    soundManager.stopIncomingCallRingtone();
    if (ringingTimeoutRef.current) {
      clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = null;
    }

    updateCallState('CONNECTING');

    // 1. Acquire local media stream
    const isVideo = currentCall.callType === 'VIDEO';
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
    } catch (err: any) {
      console.error('[CALL DEBUG] [CLIENT] Permission/device error on acceptCall:', err);
      const localMsg = getMediaErrorMessage(err, isVideo);
      const emp = (user as any)?.employee;
      const myDisplayName = emp?.firstName || emp?.lastName
        ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim()
        : (user as any)?.displayName || (user?.role === 'SUPER_ADMIN' ? 'Super Admin' : (user?.email?.split('@')[0] || 'Recipient'));
      const peerMsg = isVideo
        ? `${myDisplayName} couldn't access their camera or microphone.`
        : `${myDisplayName} couldn't access their microphone.`;

      // CRITICAL FIX: Send CALL_FAILED (never CALL_REJECT) because recipient clicked Accept
      sendWsMessage({
        type: 'CALL_FAILED',
        payload: {
          callId: currentCall.callId,
          conversationId: currentCall.conversationId,
          reason: peerMsg,
        },
      });

      cleanupCall('FAILED', localMsg);
      return;
    }

    // 2. Initialize RTCPeerConnection
    try {
      const pc = new RTCPeerConnection({ iceServers: getIceServers() });
      peerConnectionRef.current = pc;

      // Add local tracks
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Handle remote tracks
      pc.ontrack = (event) => {
        console.log('[CALL DEBUG] [CLIENT] Callee ontrack received streams:', event.streams.length);
        if (event.streams && event.streams[0]) {
          remoteStreamRef.current = event.streams[0];
          setRemoteStream(event.streams[0]);
        }
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('[CALL DEBUG] [CLIENT] Callee generated ICE candidate');
          sendWsMessage({
            type: 'CALL_ICE_CANDIDATE',
            payload: {
              callId: currentCall.callId,
              conversationId: currentCall.conversationId,
              candidate: event.candidate,
            },
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('[CALL DEBUG] [CLIENT] Callee connectionState:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          updateCallState('CONNECTED');
        } else if (pc.connectionState === 'failed') {
          cleanupCall('FAILED', 'Call connection failed.');
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[CALL DEBUG] [CLIENT] Callee iceConnectionState:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          updateCallState('CONNECTED');
        }
      };

      // 3. Set remote description from stored offer
      if (remoteOfferSdpRef.current) {
        console.log('[CALL DEBUG] [CLIENT] Callee setting remote description from offer');
        await pc.setRemoteDescription(new RTCSessionDescription(remoteOfferSdpRef.current));
      } else {
        console.warn('[CALL DEBUG] [CLIENT] Callee has no remote offer SDP yet, awaiting CALL_OFFER');
      }

      // 4. Flush queued ICE candidates
      while (pendingIceCandidatesRef.current.length > 0) {
        const candidate = pendingIceCandidatesRef.current.shift();
        if (candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch {}
        }
      }

      // 5. Create answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log('[CALL DEBUG] [CLIENT] Callee created and set local SDP answer');

      // 6. Notify server and caller
      sendWsMessage({
        type: 'CALL_ACCEPT',
        payload: {
          callId: currentCall.callId,
          conversationId: currentCall.conversationId,
        },
      });

      sendWsMessage({
        type: 'CALL_ANSWER',
        payload: {
          callId: currentCall.callId,
          conversationId: currentCall.conversationId,
          sdp: answer,
        },
      });
    } catch (err: any) {
      console.error('[CALL DEBUG] [CLIENT] Accept negotiation error:', err);
      cleanupCall('FAILED', 'Failed to connect call.');
    }
  }, [user, cleanupCall, updateCallState, sendWsMessage]);

  // Reject incoming call
  const rejectCall = useCallback(() => {
    const currentCall = activeCallRef.current;
    console.log('[CALL DEBUG] [CLIENT] rejectCall invoked callId=', currentCall?.callId);
    if (currentCall) {
      sendWsMessage({
        type: 'CALL_REJECT',
        payload: {
          callId: currentCall.callId,
          conversationId: currentCall.conversationId,
          reason: 'Call declined',
        },
      });
    }
    cleanupCall('REJECTED');
  }, [cleanupCall, sendWsMessage]);

  // Cancel outgoing call
  const cancelCall = useCallback(() => {
    const currentCall = activeCallRef.current;
    console.log('[CALL DEBUG] [CLIENT] cancelCall invoked callId=', currentCall?.callId);
    if (currentCall) {
      sendWsMessage({
        type: 'CALL_CANCEL',
        payload: {
          callId: currentCall.callId,
          conversationId: currentCall.conversationId,
        },
      });
    }
    cleanupCall('CANCELLED');
  }, [cleanupCall, sendWsMessage]);

  // End active call
  const endCall = useCallback(() => {
    const currentCall = activeCallRef.current;
    console.log('[CALL DEBUG] [CLIENT] endCall invoked callId=', currentCall?.callId);
    if (currentCall) {
      sendWsMessage({
        type: 'CALL_END',
        payload: {
          callId: currentCall.callId,
          conversationId: currentCall.conversationId,
        },
      });
    }
    cleanupCall('ENDED');
  }, [cleanupCall, sendWsMessage]);

  // Toggle Microphone Mute/Unmute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        const nextMuted = !isMuted;
        audioTracks.forEach((t) => {
          t.enabled = !nextMuted;
        });
        setIsMuted(nextMuted);
      }
    }
  }, [isMuted]);

  // Toggle Camera On/Off
  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      if (videoTracks.length > 0) {
        const nextOff = !isCameraOff;
        videoTracks.forEach((t) => {
          t.enabled = !nextOff;
        });
        setIsCameraOff(nextOff);
      }
    }
  }, [isCameraOff]);

  // Fetch initial conversations and presence
  const fetchInitialData = useCallback(async () => {
    if (!userId) return;
    try {
      setIsLoadingConversations(true);
      const [presRes, convRes] = await Promise.all([
        collaborationApi.getPresence().catch(() => null),
        collaborationApi.getConversations().catch(() => null),
      ]);
      if (presRes?.presence) {
        setPresence(presRes.presence);
        if (typeof window !== 'undefined') {
          localStorage.setItem('workos_user_presence_cache', JSON.stringify(presRes.presence));
        }
      }
      if (convRes?.conversations) {
        setConversations(convRes.conversations);
      }
    } catch (err) {
      console.error('[Collaboration] Failed to load initial state:', err);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [userId]);

  // Set active conversation
  const setActiveConversationId = useCallback(
    (id: string | null) => {
      activeConversationIdRef.current = id;
      setActiveConversationIdState(id);
      sendWsMessage({
        type: 'SET_ACTIVE_CONVERSATION',
        conversationId: id,
      });
      if (id) {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
        );
        collaborationApi.markConversationAsRead(id).catch(() => {});
      }
    },
    [sendWsMessage]
  );

  // Update presence status manually
  const setUserStatus = useCallback(
    async (status: UserPresenceStatus, customStatusMessage?: string | null) => {
      try {
        isAutoAwayRef.current = false;
        const res = await collaborationApi.setPresenceStatus({ status, customStatusMessage });
        if (res.presence) {
          setPresence(res.presence);
          if (typeof window !== 'undefined') {
            localStorage.setItem('workos_user_presence_cache', JSON.stringify(res.presence));
          }
        }
        sendWsMessage({
          type: 'SET_STATUS',
          status,
          customStatusMessage,
        });
      } catch (err) {
        console.error('[Collaboration] Failed to update presence status:', err);
      }
    },
    [sendWsMessage]
  );

  // Send typing indicator
  const sendTyping = useCallback(
    (conversationId: string, isTyping: boolean) => {
      const now = Date.now();
      if (isTyping && now - lastTypingSentRef.current < 2500) return;
      lastTypingSentRef.current = now;

      sendWsMessage({
        type: isTyping ? 'TYPING_START' : 'TYPING_STOP',
        conversationId,
      });
    },
    [sendWsMessage]
  );

  // Authoritative WebSocket Lifecycle
  useEffect(() => {
    isMountedRef.current = true;

    if (!userId) {
      // Disconnect when logged out
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (socketRef.current) {
        const staleWs = socketRef.current;
        socketRef.current = null;
        staleWs.onopen = null;
        staleWs.onmessage = null;
        staleWs.onclose = null;
        staleWs.onerror = null;
        try {
          staleWs.close(1000, 'User logged out');
        } catch {}
      }
      socketInstanceIdRef.current = 0;
      setConnectionStatus('DISCONNECTED');
      setIsConnected(false);
      setIsReady(false);
      return;
    }

    // Load initial data
    fetchInitialData();

    // Establish WebSocket Connection
    const connectWebSocket = (isReconnect = false) => {
      if (!isMountedRef.current) return;

      // Close previous connection if still hanging
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        return;
      }

      const instanceId = nextInstanceIdRef.current++;
      socketInstanceIdRef.current = instanceId;

      setConnectionStatus(isReconnect ? 'RECONNECTING' : 'CONNECTING');
      console.log(`[COLLAB STATE] userId=${userId} socketState=CONNECTING providerState=${isReconnect ? 'RECONNECTING' : 'CONNECTING'} socketInstanceId=${instanceId}`);
      console.log(`[COLLAB CONNECT] connecting (instance #${instanceId})`);

      const token = api.getToken() || (typeof window !== 'undefined' ? localStorage.getItem('workos_access_token') : null);
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      let wsHost = process.env.NEXT_PUBLIC_WS_URL;
      if (!wsHost) {
        if (process.env.NEXT_PUBLIC_API_URL) {
          try {
            const apiUrlObj = new URL(process.env.NEXT_PUBLIC_API_URL);
            wsHost = apiUrlObj.host;
          } catch {
            wsHost = window.location.hostname + ':4000';
          }
        } else {
          wsHost = window.location.hostname + (process.env.NEXT_PUBLIC_BACKEND_PORT ? `:${process.env.NEXT_PUBLIC_BACKEND_PORT}` : ':4000');
        }
      }

      const cleanWsUrl = `${wsProtocol}//${wsHost}/api/collaboration/ws`;
      const fullWsUrl = `${cleanWsUrl}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      console.log(`[COLLAB WS] Connecting to: ${cleanWsUrl}`);

      try {
        const ws = new WebSocket(fullWsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          if (!isMountedRef.current || socketInstanceIdRef.current !== instanceId) {
            console.log(`[COLLAB WS] Ignoring onopen from stale socket instance #${instanceId}`);
            try { ws.close(); } catch {}
            return;
          }

          console.log(`[COLLAB CONNECT] connected (instance #${instanceId})`);
          console.log(`[COLLAB STATE] userId=${userId} socketState=OPEN providerState=CONNECTED socketInstanceId=${instanceId}`);
          setIsConnected(true);
          setConnectionStatus('CONNECTED');
          setIsReady(true);
          reconnectAttemptRef.current = 0;

          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }

          // Restore active conversation if already selected
          if (activeConversationIdRef.current) {
            ws.send(
              JSON.stringify({
                type: 'SET_ACTIVE_CONVERSATION',
                conversationId: activeConversationIdRef.current,
              })
            );
          }
        };

        ws.onmessage = async (event) => {
          if (!isMountedRef.current || socketInstanceIdRef.current !== instanceId) {
            return;
          }
          try {
            const data = JSON.parse(event.data);
            console.log(`[COLLAB WS] message received: ${data.type}`);

            switch (data.type) {
              case 'CONNECTED':
                if (data.payload?.presence) {
                  setPresence(data.payload.presence);
                } else if (data.presence) {
                  setPresence(data.presence);
                }
                setIsReady(true);
                break;

              case 'PONG':
                // Heartbeat response
                break;

              case 'PRESENCE_CHANGE': {
                const { userId: presUserId, status, customStatusMessage, lastSeenAt } = data.payload || {};
                if (presUserId === userId) {
                  setPresence((prev) => ({
                    id: prev?.id || presUserId,
                    userId: presUserId,
                    status,
                    customStatusMessage,
                    lastSeenAt: lastSeenAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  }));
                }
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.type === 'DIRECT' && c.otherUser?.id === presUserId) {
                      return {
                        ...c,
                        otherUser: {
                          ...c.otherUser,
                          presence: {
                            id: presUserId,
                            userId: presUserId,
                            status,
                            customStatusMessage,
                            lastSeenAt: lastSeenAt || new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                          },
                        },
                      } as Conversation;
                    }
                    return c;
                  })
                );
                break;
              }

              case 'NEW_MESSAGE':
              case 'MESSAGE_CREATED': {
                const { conversationId, message } = data.payload || {};
                if (!conversationId || !message) return;

                const isOwnMessage = message.senderUserId === userId;
                if (!isOwnMessage && message.id) {
                  soundManager.playIncomingMessageSound(message.id);
                }

                setIncomingMessage({ conversationId, message, timestamp: Date.now() });

                setConversations((prev) => {
                  const existingIdx = prev.findIndex((c) => c.id === conversationId);
                  const isCurrentActive = activeConversationIdRef.current === conversationId;

                  if (existingIdx >= 0) {
                    const existing = prev[existingIdx];
                    const updated = {
                      ...existing,
                      lastMessage: message,
                      lastMessageAt: message.createdAt,
                      unreadCount:
                        isCurrentActive || isOwnMessage
                          ? 0
                          : (existing.unreadCount || 0) + 1,
                    };
                    const rest = prev.filter((_, i) => i !== existingIdx);
                    return [updated, ...rest];
                  } else {
                    collaborationApi.getConversations().then((res) => {
                      if (res?.conversations) setConversations(res.conversations);
                    });
                    return prev;
                  }
                });
                break;
              }

              case 'MESSAGE_REACTION': {
                const { conversationId, messageId, reactions } = data.payload || {};
                if (conversationId && messageId && reactions) {
                  setIncomingReaction({ conversationId, messageId, reactions });
                }
                break;
              }

              case 'MESSAGE_READ': {
                const { conversationId, userId: readUserId } = data.payload || {};
                if (readUserId === userId && conversationId) {
                  setConversations((prev) =>
                    prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
                  );
                }
                break;
              }

              case 'GROUP_MEMBER_ADDED':
              case 'GROUP_MEMBER_REMOVED':
              case 'GROUP_MEMBER_LEFT':
              case 'MEMBER_JOINED': {
                collaborationApi.getConversations().then((res) => {
                  if (res?.conversations) setConversations(res.conversations);
                }).catch(() => {});
                break;
              }

              case 'TYPING_START':
              case 'USER_TYPING': {
                const { conversationId, userId: typingUid, displayName } = data.payload || {};
                if (conversationId && typingUid && typingUid !== userId) {
                  setTypingUsers((prev) => ({
                    ...prev,
                    [conversationId]: {
                      ...(prev[conversationId] || {}),
                      [typingUid]: { displayName: displayName || 'Someone', timestamp: Date.now() },
                    },
                  }));
                }
                break;
              }

              case 'TYPING_STOP':
              case 'USER_STOP_TYPING': {
                const { conversationId, userId: stopUid } = data.payload || {};
                if (conversationId && stopUid) {
                  setTypingUsers((prev) => {
                    const convTyping = { ...(prev[conversationId] || {}) };
                    delete convTyping[stopUid];
                    return { ...prev, [conversationId]: convTyping };
                  });
                }
                break;
              }

              // ==========================================
              // WebRTC Calling Signaling Events
              // ==========================================
              case 'CALL_INVITE': {
                const { callId, conversationId, callerUserId, callerName, callerAvatar, callType, sdp } = data.payload || {};
                console.log(`[CALL] call event: CALL_INVITE received (callId=${callId}, caller=${callerUserId}, callerName=${callerName})`);

                // If user is already on a call, auto reply busy
                if (callStateRef.current !== 'IDLE') {
                  console.log(`[CALL DEBUG] [CLIENT] User is busy (state=${callStateRef.current}), sending CALL_BUSY`);
                  sendWsMessage({
                    type: 'CALL_BUSY',
                    payload: { callId, conversationId, calleeUserId: userId },
                  });
                  return;
                }

                if (sdp) {
                  remoteOfferSdpRef.current = sdp;
                }

                const resolvedCallerName = callerName && callerName !== 'Caller' && callerName !== 'Colleague'
                  ? callerName
                  : 'Colleague';

                const incomingInfo: ActiveCall = {
                  callId,
                  conversationId,
                  callerUserId,
                  calleeUserId: userId || '',
                  callerName: resolvedCallerName,
                  callerAvatar,
                  otherUserName: resolvedCallerName,
                  otherUserAvatar: callerAvatar,
                  callType: callType === 'VIDEO' ? 'VIDEO' : 'AUDIO',
                  isInitiator: false,
                };

                updateActiveCall(incomingInfo);
                updateCallState('INCOMING_RINGING');
                setCallError(null);

                // Play incoming call ringtone
                soundManager.playIncomingCallRingtone();

                // Send ringing acknowledgement
                sendWsMessage({
                  type: 'CALL_RINGING',
                  payload: { callId, conversationId },
                });

                // Auto-timeout after 30s
                if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
                ringingTimeoutRef.current = setTimeout(() => {
                  if (callStateRef.current === 'INCOMING_RINGING') {
                    console.log('[CALL DEBUG] [CLIENT] Incoming call 30s timeout reached, marking MISSED');
                    cleanupCall('MISSED');
                  }
                }, RINGING_TIMEOUT_MS);
                break;
              }

              case 'CALL_RINGING': {
                console.log(`[CALL] call event: CALL_RINGING (state=${callStateRef.current})`);
                if (callStateRef.current === 'OUTGOING_CALLING') {
                  updateCallState('OUTGOING_RINGING');
                }
                break;
              }

              case 'CALL_ACCEPT': {
                console.log(`[CALL] call event: CALL_ACCEPT (state=${callStateRef.current})`);
                if (callStateRef.current === 'OUTGOING_CALLING' || callStateRef.current === 'OUTGOING_RINGING') {
                  updateCallState('CONNECTING');
                  if (ringingTimeoutRef.current) {
                    clearTimeout(ringingTimeoutRef.current);
                    ringingTimeoutRef.current = null;
                  }
                }
                break;
              }

              case 'CALL_OFFER': {
                const { sdp } = data.payload || {};
                console.log(`[CALL] call event: CALL_OFFER (hasSdp=${Boolean(sdp)})`);
                if (sdp) {
                  remoteOfferSdpRef.current = sdp;
                  if (peerConnectionRef.current) {
                    try {
                      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
                      console.log('[CALL DEBUG] [CLIENT] Applied remote description from CALL_OFFER');
                    } catch (e) {
                      console.error('[CALL DEBUG] [CLIENT] setRemoteDescription error:', e);
                    }
                  }
                }
                break;
              }

              case 'CALL_ANSWER': {
                const { sdp } = data.payload || {};
                console.log(`[CALL] call event: CALL_ANSWER (hasSdp=${Boolean(sdp)})`);
                if (sdp && peerConnectionRef.current) {
                  try {
                    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
                    console.log('[CALL DEBUG] [CLIENT] Caller applied remote description from CALL_ANSWER');
                    // Flush any pending ICE candidates
                    while (pendingIceCandidatesRef.current.length > 0) {
                      const candidate = pendingIceCandidatesRef.current.shift();
                      if (candidate) {
                        try {
                          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
                        } catch {}
                      }
                    }
                  } catch (e) {
                    console.error('[CALL DEBUG] [CLIENT] setRemoteDescription answer error:', e);
                  }
                }
                break;
              }

              case 'CALL_ICE_CANDIDATE': {
                const { candidate } = data.payload || {};
                if (candidate) {
                  if (peerConnectionRef.current && peerConnectionRef.current.remoteDescription) {
                    try {
                      await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
                    } catch (e) {
                      console.error('[CALL DEBUG] [CLIENT] addIceCandidate error:', e);
                    }
                  } else {
                    pendingIceCandidatesRef.current.push(candidate);
                  }
                }
                break;
              }

              case 'CALL_BUSY': {
                console.log('[CALL] call event: CALL_BUSY');
                cleanupCall('FAILED', 'User is currently on another call.');
                break;
              }

              case 'CALL_REJECT': {
                console.log('[CALL] call event: CALL_REJECT');
                cleanupCall('REJECTED', 'Call was declined.');
                break;
              }

              case 'CALL_CANCEL': {
                console.log('[CALL] call event: CALL_CANCEL');
                cleanupCall('CANCELLED', 'Call was cancelled.');
                break;
              }

              case 'CALL_END': {
                console.log('[CALL] call event: CALL_END');
                cleanupCall('ENDED', 'Call ended.');
                break;
              }

              case 'CALL_FAILED': {
                const reason = data.payload?.reason || 'Call failed';
                console.log(`[CALL] call event: CALL_FAILED (${reason})`);
                cleanupCall('FAILED', reason);
                break;
              }

              // ==========================================
              // Phase 2B — Group Meetings Signaling Events
              // ==========================================
              case 'MEETING_STARTED': {
                const meeting: PublicMeetingState = data.payload?.meeting;
                if (!meeting) break;
                console.log(`[MEETING] Event: MEETING_STARTED (meetingId=${meeting.meetingId}, convId=${meeting.conversationId}, host=${meeting.hostUserId})`);

                setActiveGroupMeetings((prev) => ({
                  ...prev,
                  [meeting.conversationId]: meeting,
                }));

                // If current user is the host who initiated the meeting
                if (meeting.hostUserId === userId) {
                  updateActiveMeeting(meeting);
                  updateMeetingState('ACTIVE');
                  setMeetingError(null);
                } else {
                  // Other group member receives incoming meeting notification
                  setIncomingMeeting({ meeting, isDismissed: false });
                  soundManager.playIncomingMessageSound(`meeting_${meeting.meetingId}`);
                }
                break;
              }

              case 'MEETING_JOINED': {
                const meeting: PublicMeetingState = data.payload?.meeting;
                if (!meeting) break;
                console.log(`[MEETING] Event: MEETING_JOINED (meetingId=${meeting.meetingId})`);

                updateActiveMeeting(meeting);
                updateMeetingState('ACTIVE');
                setMeetingError(null);
                setIncomingMeeting(null);

                setActiveGroupMeetings((prev) => ({
                  ...prev,
                  [meeting.conversationId]: meeting,
                }));
                break;
              }

              case 'MEETING_PARTICIPANT_JOINED': {
                const { meetingId, participant } = data.payload || {};
                console.log(`[MEETING] Event: MEETING_PARTICIPANT_JOINED user=${participant?.userId} name=${participant?.displayName}`);

                if (activeMeetingRef.current && activeMeetingRef.current.meetingId === meetingId && participant) {
                  setActiveMeeting((prev) => {
                    if (!prev) return prev;
                    const existingIdx = prev.participants.findIndex((p) => p.userId === participant.userId);
                    let updatedList: MeetingParticipantInfo[];
                    if (existingIdx >= 0) {
                      updatedList = prev.participants.map((p, idx) => (idx === existingIdx ? participant : p));
                    } else {
                      updatedList = [...prev.participants, participant];
                    }
                    const next = { ...prev, participants: updatedList };
                    activeMeetingRef.current = next;
                    return next;
                  });

                  // If we are already in the meeting, initiate mesh peer offer to the newly joined participant
                  if (participant.userId !== userId) {
                    try {
                      console.log(`[MEETING MESH] Initiating peer connection & offer to newly joined user ${participant.userId}`);
                      const pc = createMeetingPeerConnection(participant.userId);
                      pc.createOffer().then((offer) => {
                        return pc.setLocalDescription(offer).then(() => {
                          console.log(`[MEETING MESH] Created & sent offer to ${participant.userId}`);
                          sendWsMessage({
                            type: 'MEETING_PEER_OFFER',
                            payload: {
                              meetingId,
                              targetUserId: participant.userId,
                              sdp: offer,
                            },
                          });
                        });
                      }).catch((err) => {
                        console.error(`[MEETING MESH] Create offer error for ${participant.userId}:`, err);
                      });
                    } catch (e) {
                      console.error(`[MEETING MESH] Error establishing peer connection with ${participant.userId}:`, e);
                    }
                  }
                }
                break;
              }

              case 'MEETING_PEER_OFFER': {
                const { meetingId, fromUserId, sdp } = data.payload || {};
                console.log(`[MEETING MESH] Received MEETING_PEER_OFFER from fromUserId=${fromUserId} meetingId=${meetingId}`);
                if (fromUserId && sdp) {
                  try {
                    const pc = createMeetingPeerConnection(fromUserId);
                    pc.setRemoteDescription(new RTCSessionDescription(sdp)).then(() => {
                      // Flush queued ICE candidates
                      const queued = pendingMeetingIceCandidatesRef.current.get(fromUserId) || [];
                      while (queued.length > 0) {
                        const candidate = queued.shift();
                        if (candidate) {
                          try { pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
                        }
                      }
                      pendingMeetingIceCandidatesRef.current.delete(fromUserId);

                      return pc.createAnswer().then((answer) => {
                        return pc.setLocalDescription(answer).then(() => {
                          console.log(`[MEETING MESH] Created & sent answer to ${fromUserId}`);
                          sendWsMessage({
                            type: 'MEETING_PEER_ANSWER',
                            payload: {
                              meetingId,
                              targetUserId: fromUserId,
                              sdp: answer,
                            },
                          });
                        });
                      });
                    }).catch((e) => {
                      console.error(`[MEETING MESH] Error answering offer from ${fromUserId}:`, e);
                    });
                  } catch (e) {
                    console.error(`[MEETING MESH] Error handling offer from ${fromUserId}:`, e);
                  }
                }
                break;
              }

              case 'MEETING_PEER_ANSWER': {
                const { meetingId, fromUserId, sdp } = data.payload || {};
                console.log(`[MEETING MESH] Received MEETING_PEER_ANSWER from fromUserId=${fromUserId} meetingId=${meetingId}`);
                if (fromUserId && sdp) {
                  const pc = meetingPeersRef.current.get(fromUserId);
                  if (pc) {
                    pc.setRemoteDescription(new RTCSessionDescription(sdp)).then(() => {
                      console.log(`[MEETING MESH] Applied remote answer from ${fromUserId}`);
                      // Flush queued ICE candidates
                      const queued = pendingMeetingIceCandidatesRef.current.get(fromUserId) || [];
                      while (queued.length > 0) {
                        const candidate = queued.shift();
                        if (candidate) {
                          try { pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
                        }
                      }
                      pendingMeetingIceCandidatesRef.current.delete(fromUserId);
                    }).catch((e) => {
                      console.error(`[MEETING MESH] Error setting remote description from ${fromUserId}:`, e);
                    });
                  }
                }
                break;
              }

              case 'MEETING_PEER_ICE_CANDIDATE': {
                const { meetingId, fromUserId, candidate } = data.payload || {};
                if (fromUserId && candidate) {
                  const pc = meetingPeersRef.current.get(fromUserId);
                  if (pc && pc.remoteDescription) {
                    try {
                      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((e) => {
                        console.warn(`[MEETING MESH] Error adding ICE candidate from ${fromUserId}:`, e);
                      });
                    } catch (e) {
                      console.warn(`[MEETING MESH] Error adding ICE candidate from ${fromUserId}:`, e);
                    }
                  } else {
                    const queued = pendingMeetingIceCandidatesRef.current.get(fromUserId) || [];
                    queued.push(candidate);
                    pendingMeetingIceCandidatesRef.current.set(fromUserId, queued);
                  }
                }
                break;
              }

              case 'MEETING_PARTICIPANT_LEFT': {
                const { meetingId, userId: leftUid } = data.payload || {};
                console.log(`[MEETING] Event: MEETING_PARTICIPANT_LEFT user=${leftUid}`);

                if (leftUid) {
                  const pc = meetingPeersRef.current.get(leftUid);
                  if (pc) {
                    try {
                      pc.onicecandidate = null;
                      pc.ontrack = null;
                      pc.onconnectionstatechange = null;
                      pc.close();
                    } catch {}
                    meetingPeersRef.current.delete(leftUid);
                  }
                  remoteMeetingStreamsRef.current.delete(leftUid);
                  setRemoteMeetingStreams((prev) => {
                    const next = { ...prev };
                    delete next[leftUid];
                    return next;
                  });
                  pendingMeetingIceCandidatesRef.current.delete(leftUid);
                }

                if (activeMeetingRef.current && activeMeetingRef.current.meetingId === meetingId && leftUid) {
                  setActiveMeeting((prev) => {
                    if (!prev) return prev;
                    const updatedList = prev.participants.filter((p) => p.userId !== leftUid);
                    const next = { ...prev, participants: updatedList };
                    activeMeetingRef.current = next;
                    return next;
                  });
                }
                break;
              }

              case 'MEETING_PARTICIPANT_UPDATED': {
                const { meetingId, participant } = data.payload || {};
                if (activeMeetingRef.current && activeMeetingRef.current.meetingId === meetingId && participant) {
                  setActiveMeeting((prev) => {
                    if (!prev) return prev;
                    const updatedList = prev.participants.map((p) => (p.userId === participant.userId ? participant : p));
                    const next = { ...prev, participants: updatedList };
                    activeMeetingRef.current = next;
                    return next;
                  });
                }
                break;
              }

              case 'HOST_MUTED_YOU': {
                console.log('[MEETING] Host muted you');
                setIsMeetingMuted(true);
                if (meetingLocalStreamRef.current) {
                  meetingLocalStreamRef.current.getAudioTracks().forEach((t) => {
                    t.enabled = false;
                  });
                }
                setMeetingError('You were muted by the host.');
                break;
              }

              case 'HOST_REMOVED_YOU': {
                const reason = data.payload?.reason || 'You were removed from the meeting by the host.';
                console.log(`[MEETING] Host removed you: ${reason}`);
                cleanupMeeting('FAILED', reason);
                break;
              }

              case 'MEETING_ENDED': {
                const { meetingId, conversationId } = data.payload || {};
                console.log(`[MEETING] Event: MEETING_ENDED meetingId=${meetingId}`);

                if (activeMeetingRef.current && activeMeetingRef.current.meetingId === meetingId) {
                  cleanupMeeting('ENDED');
                }

                if (conversationId) {
                  setActiveGroupMeetings((prev) => {
                    const next = { ...prev };
                    delete next[conversationId];
                    return next;
                  });
                }

                setIncomingMeeting((prev) => (prev?.meeting.meetingId === meetingId ? null : prev));
                break;
              }

              case 'MEETING_LEFT': {
                const { meetingId } = data.payload || {};
                if (activeMeetingRef.current && activeMeetingRef.current.meetingId === meetingId) {
                  cleanupMeeting('IDLE');
                }
                break;
              }

              case 'MEETING_FAILED': {
                const reason = data.payload?.reason || 'Meeting failed';
                console.log(`[MEETING] Event: MEETING_FAILED (${reason})`);
                cleanupMeeting('FAILED', reason);
                break;
              }

              case 'MEETING_STATE': {
                const meeting: PublicMeetingState | null = data.payload?.meeting;
                if (meeting && meeting.status === 'ACTIVE') {
                  setActiveGroupMeetings((prev) => ({
                    ...prev,
                    [meeting.conversationId]: meeting,
                  }));

                  // If user was an active participant in this meeting, restore session
                  const userPart = meeting.participants.find((p) => p.userId === userId);
                  if (userPart && (userPart.status === 'JOINED' || userPart.status === 'JOINING')) {
                    updateActiveMeeting(meeting);
                    updateMeetingState('ACTIVE');
                  }
                } else if (data.payload?.conversationId) {
                  setActiveGroupMeetings((prev) => {
                    const next = { ...prev };
                    delete next[data.payload.conversationId];
                    return next;
                  });
                }
                break;
              }

              // ==========================================
              // Phase 2C — Screen Sharing Signaling Events
              // ==========================================
              case 'SCREEN_SHARE_STARTED':
              case 'CALL_SCREEN_SHARE_STARTED': {
                const { callId, meetingId, sharerUserId, screenShare, meeting } = data.payload || {};
                const effectiveSharerId = sharerUserId || screenShare?.userId;
                console.log(`[SCREEN SHARE] Event: SCREEN_SHARE_STARTED sharer=${effectiveSharerId}`);

                setScreenSharerUserId(effectiveSharerId);
                if (screenShare?.displayName) {
                  setScreenSharerName(screenShare.displayName);
                }

                if (effectiveSharerId === userId) {
                  screenShareStateRef.current = 'SHARING';
                  setScreenShareState('SHARING');
                } else {
                  screenShareStateRef.current = 'NOT_SHARING';
                  setScreenShareState('NOT_SHARING');
                }

                if (meeting) {
                  setActiveMeeting(meeting);
                  activeMeetingRef.current = meeting;
                }
                break;
              }

              case 'SCREEN_SHARE_STOPPED':
              case 'CALL_SCREEN_SHARE_STOPPED': {
                const { callId, meetingId, sharerUserId, meeting } = data.payload || {};
                console.log(`[SCREEN SHARE] Event: SCREEN_SHARE_STOPPED sharer=${sharerUserId}`);

                if (sharerUserId === userId) {
                  cleanupScreenShare();
                } else {
                  setScreenSharerUserId(null);
                  setScreenSharerName(null);
                  screenShareStateRef.current = 'NOT_SHARING';
                  setScreenShareState('NOT_SHARING');
                }

                if (meeting) {
                  setActiveMeeting(meeting);
                  activeMeetingRef.current = meeting;
                }
                break;
              }

              case 'SCREEN_SHARE_FAILED': {
                const reason = data.payload?.reason || 'Screen sharing could not be started.';
                console.warn(`[SCREEN SHARE] Event: SCREEN_SHARE_FAILED reason=${reason}`);
                setScreenShareError(reason);
                screenShareStateRef.current = 'NOT_SHARING';
                setScreenShareState('NOT_SHARING');
                break;
              }

              case 'PRESENCE_CHANGE': {
                const { userId: changedUid, status, customStatusMessage, lastSeenAt } = data.payload || {};
                if (changedUid === userId && status) {
                  setPresence((prev) => {
                    const next: UserPresence = {
                      id: prev?.id || userId,
                      userId,
                      status: (status === 'OFFLINE' ? 'AVAILABLE' : status) as UserPresenceStatus,
                      customStatusMessage: customStatusMessage !== undefined ? customStatusMessage : (prev?.customStatusMessage || null),
                      lastSeenAt: lastSeenAt || prev?.lastSeenAt || new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    };
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('workos_user_presence_cache', JSON.stringify(next));
                    }
                    return next;
                  });
                }
                break;
              }

              default:
                break;
            }
          } catch (err) {
            console.error('[COLLAB WS] Message parse error:', err);
          }
        };

        ws.onclose = (event) => {
          if (!isMountedRef.current || socketInstanceIdRef.current !== instanceId) {
            console.log(`[COLLAB WS] Ignoring onclose from inactive socket #${instanceId}`);
            return;
          }

          console.log(`[COLLAB DISCONNECT] reason: code=${event.code} reason=${event.reason || 'none'}`);
          console.log(`[COLLAB STATE] userId=${userId} socketState=CLOSED providerState=RECONNECTING socketInstanceId=${instanceId}`);

          setIsConnected(false);
          setIsReady(false);
          setConnectionStatus('RECONNECTING');
          socketRef.current = null;

          if (callStateRef.current !== 'IDLE') {
            cleanupCall('FAILED', 'Call connection lost.');
          }

          // Backoff reconnection
          const attempt = reconnectAttemptRef.current;
          const delay = Math.min(1000 * Math.pow(1.5, attempt), 10000) + Math.random() * 500;
          reconnectAttemptRef.current += 1;
          console.log(`[COLLAB RECONNECT] attempt: #${reconnectAttemptRef.current} (scheduled in ${Math.round(delay)}ms)`);

          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current && userId) {
              connectWebSocket(true);
            }
          }, delay);
        };

        ws.onerror = (err) => {
          if (!isMountedRef.current || socketInstanceIdRef.current !== instanceId) {
            return;
          }
          console.warn(`[COLLAB WS] Error on socket #${instanceId}`);
          try {
            ws.close();
          } catch {}
        };
      } catch (err) {
        console.error('[COLLAB WS] Connection creation error:', err);
        setIsConnected(false);
        setIsReady(false);
        setConnectionStatus('RECONNECTING');
      }
    };

    // Start initial WebSocket connection
    connectWebSocket(false);

    // Heartbeat Interval to keep connection alive and update activity
    heartbeatIntervalRef.current = setInterval(() => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'PING', isIdle: isAutoAwayRef.current }));
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Auto-clean stale typing indicators
    const typingCleanupInterval = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => {
        let changed = false;
        const next: TypingIndicatorMap = {};

        for (const [convId, userMap] of Object.entries(prev)) {
          const nextUserMap: { [uId: string]: { displayName: string; timestamp: number } } = {};
          for (const [uId, info] of Object.entries(userMap)) {
            if (now - info.timestamp < 4000) {
              nextUserMap[uId] = info;
            } else {
              changed = true;
            }
          }
          if (Object.keys(nextUserMap).length > 0) {
            next[convId] = nextUserMap;
          }
        }
        return changed ? next : prev;
      });
    }, 2000);

    return () => {
      isMountedRef.current = false;
      clearInterval(typingCleanupInterval);
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (socketRef.current) {
        const oldWs = socketRef.current;
        socketRef.current = null;
        oldWs.onopen = null;
        oldWs.onmessage = null;
        oldWs.onclose = null;
        oldWs.onerror = null;
        try {
          oldWs.close(1000, 'Cleanup on effect teardown');
        } catch {}
      }
      socketInstanceIdRef.current = 0;
    };
  }, [userId, fetchInitialData, setUserStatus, cleanupCall, updateActiveCall, updateCallState]);

  const totalUnreadCount = conversations.reduce(
    (acc, curr) => acc + (curr.unreadCount || 0),
    0
  );

  return (
    <CollaborationContext.Provider
      value={{
        connectionStatus,
        isConnected,
        isReady,
        presence,
        conversations,
        isLoadingConversations,
        activeConversationId,
        setActiveConversationId,
        setUserStatus,
        sendTyping,
        typingUsers,
        incomingMessage,
        incomingReaction,
        totalUnreadCount,
        refreshConversations: fetchInitialData,

        // Calling (1:1 Phase 2A)
        callState,
        activeCall,
        localStream,
        remoteStream,
        isMuted,
        isCameraOff,
        callDuration,
        callError,
        startCall,
        acceptCall,
        rejectCall,
        cancelCall,
        endCall,
        toggleMute,
        toggleCamera,

        // Group Meetings (Phase 2B + 2D)
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
        activeGroupMeetings,
        openMeetingLobby,
        cancelMeetingLobby,
        startMeeting,
        joinMeeting,
        leaveMeeting,
        endMeeting,
        hostMuteParticipant,
        hostRemoveParticipant,
        toggleMeetingMute,
        toggleMeetingCamera,
        dismissIncomingMeeting,
        refreshActiveMeeting,

        // Screen Sharing (Phase 2C)
        screenShareState,
        screenStream,
        screenSharerUserId,
        screenSharerName,
        screenShareError,
        isSharingScreen: screenShareState === 'SHARING' && screenSharerUserId === user?.id,
        startScreenShare,
        stopScreenShare,
      }}
    >
      {children}
    </CollaborationContext.Provider>
  );
}

const defaultCollaborationFallback: CollaborationContextType = {
  connectionStatus: 'DISCONNECTED',
  isConnected: false,
  isReady: false,
  presence: null,
  conversations: [],
  isLoadingConversations: false,
  activeConversationId: null,
  setActiveConversationId: () => {},
  setUserStatus: async () => {},
  sendTyping: () => {},
  typingUsers: {},
  incomingMessage: null,
  incomingReaction: null,
  totalUnreadCount: 0,
  refreshConversations: async () => {},
  callState: 'IDLE',
  activeCall: null,
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isCameraOff: false,
  callDuration: 0,
  callError: null,
  startCall: async () => {},
  acceptCall: async () => {},
  rejectCall: () => {},
  cancelCall: () => {},
  endCall: () => {},
  toggleMute: () => {},
  toggleCamera: () => {},

  // Group Meetings
  meetingState: 'IDLE',
  activeMeeting: null,
  incomingMeeting: null,
  lobbyTarget: null,
  meetingLocalStream: null,
  remoteMeetingStreams: {},
  isMeetingMuted: false,
  isMeetingCameraOff: false,
  meetingDuration: 0,
  meetingError: null,
  activeGroupMeetings: {},
  openMeetingLobby: () => {},
  cancelMeetingLobby: () => {},
  startMeeting: async () => {},
  joinMeeting: async () => {},
  leaveMeeting: () => {},
  endMeeting: () => {},
  hostMuteParticipant: () => {},
  hostRemoveParticipant: () => {},
  toggleMeetingMute: () => {},
  toggleMeetingCamera: () => {},
  dismissIncomingMeeting: () => {},
  refreshActiveMeeting: async () => {},

  // Screen Sharing
  screenShareState: 'NOT_SHARING',
  screenStream: null,
  screenSharerUserId: null,
  screenSharerName: null,
  screenShareError: null,
  isSharingScreen: false,
  startScreenShare: async () => {},
  stopScreenShare: () => {},
};

export function useCollaboration(): CollaborationContextType {
  const context = useContext(CollaborationContext);
  return context || defaultCollaborationFallback;
}

export function useCall() {
  const context = useContext(CollaborationContext);
  const activeCtx = context || defaultCollaborationFallback;
  return {
    callState: activeCtx.callState,
    activeCall: activeCtx.activeCall,
    localStream: activeCtx.localStream,
    remoteStream: activeCtx.remoteStream,
    isMuted: activeCtx.isMuted,
    isCameraOff: activeCtx.isCameraOff,
    callDuration: activeCtx.callDuration,
    callError: activeCtx.callError,
    screenShareState: activeCtx.screenShareState,
    screenStream: activeCtx.screenStream,
    screenSharerUserId: activeCtx.screenSharerUserId,
    screenSharerName: activeCtx.screenSharerName,
    screenShareError: activeCtx.screenShareError,
    isSharingScreen: activeCtx.isSharingScreen,
    startCall: activeCtx.startCall,
    acceptCall: activeCtx.acceptCall,
    rejectCall: activeCtx.rejectCall,
    cancelCall: activeCtx.cancelCall,
    endCall: activeCtx.endCall,
    toggleMute: activeCtx.toggleMute,
    toggleCamera: activeCtx.toggleCamera,
    startScreenShare: activeCtx.startScreenShare,
    stopScreenShare: activeCtx.stopScreenShare,
  };
}

export function useMeeting() {
  const context = useContext(CollaborationContext);
  const activeCtx = context || defaultCollaborationFallback;
  return {
    meetingState: activeCtx.meetingState,
    activeMeeting: activeCtx.activeMeeting,
    incomingMeeting: activeCtx.incomingMeeting,
    lobbyTarget: activeCtx.lobbyTarget,
    meetingLocalStream: activeCtx.meetingLocalStream,
    remoteMeetingStreams: activeCtx.remoteMeetingStreams,
    isMeetingMuted: activeCtx.isMeetingMuted,
    isMeetingCameraOff: activeCtx.isMeetingCameraOff,
    meetingDuration: activeCtx.meetingDuration,
    meetingError: activeCtx.meetingError,
    activeGroupMeetings: activeCtx.activeGroupMeetings,
    connectionStatus: activeCtx.connectionStatus,
    isConnected: activeCtx.isConnected,
    screenShareState: activeCtx.screenShareState,
    screenStream: activeCtx.screenStream,
    screenSharerUserId: activeCtx.screenSharerUserId,
    screenSharerName: activeCtx.screenSharerName,
    screenShareError: activeCtx.screenShareError,
    isSharingScreen: activeCtx.isSharingScreen,
    openMeetingLobby: activeCtx.openMeetingLobby,
    cancelMeetingLobby: activeCtx.cancelMeetingLobby,
    startMeeting: activeCtx.startMeeting,
    joinMeeting: activeCtx.joinMeeting,
    leaveMeeting: activeCtx.leaveMeeting,
    endMeeting: activeCtx.endMeeting,
    hostMuteParticipant: activeCtx.hostMuteParticipant,
    hostRemoveParticipant: activeCtx.hostRemoveParticipant,
    toggleMeetingMute: activeCtx.toggleMeetingMute,
    toggleMeetingCamera: activeCtx.toggleMeetingCamera,
    dismissIncomingMeeting: activeCtx.dismissIncomingMeeting,
    refreshActiveMeeting: activeCtx.refreshActiveMeeting,
    startScreenShare: activeCtx.startScreenShare,
    stopScreenShare: activeCtx.stopScreenShare,
  };
}

export function useScreenShare() {
  const context = useContext(CollaborationContext);
  const activeCtx = context || defaultCollaborationFallback;
  return {
    screenShareState: activeCtx.screenShareState,
    screenStream: activeCtx.screenStream,
    screenSharerUserId: activeCtx.screenSharerUserId,
    screenSharerName: activeCtx.screenSharerName,
    screenShareError: activeCtx.screenShareError,
    isSharingScreen: activeCtx.isSharingScreen,
    startScreenShare: activeCtx.startScreenShare,
    stopScreenShare: activeCtx.stopScreenShare,
  };
}

