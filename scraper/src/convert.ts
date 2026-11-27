// Turns calendar courses into the website's Course shape (apps/web/src/data/library.ts).
import type { Course } from "../../apps/web/src/data/library.ts";
import type { CalendarCourse, Subject } from "./pages.ts";
import { parsePrereq, parseAntireqs } from "./prereqs.ts";

/** "1027A/B" → number "1027", suffix "A/B". */
export function splitNumber(number: string): { digits: string; suffix: string } {
  const m = number.match(/^(\d{4})(.*)$/);
  return { digits: m?.[1] ?? number, suffix: m?.[2] ?? "" };
}

// Essay courses carry E (full), F, G or Z (half), as in the calendar's suffix table.
export const isEssay = (suffix: string) => /[EFGZ]/.test(suffix);
// No suffix, E or Y is a full course; every other suffix is a half course.
const weightFromSuffix = (suffix: string) => (suffix === "" || suffix === "E" || suffix === "Y" ? 1 : 0.5);

/**
 * Course codes in antirequisite text: "Computer Science 1025A/B, 1026A/B" → COMPSCI 1025, COMPSCI 1026.
 * A bare number takes the last subject named before it.
 */
/** Extract explicitly listed antirequisite course codes. */
export function antireqKeys(
  text: string,
  subjects: Subject[]
): string[] {
  return parseAntireqs(text, subjects);
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
    prereq: parsePrereq(c.prereqText, subjects),
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
