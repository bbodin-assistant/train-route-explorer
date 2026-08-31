const routeSettings = document.querySelector(".route-settings-menu");
const dataMenu = document.querySelector(".data-menu");
const routeConfig = document.querySelector("#route-config-controls");
const directionTabs = document.querySelector("#route-direction-tabs");
const timeline = document.querySelector("#routes-time-chart");
const routeSummary = document.querySelector(".route-summary");

const layoutEnhancementStyle = document.createElement("style");
layoutEnhancementStyle.textContent = `
  .timeline {
    height: calc(100vh - var(--header-height) - var(--toolbar-primary-height) - var(--route-summary-height) - 18px);
    min-height: 320px;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }

  .timeline-empty {
    min-height: calc(100% - 20px);
  }

  .timeline-sticky-head {
    position: sticky;
    top: 0;
    z-index: 14;
    min-width: calc(var(--timeline-label-width) + var(--timeline-lane-min-width));
    background: var(--paper);
    box-shadow: 0 1px 0 #cdd2cf;
  }

  .timeline-sticky-head .timeline-legend,
  .timeline-sticky-head .timeline-scale {
    background: var(--paper);
  }

  .route-summary {
    grid-template-columns: minmax(0, 1fr) 20px minmax(0, 1fr) 20px minmax(0, 1fr) !important;
    align-items: stretch !important;
    min-height: 44px !important;
    padding: 0 10px !important;
    overflow: visible !important;
  }

  .route-summary-item {
    position: relative;
    min-width: 0;
    display: flex;
    align-items: stretch;
  }

  .route-summary-stop {
    width: 100%;
    min-width: 0;
    display: flex !important;
    align-items: baseline !important;
    gap: 8px !important;
    border: 0 !important;
    border-radius: 0 !important;
    padding: 8px 4px !important;
    background: transparent !important;
    color: #4f5961 !important;
    text-align: left;
    white-space: nowrap;
  }

  .route-summary-stop:hover,
  .route-summary-stop[aria-expanded="true"] {
    background: transparent !important;
    color: #18202a !important;
  }

  .route-summary-stop:hover strong,
  .route-summary-stop[aria-expanded="true"] strong {
    text-decoration: underline;
    text-decoration-color: #b8bec0;
    text-underline-offset: 3px;
  }

  .route-summary-stop span {
    flex: 0 0 auto;
    color: #8a9296 !important;
    font-size: 9px !important;
    font-weight: 700 !important;
    letter-spacing: 0.09em !important;
  }

  .route-summary-stop strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #303a42 !important;
    font-size: 12px !important;
    font-weight: 600 !important;
  }

  .route-summary-stop::after {
    display: none !important;
  }

  .route-summary-arrow {
    align-self: center;
    color: #b7bcbd !important;
    font-size: 13px !important;
  }

  .route-selector-panel {
    position: absolute;
    top: calc(100% + 1px);
    z-index: 45;
    width: min(360px, calc(100vw - 28px));
    max-height: min(460px, calc(100vh - var(--header-height) - var(--toolbar-primary-height) - 30px));
    overflow: auto;
    padding: 8px;
    border: 1px solid #c7cdca;
    background: #fffef9;
    box-shadow: 0 12px 28px rgba(24, 32, 42, 0.16);
  }

  .route-summary-item[data-route-item="local_origins"] .route-selector-panel {
    left: 0;
  }

  .route-summary-item[data-route-item="connection_stations"] .route-selector-panel {
    left: 50%;
    transform: translateX(-50%);
  }

  .route-summary-item[data-route-item="side_b_destinations"] .route-selector-panel {
    right: 0;
  }

  .route-selector-panel[hidden] {
    display: none;
  }

  .route-selector-panel .station-picker {
    margin: 0;
    border: 0;
    padding: 0;
    background: transparent;
  }

  .route-selector-panel .station-picker legend {
    padding: 0 0 7px;
    color: #5f6970;
    font-size: 11px;
    font-weight: 700;
  }

  .route-selector-panel .station-checklist {
    height: 260px;
    max-height: min(260px, 45vh);
  }

  .route-settings-panel .drawer-heading h2::after {
    content: "";
  }

  .route-settings-panel .drawer-hint {
    display: none;
  }

  @media (max-width: 900px) {
    .timeline {
      height: calc(100vh - var(--header-height) - var(--toolbar-primary-height) - var(--route-summary-height));
      min-height: 300px;
    }

    .route-summary {
      display: flex !important;
      gap: 4px !important;
      min-height: 44px !important;
      padding: 0 8px !important;
      overflow-x: auto !important;
      overflow-y: visible !important;
      scrollbar-width: thin;
    }

    .route-summary-item {
      flex: 1 0 180px;
    }

    .route-summary-arrow {
      flex: 0 0 14px;
    }

    .route-summary-stop span {
      display: inline !important;
    }

    .route-selector-panel {
      position: fixed;
      top: calc(var(--header-height) + var(--toolbar-primary-height) + var(--route-summary-height));
      left: 8px !important;
      right: 8px !important;
      width: auto;
      max-height: calc(100vh - var(--header-height) - var(--toolbar-primary-height) - var(--route-summary-height) - 8px);
      transform: none !important;
    }
  }
`;
document.head.append(layoutEnhancementStyle);

function selectedStationNames(role) {
  return Array.from(
    document.querySelectorAll(`.station-picker[data-role="${role}"] input[type="checkbox"]:checked`),
    (input) => input.value,
  );
}

function compactStationNames(values) {
  if (!values.length) return "None";
  if (values.length <= 2) return values.join(" / ");
  return `${values[0]} / ${values[1]} +${values.length - 2}`;
}

function updateRouteSummary() {
  for (const value of document.querySelectorAll("[data-route-value]")) {
    value.textContent = compactStationNames(selectedStationNames(value.dataset.routeValue));
  }
}

function syncDirectionPressedState() {
  if (!directionTabs) return;
  for (const button of directionTabs.querySelectorAll("[data-tab]")) {
    button.setAttribute("aria-pressed", String(button.classList.contains("selected")));
  }
}

function closeRouteSelectors(exceptRole = null) {
  for (const item of document.querySelectorAll(".route-summary-item")) {
    if (item.dataset.routeItem === exceptRole) continue;
    const panel = item.querySelector(".route-selector-panel");
    const button = item.querySelector("[data-route-role]");
    if (panel) panel.hidden = true;
    if (button) button.setAttribute("aria-expanded", "false");
  }
}

function toggleRouteSelector(role) {
  const item = document.querySelector(`.route-summary-item[data-route-item="${role}"]`);
  if (!item) return;
  const panel = item.querySelector(".route-selector-panel");
  const button = item.querySelector("[data-route-role]");
  if (!panel || !button) return;

  const shouldOpen = panel.hidden;
  closeRouteSelectors(role);
  if (routeSettings) routeSettings.open = false;
  if (dataMenu) dataMenu.open = false;
  panel.hidden = !shouldOpen;
  button.setAttribute("aria-expanded", String(shouldOpen));

  if (shouldOpen) {
    requestAnimationFrame(() => panel.querySelector(".station-filter")?.focus({ preventScroll: true }));
  }
}

function installInlineRouteSelectors() {
  if (!routeSummary) return;

  for (const button of Array.from(routeSummary.querySelectorAll("[data-route-role]"))) {
    const role = button.dataset.routeRole;
    const picker = document.querySelector(`.station-picker[data-role="${role}"]`);
    if (!picker || button.closest(".route-summary-item")) continue;

    const item = document.createElement("div");
    item.className = "route-summary-item";
    item.dataset.routeItem = role;
    button.before(item);
    item.append(button);

    const panel = document.createElement("div");
    panel.className = "route-selector-panel";
    panel.hidden = true;
    panel.setAttribute("role", "group");
    panel.setAttribute("aria-label", picker.querySelector("legend")?.textContent || "Station selection");
    item.append(panel);
    panel.append(picker);

    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", () => toggleRouteSelector(role));
    picker.addEventListener("change", updateRouteSummary);
    new MutationObserver(updateRouteSummary).observe(picker, { childList: true, subtree: true });
  }

  const routeHeading = document.querySelector(".route-settings-panel .drawer-heading h2");
  const routeKicker = document.querySelector(".route-settings-panel .drawer-kicker");
  if (routeHeading) routeHeading.textContent = "Services & constraints";
  if (routeKicker) routeKicker.textContent = "Journey options";
}

function parseDurationMinutes(text) {
  const match = String(text || "").match(/(?:(\d+)h)?(\d+)(?:m)?/);
  if (!match) return Number.NaN;
  return Number(match[1] || 0) * 60 + Number(match[2]);
}

function colorTripDurations() {
  if (!timeline) return;
  const entries = Array.from(timeline.querySelectorAll(".timeline-label-duration"))
    .map((element) => ({ element, minutes: parseDurationMinutes(element.textContent) }))
    .filter((entry) => Number.isFinite(entry.minutes));
  if (!entries.length) return;

  const sortedDurations = entries.map((entry) => entry.minutes).sort((left, right) => left - right);
  const greenMax = sortedDurations[Math.max(0, Math.ceil(sortedDurations.length * 0.2) - 1)];
  const redMin = sortedDurations[Math.min(sortedDurations.length - 1, Math.floor(sortedDurations.length * 0.5))];

  for (const entry of entries) {
    const band = entry.minutes <= greenMax
      ? "good"
      : entry.minutes >= redMin
        ? "bad"
        : "middle";
    entry.element.dataset.durationBand = band;
    entry.element.style.color = band === "good"
      ? "#15803d"
      : band === "bad"
        ? "#b91c1c"
        : "#c2410c";
  }
}

function ensureStickyTimelineHeader() {
  if (!timeline) return;
  const legend = timeline.querySelector(":scope > .timeline-legend");
  const scale = timeline.querySelector(":scope > .timeline-scale");
  if (!legend || !scale) return;

  const stickyHead = document.createElement("div");
  stickyHead.className = "timeline-sticky-head";
  timeline.insertBefore(stickyHead, legend);
  stickyHead.append(legend, scale);
}

let timelineEnhancementFrame = null;
function scheduleTimelineEnhancements() {
  if (timelineEnhancementFrame !== null) return;
  timelineEnhancementFrame = requestAnimationFrame(() => {
    timelineEnhancementFrame = null;
    ensureStickyTimelineHeader();
    colorTripDurations();
  });
}

for (const menu of document.querySelectorAll(".toolbar-menu")) {
  menu.addEventListener("toggle", () => {
    if (!menu.open) return;
    closeRouteSelectors();
    for (const other of document.querySelectorAll(".toolbar-menu")) {
      if (other !== menu) other.open = false;
    }
  });
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".route-summary-item")) closeRouteSelectors();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeRouteSelectors();
});

directionTabs?.addEventListener("click", () => requestAnimationFrame(syncDirectionPressedState));

if (directionTabs) {
  new MutationObserver(syncDirectionPressedState).observe(directionTabs, {
    attributes: true,
    subtree: true,
    attributeFilter: ["class"],
  });
}

if (timeline) {
  new MutationObserver(scheduleTimelineEnhancements).observe(timeline, {
    childList: true,
    subtree: true,
  });
}

installInlineRouteSelectors();
updateRouteSummary();
syncDirectionPressedState();
scheduleTimelineEnhancements();
