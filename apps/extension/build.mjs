// Builds the extension for Chrome/Edge (dist/chrome) and Firefox (dist/firefox) from one source.
// The planner is a separate website; PLANNER_URL says where.
//   PLANNER_URL=https://owlnow.example/ npm run build
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const plannerUrl = process.env.PLANNER_URL ?? "http://localhost:5173/";

const base = {
  manifest_version: 3,
  name: "OWLnow",
  version: "0.1.0",
  description: "Every OWL deadline in one side panel, plus your courses for the planner.",
  permissions: ["storage"],
  host_permissions: ["https://westernu.brightspace.com/*"],
  icons: { 16: "icon-16.png", 48: "icon-48.png", 128: "icon-128.png" },
  action: { default_title: "OWLnow", default_icon: { 16: "icon-16.png", 48: "icon-48.png" } },
};

const chrome = {
  ...base,
  permissions: [...base.permissions, "sidePanel"],
  background: { service_worker: "background.js" },
  side_panel: { default_path: "sidepanel.html" },
};
const firefox = {
  ...base,
  background: { scripts: ["background.js"] },
  sidebar_action: { default_panel: "sidepanel.html", default_title: "OWLnow", default_icon: "icon-48.png" },
  browser_specific_settings: { gecko: { id: "owlnow@example.org", strict_min_version: "121.0" } },
};

const targets = [
  { out: "dist/chrome", manifest: chrome },
  { out: "dist/firefox", manifest: firefox },
];

for (const { out, manifest } of targets) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  await build({
    bundle: true,
    format: "iife",
    target: "es2022",
    outdir: out,
    logLevel: "warning",
    define: { __PLANNER_URL__: JSON.stringify(plannerUrl) },
    entryPoints: { background: "src/background.ts", sidepanel: "src/sidepanel.ts" },
  });
  for (const f of ["sidepanel.html", "sidepanel.css"]) cpSync(`src/${f}`, `${out}/${f}`);
  cpSync("static", out, { recursive: true });
  writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
  console.log(`built ${out}`);
}
