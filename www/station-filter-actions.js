import { app } from "./app.js?v=0.16";

const FILTER_DELAY_MS = 120;
const MAX_UNSELECTED_RESULTS = 100;
const filterTimers = new Map();
const stationRoles = ["local_origins", "connection_stations", "side_b_destinations"];

function compactStationNames(values) {
  if (!values.length) return "None";
  if (values.length <= 2) return values.join(" / ");
  return `${values[0]} / ${values[1]} +${values.length - 2}`;
}

function restoreRoleSummary(role) {
  const value = document.querySelector(`[data-route-value="${role}"]`);
  if (value) value.textContent = compactStationNames(app.state.config[role] || []);
}

function scheduleRoleSummaryRestore(role) {
  queueMicrotask(() => restoreRoleSummary(role));
}

function cancelFilterTimer(role) {
  const timer = filterTimers.get(role);
  if (timer !== undefined) window.clearTimeout(timer);
  filterTimers.delete(role);
}

function stationCandidates(role, filterValue) {
  const normalizedFilter = filterValue.trim().toLocaleLowerCase();
  const selectedValues = app.state.config[role] || [];
  const selected = new Set(selectedValues);
  const candidates = [];
  const seen = new Set();

  // Always keep every selected station that matches the current query. This
  // means the result cap never makes an existing selection inaccessible.
  for (const station of selectedValues) {
    if (normalizedFilter && !station.toLocaleLowerCase().includes(normalizedFilter)) continue;
    if (seen.has(station)) continue;
    seen.add(station);
    candidates.push(station);
  }

  let unselectedCount = 0;
  for (const station of app.state.context?.station_names || []) {
    if (selected.has(station) || seen.has(station)) continue;
    if (normalizedFilter && !station.toLocaleLowerCase().includes(normalizedFilter)) continue;
    seen.add(station);
    candidates.push(station);
    unselectedCount += 1;
    if (unselectedCount >= MAX_UNSELECTED_RESULTS) break;
  }

  return candidates;
}

function renderFilter(role, filterValue) {
  filterTimers.delete(role);
  app.renderStationPicker(
    role,
    stationCandidates(role, filterValue),
    app.state.config,
    filterValue,
  );
  scheduleRoleSummaryRestore(role);
}

function trimStationChecklist(role) {
  const picker = document.querySelector(`.station-picker[data-role="${role}"]`);
  const checklist = picker?.querySelector(".station-checklist");
  if (!checklist || checklist.childElementCount <= MAX_UNSELECTED_RESULTS) return;

  const keep = [];
  let unselectedCount = 0;
  for (const row of Array.from(checklist.children)) {
    const checked = row.querySelector('input[type="checkbox"]:checked');
    if (checked) {
      keep.push(row);
      continue;
    }
    if (unselectedCount < MAX_UNSELECTED_RESULTS) {
      keep.push(row);
      unselectedCount += 1;
    }
  }

  if (keep.length < checklist.childElementCount) checklist.replaceChildren(...keep);
}

function guardGlobalRouteSummaries() {
  for (const role of stationRoles) {
    const picker = document.querySelector(`.station-picker[data-role="${role}"]`);
    if (!picker) continue;

    new MutationObserver(() => {
      // app.js can rebuild every station after GTFS context changes. Keep the
      // live DOM small even before the user starts filtering; thousands of
      // checkbox rows make ordinary text-input layout noticeably expensive.
      trimStationChecklist(role);
      scheduleRoleSummaryRestore(role);
    }).observe(picker, {
      childList: true,
      subtree: true,
    });

    picker.addEventListener("change", () => scheduleRoleSummaryRestore(role));
    trimStationChecklist(role);
    restoreRoleSummary(role);
  }
}

document.addEventListener("keydown", (event) => {
  const filter = event.target.closest?.(".station-filter[data-role]");
  if (!filter?.closest(".station-picker[data-role]")) return;
  cancelFilterTimer(filter.dataset.role);
}, true);

document.addEventListener("input", (event) => {
  const filter = event.target.closest?.(".station-filter[data-role]");
  if (!filter?.closest(".station-picker[data-role]")) return;

  // Stop the original app-events.js listener, which rebuilds the full station
  // list synchronously for each input event.
  event.stopPropagation();

  const role = filter.dataset.role;
  const filterValue = filter.value;
  cancelFilterTimer(role);

  // Synthetic input is used by station actions and should remain immediate.
  if (!event.isTrusted) {
    renderFilter(role, filterValue);
    return;
  }

  // The eventual render contains at most the selected stations plus 100
  // unselected matches, so it stays cheap enough not to block subsequent keys.
  const timer = window.setTimeout(() => renderFilter(role, filterValue), FILTER_DELAY_MS);
  filterTimers.set(role, timer);
}, true);

guardGlobalRouteSummaries();
