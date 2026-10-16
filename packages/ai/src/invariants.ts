/**
 * Invariants of a game state, checked at every decision of the fuzz: every card in exactly one place, damage a
 * multiple of 10, Bench within its limit, no Special Condition on the Bench, an Active Pokémon after setup, and a
 * decision always possible.
 */
import { benchSize, type GameState, legalActions } from "@pocketmate/engine";

export function checkInvariants(s: GameState, cardsPerPlayer?: Record<string, number>): string[] {
  const errors: string[] = [];
  const where = new Map<string, string>();
  const note = (id: string, place: string) => {
    if (where.has(id)) errors.push(`${id} is in ${where.get(id)} and ${place}`);
    where.set(id, place);
    if (!s.objects[id]) errors.push(`${id} (${place}) is not an object`);
  };
  for (const p of s.playerOrder) {
    const ps = s.players[p];
    if (!ps) continue;
    for (const z of ["deck", "hand", "discard", "prizes", "lostZone"] as const) {
      for (const id of ps[z]) {
        note(id, `${p}.${z}`);
        if (s.objects[id]?.zone !== z) errors.push(`${id} listed in ${z} but its zone is ${s.objects[id]?.zone}`);
        if (s.objects[id]?.owner !== p) errors.push(`${id} in ${p}.${z} is not theirs`);
      }
    }
    const inPlay = ps.active ? [ps.active, ...ps.bench] : ps.bench;
    for (const id of inPlay) if (!s.pokemon[id]) errors.push(`${p} has a missing Pokémon ${id}`);
    if (s.flow !== "setup" && !s.over) {
      const promoting =
        s.pending?.kind === "choice" && (s.pending.purpose === "promote" || s.pending.purpose === "benchOverflow");
      if (!ps.active && !promoting && !s.resolving && !s.queue.length) errors.push(`${p} has no Active Pokémon`);
      if (ps.bench.length > benchSize(s, p) && !promoting) errors.push(`${p} has ${ps.bench.length} Benched Pokémon`);
    }
  }
  for (const pk of Object.values(s.pokemon)) {
    for (const id of [...pk.cards, ...pk.energy, ...pk.tools]) {
      note(id, `pokemon ${pk.id}`);
      if (s.objects[id]?.host !== pk.id) errors.push(`${id} on ${pk.id} has host ${s.objects[id]?.host}`);
    }
    if (!pk.cards.length) errors.push(`${pk.id} has no card`);
    if (pk.damage < 0 || pk.damage % 10 !== 0) errors.push(`${pk.id} has damage ${pk.damage}`);
    const ps = s.players[pk.owner];
    if (ps?.active !== pk.id && !ps?.bench.includes(pk.id)) errors.push(`${pk.id} is neither Active nor Benched`);
    if (ps?.active !== pk.id && (pk.cond.rotating || pk.cond.poisoned || pk.cond.burned))
      errors.push(`${pk.id} on the Bench has a Special Condition`);
  }
  if (s.stadium) note(s.stadium, "stadium");
  for (const o of Object.values(s.objects)) {
    if (o.zone === "resolving") note(o.id, "resolving");
    if (!where.has(o.id)) errors.push(`${o.id} (${o.zone}) is nowhere`);
  }
  if (cardsPerPlayer)
    for (const [p, n] of Object.entries(cardsPerPlayer)) {
      const count = Object.values(s.objects).filter((o) => o.owner === p).length;
      if (count !== n) errors.push(`${p} has ${count} cards instead of ${n}`);
    }
  if (!s.over) {
    if (!s.pending) errors.push("no decision pending in a game not over");
    else if (s.pending.kind === "main" && !legalActions(s, s.pending.player).length) errors.push("no legal action");
  }
  return errors;
}
