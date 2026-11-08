// Polite downloads: an honest name, one request every 2 seconds, and a full stop the moment
// Western asks us to slow down or shows a CAPTCHA. Never work around either.
const USER_AGENT = "OWLnow-calendar-scraper/0.1 (Western University student project; course facts for degree planning)";
const DELAY_MS = 2000;

export class Stop extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function get(url: string): Promise<string> {
  await sleep(DELAY_MS);
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if ([403, 429, 503].includes(res.status)) throw new Stop(`Western answered ${res.status}.`);
  const html = await res.text();
  if (/captcha|are you a robot|confirm you are human/i.test(html)) throw new Stop("Western is showing a CAPTCHA.");
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return html;
}
