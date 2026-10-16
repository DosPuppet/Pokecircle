/** Texts in the interface language (`useT`), re-rendered when the language changes. */
import type { TextArg } from "@pocketmate/engine";
import { useCallback } from "react";
import { useGame } from "./store";
import { tr } from "./translate";

/**
 * `t` for components: an interface text in the current language, `t("{n} cards", { n })`. The template must be a
 * string literal (see `translate.ts`).
 */
export function useT(): (template: string, args?: Record<string, TextArg>) => string {
  const lang = useGame((s) => s.lang);
  return useCallback((template: string, args?: Record<string, TextArg>) => tr(lang, template, args), [lang]);
}
