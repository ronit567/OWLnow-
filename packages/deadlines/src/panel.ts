// What the side panel and the website's Deadlines tab show, and how they group it. Both read the
// same deadlines: the panel from extension storage, the website through the bridge.

export type Kind = "assignment" | "quiz" | "discussion" | "test" | "event";

export interface PanelDeadline {
  id: string;
  title: string;
  /** Null for sites that aren't courses (training, communities). */
  course: string | null;
  site: string;
  kind: Kind;
  due: Date;
  /** When a test or event begins (due is when it ends). */
  start?: Date;
  submitted?: boolean;
  movedFrom?: Date;
  url: string;
}

/** Work you hand in by a date. Only these can be overdue; tests and events just pass. */
export const SUBMITTABLE: readonly Kind[] = ["assignment", "quiz", "discussion"];

export const KIND_LABEL: Record<Kind, string> = { assignment: "Assignment", quiz: "Quiz", discussion: "Discussion", test: "Test", event: "Event" };

/** Hours before the due date to remind, per kind of deadline. 0 turns a kind off. */
export type ReminderSettings = Record<Kind, number>;

export const DEFAULT_REMINDERS: ReminderSettings = { assignment: 24, quiz: 24, discussion: 24, test: 72, event: 0 };

export const REMINDER_CHOICES = [
  { hours: 0, label: "Off" },
  { hours: 168, label: "7 days before" },
  { hours: 72, label: "3 days before" },
  { hours: 24, label: "1 day before" },
  { hours: 12, label: "12 hours before" },
  { hours: 3, label: "3 hours before" },
];

export const GROUP_NAMES = ["Overdue", "Today", "This week", "Next week", "Later"] as const;
export type GroupName = (typeof GROUP_NAMES)[number];

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** A test or event shows at its start; everything else at its due time. */
export const shownAt = (d: PanelDeadline) => (d.kind === "test" || d.kind === "event" ? (d.start ?? d.due) : d.due);

/** Overdue, Today, This week (to Sunday), Next week, Later. */
export function groupOf(d: PanelDeadline, now: Date): GroupName {
  const when = shownAt(d);
  if (when.getTime() < now.getTime()) return SUBMITTABLE.includes(d.kind) ? "Overdue" : "Today";
  const today = startOfDay(now);
  const day = startOfDay(when);
  const endOfWeek = today + ((7 - now.getDay()) % 7) * DAY;
  if (day === today) return "Today";
  if (day <= endOfWeek) return "This week";
  if (day <= endOfWeek + 7 * DAY) return "Next week";
  return "Later";
}

export interface Sections {
  /** Assignments, quizzes, discussions and tests, grouped Overdue → Later. */
  work: [GroupName, PanelDeadline[]][];
  /** Office hours, readings and other events in the next 7 days. */
  events: PanelDeadline[];
  /** Items from sites that aren't courses. */
  other: PanelDeadline[];
  /** Work ticked off or submitted on OWL. */
  finished: PanelDeadline[];
  dueThisWeek: number;
  overdue: number;
}

/** Split deadlines into what the panel shows, so real work isn't buried under office hours. */
export function sections(items: PanelDeadline[], done: Set<string>, now: Date): Sections {
  const isDone = (d: PanelDeadline) => done.has(d.id) || d.submitted === true;
  const fromCourses = items.filter((d) => d.course);
  const work = fromCourses
    .filter((d) => d.kind !== "event" && !isDone(d) && (SUBMITTABLE.includes(d.kind) || d.due.getTime() >= now.getTime()))
    .sort((a, b) => shownAt(a).getTime() - shownAt(b).getTime());
  const groups = GROUP_NAMES.map((name) => [name, work.filter((d) => groupOf(d, now) === name)] as [GroupName, PanelDeadline[]]).filter(
    ([, list]) => list.length,
  );
  const count = (...names: GroupName[]) => groups.filter(([n]) => names.includes(n)).reduce((t, [, list]) => t + list.length, 0);
  return {
    work: groups,
    events: fromCourses.filter((d) => d.kind === "event" && d.due.getTime() >= now.getTime() && shownAt(d).getTime() < now.getTime() + 7 * DAY),
    other: items.filter((d) => !d.course && !isDone(d)),
    finished: items.filter((d) => SUBMITTABLE.includes(d.kind) && isDone(d)),
    dueThisWeek: count("Today", "This week"),
    overdue: count("Overdue"),
  };
}

/** A steady colour per course, so a course looks the same in the list and the week strip. */
const COURSE_COLORS = ["#4b2e83", "#b5622c", "#3d7d63", "#2f6fa3", "#a33d5c", "#7a6a2f"];
export function courseColor(course: string | null): string {
  if (!course) return "#9b98a8";
  let hash = 0;
  for (const ch of course) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COURSE_COLORS[hash % COURSE_COLORS.length];
}

export type BadgeTone = "late" | "today" | "soon" | "test";

/** The badge beside an item: "1d late", "Today", "Tomorrow", "in 3 days". Tests get their own colour. */
export function dueBadge(d: PanelDeadline, now: Date): { text: string; tone: BadgeTone } {
  const when = shownAt(d);
  const days = Math.round((startOfDay(when) - startOfDay(now)) / DAY);
  if (when.getTime() < now.getTime() && SUBMITTABLE.includes(d.kind)) return { text: `${Math.max(1, -days)}d late`, tone: "late" };
  const tone = d.kind === "test" ? "test" : days <= 0 ? "today" : "soon";
  return { text: days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `in ${days} days`, tone };
}

const timeFormat = new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit" });
const weekdayFormat = new Intl.DateTimeFormat("en-CA", { weekday: "short" });
const dayFormat = new Intl.DateTimeFormat("en-CA", { weekday: "short", month: "short", day: "numeric" });
const longDayFormat = new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric" });

/** "11:59 p.m." today, "Thu 11:59 p.m." within a week, "Mon, Nov 16 11:59 p.m." further out. */
export function formatDue(d: PanelDeadline, now: Date): string {
  const when = shownAt(d);
  const days = Math.round((startOfDay(when) - startOfDay(now)) / DAY);
  if (days === 0) return timeFormat.format(when);
  return `${Math.abs(days) < 7 ? weekdayFormat.format(when) : dayFormat.format(when)} ${timeFormat.format(when)}`;
}
export const formatDay = (date: Date) => dayFormat.format(date);
export const formatDateTime = (date: Date) => `${dayFormat.format(date)} · ${timeFormat.format(date)}`;
export const sameDay = (a: Date, b: Date) => startOfDay(a) === startOfDay(b);
export const formatToday = (date: Date) => longDayFormat.format(date);

export interface WeekDay {
  label: string;
  day: number;
  today: boolean;
  /** One dot per course with work due that day. */
  colors: string[];
}

/** Monday to Sunday of this week, with a dot for each course that has work due. */
export function weekStrip(items: PanelDeadline[], done: Set<string>, now: Date): WeekDay[] {
  const mondayOffset = (now.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset + i);
    const due = items.filter(
      (d) => d.course && d.kind !== "event" && !done.has(d.id) && !d.submitted && startOfDay(shownAt(d)) === date.getTime(),
    );
    return {
      label: weekdayFormat.format(date).replace(".", "").toUpperCase(),
      day: date.getDate(),
      today: date.getTime() === startOfDay(now),
      colors: [...new Set(due.map((d) => courseColor(d.course)))].slice(0, 3),
    };
  });
}

const icsDate =(d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/[;,]/g, (c) => `\\${c}`);

/** A calendar file of upcoming deadlines, importable into Google, Apple and Outlook calendars. */
export function toIcs(items: PanelDeadline[], now: Date): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OWLnow//Deadlines//EN", "X-WR-CALNAME:OWLnow deadlines"];
  for (const d of items.filter((x) => x.kind !== "event" && x.due.getTime() >= now.getTime()))
    lines.push(
      "BEGIN:VEVENT",
      `UID:${d.id}@owlnow`,
      `DTSTAMP:${icsDate(now)}`,
      `DTSTART:${icsDate(d.start ?? d.due)}`,
      `DTEND:${icsDate(d.due)}`,
      `SUMMARY:${icsText(`${d.course ?? d.site}: ${d.title}`)}`,
      `URL:${d.url}`,
      "END:VEVENT",
    );
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
