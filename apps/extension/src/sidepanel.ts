// The side panel. Deadlines come from the OWL reader, which isn't built yet, so the list starts empty.
// Ticks and reminder settings are kept in this page's localStorage.
import {
  DEFAULT_REMINDERS,
  KIND_LABEL,
  REMINDER_CHOICES,
  courseColor,
  dueBadge,
  formatDay,
  formatDue,
  formatToday,
  sections,
  toIcs,
  weekStrip,
  type Kind,
  type PanelDeadline,
  type ReminderSettings,
} from "@owlnow/deadlines";

declare const __PLANNER_URL__: string;

const now = new Date();
/** Filled by the OWL reader. */
const DEADLINES: PanelDeadline[] = [];

function read<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the choice lasts until the panel closes.
  }
}

const done = new Set(read<string[]>("owlnow-done", []));
const reminders = read<ReminderSettings>("owlnow-reminders", DEFAULT_REMINDERS);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const readStatus = "Not read yet";
const isDone = (d: PanelDeadline) => done.has(d.id) || d.submitted === true;

function item(d: PanelDeadline): HTMLLIElement {
  const li = el("li", isDone(d) ? "is-done" : "");
  const box = el("input", "check");
  box.type = "checkbox";
  box.checked = isDone(d);
  box.disabled = d.submitted === true;
  box.title = d.submitted ? "Submitted on OWL" : "Mark as done";
  box.addEventListener("change", () => {
    if (box.checked) done.add(d.id);
    else done.delete(d.id);
    write("owlnow-done", [...done]);
    render();
  });

  const top = el("div", "item-top");
  const link = el("a", "", d.title);
  link.href = d.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  const badge = isDone(d) ? { text: d.submitted ? "Submitted" : "Done", tone: "done" } : dueBadge(d, now);
  top.append(link, el("span", `badge ${badge.tone}`, badge.text));

  const meta = el("div", "meta");
  const swatch = el("i", "swatch");
  swatch.style.background = courseColor(d.course);
  meta.append(swatch, el("span", "code", d.course ?? d.site), document.createTextNode(`${formatDue(d, now)} · ${KIND_LABEL[d.kind]}`));

  const body = el("div", "item-body");
  body.append(top, meta);
  if (d.movedFrom && !isDone(d)) body.append(el("span", "moved", `Due date moved · was ${formatDay(d.movedFrom)}`));
  li.append(box, body);
  return li;
}

const list = (target: HTMLElement, items: PanelDeadline[]) => target.replaceChildren(...items.map(item));

function render() {
  $("read-status").textContent = readStatus;

  const s = sections(DEADLINES, done, now);
  $("today").textContent = formatToday(now);
  const headline = $("headline");
  headline.replaceChildren(document.createTextNode(`${s.dueThisWeek} due this week`));
  if (s.overdue) headline.append(el("span", "overdue", `${s.overdue} overdue`));

  $("week").replaceChildren(
    ...weekStrip(DEADLINES, done, now).map((day) => {
      const tile = el("div", day.today ? "day today" : "day");
      const dots = el("div", "dots");
      for (const color of day.colors) {
        const dot = el("i");
        dot.style.background = color;
        dots.append(dot);
      }
      tile.append(el("span", "", day.label), el("strong", "", String(day.day)), dots);
      return tile;
    }),
  );

  const main = $("work");
  main.replaceChildren();
  for (const [name, items] of s.work) {
    const heading = el("h2", name === "Overdue" ? "group late" : "group", name.toUpperCase());
    heading.append(el("small", "", String(items.length)));
    const ul = el("ul", "items");
    list(ul, items);
    main.append(heading, ul);
  }
  if (!s.work.length) main.append(el("p", "empty", DEADLINES.length ? "Nothing due. Enjoy it." : "No deadlines yet. They show up here once OWLnow reads OWL."));

  $("events-title").textContent = `Office hours and other events (${s.events.length})`;
  list($("events"), s.events);
  $("other-title").textContent = `Other OWL sites (${s.other.length})`;
  list($("other"), s.other);
  $("done-title").textContent = `Done (${s.finished.length})`;
  list($("done"), s.finished);
}

function renderReminders() {
  const box = $("reminders");
  box.replaceChildren();
  for (const kind of Object.keys(DEFAULT_REMINDERS) as Kind[]) {
    const label = el("label", "", kind === "event" ? "Events" : `${KIND_LABEL[kind]}s`);
    const select = el("select");
    for (const c of REMINDER_CHOICES) {
      const option = el("option", "", c.label);
      option.value = String(c.hours);
      option.selected = reminders[kind] === c.hours;
      select.append(option);
    }
    select.addEventListener("change", () => {
      reminders[kind] = Number(select.value);
      write("owlnow-reminders", reminders);
    });
    label.append(select);
    box.append(label);
  }
  box.append(el("p", "", "One desktop notification per due date. Nothing is reminded once it's submitted or ticked off."));
}

function exportIcs() {
  const url = URL.createObjectURL(new Blob([toIcs(DEADLINES, now)], { type: "text/calendar" }));
  const a = el("a");
  a.href = url;
  a.download = "owlnow-deadlines.ics";
  a.click();
  URL.revokeObjectURL(url);
}

$<HTMLAnchorElement>("planner").href = __PLANNER_URL__;
$("welcome").hidden = read("owlnow-welcomed", false);
$("get-started").addEventListener("click", () => {
  write("owlnow-welcomed", true);
  $("welcome").hidden = true;
});
$("settings-button").addEventListener("click", () => {
  const opening = $("settings").hidden;
  $("settings").hidden = !opening;
  $("main").hidden = opening;
  $("settings-button").textContent = opening ? "Done" : "Settings";
});
$("read").addEventListener("click", () => {
  // Asks the background worker to read OWL once the reader exists.
  render();
});
$("ics").addEventListener("click", exportIcs);

render();
renderReminders();
