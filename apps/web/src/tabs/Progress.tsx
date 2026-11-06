import type { ReactNode } from "react";
import { DEGREE_RULES, MODULES, type Module, type StudentCourse } from "../data/library";
import { auditModule, codeOf, creditsByStanding, degreeProgress, fmt, standings, type Outcome, type RequirementResult, type Standing } from "../checks";
import type { PlannerState } from "../store";
import { OutcomePill } from "../ui";

const MODULES_PAGE = "https://www.westerncalendar.uwo.ca/Modules.cfm?SelectedCalendar=Live&ArchiveID=";
const STAT_TEXT: Record<Outcome, string> = {
  missing: "Not covered, even with your plan",
  check: "Needs a fact OWLnow can't see",
  "on-track": "Met once this year and your plan finish",
  done: "Met with finished courses",
};

/** "Honours Specialization in Computer Science" → "Computer Science"; "Minor in Psychology" → "Psychology minor". */
const shortName = (name: string) =>
  name
    .replace(/^(Honours )?Specialization in /, "")
    .replace(/^Major in (.*)$/, "$1 major")
    .replace(/^Minor in (.*)$/, "$1 minor");

export function Progress({ state, courses }: { state: PlannerState; courses: StudentCourse[] }) {
  const have = standings(
    courses,
    state.picks.map((p) => p.key),
  );
  const rule = DEGREE_RULES[state.degreeType];
  const rows = degreeProgress(rule, have);
  const modules = MODULES.filter((m) => state.modules.includes(m.id));
  const audits = modules.map((m) => ({ module: m, results: m.requirements ? auditModule(m, have) : null }));
  const outcomes: Outcome[] = [...rows.map((r) => r.outcome), ...audits.flatMap((a) => (a.results ? a.results.map((r) => r.outcome) : ["check" as const]))];
  const count = (o: Outcome) => outcomes.filter((x) => x === o).length;
  // OWL's own codes (COMPSCI 1026A) for courses taken; calendar codes for planned ones.
  const owlCode = new Map(courses.map((c) => [c.key, c.code]));
  const label = (key: string) => owlCode.get(key) ?? codeOf(key);
  const total = rows[0];
  const degreeMissing = rows.filter((r) => r.outcome === "missing").length;

  return (
    <>
      <section className="overview">
        <Overview state={state} modules={modules} have={have} total={total.total} need={total.need} />
        <div className="stats">
          {(["missing", "check", "on-track", "done"] as const).map((o) => (
            <div className="stat" key={o}>
              <OutcomePill outcome={o} />
              <strong>{count(o)}</strong>
              <p>{STAT_TEXT[o]}</p>
            </div>
          ))}
        </div>
      </section>

      {(!courses.length || !modules.length) && (
        <section className="card hint">
          <h3>{courses.length ? "Pick your modules" : "No courses yet"}</h3>
          <p className="muted">
            {courses.length
              ? "Choose your modules on My courses to see their requirements here."
              : "Install the OWLnow extension and sign in to OWL, or add your courses on My courses. Progress fills in from there."}{" "}
            <a href="#my">Go to My courses</a>
          </p>
        </section>
      )}

      <section className="req-card">
        <header>
          <div>
            <span className="kicker">Degree</span>
            <h2>
              {state.degreeType} {state.degreeKind}
            </h2>
          </div>
          <span className="muted small">{degreeMissing ? `${degreeMissing} requirement${degreeMissing > 1 ? "s" : ""} still missing` : "Every requirement covered"}</span>
        </header>
        {rows.map((r) => (
          <Row key={r.label} outcome={r.outcome} title={r.label} sub={r.note} got={r.total} need={r.need} />
        ))}
      </section>

      {audits.map(({ module, results }) => (
        <ModuleCard key={module.id} module={module} results={results} label={label} />
      ))}
    </>
  );
}

function Overview({ state, modules, have, total, need }: { state: PlannerState; modules: Module[]; have: Map<string, Standing>; total: number; need: number }) {
  const credits = creditsByStanding(have);
  const toPlan = Math.max(0, need - total);
  const slots = Math.round(need / 0.5);
  const kinds = [
    ...Array<string>(Math.round(credits.done / 0.5)).fill("done"),
    ...Array<string>(Math.round(credits.current / 0.5)).fill("current"),
    ...Array<string>(Math.round(credits.planned / 0.5)).fill("planned"),
  ].slice(0, slots);
  while (kinds.length < slots) kinds.push("empty");
  return (
    <div className="card hero-card">
      <div className="sub">
        {state.degreeType} {state.degreeKind}
        {modules.length > 0 && ` · ${modules.map((m) => shortName(m.name)).join(" + ")}`}
      </div>
      <div className="big-line">
        <span className="big">{fmt(total)}</span>
        <span>of {fmt(need)} credits, counting next year's plan</span>
      </div>
      <div className="blocks" aria-hidden="true">
        {kinds.map((k, i) => (
          <span key={i} className={`blk ${k}`} />
        ))}
      </div>
      <div className="legend">
        <span>
          <i className="blk done" />
          Done<strong>{fmt(credits.done)}</strong>
        </span>
        <span>
          <i className="blk current" />
          This year<strong>{fmt(credits.current)}</strong>
        </span>
        <span>
          <i className="blk planned" />
          Planned<strong>{fmt(credits.planned)}</strong>
        </span>
        <span>
          <i className="blk empty" />
          Still to plan<strong>{fmt(toPlan)}</strong>
        </span>
      </div>
    </div>
  );
}

function Row({ outcome, title, sub, chips, got, need }: { outcome: Outcome; title: string; sub?: string; chips?: ReactNode; got?: number; need?: number }) {
  return (
    <div className="rq">
      <div>
        <OutcomePill outcome={outcome} />
      </div>
      <div>
        <div className="rq-title">{title}</div>
        {sub && <div className="rq-sub">{sub}</div>}
        {chips}
      </div>
      {need !== undefined && got !== undefined && need > 0 ? (
        <div>
          <div className="rq-num">
            {fmt(got)} / {fmt(need)}
          </div>
          <div className="rq-bar">
            <span className={`fill-${outcome}`} style={{ width: `${Math.min(1, got / need) * 100}%` }} />
          </div>
        </div>
      ) : (
        <div />
      )}
    </div>
  );
}

function ModuleCard({ module, results, label }: { module: Module; results: RequirementResult[] | null; label: (key: string) => string }) {
  const left = results?.filter((r) => r.outcome === "missing").length ?? 0;
  return (
    <section className="req-card">
      <header>
        <div>
          <span className="kicker">Module</span>
          <h2>{module.name}</h2>
        </div>
        <span className="muted small">
          {!results ? "Not converted to checks yet" : left ? `${left} requirement${left > 1 ? "s" : ""} to go` : "Every requirement covered"}
        </span>
      </header>
      {results ? (
        results.map((r) => (
          <Row
            key={r.req.text}
            outcome={r.outcome}
            title={r.req.text}
            got={r.got}
            need={r.req.check ? undefined : r.req.credits}
            chips={
              r.counted.length > 0 && (
                <div className="cchips">
                  {r.counted.map(([key, s]) => (
                    <span key={key} className={`cc ${s}`}>
                      {s === "done" ? `✓ ${label(key)}` : s === "current" ? `${label(key)} · this year` : `${label(key)} · planned`}
                    </span>
                  ))}
                </div>
              )
            }
          />
        ))
      ) : (
        <Row
          outcome="check"
          title="Read this module's requirements in the Academic Calendar"
          sub="It shows as Check until the team converts it and signs it off."
          chips={
            <div className="cchips">
              <a href={MODULES_PAGE} target="_blank" rel="noreferrer" className="small">
                Open the calendar's module list
              </a>
            </div>
          }
        />
      )}
    </section>
  );
}
