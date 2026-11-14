import type { InstrumentId } from '../domain/instruments';

interface ManifestEntry {
  instrument: InstrumentId;
  rootMidi: number;
  file: string;
  gain?: number;
}

interface LoadedSample extends ManifestEntry {
  buffer: AudioBuffer;
}

export interface SampleManifest {
  samples: ManifestEntry[];
}

/**
 * Optional CC0 sample pack loader. Falls back gracefully to synth voices
 * whenever no custom sample manifest is hosted.
 */
export class SampleBank {
  private constructor(private readonly samples: LoadedSample[]) {}

  static async load(
    context: BaseAudioContext,
    baseUrl = 'samples/',
  ): Promise<SampleBank | null> {
    try {
      const response = await fetch(`${baseUrl}manifest.json`);
      if (!response.ok) return null;
      const manifest = (await response.json()) as SampleManifest;
      if (!Array.isArray(manifest.samples)) return null;
      const loaded: LoadedSample[] = [];
      for (const entry of manifest.samples) {
        try {
          const file = await fetch(`${baseUrl}${entry.file}`);
          if (!file.ok) continue;
          const bytes = await file.arrayBuffer();
          const buffer = await context.decodeAudioData(bytes);
          loaded.push({ ...entry, buffer });
        } catch {
          // Single missing sample never breaks playback.
        }
      }
      return loaded.length > 0 ? new SampleBank(loaded) : null;
    } catch {
      return null;
    }
  }

  play(
    context: BaseAudioContext,
    destination: AudioNode,
    instrument: InstrumentId,
    midi: number,
    when: number,
    velocity: number,
  ): boolean {
    const matches = this.samples.filter((sample) => sample.instrument === instrument);
    if (matches.length === 0) return false;
    let best = matches[0];
    let bestDistance = Infinity;
    for (const sample of matches) {
      const distance = Math.abs(sample.rootMidi - midi);
      if (distance < bestDistance) {
        best = sample;
        bestDistance = distance;
      }
    }
    const source = context.createBufferSource();
    source.buffer = best.buffer;
    source.playbackRate.value = 2 ** ((midi - best.rootMidi) / 12);
    const gain = context.createGain();
    gain.gain.value = (best.gain ?? 1) * Math.min(1, Math.max(0.15, velocity));
    source.connect(gain).connect(destination);
    source.start(when);
    return true;
  }
}
