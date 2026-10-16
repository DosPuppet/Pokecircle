/** Every tutorial lesson can be played to its end by doing what each step asks (solver), against its opponent. */
import { CARDS } from "@pocketmate/cards";
import { buildScenario, type CardDef, type GameEvent, type GameState, projectView, submit } from "@pocketmate/engine";
import { describe, expect, it } from "vitest";
import { lessonAgent } from "../src/tutorial/agent";
import { LESSONS } from "../src/tutorial/lessons";
import { matches, solve } from "../src/tutorial/runtime";

function defsOf(spec: (typeof LESSONS)[number]["scenario"]): Record<string, CardDef> {
  const ids = new Set<string>([spec.filler]);
  const walk = (x: unknown): void => {
    if (typeof x === "string" && CARDS[x]) ids.add(x);
    else if (Array.isArray(x)) for (const y of x) walk(y);
    else if (x && typeof x === "object") for (const y of Object.values(x)) walk(y);
  };
  walk(spec);
  return Object.fromEntries([...ids].map((id) => [id, CARDS[id] as CardDef]));
}

describe("tutorial lessons", () => {
  for (const lesson of LESSONS)
    it(`${lesson.id}: playable to the end`, () => {
      const defs = defsOf(lesson.scenario);
      for (const id of Object.keys(defs)) expect(defs[id], id).toBeDefined();
      let s: GameState = buildScenario({ ...lesson.scenario, names: ["You", "AI"] }, defs).s;
      let events: GameEvent[] = [];
      let step = 0;
      // As the interface does after each update: explanations are read, finished steps are left.
      const advance = () => {
        const view = projectView(s, "p1");
        for (let st = lesson.steps[step]; st && (st.next || st.until?.({ view, events })); st = lesson.steps[step]) step++;
      };
      const play = (p: string, d: Parameters<typeof submit>[2]) => {
        const r = submit(s, p, d);
        s = r.state;
        events = r.events;
        advance();
      };
      advance();
      for (let guard = 0; guard < 300 && step < lesson.steps.length; guard++) {
        const p = s.pending;
        if (s.over || !p)
          throw new Error(`${lesson.id} step ${step}: stuck (${s.over ? `game over: ${s.endReason}` : "no decision"})`);
        if (p.player === "p2") {
          play("p2", lessonAgent(s, "p2"));
          continue;
        }
        if (p.kind === "choice") {
          play("p1", { type: "choose", values: p.request.suggested });
          continue;
        }
        const view = projectView(s, "p1");
        const allow = lesson.steps[step]?.allow?.[0];
        if (!allow) throw new Error(`${lesson.id} step ${step}: nothing allowed, waiting for the player`);
        const d = solve(allow, view);
        if (!d) throw new Error(`${lesson.id} step ${step}: ${JSON.stringify(allow)} not possible`);
        expect(matches(allow, d, view)).toBe(true);
        play("p1", d);
      }
      expect(step).toBe(lesson.steps.length);
    });
});
