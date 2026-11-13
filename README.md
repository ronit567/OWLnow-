# OWLnow

The front end for OWLnow: a planner website and a browser extension side panel for Western students.

- `apps/web`: the planner website (Vite + React) with Progress, Plan, Deadlines and My courses.
- `apps/extension`: the extension (Chrome, Edge, Firefox) with the deadline side panel.
- `packages/deadlines`: how deadlines are grouped, labelled and exported, shared by both.

There's no data yet. Courses and modules go in `apps/web/src/data/library.ts`, a student's OWL courses and deadlines come from the extension (see `App.tsx` and `sidepanel.ts`), and both screens show empty states until then.

## Run it

Requires Node 20+.

```sh
npm install
npm run dev          # website at http://localhost:5173
npm run build        # website + extension (apps/extension/dist/chrome and dist/firefox)
npm run typecheck
```

Every pull request runs `npm run typecheck`, `npm test` and `npm run build` on GitHub. Run them yourself before you push to catch problems early.

To try the side panel in Chrome, open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and pick `apps/extension/dist/chrome`.

- **Roadmap:** [OWLnow roadmap](https://claude.ai/artifact/R7BNLJ8BXaJhKi4y4V2M6F)
- **System design:** [OWLnow system design](https://claude.ai/artifact/5xy3kEk5PxbqMeFFPExxXz)
- **Tickets:** [OWLnow tickets](https://docs.google.com/spreadsheets/d/1AQV2FfXRLQTeentn0DWQmqlKF_qXuAP1OJ8vMReEmHg/edit)
