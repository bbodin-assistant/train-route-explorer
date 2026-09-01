const timeline = document.querySelector("#routes-time-chart");

const loopGuardStyle = document.createElement("style");
loopGuardStyle.textContent = `
  .timeline-row.route-loop-invalid {
    display: none !important;
  }
`;
document.head.append(loopGuardStyle);

function decodeLeg(bar) {
  if (!bar?.dataset.detail) return null;
  try {
    return JSON.parse(decodeURIComponent(bar.dataset.detail));
  } catch {
    return null;
  }
}

function legStations(leg) {
  const path = Array.isArray(leg?.path) ? leg.path : [];
  if (path.length) {
    return path.map((stop) => String(stop?.stop_name || "")).filter(Boolean);
  }
  return [String(leg?.departure_stop || ""), String(leg?.destination_stop || "")].filter(Boolean);
}

function rowHasStationLoop(row) {
  const seen = new Set();
  let previous = "";

  for (const bar of row.querySelectorAll(".timeline-bar.train[data-detail]")) {
    const leg = decodeLeg(bar);
    if (!leg) continue;
    const stations = legStations(leg);

    for (const [index, station] of stations.entries()) {
      // The transfer station is the last stop of one leg and the first stop of
      // the next. That adjacent duplicate is normal; a later repeat is a loop.
      if (index === 0 && station === previous) continue;
      if (seen.has(station)) return true;
      seen.add(station);
      previous = station;
    }
  }

  return false;
}

function validateRenderedRows() {
  for (const row of timeline?.querySelectorAll(".timeline-row") || []) {
    const invalid = rowHasStationLoop(row);
    row.classList.toggle("route-loop-invalid", invalid);
    if (invalid) row.dataset.routeLoopInvalid = "true";
    else delete row.dataset.routeLoopInvalid;
  }
}

if (timeline) {
  new MutationObserver(validateRenderedRows).observe(timeline, {
    childList: true,
    subtree: true,
  });
  validateRenderedRows();
}
