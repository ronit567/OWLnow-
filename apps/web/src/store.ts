import { useEffect, useState } from "react";
import type { DegreeType, Pick, StudentCourse } from "./data/library";

/** Everything the student chooses, saved in this browser only. */
export interface PlannerState {
  degreeType: DegreeType;
  degreeKind: "BSc" | "BA";
  modules: string[];
  /** Next year's courses, each with the term the student chose. */
  picks: Pick[];
  /** Courses OWL lists that the student dropped or didn't pass. */
  hidden: string[];
  /** Courses typed in when the extension isn't installed. */
  typed: StudentCourse[];
}

// Change the key when the saved shape changes, so old saved choices are dropped.
const KEY = "owlnow-planner";
const START: PlannerState = {
  degreeType: "Honours",
  degreeKind: "BSc",
  modules: [],
  picks: [],
  hidden: [],
  typed: [],
};

function load(): PlannerState {
  try {
    const saved = localStorage.getItem(KEY);
    return saved ? { ...START, ...JSON.parse(saved) } : START;
  } catch {
    return START;
  }
}

export type SetState = (next: PlannerState) => void;

export function usePlanner(): [PlannerState, SetState] {
  const [state, setState] = useState(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Storage is blocked (private window): keep the state in memory only.
    }
  }, [state]);
  return [state, setState];
}

/** Clears everything this browser saved for the planner. */
export const resetPlanner = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing saved to clear.
  }
  location.reload();
};
