/** The tutorial's lessons, in order, with those already finished. */
import { LangToggle } from "../LangToggle";
import { useLoc, useT } from "../localize";
import { useGame } from "../store";
import { LESSONS } from "./lessons";

export function TutorialMenu() {
  const t = useT();
  const loc = useLoc();
  const done = useGame((s) => s.tutorialDone);
  const start = useGame((s) => s.startLesson);
  const go = useGame((s) => s.go);
  return (
    <div className="home tutorial-menu">
      <header className="home-top">
        <button type="button" className="btn small" onClick={() => go("home")}>
          {t("Home")}
        </button>
        <h1 className="brand">{t("Tutorial")}</h1>
        <LangToggle />
      </header>
      <main className="home-main">
        <p className="tagline">{t("Learn to play in a few short lessons, against a guided opponent.")}</p>
        <ol className="lessons">
          {LESSONS.map((l) => (
            <li key={l.id}>
              <button type="button" className={`lesson${done.includes(l.id) ? " done" : ""}`} onClick={() => start(l.id)}>
                <span className="lesson-title">
                  {loc(l.title)}
                  {done.includes(l.id) ? <span className="lesson-done">{t("Done")}</span> : null}
                </span>
                <span className="lesson-summary">{loc(l.summary)}</span>
              </button>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
