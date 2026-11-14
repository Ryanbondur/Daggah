/** Tiny Web Audio SFX for hits/skills. No Phaser audio (disabled in boot). */

export type SfxKind = 'hit' | 'skill' | 'crit' | 'heroHit';

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(
  frequency: number,
  duration: number,
  type: OscillatorType,
  gainPeak: number,
  when = 0,
): void {
  const audio = ac();
  if (!audio) return;
  const t0 = audio.currentTime + when;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function playSfx(kind: SfxKind, muted: boolean): void {
  if (muted) return;
  try {
    switch (kind) {
      case 'hit':
        tone(220, 0.06, 'square', 0.045);
        tone(140, 0.05, 'triangle', 0.03, 0.01);
        break;
      case 'crit':
        tone(420, 0.08, 'square', 0.055);
        tone(640, 0.1, 'triangle', 0.04, 0.02);
        break;
      case 'skill':
        tone(320, 0.12, 'sawtooth', 0.04);
        tone(480, 0.16, 'triangle', 0.05, 0.04);
        tone(180, 0.1, 'sine', 0.03, 0.08);
        break;
      case 'heroHit':
        tone(110, 0.09, 'square', 0.04);
        break;
      default:
        break;
    }
  } catch {
    /* autoplay / AudioContext blocked */
  }
}

/** Unlock audio on first user gesture (iOS / Chrome policy). */
export function unlockAudio(): void {
  const audio = ac();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
}
