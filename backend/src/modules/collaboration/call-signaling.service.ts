import { PresenceService } from './presence.service.js';

export interface ActiveCallSession {
  callId: string;
  conversationId: string;
  callerUserId: string;
  calleeUserId: string;
  callerName: string;
  callerAvatar: string | null;
  callType: 'AUDIO' | 'VIDEO';
  state: 'RINGING' | 'CONNECTING' | 'CONNECTED';
  startedAt: Date;
  connectedAt?: Date;
  activeScreenSharerUserId?: string | null;
  offerSdp?: any;
  answerSdp?: any;
}

export class CallSignalingService {
  // Map of callId -> ActiveCallSession
  private static activeCalls = new Map<string, ActiveCallSession>();
  // Map of userId -> callId
  private static userToCall = new Map<string, string>();

  /**
   * Check if a user is currently in an active or ringing call
   */
  public static isUserInCall(userId: string): boolean {
    const callId = this.userToCall.get(userId);
    if (!callId) return false;
    return this.activeCalls.has(callId);
  }

  /**
   * Get active call session by callId
   */
  public static getCall(callId: string): ActiveCallSession | undefined {
    return this.activeCalls.get(callId);
  }

  /**
   * Get active call session for a user
   */
  public static getCallForUser(userId: string): ActiveCallSession | undefined {
    const callId = this.userToCall.get(userId);
    if (!callId) return undefined;
    return this.activeCalls.get(callId);
  }

  /**
   * Register a new call invitation
   */
  public static initiateCall(
    callId: string,
    conversationId: string,
    callerUserId: string,
    calleeUserId: string,
    callerName: string,
    callerAvatar: string | null,
    callType: 'AUDIO' | 'VIDEO',
    offerSdp?: any
  ): ActiveCallSession {
    // Clear any stale references
    this.cleanupUser(callerUserId);
    this.cleanupUser(calleeUserId);

    const session: ActiveCallSession = {
      callId,
      conversationId,
      callerUserId,
      calleeUserId,
      callerName,
      callerAvatar,
      callType,
      state: 'RINGING',
      startedAt: new Date(),
      offerSdp,
    };

    this.activeCalls.set(callId, session);
    this.userToCall.set(callerUserId, callId);
    this.userToCall.set(calleeUserId, callId);

    console.log(`[CALL DEBUG] [SERVER] initiateCall callId=${callId} caller=${callerUserId} callee=${calleeUserId} type=${callType}`);
    return session;
  }

  /**
   * Update call state to CONNECTING or CONNECTED
   */
  public static updateCallState(callId: string, state: 'CONNECTING' | 'CONNECTED', answerSdp?: any): ActiveCallSession | undefined {
    const session = this.activeCalls.get(callId);
    if (session) {
      session.state = state;
      if (answerSdp) {
        session.answerSdp = answerSdp;
      }
      if (state === 'CONNECTED' && !session.connectedAt) {
        session.connectedAt = new Date();
      }
      console.log(`[CALL DEBUG] [SERVER] updateCallState callId=${callId} state=${state}`);
    }
    return session;
  }

  /**
   * Store offer SDP for an ongoing session
   */
  public static setOfferSdp(callId: string, sdp: any): void {
    const session = this.activeCalls.get(callId);
    if (session) {
      session.offerSdp = sdp;
    }
  }

  /**
   * Set active screen sharer for 1:1 call
   */
  public static startScreenShare(callId: string, userId: string): { success: boolean; session?: ActiveCallSession; reason?: string } {
    const session = this.activeCalls.get(callId);
    if (!session || session.state !== 'CONNECTED') {
      return { success: false, reason: 'Call is not connected' };
    }
    if (session.activeScreenSharerUserId && session.activeScreenSharerUserId !== userId) {
      return { success: false, reason: 'Someone is already sharing their screen.' };
    }
    session.activeScreenSharerUserId = userId;
    return { success: true, session };
  }

  /**
   * Clear active screen sharer for 1:1 call
   */
  public static stopScreenShare(callId: string, userId: string): { success: boolean; session?: ActiveCallSession } {
    const session = this.activeCalls.get(callId);
    if (session && session.activeScreenSharerUserId === userId) {
      session.activeScreenSharerUserId = null;
      return { success: true, session };
    }
    return { success: false, session };
  }

  /**
   * End a call session and release all participants
   */
  public static endCall(callId: string): ActiveCallSession | undefined {
    const session = this.activeCalls.get(callId);
    if (session) {
      this.activeCalls.delete(callId);
      this.userToCall.delete(session.callerUserId);
      this.userToCall.delete(session.calleeUserId);
      console.log(`[CALL DEBUG] [SERVER] endCall callId=${callId} participants=[${session.callerUserId}, ${session.calleeUserId}]`);
    }
    return session;
  }

  /**
   * Clean up any call associated with a single user
   */
  private static cleanupUser(userId: string): void {
    const existingCallId = this.userToCall.get(userId);
    if (existingCallId) {
      this.endCall(existingCallId);
    }
  }

  /**
   * Handle user disconnection (e.g. browser closed during call)
   */
  public static handleUserDisconnect(userId: string): void {
    const callId = this.userToCall.get(userId);
    if (!callId) return;

    const session = this.activeCalls.get(callId);
    if (!session) {
      this.userToCall.delete(userId);
      return;
    }

    const otherUserId = session.callerUserId === userId ? session.calleeUserId : session.callerUserId;
    this.endCall(callId);

    console.log(`[CALL DEBUG] [SERVER] handleUserDisconnect user=${userId} callId=${callId} notifying otherUser=${otherUserId}`);

    // Notify other participant that the call ended/disconnected
    PresenceService.broadcastToUsers([otherUserId], {
      type: session.state === 'RINGING' && session.callerUserId === userId ? 'CALL_CANCEL' : 'CALL_END',
      payload: {
        callId,
        conversationId: session.conversationId,
        endedByUserId: userId,
        reason: 'User disconnected',
      },
    });
  }
}
