/**
 * Deck builder: search the catalog (French or English text, filters), add and remove cards, choose prints, see what
 * makes the deck illegal, import and export TCG Live lists, share by link and QR code.
 */
import { CARDS, type DeckEntries, PRINTS_OF, SET_REGISTRY } from "@pokecircle/cards";
import { deckSize, parseDeckList, serializeDeckList, validateDeck } from "@pokecircle/cards/decklist";
import { PRECONS } from "@pokecircle/cards/decks";
import type { CardDef, EType } from "@pokecircle/engine";
import { useEffect, useMemo, useState } from "react";
import { renderSVG } from "uqr";
import { textOf } from "../cards";
import { CardImage } from "../game/CardImage";
import { Preview } from "../game/Preview";
import { TYPE_LABEL } from "../i18n";
import { LangToggle } from "../LangToggle";
import { useLoc, useT } from "../localize";
import { useGame } from "../store";
import { type Filters, NO_FILTERS, searchCards } from "./search";
import { deckLink, sharedName } from "./share";
import { newDeckId, type UserDeck, useDecks } from "./store";

const PAGE = 120;
const TYPES: EType[] = ["G", "R", "W", "L", "P", "F", "D", "M", "N", "C"];

function countOf(entries: DeckEntries, defId: string): number {
  return entries.filter((e) => e[1] === defId).reduce((n, e) => n + e[0], 0);
}

/** Copies of a name across the deck (R-FORMAT-3). */
function nameCount(entries: DeckEntries, def: CardDef): number {
  return entries.reduce((n, [c, id]) => (CARDS[id]?.copyName === def.copyName ? n + c : n), 0);
}

export function DeckBuilder() {
  const t = useT();
  const loc = useLoc();
  const lang = useGame((s) => s.lang);
  const go = useGame((s) => s.go);
  const shared = useGame((s) => s.sharedDeck);
  const clearShared = useGame((s) => s.clearSharedDeck);
  const editing = useGame((s) => s.editingDeck);
  const clearEditing = useGame((s) => s.clearEditingDeck);
  const back = useGame((s) => s.deckReturn);
  const showPreview = useGame((s) => s.showPreview);
  const decks = useDecks((s) => s.decks);
  const save = useDecks((s) => s.save);
  const remove = useDecks((s) => s.remove);
  const [deck, setDeck] = useState<UserDeck>(() => ({ id: newDeckId(), name: "", main: [], updated: 0 }));
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [shown, setShown] = useState(PAGE);
  const [modal, setModal] = useState<null | "import" | "export" | "share" | "open" | "print">(null);
  const [printFor, setPrintFor] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [exportLang, setExportLang] = useState<"fr" | "en">(lang);
  const [link, setLink] = useState("");
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    if (shared) {
      setImportText(shared);
      setModal("import");
      clearShared();
    }
  }, [shared, clearShared]);

  // "See the list" from the deck choice: a player's deck opens for editing, a precon as a copy.
  useEffect(() => {
    if (!editing) return;
    const mine = decks.find((d) => d.id === editing);
    const precon = PRECONS.find((p) => p.id === editing);
    if (mine) {
      setDeck(mine);
      setSaved(true);
    } else if (precon) {
      setDeck({ id: newDeckId(), name: lang === "fr" ? (precon.fr ?? precon.name) : precon.name, main: precon.main, updated: 0 });
      setSaved(false);
    }
    clearEditing();
  }, [editing, clearEditing, decks, lang]);

  const results = useMemo(() => searchCards(filters, lang), [filters, lang]);
  const problems = useMemo(() => validateDeck(deck.main, "standard"), [deck.main]);
  const size = deckSize(deck.main);

  const update = (main: DeckEntries, extra: Partial<UserDeck> = {}) => {
    setDeck({ ...deck, ...extra, main: main.filter((e) => e[0] > 0) });
    setSaved(false);
  };
  const add = (def: CardDef) => {
    if (!def.energy?.basic && nameCount(deck.main, def) >= 4) return;
    const i = deck.main.findIndex((e) => e[1] === def.id);
    if (i >= 0)
      update(
        deck.main.map((e, j) => (j === i ? ([e[0] + 1, e[1], e[2]].filter((x) => x !== undefined) as DeckEntries[number]) : e)),
      );
    else update([...deck.main, [1, def.id]]);
  };
  const sub = (defId: string) => {
    const i = deck.main.findIndex((e) => e[1] === defId);
    if (i < 0) return;
    update(
      deck.main.map((e, j) => (j === i ? ([e[0] - 1, e[1], e[2]].filter((x) => x !== undefined) as DeckEntries[number]) : e)),
    );
  };
  const setPrint = (defId: string, print: string) => {
    update(deck.main.map((e) => (e[1] === defId ? [e[0], e[1], print] : e)));
    setModal(null);
  };
  const doSave = () => {
    const cover = deck.cover ?? deck.main.find(([, id]) => CARDS[id]?.category === "pokemon")?.[1];
    const d = { ...deck, name: deck.name.trim() || t("My deck"), ...(cover ? { cover } : {}) };
    save(d);
    setDeck(d);
    setSaved(true);
  };
  const doImport = () => {
    const { entries, errors } = parseDeckList(importText);
    setImportErrors(errors);
    if (!entries.length) return;
    const name = sharedName(importText);
    setDeck({ id: newDeckId(), name: name || deck.name, main: entries, updated: 0 });
    setSaved(false);
    if (!errors.length) setModal(null);
  };
  const openShare = async () => {
    setLink(await deckLink(deck.name, deck.main));
    setModal("share");
  };

  const groups: [string, CardDef["category"]][] = [
    [t("Pokémon"), "pokemon"],
    [t("Trainers"), "trainer"],
    [t("Energy"), "energy"],
  ];
  const sets = SET_REGISTRY.filter((s) => !s.only);

  return (
    <div className="builder">
      <header className="builder-top">
        <button type="button" className="btn small" onClick={() => go(back === "decks" ? "home" : back)}>
          {back === "home" || back === "decks" ? t("Home") : t("Back")}
        </button>
        <input
          className="deck-name"
          placeholder={t("Deck name")}
          value={deck.name}
          onChange={(e) => update(deck.main, { name: e.target.value })}
        />
        <button type="button" className="btn primary" disabled={saved} onClick={doSave}>
          {t("Save")}
        </button>
        <button type="button" className="btn" onClick={() => setModal("open")}>
          {t("Open")}
        </button>
        <button type="button" className="btn" onClick={() => setDeck({ id: newDeckId(), name: "", main: [], updated: 0 })}>
          {t("New")}
        </button>
        <button type="button" className="btn" onClick={() => setModal("import")}>
          {t("Import")}
        </button>
        <button type="button" className="btn" disabled={!size} onClick={() => setModal("export")}>
          {t("Export")}
        </button>
        <button type="button" className="btn" disabled={!size} onClick={() => void openShare()}>
          {t("Share")}
        </button>
        <LangToggle />
      </header>
      <div className="builder-body">
        <section className="catalog">
          <div className="filters">
            <input
              className="search"
              placeholder={t("Search (name, attack, text)…")}
              value={filters.text}
              onChange={(e) => {
                setFilters({ ...filters, text: e.target.value });
                setShown(PAGE);
              }}
            />
            <select
              value={filters.category ?? ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  category: (e.target.value || undefined) as Filters["category"],
                  trainer: undefined,
                  stage: undefined,
                })
              }
            >
              <option value="">{t("All cards")}</option>
              <option value="pokemon">{t("Pokémon")}</option>
              <option value="trainer">{t("Trainers")}</option>
              <option value="energy">{t("Energy")}</option>
            </select>
            {filters.category === "pokemon" ? (
              <select
                value={filters.stage ?? ""}
                onChange={(e) => setFilters({ ...filters, stage: (e.target.value || undefined) as Filters["stage"] })}
              >
                <option value="">{t("Every stage")}</option>
                <option value="basic">{t("Basic")}</option>
                <option value="stage1">{t("Stage 1")}</option>
                <option value="stage2">{t("Stage 2")}</option>
              </select>
            ) : null}
            {filters.category === "trainer" ? (
              <select
                value={filters.trainer ?? ""}
                onChange={(e) => setFilters({ ...filters, trainer: (e.target.value || undefined) as Filters["trainer"] })}
              >
                <option value="">{t("Every kind")}</option>
                <option value="item">{t("Item")}</option>
                <option value="supporter">{t("Supporter")}</option>
                <option value="tool">{t("Pokémon Tool")}</option>
                <option value="stadium">{t("Stadium")}</option>
              </select>
            ) : null}
            <select
              value={filters.type ?? ""}
              onChange={(e) => setFilters({ ...filters, type: (e.target.value || undefined) as EType })}
            >
              <option value="">{t("Every type")}</option>
              {TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {loc(TYPE_LABEL[ty] as string)}
                </option>
              ))}
            </select>
            <select value={filters.set ?? ""} onChange={(e) => setFilters({ ...filters, set: e.target.value || undefined })}>
              <option value="">{t("Every set")}</option>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {lang === "fr" ? s.fr : s.name}
                </option>
              ))}
            </select>
            <select
              value={filters.tag ?? ""}
              onChange={(e) => setFilters({ ...filters, tag: (e.target.value || undefined) as Filters["tag"] })}
            >
              <option value="">{t("Every card")}</option>
              <option value="ex">{t("Pokémon ex")}</option>
              <option value="mega">{t("Mega Evolution")}</option>
              <option value="tera">{t("Tera")}</option>
              <option value="aceSpec">{t("ACE SPEC")}</option>
            </select>
            <label className="check">
              <input
                type="checkbox"
                checked={filters.implementedOnly}
                onChange={(e) => setFilters({ ...filters, implementedOnly: e.target.checked })}
              />
              {t("Playable only")}
            </label>
          </div>
          <div className="results-count">{t("{n} card(s)", { n: results.length })}</div>
          <div className="results">
            {results.slice(0, shown).map((d) => {
              const n = countOf(deck.main, d.id);
              return (
                <button
                  type="button"
                  key={d.id}
                  className={`result${d.implemented ? "" : " unplayable"}`}
                  onClick={() => add(d)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    sub(d.id);
                  }}
                  onMouseEnter={() => showPreview({ defId: d.id })}
                  onMouseLeave={() => showPreview(null)}
                  title={textOf(d, lang).name}
                  data-def={d.id}
                >
                  <CardImage defId={d.id} />
                  {n ? <span className="in-deck">{n}</span> : null}
                </button>
              );
            })}
          </div>
          {results.length > shown ? (
            <button type="button" className="btn" onClick={() => setShown(shown + PAGE)}>
              {t("Show more")}
            </button>
          ) : null}
        </section>
        <aside className="decklist">
          <div className={`deck-size${size === 60 ? " ok" : ""}`}>{t("{n} / 60 cards", { n: size })}</div>
          {problems.length ? (
            <ul className="problems">
              {problems.slice(0, 6).map((p) => (
                <li key={p}>{loc(p)}</li>
              ))}
            </ul>
          ) : (
            <div className="valid">{t("Deck legal in Standard")}</div>
          )}
          {groups.map(([label, cat]) => {
            const rows = deck.main.filter(([, id]) => CARDS[id]?.category === cat);
            if (!rows.length) return null;
            return (
              <div key={cat} className="deck-group">
                <div className="deck-group-title">
                  {label} ({rows.reduce((n, [c]) => n + c, 0)})
                </div>
                {rows.map(([c, id, print]) => {
                  const d = CARDS[id];
                  if (!d) return null;
                  return (
                    <div
                      key={id}
                      className="deck-row"
                      onMouseEnter={() => showPreview({ defId: id, ...(print ? { print } : {}) })}
                      onMouseLeave={() => showPreview(null)}
                    >
                      <span className="deck-count">{c}</span>
                      <span className="deck-card-name">{textOf(d, lang).name}</span>
                      <button type="button" className="btn small" onClick={() => sub(id)} aria-label={t("Remove")}>
                        −
                      </button>
                      <button type="button" className="btn small" onClick={() => add(d)} aria-label={t("Add")}>
                        +
                      </button>
                      {(PRINTS_OF[id]?.length ?? 0) > 1 ? (
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => {
                            setPrintFor(id);
                            setModal("print");
                          }}
                        >
                          {t("Art")}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </aside>
      </div>
      <Preview />
      {modal ? (
        <div className="modal" role="presentation" onClick={() => setModal(null)}>
          <div className="modal-box wide" role="dialog" onClick={(e) => e.stopPropagation()} onKeyDown={() => undefined}>
            {modal === "import" ? (
              <>
                <div className="modal-title">{t("Import a TCG Live list (French or English)")}</div>
                <textarea className="list-text" value={importText} onChange={(e) => setImportText(e.target.value)} />
                {importErrors.length ? (
                  <ul className="problems">
                    {importErrors.map((e) => (
                      <li key={e}>{loc(e)}</li>
                    ))}
                  </ul>
                ) : null}
                <button type="button" className="btn primary" onClick={doImport}>
                  {t("Import")}
                </button>
              </>
            ) : null}
            {modal === "export" ? (
              <>
                <div className="modal-title">{t("Export (TCG Live format)")}</div>
                <div className="seg">
                  <button type="button" className={exportLang === "fr" ? "on" : ""} onClick={() => setExportLang("fr")}>
                    FR
                  </button>
                  <button type="button" className={exportLang === "en" ? "on" : ""} onClick={() => setExportLang("en")}>
                    EN
                  </button>
                </div>
                <textarea className="list-text" readOnly value={serializeDeckList(deck.main, exportLang)} />
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void navigator.clipboard?.writeText(serializeDeckList(deck.main, exportLang))}
                >
                  {t("Copy")}
                </button>
              </>
            ) : null}
            {modal === "share" ? (
              <>
                <div className="modal-title">{t("Share this deck")}</div>
                {/* biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generated locally by uqr from the link */}
                <div className="qr" dangerouslySetInnerHTML={{ __html: renderSVG(link) }} />
                <input className="share-link" readOnly value={link} onFocus={(e) => e.target.select()} />
                <button type="button" className="btn primary" onClick={() => void navigator.clipboard?.writeText(link)}>
                  {t("Copy the link")}
                </button>
              </>
            ) : null}
            {modal === "open" ? (
              <>
                <div className="modal-title">{t("Open a deck")}</div>
                <div className="deck-list">
                  {decks.map((d) => (
                    <div key={d.id} className="deck-tile">
                      <button
                        type="button"
                        className="deck-open"
                        onClick={() => {
                          setDeck(d);
                          setSaved(true);
                          setModal(null);
                        }}
                      >
                        <CardImage defId={d.cover} />
                        <span>{d.name}</span>
                      </button>
                      <button type="button" className="btn small danger" onClick={() => remove(d.id)}>
                        {t("Delete")}
                      </button>
                    </div>
                  ))}
                  {PRECONS.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      className="deck-tile"
                      onClick={() => {
                        setDeck({
                          id: newDeckId(),
                          name: `${lang === "fr" ? (p.fr ?? p.name) : p.name}`,
                          main: p.main,
                          updated: 0,
                        });
                        setSaved(false);
                        setModal(null);
                      }}
                    >
                      <CardImage defId={p.cover} />
                      <span>{t("Copy of {name}", { name: lang === "fr" ? (p.fr ?? p.name) : p.name })}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            {modal === "print" && printFor ? (
              <>
                <div className="modal-title">{t("Choose the art")}</div>
                <div className="options">
                  {(PRINTS_OF[printFor] ?? [])
                    .filter((p) => p.standard)
                    .map((p) => (
                      <button type="button" key={p.id} className="option" onClick={() => setPrint(printFor, p.id)}>
                        <div className="opt-card">
                          <CardImage defId={printFor} print={p.id} />
                        </div>
                        <span>
                          {p.code} {p.number}
                        </span>
                      </button>
                    ))}
                </div>
              </>
            ) : null}
            <button type="button" className="btn" onClick={() => setModal(null)}>
              {t("Close")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
