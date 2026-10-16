/** The game log: one line per event, in the interface language, newest at the bottom. */
import { useEffect, useRef } from "react";
import { useLoc, useT } from "../localize";
import { useGame } from "../store";

export function LogPanel() {
  const t = useT();
  const loc = useLoc();
  const log = useGame((s) => s.log);
  const open = useGame((s) => s.logOpen);
  const toggle = useGame((s) => s.toggleLog);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), []);
  return (
    <aside className={`log${open ? " open" : ""}`}>
      <button type="button" className="log-toggle" onClick={toggle}>
        {open ? t("Hide the log") : t("Log")}
      </button>
      {open ? (
        <div className="log-lines">
          {log.map((l) => (
            <div key={l.id} className="log-line">
              {loc(l.text)}
            </div>
          ))}
          <div ref={end} />
        </div>
      ) : null}
    </aside>
  );
}
