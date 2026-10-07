/**
 * Sound Manager
 * Handles local audio playback for system notifications and collaboration chat messages
 * with strict deduplication, user preference persistence, and autoplay resilience.
 */
class SoundManager {
  private audio: HTMLAudioElement | null = null;
  private playedMessageIds = new Set<string>();
  private soundEnabled: boolean = true;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('sound_notifications_enabled');
        if (saved !== null) {
          this.soundEnabled = saved === 'true';
        }
      } catch {}
    }
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  public setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('sound_notifications_enabled', String(enabled));
      } catch {}
    }
  }

  /**
   * Plays the incoming chat notification sound if the message has not already triggered a sound.
   * Gracefully ignores browser autoplay restrictions without errors or noisy logging.
   */
  public playIncomingMessageSound(messageId?: string): void {
    if (typeof window === 'undefined' || !this.soundEnabled) return;

    if (messageId) {
      if (this.playedMessageIds.has(messageId)) {
        return; // Already played for this message
      }
      this.playedMessageIds.add(messageId);
      // Keep memory bounded to last 1000 messages
      if (this.playedMessageIds.size > 1000) {
        const firstKey = this.playedMessageIds.values().next().value;
        if (firstKey) this.playedMessageIds.delete(firstKey);
      }
    }

    this.playAudio();
  }

  /**
   * Plays notification chime for system notifications (SSE stream / task reminders / etc.)
   */
  public playNotificationChime(): void {
    if (typeof window === 'undefined' || !this.soundEnabled) return;
    this.playAudio();
  }

  private ringtoneAudio: HTMLAudioElement | null = null;

  public playIncomingCallRingtone(): void {
    if (typeof window === 'undefined' || !this.soundEnabled) return;
    try {
      if (!this.ringtoneAudio) {
        this.ringtoneAudio = new Audio('/sounds/incoming-call.mp3');
        this.ringtoneAudio.loop = true;
      }
      this.ringtoneAudio.currentTime = 0;
      this.ringtoneAudio.play().catch(() => {
        // Autoplay policy restriction handled gracefully
      });
    } catch {}
  }

  public stopIncomingCallRingtone(): void {
    try {
      if (this.ringtoneAudio) {
        this.ringtoneAudio.pause();
        this.ringtoneAudio.currentTime = 0;
      }
    } catch {}
  }

  private playAudio(): void {
    try {
      if (!this.audio) {
        this.audio = new Audio('/sounds/notification.mp3');
      }
      this.audio.currentTime = 0;
      this.audio.play().catch(() => {
        // Autoplay policy prevented playback before user gesture; silently ignore
      });
    } catch {
      // Audio playback unavailable; safely ignore
    }
  }
}

export const soundManager = new SoundManager();
