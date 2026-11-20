import { useEffect, useState, type ReactNode } from "react";
import { catalog } from "../checks";
import type { Course } from "./library";

// Load only the calendar subjects represented on this student's record or plan.
const files = import.meta.glob<{ courses: Course[] }>("../../../../scraper/data/courses/*.json", { import: "default" });
const loaded = new Set<string>();

export function DegreeCatalog({ keys, children }: { keys: string[]; children: ReactNode }) {
  const subjects = [...new Set(keys.map((key) => key.split(" ")[0]))].sort().join(" ");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      for (const subject of subjects.split(" ").filter(Boolean)) {
        if (loaded.has(subject)) continue;
        const read = files[`../../../../scraper/data/courses/${subject}.json`];
        if (read) {
          const { courses } = await read();
          for (const course of courses) catalog.set(course.key, course);
        }
        loaded.add(subject);
      }
      if (active) setReady(subjects);
    }
    load().catch(() => { if (active) setError(subjects); });
    return () => { active = false; };
  }, [subjects, attempt]);

  if (subjects && error === subjects) {
    return <p>Course details could not be loaded. <button onClick={() => { setError(""); setAttempt(attempt + 1); }}>Retry</button></p>;
  }
  if (subjects !== ready) return <p>Loading course details…</p>;
  const unknown = [...new Set(keys.filter((key) => !catalog.has(key)))];
  return <>{unknown.length > 0 && <p>Excluded from degree totals because calendar details are unavailable: {unknown.join(", ")}.</p>}{children}</>;
}
