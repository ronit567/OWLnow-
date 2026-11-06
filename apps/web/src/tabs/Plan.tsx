import { useState } from "react";
import { COURSES, DEGREE_RULES, FULL_TERM, MODULES, NEXT_TERMS, NEXT_YEAR, THIS_YEAR, type Pick, type Semester, type StudentCourse } from "../data/library";
import {
  catalog,
  checkPick,
  codeOf,
  courseCode,
  defaultSemester,
  degreeProgress,
  fmt,
  isFullYear,
  mainNote,
  searchCourses,
  standings,
  suggestCourses,
  termLoad,
  weightOf,
  type Note,
  type Suggestion,
} from "../checks";
import type { PlannerState, SetState } from "../store";
import { TonePill } from "../ui";

export function Plan({ state, setState, courses }: { state: PlannerState; setState: SetState; courses: StudentCourse[] }) {
  const { picks } = state;
  const setPicks = (next: Pick[]) => setState({ ...state, picks: next });
  const add = (key: string, term?: Semester) => {
    const course = catalog.get(key);
    if (!course || picks.some((p) => p.key === key)) return;
    setPicks([...picks, { key, term: isFullYear(course) ? "FW" : (term ?? defaultSemester(course)) }]);
  };
  const checked = picks.map((p) => ({ pick: p, notes: checkPick(p, courses, picks) }));
  const years = [...new Set(courses.map((c) => c.year))].sort();

  return (
    <div className="plan-layout">
      <aside>
        <p className="kicker quiet">From OWL</p>
        <div className="owl-years">
          {years.map((year, i) => (
            <YearCard key={year} year={year} index={i} courses={courses.filter((c) => c.year === year)} />
          ))}
          {!years.length && (
            <section className="ycard">
              <p className="muted small">Your past years show up here once the extension reads OWL, or once you add courses on My courses.</p>
            </section>
          )}
        </div>
      </aside>
      <div>
        <Banner state={state} courses={courses} notes={checked.map((c) => c.notes)} />
        <NextYear picks={picks} checked={checked} setPicks={setPicks} add={add} yearNumber={years.length + 1} />
        <Suggestions state={state} courses={courses} add={add} />
      </div>
    </div>
  );
}

/** A past or current year as OWL reports it: by school year, since OWL names don't say the term. */
function YearCard({ year, index, courses }: { year: string; index: number; courses: StudentCourse[] }) {
  const now = year === THIS_YEAR;
  return (
    <section className="ycard">
      <header>
        <h3>
          {year} <span>· Year {index + 1}{now ? " · this year" : ""}</span>
        </h3>
        <span className="mono small muted">{fmt(courses.reduce((t, c) => t + weightOf(c.key), 0))} cr</span>
      </header>
      <div className="ychips">
        {courses.map((c) => (
          <span key={c.key} className={`ychip ${now ? "now" : ""}`} title={catalog.get(c.key)?.title}>
            {c.code}
          </span>
        ))}
        {!courses.length && <span className="muted small">Nothing on OWL for this year.</span>}
      </div>
    </section>
  );
}

/** Credits with this plan and how many picks need attention, always in view. */
function Banner({ state, courses, notes }: { state: PlannerState; courses: StudentCourse[]; notes: Note[][] }) {
  const have = standings(
    courses,
    state.picks.map((p) => p.key),
  );
  const total = degreeProgress(DEGREE_RULES[state.degreeType], have)[0];
  const blocked = notes.filter((n) => mainNote(n).tone === "error").length;
  const toCheck = notes.filter((n) => ["warn", "check"].includes(mainNote(n).tone)).length;
  return (
    <section className="banner">
      <span className="big">{fmt(total.total)}</span>
      <span className="of">/ {fmt(total.need)} credits with this plan</span>
      <span className="bpills">
        {blocked > 0 && (
          <span className="bpill">
            {blocked} course{blocked > 1 ? "s" : ""} can't be taken
          </span>
        )}
        {toCheck > 0 && <span className="bpill">{toCheck} to check</span>}
        <a href="#progress">See progress →</a>
      </span>
    </section>
  );
}

function NextYear({
  picks,
  checked,
  setPicks,
  add,
  yearNumber,
}: {
  yearNumber: number;
  picks: Pick[];
  checked: { pick: Pick; notes: Note[] }[];
  setPicks: (p: Pick[]) => void;
  add: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [over, setOver] = useState<Semester | null>(null);
  const matches = query.trim() ? searchCourses(query).filter((c) => !picks.some((p) => p.key === c.key)).slice(0, 8) : [];
  const move = (key: string, to: Semester) => setPicks(picks.map((p) => (p.key === key && p.term !== "FW" ? { ...p, term: to } : p)));
  const remove = (key: string) => setPicks(picks.filter((p) => p.key !== key));
  const cards = (which: Semester) =>
    checked
      .filter(({ pick }) => pick.term === which)
      .map(({ pick, notes }) => <PickCard key={pick.key} pick={pick} notes={notes} onMove={(to) => move(pick.key, to)} onRemove={() => remove(pick.key)} />);

  return (
    <section className="card">
      <div className="plan-head">
        <h2>
          {NEXT_YEAR} · Year {yearNumber}
        </h2>
        <span className="muted small">Drag courses between terms. Each one is checked as you go.</span>
      </div>
      <div className="search">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Add a course: try COMPSCI 3307 or “graphics”" aria-label="Search courses to add" />
        {query.trim() && !COURSES.length && <p className="muted small">The course list isn't loaded yet. It comes from the library files built from the calendar scrape.</p>}
        {matches.length > 0 && (
          <ul className="matches">
            {matches.map((c) => (
              <li key={c.key}>
                <button
                  onClick={() => {
                    add(c.key);
                    setQuery("");
                  }}
                >
                  <strong className="mono">{courseCode(c)}</strong> {c.title} <span className="muted">· {fmt(c.weight)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="terms">
        {(["F", "W"] as const).map((t) => {
          const load = termLoad(picks, t);
          return (
            <div
              key={t}
              className={`term ${over === t ? "over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(t);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                move(e.dataTransfer.getData("text/plain"), t);
              }}
            >
              <header>
                <h3>{NEXT_TERMS[t]}</h3>
                <span className={`mono ${load > FULL_TERM ? "heavy" : ""}`}>
                  {fmt(load)} cr{load > FULL_TERM ? " · heavy" : ""}
                </span>
              </header>
              {cards(t)}
            </div>
          );
        })}
      </div>
      {picks.some((p) => p.term === "FW") && (
        <div className="term full-year">
          <header>
            <h3>Full year</h3>
            <span className="mono">{fmt(picks.filter((p) => p.term === "FW").reduce((s, p) => s + weightOf(p.key), 0))} cr · counts in both terms</span>
          </header>
          <div className="full-year-cards">{cards("FW")}</div>
        </div>
      )}
      <p className="note">No sections or times here. Once the plan checks out, build your timetable in Draft My Schedule.</p>
    </section>
  );
}

function PickCard({ pick, notes, onMove, onRemove }: { pick: Pick; notes: Note[]; onMove: (to: Semester) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const course = catalog.get(pick.key);
  const main = mainNote(notes);
  const other: Semester = pick.term === "F" ? "W" : "F";
  const draggable = pick.term !== "FW";
  return (
    <div
      className={`pcard ${dragging ? "dragging" : ""}`}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", pick.key);
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
    >
      <div className="pcard-top">
        <span className="mono">{codeOf(pick.key)}</span>
        <button className="x" onClick={onRemove} aria-label={`Remove ${codeOf(pick.key)}`}>
          ×
        </button>
      </div>
      <div className="pcard-title">
        {course?.title}
        {course && course.campus !== "Main" && ` · ${course.campus}`}
      </div>
      <div className="pcard-foot">
        <TonePill tone={main.tone}>{main.label}</TonePill>
        {main.tone !== "ok" && (
          <button className="link" onClick={() => setOpen(!open)}>
            {open ? "Hide" : "Why?"}
          </button>
        )}
        <span className="mono">{fmt(course?.weight ?? 0)}</span>
      </div>
      {open && (
        <div className="why">
          {notes.map((n) => (
            <p key={n.short}>
              <strong>{n.short}.</strong> {n.detail}
            </p>
          ))}
          {draggable && (
            <button className="link" onClick={() => onMove(other)}>
              Move to {NEXT_TERMS[other]}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Suggestions({ state, courses, add }: { state: PlannerState; courses: StudentCourse[]; add: (key: string) => void }) {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const suggest = () => {
    const have = standings(
      courses,
      state.picks.map((p) => p.key),
    );
    const modules = MODULES.filter((m) => state.modules.includes(m.id));
    setSuggestions(suggestCourses(modules, degreeProgress(DEGREE_RULES[state.degreeType], have), have));
  };
  const open = suggestions?.filter((s) => !state.picks.some((p) => p.key === s.key)) ?? [];
  return (
    <section className="card" style={{ marginTop: 20 }}>
      <div className="gaps">
        <div>
          <h2>Fill your gaps</h2>
          <p className="muted small">Courses you can take next year that close module, breadth and essay gaps.</p>
        </div>
        <button className="primary" onClick={suggest}>
          Suggest courses
        </button>
      </div>
      {suggestions !== null && (
        <ul className="suggestions">
          {open.length === 0 && <li className="muted">No gaps left that one course could fill.</li>}
          {open.map((s) => {
            const course = catalog.get(s.key);
            return (
              <li key={s.key}>
                <div>
                  <strong className="mono">{codeOf(s.key)}</strong> {course?.title}
                  <div className="muted small">Fills {s.why}</div>
                </div>
                <button className="soft" onClick={() => add(s.key)}>
                  Add to {course ? NEXT_TERMS[defaultSemester(course)] : "plan"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
