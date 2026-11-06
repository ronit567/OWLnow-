import { useEffect, useState } from "react";
import type { PanelDeadline } from "@owlnow/deadlines";
import { EDITION, type StudentCourse } from "./data/library";
import { resetPlanner, usePlanner } from "./store";
import { Deadlines } from "./tabs/Deadlines";
import { MyCourses } from "./tabs/MyCourses";
import { Plan } from "./tabs/Plan";
import { Progress } from "./tabs/Progress";

const TABS = [
  { id: "progress", label: "Progress" },
  { id: "plan", label: "Plan" },
  { id: "deadlines", label: "Deadlines" },
  { id: "my", label: "My courses" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const tabFromHash = (): TabId => TABS.find((t) => `#${t.id}` === location.hash)?.id ?? "progress";

/** What the extension hands the website through the bridge. Empty until the bridge is built. */
export interface FromExtension {
  connected: boolean;
  courses: StudentCourse[];
  deadlines: PanelDeadline[];
}

const NOT_CONNECTED: FromExtension = { connected: false, courses: [], deadlines: [] };

// The planner website: Progress, Plan, Deadlines and My courses.
export function App() {
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const [state, setState] = usePlanner();
  const owl = NOT_CONNECTED;
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  const courses = owl.connected ? owl.courses.filter((c) => !state.hidden.includes(c.key)) : state.typed;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="logo">OWLnow</span>
          <nav className="tabs">
            {TABS.map((t) => (
              <a key={t.id} href={`#${t.id}`} className={tab === t.id ? "on" : ""}>
                {t.label}
              </a>
            ))}
          </nav>
          <span className="conn">
            <i className={owl.connected ? "on" : ""} />
            {owl.connected ? "Extension connected" : "Extension not connected"}
          </span>
        </div>
      </header>

      <main className="app">
        {tab === "progress" && <Progress state={state} courses={courses} />}
        {tab === "plan" && <Plan state={state} setState={setState} courses={courses} />}
        {tab === "deadlines" && <Deadlines owl={owl} />}
        {tab === "my" && <MyCourses state={state} setState={setState} owl={owl} />}

        <footer className="foot">
          <p>Unofficial. Always confirm your plan with an academic counsellor.</p>
          <p>
            {EDITION.year} Academic Calendar, last updated {EDITION.updated}.{" "}
            <button className="link" onClick={resetPlanner}>
              Clear my saved choices
            </button>
          </p>
        </footer>
      </main>
    </>
  );
}
