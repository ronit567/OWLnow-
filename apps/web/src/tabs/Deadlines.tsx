import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_REMINDERS,
  KIND_LABEL,
  REMINDER_CHOICES,
  courseColor,
  dueBadge,
  formatDateTime,
  formatToday,
  sameDay,
  sections,
  shownAt,
  toIcs,
  weekStrip,
  type Kind,
  type PanelDeadline,
  type ReminderSettings,
} from "@owlnow/deadlines";
import type { FromExtension } from "../App";

/** A value saved in this browser, like the extension keeps its ticks and reminder settings. */
function useSaved<T>(key: string, start: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? (JSON.parse(saved) as T) : start;
    } catch {
      return start;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage blocked: keep it for this visit only.
    }
  }, [key, value]);
  return [value, setValue];
}

// Everything the extension's side panel shows, on a bigger screen. The deadlines come from the
// extension through the bridge; the website can't read OWL itself.
export function Deadlines({ owl }: { owl: FromExtension }) {
  const now = useMemo(() => new Date(), []);
  const deadlines = owl.deadlines;
  const [doneIds, setDoneIds] = useSaved<string[]>("owlnow-preview-done", []);
  const [reminders, setReminders] = useSaved<ReminderSettings>("owlnow-preview-reminders", DEFAULT_REMINDERS);
  const [view, setView] = useState<"list" | "week">("list");
  const done = new Set(doneIds);
  const s = sections(deadlines, done, now);

  if (!owl.connected)
    return (
      <section className="card">
        <h2>Deadlines come from the extension</h2>
        <p className="muted">
          The OWLnow extension reads your deadlines from OWL as you, every 30 minutes, and shows them here and in its side panel. Install it, sign in to OWL,
          and this page fills itself.
        </p>
      </section>
    );

  const isDone = (d: PanelDeadline) => done.has(d.id) || d.submitted === true;
  const toggle = (id: string) => setDoneIds(done.has(id) ? doneIds.filter((x) => x !== id) : [...doneIds, id]);
  const exportIcs = () => {
    const url = URL.createObjectURL(new Blob([toIcs(deadlines, now)], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "owlnow-deadlines.ics";
    a.click();
    URL.revokeObjectURL(url);
  };
  const row = (d: PanelDeadline) => <Row key={d.id} d={d} now={now} done={isDone(d)} onToggle={() => toggle(d.id)} />;

  return (
    <>
      <div className="dl-head">
        <div>
          <p>{formatToday(now)}</p>
          <h1>
            {s.dueThisWeek} due this week
            {s.overdue > 0 && <span className="late">{s.overdue} overdue</span>}
          </h1>
        </div>
        <div className="seg" role="tablist">
          <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>
            List
          </button>
          <button className={view === "week" ? "on" : ""} onClick={() => setView("week")}>
            Week
          </button>
        </div>
      </div>

      <div className="dl-layout">
        <section className="card">
          {view === "list" ? (
            <>
              {s.work.map(([name, items]) => (
                <div key={name}>
                  <h4 className={name === "Overdue" ? "group late" : "group"}>
                    {name.toUpperCase()}
                    <small>{items.length}</small>
                  </h4>
                  <ul className="rows">{items.map(row)}</ul>
                </div>
              ))}
              {!s.work.length && <p className="muted">Nothing due. Enjoy it.</p>}
            </>
          ) : (
            <Week deadlines={deadlines} done={done} now={now} />
          )}
          <details className="done-box">
            <summary>
              DONE {s.finished.length} <span>· ticked off, or submitted on OWL</span>
            </summary>
            <ul className="rows">{s.finished.map(row)}</ul>
          </details>
        </section>

        <div className="stack">
          <section className="card side-card">
            <h3>Events this week</h3>
            {s.events.map((d) => (
              <div className="ev" key={d.id}>
                <strong>{d.title}</strong>
                <span>
                  {d.course} · {formatDateTime(shownAt(d))}
                </span>
              </div>
            ))}
            {!s.events.length && <p className="sub">No office hours or readings this week.</p>}
          </section>
          <section className="card side-card">
            <h3>Other OWL sites</h3>
            <p className="sub">Not a course, but still due.</p>
            {s.other.map((d) => (
              <div className="other" key={d.id}>
                <input type="checkbox" className="check" checked={isDone(d)} onChange={() => toggle(d.id)} aria-label={`Mark ${d.title} as done`} />
                <div>
                  <strong>{d.title}</strong>
                  <div className="muted small">
                    {d.site} · {formatDateTime(shownAt(d))}
                  </div>
                </div>
              </div>
            ))}
          </section>
          <section className="card side-card">
            <h3>Reminders</h3>
            <div className="reminders">
              {(Object.keys(DEFAULT_REMINDERS) as Kind[]).map((kind) => (
                <label key={kind}>
                  {kind === "event" ? "Events" : `${KIND_LABEL[kind]}s`}
                  <select value={reminders[kind]} onChange={(e) => setReminders({ ...reminders, [kind]: Number(e.target.value) })}>
                    {REMINDER_CHOICES.map((c) => (
                      <option key={c.hours} value={c.hours}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button className="soft" onClick={exportIcs}>
              Export deadlines to your calendar
            </button>
          </section>
        </div>
      </div>
    </>
  );
}

function Row({ d, now, done, onToggle }: { d: PanelDeadline; now: Date; done: boolean; onToggle: () => void }) {
  const badge = done ? { text: d.submitted ? "Submitted" : "Done", tone: "done" } : dueBadge(d, now);
  return (
    <li className={`dl-row ${done ? "is-done" : ""}`}>
      <input type="checkbox" className="check" checked={done} disabled={d.submitted === true} onChange={onToggle} aria-label={`Mark ${d.title} as done`} />
      <div>
        <a className="dl-title" href={d.url} target="_blank" rel="noreferrer">
          {d.title}
        </a>
        <span className="kind">{KIND_LABEL[d.kind]}</span>
        <div className="code">
          <i className="swatch" style={{ background: courseColor(d.course) }} />
          {d.course ?? d.site}
        </div>
        {d.movedFrom && !done && <span className="moved">Due date moved · was {formatDateTime(d.movedFrom).split(" · ")[0]}</span>}
      </div>
      <span className="dl-when">{formatDateTime(shownAt(d))}</span>
      <span className={`badge ${badge.tone}`}>{badge.text}</span>
    </li>
  );
}

/** This week, Monday to Sunday, with work and events under each day. */
function Week({ deadlines, done, now }: { deadlines: PanelDeadline[]; done: Set<string>; now: Date }) {
  const days = weekStrip(deadlines, done, now);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return (
    <div className="weekgrid">
      {days.map((day, i) => {
        const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
        const items = deadlines.filter((d) => d.course && !d.submitted && !done.has(d.id) && sameDay(shownAt(d), date));
        return (
          <div key={day.label} className={`wday ${day.today ? "today" : ""}`}>
            <h4>
              {day.label}
              <strong>{day.day}</strong>
            </h4>
            {items.map((d) => (
              <div key={d.id} className={`witem ${d.kind === "event" ? "event" : ""}`}>
                <i className="swatch" style={{ background: courseColor(d.course) }} />
                <strong>{d.title}</strong>
                <span className="muted">{shownAt(d).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
