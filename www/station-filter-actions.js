import { app } from "./app.js";

const FILTER_DELAY_MS = 350;
const filterJobs = new Map();
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

function cancelFilterJob(role) {
  const job = filterJobs.get(role);
  if (!job) return;
  if (job.timer !== null) window.clearTimeout(job.timer);
  if (job.idle !== null && "cancelIdleCallback" in window) window.cancelIdleCallback(job.idle);
  filterJobs.delete(role);
}

function renderFilter(role, filterValue) {
  filterJobs.delete(role);
  app.renderStationPicker(
    role,
    app.state.context?.station_names || [],
    app.state.config,
    filterValue,
  );
  scheduleRoleSummaryRestore(role);
}

function scheduleFilter(role, filterValue) {
  cancelFilterJob(role);
  const job = { timer: null, idle: null };

  job.timer = window.setTimeout(() => {
    job.timer = null;
    const run = () => {
      if (filterJobs.get(role) !== job) return;
      renderFilter(role, filterValue);
    };

    // Rebuilding a large station result list is expensive. Do it only after
    // the user has paused, and preferably during an idle slice, so keystrokes
    // and the input's own paint are never competing with the list rebuild.
    if ("requestIdleCallback" in window) {
      job.idle = window.requestIdleCallback(run, { timeout: 750 });
    } else {
      job.idle = window.setTimeout(run, 0);
    }
  }, FILTER_DELAY_MS);

  filterJobs.set(role, job);
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

document.addEventListener("keydown", (event) => {
  const filter = event.target.closest?.(".route-selector-panel .station-filter[data-role]");
  if (!filter) return;
  // Cancel a pending expensive render before the next character is processed.
  cancelFilterJob(filter.dataset.role);
}, true);

document.addEventListener("input", (event) => {
  const filter = event.target.closest?.(".route-selector-panel .station-filter[data-role]");
  if (!filter) return;

  // Prevent app-events.js from rebuilding and sorting the full station list
  // synchronously inside the keyboard input event.
  event.stopPropagation();

  const role = filter.dataset.role;
  const filterValue = filter.value;

  // Synthetic input is used by "Unselect all" to clear the filter before
  // selecting rows. Keep that path synchronous so its behavior is unchanged.
  if (!event.isTrusted) {
    cancelFilterJob(role);
    renderFilter(role, filterValue);
    return;
  }

  scheduleFilter(role, filterValue);
}, true);

guardGlobalRouteSummaries();
