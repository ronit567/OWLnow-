// One GET against OWL's JSON API with the student's own cookies, and the API version lookup.
// Never throws: every way OWL can fail comes back as a Failure the panel can explain.

export const OWL = "https://westernu.brightspace.com";

export type Failure = {
  ok: false;
  reason: "signed-out" | "error";
  detail: string;
  /** The HTTP status, when OWL answered with one. */
  status?: number;
};
export type Got<T> = { ok: true; data: T } | Failure;

/** GETs a path on OWL and parses the JSON. */
export async function getJson<T>(get: typeof fetch, url: URL | string): Promise<Got<T>> {
  let res: Response;
  try {
    res = await get(new URL(url, OWL), {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    return { ok: false, reason: "error", detail: `Couldn't reach OWL: ${String(err)}` };
  }
  // Signed out, OWL answers with an error or sends us to its login page (HTML, not JSON).
  if (res.status === 401 || res.status === 403)
    return { ok: false, reason: "signed-out", detail: `OWL answered ${res.status}`, status: res.status };
  if (!res.ok) return { ok: false, reason: "error", detail: `OWL answered ${res.status}`, status: res.status };
  if (!res.headers.get("content-type")?.includes("application/json"))
    return { ok: false, reason: "signed-out", detail: "OWL sent a page instead of data" };
  try {
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, reason: "error", detail: "OWL sent data we couldn't read" };
  }
}

/** The API versions to use: lp for enrollments, le for assignments. */
export interface Versions {
  lp: string;
  le: string;
}

interface ProductVersion {
  ProductCode: string;
  LatestVersion: string;
}

/** Asks OWL which API versions it runs, so the reader doesn't break when Western upgrades. */
export async function readVersions(get: typeof fetch = fetch): Promise<({ ok: true } & Versions) | Failure> {
  const got = await getJson<ProductVersion[]>(get, "/d2l/api/versions/");
  if (!got.ok) return got;
  if (!Array.isArray(got.data)) return { ok: false, reason: "error", detail: "OWL's answer wasn't a list of API versions" };
  const latest = (code: string) => got.data.find((p) => p?.ProductCode === code)?.LatestVersion;
  const lp = latest("lp");
  const le = latest("le");
  if (!lp || !le) return { ok: false, reason: "error", detail: "OWL didn't list the lp and le APIs" };
  return { ok: true, lp, le };
}
