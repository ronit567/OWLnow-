// Keeps the student's course list in the extension's storage, so the panel (and later the
// website bridge) can show it without asking OWL every time.
import { readCourses, type OwlCourse, type ReadResult } from "./courses";

export const COURSES_KEY = "owlCourses";
/** The message the side panel sends to ask for a fresh read. */
export const READ_COURSES = "owl:read-courses";
/** The alarm that reads OWL in the background, and how often it rings. */
export const READ_ALARM = "owl:read";
export const READ_EVERY_MINUTES = 30;

export interface SavedCourses {
  /** The last list read successfully. Kept when a later read fails, so the panel can still show it. */
  courses: OwlCourse[];
  /** When `courses` was read, as an ISO date, or null if it never has been. */
  readAt: string | null;
  /** Site names that weren't recognised as courses, for spotting a name format we don't read yet. */
  skipped: string[];
  /** How the most recent attempt went. */
  last:
    | { at: string; ok: true }
    | { at: string; ok: false; reason: "signed-out" | "error"; detail: string };
}

/** The part of chrome.storage.local this needs, so tests can pass a stand-in. */
export interface Storage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export async function loadCourses(
  storage: Storage,
): Promise<SavedCourses | null> {
  const saved = await storage.get(COURSES_KEY);
  return (saved[COURSES_KEY] as SavedCourses | undefined) ?? null;
}

/** What the panel's read button says, whether its dot is green, and whether to show the signed-out banner. */
export function readStatus(
  saved: SavedCourses | null,
  now: Date,
): { text: string; live: boolean; signedOut: boolean } {
  if (!saved) return { text: "Not read yet", live: false, signedOut: false };
  const signedOut = !saved.last.ok && saved.last.reason === "signed-out";
  if (!saved.last.ok && !signedOut)
    return { text: "Couldn't read OWL", live: false, signedOut };
  if (!saved.readAt) return { text: "Not read yet", live: false, signedOut };
  const minutes = Math.floor(
    (now.getTime() - new Date(saved.readAt).getTime()) / 60_000,
  );
  const ago =
    minutes < 1
      ? "just now"
      : minutes < 60
        ? `${minutes} min ago`
        : minutes < 24 * 60
          ? `${Math.floor(minutes / 60)} h ago`
          : `on ${new Date(saved.readAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`;
  return { text: `Read ${ago}`, live: saved.last.ok, signedOut };
}

/** How the panel describes a course: done, this school year, or registered for a later one. */
export function courseLabel(
  course: OwlCourse,
  now: Date,
): "Taken" | "Taking now" | "Upcoming" {
  if (course.status === "past") return "Taken";
  // The school year runs September to August.
  const thisYear =
    now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return Number(course.year.slice(0, 4)) > thisYear ? "Upcoming" : "Taking now";
}

/** Courses newest school year first, then by code. */
export function byYear(courses: OwlCourse[]): OwlCourse[] {
  return [...courses].sort(
    (a, b) => b.year.localeCompare(a.year) || a.code.localeCompare(b.code),
  );
}

/** Reads OWL and saves the outcome. A failed read keeps the previous list. */
export async function refreshCourses(
  storage: Storage,
  read: () => Promise<ReadResult> = () => readCourses(),
  now = new Date(),
): Promise<SavedCourses> {
  const result = await read();
  const at = now.toISOString();
  const previous = await loadCourses(storage);
  const saved: SavedCourses = result.ok
    ? {
        courses: result.courses,
        readAt: at,
        skipped: result.skipped,
        last: { at, ok: true },
      }
    : {
        courses: previous?.courses ?? [],
        readAt: previous?.readAt ?? null,
        skipped: previous?.skipped ?? [],
        last: { at, ok: false, reason: result.reason, detail: result.detail },
      };
  await storage.set({ [COURSES_KEY]: saved });
  return saved;
}
