// The service worker. OWL reads, alarms and reminders go here.
import {
  READ_ALARM,
  READ_COURSES,
  READ_EVERY_MINUTES,
  refreshOwl,
  type SavedOwl,
} from "./owl/store";

// Chrome and Edge open the side panel from the toolbar button. Firefox uses sidebar_action instead.
chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

/** The read in progress, so a button press during a startup read waits for it instead of reading twice. */
let reading: Promise<SavedOwl | null> | null = null;

type Trigger = "alarm" | "install" | "startup" | "panel";

/** Reads OWL and saves the result. Never throws: null means the read couldn't even be saved. */
function readOwl(trigger: Trigger): Promise<SavedOwl | null> {
  if (reading) {
    console.log(
      `OWLnow: read asked for by ${trigger}, joining the read already running`,
    );
    return reading;
  }
  console.log(`OWLnow: reading OWL (${trigger})`);
  reading = refreshOwl(chrome.storage.local)
    .then((saved) => {
      const { courses, deadlines } = saved;
      if (courses.last.ok)
        console.log(`OWLnow: read ${courses.courses.length} courses`);
      else
        console.log(
          `OWLnow: read failed (${courses.last.reason}): ${courses.last.detail}`,
        );
      if (deadlines.last.ok)
        console.log(
          `OWLnow: read ${deadlines.deadlines.length} assignments` +
            (deadlines.skipped.length
              ? `, skipped ${deadlines.skipped.join("; ")}`
              : ""),
        );
      else if (courses.last.ok)
        console.log(
          `OWLnow: assignments read failed (${deadlines.last.reason}): ${deadlines.last.detail}`,
        );
      return saved;
    })
    .catch((err: unknown) => {
      console.error("OWLnow: reading OWL failed", err);
      return null;
    })
    .finally(() => {
      reading = null;
    });
  return reading;
}

// Read every 30 minutes, as the welcome card promises. Chrome may drop alarms when the browser
// restarts, so this checks on every wake-up. It only creates the alarm when it's missing:
// creating it again each time would restart the countdown and it might never ring.
chrome.alarms.get(READ_ALARM).then((alarm) => {
  if (!alarm)
    chrome.alarms.create(READ_ALARM, { periodInMinutes: READ_EVERY_MINUTES });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === READ_ALARM) void readOwl("alarm");
});

// Read once when the extension is installed or updated, and each time the browser starts.
chrome.runtime.onInstalled.addListener(() => void readOwl("install"));
chrome.runtime.onStartup.addListener(() => void readOwl("startup"));

// The side panel asks for a fresh read and always gets an answer: the saved result, or null.
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || message?.type !== READ_COURSES)
    return false;
  readOwl("panel").then(reply);
  return true; // The reply comes later, once OWL has answered.
});
