/**
 * Game state: a single JSON-serializable object (no classes, functions, Maps or Sets). `submit` works on a copy.
 */
import type { CardDef } from "./cards";
import type { ChoiceValue, PendingDecision } from "./decisions";
import type { Effect, SpecialCondition, TurnEventKind } from "./effects";
import type { StaticRule } from "./rules";

export type PlayerId = string;
export type ObjectId = string;
export type PokemonId = string;

export type Zone = "deck" | "hand" | "discard" | "prizes" | "lostZone" | "inPlay" | "stadium" | "resolving";

/** A physical card. Its id changes when it enters the deck or the Prizes (hidden zones), so it cannot be tracked there. */
export interface CardObject {
  id: ObjectId;
  defId: string;
  owner: PlayerId;
  zone: Zone;
  /** Chosen print (art); absent: the definition's default. */
  print?: string;
  /** In play: the Pokémon it belongs to (evolution stack card, attached Energy or Tool). */
  host?: PokemonId;
}

export interface Conditions {
  /** Asleep, Confused and Paralyzed replace each other (R-COND-1). */
  rotating?: "asleep" | "confused" | "paralyzed";
  /** Damage counters put during each Pokémon Checkup. */
  poisoned?: number;
  burned?: boolean;
  /** Turn when it became Paralyzed (R-CHECKUP-1). */
  paralyzedTurn?: number;
}

/** A Pokémon in play: a stack of cards (Basic at the bottom, the current Pokémon on top) and what is attached. */
export interface PokemonInPlay {
  id: PokemonId;
  owner: PlayerId;
  cards: ObjectId[];
  energy: ObjectId[];
  tools: ObjectId[];
  /** Damage (a multiple of 10: damage counters × 10). */
  damage: number;
  cond: Conditions;
  /** Turn when it was put into play (R-EVOLVE-2). */
  enteredTurn: number;
  /** Turn of its last evolution. */
  evolvedTurn?: number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  /** Index 0 is the top of the deck. */
  deck: ObjectId[];
  hand: ObjectId[];
  discard: ObjectId[];
  lostZone: ObjectId[];
  prizes: ObjectId[];
  active: PokemonId | null;
  bench: PokemonId[];
  mulligans: number;
  prizesTaken: number;
}

export type Flow =
  | "setup"
  /** Start of a turn: draw a card. */
  | "turnStart"
  | "main"
  /** After an attack, or the end of the turn: end-of-turn effects. */
  | "turnEnd"
  | "checkup"
  | "over";

export interface SetupState {
  step: "coin" | "first" | "deal" | "draws" | "place" | "prizes" | "done";
  /** Winner of the opening coin flip (or the player who chooses, in a best-of-three). */
  chooser?: PlayerId;
  /** Extra cards each player may draw for the opponent's mulligans (R-SETUP-3). */
  extraDraws: Record<PlayerId, number>;
  /** Placement already chosen (hidden until both players have placed). */
  placed: Record<PlayerId, { active: ObjectId; bench: ObjectId[] }>;
}

export interface TurnState {
  number: number;
  active: PlayerId;
  /** The player who went first. */
  first: PlayerId;
  energyAttached: boolean;
  supporterPlayed: boolean;
  stadiumPlayed: boolean;
  retreated: boolean;
  /** Attacks used this turn. */
  attacks: number;
  /** A second attack is allowed (Festival Lead): the attack it may repeat. */
  again?: { index: number; source?: ObjectId };
  /** The attack (or an effect) ends the turn. */
  ending: boolean;
}

/** A frame of a resolution: a list of effects and the current index (control ops push frames). */
export interface Frame {
  effects: Effect[];
  pc: number;
  /** `repeat`: iterations left after this one. */
  repeat?: number;
  /** `forEach`: the items and the current index. */
  each?: { key: string; as: string; items: string[]; i: number };
}

export interface AttackState {
  index: number;
  /** The Defending Pokémon (R-ATTACK-3). */
  defending: PokemonId | null;
  /** Base damage after `setDamage`. */
  base: number;
  bonus: number;
  fails: boolean;
  /** The attack is granted by this card (Tool). */
  source?: ObjectId;
}

/** Something being resolved: an attack, a Trainer card, an Ability, a triggered effect, the Pokémon Checkup. */
export interface Resolution {
  kind: "attack" | "trainer" | "ability" | "trigger" | "stadium";
  player: PlayerId;
  /** The source Pokémon ("this Pokémon"). */
  source: PokemonId | null;
  /** The source card (Trainer being played, Tool, Energy, Stadium). */
  card: ObjectId | null;
  defId: string;
  frames: Frame[];
  /** Named values (stored choices, counts). */
  vars: Record<string, ChoiceValue[]>;
  /** Answers to the questions of the current op, by key. */
  answers: Record<string, ChoiceValue[]>;
  /** Ops completed: the prefix of the questions' keys. */
  seq: number;
  awaiting: string | null;
  attack?: AttackState;
  /** Trigger data (the Knocked Out Pokémon's last information…). */
  event?: Record<string, string>;
}

/** A triggered effect waiting to resolve (there is no stack: they resolve in order). */
export interface QueuedTrigger {
  player: PlayerId;
  source: PokemonId | null;
  card: ObjectId | null;
  defId: string;
  /** Index of the trigger in the source's definition: `ability:<i>:<j>`, `tool:<j>`, `energy:<j>`, `stadium:<j>`. */
  trigger: string;
  event?: Record<string, string>;
}

/** A timed effect ("during your opponent's next turn, …"). */
export interface TimedEffect {
  id: string;
  /** The player who created it (the scope's "me"). */
  player: PlayerId;
  rule: StaticRule;
  /** Active from the start of this turn… */
  fromTurn: number;
  /** …to the end of this turn (included). */
  untilTurn: number;
  /** An effect of an attack on given Pokémon: it ends when they leave the Active Spot or evolve (R-TEXT-4). */
  attackEffect?: boolean;
  defId: string;
}

export interface TurnLogEntry {
  turn: number;
  player: PlayerId;
  kind: TurnEventKind;
  /** The Pokémon concerned (evolved, Knocked Out, attacking). */
  pokemon?: PokemonId;
  defId?: string;
  /** Ability: "<pokemonId>:<index>" or "<name>" for once-by-name limits. */
  key?: string;
}

export interface GameState {
  /** Characteristics cache invalidation (`bump`). */
  version: number;
  rng: number;
  idCounters: Record<string, number>;
  defs: Record<string, CardDef>;
  objects: Record<ObjectId, CardObject>;
  pokemon: Record<PokemonId, PokemonInPlay>;
  players: Record<PlayerId, PlayerState>;
  playerOrder: PlayerId[];
  stadium: ObjectId | null;
  turn: TurnState;
  flow: Flow;
  setup: SetupState;
  pending: PendingDecision | null;
  resolving: Resolution | null;
  queue: QueuedTrigger[];
  effects: TimedEffect[];
  turnLog: TurnLogEntry[];
  /** Once-per-game uses (`<player>:<key>`). */
  usedOnce: string[];
  /** Prize cards at the start (6, or 1 in Sudden Death). */
  prizeCount: number;
  /** Sudden Deaths played so far (R-WIN-4): the game restarted with 1 Prize card each. */
  suddenDeath?: number;
  winner: PlayerId | null;
  over: boolean;
  endReason?: EndReason;
}

export type EndReason = "prizes" | "noPokemon" | "deckOut" | "concede" | "draw";

/** Special Conditions as stored. */
export type { SpecialCondition };
