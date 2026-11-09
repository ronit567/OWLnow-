// Downloads the degree requirements and every module's requirements from the Academic Calendar and
// saves them as text. Turning that text into checks is a separate step, with sign-off.
// For a team member to run on their own laptop: Western's robots.txt blocks AI tools.
//
//   npm run scrape:modules -- --test                 degree page and one module, printed, nothing written
//   npm run scrape:modules -- --test --ids 21580     degree page and this module, printed, nothing written
//   npm run scrape:modules -- --ids 21580,21600      just these modules
//   npm run scrape:modules                           everything (about 30 minutes)
//   npm run scrape:modules -- --fresh                start over, e.g. when the new calendar comes out
//
// Each module's file is written as soon as its page is read, and a rerun skips modules that already
// have one, so it's safe to stop (Ctrl+C) and run again later.
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Module } from "../../apps/web/src/data/library.ts";
import { PageError, Stop, get } from "./fetch.ts";
import { DEGREE_PAGE, MODULES_PAGE, moduleLinks, pageText, type ModuleLink, type PageText } from "./pages.ts";
import { outDir, today, write } from "./save.ts";

const modulesDir = join(outDir, "modules");
const degreeFile = join(outDir, "degree-requirements.json");
const combinedFile = join(outDir, "modules.json");
const indexFile = join(outDir, "modules-index.json");
const args = process.argv.slice(2);
const test = args.includes("--test");
const only = args.includes("--ids") ? args[args.indexOf("--ids") + 1].split(",") : null;

/** A module as saved: the website's Module, plus the calendar's wording. */
type ModuleRecord = Module & PageText & ModuleLink;

function print(page: PageText) {
  console.log(`\n${page.title}`);
  for (const s of page.sections) {
    if (s.heading) console.log(`\n## ${s.heading}`);
    for (const line of s.lines) console.log(`   ${line}`);
  }
}

/** The degree requirements: one page holds the whole policy section. A rerun keeps the saved file; --fresh reads it again. */
async function degrees() {
  if (!test && existsSync(degreeFile)) return;
  const page = pageText(await get(DEGREE_PAGE));
  if (!page.sections.length) throw new Error("Found no text on the degree requirements page. The page layout may have changed: check pages.ts.");
  console.log(`Degree requirements: ${page.sections.length} sections`);
  if (test) print(page);
  else write(degreeFile, { scraped: today(), url: DEGREE_PAGE, ...page });
}

async function main() {
  if (args.includes("--fresh")) for (const path of [modulesDir, degreeFile, combinedFile, indexFile]) rmSync(path, { recursive: true, force: true });
  if (!test) mkdirSync(modulesDir, { recursive: true });

  await degrees();

  const list = moduleLinks(await get(MODULES_PAGE));
  if (!list.length) throw new Error("Found no modules on the Modules page. The page layout may have changed: check pages.ts.");
  console.log(`${list.length} modules on the Modules page`);

  const chosen = only ? list.filter((m) => only.includes(m.id)) : test ? list.slice(0, 1) : list;
  const unread: string[] = [];
  let done = 0;
  for (const mod of chosen) {
    const file = join(modulesDir, `${mod.id}.json`);
    if (!test && existsSync(file)) continue;
    try {
      const text = pageText(await get(mod.url));
      if (!text.sections.length) throw new PageError("no text on the page");
      if (test) print(text);
      // The page's own heading is the module's real name; the list only gives a type and an area.
      else write(file, { ...mod, ...text, name: text.sections.find((s) => s.heading)?.heading ?? mod.name, requirements: null, scraped: today() });
    } catch (e) {
      if (!(e instanceof PageError)) throw e;
      unread.push(`${mod.id} ${mod.name}: ${e.message}`);
    }
    if (++done % 25 === 0) console.log(`${done} modules read this run`);
  }
  if (test) return console.log("\nCompare with the calendar by eye. No data files were written.");

  // The combined file and the index cover every module file saved so far.
  const all: ModuleRecord[] = list
    .map((m) => join(modulesDir, `${m.id}.json`))
    .filter((f) => existsSync(f))
    .map((f) => JSON.parse(readFileSync(f, "utf8")));
  write(combinedFile, { scraped: today(), modules: all });
  write(indexFile, { scraped: today(), modules: all.map((m) => ({ id: m.id, name: m.name, type: m.type, area: m.area })) });

  console.log(`\nSaved ${all.length} of ${list.length} modules to scraper/data/.`);
  if (unread.length) console.log(`Couldn't read ${unread.length}; running the same command again retries them:\n${unread.join("\n")}`);
  if (all.length < list.length && !only) console.log("Run the same command again to fetch the rest.");
}

main().catch((e) => {
  if (e instanceof Stop) {
    console.error(`\nStopped: ${e.message} Pages already saved are kept; run the same command later to carry on.`);
    process.exitCode = 2;
  } else throw e;
});
