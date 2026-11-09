// Where the scrapers save, and how.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
export const today = () => new Date().toISOString().slice(0, 10);
export const write = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
