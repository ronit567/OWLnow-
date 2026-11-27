import { describe, expect, it } from "vitest";
import {
  currentSites,
  dueOf,
  hasSubmitted,
  readAssignments,
  type CourseSite,
  type DropboxFolder,
} from "./assignments";
import type { EnrollmentPage } from "./courses";
import sample from "./fixtures/myenrollments.json";
import realVersions from "./fixtures/versions.json";
import realFolders from "./fixtures/dropbox-folders.json";
import realGradedUnsubmitted from "./fixtures/mysubmissions-graded-unsubmitted.json";
import { readVersions } from "./http";

const NOW = new Date(2026, 10, 20);
const page = sample as EnrollmentPage;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

/** A stand-in for OWL that answers by path, and records each path asked for. */
function fakeOwl(routes: Record<string, () => Response>) {
  const paths: string[] = [];
  const get = (async (input: URL) => {
    const url = new URL(input);
    paths.push(url.pathname);
    const route = routes[url.pathname];
    if (!route) throw new Error(`unexpected request to ${url.pathname}`);
    return route();
  }) as typeof fetch;
  return { get, paths };
}

const folder = (Id: number, over: Partial<DropboxFolder> = {}): DropboxFolder => ({
  Id,
  Name: `Assignment ${Id}`,
  DueDate: "2026-11-27T04:59:00.000Z",
  Availability: null,
  ...over,
});
const SITE: CourseSite = {
  id: 500,
  name: "COMPSCI 2210A 001 LEC FW26: DATA STRUCTURES AND ALGORITHMS",
  code: "COMPSCI 2210A",
};
const folders = (id: number) => `/d2l/api/le/1.80/${id}/dropbox/folders/`;
const mine = (id: number, f: number) => `${folders(id)}${f}/submissions/mysubmissions/`;
const handedIn = [{ Entity: { DisplayName: "Me" }, Status: 1, Submissions: [{ Id: 9 }] }];
const notYet = [{ Entity: { DisplayName: "Me" }, Status: 0, Submissions: [] }];

describe("readVersions", () => {
  it("reads lp and le from OWL's real versions response", async () => {
    // Read from westernu.brightspace.com on 2026-11-26.
    const owl = fakeOwl({ "/d2l/api/versions/": () => json(realVersions) });
    expect(await readVersions(owl.get)).toEqual({ ok: true, lp: "1.64", le: "1.100" });
  });

  it("takes the latest lp and le versions", async () => {
    const owl = fakeOwl({
      "/d2l/api/versions/": () =>
        json([
          { ProductCode: "lp", LatestVersion: "1.50", SupportedVersions: [] },
          { ProductCode: "le", LatestVersion: "1.80", SupportedVersions: [] },
          { ProductCode: "ep", LatestVersion: "2.5", SupportedVersions: [] },
        ]),
    });
    expect(await readVersions(owl.get)).toEqual({ ok: true, lp: "1.50", le: "1.80" });
  });

  it("reports signed out or an error instead of throwing", async () => {
    expect(await readVersions(fakeOwl({ "/d2l/api/versions/": () => json({}, 401) }).get)).toMatchObject({
      ok: false,
      reason: "signed-out",
    });
    expect(await readVersions(fakeOwl({ "/d2l/api/versions/": () => json([]) }).get)).toMatchObject({
      ok: false,
      reason: "error",
    });
  });
});

describe("currentSites", () => {
  it("keeps this year's course sites from the real sample, with their OWL ids", () => {
    const sites = currentSites(page.Items, NOW);
    expect(sites.map((s) => s.code)).toEqual([
      "COMPSCI 2211A",
      "COMPSCI 2210A",
      "HISTORY 2158A",
      "COMPSCI 2214A",
      "COMPSCI 2208A",
    ]);
    expect(sites.every((s) => typeof s.id === "number")).toBe(true);
  });
});

describe("dueOf", () => {
  it("uses the due date, then the end date, and gives up without either", () => {
    expect(dueOf(folder(1))?.toISOString()).toBe("2026-11-27T04:59:00.000Z");
    expect(
      dueOf(folder(1, { DueDate: null, Availability: { StartDate: null, EndDate: "2026-12-01T05:00:00.000Z" } }))?.toISOString(),
    ).toBe("2026-12-01T05:00:00.000Z");
    expect(dueOf(folder(1, { DueDate: null, Availability: { StartDate: "2026-09-01T00:00:00Z", EndDate: null } }))).toBeNull();
    expect(dueOf(folder(1, { DueDate: null }))).toBeNull();
  });
});

describe("hasSubmitted", () => {
  it("is true only when something was handed in", () => {
    expect(hasSubmitted(handedIn)).toBe(true);
    expect(hasSubmitted(notYet)).toBe(false);
    expect(hasSubmitted([])).toBe(false);
    expect(hasSubmitted(null)).toBe(false);
  });

  it("counts work marked complete without an upload", () => {
    expect(hasSubmitted([{ Submissions: [], CompletionDate: "2026-10-20T15:00:00.000Z" }])).toBe(true);
  });

  it("doesn't count a grade on missed work as handed in", () => {
    expect(hasSubmitted(realGradedUnsubmitted)).toBe(false);
  });
});

describe("readAssignments with OWL's real responses", () => {
  // Read from westernu.brightspace.com on 2026-11-26, with the student's name and id replaced.
  it("reads a real assignment, its due date and an unsubmitted grade", async () => {
    const owl = fakeOwl({
      "/d2l/api/le/1.100/202984/dropbox/folders/": () => json(realFolders),
      "/d2l/api/le/1.100/202984/dropbox/folders/127033/submissions/mysubmissions/": () => json(realGradedUnsubmitted),
    });
    const site: CourseSite = { id: 202984, name: "A course", code: "COMPSCI 2210A" };
    const result = await readAssignments(owl.get, "1.100", [site]);
    expect(result).toEqual({
      ok: true,
      skipped: [],
      deadlines: [
        {
          id: "owl:202984:assignment:127033",
          title: "Project Proposal",
          course: "COMPSCI 2210A",
          site: "A course",
          kind: "assignment",
          due: new Date("2026-10-22T03:59:59.000Z"),
          url: "https://westernu.brightspace.com/d2l/lms/dropbox/user/folder_submit_files.d2l?db=127033&ou=202984",
          submitted: false,
        },
      ],
    });
  });
});

describe("readAssignments", () => {
  it("maps each dated, visible folder to a deadline with its submitted state", async () => {
    const owl = fakeOwl({
      [folders(500)]: () =>
        json([
          folder(1),
          folder(2, { DueDate: null, Availability: { StartDate: null, EndDate: "2026-12-01T05:00:00.000Z" } }),
          folder(3, { IsHidden: true }),
          folder(4, { DueDate: null }),
        ]),
      [mine(500, 1)]: () => json(handedIn),
      [mine(500, 2)]: () => json(notYet),
    });
    const result = await readAssignments(owl.get, "1.80", [SITE]);
    expect(result).toEqual({
      ok: true,
      skipped: [],
      deadlines: [
        {
          id: "owl:500:assignment:1",
          title: "Assignment 1",
          course: "COMPSCI 2210A",
          site: SITE.name,
          kind: "assignment",
          due: new Date("2026-11-27T04:59:00.000Z"),
          url: "https://westernu.brightspace.com/d2l/lms/dropbox/user/folder_submit_files.d2l?db=1&ou=500",
          submitted: true,
        },
        expect.objectContaining({ id: "owl:500:assignment:2", due: new Date("2026-12-01T05:00:00.000Z"), submitted: false }),
      ],
    });
    // Hidden and undated folders aren't asked about.
    expect(owl.paths).not.toContain(mine(500, 3));
    expect(owl.paths).not.toContain(mine(500, 4));
  });

  it("leaves submitted unknown when OWL won't say", async () => {
    const owl = fakeOwl({
      [folders(500)]: () => json([folder(1)]),
      [mine(500, 1)]: () => json({}, 500),
    });
    const result = await readAssignments(owl.get, "1.80", [SITE]);
    expect(result.ok && result.deadlines[0]).not.toHaveProperty("submitted");
  });

  it("skips a course that won't show its assignments and keeps the rest", async () => {
    const other: CourseSite = { id: 600, name: "HISTORY 2158A 001 LEC FW26: FOOD IN WORLD HISTORY", code: "HISTORY 2158A" };
    const owl = fakeOwl({
      [folders(500)]: () => json({}, 403),
      [folders(600)]: () => json([folder(7)]),
      [mine(600, 7)]: () => json(notYet),
    });
    const result = await readAssignments(owl.get, "1.80", [SITE, other]);
    expect(result).toMatchObject({ ok: true, skipped: [`${SITE.name}: OWL answered 403`] });
    expect(result.ok && result.deadlines.map((d) => d.course)).toEqual(["HISTORY 2158A"]);
  });

  it("fails the whole read when signed out", async () => {
    const login = () => new Response("<html>Sign in</html>", { status: 200, headers: { "content-type": "text/html" } });
    expect(await readAssignments(fakeOwl({ [folders(500)]: login }).get, "1.80", [SITE])).toMatchObject({
      ok: false,
      reason: "signed-out",
    });
    const owl = fakeOwl({ [folders(500)]: () => json([folder(1)]), [mine(500, 1)]: () => json({}, 401) });
    expect(await readAssignments(owl.get, "1.80", [SITE])).toMatchObject({ ok: false, reason: "signed-out" });
  });
});
