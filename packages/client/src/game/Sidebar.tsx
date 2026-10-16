/**
 * The game drawer (☰): language, sound, effects pace, playmat, images, conceding, exporting the game, back to the
 * menu; the log below.
 */
import { useEffect, useRef, useState } from "react";
import { LangToggle } from "../LangToggle";
import { useLoc, useT } from "../localize";
import { BoardControl, PaceControl, RelayToggle, SoundControl } from "../Settings";
import { useGame } from "../store";

export function DrawerToggle() {
  const t = useT();
  const toggle = useGame((s) => s.toggleDrawer);
  return (
    <button
      type="button"
      className="drawer-toggle"
      title={t("Options and log")}
      aria-label={t("Options and log")}
      onClick={() => toggle()}
    >
      ☰
    </button>
  );
}

export function Sidebar() {
  const t = useT();
  const open = useGame((s) => s.drawerOpen);
  const toggle = useGame((s) => s.toggleDrawer);
  const view = useGame((s) => s.view);
  const mode = useGame((s) => s.mode);
  const replay = useGame((s) => !!s.replay);
  const tutorial = useGame((s) => !!s.tutorial);
  const decide = useGame((s) => s.decide);
  const exportGame = useGame((s) => s.exportGame);
  const quit = useGame((s) => s.quitGame);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!open) setConfirm(false);
  }, [open]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) toggle(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, toggle]);
  const over = !!view?.over;
  const canConcede = !!view && !over && !replay && !tutorial;
  const canExport = !replay && !tutorial && (mode === "local" || over);
  return (
    <>
      <div className={`scrim${open ? " on" : ""}`} onClick={() => toggle(false)} aria-hidden />
      <aside className={`sidebar${open ? " open" : ""}`} aria-hidden={!open} inert={!open}>
        <div className="sidebar-head">
          <strong>{t("Options")}</strong>
          <button type="button" className="icon-btn" aria-label={t("Close")} onClick={() => toggle(false)}>
            ✕
          </button>
        </div>
        <div className="settings">
          <div className="setting-row">
            <LangToggle />
            <SoundControl />
          </div>
          <PaceControl />
          <BoardControl />
          <RelayToggle />
          <div className="setting-row buttons">
            {canConcede ? (
              confirm ? (
                <button
                  type="button"
                  className="btn small danger"
                  onClick={() => {
                    decide({ type: "concede" });
                    toggle(false);
                  }}
                >
                  {t("Confirm: concede")}
                </button>
              ) : (
                <button type="button" className="btn small" onClick={() => setConfirm(true)}>
                  {t("Concede")}
                </button>
              )
            ) : null}
            {canExport ? (
              <button type="button" className="btn small" onClick={() => exportGame("download")}>
                {t("Export the game")}
              </button>
            ) : null}
            <button
              type="button"
              className="btn small"
              onClick={() => {
                toggle(false);
                quit();
              }}
            >
              {tutorial ? t("Lessons") : t("Menu")}
            </button>
          </div>
        </div>
        <Journal />
      </aside>
    </>
  );
}

/** The game log, newest at the bottom, with a line for each new turn. */
function Journal() {
  const t = useT();
  const loc = useLoc();
  const log = useGame((s) => s.log);
  const open = useGame((s) => s.drawerOpen);
  const end = useRef<HTMLDivElement>(null);
  const lines = log.length;
  useEffect(() => {
    if (open && lines) end.current?.scrollIntoView({ block: "end" });
  }, [open, lines]);
  return (
    <section className="journal">
      <h3>{t("Log")}</h3>
      <div className="journal-lines">
        {log.map((l, i) => (
          <div key={l.id}>
            {i > 0 && l.turn !== log[i - 1]?.turn ? <div className="journal-turn">{t("Turn {n}", { n: l.turn })}</div> : null}
            <div className="journal-line">{loc(l.text)}</div>
          </div>
        ))}
        <div ref={end} />
      </div>
    </section>
  );
}
