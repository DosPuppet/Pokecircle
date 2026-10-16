/**
 * Resume on reopening: the game against the AI is saved in localStorage (`pokecircle.localGame`) as its record, and
 * replayed by the worker when the page is reopened.
 */
import type { GameRecord } from "@pokecircle/engine";

const KEY = "pokecircle.localGame";

export interface SavedGame {
  record: GameRecord;
  aiLevel: string;
}

export function loadSaved(): SavedGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedGame) : null;
  } catch {
    return null;
  }
}

export function clearSaved(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

/** Accumulates the record sent by the worker and writes it (debounced). */
export class SaveWriter {
  private saved: SavedGame | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly aiLevel: string) {}

  header(record: GameRecord): void {
    this.saved = { record: structuredClone(record), aiLevel: this.aiLevel };
    this.schedule();
  }

  /** Resumed game: continue from its saved record. */
  resume(saved: SavedGame): void {
    this.saved = saved;
  }

  progress(decisions: GameRecord["decisions"], checkpoints: [number, string][]): void {
    if (!this.saved) return;
    this.saved.record.decisions.push(...decisions);
    this.saved.record.checkpoints = checkpoints;
    this.schedule();
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 400);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.saved) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.saved));
    } catch {}
  }
}
