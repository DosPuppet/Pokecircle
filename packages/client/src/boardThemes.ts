/**
 * Playmats, chosen by the player and kept with the settings. The rendering is entirely in CSS (`styles.css`,
 * `[data-board=…]`): gradients, SVG patterns and noise, no image to download. Labels are translated at display.
 */
import { msg } from "@pokecircle/engine";

export type BoardTheme = "stadium" | "meadow" | "ocean" | "volcano" | "thunder" | "psychic" | "pokeball" | "night";
/** The player's choice: a playmat, or a random one for each game. */
export type BoardChoice = BoardTheme | "random";

export const BOARD_THEMES: { id: BoardTheme; label: string }[] = [
  { id: "stadium", label: msg("Stadium") },
  { id: "meadow", label: msg("Meadow") },
  { id: "ocean", label: msg("Ocean") },
  { id: "volcano", label: msg("Volcano") },
  { id: "thunder", label: msg("Thunder") },
  { id: "psychic", label: msg("Psychic") },
  { id: "pokeball", label: msg("Poké Ball") },
  { id: "night", label: msg("Night") },
];

export function isBoardChoice(v: unknown): v is BoardChoice {
  return v === "random" || BOARD_THEMES.some((t) => t.id === v);
}

/** The playmat shown: the chosen one, or, for "random", one drawn from `roll` (a number in [0, 1)). */
export function resolveBoard(choice: BoardChoice, roll: number): BoardTheme {
  if (choice !== "random") return choice;
  const i = Math.min(BOARD_THEMES.length - 1, Math.floor(roll * BOARD_THEMES.length));
  return (BOARD_THEMES[i] as { id: BoardTheme }).id;
}

/** Pace of the game's effects: pauses after coin flips, attacks and Knock Outs, and between the AI's actions. */
export type Pace = "slow" | "normal" | "fast" | "none";
export const PACES: { id: Pace; label: string; factor: number }[] = [
  { id: "slow", label: msg("Slow"), factor: 1.6 },
  { id: "normal", label: msg("Normal"), factor: 1 },
  { id: "fast", label: msg("Fast"), factor: 0.5 },
  { id: "none", label: msg("No pause"), factor: 0 },
];

export const paceFactor = (p: Pace) => PACES.find((x) => x.id === p)?.factor ?? 1;
