const routeSettings = document.querySelector(".route-settings-menu");
const dataMenu = document.querySelector(".data-menu");
const routeConfig = document.querySelector("#route-config-controls");
const directionTabs = document.querySelector("#route-direction-tabs");
const timeline = document.querySelector("#routes-time-chart");

const timelineEnhancementStyle = document.createElement("style");
timelineEnhancementStyle.textContent = `
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

  @media (max-width: 900px) {
    .timeline {
      height: calc(100vh - var(--header-height) - var(--toolbar-primary-height) - var(--route-summary-height));
      min-height: 300px;
    }
  }
`;
document.head.append(timelineEnhancementStyle);

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

function openRouteSettings(role) {
  if (!routeSettings) return;
  if (dataMenu) dataMenu.open = false;
  routeSettings.open = true;

  requestAnimationFrame(() => {
    const target = document.querySelector(`.station-picker[data-role="${role}"]`);
    if (!target) return;
    target.scrollIntoView({ block: "start", behavior: "smooth" });
    target.classList.add("configuration-target");
    window.setTimeout(() => target.classList.remove("configuration-target"), 900);
  });
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

for (const button of document.querySelectorAll("[data-route-role]")) {
  button.addEventListener("click", () => openRouteSettings(button.dataset.routeRole));
}

for (const menu of document.querySelectorAll(".toolbar-menu")) {
  menu.addEventListener("toggle", () => {
    if (!menu.open) return;
    for (const other of document.querySelectorAll(".toolbar-menu")) {
      if (other !== menu) other.open = false;
    }
  });
}

routeConfig?.addEventListener("change", updateRouteSummary);
directionTabs?.addEventListener("click", () => requestAnimationFrame(syncDirectionPressedState));

if (routeConfig) {
  new MutationObserver(updateRouteSummary).observe(routeConfig, {
    childList: true,
    subtree: true,
  });
}

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

updateRouteSummary();
syncDirectionPressedState();
scheduleTimelineEnhancements();
