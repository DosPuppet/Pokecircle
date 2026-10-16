/** Generic questions: validation of answers, and automatic answers to questions with a single possible answer. */
import { RulesError } from "./errors";
import { msg } from "./text";
import type { ChoiceRequest, ChoiceValue } from "./types";

const isInt = (v: ChoiceValue): v is number => typeof v === "number" && Number.isInteger(v);

/** Checks that an answer meets the request; throws a RulesError otherwise. */
export function validateChoice(req: ChoiceRequest, values: ChoiceValue[]): void {
  switch (req.type) {
    case "pick": {
      if (new Set(values).size !== values.length) throw new RulesError(msg("Duplicate choice"));
      if (values.some((v) => typeof v !== "string" || !req.options.includes(v)))
        throw new RulesError(msg("Choice not among the options"));
      if (values.length < req.min || values.length > req.max)
        throw new RulesError(
          req.min === req.max
            ? msg("Choose exactly {n}", { n: req.min })
            : msg("Choose between {min} and {max}", { min: req.min, max: req.max }),
        );
      return;
    }
    case "number": {
      const v = values[0];
      if (values.length !== 1 || v === undefined || !isInt(v) || v < req.min || v > req.max)
        throw new RulesError(msg("Expected a number between {min} and {max}", { min: req.min, max: req.max }));
      return;
    }
    case "order": {
      const sorted = [...values].map(String).sort();
      const expected = [...req.items].sort();
      if (sorted.length !== expected.length || sorted.some((v, i) => v !== expected[i]))
        throw new RulesError(msg("Invalid order"));
      return;
    }
    case "yesNo":
      if (values.length !== 1 || (values[0] !== 0 && values[0] !== 1)) throw new RulesError(msg("Expected a yes/no answer"));
      return;
    case "divide": {
      if (values.length !== req.among.length || values.some((v) => !isInt(v) || v < 0))
        throw new RulesError(msg("Invalid division"));
      const sum = (values as number[]).reduce((a, b) => a + b, 0);
      if (sum !== req.total) throw new RulesError(msg("Divide exactly {n}", { n: req.total }));
      if (req.minEach && values.some((v) => (v as number) < (req.minEach as number)))
        throw new RulesError(msg("At least {n} for each", { n: req.minEach }));
      return;
    }
  }
}

/** The only possible answer to a question, if there is just one (it is then not asked). */
export function forcedAnswer(req: ChoiceRequest): ChoiceValue[] | null {
  switch (req.type) {
    case "pick":
      if (req.max === 0) return [];
      if (req.options.length === req.min && req.min === req.max) return [...req.options];
      if (req.options.length === 0) return req.min === 0 ? [] : null;
      return null;
    case "number":
      return req.min === req.max ? [req.min] : null;
    case "order":
      return req.items.length <= 1 ? [...req.items] : null;
    case "divide":
      return req.among.length === 1 ? [req.total] : null;
    case "yesNo":
      return null;
  }
}
