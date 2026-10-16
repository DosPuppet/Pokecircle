/**
 * Table of the sound effects: stable key → recorded samples (public/sounds/, Kenney CC0, see LICENSE-kenney.txt) or a
 * synthesized cue (synth.ts, loaded on demand). Changing a sound = changing one line here.
 */
import type { SynthId } from "./synth";

export type SoundDef =
  | {
      files: string[];
      /** Relative volume (0 to 1), before the master volume. */
      volume: number;
      steady?: boolean;
    }
  | { synth: SynthId; volume: number };

const range = (prefix: string, ids: (string | number)[]) => ids.map((i) => `${prefix}${i}.ogg`);
const synth = (id: SynthId, volume = 1): SoundDef => ({ synth: id, volume });

export const SOUNDS = {
  shuffle: { files: ["card-shuffle.ogg"], volume: 0.6 },
  draw: { files: range("card-slide-", [1, 2, 3, 5]), volume: 0.55 },
  place: { files: range("card-place-", [1, 2, 3, 4]), volume: 0.7 },
  trainer: { files: range("card-shove-", [1, 2, 3, 4]), volume: 0.55 },
  attach: { files: ["metalClick.ogg"], volume: 0.5 },
  evolve: synth("castG"),
  ability: synth("ability"),
  attack: synth("attack"),
  hit: synth("hit"),
  hitHeavy: synth("hitHeavy"),
  heal: synth("heal"),
  knockOut: synth("dies"),
  coin: { files: range("chip-lay-", [1, 2, 3]), volume: 0.8 },
  condition: synth("poison"),
  prize: synth("command"),
  turn: synth("turn"),
  click: synth("click"),
  error: synth("error"),
  win: synth("win"),
  lose: synth("lose"),
} satisfies Record<string, SoundDef>;

export type SoundKey = keyof typeof SOUNDS;

export const SOUND_FILES: string[] = [
  ...new Set(Object.values(SOUNDS as Record<string, SoundDef>).flatMap((s) => ("files" in s ? s.files : []))),
];
