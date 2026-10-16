/** Search of the card catalog in the deck builder: text (French or English) and filters. */
import { CARDS, PRINTS_OF } from "@pocketmate/cards";
import type { CardDef, CardTag, EType, Stage, TrainerKind } from "@pocketmate/engine";

export interface Filters {
  text: string;
  category?: "pokemon" | "trainer" | "energy";
  trainer?: TrainerKind;
  stage?: Stage;
  type?: EType;
  set?: string;
  mark?: string;
  tag?: CardTag;
  /** Only cards PocketMate can play (default true). */
  implementedOnly: boolean;
  /** Only Standard-legal cards (default true). */
  standardOnly: boolean;
}

export const NO_FILTERS: Filters = { text: "", implementedOnly: true, standardOnly: true };

/** Lower case, no accents, single spaces. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[-'’]/g, " ").replace(/\s+/g, " ").trim();
}

/** The searchable text of a card: names and texts in both languages. */
const haystack = new Map<string, string>();
function textOf(d: CardDef): string {
  let h = haystack.get(d.id);
  if (h === undefined) {
    const parts: string[] = [];
    for (const t of [d.text.en, d.text.fr]) {
      if (!t) continue;
      parts.push(t.name, t.text ?? "");
      for (const a of t.attacks ?? []) parts.push(a.name, a.text ?? "");
      for (const a of t.abilities ?? []) parts.push(a.name, a.text);
    }
    h = fold(parts.join(" "));
    haystack.set(d.id, h);
  }
  return h;
}

const ORDER = { pokemon: 0, trainer: 1, energy: 2 } as const;
const STAGE_ORDER: Record<string, number> = { basic: 0, stage1: 1, stage2: 2 };

export function searchCards(f: Filters, lang: "fr" | "en"): CardDef[] {
  const words = fold(f.text).split(" ").filter(Boolean);
  const out = Object.values(CARDS).filter((d) => {
    if (f.implementedOnly && !d.implemented) return false;
    if (f.standardOnly && !d.standard) return false;
    if (f.category && d.category !== f.category) return false;
    if (f.trainer && d.trainer?.kind !== f.trainer) return false;
    if (f.stage && d.stage !== f.stage) return false;
    if (f.type && !(d.types?.includes(f.type) || d.energy?.provides.some((u) => u.includes(f.type as string)))) return false;
    if (f.tag && !d.tags.includes(f.tag)) return false;
    if (f.mark && d.regulationMark !== f.mark) return false;
    if (f.set && !(PRINTS_OF[d.id] ?? []).some((p) => p.set === f.set)) return false;
    if (words.length) {
      const h = textOf(d);
      if (!words.every((w) => h.includes(w))) return false;
    }
    return true;
  });
  const name = (d: CardDef) => fold((lang === "fr" ? d.text.fr?.name : undefined) ?? d.name);
  return out.sort(
    (a, b) =>
      ORDER[a.category] - ORDER[b.category] ||
      (a.types?.[0] ?? "").localeCompare(b.types?.[0] ?? "") ||
      (STAGE_ORDER[a.stage ?? ""] ?? 9) - (STAGE_ORDER[b.stage ?? ""] ?? 9) ||
      name(a).localeCompare(name(b)),
  );
}
