const trainTypeFilter = document.querySelector("#train-type-filter");
const minTransfer = document.querySelector("#config-min-transfer");
const maxTransfer = document.querySelector("#config-max-transfer");
const routeTimeline = document.querySelector("#routes-time-chart");
const appBrand = document.querySelector(".brand");

if (appBrand instanceof HTMLAnchorElement) {
  appBrand.removeAttribute("href");
  appBrand.removeAttribute("aria-label");
  appBrand.style.cursor = "default";
}

const settingsLayoutStyle = document.createElement("style");
settingsLayoutStyle.textContent = `
  .floating-drawer.route-settings-panel .drawer-heading {
    border-bottom: 0 !important;
    margin-bottom: 6px !important;
    padding-bottom: 8px !important;
  }

  .floating-drawer.route-settings-panel .time-config-panel {
    margin-top: 8px !important;
    padding-top: 0 !important;
    border-top: 0 !important;
  }

  .timeline-label-duration[data-duration-band="good"] {
    color: #15803d !important;
  }

  .timeline-label-duration[data-duration-band="middle"] {
    color: #9a6700 !important;
  }

  .timeline-label-duration[data-duration-band="bad"] {
    color: #b42318 !important;
  }

  .transfer-time-group {
    grid-column: 1 / -1;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .transfer-time-group > legend {
    margin: 0 0 6px;
    padding: 0;
    color: #525d66;
    font-size: 11px;
    font-weight: 800;
  }

  .transfer-time-range {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;
  }

  .transfer-time-range > label {
    display: grid;
    gap: 4px;
    min-width: 0;
    padding: 8px;
    border: 1px solid #d5dad7;
    border-radius: 5px;
    background: #fff;
  }

  .transfer-time-caption {
    color: #737d84;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.02em;
  }

  .transfer-time-range .input-with-unit {
    grid-template-columns: minmax(0, 1fr) 28px;
  }

  .transfer-time-range .input-unit {
    text-align: left;
  }

  @media (max-width: 420px) {
    .transfer-time-range {
      gap: 6px;
    }

    .transfer-time-range > label {
      padding: 7px;
    }
  }
`;
document.head.append(settingsLayoutStyle);

function compactTransferLabel(label, caption) {
  if (!label) return;
  const control = label.querySelector(".input-with-unit");
  if (!control) return;

  const unit = control.querySelector(".input-unit");
  if (unit) unit.textContent = "min";

  const captionElement = document.createElement("span");
  captionElement.className = "transfer-time-caption";
  captionElement.textContent = caption;

  label.replaceChildren(captionElement, control);
}

function groupTransferTimes() {
  const minLabel = minTransfer?.closest("label");
  const maxLabel = maxTransfer?.closest("label");
  if (!minLabel || !maxLabel || minLabel.closest(".transfer-time-group")) return;

  const group = document.createElement("fieldset");
  group.className = "transfer-time-group";

  const legend = document.createElement("legend");
  legend.textContent = "Transfer time";

  const range = document.createElement("div");
  range.className = "transfer-time-range";

  minLabel.before(group);
  group.append(legend, range);
  range.append(minLabel, maxLabel);

  compactTransferLabel(minLabel, "Min");
  compactTransferLabel(maxLabel, "Max");
}

function parseDurationMinutes(text) {
  const match = String(text || "").match(/(?:(\d+)h)?(\d+)(?:m)?/);
  if (!match) return Number.NaN;
  return Number(match[1] || 0) * 60 + Number(match[2]);
}

function applyRelativeDurationBands() {
  if (!routeTimeline) return;
  const entries = Array.from(routeTimeline.querySelectorAll(".timeline-label-duration"))
    .map((element) => ({ element, minutes: parseDurationMinutes(element.textContent) }))
    .filter((entry) => Number.isFinite(entry.minutes));
  if (!entries.length) return;

  const fastest = Math.min(...entries.map((entry) => entry.minutes));
  const greenMax = fastest * 1.10;
  const amberMax = fastest * 1.25;

  for (const entry of entries) {
    const band = entry.minutes <= greenMax ? "good" : entry.minutes <= amberMax ? "middle" : "bad";
    if (entry.element.dataset.durationBand !== band) entry.element.dataset.durationBand = band;
  }
}

let durationBandFrame = null;
function scheduleRelativeDurationBands() {
  if (durationBandFrame !== null) return;
  durationBandFrame = requestAnimationFrame(() => {
    durationBandFrame = null;
    applyRelativeDurationBands();
  });
}

if (routeTimeline) {
  new MutationObserver(scheduleRelativeDurationBands).observe(routeTimeline, {
    childList: true,
    subtree: true,
  });
  scheduleRelativeDurationBands();
}

// Train types are a short fixed list; filtering adds UI cost without enough value.
// Keep the existing element reference alive for older app code, but remove the
// search control from the visible Settings UI.
trainTypeFilter?.remove();
groupTransferTimes();

// Load graph-detail refinements after the settings layout so the graph module
// owns all transfer-edge geometry and station emphasis.
import("./journey-detail-style.js?v=0.19");
