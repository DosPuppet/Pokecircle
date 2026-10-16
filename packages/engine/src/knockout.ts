/**
 * Knock Outs, Prize cards, promotion of a new Active Pokémon and winning (docs/rules.md R-KO, R-WIN).
 */
import { emit } from "./events";
import { prizesFor } from "./prizes";
import {
  allInPlay,
  bump,
  cardsOfPokemon,
  inPlay,
  moveCard,
  obj,
  opponentOf,
  playerOf,
  pokemonOf,
  removePokemon,
  topDef,
} from "./state";
import { chars } from "./statics";
import { msg } from "./text";
import { queueTriggers } from "./triggers";
import type { GameState, ObjectId, PlayerId, PokemonId } from "./types";

/** Knocks Out every Pokémon whose damage reaches its HP, all at once (R-KO-1, R-KO-3). Returns whether any was. */
export function checkKnockouts(s: GameState): boolean {
  const kos = allInPlay(s).filter((id) => pokemonOf(s, id).damage >= chars(s, id).hp && chars(s, id).hp > 0);
  if (!kos.length) return false;
  const prizes: Record<PlayerId, number> = {};
  for (const id of kos) {
    const pk = pokemonOf(s, id);
    const top = topDef(s, id);
    const taker = opponentOf(s, pk.owner);
    const hit = s.turnLog.some((e) => e.turn === s.turn.number && e.kind === "damagedByAttack" && e.pokemon === id);
    prizes[taker] = (prizes[taker] ?? 0) + prizesFor(s, id, hit);
    const attached = [...pk.tools, ...pk.energy];
    const attachedDefs = attached.map((c) => obj(s, c).defId);
    const byAttack = s.turnLog.some((e) => e.turn === s.turn.number && e.kind === "damagedByAttack" && e.pokemon === id);
    const attackerOwner = byAttack ? s.turn.active : undefined;
    emit({ type: "knockOut", pokemon: id, defId: top.id, player: pk.owner });
    s.turnLog.push({ turn: s.turn.number, player: pk.owner, kind: "knockedOut", pokemon: id, defId: top.id });
    const cards: ObjectId[] = cardsOfPokemon(s, id);
    removePokemon(s, id);
    for (const c of cards) moveCard(s, c, "discard");
    queueTriggers(s, "knockedOut", id, {
      ...(attackerOwner !== undefined ? { attacker: attackerOwner } : {}),
      gone: { owner: pk.owner, top: top.id, attached, attachedDefs },
      event: { pokemon: id, defId: top.id },
    });
  }
  // Each player takes their Prize cards (R-KO-2).
  for (const p of s.playerOrder) {
    const n = prizes[p];
    if (n) takePrizes(s, p, n);
  }
  bump(s);
  return true;
}

/** Takes Prize cards into the hand (they are unknown, so which ones does not matter). */
export function takePrizes(s: GameState, p: PlayerId, n: number): void {
  const ps = playerOf(s, p);
  const taken = ps.prizes.slice(0, n);
  for (const c of taken) {
    ps.prizes.splice(ps.prizes.indexOf(c), 1);
    obj(s, c).zone = "hand";
    ps.hand.push(c);
  }
  if (!taken.length) return;
  ps.prizesTaken += taken.length;
  bump(s);
  emit({ type: "prizes", player: p, cards: taken, defIds: taken.map((c) => obj(s, c).defId) });
}

/** The next player who must promote a Benched Pokémon (the player whose turn it is first, R-KO-4). */
export function promotionNeeded(s: GameState): PlayerId | null {
  const order = [s.turn.active, opponentOf(s, s.turn.active)];
  return order.find((p) => !playerOf(s, p).active && playerOf(s, p).bench.length > 0) ?? null;
}

export function promote(s: GameState, p: PlayerId, id: PokemonId): void {
  const ps = playerOf(s, p);
  ps.bench = ps.bench.filter((x) => x !== id);
  ps.active = id;
  bump(s);
  s.turnLog.push({ turn: s.turn.number, player: p, kind: "becameActive", pokemon: id });
  emit({ type: "promote", player: p, pokemon: id });
  queueTriggers(s, "becameActive", id);
}

/**
 * Win conditions (R-WIN): last Prize card taken, no Pokémon in play for the opponent; `deckOut`: the player who could
 * not draw. Ends the game and returns true if someone wins (or Sudden Death).
 */
export function checkWinner(s: GameState, deckOut?: PlayerId): boolean {
  if (s.over || s.flow === "setup") return false;
  const met: Record<PlayerId, number> = {};
  for (const p of s.playerOrder) {
    const opp = opponentOf(s, p);
    let n = 0;
    if (playerOf(s, p).prizes.length === 0 && playerOf(s, p).prizesTaken > 0) n++;
    if (inPlay(s, opp).length === 0) n++;
    if (deckOut === opp) n++;
    met[p] = n;
  }
  const [a, b] = s.playerOrder as [PlayerId, PlayerId];
  const ma = met[a] ?? 0;
  const mb = met[b] ?? 0;
  if (!ma && !mb) return false;
  if (ma === mb) {
    // R-WIN-4: both players win at the same time with as many conditions: Sudden Death.
    endGame(s, null, "suddenDeath");
    return true;
  }
  const winner = ma > mb ? a : b;
  const loser = opponentOf(s, winner);
  const reason =
    playerOf(s, winner).prizes.length === 0 && playerOf(s, winner).prizesTaken > 0
      ? "prizes"
      : deckOut === loser
        ? "deckOut"
        : "noPokemon";
  endGame(s, winner, reason);
  return true;
}

export function endGame(s: GameState, winner: PlayerId | null, reason: NonNullable<GameState["endReason"]>): void {
  s.over = true;
  s.flow = "over";
  s.winner = winner;
  s.endReason = reason;
  s.pending = null;
  s.resolving = null;
  s.queue = [];
  emit({ type: "gameOver", winner, reason });
  if (reason === "suddenDeath") emit({ type: "message", text: msg("Both players win at the same time: Sudden Death") });
}
