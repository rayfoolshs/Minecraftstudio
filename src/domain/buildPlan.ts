import { INSTRUMENTS, pitchName, type InstrumentId } from './instruments';
import { formatRepeaterTicks } from './redstone';
import type { ScoreModel } from './score';
import { ROLES, ROLE_LABELS, type Role } from './types';

export interface MaterialItem {
  id: string;
  label: string;
  minecraftId: string;
  count: number;
  category: 'core' | 'base' | 'redstone';
  color?: string;
}

export interface BuildStep {
  id: string;
  role: Role;
  roleLabel: string;
  measure: number;
  beat: string;
  instruments: InstrumentId[];
  pitches: string[];
  clicks: (number | null)[];
  repeaterCount: number;
  repeaterText: string;
  tooFast: boolean;
}

export interface BuildPlanSummary {
  materials: MaterialItem[];
  steps: BuildStep[];
  clickHistogram: Array<{ clicks: number; count: number; pitchLabel: string }>;
  totalNoteBlocks: number;
  totalRepeaters: number;
  totalRedstoneDust: number;
  tooFastCount: number;
}

export function generateBuildPlan(
  scores: Partial<Record<Role, ScoreModel>>,
): BuildPlanSummary {
  const baseCounts = new Map<string, MaterialItem>();
  let totalNoteBlocks = 0;
  let totalRepeaters = 0;
  let totalRedstoneDust = 0;
  let tooFastCount = 0;
  const steps: BuildStep[] = [];
  const clickFreq = new Array<number>(25).fill(0);

  const addBaseBlock = (instrumentId: InstrumentId, amount: number) => {
    const inst = INSTRUMENTS[instrumentId];
    const key = inst.minecraftId;
    const existing = baseCounts.get(key);
    if (existing) {
      existing.count += amount;
    } else {
      baseCounts.set(key, {
        id: key,
        label: `${inst.block} (${inst.shortLabel})`,
        minecraftId: inst.minecraftId,
        count: amount,
        category: 'base',
        color: inst.blockColor,
      });
    }
  };

  for (const role of ROLES) {
    const score = scores[role];
    if (!score || score.empty) continue;

    for (const measure of score.measures) {
      for (const note of measure.notes) {
        const blockCountForStep = note.midiOut.length;
        totalNoteBlocks += blockCountForStep;
        if (note.repeaters) {
          totalRepeaters += note.repeaters.count;
          if (note.repeaters.tooFast) tooFastCount += 1;
          // At least 1 dust per repeater step plus 1 branch dust for chords
          totalRedstoneDust += Math.max(1, blockCountForStep);
        } else {
          totalRedstoneDust += Math.max(1, blockCountForStep);
        }

        for (let i = 0; i < note.instruments.length; i += 1) {
          addBaseBlock(note.instruments[i], 1);
          const clicks = note.clicks[i];
          if (clicks !== null && clicks >= 0 && clicks <= 24) {
            clickFreq[clicks] += 1;
          }
        }

        const beatOffset = (note.startTicks - measure.startTicks) / score.ppq + 1;
        steps.push({
          id: `${role}-${note.startTicks}`,
          role,
          roleLabel: ROLE_LABELS[role],
          measure: measure.index + 1,
          beat: beatOffset.toFixed(2).replace(/\.00$/, ''),
          instruments: note.instruments,
          pitches:
            role === 'drums'
              ? note.instruments.map((id) => INSTRUMENTS[id].shortLabel)
              : note.midiOut.map((m) => pitchName(m)),
          clicks: note.clicks,
          repeaterCount: note.repeaters?.count ?? 0,
          repeaterText: formatRepeaterTicks(note.repeaters),
          tooFast: note.repeaters?.tooFast ?? false,
        });
      }
    }
  }

  const rawMaterials: MaterialItem[] = [
    {
      id: 'note_block',
      label: 'Note Block',
      minecraftId: 'note_block',
      count: totalNoteBlocks,
      category: 'core',
      color: '#8f5d38',
    },
    {
      id: 'repeater',
      label: 'Redstone Repeater',
      minecraftId: 'repeater',
      count: totalRepeaters,
      category: 'redstone',
      color: '#dc2626',
    },
    {
      id: 'redstone',
      label: 'Redstone Dust (approx.)',
      minecraftId: 'redstone',
      count: totalRedstoneDust,
      category: 'redstone',
      color: '#b91c1c',
    },
    ...[...baseCounts.values()].sort((a, b) => b.count - a.count),
  ];
  const materials = rawMaterials.filter((item) => item.count > 0);

  const clickHistogram = clickFreq
    .map((count, clicks) => ({
      clicks,
      count,
      pitchLabel: pitchName(54 + clicks),
    }))
    .filter((entry) => entry.count > 0);

  return {
    materials,
    steps,
    clickHistogram,
    totalNoteBlocks,
    totalRepeaters,
    totalRedstoneDust,
    tooFastCount,
  };
}

export function buildPlanToCsv(steps: BuildStep[]): string {
  const header = 'Role,Measure,Beat,Instruments,Pitches,Clicks,Repeaters';
  const rows = steps.map((step) => {
    const insts = step.instruments.map((id) => INSTRUMENTS[id].shortLabel).join(' / ');
    const pitches = step.pitches.join(' / ');
    const clicks = step.clicks.map((c) => (c === null ? '-' : String(c))).join(' / ');
    return `"${step.roleLabel}",${step.measure},${step.beat},"${insts}","${pitches}","${clicks}","${step.repeaterText}"`;
  });
  return [header, ...rows].join('\n');
}

/**
 * Generates Minecraft Java Edition 1.20+ `/setblock` commands creating parallel
 * redstone note-block tracks along +X (separated along +Z by role).
 */
export function buildPlanToMcFunction(
  title: string,
  scores: Partial<Record<Role, ScoreModel>>,
): string {
  const lines: string[] = [
    `# ${title} — Generated by NoteBlock Studio`,
    `# Stand at your origin and run this function to build the redstone tracks along +X.`,
    '',
  ];

  let laneZ = 0;
  for (const role of ROLES) {
    const score = scores[role];
    if (!score || score.empty) continue;

    lines.push(`# === ${ROLE_LABELS[role].toUpperCase()} LANE (Z + ${laneZ}) ===`);
    let cursorX = 1;
    // Start button / trigger block
    lines.push(`setblock ~0 ~0 ~${laneZ} stone`);
    lines.push(`setblock ~0 ~1 ~${laneZ} stone_button[face=floor]`);

    const allNotes = score.measures.flatMap((m) => m.notes);
    for (const note of allNotes) {
      if (note.repeaters && note.repeaters.count > 0) {
        for (const ticks of note.repeaters.ticksEach) {
          lines.push(`setblock ~${cursorX} ~0 ~${laneZ} stone`);
          lines.push(
            `setblock ~${cursorX} ~1 ~${laneZ} repeater[facing=west,delay=${ticks}]`,
          );
          cursorX += 1;
        }
      }

      // Main spine stone + redstone wire, note blocks placed adjacent or inline
      lines.push(`setblock ~${cursorX} ~0 ~${laneZ} stone`);
      lines.push(`setblock ~${cursorX} ~1 ~${laneZ} redstone_wire`);

      for (let idx = 0; idx < note.instruments.length; idx += 1) {
        const inst = INSTRUMENTS[note.instruments[idx]];
        const clicks = note.clicks[idx] ?? 0;
        const offsetZ = laneZ + 1 + idx;
        lines.push(`setblock ~${cursorX} ~0 ~${offsetZ} ${inst.minecraftId}`);
        lines.push(
          `setblock ~${cursorX} ~1 ~${offsetZ} note_block[note=${clicks}]`,
        );
      }

      cursorX += 1;
    }

    laneZ += 5;
    lines.push('');
  }

  return lines.join('\n');
}
