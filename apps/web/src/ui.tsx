import type { ReactNode } from "react";
import type { Outcome, Tone } from "./checks";

const OUTCOME: Record<Outcome, string> = { done: "Done", "on-track": "On track", missing: "Missing", check: "Check" };

export const OutcomePill = ({ outcome }: { outcome: Outcome }) => <span className={`pill outcome-${outcome}`}>{OUTCOME[outcome]}</span>;

export const TonePill = ({ tone, children }: { tone: Tone; children: ReactNode }) => <span className={`pill tone-${tone}`}>{children}</span>;
