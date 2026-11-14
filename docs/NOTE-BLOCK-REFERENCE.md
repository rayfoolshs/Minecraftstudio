# Minecraft note-block reference

Facts used by NoteBlock Studio, with the code that implements each one. Source of truth for
behaviour: <https://minecraft.wiki/w/Note_Block> and
<https://minecraft.wiki/w/Redstone_circuit>.

## Pitch range

- A note block plays one of **25 pitches**, selected by right-clicking it **0–24 times** from a
  freshly placed block.
- Each instrument therefore spans **25 semitones** — two octaves plus one note.
- The pitch depends on the block **underneath** the note block, not on the note block itself.
- Breaking or re-placing the note block resets it to click 0, so tuning must happen after the base
  block is final.

Conversion used in `src/domain/instruments.ts`:

```
midiOut  = baseMidi + clicks      (clicks 0..24)
clicks   = midiOut - baseMidi     (null when outside the range)
frequency = 440 × 2^((midiOut - 69) / 12)
```

## Instrument catalog

All pitched instruments use the same 25-semitone shape, starting at a different `baseMidi`.

| Instrument | Base block | Base note (click 0) | Range | Java block ID |
| --- | --- | --- | --- | --- |
| Harp (Piano) | Dirt / Grass / Air | F#3 (54) | F#3–F#5 | `grass_block` |
| Bass | Oak Planks / Wood | F#1 (30) | F#1–F#3 | `oak_planks` |
| Guitar | White Wool | F#2 (42) | F#2–F#4 | `white_wool` |
| Flute | Clay Block | F#4 (66) | F#4–F#6 | `clay` |
| Bell (Glockenspiel) | Block of Gold | F#5 (78) | F#5–F#7 | `gold_block` |
| Chime | Packed Ice | F#5 (78) | F#5–F#7 | `packed_ice` |
| Xylophone | Bone Block | F#5 (78) | F#5–F#7 | `bone_block` |
| Iron Xylophone (Vibraphone) | Block of Iron | F#3 (54) | F#3–F#5 | `iron_block` |
| Cow Bell | Soul Sand | F#4 (66) | F#4–F#6 | `soul_sand` |
| Didgeridoo | Pumpkin | F#1 (30) | F#1–F#3 | `carved_pumpkin` |
| Bit (8-Bit Synth) | Block of Emerald | F#3 (54) | F#3–F#5 | `emerald_block` |
| Banjo | Hay Bale | F#3 (54) | F#3–F#5 | `hay_block` |
| Pling (Electric Piano) | Glowstone | F#3 (54) | F#3–F#5 | `glowstone` |
| Trumpet | Block of Copper | F#3 (54) | F#3–F#5 | `copper_block` |
| Exposed Trumpet | Exposed Copper | F#3 (54) | F#3–F#5 | `exposed_copper` |
| Weathered Trumpet | Weathered Copper | F#3 (54) | F#3–F#5 | `weathered_copper` |
| Oxidized Trumpet | Oxidized Copper | F#3 (54) | F#3–F#5 | `oxidized_copper` |
| Snare Drum | Sand / Gravel | unpitched | — | `sand` |
| Hi-Hat / Clicks | Glass | unpitched | — | `glass` |
| Bass Drum | Stone / Cobblestone | unpitched | — | `stone` |

Percussion ignores clicks. The exported command still writes `note=0` because the block requires a
valid note state.

## General MIDI drum mapping

`drumInstrumentFor` in `src/domain/instruments.ts`:

| GM note | Instrument |
| --- | --- |
| ≤ 36 | Bass drum (`basedrum`) |
| 37–40 | Snare (`snare`) |
| 42–46 | Hi-hat (`hat`) |
| 49–59 | Hi-hat (`hat`) |
| anything else | Snare (`snare`) |

If a drum track's distinct pitches all fall outside 27–87, the track is treated as non-GM and split
into thirds by pitch (low → bass drum, middle → snare, high → hi-hat).

## Redstone timing

- One redstone tick = **0.1 s** (2 game ticks).
- A repeater delays its input by **1, 2, 3 or 4 redstone ticks**, set by right-clicking.
- Redstone dust adds **no** delay, so *n* repeaters in series cover 1–4*n* ticks.
- A note onset gap shorter than one redstone tick **cannot be wired** — the circuit is too fast.

`repeatersForDelay(seconds)` in `src/domain/redstone.ts`:

```
exactTicks = seconds / 0.1
totalTicks = max(1, round(exactTicks))
tooFast    = exactTicks < 0.995
count      = ceil(totalTicks / 4)
ticksEach  = split totalTicks as evenly as possible into `count` values of 1..4
```

Display format:

- `2× [5t (3+2)]` — two repeaters, 5 ticks total, delays 3 and 2.
- `R! < 0.1s` — a gap too short to wire; not a valid build.

### Tempo recommendation

`recommendedTempoScale(minGapSeconds)` returns a multiplier (at least 0.25, rounded down to 5 %
steps) so the shortest onset gap becomes at least ~0.102 s. The UI exposes this as the
**Fit Redstone (NN %)** button when any `R!` gap exists. Slowing down changes playback, notation and
repeater math together because tempo is scaled once at the source.

## Generated `.mcfunction` shape

`buildPlanToMcFunction` writes Java Edition 1.20+ commands relative to the player:

- Tracks run along **+X**; each role occupies a lane **5 blocks apart along +Z**.
- Each lane starts with a stone base and a `stone_button[face=floor]` trigger.
- Each note onset becomes: stone base → `redstone_wire` → one `note_block[note=N]` per simultaneous
  pitch, placed on a base block for the chosen instrument.
- Repeaters use `repeater[facing=west,delay=1..4]`.

Example fragment:

```mcfunction
setblock ~0 ~0 ~0 stone
setblock ~0 ~1 ~0 stone_button[face=floor]
setblock ~1 ~0 ~0 stone
setblock ~1 ~1 ~0 repeater[facing=west,delay=2]
setblock ~2 ~0 ~0 stone
setblock ~2 ~1 ~0 redstone_wire
setblock ~2 ~0 ~1 grass_block
setblock ~2 ~1 ~1 note_block[note=12]
```

The function assumes open space and a flat surface; it does not clear terrain or build the trigger
clock. Place it in a datapack under `data/<namespace>/functions/` and run it while standing at the
origin.

## Range-fitting rules

From `src/domain/fit.ts`:

1. Try every pitched instrument (or the user's override) and every shift that overlaps the part's
   range.
2. Rank candidates by: most notes playable → whole-octave shifts before key changes → smallest
   shift → role instrument preference (melody, chords, bass lists).
3. Optionally fold remaining out-of-range notes by whole octaves. Folding preserves the key but
   changes the register; the UI reports the folded count.
4. A non-octave shift is a **key change** and is surfaced explicitly.
