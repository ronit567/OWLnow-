// Turns calendar courses and modules into the website's Course and Module shapes (apps/web/src/data/library.ts).
import type { Course, Module } from "../../apps/web/src/data/library.ts";
import type { CalendarCourse, ModuleLink, PageText, Subject } from "./pages.ts";

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

type Part = "admission" | "courses" | "progression" | "graduation";

/** Which part of a module a heading starts, or null if it fits none. */
function partOf(heading: string): Part | null {
  if (/progression|failure to meet/i.test(heading)) return "progression";
  if (/graduation/i.test(heading)) return "graduation";
  if (/admission/i.test(heading)) return "admission";
  if (/^module( requirements)?[:.]?$/i.test(heading)) return "courses";
  return null;
}

/** A line that only names the part after it, like "Module" before the course list. */
const MARKER = /^(module|(admission|progression|graduation) requirements)[:.]?$/i;
/** A course list's opening line, like "6.0 courses:". */
const COURSE_TOTAL = /^\d+(\.\d+)?\s+courses?:$/i;
const MODULE_TYPES = ["Honours Specialization", "Specialization", "Major", "Minor"];
/** Headings that add nothing once the text is in its part's field. */
const PLAIN = /^(module|(admission|progression|graduation) requirements)$/i;

/**
 * Splits a module page into its parts. On most pages the admission rules and the course list share the
 * title's section, with a line reading "Module" between them. Text that fits no part goes in `other`
 * under its heading, so no wording is lost. A few majors and minors have no "Module" line, so their
 * course list starts at its total instead, like "6.0 courses:". Combined degrees, certificates and
 * non-modular programs have neither, so their main text stays in `other`.
 */
export function toModule(link: ModuleLink, page: PageText): Module {
  const name = page.sections[0]?.heading || link.name;
  let { faculty, department } = link;
  const mod: Module = { ...link, name, admission: [], courses: [], progression: [], graduation: [], other: [], requirements: null };
  const hasModuleLine = page.sections.some((s) => s.lines.some((l) => /^module[:.]?$/i.test(l)));
  const startsByTotal = !hasModuleLine && MODULE_TYPES.includes(link.type) && page.sections[0]?.lines.some((l) => COURSE_TOTAL.test(l));

  page.sections.forEach((section, i) => {
    const isTitle = i === 0 && section.heading === name;
    let lines = section.lines;
    // The page's first line names its own faculty and department, which beats the list's table cell.
    if (isTitle && lines[0]?.startsWith(`${faculty} - `)) [department, lines] = [lines[0].slice(faculty.length + 3), lines.slice(1)];
    else if (isTitle && lines[0] === department) lines = lines.slice(1);

    let part: Part | null = isTitle ? (hasModuleLine || startsByTotal ? "admission" : null) : partOf(section.heading);
    if (part && !isTitle && !PLAIN.test(section.heading)) mod[part].push(section.heading);
    let other: { heading: string; lines: string[] } | null = null;
    for (const line of lines) {
      if (MARKER.test(line)) {
        part = partOf(line);
        continue;
      }
      if (isTitle && startsByTotal && part === "admission" && COURSE_TOTAL.test(line)) part = "courses";
      if (part) mod[part].push(line);
      else {
        if (!other) mod.other.push((other = { heading: isTitle ? "" : section.heading, lines: [] }));
        other.lines.push(line);
      }
    }
  });
  return { ...mod, faculty, department };
}

/** The degree page without the policy menu above its content, which ends with the page's own title. */
export function toDegreeRequirements(page: PageText): PageText {
  const start = page.sections.map((s) => s.heading).lastIndexOf(page.title);
  return { title: page.title, sections: page.sections.slice(start + 1) };
}
