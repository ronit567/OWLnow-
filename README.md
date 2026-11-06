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

To try the side panel in Chrome, open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and pick `apps/extension/dist/chrome`.

- **Plan:** [OWLnow: plan to build and launch](https://claude.ai/artifact/6GbwZDfXao99mSi2Uoz5kr)
- **Guide:** [OWLnow project guide](https://claude.ai/artifact/H5JCdSgoegtq7VaUrpQDmv)
- **Tickets:** [OWLnow tickets](https://docs.google.com/spreadsheets/d/1AQV2FfXRLQTeentn0DWQmqlKF_qXuAP1OJ8vMReEmHg/edit)
