/**
 * Imported set data, in registry order (`setRegistry.ts`); `cards/test/catalog.test.ts` checks that every
 * registered set is listed here.
 */

import set_30th from "../data/30th.json";
import set_30th_c from "../data/30th-c.json";
import set_me01 from "../data/me01.json";
import set_me02_5 from "../data/me02.5.json";
import set_me02 from "../data/me02.json";
import set_me03 from "../data/me03.json";
import set_me04 from "../data/me04.json";
import set_me05 from "../data/me05.json";
import set_mee from "../data/mee.json";
import set_mep from "../data/mep.json";
import set_sv04 from "../data/sv04.json";
import set_sv05 from "../data/sv05.json";
import set_sv06_5 from "../data/sv06.5.json";
import set_sv06 from "../data/sv06.json";
import set_sv07 from "../data/sv07.json";
import set_sv08_5 from "../data/sv08.5.json";
import set_sv08 from "../data/sv08.json";
import set_sv09 from "../data/sv09.json";
import set_sv10_5b from "../data/sv10.5b.json";
import set_sv10_5w from "../data/sv10.5w.json";
import set_sv10 from "../data/sv10.json";
import set_sve from "../data/sve.json";
import set_svp from "../data/svp.json";
import type { RawCard } from "./raw";

export const SET_DATA: Record<string, RawCard[]> = {
  sve: set_sve as RawCard[],
  svp: set_svp as RawCard[],
  sv04: set_sv04 as RawCard[],
  sv05: set_sv05 as RawCard[],
  sv06: set_sv06 as RawCard[],
  "sv06.5": set_sv06_5 as RawCard[],
  sv07: set_sv07 as RawCard[],
  sv08: set_sv08 as RawCard[],
  "sv08.5": set_sv08_5 as RawCard[],
  sv09: set_sv09 as RawCard[],
  sv10: set_sv10 as RawCard[],
  "sv10.5b": set_sv10_5b as RawCard[],
  "sv10.5w": set_sv10_5w as RawCard[],
  mee: set_mee as RawCard[],
  me01: set_me01 as RawCard[],
  mep: set_mep as RawCard[],
  me02: set_me02 as RawCard[],
  "me02.5": set_me02_5 as RawCard[],
  me03: set_me03 as RawCard[],
  me04: set_me04 as RawCard[],
  me05: set_me05 as RawCard[],
  "30th": set_30th as RawCard[],
  "30th-c": set_30th_c as RawCard[],
};
