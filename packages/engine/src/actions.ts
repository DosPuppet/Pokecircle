/** Main-phase decisions (docs/rules.md R-TURN-2, R-RETREAT, R-ATTACK), validated with the predicates of legal.ts. */
import { attachCard, benchCard, evolvePokemon, switchActive } from "./board";
import { putCounters } from "./damage";
import { startResolution } from "./effects";
import { isRetreatPayment } from "./energy";
import { RulesError } from "./errors";
import { emit } from "./events";
import {
  abilityKey,
  abilityUsable,
  attachTargets,
  canPlayBasic,
  evolveTargets,
  retreatOption,
  stadiumActionUsable,
  toolTargets,
  trainerPlayable,
  usableAttacks,
} from "./legal";
import { defOf, flipCoin, moveCard, obj, opponentOf, playerOf, pokemonOf, topDef, topObject } from "./state";
import { chars } from "./statics";
import { msg } from "./text";
import type { Decision, Effect, GameState, PlayerId } from "./types";

const VANILLA: Effect[] = [{ op: "mainDamage" }];

/** Ids received from outside must exist (a malformed decision is a RulesError, never a crash). */
function checkIds(s: GameState, p: PlayerId, d: Decision): void {
  const bad = () => new RulesError(msg("This decision is not expected now"));
  if ("card" in d && (typeof d.card !== "string" || !s.players[p]?.hand.includes(d.card))) throw bad();
  if ("target" in d && d.target !== undefined && !s.pokemon[d.target]) throw bad();
  if ("pokemon" in d && !s.pokemon[d.pokemon]) throw bad();
  if (d.type === "retreat" && (!s.pokemon[d.to] || d.discard.some((c) => !s.objects[c]))) throw bad();
  if (d.type === "attack" && d.source !== undefined && !s.objects[d.source]) throw bad();
}

export function applyMain(s: GameState, p: PlayerId, d: Decision): void {
  checkIds(s, p, d);
  // After a first attack (Festival Lead), only the second attack or the end of the turn.
  if (s.turn.attacks > 0 && d.type !== "attack" && d.type !== "endTurn")
    throw new RulesError(msg("This decision is not expected now"));
  switch (d.type) {
    case "playBasic": {
      if (!canPlayBasic(s, p, d.card)) throw new RulesError(msg("This Pokémon cannot be put onto your Bench"));
      benchCard(s, d.card, true);
      return;
    }
    case "evolve": {
      if (!evolveTargets(s, p, d.card).includes(d.target)) throw new RulesError(msg("This Pokémon cannot evolve now"));
      evolvePokemon(s, d.card, d.target, true);
      return;
    }
    case "attachEnergy": {
      if (!attachTargets(s, p, d.card).includes(d.target)) throw new RulesError(msg("You cannot attach this Energy now"));
      s.turn.energyAttached = true;
      attachCard(s, d.card, d.target, true);
      return;
    }
    case "playTrainer": {
      const def = defOf(s, d.card);
      const t = def.trainer;
      if (t?.kind === "tool") {
        if (!d.target || !toolTargets(s, p, d.card).includes(d.target))
          throw new RulesError(msg("This Tool cannot be attached there"));
        emit({ type: "playTrainer", player: p, card: d.card, defId: def.id, target: d.target });
        s.turnLog.push({ turn: s.turn.number, player: p, kind: "itemPlayed", defId: def.id });
        attachCard(s, d.card, d.target, true);
        return;
      }
      if (!t || !trainerPlayable(s, p, d.card)) throw new RulesError(msg("This card cannot be played now"));
      emit({ type: "playTrainer", player: p, card: d.card, defId: def.id });
      if (t.kind === "stadium") {
        if (s.stadium) moveCard(s, s.stadium, "discard");
        moveCard(s, d.card, "stadium", { silent: true });
        s.turn.stadiumPlayed = true;
        s.turnLog.push({ turn: s.turn.number, player: p, kind: "stadiumPlayed", defId: def.id });
        emit({ type: "stadium", player: p, card: d.card, defId: def.id });
        return;
      }
      if (t.kind === "supporter") s.turn.supporterPlayed = true;
      s.turnLog.push({
        turn: s.turn.number,
        player: p,
        kind: t.kind === "supporter" ? "supporterPlayed" : "itemPlayed",
        defId: def.id,
      });
      moveCard(s, d.card, "resolving", { silent: true });
      startResolution(s, { kind: "trainer", player: p, source: null, card: d.card, defId: def.id, effects: t.effects ?? [] });
      return;
    }
    case "useAbility": {
      if (!abilityUsable(s, p, d.pokemon, d.ability)) throw new RulesError(msg("This Ability cannot be used now"));
      const top = topDef(s, d.pokemon);
      const ab = top.abilities?.[d.ability];
      const act = ab?.activated;
      if (!ab || !act) throw new RulesError(msg("This Ability cannot be used now"));
      const once = act.once ?? "turn";
      const key = once === "turnByName" ? `name:${p}:${ab.name}` : abilityKey(d.pokemon, d.ability);
      s.turnLog.push({ turn: s.turn.number, player: p, kind: "abilityUsed", pokemon: d.pokemon, defId: top.id, key });
      if (once === "game") s.usedOnce.push(`${p}:${top.name}:${ab.name}`);
      emit({ type: "ability", player: p, pokemon: d.pokemon, defId: top.id, name: ab.name });
      startResolution(s, {
        kind: "ability",
        player: p,
        source: d.pokemon,
        card: topObject(s, d.pokemon).id,
        defId: top.id,
        effects: act.effects,
        ...(act.endsTurn ? { event: { endsTurn: "1" } } : {}),
      });
      return;
    }
    case "stadiumAction": {
      if (!stadiumActionUsable(s, p) || !s.stadium) throw new RulesError(msg("The Stadium cannot be used now"));
      const def = defOf(s, s.stadium);
      s.turnLog.push({ turn: s.turn.number, player: p, kind: "abilityUsed", defId: def.id, key: `stadium:${p}` });
      emit({ type: "ability", player: p, pokemon: null, defId: def.id, name: "" });
      startResolution(s, {
        kind: "stadium",
        player: p,
        source: null,
        card: s.stadium,
        defId: def.id,
        effects: def.trainer?.effects ?? [],
      });
      return;
    }
    case "retreat": {
      const opt = retreatOption(s, p);
      const active = playerOf(s, p).active;
      if (!opt || !active || !opt.to.includes(d.to)) throw new RulesError(msg("Your Active Pokémon cannot retreat now"));
      if (!isRetreatPayment(s, active, d.discard, chars(s, active).retreat))
        throw new RulesError(msg("Discard Energy equal to the Retreat Cost"));
      for (const c of d.discard) moveCard(s, c, "discard");
      s.turn.retreated = true;
      s.turnLog.push({ turn: s.turn.number, player: p, kind: "retreated", pokemon: active });
      switchActive(s, p, d.to, true);
      return;
    }
    case "attack": {
      const a = usableAttacks(s, p).find((x) => x.index === d.index && x.source === d.source);
      const id = playerOf(s, p).active;
      if (!a || !id) throw new RulesError(msg("This attack cannot be used now"));
      const top = topDef(s, id);
      const defending = playerOf(s, opponentOf(s, p)).active;
      emit({
        type: "attack",
        player: p,
        pokemon: id,
        defId: a.source ? obj(s, a.source).defId : top.id,
        name: a.def.name,
        target: defending,
      });
      s.turnLog.push({ turn: s.turn.number, player: p, kind: "attacked", pokemon: id, defId: top.id });
      s.turn.attacks++;
      delete s.turn.again;
      // R-ATTACK-2: a Confused Pokémon flips a coin; tails, 3 damage counters on itself and the attack does nothing.
      if (pokemonOf(s, id).cond.rotating === "confused" && !flipCoin(s, p)) {
        putCounters(s, null, id, 3);
        emit({ type: "attackFails", player: p, pokemon: id });
        s.turn.ending = true;
        return;
      }
      const effects = a.def.effects ?? VANILLA;
      startResolution(s, {
        kind: "attack",
        player: p,
        source: id,
        card: a.source ?? topObject(s, id).id,
        defId: a.source ? obj(s, a.source).defId : top.id,
        effects,
        attack: {
          index: a.index,
          defending,
          base: a.def.damage,
          bonus: 0,
          fails: false,
          ...(a.source ? { source: a.source } : {}),
        },
      });
      return;
    }
    case "endTurn":
      s.turn.ending = true;
      return;
    default:
      throw new RulesError(msg("This decision is not expected now"));
  }
}
