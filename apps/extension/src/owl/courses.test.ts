import { describe, expect, it } from "vitest";
import {
  coursesFrom,
  parseEnrollment,
  readCourses,
  type Enrollment,
  type EnrollmentPage,
} from "./courses";
import sample from "./fixtures/myenrollments.json";

// A real myenrollments response (orgUnitTypeId=3), read on 2026-11-20.
const page = sample as EnrollmentPage;
const NOW = new Date(2026, 10, 20);
const site = (Name: string, Id = 1): Enrollment => ({
  OrgUnit: { Id, Name, Code: null },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

/** A stand-in for fetch that answers with each response in turn and records the URLs asked for. */
function fakeOwl(...responses: Response[]) {
  const urls: URL[] = [];
  const get = (async (input: URL) => {
    urls.push(new URL(input));
    const next = responses.shift();
    if (!next) throw new Error("asked for more pages than expected");
    return next;
  }) as typeof fetch;
  return { get, urls };
}

describe("parseEnrollment", () => {
  it("reads the code and school year from the course name", () => {
    expect(
      parseEnrollment(site("MATH 1600B 001 LEC FW25: LINEAR ALGEBRA I"), NOW),
    ).toEqual({
      key: "MATH 1600",
      code: "MATH 1600B",
      year: "2025–26",
      status: "past",
    });
  });

  it("handles any section number and a course with no suffix", () => {
    expect(
      parseEnrollment(site("COMPSCI 1033A 200 LEC FW25: MULTIMEDIA"), NOW)
        ?.code,
    ).toBe("COMPSCI 1033A");
    expect(
      parseEnrollment(site("ECONOMIC 1000 001 LEC FW26: INTRO"), NOW)?.code,
    ).toBe("ECONOMIC 1000");
  });

  it("marks a year's courses past from the May after it", () => {
    const course = site("MATH 1600B 001 LEC FW25: LINEAR ALGEBRA I");
    expect(parseEnrollment(course, new Date(2026, 3, 30))?.status).toBe(
      "current",
    );
    expect(parseEnrollment(course, new Date(2026, 4, 1))?.status).toBe("past");
  });

  it("puts a summer course in the school year it ends, and marks it past from September", () => {
    const summer = site("BIOLOGY 1001Y 001 LEC SU26: BIOLOGY FOR SCIENCE I");
    expect(parseEnrollment(summer, new Date(2026, 7, 31))).toEqual({
      key: "BIOLOGY 1001",
      code: "BIOLOGY 1001Y",
      year: "2025–26",
      status: "current",
    });
    expect(parseEnrollment(summer, new Date(2026, 8, 1))?.status).toBe("past");
  });

  it("leaves out sites that aren't courses", () => {
    for (const name of [
      "Mustangs for Consent",
      "Academic Integrity Module",
      "Science 3391 FW2026 - Yr 2 Entry",
    ]) {
      expect(parseEnrollment(site(name), NOW)).toBeNull();
    }
  });
});

describe("coursesFrom", () => {
  it("keeps every course in the real sample and drops training and community sites", () => {
    const { courses, skipped } = coursesFrom(page.Items, NOW);
    expect(courses.map((c) => `${c.code} ${c.year} ${c.status}`)).toEqual([
      "COMPSCI 1033A 2025–26 past",
      "COMPSCI 1020A 2025–26 past",
      "HISTORY 1707F 2025–26 past",
      "COMPSCI 1026A 2025–26 past",
      "MATH 1600B 2025–26 past",
      "PHYSICS 1202B 2025–26 past",
      "CALCULUS 1000B 2025–26 past",
      "COMPSCI 1027B 2025–26 past",
      "COMPSCI 2211A 2026–27 current",
      "COMPSCI 2210A 2026–27 current",
      "HISTORY 2158A 2026–27 current",
      "COMPSCI 2214A 2026–27 current",
      "COMPSCI 2208A 2026–27 current",
    ]);
    expect(skipped).toEqual([
      "Mustangs for Consent",
      "Launch Online",
      "Academic Integrity Module",
      "Science 3391 FW2026 - Yr 2 Entry",
    ]);
  });

  it("lists a course once when its lab has its own site, but keeps a retake in another year", () => {
    const { courses } = coursesFrom(
      [
        site("PHYSICS 1202B 001 LEC FW25: PHYSICS II", 1),
        site("PHYSICS 1202B 002 LAB FW25: PHYSICS II", 2),
        site("PHYSICS 1202B 001 LEC FW26: PHYSICS II", 3),
      ],
      NOW,
    );
    expect(courses.map((c) => c.year)).toEqual(["2025–26", "2026–27"]);
  });
});

describe("readCourses", () => {
  it("asks OWL with GET and the student's own cookies", async () => {
    const calls: RequestInit[] = [];
    const get = (async (_url: URL, init: RequestInit) => {
      calls.push(init);
      return json(page);
    }) as typeof fetch;
    await readCourses(get, NOW);
    expect(calls[0]).toMatchObject({ method: "GET", credentials: "include" });
  });

  it("reads one page when OWL says there's no more", async () => {
    const owl = fakeOwl(json(page));
    const result = await readCourses(owl.get, NOW);
    expect(result.ok && result.courses).toHaveLength(13);
    expect(owl.urls).toHaveLength(1);
    expect(owl.urls[0].pathname).toBe(
      "/d2l/api/lp/1.47/enrollments/myenrollments/",
    );
    expect(owl.urls[0].searchParams.get("orgUnitTypeId")).toBe("3");
    expect(owl.urls[0].searchParams.has("bookmark")).toBe(false);
  });

  it("follows the bookmark until every page is read", async () => {
    const first: EnrollmentPage = {
      PagingInfo: { Bookmark: "130527", HasMoreItems: true },
      Items: page.Items.slice(0, 6),
    };
    const second: EnrollmentPage = {
      PagingInfo: { Bookmark: "221476", HasMoreItems: false },
      Items: page.Items.slice(6),
    };
    const owl = fakeOwl(json(first), json(second));
    const result = await readCourses(owl.get, NOW);
    expect(owl.urls.map((u) => u.searchParams.get("bookmark"))).toEqual([
      null,
      "130527",
    ]);
    expect(result.ok && result.courses).toHaveLength(13);
  });

  it("stops if OWL keeps saying there's more without a new bookmark", async () => {
    const stuck: EnrollmentPage = {
      PagingInfo: { Bookmark: "1", HasMoreItems: true },
      Items: [],
    };
    const owl = fakeOwl(json(stuck), json(stuck));
    expect(await readCourses(owl.get, NOW)).toMatchObject({
      ok: false,
      reason: "error",
    });
  });

  it("reports signed out when OWL refuses or sends its login page", async () => {
    expect(await readCourses(fakeOwl(json({}, 401)).get, NOW)).toMatchObject({
      ok: false,
      reason: "signed-out",
    });
    expect(await readCourses(fakeOwl(json({}, 403)).get, NOW)).toMatchObject({
      ok: false,
      reason: "signed-out",
    });
    const login = new Response("<html>Sign in</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    expect(await readCourses(fakeOwl(login).get, NOW)).toMatchObject({
      ok: false,
      reason: "signed-out",
    });
  });

  it("reports an error when OWL can't be reached or fails", async () => {
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    expect(await readCourses(offline, NOW)).toMatchObject({
      ok: false,
      reason: "error",
    });
    expect(await readCourses(fakeOwl(json({}, 500)).get, NOW)).toMatchObject({
      ok: false,
      reason: "error",
    });
  });

  it("reports an error instead of throwing when OWL's data is broken or unexpected", async () => {
    const broken = new Response("{not json", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    expect(await readCourses(fakeOwl(broken).get, NOW)).toMatchObject({
      ok: false,
      reason: "error",
    });
    expect(
      await readCourses(fakeOwl(json({ Errors: ["nope"] })).get, NOW),
    ).toMatchObject({ ok: false, reason: "error" });
    expect(await readCourses(fakeOwl(json(null)).get, NOW)).toMatchObject({
      ok: false,
      reason: "error",
    });
  });

  it("skips an enrollment that has no name instead of throwing", async () => {
    const odd = {
      PagingInfo: { Bookmark: null, HasMoreItems: false },
      Items: [{ OrgUnit: { Id: 1, Code: null } }, ...page.Items],
    };
    const result = await readCourses(fakeOwl(json(odd)).get, NOW);
    expect(result.ok && result.courses).toHaveLength(13);
    expect(result.ok && result.skipped[0]).toBe("(a site with no name)");
  });
});
