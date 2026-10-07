import { Message } from '@/types';

export interface StructuredSystemPayload {
  type: string;
  [key: string]: any;
}

export interface MeetingSummaryPayload extends StructuredSystemPayload {
  type: 'MEETING_SUMMARY';
  meetingId?: string;
  title?: string;
  hostUserId?: string;
  hostName?: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  participants?: Array<{ userId?: string; displayName?: string; role?: string }>;
  participantNames?: string[];
}

export interface CallSummaryPayload extends StructuredSystemPayload {
  type: 'CALL_SUMMARY';
  callId?: string;
  callType?: 'AUDIO' | 'VIDEO';
  durationSeconds?: number;
}

/**
 * Safely parses structured system message JSON payload without throwing errors.
 */
export function parseSystemMessage(body: string | null | undefined): StructuredSystemPayload | null {
  if (!body || typeof body !== 'string') return null;
  const trimmed = body.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
      return parsed;
    }
  } catch {
    // Return null on malformed JSON
  }
  return null;
}

/**
 * Authoritative message presentation resolver for conversation previews, sidebars, banners, and lists.
 * 
 * Rules:
 * 1. Raw system JSON (e.g. MEETING_SUMMARY) is NEVER displayed to the user.
 * 2. Normal user messages (even if containing JSON text) remain normal user text.
 * 3. Human-readable system messages (e.g. "Pavan added Super Admin") remain readable.
 * 4. Deleted messages display "This message was deleted".
 * 5. Unknown/malformed system JSON displays a safe generic fallback ("System event").
 */
export function resolveMessagePreview(
  message:
    | {
        body?: string | null;
        isSystem?: boolean;
        deletedAt?: string | null;
      }
    | null
    | undefined
): string {
  if (!message) return 'No messages yet';
  if (message.deletedAt) return 'This message was deleted';
  if (!message.body) return '';

  const bodyStr = message.body.trim();

  // If marked as system message or contains structured system JSON signature
  const isSystemMsg = Boolean(message.isSystem);
  const looksLikeSystemJson = bodyStr.startsWith('{') && bodyStr.endsWith('}') && bodyStr.includes('"type"');

  if (isSystemMsg || looksLikeSystemJson) {
    const structured = parseSystemMessage(bodyStr);
    if (structured) {
      switch (structured.type) {
        case 'MEETING_SUMMARY': {
          const summary = structured as MeetingSummaryPayload;
          const durSeconds = summary.durationSeconds;
          const participants = summary.participantNames || summary.participants;
          const count = Array.isArray(participants) ? participants.length : 0;

          if (typeof durSeconds === 'number' && durSeconds > 0) {
            const mins = Math.floor(durSeconds / 60);
            const secs = durSeconds % 60;
            const durFormatted = mins > 0 ? `${mins} min` : `${secs}s`;
            if (count > 0) {
              return `Meeting ended • ${count} ${count === 1 ? 'participant' : 'participants'}`;
            }
            return `Meeting ended • ${durFormatted}`;
          }
          return 'Meeting ended';
        }
        case 'CALL_SUMMARY': {
          const call = structured as CallSummaryPayload;
          return call.callType === 'VIDEO' ? 'Video call ended' : 'Audio call ended';
        }
        default:
          return 'System event';
      }
    } else if (isSystemMsg) {
      // It is a system message but not JSON (e.g. "Pavan created this group", "Sushma added Super Admin")
      // Check if it was malformed JSON
      if (bodyStr.startsWith('{') && bodyStr.endsWith('}')) {
        return 'System event';
      }
      // Return the human-readable text
      return bodyStr;
    }
  }

  // Regular user message
  return bodyStr;
}
