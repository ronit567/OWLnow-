// The service worker. OWL reads, alarms and reminders go here.
import { READ_COURSES, refreshCourses, type SavedCourses } from "./owl/store";

// Chrome and Edge open the side panel from the toolbar button. Firefox uses sidebar_action instead.
chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

/** The read in progress, so a button press during a startup read waits for it instead of reading twice. */
let reading: Promise<SavedCourses> | null = null;

function readOwlCourses(): Promise<SavedCourses> {
  reading ??= refreshCourses(chrome.storage.local).finally(() => {
    reading = null;
  });
  return reading;
}

// Read once when the extension is installed or updated, and each time the browser starts.
chrome.runtime.onInstalled.addListener(() => void readOwlCourses());
chrome.runtime.onStartup.addListener(() => void readOwlCourses());

// The side panel asks for a fresh read and gets the saved result back.
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || message?.type !== READ_COURSES) return false;
  readOwlCourses().then(reply);
  return true; // The reply comes later, once OWL has answered.
});
