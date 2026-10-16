/**
 * Shape of a decision received from outside (online client, AI): wrong types are refused with a RulesError before the
 * engine reads them.
 */
import { RulesError } from "./errors";
import { msg } from "./text";
import type { Decision } from "./types";

const str = (v: unknown) => typeof v === "string" && v.length > 0 && v.length < 64;
const strs = (v: unknown) => Array.isArray(v) && v.length < 100 && v.every(str);
const int = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1000;

export function checkDecisionShape(d: unknown): asserts d is Decision {
  const bad = () => new RulesError(msg("Malformed decision"));
  if (!d || typeof d !== "object") throw bad();
  const x = d as Record<string, unknown>;
  switch (x.type) {
    case "setup":
      if (!str(x.active) || !strs(x.bench)) throw bad();
      return;
    case "playBasic":
      if (!str(x.card)) throw bad();
      return;
    case "evolve":
    case "attachEnergy":
      if (!str(x.card) || !str(x.target)) throw bad();
      return;
    case "playTrainer":
      if (!str(x.card) || (x.target !== undefined && !str(x.target))) throw bad();
      return;
    case "useAbility":
      if (!str(x.pokemon) || !int(x.ability)) throw bad();
      return;
    case "retreat":
      if (!str(x.to) || !strs(x.discard)) throw bad();
      return;
    case "attack":
      if (!int(x.index) || (x.source !== undefined && !str(x.source))) throw bad();
      return;
    case "choose":
      if (
        !Array.isArray(x.values) ||
        x.values.length > 100 ||
        !x.values.every((v) => (typeof v === "string" && v.length < 64) || (typeof v === "number" && Number.isInteger(v)))
      )
        throw bad();
      return;
    case "stadiumAction":
    case "endTurn":
    case "concede":
      return;
    default:
      throw bad();
  }
}
