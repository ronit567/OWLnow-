// The shapes the planner works with, and where its data will come from. Courses and modules are
// empty until the library files (built from the calendar scrape) are loaded.

export type Category = "A" | "B" | "C";

export type Rule =
  | { all: Rule[] }
  | { any: Rule[] }
  | { course: string; minMark?: number }
  | { credits: number; from: string[]; minMark?: number }
  | { check: string };

export interface Course {
  /** "COMPSCI 1027", without the suffix. */
  key: string;
  /** "A/B", "F/G", "E" or "". */
  suffix: string;
  title: string;
  weight: number;
  category: Category | null;
  essay: boolean;
  campus: "Main" | "Huron" | "King's";
  prereqText: string;
  prereq: Rule | null;
  /** The calendar's antirequisite wording, as written. */
  antireqText: string;
  antireqs: string[];
  offeredNextYear: boolean;
  /** Terms a half course runs in next year. */
  terms: ("F" | "W")[];
}

export interface Requirement {
  text: string;
  credits: number;
  /** Courses that count, or a subject and minimum level. */
  from?: string[];
  subject?: string;
  minLevel?: number;
  /** A rule that can't be checked automatically, such as a minimum mark. */
  check?: boolean;
}

export interface Module {
  /** The calendar's ModuleID, e.g. "21580". */
  id: string;
  /** "HONOURS SPECIALIZATION IN ACCOUNTING". Names can repeat, so use the id to tell modules apart. */
  name: string;
  /** "Honours Specialization", "Major", "Minor", "Certificate" and so on. */
  type: string;
  area: string;
  faculty: string;
  department: string;
  /** The module's page on the calendar. */
  url: string;
  /** The calendar's wording, one line each, split by part. Empty when the page has no such part. */
  admission: string[];
  /** The courses the module needs, e.g. "1.0 course from: Computer Science 1027A/B, 1037A/B". */
  courses: string[];
  progression: string[];
  graduation: string[];
  /** Wording that fits no part, under its heading. Combined degrees and certificates keep their main text here. */
  other: { heading: string; lines: string[] }[];
  /** Null until the module has been converted to checks and signed off. */
  requirements: Requirement[] | null;
}

/** Every course in the calendar. Filled from scraper/data/courses.json. */
export const COURSES: Course[] = [];

/** Every module. Filled from scraper/data/modules.json. */
export const MODULES: Module[] = [];

export type CourseStatus = "past" | "current";

/** A course from OWL. OWL names give the school year (FW25 = 2025–26), not the term. */
export interface StudentCourse {
  key: string;
  code: string;
  /** School year, e.g. "2025–26". */
  year: string;
  status: CourseStatus;
}

export type DegreeType = "Honours" | "4-year" | "3-year";

export interface DegreeRule {
  total: number;
  firstYearMax: number;
  senior: number;
  breadthEach: number;
  essay: number;
  essaySenior: number;
}

/** To check against the calendar's degree requirements page before launch. */
export const DEGREE_RULES: Record<DegreeType, DegreeRule> = {
  Honours: { total: 20, firstYearMax: 7, senior: 13, breadthEach: 1, essay: 2, essaySenior: 1 },
  "4-year": { total: 20, firstYearMax: 7, senior: 10, breadthEach: 1, essay: 2, essaySenior: 1 },
  "3-year": { total: 15, firstYearMax: 7, senior: 8, breadthEach: 1, essay: 2, essaySenior: 1 },
};

export const EDITION = { year: "2026", updated: "2026-10-16" };

// School years run September to April, so they're worked out from today's date.
const today = new Date();
const startYear = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
const schoolYear = (start: number) => `${start}–${String(start + 1).slice(2)}`;

export const THIS_YEAR = schoolYear(startYear);
export const NEXT_YEAR = schoolYear(startYear + 1);
/** Recent school years a student can type a course into. */
export const RECENT_YEARS = [3, 2, 1, 0].map((back) => schoolYear(startYear - back));

/** Next year's terms: Fall, Winter, or the full year for 1.0 courses. */
export type Semester = "F" | "W" | "FW";

export interface Pick {
  key: string;
  term: Semester;
}

export const NEXT_TERMS: Record<Semester, string> = { F: `Fall ${startYear + 1}`, W: `Winter ${startYear + 2}`, FW: "Full year" };
/** A normal full term; a term above this gets a warning. */
export const FULL_TERM = 2.5;
