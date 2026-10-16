/**
 * Triggered effects ("When you play this Pokémon…", "If this Pokémon is Knocked Out…", "During Pokémon Checkup…").
 * There is no stack: triggers wait in `s.queue` and resolve in order once nothing else resolves.
 */

import { defOf, pokemonOf, topDef } from "./state";
import { abilitiesLocked } from "./statics";
import type { CardDef, GameState, ObjectId, PlayerId, PokemonId, QueuedTrigger, TriggerDef, TriggerEvent } from "./types";

/** The trigger a queued entry designates. */
export function triggerDef(s: GameState, q: QueuedTrigger): TriggerDef | undefined {
  const d = s.defs[q.defId];
  if (!d) return undefined;
  const [kind, i, j] = q.trigger.split(":");
  if (kind === "a") return d.abilities?.[Number(i)]?.triggers?.[Number(j)];
  if (kind === "t") return d.trainer?.triggers?.[Number(i)];
  if (kind === "e") return d.energy?.triggers?.[Number(i)];
  return undefined;
}

function push(
  out: QueuedTrigger[],
  d: CardDef,
  path: string,
  player: PlayerId,
  source: PokemonId | null,
  card: ObjectId | null,
  event?: Record<string, string>,
) {
  const q: QueuedTrigger = { player, source, card, defId: d.id, trigger: path };
  if (event) q.event = event;
  out.push(q);
}

export interface TriggerInfo {
  /** The card concerned (the card played, the Energy attached). */
  card?: ObjectId;
  /** Data for the effects (`event` of the resolution). */
  event?: Record<string, string>;
  /** The attacker's owner, for `byOpponentAttack`. */
  attacker?: PlayerId;
  /** A Pokémon no longer in play (Knocked Out): its definitions and owner. */
  gone?: { owner: PlayerId; top: string; attached: ObjectId[]; attachedDefs: string[] };
}

/** Queues the triggers of an event on a Pokémon (its Abilities, Tools and Energy, or the card concerned). */
export function queueTriggers(s: GameState, on: TriggerEvent, pokemon: PokemonId | null, info: TriggerInfo = {}): void {
  const out: QueuedTrigger[] = [];
  if (on === "benched") {
    // Only the Stadium watches every Bench.
    if (s.stadium) {
      const d = defOf(s, s.stadium);
      const owner = s.objects[s.stadium]?.owner as PlayerId;
      (d.trainer?.triggers ?? []).forEach((t, j) => {
        if (t.on === "benched") push(out, d, `t:${j}`, owner, null, s.stadium, info.event);
      });
    }
    s.queue.push(...out);
    return;
  }
  const matches = (t: TriggerDef, owner: PlayerId) =>
    t.on === on && (!t.byOpponentAttack || (info.attacker !== undefined && info.attacker !== owner));
  if (on === "attached" && info.card) {
    const d = defOf(s, info.card);
    const owner = s.objects[info.card]?.owner as PlayerId;
    (d.energy?.triggers ?? []).forEach((t, j) => {
      if (matches(t, owner)) push(out, d, `e:${j}`, owner, pokemon, info.card ?? null, info.event);
    });
    (d.trainer?.triggers ?? []).forEach((t, j) => {
      if (matches(t, owner)) push(out, d, `t:${j}`, owner, pokemon, info.card ?? null, info.event);
    });
    s.queue.push(...out);
    return;
  }
  if (info.gone) {
    const g = info.gone;
    const top = s.defs[g.top];
    if (top)
      (top.abilities ?? []).forEach((a, i) => {
        (a.triggers ?? []).forEach((t, j) => {
          if (matches(t, g.owner)) push(out, top, `a:${i}:${j}`, g.owner, pokemon, null, info.event);
        });
      });
    g.attachedDefs.forEach((defId, k) => {
      const d = s.defs[defId];
      (d?.trainer?.triggers ?? []).forEach((t, j) => {
        if (d && matches(t, g.owner)) push(out, d, `t:${j}`, g.owner, pokemon, g.attached[k] ?? null, info.event);
      });
      (d?.energy?.triggers ?? []).forEach((t, j) => {
        if (d && matches(t, g.owner)) push(out, d, `e:${j}`, g.owner, pokemon, g.attached[k] ?? null, info.event);
      });
    });
    s.queue.push(...out);
    return;
  }
  if (!pokemon || !s.pokemon[pokemon]) return;
  const pk = pokemonOf(s, pokemon);
  const top = topDef(s, pokemon);
  if (!abilitiesLocked(s, pokemon))
    (top.abilities ?? []).forEach((a, i) => {
      (a.triggers ?? []).forEach((t, j) => {
        if (matches(t, pk.owner)) push(out, top, `a:${i}:${j}`, pk.owner, pokemon, pk.cards.at(-1) ?? null, info.event);
      });
    });
  if (on !== "playedToBench" && on !== "evolved")
    for (const c of [...pk.tools, ...pk.energy]) {
      const d = defOf(s, c);
      (d.trainer?.triggers ?? []).forEach((t, j) => {
        if (matches(t, pk.owner)) push(out, d, `t:${j}`, pk.owner, pokemon, c, info.event);
      });
      (d.energy?.triggers ?? []).forEach((t, j) => {
        if (matches(t, pk.owner)) push(out, d, `e:${j}`, pk.owner, pokemon, c, info.event);
      });
    }
  s.queue.push(...out);
}
