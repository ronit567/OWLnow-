// The service worker. OWL reads, alarms and reminders go here.

// Chrome and Edge open the side panel from the toolbar button. Firefox uses sidebar_action instead.
chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
