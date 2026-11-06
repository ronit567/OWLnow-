import { useState } from "react";
import { COURSES, EDITION, MODULES, RECENT_YEARS, THIS_YEAR, type DegreeType, type StudentCourse } from "../data/library";
import { courseCode, parseCode } from "../checks";
import type { FromExtension } from "../App";
import type { PlannerState, SetState } from "../store";

const DEGREES: DegreeType[] = ["Honours", "4-year", "3-year"];
const titleOf = (key: string) => COURSES.find((c) => c.key === key)?.title;

export function MyCourses({ state, setState, owl }: { state: PlannerState; setState: SetState; owl: FromExtension }) {
  const [moduleQuery, setModuleQuery] = useState("");
  const matches = MODULES.filter((m) => !state.modules.includes(m.id) && m.name.toLowerCase().includes(moduleQuery.trim().toLowerCase())).slice(0, 6);
  return (
    <div className="my-layout">
      <section className="card">
        <h2>Your degree and modules</h2>
        <p className="lead-sub">The only thing you type. Everything else comes from OWL.</p>
        <div className="two">
          <label className="field">
            Degree
            <select value={state.degreeType} onChange={(e) => setState({ ...state, degreeType: e.target.value as DegreeType })}>
              {DEGREES.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Type
            <select value={state.degreeKind} onChange={(e) => setState({ ...state, degreeKind: e.target.value as "BSc" | "BA" })}>
              <option>BSc</option>
              <option>BA</option>
            </select>
          </label>
        </div>
        <span className="label">Modules</span>
        {state.modules.map((id) => (
          <div className="mod-row" key={id}>
            {MODULES.find((m) => m.id === id)?.name}
            <button aria-label="Remove module" onClick={() => setState({ ...state, modules: state.modules.filter((m) => m !== id) })}>
              ×
            </button>
          </div>
        ))}
        <div className="search">
          <input value={moduleQuery} onChange={(e) => setModuleQuery(e.target.value)} placeholder="Add a module, e.g. Statistics" aria-label="Search modules" />
          {moduleQuery.trim() && !MODULES.length && <p className="muted small">The module list isn't loaded yet. It comes from the library files built from the calendar scrape.</p>}
          {moduleQuery.trim() && matches.length > 0 && (
            <ul className="matches">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => {
                      setState({ ...state, modules: [...state.modules, m.id] });
                      setModuleQuery("");
                    }}
                  >
                    {m.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="muted small">Modules follow the {EDITION.year} Academic Calendar, the edition you started your module in.</p>
      </section>
      {owl.connected ? <OwlCourses state={state} setState={setState} courses={owl.courses} /> : <TypedCourses state={state} setState={setState} />}
    </div>
  );
}

function OwlCourses({ state, setState, courses }: { state: PlannerState; setState: SetState; courses: StudentCourse[] }) {
  const toggle = (key: string) =>
    setState({ ...state, hidden: state.hidden.includes(key) ? state.hidden.filter((k) => k !== key) : [...state.hidden, key] });
  return (
    <section className="card">
      <div className="gaps">
        <h2>Courses from OWL</h2>
        <span className="muted small">Read by the extension, kept in this browser</span>
      </div>
      <p className="notice">OWL can't tell whether you passed. Switch off any course you dropped or didn't pass.</p>
      {[...new Set(courses.map((c) => c.year))].sort().map((year, i) => {
        const list = courses.filter((c) => c.year === year);
        const current = year === THIS_YEAR;
        return (
          <div key={year}>
            <div className="yhead">
              <h3>{year}</h3>
              <span className="muted small">
                Year {i + 1}
                {current ? " · this year" : ""}
              </span>
              {!current && <span className="counts">COUNTS</span>}
            </div>
            {list.map((c) => {
              const counts = !state.hidden.includes(c.key);
              return (
                <div key={c.key} className={`orow ${counts ? "" : "off"}`}>
                  <span className="mono">{c.code}</span>
                  <span>{titleOf(c.key)}</span>
                  {current ? (
                    <span className="pill outcome-on-track">In progress</span>
                  ) : (
                    <button
                      className={`switch ${counts ? "on" : ""}`}
                      role="switch"
                      aria-checked={counts}
                      aria-label={`${c.code} counts toward your degree`}
                      onClick={() => toggle(c.key)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}

function TypedCourses({ state, setState }: { state: PlannerState; setState: SetState }) {
  const [code, setCode] = useState("");
  const [year, setYear] = useState(THIS_YEAR);
  const add = () => {
    const parsed = parseCode(code);
    if (!parsed) return;
    const typed: StudentCourse = { ...parsed, year, status: year === THIS_YEAR ? "current" : "past" };
    setState({ ...state, typed: [...state.typed.filter((c) => c.key !== parsed.key), typed] });
    setCode("");
  };
  return (
    <section className="card">
      <div className="gaps">
        <h2>Your courses</h2>
        <span className="muted small">No extension found</span>
      </div>
      <p className="notice">Install the OWLnow extension and this fills itself from OWL. Without it, type your courses once; they stay in this browser.</p>
      <form
        className="typed"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input list="all-courses" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Course code" aria-label="Course code" />
        <datalist id="all-courses">
          {COURSES.map((c) => (
            <option key={c.key} value={courseCode(c)}>
              {c.title}
            </option>
          ))}
        </datalist>
        <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="School year">
          {RECENT_YEARS.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
        <button type="submit" className="primary">
          Add
        </button>
      </form>
      {state.typed.map((c) => (
        <div key={c.key} className="orow">
          <span className="mono">{c.code}</span>
          <span className="muted">{c.year}</span>
          <button className="link" onClick={() => setState({ ...state, typed: state.typed.filter((x) => x.key !== c.key) })}>
            Remove
          </button>
        </div>
      ))}
    </section>
  );
}
