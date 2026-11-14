/**
 * Redstone timing facts used by the score:
 * - one redstone tick = 0.1 s
 * - a repeater delays 1, 2, 3 or 4 redstone ticks
 * - redstone dust adds no delay, so a chain of n repeaters covers 1..4n ticks
 */
export const REDSTONE_TICK_SECONDS = 0.1;
export const MAX_REPEATER_TICKS = 4;

export interface RepeaterPlan {
  /** Number of repeaters needed between the previous note and this one. */
  count: number;
  /** Total delay in redstone ticks (rounded to the nearest 0.1 s). */
  totalTicks: number;
  /** Delay setting for each repeater, in redstone ticks (1-4). */
  ticksEach: number[];
  /** True when the gap is shorter than one redstone tick and cannot be wired. */
  tooFast: boolean;
}

export function repeatersForDelay(seconds: number): RepeaterPlan {
  if (seconds <= 0) {
    return { count: 0, totalTicks: 0, ticksEach: [], tooFast: false };
  }
  const exactTicks = seconds / REDSTONE_TICK_SECONDS;
  const totalTicks = Math.max(1, Math.round(exactTicks));
  const tooFast = exactTicks < 0.995;
  const count = Math.ceil(totalTicks / MAX_REPEATER_TICKS);
  const base = Math.floor(totalTicks / count);
  const extra = totalTicks % count;
  const ticksEach = Array.from({ length: count }, (_, index) =>
    index < extra ? base + 1 : base,
  );
  return { count, totalTicks, ticksEach, tooFast };
}

export function formatRepeaterTicks(plan: RepeaterPlan | null): string {
  if (!plan || plan.count === 0) return '—';
  const sum = `${plan.totalTicks}t (${plan.ticksEach.join('+')})`;
  return plan.tooFast ? `R! < 0.1s` : `${plan.count}× [${sum}]`;
}

/**
 * Given the shortest note-onset gap in seconds at 1.0x tempo,
 * returns the tempo scale needed so that gap >= 0.105s (1 safe redstone tick).
 */
export function recommendedTempoScale(minGapSeconds: number | null): number {
  if (minGapSeconds === null || minGapSeconds <= 0) return 1;
  if (minGapSeconds >= 0.1) return 1;
  const raw = minGapSeconds / 0.102;
  return Math.max(0.25, Math.floor(raw * 20) / 20);
}
