// Reads the assignments (Brightspace calls them dropbox folders) in the student's current courses,
// and whether each has been handed in. GET requests only, with the student's own cookies.
import type { PanelDeadline } from "@owlnow/deadlines";
import { parseEnrollment, type Enrollment } from "./courses";
import { OWL, getJson, type Failure } from "./http";

/** How many API calls run at once, so a read doesn't flood OWL. */
const PARALLEL = 4;

export type AssignmentsResult =
  | { ok: true; deadlines: PanelDeadline[]; skipped: string[] }
  | Failure;

/** The parts of a Brightspace dropbox folder we use. */
export interface DropboxFolder {
  Id: number;
  Name: string;
  DueDate: string | null;
  IsHidden?: boolean;
  Availability?: { StartDate: string | null; EndDate: string | null } | null;
}

/** A course site whose assignments are read: OWL's id, its name, and the code it parses to. */
export interface CourseSite {
  id: number;
  name: string;
  code: string;
}

/** The current courses among the enrollments. A lab with its own site is read as its own site. */
export function currentSites(items: Enrollment[], now: Date): CourseSite[] {
  return items.flatMap((e) => {
    const course = parseEnrollment(e, now);
    return course?.status === "current" ? [{ id: e.OrgUnit.Id, name: e.OrgUnit.Name, code: course.code }] : [];
  });
}

/** When the folder is due: its due date, or the end date when it has none. Null when it has neither. */
export function dueOf(folder: DropboxFolder): Date | null {
  const when = folder.DueDate ?? folder.Availability?.EndDate ?? null;
  const date = when ? new Date(when) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/**
 * Whether mysubmissions shows anything handed in. OWL answers with one entry per submitter (just
 * the student), holding their uploaded Submissions and, for assignments handed in on paper or
 * observed in person, a CompletionDate once marked complete. A grade alone doesn't count: OWL
 * grades missed work too (see fixtures/mysubmissions-graded-unsubmitted.json).
 */
export function hasSubmitted(mine: unknown): boolean {
  if (!Array.isArray(mine)) return false;
  return mine.some((s) => {
    const entry = s as { Submissions?: unknown; CompletionDate?: unknown } | null;
    if (!entry) return false;
    if (entry.CompletionDate) return true;
    return Array.isArray(entry.Submissions) && entry.Submissions.length > 0;
  });
}

/**
 * A 403 inside one course, after the enrollments read worked, means that course doesn't let the
 * student into its assignments, not that they're signed out.
 */
const isSignedOut = (f: Failure) => f.reason === "signed-out" && f.status !== 403;

/** Reads the assignments in one course site. Hidden and undated folders are left out. */
async function siteAssignments(
  get: typeof fetch,
  le: string,
  site: CourseSite,
): Promise<{ ok: true; deadlines: PanelDeadline[] } | Failure> {
  const base = `/d2l/api/le/${le}/${site.id}/dropbox/folders/`;
  const got = await getJson<DropboxFolder[]>(get, base);
  if (!got.ok) return got;
  if (!Array.isArray(got.data))
    return { ok: false, reason: "error", detail: `OWL's answer for ${site.name} wasn't a list of assignments` };

  const dated = got.data.flatMap((f) => {
    const due = f && !f.IsHidden ? dueOf(f) : null;
    return due ? [{ f, due }] : [];
  });

  const checked = await pool(dated, PARALLEL, async ({ f, due }) => {
    const mine = await getJson<unknown>(get, `${base}${f.Id}/submissions/mysubmissions/`);
    const deadline: PanelDeadline = {
      id: `owl:${site.id}:assignment:${f.Id}`,
      title: f.Name,
      course: site.code,
      site: site.name,
      kind: "assignment",
      due,
      url: `${OWL}/d2l/lms/dropbox/user/folder_submit_files.d2l?db=${f.Id}&ou=${site.id}`,
      // When OWL won't say, it's left unknown rather than called not submitted.
      ...(mine.ok && { submitted: hasSubmitted(mine.data) }),
    };
    return { deadline, signedOut: !mine.ok && isSignedOut(mine) ? mine : null };
  });
  const signedOut = checked.find((c) => c.signedOut)?.signedOut;
  return signedOut ?? { ok: true, deadlines: checked.map((c) => c.deadline) };
}

/**
 * Reads the assignments in every site. A site OWL won't answer for is skipped and named in
 * `skipped`, so one course with its assignments turned off doesn't hide the rest. Being signed
 * out fails the whole read.
 */
export async function readAssignments(
  get: typeof fetch,
  le: string,
  sites: CourseSite[],
): Promise<AssignmentsResult> {
  const results = await pool(sites, PARALLEL, (site) => siteAssignments(get, le, site));
  const deadlines: PanelDeadline[] = [];
  const skipped: string[] = [];
  for (const [i, r] of results.entries()) {
    if (r.ok) deadlines.push(...r.deadlines);
    else if (isSignedOut(r)) return r;
    else skipped.push(`${sites[i].name}: ${r.detail}`);
  }
  return { ok: true, deadlines, skipped };
}

/** Runs fn over items with at most `limit` in flight, keeping the input order. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
