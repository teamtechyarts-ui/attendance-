/**
 * Notification Sound Manager
 * Handles audio playback with deduplication, user-gesture permission checks,
 * and Web Audio API synthesized chime for reliable offline audio.
 */

let lastPlayedTime = 0;
const DEBOUNCE_INTERVAL_MS = 3000; // Throttle to max 1 chime per 3 seconds

class SoundManager {
  private audioContext: AudioContext | null = null;
  private hasInteracted = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const handleUserInteraction = () => {
        this.hasInteracted = true;
        window.removeEventListener('click', handleUserInteraction);
        window.removeEventListener('keydown', handleUserInteraction);
        window.removeEventListener('touchstart', handleUserInteraction);
      };

      window.addEventListener('click', handleUserInteraction, { passive: true });
      window.addEventListener('keydown', handleUserInteraction, { passive: true });
      window.addEventListener('touchstart', handleUserInteraction, { passive: true });
    }
  }

  /**
   * Check if sound preference is enabled in localStorage
   */
  public isSoundEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem('teamstechyarts_notification_sound');
    return stored !== 'false'; // Default to true if not set
  }

  /**
   * Set sound preference in localStorage
   */
  public setSoundEnabled(enabled: boolean): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('teamstechyarts_notification_sound', enabled ? 'true' : 'false');
  }

  /**
   * Play notification sound with throttling and browser autoplay safety
   */
  public playNotificationChime(): void {
    if (typeof window === 'undefined') return;
    if (!this.isSoundEnabled()) return;
    if (!this.hasInteracted) return; // Prevent browser autoplay policy error

    const now = Date.now();
    if (now - lastPlayedTime < DEBOUNCE_INTERVAL_MS) {
      return; // Deduplicate rapid sounds
    }
    lastPlayedTime = now;

    // Play instant pleasant two-tone harmonic chime via Web Audio API without extra HTTP request
    this.playSynthesizedChime();
  }

  /**
   * Synthesize a gentle, modern harmonic chime via Web Audio API
   */
  private playSynthesizedChime(): void {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx();
      }

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      const ctx = this.audioContext;
      const startTime = ctx.currentTime;

      // Note 1: 659.25 Hz (E5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, startTime);
      gain1.gain.setValueAtTime(0, startTime);
      gain1.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(startTime);
      osc1.stop(startTime + 0.4);

      // Note 2: 880 Hz (A5) - slightly delayed
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, startTime + 0.08);
      gain2.gain.setValueAtTime(0, startTime + 0.08);
      gain2.gain.linearRampToValueAtTime(0.25, startTime + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(startTime + 0.08);
      osc2.stop(startTime + 0.6);
    } catch {
      // Audio context failure gracefully ignored
    }
  }
}

export const soundManager = new SoundManager();
