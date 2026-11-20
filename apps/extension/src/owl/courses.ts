// Reads the student's courses from OWL (Brightspace) using their own signed-in session.
// GET requests only: the browser attaches the OWL login cookies, nothing is stored but the result.

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
  | { ok: false; reason: "signed-out" | "error"; detail: string };

const OWL = "https://westernu.brightspace.com";
const ENROLLMENTS = `${OWL}/d2l/api/lp/1.47/enrollments/myenrollments/`;
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
  const m = e.OrgUnit.Name.match(COURSE_NAME);
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
export function coursesFrom(items: Enrollment[], now: Date): { courses: OwlCourse[]; skipped: string[] } {
  const courses = new Map<string, OwlCourse>();
  const skipped: string[] = [];
  for (const item of items) {
    const course = parseEnrollment(item, now);
    if (!course) skipped.push(item.OrgUnit.Name);
    // A lab or tutorial site for the same course is the same course.
    else courses.set(`${course.key}|${course.year}`, course);
  }
  return { courses: [...courses.values()], skipped };
}

/** Reads every page of the student's enrollments, past and current, and returns their courses. */
export async function readCourses(get: typeof fetch = fetch, now = new Date()): Promise<ReadResult> {
  const items: Enrollment[] = [];
  let bookmark: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(ENROLLMENTS);
    url.searchParams.set("orgUnitTypeId", COURSE_OFFERING);
    if (bookmark) url.searchParams.set("bookmark", bookmark);

    let res: Response;
    try {
      res = await get(url, { method: "GET", credentials: "include", headers: { Accept: "application/json" } });
    } catch (err) {
      return { ok: false, reason: "error", detail: `Couldn't reach OWL: ${String(err)}` };
    }
    // Signed out, OWL answers with an error or sends us to its login page (HTML, not JSON).
    if (res.status === 401 || res.status === 403) return { ok: false, reason: "signed-out", detail: `OWL answered ${res.status}` };
    if (!res.ok) return { ok: false, reason: "error", detail: `OWL answered ${res.status}` };
    if (!res.headers.get("content-type")?.includes("application/json")) {
      return { ok: false, reason: "signed-out", detail: "OWL sent a page instead of data" };
    }

    const data = (await res.json()) as EnrollmentPage;
    items.push(...data.Items);
    if (!data.PagingInfo.HasMoreItems) return { ok: true, ...coursesFrom(items, now) };
    if (!data.PagingInfo.Bookmark || data.PagingInfo.Bookmark === bookmark) {
      return { ok: false, reason: "error", detail: "OWL said there was more but gave no next page" };
    }
    bookmark = data.PagingInfo.Bookmark;
  }
  return { ok: false, reason: "error", detail: `Stopped after ${MAX_PAGES} pages` };
}
