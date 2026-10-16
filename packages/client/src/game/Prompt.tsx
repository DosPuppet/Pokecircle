/**
 * Questions of the engine (`ChoiceRequest`): picking cards, Pokémon or options, a number, yes or no, dividing damage
 * counters, ordering. The suggested answer is preselected.
 */
import type { ChoiceRequest, ChoiceValue, GameView } from "@pokecircle/engine";
import { useEffect, useState } from "react";
import { defOf, textOf } from "../cards";
import { useLoc, useT } from "../localize";
import { useGame } from "../store";
import { CardImage } from "./CardImage";

export function Prompt({ view }: { view: GameView }) {
  const p = view.pending;
  const queue = useGame((s) => s.queue.length);
  if (p?.kind !== "choice" || p.player !== view.me || !p.request || queue) return null;
  return <Question key={JSON.stringify(p.request.prompt) + JSON.stringify(p.request.suggested)} view={view} req={p.request} />;
}

function OptionFace({ view, req, id }: { view: GameView; req: ChoiceRequest; id: string }) {
  const loc = useLoc();
  const lang = useGame((s) => s.lang);
  const showPreview = useGame((s) => s.showPreview);
  const atk = req.attacks?.[id];
  if (atk) {
    const def = defOf(atk.defId);
    const a = def?.attacks?.[atk.index];
    return (
      <div className="opt-attack" onMouseEnter={() => showPreview({ defId: atk.defId })} onMouseLeave={() => showPreview(null)}>
        <div className="opt-card">
          <CardImage defId={atk.defId} />
        </div>
        <span>
          {def ? (textOf(def, lang).attacks?.[atk.index]?.name ?? a?.name) : id}{" "}
          {a?.damage ? `${a.damage}${a.suffix === "x" ? "×" : (a.suffix ?? "")}` : ""}
        </span>
      </div>
    );
  }
  const pk = view.pokemon[id];
  if (pk) {
    const top = pk.cards[pk.cards.length - 1] ?? "";
    return (
      <div
        className="opt-pokemon"
        onMouseEnter={() => view.faces[top] && showPreview({ defId: view.faces[top] as string })}
        onMouseLeave={() => showPreview(null)}
      >
        <CardImage defId={view.faces[top]} />
        {pk.damage ? <div className="pk-damage">{pk.damage}</div> : null}
      </div>
    );
  }
  const defId = req.cards?.[id] ?? view.faces[id];
  if (defId)
    return (
      <div className="opt-card" onMouseEnter={() => showPreview({ defId })} onMouseLeave={() => showPreview(null)}>
        <CardImage defId={defId} />
      </div>
    );
  return <div className="opt-label">{loc(req.labels?.[id] ?? id)}</div>;
}

function Question({ view, req }: { view: GameView; req: ChoiceRequest }) {
  const t = useT();
  const loc = useLoc();
  const decide = useGame((s) => s.decide);
  const [values, setValues] = useState<ChoiceValue[]>(req.suggested);
  const [hidden, setHidden] = useState(false);
  useEffect(() => setValues(req.suggested), [req]);
  const send = (v: ChoiceValue[]) => decide({ type: "choose", values: v });
  let body: React.ReactNode = null;
  let valid = true;
  if (req.type === "pick") {
    const shown = Object.keys(req.cards ?? {}).filter((c) => !req.options.includes(c));
    valid = values.length >= req.min && values.length <= req.max;
    const toggle = (id: string) => {
      if (values.includes(id)) setValues(values.filter((v) => v !== id));
      else if (req.max === 1) setValues([id]);
      else if (values.length < req.max) setValues([...values, id]);
    };
    body = (
      <>
        <div className="options">
          {req.options.map((id) => (
            <button type="button" key={id} className={`option${values.includes(id) ? " chosen" : ""}`} onClick={() => toggle(id)}>
              <OptionFace view={view} req={req} id={id} />
            </button>
          ))}
        </div>
        {shown.length ? (
          <>
            <div className="options-sub">{req.intent === "look" ? null : t("Other cards")}</div>
            <div className="options dim">
              {shown.map((id) => (
                <div key={id} className="option disabled">
                  <OptionFace view={view} req={req} id={id} />
                </div>
              ))}
            </div>
          </>
        ) : null}
        <div className="prompt-count">
          {req.min === req.max
            ? t("Choose {n}", { n: req.min })
            : t("Choose from {min} to {max}", { min: req.min, max: req.max })}
        </div>
      </>
    );
  } else if (req.type === "number") {
    const v = Number(values[0] ?? req.min);
    body = (
      <div className="number">
        <button type="button" className="btn" disabled={v <= req.min} onClick={() => setValues([v - 1])}>
          −
        </button>
        <span className="number-value">{v}</span>
        <button type="button" className="btn" disabled={v >= req.max} onClick={() => setValues([v + 1])}>
          +
        </button>
      </div>
    );
  } else if (req.type === "yesNo") {
    return (
      <div className="prompt">
        <div className="prompt-text">{loc(req.prompt)}</div>
        <div className="prompt-actions">
          <button type="button" className="btn primary" onClick={() => send([1])}>
            {t("Yes")}
          </button>
          <button type="button" className="btn" onClick={() => send([0])}>
            {t("No")}
          </button>
        </div>
      </div>
    );
  } else if (req.type === "divide") {
    const nums = req.among.map((_, i) => Number(values[i] ?? 0));
    const sum = nums.reduce((a, b) => a + b, 0);
    valid = sum === req.total;
    body = (
      <div className="options">
        {req.among.map((id, i) => (
          <div key={id} className="option divide">
            <OptionFace view={view} req={req} id={id} />
            <div className="number">
              <button
                type="button"
                className="btn"
                disabled={(nums[i] ?? 0) <= 0}
                onClick={() => setValues(nums.map((n, j) => (j === i ? n - 1 : n)))}
              >
                −
              </button>
              <span className="number-value">{nums[i]}</span>
              <button
                type="button"
                className="btn"
                disabled={sum >= req.total}
                onClick={() => setValues(nums.map((n, j) => (j === i ? n + 1 : n)))}
              >
                +
              </button>
            </div>
          </div>
        ))}
        <div className="prompt-count">{t("{n} left to place", { n: req.total - sum })}</div>
      </div>
    );
  } else if (req.type === "order") {
    const items = values.map(String);
    const move = (i: number, d: number) => {
      const out = [...items];
      const j = i + d;
      if (j < 0 || j >= out.length) return;
      [out[i], out[j]] = [out[j] as string, out[i] as string];
      setValues(out);
    };
    body = (
      <div className="options">
        {items.map((id, i) => (
          <div key={id} className="option">
            <OptionFace view={view} req={req} id={id} />
            <div className="number">
              <button type="button" className="btn" onClick={() => move(i, -1)}>
                ←
              </button>
              <button type="button" className="btn" onClick={() => move(i, 1)}>
                →
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (hidden)
    return (
      <button type="button" className="btn prompt-show" onClick={() => setHidden(false)}>
        {t("Show the question")}
      </button>
    );
  return (
    <div className="prompt">
      <div className="prompt-text">{loc(req.prompt)}</div>
      {body}
      <div className="prompt-actions">
        <button type="button" className="btn primary" disabled={!valid} onClick={() => send(values)}>
          {req.intent === "look" ? t("OK") : t("Confirm")}
        </button>
        <button type="button" className="btn" onClick={() => setHidden(true)}>
          {t("See the table")}
        </button>
      </div>
    </div>
  );
}
