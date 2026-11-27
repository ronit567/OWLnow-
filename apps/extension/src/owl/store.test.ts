import { describe, expect, it } from "vitest";
import type { PanelDeadline } from "@owlnow/deadlines";
import type { OwlCourse, ReadResult } from "./courses";
import {
  COURSES_KEY,
  byYear,
  courseLabel,
  fromStored,
  loadCourses,
  loadDeadlines,
  readStatus,
  refreshCourses,
  refreshOwl,
  toStored,
  type SavedCourses,
  type Storage,
} from "./store";

/** An in-memory stand-in for chrome.storage.local. */
function memoryStorage(): Storage & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: async (key) => (key in data ? { [key]: data[key] } : {}),
    set: async (items) => void Object.assign(data, items),
  };
}

const MATH: OwlCourse = {
  key: "MATH 1600",
  code: "MATH 1600B",
  year: "2025–26",
  status: "past",
};
const ok =
  (courses: OwlCourse[]): (() => Promise<ReadResult>) =>
  async () => ({ ok: true, courses, skipped: ["Launch Online"] });
const signedOut = async (): Promise<ReadResult> => ({
  ok: false,
  reason: "signed-out",
  detail: "OWL answered 401",
});

describe("refreshCourses", () => {
  it("saves the courses and when they were read", async () => {
    const storage = memoryStorage();
    await refreshCourses(storage, ok([MATH]), new Date("2026-11-20T12:00:00Z"));
    expect(await loadCourses(storage)).toEqual({
      courses: [MATH],
      readAt: "2026-11-20T12:00:00.000Z",
      skipped: ["Launch Online"],
      last: { at: "2026-11-20T12:00:00.000Z", ok: true },
    });
  });

  it("keeps the last list when a later read fails", async () => {
    const storage = memoryStorage();
    await refreshCourses(storage, ok([MATH]), new Date("2026-11-20T12:00:00Z"));
    const saved = await refreshCourses(
      storage,
      signedOut,
      new Date("2026-11-21T12:00:00Z"),
    );
    expect(saved.courses).toEqual([MATH]);
    expect(saved.readAt).toBe("2026-11-20T12:00:00.000Z");
    expect(saved.last).toEqual({
      at: "2026-11-21T12:00:00.000Z",
      ok: false,
      reason: "signed-out",
      detail: "OWL answered 401",
    });
  });

  it("saves an empty list when the very first read fails", async () => {
    const storage = memoryStorage();
    const saved = await refreshCourses(
      storage,
      signedOut,
      new Date("2026-11-20T12:00:00Z"),
    );
    expect(saved).toMatchObject({
      courses: [],
      readAt: null,
      last: { ok: false, reason: "signed-out" },
    });
    expect(storage.data[COURSES_KEY]).toEqual(saved);
  });
});

describe("readStatus", () => {
  const readAt = "2026-11-20T12:00:00.000Z";
  const good: SavedCourses = {
    courses: [MATH],
    readAt,
    skipped: [],
    last: { at: readAt, ok: true },
  };
  const after = (minutes: number) =>
    new Date(Date.parse(readAt) + minutes * 60_000);

  it("says nothing has been read before the first read", () => {
    expect(readStatus(null, after(0))).toEqual({
      text: "Not read yet",
      live: false,
      signedOut: false,
    });
  });

  it("says how long ago the last good read was", () => {
    expect(readStatus(good, after(0.5))).toEqual({
      text: "Read just now",
      live: true,
      signedOut: false,
    });
    expect(readStatus(good, after(5)).text).toBe("Read 5 min ago");
    expect(readStatus(good, after(150)).text).toBe("Read 2 h ago");
    expect(readStatus(good, after(3 * 24 * 60)).text).toMatch(
      /^Read on Nov 20/,
    );
  });

  it("keeps the last read time but shows the banner once signed out", () => {
    const out: SavedCourses = {
      ...good,
      last: {
        at: readAt,
        ok: false,
        reason: "signed-out",
        detail: "OWL answered 401",
      },
    };
    expect(readStatus(out, after(5))).toEqual({
      text: "Read 5 min ago",
      live: false,
      signedOut: true,
    });
  });

  it("says the read failed for any other error", () => {
    const failed: SavedCourses = {
      ...good,
      last: {
        at: readAt,
        ok: false,
        reason: "error",
        detail: "OWL answered 500",
      },
    };
    expect(readStatus(failed, after(5))).toEqual({
      text: "Couldn't read OWL",
      live: false,
      signedOut: false,
    });
  });
});

describe("byYear", () => {
  it("lists the newest school year first, then by code", () => {
    const course = (code: string, year: string): OwlCourse => ({
      key: code.slice(0, -1),
      code,
      year,
      status: "past",
    });
    const sorted = byYear([
      course("MATH 1600B", "2025–26"),
      course("COMPSCI 2214A", "2026–27"),
      course("COMPSCI 1027B", "2025–26"),
    ]);
    expect(sorted.map((c) => c.code)).toEqual([
      "COMPSCI 2214A",
      "COMPSCI 1027B",
      "MATH 1600B",
    ]);
  });
});

describe("courseLabel", () => {
  const course = (year: string, status: OwlCourse["status"]): OwlCourse => ({
    key: "MATH 1600",
    code: "MATH 1600B",
    year,
    status,
  });

  it("calls finished courses taken", () => {
    expect(courseLabel(course("2025–26", "past"), new Date(2026, 10, 20))).toBe(
      "Taken",
    );
  });

  it("calls this school year's courses taking now, summer included", () => {
    expect(
      courseLabel(course("2026–27", "current"), new Date(2026, 10, 20)),
    ).toBe("Taking now");
    expect(
      courseLabel(course("2025–26", "current"), new Date(2026, 6, 15)),
    ).toBe("Taking now");
  });

  it("calls next year's courses upcoming until September", () => {
    expect(
      courseLabel(course("2026–27", "current"), new Date(2026, 7, 31)),
    ).toBe("Upcoming");
    expect(
      courseLabel(course("2026–27", "current"), new Date(2026, 8, 1)),
    ).toBe("Taking now");
  });
});

describe("refreshOwl", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  const NOW = new Date("2026-11-20T12:00:00Z");
  const enrollments = {
    PagingInfo: { Bookmark: null, HasMoreItems: false },
    Items: [
      { OrgUnit: { Id: 10, Name: "MATH 1600B 001 LEC FW25: LINEAR ALGEBRA I", Code: null } },
      { OrgUnit: { Id: 20, Name: "COMPSCI 2210A 001 LEC FW26: DATA STRUCTURES", Code: null } },
      { OrgUnit: { Id: 30, Name: "Mustangs for Consent", Code: null } },
    ],
  };
  /** OWL with one current course holding one handed-in assignment. */
  function owl(over: Record<string, () => Response> = {}) {
    const routes: Record<string, () => Response> = {
      "/d2l/api/versions/": () =>
        json([
          { ProductCode: "lp", LatestVersion: "1.50" },
          { ProductCode: "le", LatestVersion: "1.80" },
        ]),
      "/d2l/api/lp/1.50/enrollments/myenrollments/": () => json(enrollments),
      "/d2l/api/le/1.80/20/dropbox/folders/": () =>
        json([{ Id: 1, Name: "Lab 1", DueDate: "2026-11-27T04:59:00.000Z", Availability: null }]),
      "/d2l/api/le/1.80/20/dropbox/folders/1/submissions/mysubmissions/": () =>
        json([{ Submissions: [{ Id: 1 }] }]),
      ...over,
    };
    const paths: string[] = [];
    const get = (async (input: URL) => {
      const { pathname } = new URL(input);
      paths.push(pathname);
      const route = routes[pathname];
      if (!route) throw new Error(`unexpected request to ${pathname}`);
      return route();
    }) as typeof fetch;
    return { get, paths };
  }

  it("reads the courses and the current courses' assignments in one pass, with the versions OWL reports", async () => {
    const storage = memoryStorage();
    const fake = owl();
    const saved = await refreshOwl(storage, fake.get, NOW);
    expect(saved.courses.courses.map((c) => c.code)).toEqual(["MATH 1600B", "COMPSCI 2210A"]);
    expect(saved.deadlines).toEqual({
      deadlines: [
        {
          id: "owl:20:assignment:1",
          title: "Lab 1",
          course: "COMPSCI 2210A",
          site: "COMPSCI 2210A 001 LEC FW26: DATA STRUCTURES",
          kind: "assignment",
          due: "2026-11-27T04:59:00.000Z",
          url: "https://westernu.brightspace.com/d2l/lms/dropbox/user/folder_submit_files.d2l?db=1&ou=20",
          submitted: true,
        },
      ],
      readAt: "2026-11-20T12:00:00.000Z",
      skipped: [],
      last: { at: "2026-11-20T12:00:00.000Z", ok: true },
    });
    // Enrollments are read once; past courses and other sites aren't asked for assignments.
    expect(fake.paths.filter((p) => p.includes("myenrollments"))).toHaveLength(1);
    expect(fake.paths.some((p) => p.includes("/10/") || p.includes("/30/"))).toBe(false);
    expect(await loadDeadlines(storage)).toEqual(saved.deadlines);
  });

  it("keeps the last deadlines and marks both lists signed out when OWL logs the student out", async () => {
    const storage = memoryStorage();
    await refreshOwl(storage, owl().get, NOW);
    const later = new Date("2026-11-21T12:00:00Z");
    const saved = await refreshOwl(storage, owl({ "/d2l/api/versions/": () => json({}, 401) }).get, later);
    expect(saved.deadlines.deadlines).toHaveLength(1);
    expect(saved.deadlines.readAt).toBe("2026-11-20T12:00:00.000Z");
    expect(saved.deadlines.last).toMatchObject({ ok: false, reason: "signed-out" });
    expect(saved.courses.last).toMatchObject({ ok: false, reason: "signed-out" });
  });
});

describe("toStored and fromStored", () => {
  it("round-trip a deadline's dates through JSON", () => {
    const d: PanelDeadline = {
      id: "x",
      title: "Midterm",
      course: "MATH 1600B",
      site: "MATH",
      kind: "test",
      due: new Date("2026-11-27T04:59:00.000Z"),
      start: new Date("2026-11-27T02:59:00.000Z"),
      url: "https://westernu.brightspace.com/",
    };
    const back = fromStored(JSON.parse(JSON.stringify(toStored([d]))));
    expect(back).toEqual([d]);
  });
});
