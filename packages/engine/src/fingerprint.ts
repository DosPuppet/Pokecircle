/** A short hash of what a game state is (records' checkpoints, golden games): two equal states have equal hashes. */
import type { GameState } from "./types";

function fnv(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function outcomeHash(s: GameState): string {
  const { defs: _defs, version: _v, ...rest } = s;
  return fnv(JSON.stringify(rest));
}
