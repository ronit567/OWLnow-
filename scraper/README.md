# Calendar scraper

Downloads [courses](https://westerncalendar.uwo.ca/Courses.cfm?SelectedCalendar=Live&ArchiveID=), [modules](https://westerncalendar.uwo.ca/Modules.cfm?SelectedCalendar=Live&ArchiveID=) and [degree requirements](https://westerncalendar.uwo.ca/PolicyPages.cfm?Command=showCategory&PolicyCategoryID=4&SelectedCalendar=Live&ArchiveID=) from Western's Academic Calendar and saves them as JSON.

Run it on your own laptop. Western's robots.txt blocks AI tools, so no AI agent fetches these pages.

```sh
npm run scrape:courses -- --test                    # Computer Science only, printed; nothing saved
npm run scrape:courses                              # every course, about 10 minutes

npm run scrape:modules -- --test                    # degree page and one module, printed; nothing saved
npm run scrape:modules -- --test --ids 21580        # degree page and this module, printed; nothing saved
npm run scrape:modules                              # every module and the degree page, about 26 minutes
```

It sends one request every 2 seconds under an honest name. It stops at any 403, 429, 503 or CAPTCHA. Don't work around a stop: wait and run it again later.

## The data

Everything is in `scraper/data/`:

| File | What's in it |
|---|---|
| `courses.json` | Every course: code, title, weight, breadth category, essay, campus, prerequisite and antirequisite text, and antirequisite codes. |
| `modules.json` | Every module: ID, name, type, area, faculty, department, link, and its wording split into `admission`, `courses`, `progression` and `graduation`. |
| `degree-requirements.json` | The degree requirements policy page as text, under its headings. `DEGREE_RULES` in the website is written from it by hand. |
| `subjects.json` | Each subject's code, name and breadth categories. |

Courses and modules match `Course` and `Module` in `apps/web/src/data/library.ts`.

A few things to know about `modules.json`:
- **Wording is kept as written,** one line per entry. Turning lines like "1.0 course from: …" into checks is a separate step, so `requirements` is `null` for now.
- **Look modules up by `id`**, since a few names repeat.
- **Combined degrees, certificates and non-modular programs** have no standard layout, so their main text is in `other`. So is anything else that fits no part, like fees or exchange programs, under its own heading.

To read the data:

```ts
const { modules } = JSON.parse(readFileSync("scraper/data/modules.json", "utf8"));
modules.find((m) => m.id === "21112").courses; // one module's course list
modules.filter((m) => m.type === "Minor"); // every minor
```

## Stopping and starting again

Press Ctrl+C any time, then run the same command again to carry on. Pages read so far are kept in `scraper/.progress/`, which git ignores. The files in `scraper/data/` are only replaced once every page has been read, and then `.progress/` is deleted.

`--fresh` throws away a stopped run and starts over. A new run after a complete one always starts over, for example when a new calendar comes out.

If a single module page can't be read, the run carries on, lists it at the end, and tries it again next run.

## Files

- `src/fetch.ts` handles polite downloading.
- `src/pages.ts` reads the HTML. If Western changes its layout, fix it here.
- `src/convert.ts` turns what was read into the website's `Course` and `Module`, including splitting each module into its parts.
- `src/courses.ts` and `src/modules.ts` are the commands.
- `src/save.ts` says where data goes.
