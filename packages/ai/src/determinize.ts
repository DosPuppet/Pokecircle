/**
 * What an AI may know: before simulating, the cards it cannot see are replaced, and the game's random numbers are
 * reseeded, so that it never reads hidden cards or foresees coin flips.
 *
 * - Its own deck and Prizes: it knows its decklist, not where the cards are; their cards are redealt among them.
 * - The opponent's hand, deck and Prizes: it knows neither their list nor their hand. Each hidden card is drawn from
 *   what it has seen of that opponent (their cards in play, under their Pokémon, in their discard pile and Lost
 *   Zone, their Stadium), with a share of Basic Energy of the types seen. Nothing seen yet (before the reveal of the
 *   setup): their own cards are redealt.
 * - Cards its pending question shows it (a search of its deck, a look at the opponent's hand) stay what they are.
 *
 * Cards revealed earlier and gone back to a hidden zone are not remembered: they are drawn like the others.
 */
import { cloneState, type GameState, opponentOf, type PlayerId } from "@pokecircle/engine";
import { pickOne, type Rng, shuffled } from "./rng";

/** Assumed share of Basic Energy among an opponent's hidden cards (about 10 to 14 in a 60-card deck). */
const ENERGY_SHARE = 0.2;

/** The definitions an opponent `o` has shown: public cards they own (several copies count several times). */
function seenDefs(s: GameState, o: PlayerId, keep: ReadonlySet<string>): string[] {
  const ps = s.players[o];
  if (!ps) return [];
  const ids = [...ps.discard, ...ps.lostZone, ...keep];
  for (const pk of Object.values(s.pokemon)) if (pk.owner === o) ids.push(...pk.cards, ...pk.energy, ...pk.tools);
  if (s.stadium) ids.push(s.stadium);
  return ids.map((id) => s.objects[id]).flatMap((c) => (c && c.owner === o ? [c.defId] : []));
}

/** Basic Energy of the types an opponent has shown (their Pokémon's types and attack costs, their Energy). */
function energyDefs(s: GameState, seen: string[]): string[] {
  const types = new Set<string>();
  for (const id of seen) {
    const d = s.defs[id];
    for (const t of d?.types ?? []) types.add(t);
    for (const a of d?.attacks ?? []) for (const t of a.cost) if (t !== "C") types.add(t);
    if (d?.energy?.basic) for (const u of d.energy.provides) for (const t of u) types.add(t);
  }
  return Object.values(s.defs)
    .filter((d) => d.energy?.basic && d.energy.provides.some((u) => u.some((t) => types.has(t))))
    .map((d) => d.id);
}

export function determinize(s: GameState, p: PlayerId, rng: Rng): GameState {
  const d = cloneState(s);
  const shown = s.pending?.kind === "choice" && s.pending.player === p ? s.pending.request.cards : undefined;
  const keep = new Set(Object.keys(shown ?? {}));
  const hidden = (ids: string[]) => ids.filter((id) => !keep.has(id));
  const assign = (ids: string[], defIds: string[]) =>
    ids.forEach((id, i) => {
      const c = d.objects[id];
      if (c) {
        c.defId = defIds[i] as string;
        delete c.print;
      }
    });
  // Sorted before shuffling: where the cards really are has no effect on the result.
  const redeal = (ids: string[]) => assign(ids, shuffled(rng, ids.map((id) => d.objects[id]?.defId as string).sort()));
  const me = d.players[p];
  if (me) redeal(hidden([...me.deck, ...me.prizes]));
  const o = opponentOf(d, p);
  const opp = d.players[o];
  if (opp) {
    const ids = hidden([...opp.hand, ...opp.deck, ...opp.prizes]);
    const seen = seenDefs(s, o, keep);
    const cards = seen.filter((id) => !s.defs[id]?.energy?.basic);
    const energy = energyDefs(s, seen);
    if (!cards.length && !energy.length) redeal(ids);
    else
      assign(
        ids,
        ids.map(() => (energy.length && (!cards.length || rng() < ENERGY_SHARE) ? pickOne(rng, energy) : pickOne(rng, cards))),
      );
  }
  d.rng = Math.floor(rng() * 2 ** 31);
  d.version++;
  return d;
}
