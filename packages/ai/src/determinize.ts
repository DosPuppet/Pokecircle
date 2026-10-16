/**
 * What an AI may know: before simulating, the cards it cannot see are redealt at random among their hidden places (its
 * own deck and Prizes; the opponent's hand, deck and Prizes), and the game's random numbers are reseeded, so that it
 * never reads hidden cards or foresees coin flips.
 */
import { cloneState, type GameState, opponentOf, type PlayerId } from "@pocketmate/engine";
import { type Rng, shuffled } from "./rng";

export function determinize(s: GameState, p: PlayerId, rng: Rng): GameState {
  const d = cloneState(s);
  const redeal = (ids: string[]) => {
    const defIds = shuffled(
      rng,
      ids.map((id) => d.objects[id]?.defId as string),
    );
    ids.forEach((id, i) => {
      const o = d.objects[id];
      if (o) {
        o.defId = defIds[i] as string;
        delete o.print;
      }
    });
  };
  const me = d.players[p];
  const opp = d.players[opponentOf(d, p)];
  if (me) redeal([...me.deck, ...me.prizes]);
  if (opp) redeal([...opp.hand, ...opp.deck, ...opp.prizes]);
  d.rng = Math.floor(rng() * 2 ** 31);
  d.version++;
  return d;
}
