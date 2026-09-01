import { app } from "./app.js";

const FILTER_DELAY_MS = 100;
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
  // layout.js observes picker DOM changes and derives the summary from the
  // currently rendered checkboxes. A filtered picker only contains visible
  // rows, so restore the summary from the authoritative global config after
  // all mutation observers for this turn have run.
  queueMicrotask(() => restoreRoleSummary(role));
}

function renderFilter(role, filterValue) {
  filterTimers.delete(role);
  app.renderStationPicker(
    role,
    app.state.context?.station_names || [],
    app.state.config,
    filterValue,
  );
  scheduleRoleSummaryRestore(role);
}

function guardGlobalRouteSummaries() {
  for (const role of stationRoles) {
    const picker = document.querySelector(`.station-picker[data-role="${role}"]`);
    if (!picker) continue;

    new MutationObserver(() => scheduleRoleSummaryRestore(role)).observe(picker, {
      childList: true,
      subtree: true,
    });

    // Checkbox changes update app.state.config before bubbling to the picker.
    // Re-sync here as well so the button always represents the full selection.
    picker.addEventListener("change", () => scheduleRoleSummaryRestore(role));
    restoreRoleSummary(role);
  }
}

document.addEventListener("input", (event) => {
  const filter = event.target.closest?.(".route-selector-panel .station-filter[data-role]");
  if (!filter) return;

  // Prevent app-events.js from rebuilding and sorting the full station list
  // synchronously inside the keyboard input event.
  event.stopPropagation();

  const role = filter.dataset.role;
  const filterValue = filter.value;
  const previousTimer = filterTimers.get(role);
  if (previousTimer !== undefined) window.clearTimeout(previousTimer);

  // Synthetic input is used by "Unselect all" to clear the filter before
  // selecting rows. Keep that path synchronous so its behavior is unchanged.
  if (!event.isTrusted) {
    renderFilter(role, filterValue);
    return;
  }

  // Let the browser paint the typed character first, then coalesce rapid
  // keystrokes and do the expensive list render after the user pauses briefly.
  const timer = window.setTimeout(() => renderFilter(role, filterValue), FILTER_DELAY_MS);
  filterTimers.set(role, timer);
}, true);

guardGlobalRouteSummaries();
