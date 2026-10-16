/** Replay playback bar: position, automatic playback, point of view. */
import { useLoc, useT } from "../localize";
import { useGame } from "../store";

export function ReplayBar() {
  const replay = useGame((s) => s.replay);
  const seek = useGame((s) => s.replaySeek);
  const play = useGame((s) => s.replayPlay);
  const setViewer = useGame((s) => s.replayViewer);
  const t = useT();
  const loc = useLoc();
  if (!replay) return null;
  const { index, total, viewer, players, playing, warning } = replay;
  return (
    <div className="replay-bar" role="toolbar" aria-label={t("Replay")}>
      <strong className="replay-title">{t("Replay")}</strong>
      <button type="button" className="btn small" onClick={() => seek(0)} disabled={index === 0} title={t("Back to the start")}>
        ⏮
      </button>
      <button
        type="button"
        className="btn small"
        onClick={() => seek(index - 1)}
        disabled={index === 0}
        title={t("Previous step")}
      >
        ◀
      </button>
      <button type="button" className="btn small primary replay-play" onClick={() => play(!playing)} disabled={index >= total}>
        {playing ? t("Pause") : t("Autoplay")}
      </button>
      <button
        type="button"
        className="btn small"
        onClick={() => seek(index + 1)}
        disabled={index >= total}
        title={t("Next step")}
      >
        ▶
      </button>
      <button
        type="button"
        className="btn small"
        onClick={() => seek(total)}
        disabled={index >= total}
        title={t("Go to the end")}
      >
        ⏭
      </button>
      <input
        type="range"
        className="replay-slider"
        min={0}
        max={total}
        value={index}
        aria-label={t("Position in the game")}
        onChange={(e) => seek(Number(e.target.value))}
      />
      <span className="replay-pos">
        {index} / {total}
      </span>
      <label className="replay-viewer">
        {t("Point of view")}{" "}
        <select value={viewer} onChange={(e) => setViewer(e.target.value)}>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {warning ? (
        <p className="replay-warning" role="status">
          {loc(warning)}
        </p>
      ) : null}
    </div>
  );
}
