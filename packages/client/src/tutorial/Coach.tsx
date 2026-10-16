/** The tutorial's guide: the current step's text in a bubble, the element it is about circled, "Next" for explanations. */
import { useEffect } from "react";
import { useLoc, useT } from "../localize";
import { useGame } from "../store";
import { LESSONS } from "./lessons";

/** `**bold**` in a guide text. */
function rich(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}

export function Coach() {
  const tuto = useGame((s) => s.tutorial);
  const view = useGame((s) => s.view);
  const next = useGame((s) => s.tutorialNext);
  const start = useGame((s) => s.startLesson);
  const quit = useGame((s) => s.quitGame);
  const t = useT();
  const loc = useLoc();
  const index = tuto ? LESSONS.findIndex((l) => l.id === tuto.lesson) : -1;
  const lesson = LESSONS[index];
  const step = tuto && lesson ? lesson.steps[tuto.step] : undefined;
  // The element the step is about: circled while the step lasts (it may appear later: checked at each update).
  useEffect(() => {
    if (!step?.target || !view) return;
    const els = [...document.querySelectorAll(step.target)];
    for (const el of els) el.classList.add("coach-target");
    return () => {
      for (const el of els) el.classList.remove("coach-target");
    };
  }, [step, view]);
  if (!tuto || !lesson) return null;
  const following = LESSONS[index + 1];
  return (
    <aside className="coach" aria-live="polite">
      <div className="coach-title">
        {t("Tutorial")} · {loc(lesson.title)}
        {step ? (
          <span className="coach-count">
            {tuto.step + 1} / {lesson.steps.length}
          </span>
        ) : null}
      </div>
      {step ? (
        <>
          <p className="coach-text">{rich(loc(step.text))}</p>
          {step.next ? (
            <div className="coach-actions">
              <button type="button" className="btn primary small" onClick={next}>
                {t("Next")}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="coach-text">{t("Well done, this lesson is finished.")}</p>
          <div className="coach-actions">
            {following ? (
              <button type="button" className="btn primary small" onClick={() => start(following.id)}>
                {t("Next lesson")}
              </button>
            ) : null}
            <button type="button" className="btn small" onClick={quit}>
              {t("Lessons")}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
