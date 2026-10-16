/** Settings shared by the lobby and the game drawer: sound, effects pace, playmat, images through the server. */
import { useAudio } from "./audio/sfx";
import { BOARD_THEMES, PACES } from "./boardThemes";
import { useLoc, useT } from "./localize";
import { useGame } from "./store";

export function SoundControl() {
  const t = useT();
  const { volume, muted, setVolume, toggleMute } = useAudio();
  return (
    <div className="sound-control">
      <button
        type="button"
        className="icon-btn"
        title={muted ? t("Sound off (M)") : t("Sound on (M)")}
        aria-pressed={!muted}
        onClick={toggleMute}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
          {muted ? (
            <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <path
              d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        aria-label={t("Volume")}
        onChange={(e) => setVolume(Number(e.target.value))}
      />
    </div>
  );
}

export function PaceControl() {
  const t = useT();
  const loc = useLoc();
  const pace = useGame((s) => s.pace);
  const setSettings = useGame((s) => s.setSettings);
  return (
    <div className="setting-row">
      <span className="setting-label">{t("Effects")}</span>
      <div className="seg">
        {PACES.map((p) => (
          <button
            type="button"
            key={p.id}
            className={pace === p.id ? "on" : ""}
            aria-pressed={pace === p.id}
            onClick={() => setSettings({ pace: p.id })}
          >
            {loc(p.label)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function BoardControl() {
  const t = useT();
  const loc = useLoc();
  const board = useGame((s) => s.board);
  const setSettings = useGame((s) => s.setSettings);
  return (
    <div className="setting-row">
      <span className="setting-label">{t("Playmat")}</span>
      <div className="swatches">
        {BOARD_THEMES.map((b) => (
          <button
            type="button"
            key={b.id}
            className={`swatch${board === b.id ? " on" : ""}`}
            data-board={b.id}
            title={loc(b.label)}
            aria-label={t("Playmat: {name}", { name: loc(b.label) })}
            aria-pressed={board === b.id}
            onClick={() => setSettings({ board: b.id })}
          />
        ))}
        <button
          type="button"
          className={`swatch random${board === "random" ? " on" : ""}`}
          title={t("Random (one playmat per game)")}
          aria-label={t("Playmat: random for each game")}
          aria-pressed={board === "random"}
          onClick={() => setSettings({ board: "random" })}
        >
          ?
        </button>
      </div>
    </div>
  );
}

export function RelayToggle() {
  const t = useT();
  const relay = useGame((s) => s.relay);
  const setSettings = useGame((s) => s.setSettings);
  return (
    <label className="check">
      <input type="checkbox" checked={relay} onChange={(e) => setSettings({ relay: e.target.checked })} />
      {t("Card images through the Pokecircle server")}
    </label>
  );
}
