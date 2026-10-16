/**
 * The action bar: what the selected card or Pokémon can do (attacks with their cost, damage and Knock Out preview,
 * Abilities, Retreat, playing a card), the end of the turn, and whose turn it is.
 */
import type { ActionOption, GameView } from "@pocketmate/engine";
import { defOf, textOf } from "../cards";
import { useT } from "../localize";
import { useGame } from "../store";
import { Cost } from "./Energy";
import { directOption, myTurn, optionsForCard } from "./interaction";

export function ActionBar({ view }: { view: GameView }) {
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
  let hint: string | null = null;

  if (mine && selected?.kind === "card") {
    const opts = optionsForCard(view, selected.id);
    const direct = directOption(view, selected.id);
    if (direct)
      buttons.push(
        <button type="button" key="play" className="btn primary" onClick={() => decide(direct)}>
          {t("Play")}
        </button>,
      );
    if (opts.some((o) => "targets" in o && o.targets)) hint = t("Choose a Pokémon (highlighted)");
  }
  if (mine && selected?.kind === "pokemon") {
    const id = selected.id;
    const pk = view.pokemon[id];
    const def = defOf(view.faces[pk?.cards[pk.cards.length - 1] ?? ""]);
    const text = def ? textOf(def, lang) : undefined;
    for (const o of view.legal)
      if (o.type === "useAbility" && o.pokemon === id)
        buttons.push(
          <button
            type="button"
            key={`ab${o.ability}`}
            className="btn ability"
            onClick={() => decide({ type: "useAbility", pokemon: id, ability: o.ability })}
          >
            {t("Ability: {name}", { name: text?.abilities?.[o.ability]?.name ?? "" })}
          </button>,
        );
    if (me?.active === id) {
      for (const o of view.legal)
        if (o.type === "attack") buttons.push(<AttackButton key={`at${o.index}${o.source ?? ""}`} o={o} view={view} />);
      const r = view.legal.find((o) => o.type === "retreat");
      if (r)
        buttons.push(
          <button
            type="button"
            key="retreat"
            className={`btn${retreating ? " on" : ""}`}
            onClick={() => setRetreating(!retreating)}
          >
            {t("Retreat")} <Cost cost={Array(r.type === "retreat" ? r.cost : 0).fill("C")} />
          </button>,
        );
      if (retreating) hint = t("Choose the Benched Pokémon to switch in");
      // Attacks that cannot be used, for information.
      for (const [i, a] of (def?.attacks ?? []).entries())
        if (!view.legal.some((o) => o.type === "attack" && o.index === i && !o.source))
          buttons.push(
            <button type="button" key={`no${i}`} className="btn attack disabled" disabled>
              <Cost cost={a.cost} /> {text?.attacks?.[i]?.name ?? a.name}{" "}
              {a.damage ? `${a.damage}${a.suffix === "x" ? "×" : (a.suffix ?? "")}` : ""}
            </button>,
          );
    }
  }
  const status = view.over
    ? null
    : view.pending?.player === view.me
      ? view.pending.kind === "main"
        ? t("Your turn")
        : t("Your decision")
      : t("The opponent is playing…");
  return (
    <div className="action-bar">
      <div className="ab-status">{status}</div>
      {hint ? <div className="ab-hint">{hint}</div> : null}
      <div className="ab-buttons">{buttons}</div>
      <div className="ab-end">
        {selected || retreating ? (
          <button type="button" className="btn" onClick={() => select(null)}>
            {t("Cancel")}
          </button>
        ) : null}
        {mine ? (
          <button type="button" className="btn end-turn" onClick={() => decide({ type: "endTurn" })}>
            {t("End turn")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AttackButton({ o, view }: { o: Extract<ActionOption, { type: "attack" }>; view: GameView }) {
  const t = useT();
  const lang = useGame((s) => s.lang);
  const decide = useGame((s) => s.decide);
  const active = view.players[view.me]?.active;
  const pk = active ? view.pokemon[active] : undefined;
  const sourceDef = o.source ? defOf(view.faces[o.source]) : defOf(view.faces[pk?.cards[pk.cards.length - 1] ?? ""]);
  const attacks = o.source ? sourceDef?.trainer?.attacks : sourceDef?.attacks;
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
      <Cost cost={o.cost} /> <span className="atk-name">{name}</span> <span className="atk-dmg">{dmg}</span>
      {o.preview?.ko ? <span className="atk-ko">{t("K.O.")}</span> : null}
    </button>
  );
}
