/**
 * Choosing a deck: the summary of the chosen one (its cover art, name, Energy types) and a window with the decks by
 * category (starters, meta decks, the player's own); an unplayable deck is shown dimmed.
 */
import type { DeckEntries } from "@pokecircle/cards";
import { useState } from "react";
import { cardImage, defOf } from "../cards";
import { CardImage } from "../game/CardImage";
import { EnergyIcon } from "../game/Energy";
import { useT } from "../localize";
import { useGame } from "../store";
import { allDecks, deckById, playable, useDecks } from "./store";

type Category = "starter" | "meta" | "mine";
type AnyDeck = ReturnType<typeof allDecks>[number];

const categoryOf = (d: AnyDeck): Category => (d.user ? "mine" : d.id.startsWith("meta") ? "meta" : "starter");

/** The Energy types of a deck (its basic Energy), most used first. */
function deckTypes(entries: DeckEntries): string[] {
  const count = new Map<string, number>();
  for (const [n, id] of entries) {
    const d = defOf(id);
    const type = d?.energy?.basic ? d.energy.provides[0]?.[0] : undefined;
    if (type) count.set(type, (count.get(type) ?? 0) + n);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

/** "See the list": opens the deck builder with the deck (a precon as a copy). */
function ListButton({ id, className }: { id: string; className: string }) {
  const t = useT();
  const open = useGame((s) => s.openDeckBuilder);
  return (
    <button
      type="button"
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        open(id);
      }}
    >
      {t("See the list")}
    </button>
  );
}

export function DeckSummary({ id, onChange }: { id: string; onChange: () => void }) {
  const t = useT();
  const lang = useGame((s) => s.lang);
  useDecks((s) => s.decks);
  const deck = deckById(id) as AnyDeck | undefined;
  if (!deck) return null;
  const art = cardImage(deck.cover, lang, undefined, "high");
  const total = deck.main.reduce((a, [n]) => a + n, 0);
  const label = { starter: t("Starter"), meta: t("Meta"), mine: t("Your decks") }[categoryOf(deck)];
  return (
    <div className="deck-summary-wrap">
      <button type="button" className="deck-summary" onClick={onChange}>
        <div className="deck-cover" style={art ? { backgroundImage: `url("${art}")` } : undefined} />
        <span className="change-pill">{t("Change")}</span>
        <div className="ds-info">
          <div className="ds-name">
            {lang === "fr" ? (deck.fr ?? deck.name) : deck.name}{" "}
            {deckTypes(deck.main).map((ty) => (
              <EnergyIcon key={ty} type={ty} small />
            ))}
          </div>
          <div className="ds-sub">
            {t("{n} cards", { n: total })} · {label}
          </div>
        </div>
      </button>
      <ListButton id={deck.id} className="list-pill" />
    </div>
  );
}

export function DeckDialog({ value, onPick, onClose }: { value: string; onPick: (id: string) => void; onClose: () => void }) {
  const t = useT();
  const lang = useGame((s) => s.lang);
  useDecks((s) => s.decks);
  const decks = allDecks();
  const current = decks.find((d) => d.id === value);
  const [tab, setTab] = useState<Category>(current ? categoryOf(current) : "starter");
  const tabs: { id: Category; label: string }[] = [
    { id: "starter", label: t("Starter") },
    { id: "meta", label: t("Meta") },
    { id: "mine", label: t("Your decks") },
  ];
  const shown = decks.filter((d) => categoryOf(d) === tab);
  return (
    <div className="modal" onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()} role="presentation">
      <div className="modal-box wide deck-dialog" onClick={(e) => e.stopPropagation()} onKeyDown={() => undefined} role="dialog">
        <div className="modal-title">
          <div className="seg">
            {tabs.map((x) => (
              <button type="button" key={x.id} className={tab === x.id ? "on" : ""} onClick={() => setTab(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
          <button type="button" className="icon-btn" aria-label={t("Close")} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="deck-list">
          {shown.length ? null : <p className="tagline">{t("No deck here yet: build one in My decks.")}</p>}
          {shown.map((p) => {
            const ok = playable(p.main);
            return (
              <div key={p.id} className="deck-tile-wrap">
                <button
                  type="button"
                  className={`deck-tile${value === p.id ? " chosen" : ""}${ok ? "" : " unplayable"}`}
                  disabled={!ok}
                  title={ok ? "" : t("This deck cannot be played yet")}
                  onClick={() => {
                    onPick(p.id);
                    onClose();
                  }}
                >
                  <CardImage defId={p.cover} />
                  <span>{lang === "fr" ? (p.fr ?? p.name) : p.name}</span>
                  <span className="tile-types">
                    {deckTypes(p.main).map((ty) => (
                      <EnergyIcon key={ty} type={ty} small />
                    ))}
                  </span>
                </button>
                <ListButton id={p.id} className="btn small ghost deck-list-link" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** A row of decks to choose from (online play). */
export function DeckPicker({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DeckSummary id={value} onChange={() => setOpen(true)} />
      {open ? <DeckDialog value={value} onPick={onPick} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
