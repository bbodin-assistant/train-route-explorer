import assert from "node:assert/strict";
import test from "node:test";

import { createTimeline } from "../www/timeline.js";

function itinerary(date, departureMinutes) {
  return {
    date,
    departure_stop: "Departure",
    destination_stop: "Arrival",
    departure_minutes: departureMinutes,
    total_duration_minutes: 60,
    transfers: [],
    legs: [{
      departure_stop: "Departure",
      destination_stop: "Arrival",
      departure_minutes: departureMinutes,
      arrival_minutes: departureMinutes + 60,
      train_number: "1234",
      train_type: "TER",
      path: [],
    }],
  };
}

test("timeline groups a multi-day route window by service day", () => {
  const els = { timeline: { innerHTML: "" } };
  const state = {
    availableDays: ["20261231"],
    highlights: [],
    selectedTab: "out",
    routes: { outward: [], returns: [], days: [] },
  };
  const timeline = createTimeline({
    AUTO_REFRESH_DELAY_MS: 300,
    TRAIN_TYPE_COLORS: { TER: "#2f855a" },
    clockLabel: (minute) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:00`,
    els,
    escapeHtml: (value) => String(value),
    minutesToDuration: (minutes) => `${minutes}m`,
    readConfig: () => ({}),
    saveSettings: () => {},
    setBusy: () => {},
    state,
    worker: { postMessage: () => {} },
  });

  timeline.renderRoutes({
    selected_day: "20260901",
    days: ["20260901", "20260902", "20260903"],
    outward: [itinerary("20260901", 480), itinerary("20260903", 540)],
    returns: [],
  });

  assert.equal((els.timeline.innerHTML.match(/class="timeline-day-group"/g) || []).length, 3);
  assert.match(els.timeline.innerHTML, /data-day="20260901"[\s\S]*data-day="20260903"/);
  assert.match(els.timeline.innerHTML, /data-day="20260902"[\s\S]*No matching connections\./);
  assert.equal((els.timeline.innerHTML.match(/class="timeline-row"/g) || []).length, 2);
  assert.match(els.timeline.innerHTML, /id="timeline-load-more"[^>]*>Load 3 more days<\/button>/);
});
