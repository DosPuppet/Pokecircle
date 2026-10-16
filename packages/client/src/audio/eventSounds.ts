/** Game events → sounds (one sound per event kind, the strongest of a batch first). */
import type { GameEvent, PlayerId } from "@pokecircle/engine";
import type { SoundKey } from "./sounds";

export function soundsFor(events: GameEvent[], me: PlayerId): SoundKey[] {
  const out: SoundKey[] = [];
  const add = (k: SoundKey) => {
    if (!out.includes(k)) out.push(k);
  };
  for (const e of events) {
    switch (e.type) {
      case "shuffle":
        add("shuffle");
        break;
      case "draw":
        add("draw");
        break;
      case "playBasic":
        add("place");
        break;
      case "evolve":
        add("evolve");
        break;
      case "attach":
        add("attach");
        break;
      case "playTrainer":
      case "stadium":
        add("trainer");
        break;
      case "ability":
        add("ability");
        break;
      case "attack":
        add("attack");
        break;
      case "damage":
        if (e.amount > 0) add(e.amount >= 100 ? "hitHeavy" : "hit");
        break;
      case "counters":
        add("hit");
        break;
      case "heal":
        add("heal");
        break;
      case "knockOut":
        add("knockOut");
        break;
      case "coinFlip":
        add("coin");
        break;
      case "condition":
        if (e.on) add("condition");
        break;
      case "prizes":
        add("prize");
        break;
      case "turnStart":
        if (e.player === me) add("turn");
        break;
      case "gameOver":
        add(e.winner === me ? "win" : "lose");
        break;
    }
  }
  return out;
}
