import { Volume2 } from 'lucide-react';
import { useState } from 'react';
import {
  INSTRUMENTS,
  PERCUSSION_INSTRUMENTS,
  PITCHED_INSTRUMENTS,
  midiForClicks,
  noteParticleColor,
  pitchName,
  type InstrumentId,
} from '../domain/instruments';

interface TunerSandboxProps {
  onAudition: (instrument: InstrumentId, midi: number) => void;
}

const SHARP_CLASSES = new Set([1, 3, 6, 8, 10]);

export function TunerSandbox({ onAudition }: TunerSandboxProps) {
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentId>('harp');
  const [lastPlayed, setLastPlayed] = useState<{
    instrument: InstrumentId;
    clicks: number | null;
    midi: number;
  } | null>(null);

  const inst = INSTRUMENTS[selectedInstrument];

  const handleClickPitch = (clicks: number) => {
    const midi = midiForClicks(selectedInstrument, clicks);
    if (midi === null) return;
    setLastPlayed({ instrument: selectedInstrument, clicks, midi });
    onAudition(selectedInstrument, midi);
  };

  const handleClickPercussion = (percId: InstrumentId) => {
    setLastPlayed({ instrument: percId, clicks: null, midi: 60 });
    onAudition(percId, 60);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Interactive 25-Click Note Block Tuner
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Audition any Minecraft instrument across its exact 0–24 right-click range
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span
                className="h-3.5 w-3.5 rounded-sm border border-black/15"
                style={{ backgroundColor: inst.blockColor }}
              />
              <span>Base block: {inst.block}</span>
            </div>
            <select
              aria-label="Select Minecraft instrument"
              value={selectedInstrument}
              onChange={(e) => setSelectedInstrument(e.target.value as InstrumentId)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800"
            >
              {PITCHED_INSTRUMENTS.map((id) => (
                <option key={id} value={id}>
                  {INSTRUMENTS[id].label} — {INSTRUMENTS[id].block}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 25-pitch chromatic click grid */}
        <div className="mt-5 grid grid-cols-5 gap-2 sm:grid-cols-9 md:grid-cols-13 lg:grid-cols-25">
          {Array.from({ length: 25 }, (_, clicks) => {
            const midi = midiForClicks(selectedInstrument, clicks) ?? 54;
            const name = pitchName(midi);
            const isSharp = SHARP_CLASSES.has(((midi % 12) + 12) % 12);
            const particleColor = noteParticleColor(clicks);
            const isActive =
              lastPlayed?.instrument === selectedInstrument &&
              lastPlayed?.clicks === clicks;

            return (
              <button
                key={clicks}
                type="button"
                onClick={() => handleClickPitch(clicks)}
                className={`group flex flex-col items-center justify-between rounded-lg border p-2 text-center transition-all active:scale-95 ${
                  isActive
                    ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500/20'
                    : isSharp
                      ? 'border-slate-300 bg-slate-800 text-white hover:bg-slate-700'
                      : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span
                  className="h-2 w-full rounded-xs"
                  style={{ backgroundColor: particleColor }}
                />
                <span
                  className={`my-2 font-mono text-xs font-semibold ${
                    isActive
                      ? 'text-emerald-900'
                      : isSharp
                        ? 'text-slate-100'
                        : 'text-slate-900'
                  }`}
                >
                  {name}
                </span>
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    isActive
                      ? 'text-emerald-700'
                      : isSharp
                        ? 'text-slate-300'
                        : 'text-slate-500'
                  }`}
                >
                  {clicks}
                </span>
              </button>
            );
          })}
        </div>

        {lastPlayed && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-700">
            <Volume2 className="h-4 w-4 text-emerald-700" />
            <span className="font-semibold text-slate-900">
              {INSTRUMENTS[lastPlayed.instrument].label}
            </span>
            <span aria-hidden="true">·</span>
            <span>Place on {INSTRUMENTS[lastPlayed.instrument].block}</span>
            {lastPlayed.clicks !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono font-semibold text-emerald-800 tabular-nums">
                  {lastPlayed.clicks} right-clicks ({pitchName(lastPlayed.midi)})
                </span>
              </>
            )}
          </div>
        )}
      </section>

      {/* Percussion Pads */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="font-display text-base font-semibold text-slate-900">
          Percussion Blocks (Unpitched)
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Percussion note blocks ignore right-click tuning and depend solely on the block underneath
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PERCUSSION_INSTRUMENTS.map((id) => {
            const p = INSTRUMENTS[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleClickPercussion(id)}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50/40 active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-8 w-8 rounded-md border border-black/15"
                    style={{ backgroundColor: p.blockColor }}
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{p.label}</div>
                    <div className="text-xs text-slate-500">Base: {p.block}</div>
                  </div>
                </div>
                <Volume2 className="h-4 w-4 text-slate-400" />
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
