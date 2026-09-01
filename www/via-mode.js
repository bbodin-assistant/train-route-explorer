import { app } from "./app.js?v=0.14";

const STORAGE_KEY = "train-route-explorer-via-mode-v1";
const timeline = document.querySelector("#routes-time-chart");
const switchElement = document.querySelector("#via-mode-switch");
const modeButtons = Array.from(switchElement?.querySelectorAll("[data-via-mode]") || []);

const viaModeStyle = document.createElement("style");
viaModeStyle.textContent = `
  .via-mode-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    width: 124px;
    margin: 0 0 6px;
    padding: 2px;
    border: 1px solid #c8cecb;
    border-radius: 5px;
    background: #ecefeb;
  }

  .via-mode-switch button {
    min-height: 24px;
    padding: 3px 8px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: #69737a;
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
  }

  .via-mode-switch button[aria-pressed="true"] {
    background: #fff;
    color: #26313a;
    box-shadow: 0 1px 2px rgba(24, 32, 42, 0.16);
  }

  .via-mode-switch button:focus-visible {
    outline: 2px solid #87949c;
    outline-offset: 1px;
  }
`;
document.head.append(viaModeStyle);

function storedMode() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "only" ? "only" : "one_of";
  } catch {
    return "one_of";
  }
}

let mode = storedMode();

function selectedViaStations() {
  return new Set((app.state.config.connection_stations || []).map(String));
}

function decodeLeg(bar) {
  if (!bar?.dataset.detail) return null;
  try {
    return JSON.parse(decodeURIComponent(bar.dataset.detail));
  } catch {
    return null;
  }
}

function rowAllowedInOnlyMode(row) {
  const selected = selectedViaStations();
  const legs = Array.from(row.querySelectorAll(".timeline-bar.train[data-detail]"))
    .map(decodeLeg)
    .filter(Boolean);

  if (legs.length <= 1) return true;
  for (let index = 0; index < legs.length - 1; index += 1) {
    const transferStation = String(legs[index]?.destination_stop || "");
    if (!selected.has(transferStation)) return false;
  }
  return true;
}

function syncButtons() {
  for (const button of modeButtons) {
    const active = button.dataset.viaMode === mode;
    button.setAttribute("aria-pressed", String(active));
  }
}

function applyModeToTimeline() {
  syncButtons();
  for (const row of timeline?.querySelectorAll(".timeline-row") || []) {
    row.hidden = mode === "only" && !rowAllowedInOnlyMode(row);
  }
}

function setMode(nextMode) {
  mode = nextMode === "only" ? "only" : "one_of";
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage may be unavailable; keep the mode for this session.
  }
  applyModeToTimeline();
}

for (const button of modeButtons) {
  button.addEventListener("click", () => setMode(button.dataset.viaMode));
}

document.addEventListener("change", (event) => {
  if (!event.target.closest?.('.station-picker[data-role="connection_stations"]')) return;
  requestAnimationFrame(applyModeToTimeline);
});

if (timeline) {
  new MutationObserver(applyModeToTimeline).observe(timeline, {
    childList: true,
    subtree: true,
  });
}

applyModeToTimeline();
