// Reads Academic Calendar pages. No network here: fetch.ts downloads, this only parses,
// so a change in Western's HTML is fixed here.
import { load } from "cheerio";

export const CALENDAR = "https://westerncalendar.uwo.ca/";
export const COURSES_PAGE = `${CALENDAR}Courses.cfm?SelectedCalendar=Live&ArchiveID=`;

/** One row of the Courses page: a subject, its link and the breadth categories it lists. */
export interface Subject {
  /** "COMPSCI" */
  code: string;
  /** "Computer Science" */
  name: string;
  url: string;
  /** Usually one letter; a few subjects list two, and a few none. */
  categories: ("A" | "B" | "C")[];
}

/** One course as the subject page lists it, before it's turned into the website's Course. */
export interface CalendarCourse {
  /** The calendar's id, e.g. "MAIN_012345_1". Its prefix is the campus. */
  id: string;
  campus: "Main" | "Huron" | "King's";
  subject: string;
  /** "1027A/B" */
  number: string;
  title: string;
  weight: number | null;
  /** Empty when the subject lists two categories; the course's own page says which. */
  category: "A" | "B" | "C" | "";
  prereqText: string;
  antireqText: string;
  coreqText: string;
  extraInfo: string;
  detailUrl: string;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const absolute = (href: string) => new URL(href.replace(/&amp;/g, "&"), CALENDAR).href;
const categoriesIn = (text: string) => [...text.matchAll(/CATEGORY\s+([ABC])/gi)].map((m) => m[1].toUpperCase() as "A" | "B" | "C");

/** The Courses page: one table row per subject. */
export function subjectsFromCoursesPage(html: string): Subject[] {
  const $ = load(html);
  const out = new Map<string, Subject>();
  $("tr").each((_, tr) => {
    const a = $(tr).find('a[href*="Courses.cfm?Subject="]').first();
    if (!a.length) return;
    const url = absolute(a.attr("href")!);
    const code = new URL(url).searchParams.get("Subject")?.toUpperCase();
    if (!code || out.has(code)) return;
    out.set(code, { code, name: clean(a.text()), url, categories: categoriesIn($(tr).text()) });
  });
  return [...out.values()];
}

const CAMPUS: Record<string, CalendarCourse["campus"]> = { MAIN: "Main", HURON: "Huron", KINGS: "King's" };

export type FactKind = "prereq" | "antireq" | "coreq" | "extra";
export type Facts = Partial<Record<FactKind, string>>;

// Capitals on purpose: requisite text can say "also meet the prerequisite:" mid-sentence.
const FACT_LABEL = /(Pre-?\s*or\s*Co-?requisite|Co-?requisite|Prerequisite|Antirequisite|Extra Information)(?:\(s\)|s)?\s*:/g;

const kindOf = (label: string): FactKind =>
  label.startsWith("Anti") ? "antireq" : label.startsWith("Extra") ? "extra" : /Co-?requisite/.test(label) ? "coreq" : "prereq";

/**
 * One block of text can hold several labelled facts, so each fact runs up to the next label.
 * Text before the first label belongs to `lead`, if given.
 */
export function splitFacts(text: string, lead?: FactKind): Facts {
  const facts: Facts = {};
  const add = (kind: FactKind | undefined, part: string) => {
    const value = clean(part);
    if (kind && value) facts[kind] = facts[kind] ? `${facts[kind]} ${value}` : value;
  };
  let kind = lead;
  let from = 0;
  for (const m of text.matchAll(FACT_LABEL)) {
    add(kind, text.slice(from, m.index));
    kind = kindOf(m[1]);
    from = m.index + m[0].length;
  }
  add(kind, text.slice(from));
  return facts;
}

/** Every labelled fact in a course's panel. The first block to state a fact wins. */
function factsInPanel($: ReturnType<typeof load>, panel: ReturnType<ReturnType<typeof load>>): Facts {
  // A line break can sit mid-sentence, so it has to become a space before reading the text.
  panel.find("br").replaceWith(" ");
  const facts: Facts = {};
  for (const block of new Set(panel.find("strong").toArray().map((strong) => $(strong).parent().get(0))))
    if (block) for (const [kind, value] of Object.entries(splitFacts($(block).text()))) facts[kind as FactKind] ??= value;
  return facts;
}

/**
 * A subject page (Courses.cfm?Subject=…). Each course is a panel whose heading reads
 * "<Subject name> <number> <TITLE>", with one block per labelled fact under it.
 */
export function coursesFromSubjectPage(html: string, subject: Subject): CalendarCourse[] {
  const $ = load(html);
  const out: CalendarCourse[] = [];
  $("h4.courseTitleNoBlueLink").each((_, h4) => {
    const panel = $(h4).closest(".panel");
    const m = clean($(h4).text()).match(/\b(\d{4}[A-Z]?(?:\/[A-Z])*)\s+(.*)$/);
    const link = panel.find('a[href*="CourseAcadCalendarID="]').first().attr("href");
    if (!m || !link) return;
    const detailUrl = absolute(link);
    const id = new URL(detailUrl).searchParams.get("CourseAcadCalendarID") ?? detailUrl;
    const weightText = clean(panel.find("h5").filter((_, h) => /Course Weight/i.test($(h).text())).first().text());
    const weight = weightText.match(/\d+(\.\d+)?/)?.[0];
    const facts = factsInPanel($, panel);
    out.push({
      id,
      campus: CAMPUS[id.split("_")[0].toUpperCase()] ?? "Main",
      subject: subject.code,
      number: m[1],
      title: clean(m[2]),
      weight: weight ? Number(weight) : null,
      category: subject.categories.length === 1 ? subject.categories[0] : "",
      prereqText: facts.prereq ?? "",
      antireqText: facts.antireq ?? "",
      coreqText: facts.coreq ?? "",
      extraInfo: facts.extra ?? "",
      detailUrl,
    });
  });
  return out;
}

/** A course's own page, for subjects that span two categories. "" if the page doesn't say. */
export function categoryFromCoursePage(html: string): "A" | "B" | "C" | "" {
  const $ = load(html);
  return categoriesIn($("h5").filter((_, h) => /Breadth/i.test($(h).text())).first().text())[0] ?? "";
}
