/** Registers every op handler (imported once by game.ts). */
import { registerOps } from "../opRegistry";
import { HANDLERS as board } from "./board";
import { HANDLERS as cards } from "./cards";
import { HANDLERS as conditions } from "./conditions";
import { HANDLERS as damage } from "./damage";
import { HANDLERS as flow } from "./flow";

for (const h of [board, cards, conditions, damage, flow]) registerOps(h);
