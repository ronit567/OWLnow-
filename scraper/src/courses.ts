// Downloads the Academic Calendar's course pages and saves every course in scraper/data/courses.json.
// For a team member to run on their own laptop: Western's robots.txt blocks AI tools.
//
//   npm run scrape:courses -- --test                 Computer Science only, printed, nothing written
//   npm run scrape:courses -- --subjects COMPSCI,MATH
//   npm run scrape:courses                           everything (about 10 minutes)
//   npm run scrape:courses -- --fresh                throw away a stopped run and start over
//
// Each subject is kept in scraper/.progress/ as soon as it's done, so it's safe to stop (Ctrl+C) and
// run the same command again later. Once every subject is read, that folder is deleted.
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Course } from "../../apps/web/src/data/library.ts";
import { toCourses } from "./convert.ts";
import { Stop, get } from "./fetch.ts";
import { COURSES_PAGE, categoryFromCoursePage, coursesFromSubjectPage, subjectsFromCoursesPage } from "./pages.ts";
import { clearProgress, outDir, progressDir, today, write } from "./save.ts";

const progress = join(progressDir, "courses");
const args = process.argv.slice(2);
const test = args.includes("--test");
const only = args.includes("--subjects") ? args[args.indexOf("--subjects") + 1].toUpperCase().split(",") : test ? ["COMPSCI"] : null;

async function main() {
  if (args.includes("--fresh")) rmSync(progress, { recursive: true, force: true });

  const subjects = subjectsFromCoursesPage(await get(COURSES_PAGE));
  if (!subjects.length) throw new Error("Found no subjects on the Courses page. The page layout may have changed: check pages.ts.");
  console.log(`${subjects.length} subjects on the Courses page`);
  if (!test) mkdirSync(progress, { recursive: true });

  const saved = (code: string) => join(progress, `${code}.json`);
  for (const subject of subjects.filter((s) => !only || only.includes(s.code))) {
    if (!test && existsSync(saved(subject.code))) continue;
    const raw = coursesFromSubjectPage(await get(subject.url), subject);
    // Subjects listed under two categories: each course's own page says which one.
    if (subject.categories.length > 1)
      for (const c of raw.filter((c) => !c.category)) c.category = categoryFromCoursePage(await get(c.detailUrl));
    const courses = toCourses(raw, subjects);
    console.log(`${subject.code}: ${courses.length} courses`);
    if (test) for (const c of courses) console.log(JSON.stringify(c, null, 2));
    else write(saved(subject.code), courses);
  }
  if (test) return console.log("\nCompare a few with the calendar by eye. No data files were written.");

  const missing = subjects.filter((s) => !existsSync(saved(s.code)));
  if (missing.length) return console.log(`\n${missing.length} subjects not read yet: run the same command again to fetch them.`);

  const all: Course[] = subjects.flatMap((s) => JSON.parse(readFileSync(saved(s.code), "utf8")));
  write(join(outDir, "subjects.json"), { scraped: today(), subjects });
  write(join(outDir, "courses.json"), { scraped: today(), courses: all });
  clearProgress(progress);
  console.log(`\nSaved ${all.length} courses to scraper/data/courses.json. ${all.filter((c) => !c.category).length} without a category.`);
}

main().catch((e) => {
  if (e instanceof Stop) {
    console.error(`\nStopped: ${e.message} Subjects already read are kept; run the same command later to carry on.`);
    process.exitCode = 2;
  } else throw e;
});
