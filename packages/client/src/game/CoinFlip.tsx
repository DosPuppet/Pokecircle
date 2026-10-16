/** Coin flips (R-TEXT-5): a spinning coin for each flip, landing on heads (face) or tails (pile). */
import { useT } from "../localize";
import { useGame } from "../store";

export function CoinFlip() {
  const t = useT();
  const flips = useGame((s) => s.flips);
  if (!flips) return null;
  const heads = flips.results.filter(Boolean).length;
  return (
    <div className="coin-layer" key={flips.key}>
      <div className="coins">
        {flips.results.map((h, i) => (
          <div key={i} className={`coin ${h ? "heads" : "tails"}`} style={{ animationDelay: `${i * 120}ms` }}>
            <div className="coin-face front">{t("Heads")}</div>
            <div className="coin-face back">{t("Tails")}</div>
          </div>
        ))}
      </div>
      <div className="coin-result">
        {flips.results.length === 1
          ? flips.results[0]
            ? t("Heads!")
            : t("Tails!")
          : t("{n} heads out of {total}", { n: heads, total: flips.results.length })}
      </div>
    </div>
  );
}
