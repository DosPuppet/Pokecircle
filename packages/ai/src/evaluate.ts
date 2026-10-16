/**
 * Position evaluation from a player's point of view: the Prize race first, then the board (HP left, Energy toward
 * attacks, evolution), threats of Knock Out both ways, resources (hand, deck), Special Conditions.
 */
import {
  canPay,
  chars,
  countUnits,
  type GameState,
  opponentOf,
  type PlayerId,
  type PokemonId,
  prizesFor,
  unitsOf,
} from "@pokecircle/engine";

const WIN = 10_000;

/** The best damage the Pokémon could do now with its attached Energy (printed damage, before Weakness). */
function bestDamage(s: GameState, id: PokemonId, extraUnits = 0): number {
  const units = unitsOf(s, id);
  const padded = extraUnits ? [...units, ...Array.from({ length: extraUnits }, () => ["*"])] : units;
  let best = 0;
  for (const a of chars(s, id).attacks) if (canPay(padded, a.cost)) best = Math.max(best, a.def.damage);
  return best;
}

function weaknessFactor(s: GameState, attacker: PokemonId, target: PokemonId): number {
  const t = chars(s, target);
  const types = chars(s, attacker).types;
  let f = 1;
  if (t.weakness && types.includes(t.weakness.type)) f *= t.weakness.mult;
  return f;
}

function pokemonValue(s: GameState, id: PokemonId): number {
  const pk = s.pokemon[id];
  if (!pk) return 0;
  const c = chars(s, id);
  const left = Math.max(0, c.hp - pk.damage);
  let v = left * 0.25 + countUnits(s, id) * 9 + pk.tools.length * 6;
  if (c.stage === "stage1") v += 14;
  if (c.stage === "stage2") v += 30;
  if (c.tags.includes("ex")) v += 10;
  v += bestDamage(s, id) * 0.15;
  return v;
}

export function evaluate(s: GameState, p: PlayerId): number {
  const o = opponentOf(s, p);
  if (s.over) return s.winner === p ? WIN : s.winner === o ? -WIN : 0;
  const me = s.players[p];
  const opp = s.players[o];
  if (!me || !opp) return 0;
  let v = 0;
  // Prize race: each Prize taken is worth a lot, more near the end.
  const left = (n: number) => (6 - n) * 110 + (n <= 2 ? (3 - n) * 60 : 0);
  v += left(me.prizes.length) - left(opp.prizes.length);
  for (const id of [me.active, ...me.bench]) if (id) v += pokemonValue(s, id);
  for (const id of [opp.active, ...opp.bench]) if (id) v -= pokemonValue(s, id);
  // A lone Active Pokémon can lose the game to one Knock Out.
  if (!me.bench.length) v -= 70;
  if (!opp.bench.length) v += 70;
  v += Math.min(me.bench.length, 4) * 6 - Math.min(opp.bench.length, 4) * 6;
  // Threats: Knock Outs available next turn, both ways (one more Energy each).
  if (me.active && opp.active) {
    const mine = bestDamage(s, me.active, s.turn.active === p ? 0 : 1) * weaknessFactor(s, me.active, opp.active);
    const theirs = bestDamage(s, opp.active, 1) * weaknessFactor(s, opp.active, me.active);
    const oppLeft = chars(s, opp.active).hp - (s.pokemon[opp.active]?.damage ?? 0);
    const myLeft = chars(s, me.active).hp - (s.pokemon[me.active]?.damage ?? 0);
    if (mine >= oppLeft) v += 35 * prizesFor(s, opp.active);
    if (theirs >= myLeft) v -= 35 * prizesFor(s, me.active);
    const c = s.pokemon[me.active]?.cond;
    if (c?.rotating === "asleep" || c?.rotating === "paralyzed") v -= 18;
    if (c?.rotating === "confused") v -= 8;
    if (c?.poisoned) v -= 6;
    if (c?.burned) v -= 8;
  }
  v += Math.min(me.hand.length, 10) * 2.5 - Math.min(opp.hand.length, 10) * 1.5;
  if (me.deck.length < 8) v -= (8 - me.deck.length) * 12;
  if (opp.deck.length < 8) v += (8 - opp.deck.length) * 8;
  return v;
}
