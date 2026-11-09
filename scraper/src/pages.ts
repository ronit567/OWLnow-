// Reads Academic Calendar pages. No network here: fetch.ts downloads, this only parses,
// so a change in Western's HTML is fixed here.
import { load } from "cheerio";

export const CALENDAR = "https://westerncalendar.uwo.ca/";
export const COURSES_PAGE = `${CALENDAR}Courses.cfm?SelectedCalendar=Live&ArchiveID=`;
export const MODULES_PAGE = `${CALENDAR}Modules.cfm?SelectedCalendar=Live&ArchiveID=`;
/** The policy section holding the Bachelor's degree requirements and breadth rules. */
export const DEGREE_PAGE = `${CALENDAR}PolicyPages.cfm?Command=showCategory&PolicyCategoryID=4&SelectedCalendar=Live&ArchiveID=`;

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

export interface ModuleLink {
  /** The calendar's ModuleID, e.g. "21580". */
  id: string;
  /** "Honours Specialization in ACCOUNTING". Two modules can share this, so use the id to tell them apart. */
  name: string;
  /** "Honours Specialization", "Major", "Minor" and so on. */
  type: string;
  area: string;
  faculty: string;
  department: string;
  url: string;
}

/**
 * The Modules page: a table with one row per area of study and department. Each module is a bubble in
 * the last column: a link holding only an image, whose title gives the module's type.
 */
export function moduleLinks(html: string): ModuleLink[] {
  const $ = load(html);
  const out = new Map<string, ModuleLink>();
  $("tr").each((_, tr) => {
    const cells = $(tr).children("td");
    cells.find('a[href*="ModuleID="]').each((_, a) => {
      const url = absolute($(a).attr("href")!);
      const id = new URL(url).searchParams.get("ModuleID");
      if (!id || out.has(id)) return;
      const type = clean($(a).find("img").attr("title") ?? "");
      const area = clean(cells.eq(0).text());
      out.set(id, { id, name: `${type} in ${area}`, type, area, faculty: clean(cells.eq(1).text()), department: clean(cells.eq(2).text()), url });
    });
  });
  return [...out.values()];
}

/** A page as text: its title, and its lines grouped under each heading. */
export interface PageText {
  title: string;
  sections: { heading: string; lines: string[] }[];
}

const LINE_BREAKS = "p, div, li, tr, table, ul, ol, h1, h2, h3, h4, h5, h6";

/** Keeps a page's wording in reading order, without its navigation. For module and degree requirements. */
export function pageText(html: string): PageText {
  const $ = load(html);
  $("script, style, nav, footer, form, .navbar, .pageTitleHeader, .returntop, .printIconLayout, img").remove();
  // The biggest container holds the content: the first can be just the page header.
  const containers = $(".container").toArray().map((el) => $(el));
  const root = containers.sort((a, b) => b.text().length - a.text().length)[0] ?? $("body");
  const title = clean(root.find("h2").first().text()) || clean($("title").text());

  // Line breaks in the HTML source mean nothing, so only the page's own structure starts a new line.
  root.find("*").addBack().contents().each((_, node) => {
    if (node.type === "text") node.data = node.data.replace(/\s+/g, " ");
  });
  root.find("br").replaceWith("\n");
  root.find("td, th").append(" ");
  root.find("h1, h2, h3, h4, h5, h6").prepend("\n## ");
  root.find(LINE_BREAKS).append("\n");

  const sections: PageText["sections"] = [{ heading: "", lines: [] }];
  for (const raw of root.text().split("\n")) {
    const line = clean(raw);
    if (!line || line === "##" || /^(## )?Return to top$/i.test(line)) continue;
    if (line.startsWith("## ")) sections.push({ heading: line.slice(3), lines: [] });
    else if (sections.at(-1)!.lines.at(-1) !== line) sections.at(-1)!.lines.push(line);
  }
  return { title, sections: sections.filter((s) => s.heading || s.lines.length) };
}
