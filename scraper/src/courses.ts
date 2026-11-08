// Downloads the Academic Calendar's course pages and saves the courses as JSON.
// For a team member to run on their own laptop: Western's robots.txt blocks AI tools.
//
//   npm run scrape:courses -- --test                 Computer Science only, printed, nothing written
//   npm run scrape:courses -- --subjects COMPSCI,MATH
//   npm run scrape:courses                           everything (about 10 minutes)
//   npm run scrape:courses -- --fresh                start over, e.g. when the new calendar comes out
//
// Each subject's file is written as soon as that subject is done, and a rerun skips subjects that
// already have one, so it's safe to stop (Ctrl+C) and run again later.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Course } from "../../apps/web/src/data/library.ts";
import { toCourses } from "./convert.ts";
import { Stop, get } from "./fetch.ts";
import { COURSES_PAGE, categoryFromCoursePage, coursesFromSubjectPage, subjectsFromCoursesPage } from "./pages.ts";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const coursesDir = join(outDir, "courses");
const args = process.argv.slice(2);
const test = args.includes("--test");
const only = args.includes("--subjects") ? args[args.indexOf("--subjects") + 1].toUpperCase().split(",") : test ? ["COMPSCI"] : null;

const today = () => new Date().toISOString().slice(0, 10);
const write = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");

async function main() {
  if (args.includes("--fresh")) rmSync(outDir, { recursive: true, force: true });

  const subjects = subjectsFromCoursesPage(await get(COURSES_PAGE));
  if (!subjects.length) throw new Error("Found no subjects on the Courses page. The page layout may have changed: check pages.ts.");
  console.log(`${subjects.length} subjects on the Courses page`);
  if (!test) {
    mkdirSync(coursesDir, { recursive: true });
    write(join(outDir, "subjects.json"), { scraped: today(), subjects });
  }

  for (const subject of subjects.filter((s) => !only || only.includes(s.code))) {
    const file = join(coursesDir, `${subject.code}.json`);
    if (!test && existsSync(file)) continue;
    const raw = coursesFromSubjectPage(await get(subject.url), subject);
    // Subjects listed under two categories: each course's own page says which one.
    if (subject.categories.length > 1)
      for (const c of raw.filter((c) => !c.category)) c.category = categoryFromCoursePage(await get(c.detailUrl));
    const courses = toCourses(raw, subjects);
    console.log(`${subject.code}: ${courses.length} courses`);
    if (test) for (const c of courses) console.log(JSON.stringify(c, null, 2));
    else write(file, { scraped: today(), courses });
  }
  if (test) return console.log("\nCompare a few with the calendar by eye. No data files were written.");

  // The combined file and the index cover every subject file saved so far.
  const all: Course[] = subjects
    .map((s) => join(coursesDir, `${s.code}.json`))
    .filter((f) => existsSync(f))
    .flatMap((f) => JSON.parse(readFileSync(f, "utf8")).courses);
  write(join(outDir, "courses.json"), { scraped: today(), courses: all });
  write(join(outDir, "courses-index.json"), { scraped: today(), courses: all.map((c) => ({ key: c.key, suffix: c.suffix, title: c.title })) });
  const missing = subjects.filter((s) => !existsSync(join(coursesDir, `${s.code}.json`))).length;
  console.log(`\nSaved ${all.length} courses to scraper/data/. ${all.filter((c) => !c.category).length} without a category.`);
  if (missing) console.log(`${missing} subjects not read yet: run the same command again to fetch them.`);
}

main().catch((e) => {
  if (e instanceof Stop) {
    console.error(`\nStopped: ${e.message} Subjects already saved are kept; run the same command later to carry on.`);
    process.exitCode = 2;
  } else throw e;
});
