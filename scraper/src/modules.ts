// Downloads every module's requirements and the degree requirements from the Academic Calendar, and
// saves them in scraper/data/modules.json and degree-requirements.json. Each module's wording is split
// into admission, courses, progression and graduation. Turning that text into checks is a separate step.
// For a team member to run on their own laptop: Western's robots.txt blocks AI tools.
//
//   npm run scrape:modules -- --test                 degree page and one module, printed, nothing written
//   npm run scrape:modules -- --test --ids 21580     degree page and this module, printed, nothing written
//   npm run scrape:modules                           everything (about 26 minutes)
//   npm run scrape:modules -- --fresh                throw away a stopped run and start over
//
// Each module's page is kept in scraper/.progress/ as soon as it's read, so it's safe to stop
// (Ctrl+C) and run the same command again later. Once every module is read, that folder is deleted.
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { toDegreeRequirements, toModule } from "./convert.ts";
import { PageError, Stop, get } from "./fetch.ts";
import { DEGREE_PAGE, MODULES_PAGE, moduleLinks, pageText, type ModuleLink, type PageText } from "./pages.ts";
import { clearProgress, outDir, progressDir, today, write } from "./save.ts";

const progress = join(progressDir, "modules");
const args = process.argv.slice(2);
const test = args.includes("--test");
const only = args.includes("--ids") ? args[args.indexOf("--ids") + 1].split(",") : null;

async function main() {
  if (args.includes("--fresh")) rmSync(progress, { recursive: true, force: true });
  if (!test) mkdirSync(progress, { recursive: true });

  const degree = toDegreeRequirements(pageText(await get(DEGREE_PAGE)));
  if (!degree.sections.length) throw new Error("Found no text on the degree requirements page. The page layout may have changed: check pages.ts.");
  console.log(`Degree requirements: ${degree.sections.length} sections`);
  if (test) console.log(JSON.stringify(degree, null, 2));

  const list = moduleLinks(await get(MODULES_PAGE));
  if (!list.length) throw new Error("Found no modules on the Modules page. The page layout may have changed: check pages.ts.");
  console.log(`${list.length} modules on the Modules page`);

  const saved = (id: string) => join(progress, `${id}.json`);
  const chosen = only ? list.filter((m) => only.includes(m.id)) : test ? list.slice(0, 1) : list;
  const unread: string[] = [];
  let done = 0;
  for (const link of chosen) {
    if (!test && existsSync(saved(link.id))) continue;
    try {
      const page = pageText(await get(link.url));
      if (!page.sections.length) throw new PageError("no text on the page");
      // The raw page is kept until the run is complete, so a change to toModule needs no new download.
      if (test) console.log(JSON.stringify(toModule(link, page), null, 2));
      else write(saved(link.id), { link, page });
    } catch (e) {
      if (!(e instanceof PageError)) throw e;
      unread.push(`${link.id} ${link.name}: ${e.message}`);
    }
    if (++done % 25 === 0) console.log(`${done} modules read this run`);
  }
  if (test) return console.log("\nCompare with the calendar by eye. No data files were written.");

  if (unread.length) console.log(`\nCouldn't read ${unread.length}:\n${unread.join("\n")}`);
  const missing = list.filter((m) => !existsSync(saved(m.id)));
  if (missing.length) return console.log(`\n${missing.length} modules not read yet: run the same command again to fetch them.`);

  const modules = list.map((m) => {
    const { link, page }: { link: ModuleLink; page: PageText } = JSON.parse(readFileSync(saved(m.id), "utf8"));
    return toModule(link, page);
  });
  write(join(outDir, "degree-requirements.json"), { scraped: today(), url: DEGREE_PAGE, ...degree });
  write(join(outDir, "modules.json"), { scraped: today(), modules });
  clearProgress(progress);
  console.log(`\nSaved ${modules.length} modules to scraper/data/modules.json and the degree requirements to degree-requirements.json.`);
}

main().catch((e) => {
  if (e instanceof Stop) {
    console.error(`\nStopped: ${e.message} Pages already read are kept; run the same command later to carry on.`);
    process.exitCode = 2;
  } else throw e;
});
