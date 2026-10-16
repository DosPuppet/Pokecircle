/** A card face: its TCGdex image in the interface language, or a text face when there is none (or it fails). */
import { useState } from "react";
import { cardImage, defOf, relayed, textOf } from "../cards";
import { useGame } from "../store";

export function CardImage({
  defId,
  print,
  quality = "low",
  className = "",
}: {
  defId?: string;
  print?: string;
  quality?: "low" | "high";
  className?: string;
}) {
  const lang = useGame((s) => s.lang);
  const relay = useGame((s) => s.relay);
  const direct = cardImage(defId, lang, print, quality);
  const [fail, setFail] = useState<{ url: string; n: number } | null>(null);
  // Failed attempts for this image: through the server when asked, or when the direct image failed (blocked
  // network); then a text face.
  const n = direct && fail?.url === direct ? fail.n : 0;
  const tries = direct ? (relay ? [relayed(direct)] : [direct, relayed(direct)]) : [];
  const src = tries[n];
  const def = defOf(defId);
  if (!def) return <div className={`card-face card-back ${className}`} />;
  if (def.energy?.basic && !src) {
    // Basic Energy without an image: an Energy card face of its type.
    const type = def.energy.provides[0]?.[0] ?? "C";
    return (
      <div className={`card-face energy-face e-${type} ${className}`}>
        <span className="ef-symbol" />
        <span className="ef-name">{textOf(def, lang).name}</span>
      </div>
    );
  }
  if (!src) {
    const t = textOf(def, lang);
    return (
      <div className={`card-face text-face ${className}`}>
        <div className="tf-name">{t.name}</div>
        {def.hp ? <div className="tf-hp">{def.hp}</div> : null}
        {(t.attacks ?? []).map((a, i) => (
          <div key={i} className="tf-attack">
            {a.name} {def.attacks?.[i]?.damage ? def.attacks[i].damage : ""}
          </div>
        ))}
        {t.text ? <div className="tf-text">{t.text}</div> : null}
      </div>
    );
  }
  return (
    <img
      className={`card-face ${className}`}
      src={src}
      alt={textOf(def, lang).name}
      draggable={false}
      onError={() => setFail({ url: direct as string, n: n + 1 })}
    />
  );
}

export function CardBack({ className = "" }: { className?: string }) {
  return <div className={`card-face card-back ${className}`} />;
}
