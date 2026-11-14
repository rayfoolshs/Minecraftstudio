import { Check, Copy, Download, Terminal } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  buildPlanToCsv,
  buildPlanToMcFunction,
  generateBuildPlan,
} from '../domain/buildPlan';
import { INSTRUMENTS, noteParticleColor } from '../domain/instruments';
import type { ScoreModel } from '../domain/score';
import { ROLES, ROLE_LABELS, type Role } from '../domain/types';

interface BuildGuideViewProps {
  title: string;
  scores: Partial<Record<Role, ScoreModel>>;
}

function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function BuildGuideView({ title, scores }: BuildGuideViewProps) {
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [copiedMc, setCopiedMc] = useState(false);

  const plan = useMemo(() => generateBuildPlan(scores), [scores]);

  const filteredSteps = useMemo(
    () =>
      roleFilter === 'all'
        ? plan.steps
        : plan.steps.filter((s) => s.role === roleFilter),
    [plan.steps, roleFilter],
  );

  const maxHistCount = useMemo(
    () => Math.max(1, ...plan.clickHistogram.map((h) => h.count)),
    [plan.clickHistogram],
  );

  const safeFileBase = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'noteblock_song';

  const handleDownloadCsv = () => {
    downloadText(`${safeFileBase}_build_sheet.csv`, buildPlanToCsv(plan.steps), 'text/csv');
  };

  const handleDownloadMcFunction = () => {
    downloadText(
      `${safeFileBase}.mcfunction`,
      buildPlanToMcFunction(title, scores),
      'text/plain',
    );
  };

  const handleCopyCommands = async () => {
    const text = buildPlanToMcFunction(title, scores);
    await navigator.clipboard.writeText(text);
    setCopiedMc(true);
    window.setTimeout(() => setCopiedMc(false), 2000);
  };

  if (plan.steps.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        Assign at least one MIDI track to generate your Minecraft material shopping list
        and redstone build guide.
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Material Shopping List & Exporters */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Minecraft Material Shopping List
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Exact block counts needed to construct this arrangement in Survival or Creative
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={handleCopyCommands}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              {copiedMc ? (
                <Check className="h-3.5 w-3.5 text-emerald-700" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copiedMc ? 'Copied commands' : 'Copy /setblock'}
            </button>
            <button
              type="button"
              onClick={handleDownloadMcFunction}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-800 whitespace-nowrap shrink-0"
            >
              <Terminal className="h-3.5 w-3.5" />
              Export .mcfunction
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {plan.materials.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="h-4 w-4 shrink-0 rounded-sm border border-black/15"
                  style={{ backgroundColor: item.color ?? '#94a3b8' }}
                />
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-slate-800">
                    {item.label}
                  </div>
                  <div className="truncate font-mono text-[11px] text-slate-500">
                    {item.minecraftId}
                  </div>
                </div>
              </div>
              <span className="ml-3 font-mono text-base font-semibold text-slate-900 tabular-nums">
                {item.count}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Click Frequency Histogram (Batch Tuning Aid) */}
      {plan.clickHistogram.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Tuning Click Distribution
              </h3>
              <p className="text-xs text-slate-500">
                Pre-tune identical pitch blocks together before wiring redstone
              </p>
            </div>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              {plan.clickHistogram.length} distinct click values used
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-12">
            {plan.clickHistogram.map((entry) => {
              const pct = Math.round((entry.count / maxHistCount) * 100);
              return (
                <div
                  key={entry.clicks}
                  className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-center"
                >
                  <div className="text-[11px] font-medium text-slate-500">
                    {entry.pitchLabel}
                  </div>
                  <div className="my-1.5 flex h-10 items-end justify-center">
                    <div
                      className="w-5 rounded-t-sm transition-all"
                      style={{
                        height: `${Math.max(14, pct)}%`,
                        backgroundColor: noteParticleColor(entry.clicks),
                      }}
                    />
                  </div>
                  <div className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                    {entry.clicks} clk
                  </div>
                  <div className="font-mono text-[10px] text-slate-500 tabular-nums">
                    ×{entry.count}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Step-by-Step Build Table */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              Step-by-Step Redstone & Tuning Sequence
            </h3>
            <p className="text-xs text-slate-500">
              Follow each lane in order from the start button
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setRoleFilter('all')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                roleFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({plan.steps.length})
            </button>
            {ROLES.map((r) => {
              const count = plan.steps.filter((s) => s.role === r).length;
              if (count === 0) return null;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    roleFilter === r
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {ROLE_LABELS[r]} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
              <tr className="border-b border-slate-200">
                <th className="px-3 py-2.5">Part</th>
                <th className="px-3 py-2.5">Bar : Beat</th>
                <th className="px-3 py-2.5">Base Block</th>
                <th className="px-3 py-2.5">Pitch</th>
                <th className="px-3 py-2.5">Right-Clicks (0–24)</th>
                <th className="px-3 py-2.5">Repeaters Before</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSteps.map((step) => (
                <tr key={step.id} className="hover:bg-slate-50/70">
                  <td className="px-3 py-2 font-medium text-slate-800">
                    {step.roleLabel}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-600 tabular-nums">
                    {step.measure}:{step.beat}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {step.instruments
                      .map((id) => INSTRUMENTS[id].block.split(' / ')[0])
                      .join(', ')}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-800">
                    {step.pitches.join(' · ')}
                  </td>
                  <td className="px-3 py-2 font-mono font-semibold text-slate-900 tabular-nums">
                    {step.clicks.map((c) => (c === null ? '—' : c)).join(' · ')}
                  </td>
                  <td
                    className={`px-3 py-2 font-mono tabular-nums ${
                      step.tooFast ? 'font-semibold text-amber-700' : 'text-slate-600'
                    }`}
                  >
                    {step.repeaterText}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
