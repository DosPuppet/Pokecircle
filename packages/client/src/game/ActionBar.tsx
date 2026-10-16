/**
 * The main button (bottom right): end the turn, confirm the setup, or whose turn it is; Space presses it. Above it, the
 * action panel of the selected card or Pokémon: playing the card, attacks with their cost, damage and Knock Out
 * preview, Abilities, Retreat, the Stadium's action.
 */
import type { ActionOption, GameView } from "@pokecircle/engine";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { defOf, textOf } from "../cards";
import { useT } from "../localize";
import { useGame } from "../store";
import { Cost, EnergyIcon } from "./Energy";
import { directOption, myTurn, optionsForCard } from "./interaction";

export function MainButton({ view }: { view: GameView }) {
  const t = useT();
  const decide = useGame((s) => s.decide);
  const queue = useGame((s) => s.queue.length);
  const placing = useGame((s) => s.placing);
  const replay = useGame((s) => !!s.replay);
  const p = view.pending;
  const setup = p?.kind === "setup" && p.player === view.me && !queue;
  const mine = myTurn(view) && !queue;
  const action = setup
    ? () => placing.active && decide({ type: "setup", active: placing.active, bench: placing.bench })
    : mine
      ? () => decide({ type: "endTurn" })
      : null;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.code !== "Space" || !action || el?.closest("input, textarea, select, button")) return;
      e.preventDefault();
      action();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [action]);
  if (view.over || replay) return null;
  if (setup)
    return (
      <button type="button" className="main-button hot setup-confirm" disabled={!placing.active} onClick={action ?? undefined}>
        {t("Confirm")}
      </button>
    );
  if (mine)
    return (
      <button type="button" className="main-button hot end-turn" onClick={action ?? undefined}>
        {t("End turn")}
      </button>
    );
  const waiting = p && p.player !== view.me;
  return (
    <button type="button" className="main-button" disabled>
      {waiting ? (view.flow === "setup" ? t("Waiting for the opponent…") : t("Opponent's turn")) : t("Your decision")}
    </button>
  );
}

export function ActionPanel({ view }: { view: GameView }) {
  const t = useT();
  const lang = useGame((s) => s.lang);
  const selected = useGame((s) => s.selected);
  const retreating = useGame((s) => s.retreating);
  const setRetreating = useGame((s) => s.setRetreating);
  const select = useGame((s) => s.select);
  const decide = useGame((s) => s.decide);
  const queue = useGame((s) => s.queue.length);
  const me = view.players[view.me];
  const mine = myTurn(view) && !queue;
  const buttons: React.ReactNode[] = [];
  let title: string | null = null;
  let hint: string | null = null;

  if (mine && selected?.kind === "card") {
    const def = defOf(view.faces[selected.id]);
    title = def ? textOf(def, lang).name : null;
    const opts = optionsForCard(view, selected.id);
    const direct = directOption(view, selected.id);
    if (direct)
      buttons.push(
        <button type="button" key="play" className="btn primary play" onClick={() => decide(direct)}>
          {t("Play")}
        </button>,
      );
    if (opts.some((o) => "targets" in o && o.targets)) hint = t("Choose a Pokémon (highlighted), or drag the card onto it");
  }
  if (mine && selected?.kind === "pokemon") {
    const id = selected.id;
    const pk = view.pokemon[id];
    const def = defOf(view.faces[pk?.cards[pk.cards.length - 1] ?? ""]);
    const text = def ? textOf(def, lang) : undefined;
    title = text?.name ?? null;
    for (const o of view.legal)
      if (o.type === "useAbility" && o.pokemon === id)
        buttons.push(
          <button
            type="button"
            key={`ab${o.ability}`}
            className="btn ability"
            onClick={() => decide({ type: "useAbility", pokemon: id, ability: o.ability })}
          >
            <span className="ab-tag">{t("Ability")}</span> {text?.abilities?.[o.ability]?.name ?? ""}
          </button>,
        );
    if (view.legal.some((o) => o.type === "discardFromPlay" && o.pokemon === id))
      buttons.push(
        <button
          type="button"
          key="discardFromPlay"
          className="btn discard-from-play"
          onClick={() => decide({ type: "discardFromPlay", pokemon: id })}
        >
          {t("Discard from play")}
        </button>,
      );
    if (me?.active === id) {
      for (const o of view.legal)
        if (o.type === "attack") buttons.push(<AttackButton key={`at${o.index}${o.source ?? ""}`} o={o} view={view} />);
      // Attacks that cannot be used, for information.
      for (const [i, a] of (def?.attacks ?? []).entries())
        if (!view.legal.some((o) => o.type === "attack" && o.index === i && !o.source))
          buttons.push(
            <button type="button" key={`no${i}`} className="btn attack disabled" disabled>
              <Cost cost={a.cost} /> <span className="atk-name">{text?.attacks?.[i]?.name ?? a.name}</span>
              <span className="atk-dmg">{a.damage ? `${a.damage}${a.suffix === "x" ? "×" : (a.suffix ?? "")}` : ""}</span>
            </button>,
          );
      const r = view.legal.find((o) => o.type === "retreat");
      if (r?.type === "retreat")
        buttons.push(
          <button
            type="button"
            key="retreat"
            className={`btn retreat${retreating ? " on" : ""}`}
            onClick={() => setRetreating(!retreating)}
          >
            {t("Retreat")} {r.cost ? <Cost cost={Array(r.cost).fill("C")} /> : <EnergyIcon type="free" small />}
          </button>,
        );
      if (retreating) hint = t("Choose the Benched Pokémon to switch in");
    }
  }
  if (mine && view.legal.some((o) => o.type === "stadiumAction"))
    buttons.push(
      <button type="button" key="stadium" className="btn ability" onClick={() => decide({ type: "stadiumAction" })}>
        {t("Use the Stadium")}
      </button>,
    );
  const open = buttons.length > 0 || !!hint;
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="action-panel"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.18 }}
        >
          {title ? <div className="ap-title">{title}</div> : null}
          {hint ? <div className="ap-hint">{hint}</div> : null}
          <div className="ap-buttons">{buttons}</div>
          {selected || retreating ? (
            <button type="button" className="btn small ghost ap-cancel" onClick={() => select(null)}>
              {t("Cancel")}
            </button>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function AttackButton({ o, view }: { o: Extract<ActionOption, { type: "attack" }>; view: GameView }) {
  const t = useT();
  const lang = useGame((s) => s.lang);
  const decide = useGame((s) => s.decide);
  const active = view.players[view.me]?.active;
  const pk = active ? view.pokemon[active] : undefined;
  const sourceDef = o.source ? defOf(view.faces[o.source]) : defOf(view.faces[pk?.cards[pk.cards.length - 1] ?? ""]);
  // A Tool's attack, a borrowed attack (the card of a Benched Pokémon), or the Active Pokémon's own.
  const attacks = sourceDef?.trainer?.attacks ?? sourceDef?.attacks;
  const a = attacks?.[o.index];
  const text = sourceDef ? textOf(sourceDef, lang) : undefined;
  const name = (o.source ? undefined : text?.attacks?.[o.index]?.name) ?? o.name;
  const dmg = a?.damage ? `${a.damage}${a.suffix === "x" ? "×" : (a.suffix ?? "")}` : "";
  return (
    <button
      type="button"
      className="btn attack primary"
      title={text?.attacks?.[o.index]?.text ?? ""}
      onClick={() => decide(o.source ? { type: "attack", index: o.index, source: o.source } : { type: "attack", index: o.index })}
    >
      <Cost cost={o.cost} /> <span className="atk-name">{name}</span>
      <span className="atk-dmg">
        {o.preview && o.preview.damage !== a?.damage && dmg ? o.preview.damage : dmg}
        {o.preview?.ko ? <span className="atk-ko">{t("K.O.")}</span> : null}
      </span>
    </button>
  );
}
