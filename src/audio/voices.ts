import type { VoiceKind } from '../domain/instruments';

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseCache.get(ctx);
  if (cached) return cached;
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }
  noiseCache.set(ctx, buffer);
  return buffer;
}

interface EnvelopeOptions {
  attack: number;
  decay: number;
  peak: number;
}

function envelope(
  ctx: BaseAudioContext,
  when: number,
  options: EnvelopeOptions,
): GainNode {
  const gain = ctx.createGain();
  const { attack, decay, peak } = options;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(peak, when + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(attack + 0.05, decay));
  return gain;
}

function oscillator(
  ctx: BaseAudioContext,
  type: OscillatorType,
  frequency: number,
  when: number,
  stop: number,
): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, when);
  osc.start(when);
  osc.stop(stop);
  return osc;
}

/** Synthesised voices tuned to the exact note block pitch ratio. */
export function playVoice(
  ctx: BaseAudioContext,
  destination: AudioNode,
  voice: VoiceKind,
  frequency: number,
  when: number,
  duration: number,
  velocity = 0.8,
): void {
  const length = Math.min(1.3, Math.max(0.14, duration));
  const peak = 0.26 * Math.min(1, Math.max(0.15, velocity));

  switch (voice) {
    case 'pluck': {
      const gain = envelope(ctx, when, { attack: 0.005, decay: length, peak });
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(4200, when);
      filter.frequency.exponentialRampToValueAtTime(900, when + length);
      oscillator(ctx, 'triangle', frequency, when, when + length + 0.05).connect(filter);
      oscillator(ctx, 'sawtooth', frequency * 2.002, when, when + length + 0.05).connect(
        filter,
      );
      filter.connect(gain).connect(destination);
      break;
    }
    case 'bass': {
      const gain = envelope(ctx, when, { attack: 0.008, decay: length, peak: peak * 1.15 });
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      oscillator(ctx, 'sine', frequency, when, when + length + 0.05).connect(filter);
      oscillator(ctx, 'triangle', frequency, when, when + length + 0.05).connect(filter);
      filter.connect(gain).connect(destination);
      break;
    }
    case 'bell': {
      const gain = envelope(ctx, when, { attack: 0.003, decay: length * 1.4, peak });
      for (const [ratio, level] of [
        [1, 1],
        [2.76, 0.45],
        [5.4, 0.2],
      ] as const) {
        const partial = ctx.createGain();
        partial.gain.value = level;
        oscillator(ctx, 'sine', frequency * ratio, when, when + length * 1.5).connect(
          partial,
        );
        partial.connect(gain);
      }
      gain.connect(destination);
      break;
    }
    case 'chime': {
      const gain = envelope(ctx, when, {
        attack: 0.003,
        decay: length * 1.6,
        peak: peak * 0.9,
      });
      for (const [ratio, level] of [
        [1, 1],
        [2.4, 0.5],
        [3.8, 0.25],
      ] as const) {
        const partial = ctx.createGain();
        partial.gain.value = level;
        oscillator(ctx, 'sine', frequency * ratio, when, when + length * 1.7).connect(
          partial,
        );
        partial.connect(gain);
      }
      gain.connect(destination);
      break;
    }
    case 'xylophone': {
      const gain = envelope(ctx, when, { attack: 0.002, decay: Math.min(0.5, length), peak });
      oscillator(ctx, 'sine', frequency, when, when + length + 0.05).connect(gain);
      const overtone = ctx.createGain();
      overtone.gain.value = 0.4;
      oscillator(ctx, 'sine', frequency * 3.93, when, when + length + 0.05).connect(
        overtone,
      );
      overtone.connect(gain);
      gain.connect(destination);
      break;
    }
    case 'flute': {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(peak * 0.8, when + 0.04);
      gain.gain.setValueAtTime(peak * 0.8, when + Math.max(0.06, length * 0.6));
      gain.gain.exponentialRampToValueAtTime(0.0001, when + length + 0.1);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 3000;
      oscillator(ctx, 'sine', frequency, when, when + length + 0.15).connect(filter);
      oscillator(ctx, 'triangle', frequency * 2, when, when + length + 0.15).connect(
        filter,
      );
      filter.connect(gain).connect(destination);
      break;
    }
    case 'brass': {
      const gain = envelope(ctx, when, { attack: 0.03, decay: length, peak: peak * 0.9 });
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, when);
      filter.frequency.linearRampToValueAtTime(3200, when + 0.12);
      filter.frequency.exponentialRampToValueAtTime(1200, when + length);
      oscillator(ctx, 'sawtooth', frequency, when, when + length + 0.05).connect(filter);
      filter.connect(gain).connect(destination);
      break;
    }
    case 'square': {
      const gain = envelope(ctx, when, { attack: 0.004, decay: length, peak: peak * 0.7 });
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 5000;
      oscillator(ctx, 'square', frequency, when, when + length + 0.05).connect(filter);
      filter.connect(gain).connect(destination);
      break;
    }
    case 'snare': {
      const gain = envelope(ctx, when, { attack: 0.001, decay: 0.22, peak: peak * 1.1 });
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 1200;
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer(ctx);
      source.connect(filter).connect(gain).connect(destination);
      source.start(when);
      source.stop(when + 0.3);
      break;
    }
    case 'hat': {
      const gain = envelope(ctx, when, { attack: 0.001, decay: 0.08, peak: peak * 0.6 });
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 7000;
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer(ctx);
      source.connect(filter).connect(gain).connect(destination);
      source.start(when);
      source.stop(when + 0.12);
      break;
    }
    case 'kick': {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(130, when);
      osc.frequency.exponentialRampToValueAtTime(45, when + 0.18);
      const gain = envelope(ctx, when, { attack: 0.002, decay: 0.28, peak: peak * 1.4 });
      osc.connect(gain).connect(destination);
      osc.start(when);
      osc.stop(when + 0.32);
      break;
    }
    default:
      break;
  }
}
