// Simple stand-ins for the checks engine, good enough to drive the preview. The real engine
// (packages/engine) replaces these.
import { COURSES, NEXT_TERMS, NEXT_YEAR, type Course, type DegreeRule, type Module, type Pick, type Requirement, type Rule, type Semester, type StudentCourse } from "./data/library";

export type Outcome = "done" | "on-track" | "missing" | "check";
export type Standing = "done" | "current" | "planned";

export interface Result {
  outcome: Outcome;
  reason: string;
  /** Met only if a course planned for the same year is taken first. */
  order?: boolean;
}

export const catalog = new Map(COURSES.map((c) => [c.key, c]));
export const courseCode = (c: Course) => `${c.key}${c.suffix}`;
export const codeOf = (key: string) => {
  const c = catalog.get(key);
  return c ? courseCode(c) : key;
};
export const weightOf = (key: string) => catalog.get(key)?.weight ?? 0.5;

/** "compsci 1027b" → { key: "COMPSCI 1027", code: "COMPSCI 1027B" }. */
export function parseCode(text: string): { key: string; code: string } | null {
  const m = text.trim().toUpperCase().match(/^([A-Z]{2,9})\s*(\d{4})([A-Z]?)/);
  return m ? { key: `${m[1]} ${m[2]}`, code: `${m[1]} ${m[2]}${m[3]}` } : null;
}
export const levelOf = (key: string) => Number(key.match(/\d{4}/)?.[0] ?? 0);
export const fmt = (n: number) => n.toFixed(1);

/** Antirequisites count both ways: if either course lists the other, only one counts. */
export const clash = (a: string, b: string) => Boolean(catalog.get(a)?.antireqs.includes(b) || catalog.get(b)?.antireqs.includes(a));

/** What a student has: finished courses, this year's, and next year's picks. */
export function standings(courses: StudentCourse[], picks: string[], except?: string): Map<string, Standing> {
  const have = new Map<string, Standing>();
  for (const c of courses) if (c.key !== except && have.get(c.key) !== "done") have.set(c.key, c.status === "past" ? "done" : "current");
  for (const key of picks) if (key !== except && !have.has(key)) have.set(key, "planned");
  return have;
}

const RANK: Record<Outcome, number> = { done: 0, "on-track": 1, check: 2, missing: 3 };
const credits = (keys: string[]) => keys.reduce((t, k) => t + weightOf(k), 0);

export function evaluate(rule: Rule, have: Map<string, Standing>): Result {
  if ("all" in rule) {
    const results = rule.all.map((r) => evaluate(r, have));
    return results.reduce((worst, r) => (RANK[r.outcome] > RANK[worst.outcome] || (RANK[r.outcome] === RANK[worst.outcome] && r.order) ? r : worst));
  }
  if ("any" in rule) {
    const results = rule.any.map((r) => evaluate(r, have));
    return results.reduce((best, r) => (RANK[r.outcome] < RANK[best.outcome] || (RANK[r.outcome] === RANK[best.outcome] && best.order) ? r : best));
  }
  if ("check" in rule) return { outcome: "check", reason: rule.check };
  if ("course" in rule) {
    const code = codeOf(rule.course);
    const s = have.get(rule.course);
    if (!s) return { outcome: "missing", reason: `Missing ${code}` };
    if (rule.minMark) return { outcome: "check", reason: `Needs ${rule.minMark}% in ${code}` };
    if (s === "done") return { outcome: "done", reason: `${code} done` };
    if (s === "current") return { outcome: "on-track", reason: `Finishing ${code} this year` };
    return { outcome: "on-track", reason: `Take ${code} first`, order: true };
  }
  const counted = rule.from.filter((k) => have.has(k));
  const list = rule.from.map(codeOf).join(", ");
  if (credits(counted) < rule.credits) return { outcome: "missing", reason: `Needs ${fmt(rule.credits)} from ${list}` };
  if (rule.minMark) return { outcome: "check", reason: `Needs ${rule.minMark}% in each` };
  const done = counted.filter((k) => have.get(k) === "done");
  if (credits(done) >= rule.credits) return { outcome: "done", reason: `${fmt(rule.credits)} from ${list}` };
  const notPlanned = counted.filter((k) => have.get(k) !== "planned");
  if (credits(notPlanned) >= rule.credits) return { outcome: "on-track", reason: "Finishing it this year" };
  const planned = counted.filter((k) => have.get(k) === "planned").map(codeOf);
  return { outcome: "on-track", reason: `Take ${planned.join(" or ")} first`, order: true };
}

export interface DegreeRow {
  label: string;
  done: number;
  total: number;
  need: number;
  outcome: Outcome;
  note: string;
}

const firstYear = (c: Course) => levelOf(c.key) >= 1000 && levelOf(c.key) < 2000;
const senior = (c: Course) => levelOf(c.key) >= 2000 && levelOf(c.key) <= 4999;

// Calendar breadth policy, Category C subgroups. Engineering also earns C breadth.
const scienceSubjects = new Set("ACTURSCI APPLMATH ASTRONOM BIOLOGY CALCULUS CHEM COMPSCI DATASCI EARTHSCI ENVIRSCI HISTSCI INTEGSCI MATH NMM PHYSICS SCIENCE STATS".split(" "));
const medicalSubjects = new Set("ANATCELL BIOCHEM BIOSTATS EPID EPIDEMIO MBI MEDBIO MEDSCIEN MICROIMM NEURO ONEHEALT PATHOL PHARM PHYSIOL PHYSPHRM PUBHEALT".split(" "));

function degreeCourses(have: Map<string, Standing>) {
  const counted: [Course, Standing][] = [];
  const ordered = [...have].sort(([a, sa], [b, sb]) => ORDER[sa] - ORDER[sb] || weightOf(b) - weightOf(a) || a.localeCompare(b));
  for (const [key, standing] of ordered) {
    const course = catalog.get(key);
    if (course && (firstYear(course) || senior(course)) && !counted.some(([other]) => clash(other.key, key))) {
      counted.push([course, standing]);
    }
  }
  return counted;
}

export function degreeProgress(rule: DegreeRule, have: Map<string, Standing>, kind: "BA" | "BSc" = "BA"): DegreeRow[] {
  const counted = degreeCourses(have);
  const sum = (pick: (c: Course) => boolean, doneOnly = false, firstYearLimit = rule.firstYearMax) => {
    const matches = counted.filter(([course, standing]) => pick(course) && (!doneOnly || standing === "done"));
    const byStanding = sumStanding(matches, firstYearLimit);
    return byStanding.done + byStanding.current + byStanding.planned;
  };
  const minimum = (label: string, need: number, done: number, total: number): DegreeRow => {
    const outcome = done >= need ? "done" : total >= need ? "on-track" : "missing";
    return { label, done, total, need, outcome, note: outcome === "missing" ? `${fmt(need - total)} more to plan` : "" };
  };
  const atLeast = (label: string, need: number, pick: (c: Course) => boolean) =>
    minimum(label, need, sum(pick, true), sum(pick));
  const standing = sumStanding(counted, rule.firstYearMax);
  const firstTotal = sum(firstYear, false, Infinity);
  const rows: DegreeRow[] = [
    minimum("Total credits", rule.total, standing.done, standing.done + standing.current + standing.planned),
    atLeast("First-year credits required", 5, firstYear),
    {
      label: "First-year credit limit",
      done: sum(firstYear, true, Infinity),
      total: firstTotal,
      need: rule.firstYearMax,
      outcome: "done",
      note: firstTotal <= rule.firstYearMax ? `At most ${fmt(rule.firstYearMax)}` : `${fmt(firstTotal - rule.firstYearMax)} extra credits excluded from the degree total`,
    },
    atLeast("Senior credits (2000–4999)", rule.senior, senior),
    atLeast("Category A: social science and interdisciplinary studies", rule.breadthEach, (c) => c.category === "A"),
    atLeast("Category B: arts, humanities and languages", rule.breadthEach, (c) => c.category === "B"),
    atLeast("Category C: science", rule.breadthEach, (c) => c.category === "C"),
    atLeast("Essay credits", rule.essay, (c) => c.essay),
    atLeast("Senior essay credits", rule.essaySenior, (c) => c.essay && senior(c)),
  ];
  if (kind === "BSc") {
    rows.push(atLeast("BSc science credits", rule.bscScience, (c) => {
      const subject = c.key.split(" ")[0];
      return scienceSubjects.has(subject) || (rule.includesMedicalScience && c.category === "C" && medicalSubjects.has(subject));
    }));
  }
  return rows;
}

export const eligible = (req: Requirement, key: string) =>
  req.from ? req.from.includes(key) : Boolean(req.subject) && key.startsWith(`${req.subject} `) && levelOf(key) >= (req.minLevel ?? 0);

export interface RequirementResult {
  req: Requirement;
  outcome: Outcome;
  counted: [string, Standing][];
  got: number;
}

const ORDER: Record<Standing, number> = { done: 0, current: 1, planned: 2 };

/** Each course counts toward one requirement only, filling the narrowest requirements first. */
export function auditModule(mod: Module, have: Map<string, Standing>): RequirementResult[] {
  const reqs = mod.requirements ?? [];
  const narrowness = (r: Requirement) => (r.check ? 999 : (r.from?.length ?? 100));
  const order = reqs.map((_, i) => i).sort((a, b) => narrowness(reqs[a]) - narrowness(reqs[b]));
  const used = new Set<string>();
  const out = new Array<RequirementResult>(reqs.length);
  for (const i of order) {
    const req = reqs[i];
    if (req.check) {
      out[i] = { req, outcome: "check", counted: [], got: 0 };
      continue;
    }
    const pool = [...have].filter(([k]) => !used.has(k) && eligible(req, k)).sort((a, b) => ORDER[a[1]] - ORDER[b[1]]);
    const counted: [string, Standing][] = [];
    let got = 0;
    for (const entry of pool) {
      if (got >= req.credits) break;
      counted.push(entry);
      used.add(entry[0]);
      got += weightOf(entry[0]);
    }
    const done = credits(counted.filter(([, s]) => s === "done").map(([k]) => k));
    out[i] = { req, counted, got, outcome: done >= req.credits ? "done" : got >= req.credits ? "on-track" : "missing" };
  }
  return out;
}

export type Tone = "error" | "warn" | "check" | "ok";

export interface Note {
  tone: Tone;
  /** A word or two for the course card's pill. */
  label: string;
  short: string;
  detail: string;
}

const TONE: Record<Tone, number> = { error: 0, warn: 1, check: 2, ok: 3 };
export const mainNote = (notes: Note[]) => [...notes].sort((a, b) => TONE[a.tone] - TONE[b.tone])[0];

/** 1.0 courses (no suffix, or E) run the full year; half courses go in Fall or Winter. */
export const isFullYear = (c: Course) => c.suffix === "" || c.suffix === "E";
export const defaultSemester = (c: Course): Semester => (isFullYear(c) ? "FW" : c.terms[0]);
const starts = (s: Semester) => (s === "W" ? 1 : 0);
const ends = (s: Semester) => (s === "F" ? 0 : 1);

/** Every check on one course picked for next year, in the term it's picked for. */
export function checkPick(pick: Pick, student: StudentCourse[], picks: Pick[]): Note[] {
  const c = catalog.get(pick.key);
  if (!c) return [{ tone: "check", label: "Not in calendar", short: "Not in this calendar", detail: "Nothing about it can be checked." }];
  const notes: Note[] = [];
  const taken = student.find((s) => s.key === pick.key);
  if (taken) notes.push({ tone: "error", label: taken.status === "past" ? "Already taken" : "Taking it now", short: taken.status === "past" ? "Already taken" : "Taking it this year", detail: `${taken.code} is on OWL for ${taken.year}.` });
  const others = picks.filter((p) => p.key !== pick.key);
  for (const other of standings(student, others.map((p) => p.key)).keys())
    if (clash(pick.key, other))
      notes.push({ tone: "error", label: "Antirequisite", short: `Can't count with ${codeOf(other)}`, detail: `${courseCode(c)} and ${codeOf(other)} are antirequisites, so only one counts.` });
  if (c.prereq) {
    const text = `Calendar: “${c.prereqText}”`;
    // Only courses finished before this one starts can count: earlier years, or an earlier term next year.
    const earlier = others.filter((p) => ends(p.term) < starts(pick.term)).map((p) => p.key);
    const r = evaluate(c.prereq, standings(student, earlier, pick.key));
    if (r.outcome === "missing") {
      const anyTerm = evaluate(c.prereq, standings(student, others.map((p) => p.key), pick.key));
      if (anyTerm.outcome !== "missing")
        notes.push({ tone: "error", label: "Prerequisite too late", short: `${anyTerm.reason} in an earlier term`, detail: `It's in your plan, but not before ${NEXT_TERMS[pick.term]}. ${text}` });
      else notes.push({ tone: "error", label: "Missing prerequisite", short: r.reason, detail: text });
    } else if (r.outcome === "check") notes.push({ tone: "check", label: "Check prerequisites", short: "Check prerequisites", detail: `${r.reason}. ${text}` });
  }
  if (!c.offeredNextYear)
    notes.push({ tone: "warn", label: `Not offered ${NEXT_YEAR}`, short: "Not offered next year", detail: "Last year's timetable doesn't list it. Check again when the new timetable is out in June." });
  else if (pick.term !== "FW" && !c.terms.includes(pick.term))
    notes.push({ tone: "warn", label: `Not offered in ${pick.term === "F" ? "Fall" : "Winter"}`, short: `Not offered in ${pick.term === "F" ? "Fall" : "Winter"}`, detail: `It runs in ${c.terms.map((t) => (t === "F" ? "Fall" : "Winter")).join(" and ")}.` });
  if (!notes.length) notes.push({ tone: "ok", label: "Ready", short: "Ready", detail: c.prereq ? "Prerequisites met." : "No prerequisites." });
  return notes;
}

/** Credits in a term next year; a full-year course counts half in each. */
export const termLoad = (picks: Pick[], term: "F" | "W") =>
  picks.reduce((t, p) => (p.term === term ? t + weightOf(p.key) : p.term === "FW" ? t + weightOf(p.key) / 2 : t), 0);

export interface Suggestion {
  key: string;
  why: string;
}

/** Courses that fill gaps: module requirements first, then breadth and essay. */
export function suggestCourses(modules: Module[], rows: DegreeRow[], have: Map<string, Standing>): Suggestion[] {
  const out: Suggestion[] = [];
  const add = (c: Course, why: string) => {
    if (!out.some((s) => s.key === c.key)) out.push({ key: c.key, why });
  };
  const takeable = (c: Course) =>
    c.offeredNextYear && !have.has(c.key) && ![...have.keys()].some((k) => clash(k, c.key)) && (!c.prereq || evaluate(c.prereq, have).outcome !== "missing");
  for (const mod of modules)
    for (const r of mod.requirements ? auditModule(mod, have) : [])
      if (r.outcome === "missing")
        COURSES.filter((c) => eligible(r.req, c.key) && takeable(c))
          .slice(0, 2)
          .forEach((c) => add(c, `${mod.name}: ${r.req.text}`));
  for (const row of rows) {
    if (row.outcome !== "missing") continue;
    const category = row.label.match(/^Category ([ABC])/)?.[1];
    if (category) COURSES.filter((c) => c.category === category && takeable(c)).slice(0, 1).forEach((c) => add(c, `${row.label} breadth`));
    if (row.label.includes("essay")) COURSES.filter((c) => c.essay && levelOf(c.key) >= 2000 && takeable(c)).slice(0, 1).forEach((c) => add(c, row.label));
  }
  return out.slice(0, 8);
}

export interface Filters {
  subject?: string;
  level?: number;
  category?: string;
}

export function searchCourses(query: string, f: Filters = {}): Course[] {
  const q = query.trim().toLowerCase();
  const compact = q.replace(/\s+/g, "");
  return COURSES.filter(
    (c) =>
      (!f.subject || c.key.startsWith(`${f.subject} `)) &&
      (!f.level || Math.floor(levelOf(c.key) / 1000) * 1000 === f.level) &&
      (!f.category || c.category === f.category) &&
      (!q || `${courseCode(c)} ${c.title}`.toLowerCase().includes(q) || c.key.replace(" ", "").toLowerCase().includes(compact)),
  );
}

/** Credits counted toward the degree, split by where they stand. Antirequisite pairs count once. */
function sumStanding(counted: [Course, Standing][], firstYearMax: number): Record<Standing, number> {
  const out = { done: 0, current: 0, planned: 0 };
  let remaining = firstYearMax;
  for (const [course, standing] of counted) {
    const credit = firstYear(course) ? Math.min(remaining, course.weight) : course.weight;
    if (firstYear(course)) remaining -= credit;
    out[standing] += credit;
  }
  return out;
}

export function creditsByStanding(have: Map<string, Standing>, firstYearMax = 7) {
  return sumStanding(degreeCourses(have), firstYearMax);
}
