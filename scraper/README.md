# Calendar scraper

Downloads [courses](https://westerncalendar.uwo.ca/Courses.cfm?SelectedCalendar=Live&ArchiveID=), [modules](https://westerncalendar.uwo.ca/Modules.cfm?SelectedCalendar=Live&ArchiveID=) and [degree requirements](https://westerncalendar.uwo.ca/PolicyPages.cfm?Command=showCategory&PolicyCategoryID=4&SelectedCalendar=Live&ArchiveID=) from Western's Academic Calendar and saves them as JSON.

Run it on your own laptop. Western's robots.txt blocks AI tools, so no AI agent fetches these pages.

```sh
npm run scrape:courses -- --test                    # Computer Science only, printed; no data files written
npm run scrape:courses -- --subjects COMPSCI,MATH   # just these subjects
npm run scrape:courses                              # everything, about 10 minutes
npm run scrape:courses -- --fresh                   # start over

npm run scrape:modules -- --test                    # degree page and one module, printed; no data files written
npm run scrape:modules -- --ids 21580,21600         # degree page and just these modules
npm run scrape:modules                              # everything, about 30 minutes
npm run scrape:modules -- --fresh                   # start over
```

`--fresh` only clears its own command's files.

It sends one request every 2 seconds under an honest name. It stops at any 403, 429, 503 or CAPTCHA. Don't work around a stop: wait and run it again later.

## Where things go

Only the data is saved, in `scraper/data/`:

- `subjects.json` lists each subject's code, name, link and breadth categories.
- `courses-index.json` lists every course's code and title, for search.
- `courses/<SUBJECT>.json` holds full course records: name, weight, prerequisite and antirequisite text, and antireq codes. These are the scraper's working files.
- `courses.json` holds every course record in one file, written at the end of each run. This is the file the website loads.
- `modules-index.json` lists every module's id, name, type and area, for search.
- `modules/<ModuleID>.json` holds one module's requirements as text: headings and lines, as the calendar words them. `requirements` stays `null` until the text is turned into checks and signed off. These are the scraper's working files.
- `modules.json` holds every module in one file, written at the end of each run.
- `degree-requirements.json` holds the degree policy page as text. The rules in `DEGREE_RULES` are written from it by hand.

Each subject's or module's file is written as soon as it's done. Stop any time with Ctrl+C; running the same command again skips anything that already has a file. Use `--fresh` to start over, for example when a new calendar comes out.

If a single module page can't be read, the run carries on, lists it at the end, and tries it again next run.

## Files

- `src/fetch.ts` handles polite downloading.
- `src/pages.ts` reads the HTML. If Western changes its layout, fix it here.
- `src/convert.ts` turns calendar courses into the website's `Course` (weight, essay, campus, antireq codes).
- `src/courses.ts` and `src/modules.ts` are the commands.
- `src/save.ts` says where data goes.
