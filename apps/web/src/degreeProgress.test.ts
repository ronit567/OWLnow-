import { afterEach, expect, it } from "vitest";
import { catalog, creditsByStanding, degreeProgress, standings, type Standing } from "./checks";
import { DEGREE_RULES, type Course } from "./data/library";

const have = new Map<string, Standing>();
function add(key: string, standing: Standing, fields: Partial<Course> = {}) {
  catalog.set(key, {
    key, title: key, suffix: "E", essay: true, category: "C", campus: "Main", weight: 1,
    prereq: null, prereqText: "", antireqText: "", antireqs: [], terms: [], offeredNextYear: true, ...fields,
  });
  have.set(key, standing);
}
afterEach(() => {
  for (const key of have.keys()) catalog.delete(key);
  have.clear();
});

it.each([
  ["Honours", 20, 13, 10], ["4-year", 20, 13, 10], ["3-year", 15, 8, 7.5],
] as const)("applies the BA and BSc credit thresholds for %s", (type, total, senior, science) => {
  add("BIOLOGY 2000", "done");
  add("BIOCHEM 4999", "current");
  add("ENGSCI 2001", "planned");
  add("HISTORY 1000", "done", { category: "A" });
  add("ENGLISH 1999", "planned", { category: "B" });
  const ba = degreeProgress(DEGREE_RULES[type], have, "BA");
  const bsc = degreeProgress(DEGREE_RULES[type], have, "BSc");
  expect(bsc.slice(0, -1)).toEqual(ba);
  expect(ba[0]).toMatchObject({ need: total, done: 2, total: 5 });
  expect(ba.find(r => r.label.startsWith("Senior credits"))).toMatchObject({ need: senior, total: 3 });
  expect(ba.filter(r => r.label.startsWith("Category")).map(r => [r.need, r.total, r.outcome])).toEqual([
    [1, 1, "done"], [1, 1, "on-track"], [1, 3, "done"],
  ]);
  expect(ba.find(r => r.label === "Essay credits")).toMatchObject({ need: 2, outcome: "done" });
  expect(ba.find(r => r.label === "Senior essay credits")).toMatchObject({ need: 1, done: 1 });
  expect(bsc.at(-1)).toMatchObject({ label: "BSc science credits", need: science, total: type === "3-year" ? 1 : 2 });
});

it("caps first-year credit, keeping completed credit first in both totals", () => {
  add("MATH 1999", "planned");
  for (let n = 1000; n < 1007; n++) add(`MATH ${n}`, "done");
  add("MATH 2000", "current", { weight: 0.5 });
  add("MATH 5000", "done");
  const rows = degreeProgress(DEGREE_RULES.Honours, have);
  expect(rows[0]).toMatchObject({ done: 7, total: 7.5 });
  expect(rows.find(r => r.label === "First-year credit limit")).toMatchObject({ total: 8, need: 7 });
  expect(creditsByStanding(have)).toEqual({ done: 7, current: 0.5, planned: 0 });
});

it("prefers completed courses across repeats and one-sided antirequisite pairs", () => {
  add("MATH 1000", "planned", { antireqs: ["MATH 2000"] });
  add("MATH 2000", "done", { weight: 0.5 });
  const past = { key: "MATH 2000", code: "MATH 2000A", year: "2024–25", status: "past" } as const;
  const record = standings([past, { ...past, status: "current" }], ["MATH 1000"]);
  for (const entries of [have, record]) {
    expect(degreeProgress(DEGREE_RULES.Honours, entries)[0]).toMatchObject({ done: 0.5, total: 0.5 });
    expect(creditsByStanding(entries)).toEqual({ done: 0.5, current: 0, planned: 0 });
  }
});
