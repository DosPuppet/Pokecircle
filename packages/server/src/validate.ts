/**
 * Run-time validation of the received messages: the TypeScript typing of the protocol protects nothing at the network
 * boundary. Decisions are checked in depth by the engine (`checkDecisionShape`, then RulesError).
 */
import { checkDecisionShape, type Decision, RulesError } from "@pocketmate/engine";

export function isDecision(raw: unknown): raw is Decision {
  try {
    checkDecisionShape(raw);
    return true;
  } catch (e) {
    if (e instanceof RulesError) return false;
    throw e;
  }
}
