const timeline = document.querySelector("#routes-time-chart");

const routeGuardStyle = document.createElement("style");
routeGuardStyle.textContent = `
  .timeline-row.route-loop-invalid,
  .timeline-row.route-duplicate-invalid {
    display: none !important;
  }
`;
document.head.append(routeGuardStyle);

function decodeLeg(bar) {
  if (!bar?.dataset.detail) return null;
  try {
    return JSON.parse(decodeURIComponent(bar.dataset.detail));
  } catch {
    return null;
  }
}

function rowLegs(row) {
  return Array.from(row.querySelectorAll(".timeline-bar.train[data-detail]"))
    .map(decodeLeg)
    .filter(Boolean);
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

  for (const leg of rowLegs(row)) {
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

function scheduleKey(row, legs) {
  const first = legs[0];
  const last = legs.at(-1);
  if (!first || !last) return "";
  return [
    String(row.dataset.day || ""),
    String(first.departure_stop || ""),
    String(last.destination_stop || ""),
    Number(first.departure_minutes),
    Number(last.arrival_minutes),
  ].join("|");
}

function commercialJourneyKey(row, legs) {
  const serviceLegs = legs.map((leg) => [
    String(leg?.train_type || "Unknown"),
    String(leg?.train_number || ""),
    String(leg?.departure_stop || ""),
    String(leg?.destination_stop || ""),
    Number(leg?.departure_minutes),
    Number(leg?.arrival_minutes),
  ]);
  return JSON.stringify([String(row.dataset.day || ""), serviceLegs]);
}

function markDuplicateRows(rows) {
  const candidates = [];

  for (const row of rows) {
    row.classList.remove("route-duplicate-invalid");
    delete row.dataset.routeDuplicateInvalid;
    delete row.dataset.routeDuplicateReason;

    // Via "only" mode uses the native hidden attribute. Do not let a route
    // that is unavailable in the current Via mode dominate one that is valid.
    if (row.hidden || row.classList.contains("route-loop-invalid")) continue;
    const legs = rowLegs(row);
    if (!legs.length) continue;
    candidates.push({
      row,
      legs,
      transferCount: Math.max(0, legs.length - 1),
      commercialKey: commercialJourneyKey(row, legs),
      scheduleKey: scheduleKey(row, legs),
    });
  }

  // SNCF can expose multiple raw GTFS trip IDs for the same passenger-visible
  // service. Timeline details deliberately ignore those opaque IDs here.
  const seenCommercial = new Set();
  for (const candidate of candidates) {
    if (seenCommercial.has(candidate.commercialKey)) {
      candidate.row.classList.add("route-duplicate-invalid");
      candidate.row.dataset.routeDuplicateInvalid = "true";
      candidate.row.dataset.routeDuplicateReason = "same-service";
      continue;
    }
    seenCommercial.add(candidate.commercialKey);
  }

  // For an identical origin/departure/destination/arrival schedule, an option
  // with extra changes is dominated even when it introduces another brand on
  // the way. Keep all minimum-transfer alternatives, so INOUI/OUIGO choices
  // with the same number of changes remain visible.
  const bestTransferCount = new Map();
  for (const candidate of candidates) {
    if (candidate.row.classList.contains("route-duplicate-invalid")) continue;
    const current = bestTransferCount.get(candidate.scheduleKey);
    if (current === undefined || candidate.transferCount < current) {
      bestTransferCount.set(candidate.scheduleKey, candidate.transferCount);
    }
  }
  for (const candidate of candidates) {
    if (candidate.row.classList.contains("route-duplicate-invalid")) continue;
    const best = bestTransferCount.get(candidate.scheduleKey);
    if (best !== undefined && candidate.transferCount > best) {
      candidate.row.classList.add("route-duplicate-invalid");
      candidate.row.dataset.routeDuplicateInvalid = "true";
      candidate.row.dataset.routeDuplicateReason = "extra-transfer";
    }
  }
}

function validateRenderedRows() {
  const rows = Array.from(timeline?.querySelectorAll(".timeline-row") || []);
  for (const row of rows) {
    const invalid = rowHasStationLoop(row);
    row.classList.toggle("route-loop-invalid", invalid);
    if (invalid) row.dataset.routeLoopInvalid = "true";
    else delete row.dataset.routeLoopInvalid;
  }
  markDuplicateRows(rows);
}

if (timeline) {
  new MutationObserver(validateRenderedRows).observe(timeline, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden"],
  });
  validateRenderedRows();
  timeline.dataset.routeGuardReady = "true";
}
