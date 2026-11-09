// Where the scrapers save, and how.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
/** The finished data, committed to the repo. */
export const outDir = join(root, "data");
/** Pages read so far, so a stopped run can carry on. Git-ignored, and deleted once a run is complete. */
export const progressDir = join(root, ".progress");

/** Deletes a finished run's pages, and the progress folder once nothing is left in it. */
export function clearProgress(dir: string) {
  rmSync(dir, { recursive: true, force: true });
  try {
    if (!readdirSync(progressDir).length) rmSync(progressDir, { recursive: true });
  } catch {}
}

export const today = () => new Date().toISOString().slice(0, 10);
export function write(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}
