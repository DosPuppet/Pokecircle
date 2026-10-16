/** Texts in the interface language: interface texts (`useT`) and engine texts with card names (`useLoc`). */
import type { TextArg } from "@pokecircle/engine";
import { useCallback } from "react";
import { localizeText } from "./i18n";
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

/** As `useLoc`, keeping the Energy symbols (`{R}`) for `RichText`. */
export function useLocSymbols(): (text: string) => string {
  const lang = useGame((s) => s.lang);
  return useCallback((text: string) => localizeText(text, lang, true), [lang]);
}

/** An engine or interface text held in a variable (prompts, log lines, errors), with card names. */
export function useLoc(): (text: string) => string {
  const lang = useGame((s) => s.lang);
  return useCallback((text: string) => localizeText(text, lang), [lang]);
}
