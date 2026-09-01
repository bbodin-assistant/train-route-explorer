import { app } from "./app.js";

const FILTER_DELAY_MS = 100;
const filterTimers = new Map();

function compactStationNames(values) {
  if (!values.length) return "None";
  if (values.length <= 2) return values.join(" / ");
  return `${values[0]} / ${values[1]} +${values.length - 2}`;
}

function restoreRoleSummary(role) {
  const value = document.querySelector(`[data-route-value="${role}"]`);
  if (value) value.textContent = compactStationNames(app.state.config[role] || []);
}

function renderFilter(role, filterValue) {
  filterTimers.delete(role);
  app.renderStationPicker(
    role,
    app.state.context?.station_names || [],
    app.state.config,
    filterValue,
  );
  restoreRoleSummary(role);
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
