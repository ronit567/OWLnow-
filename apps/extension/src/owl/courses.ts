// Reads the student's courses from OWL (Brightspace) using their own signed-in session.
// GET requests only: the browser attaches the OWL login cookies, nothing is stored but the result.
import { OWL, getJson, type Failure } from "./http";

/** Same shape as StudentCourse in apps/web/src/data/library.ts, which the bridge hands over. */
export interface OwlCourse {
  /** "COMPSCI 1027", the catalogue key without the suffix. */
  key: string;
  /** "COMPSCI 1027B". */
  code: string;
  /** School year, e.g. "2025–26". */
  year: string;
  status: "past" | "current";
}

/** The parts of a Brightspace enrollment we use. */
export interface Enrollment {
  OrgUnit: { Id: number; Name: string; Code: string | null };
}

export interface EnrollmentPage {
  PagingInfo: { Bookmark: string | null; HasMoreItems: boolean };
  Items: Enrollment[];
}

export type ReadResult =
  | { ok: true; courses: OwlCourse[]; skipped: string[] }
  | Failure;

/** Used when nothing passes the version OWL reports. */
const DEFAULT_LP = "1.47";
/** Course offerings. OWL also files training and community sites under this type. */
const COURSE_OFFERING = "3";
/** A guard against a bookmark that never ends. Real accounts need one or two pages. */
const MAX_PAGES = 50;

// "MATH 1600B 001 LEC FW25: LINEAR ALGEBRA I" → subject, number, suffix, session, year.
// FW is fall/winter, SU is summer. Training and community sites ("Mustangs for Consent",
// "Science 3391 FW2026 - Yr 2 Entry") don't match.
const COURSE_NAME = /^([A-Z]{2,9}) (\d{4})([A-Z]?) \S+ [A-Z]+ (FW|SU)(\d{2}):/;

/** Turns one enrollment into a course, or null when it isn't a course site. */
export function parseEnrollment(e: Enrollment, now: Date): OwlCourse | null {
  const m = e.OrgUnit?.Name?.match(COURSE_NAME);
  if (!m) return null;
  const [, subject, number, suffix, session, yy] = m;
  // The school year runs September to August: FW25 starts it, and summer 2026 (SU26) ends it.
  const start = 2000 + Number(yy) - (session === "SU" ? 1 : 0);
  // Fall/winter ends with April exams and summer by the end of August, so courses are finished
  // from May 1 or September 1 after the school year starts.
  const finished = now >= new Date(start + 1, session === "SU" ? 8 : 4, 1);
  return {
    key: `${subject} ${number}`,
    code: `${subject} ${number}${suffix}`,
    year: `${start}–${String((start + 1) % 100).padStart(2, "0")}`,
    status: finished ? "past" : "current",
  };
}

/** Keeps the courses, drops other sites, and lists one entry per course per year. */
export function coursesFrom(
  items: Enrollment[],
  now: Date,
): { courses: OwlCourse[]; skipped: string[] } {
  const courses = new Map<string, OwlCourse>();
  const skipped: string[] = [];
  for (const item of items) {
    const course = parseEnrollment(item, now);
    if (!course) skipped.push(item.OrgUnit?.Name ?? "(a site with no name)");
    // A lab or tutorial site for the same course is the same course.
    else courses.set(`${course.key}|${course.year}`, course);
  }
  return { courses: [...courses.values()], skipped };
}

/** Reads every page of the student's enrollments, past and current. */
export async function readEnrollments(
  get: typeof fetch = fetch,
  lp = DEFAULT_LP,
): Promise<{ ok: true; items: Enrollment[] } | Failure> {
  const items: Enrollment[] = [];
  let bookmark: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`/d2l/api/lp/${lp}/enrollments/myenrollments/`, OWL);
    url.searchParams.set("orgUnitTypeId", COURSE_OFFERING);
    if (bookmark) url.searchParams.set("bookmark", bookmark);

    const got = await getJson<EnrollmentPage>(get, url);
    if (!got.ok) return got;
    const data = got.data;
    if (
      !Array.isArray(data?.Items) ||
      typeof data.PagingInfo?.HasMoreItems !== "boolean"
    ) {
      return {
        ok: false,
        reason: "error",
        detail: "OWL's answer wasn't a list of enrollments",
      };
    }
    items.push(...data.Items);
    if (!data.PagingInfo.HasMoreItems) return { ok: true, items };
    if (!data.PagingInfo.Bookmark || data.PagingInfo.Bookmark === bookmark) {
      return {
        ok: false,
        reason: "error",
        detail: "OWL said there was more but gave no next page",
      };
    }
    bookmark = data.PagingInfo.Bookmark;
  }
  return {
    ok: false,
    reason: "error",
    detail: `Stopped after ${MAX_PAGES} pages`,
  };
}

/** Reads every page of the student's enrollments, past and current, and returns their courses. */
export async function readCourses(
  get: typeof fetch = fetch,
  now = new Date(),
  lp = DEFAULT_LP,
): Promise<ReadResult> {
  const read = await readEnrollments(get, lp);
  return read.ok ? { ok: true, ...coursesFrom(read.items, now) } : read;
}
