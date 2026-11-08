# Calendar scraper

Downloads course facts from Western's [Academic Calendar](https://westerncalendar.uwo.ca/Courses.cfm?SelectedCalendar=Live&ArchiveID=) and saves them as JSON.

Run it on your own laptop. Western's robots.txt blocks AI tools, so no AI agent fetches these pages.

```sh
npm run scrape:courses -- --test                    # Computer Science only, printed; no data files written
npm run scrape:courses -- --subjects COMPSCI,MATH   # just these subjects
npm run scrape:courses                              # everything, about 10 minutes
npm run scrape:courses -- --fresh                   # start over
```

It sends one request every 2 seconds under an honest name. It stops at any 403, 429, 503 or CAPTCHA. Don't work around a stop: wait and run it again later.

## Where things go

Only the data is saved, in `scraper/data/`:

- `subjects.json` lists each subject's code, name, link and breadth categories.
- `courses-index.json` lists every course's code and title, for search.
- `courses/<SUBJECT>.json` holds full course records: name, weight, prerequisite and antirequisite text, and antireq codes. These are the scraper's working files.
- `courses.json` holds every course record in one file, written at the end of each run. This is the file the website loads.

Each subject's file is written as soon as that subject is done. Stop any time with Ctrl+C; running the same command again skips subjects that already have a file. Use `--fresh` to start over, for example when a new calendar comes out.

## Files

- `src/fetch.ts` handles polite downloading.
- `src/pages.ts` reads the HTML. If Western changes its layout, fix it here.
- `src/convert.ts` turns calendar courses into the website's `Course` (weight, essay, campus, antireq codes).
- `src/courses.ts` is the command.
