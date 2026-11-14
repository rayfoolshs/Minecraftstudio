import { INSTRUMENTS, midiToFrequency, type InstrumentId } from '../domain/instruments';
import type { Role } from '../domain/types';
import type { SampleBank } from './samples';
import { playVoice } from './voices';

export interface PlayEvent {
  time: number;
  duration: number;
  midiOut: number;
  instrument: InstrumentId;
  velocity: number;
  role: Role;
  clicks: number | null;
}

export interface PlayOptions {
  startTimeSeconds?: number;
  mutedRoles?: ReadonlySet<Role>;
  onProgress?: (currentSeconds: number) => void;
  onNoteTrigger?: (event: PlayEvent) => void;
  onEnd?: () => void;
  samples?: SampleBank | null;
}

export function dueEvents(
  events: PlayEvent[],
  index: number,
  horizon: number,
): { due: PlayEvent[]; nextIndex: number } {
  const due: PlayEvent[] = [];
  let cursor = index;
  while (cursor < events.length && events[cursor].time <= horizon) {
    due.push(events[cursor]);
    cursor += 1;
  }
  return { due, nextIndex: cursor };
}

export class NoteBlockPlayer {
  private context: AudioContext | null = null;
  private timer: number | null = null;
  private rafId: number | null = null;
  private onEnd: (() => void) | null = null;
  private mutedRoles: ReadonlySet<Role> = new Set();
  private auditionContext: AudioContext | null = null;

  setMutedRoles(muted: ReadonlySet<Role>): void {
    this.mutedRoles = muted;
  }

  async audition(
    instrument: InstrumentId,
    midi: number,
    samples?: SampleBank | null,
    duration = 0.45,
  ): Promise<void> {
    if (!this.auditionContext || this.auditionContext.state === 'closed') {
      this.auditionContext = new AudioContext();
    }
    const ctx = this.auditionContext;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);
    const when = ctx.currentTime + 0.01;
    const fromSample =
      samples?.play(ctx, master, instrument, midi, when, 0.9) ?? false;
    if (!fromSample) {
      playVoice(
        ctx,
        master,
        INSTRUMENTS[instrument].voice,
        midiToFrequency(midi),
        when,
        duration,
        0.9,
      );
    }
  }

  async play(events: PlayEvent[], options: PlayOptions = {}): Promise<void> {
    this.teardown(false);
    if (events.length === 0) return;

    const startOffset = Math.max(0, options.startTimeSeconds ?? 0);
    this.mutedRoles = options.mutedRoles ?? new Set();

    const sorted = [...events].sort((a, b) => a.time - b.time);
    const total = sorted.reduce(
      (max, event) => Math.max(max, event.time + event.duration),
      0,
    );

    const context = new AudioContext();
    this.context = context;
    this.onEnd = options.onEnd ?? null;
    await context.resume();

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.ratio.value = 4;
    const master = context.createGain();
    master.gain.value = 0.9;
    master.connect(compressor);
    compressor.connect(context.destination);

    const startTime = context.currentTime + 0.08 - startOffset;
    let index = sorted.findIndex((e) => e.time >= startOffset - 0.005);
    if (index === -1) index = sorted.length;

    const triggerQueue: PlayEvent[] = [];

    this.timer = window.setInterval(() => {
      if (!this.context) return;
      const elapsed = this.context.currentTime - startTime;
      const horizon = elapsed + 0.22;
      const { due, nextIndex } = dueEvents(sorted, index, horizon);
      index = nextIndex;

      for (const event of due) {
        if (this.mutedRoles.has(event.role)) continue;
        const when = startTime + event.time;
        if (when < this.context.currentTime - 0.05) continue;

        const fromSample =
          options.samples?.play(
            this.context,
            master,
            event.instrument,
            event.midiOut,
            when,
            event.velocity,
          ) ?? false;

        if (!fromSample) {
          playVoice(
            this.context,
            master,
            INSTRUMENTS[event.instrument].voice,
            midiToFrequency(event.midiOut),
            when,
            event.duration,
            event.velocity,
          );
        }

        if (options.onNoteTrigger) {
          triggerQueue.push(event);
        }
      }

      if (elapsed > total + 0.8) {
        this.teardown(true);
      }
    }, 20);

    const tickVisuals = () => {
      if (!this.context) return;
      const elapsed = Math.max(0, this.context.currentTime - startTime);
      options.onProgress?.(Math.min(total, elapsed));

      if (options.onNoteTrigger) {
        while (triggerQueue.length > 0 && triggerQueue[0].time <= elapsed + 0.015) {
          const ev = triggerQueue.shift()!;
          if (!this.mutedRoles.has(ev.role)) {
            options.onNoteTrigger(ev);
          }
        }
      }

      if (this.context) {
        this.rafId = requestAnimationFrame(tickVisuals);
      }
    };

    this.rafId = requestAnimationFrame(tickVisuals);
  }

  stop(): void {
    this.teardown(false);
  }

  dispose(): void {
    this.teardown(false);
    if (this.auditionContext && this.auditionContext.state !== 'closed') {
      void this.auditionContext.close();
      this.auditionContext = null;
    }
  }

  private teardown(notify: boolean): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') {
      void context.close();
    }
    const callback = this.onEnd;
    this.onEnd = null;
    if (notify && callback) callback();
  }
}
