// Turns calendar courses into the website's Course shape (apps/web/src/data/library.ts).
import type { Course } from "../../apps/web/src/data/library.ts";
import type { CalendarCourse, Subject } from "./pages.ts";

/** "1027A/B" → number "1027", suffix "A/B". */
export function splitNumber(number: string): { digits: string; suffix: string } {
  const m = number.match(/^(\d{4})(.*)$/);
  return { digits: m?.[1] ?? number, suffix: m?.[2] ?? "" };
}

// Essay courses carry E (full), F or G (half). Check against the calendar's suffix table.
const isEssay = (suffix: string) => /[EFG]/.test(suffix);
// No suffix, E or Y is a full course; every other suffix is a half course.
const weightFromSuffix = (suffix: string) => (suffix === "" || suffix === "E" || suffix === "Y" ? 1 : 0.5);

/**
 * Course codes in antirequisite text: "Computer Science 1025A/B, 1026A/B" → COMPSCI 1025, COMPSCI 1026.
 * A bare number takes the last subject named before it.
 */
export function antireqKeys(text: string, subjects: Subject[]): string[] {
  if (!text) return [];
  const byName = new Map(subjects.map((s) => [s.name.toLowerCase(), s.code]));
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(?:(${names.join("|")})\\s+)?(\\d{4})`, "gi");
  const keys: string[] = [];
  let subject: string | null = null;
  for (const m of text.matchAll(re)) {
    if (m[1]) subject = byName.get(m[1].toLowerCase()) ?? null;
    if (!subject) continue;
    const key = `${subject} ${m[2]}`;
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

export function toCourse(c: CalendarCourse, subjects: Subject[]): Course {
  const { digits, suffix } = splitNumber(c.number);
  const key = `${c.subject} ${digits}`;
  return {
    key,
    suffix,
    title: c.title,
    weight: c.weight ?? weightFromSuffix(suffix),
    category: c.category || null,
    essay: isEssay(suffix),
    campus: c.campus,
    prereqText: c.prereqText,
    prereq: null,
    antireqText: c.antireqText,
    antireqs: antireqKeys(c.antireqText, subjects).filter((k) => k !== key),
    offeredNextYear: true,
    terms: [],
  };
}

/** One Course per code, preferring the Main campus listing when affiliates list it too. */
export function toCourses(all: CalendarCourse[], subjects: Subject[]): Course[] {
  const rank = (c: CalendarCourse) => (c.campus === "Main" ? 0 : 1);
  const out = new Map<string, Course>();
  for (const c of [...all].sort((a, b) => rank(a) - rank(b))) {
    const course = toCourse(c, subjects);
    if (!out.has(course.key)) out.set(course.key, course);
  }
  return [...out.values()].sort((a, b) => a.key.localeCompare(b.key));
}
